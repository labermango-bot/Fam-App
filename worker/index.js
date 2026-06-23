// worker/index.js — kleiner Cloudflare Worker als Gegenstück zur statischen PWA.
//
// Aufgaben:
//  1. POST /classify  — nimmt Foto/Screenshot (Base64) oder Text entgegen,
//     fragt Claude (Anthropic API) und gibt strukturierte Termin-/ToDo-
//     Vorschläge als JSON zurück. Hält den Anthropic-API-Key serverseitig,
//     damit er nicht im öffentlichen Frontend-Code stehen muss.
//  2. POST /sync      — Spiegelt Termine/Mitglieder in KV, damit ein
//     Kalender-Abo (Schritt 3) immer den aktuellen Stand zeigen kann.
//  3. GET  /feed.ics  — liefert die zuletzt gesyncten Termine als .ics-Feed,
//     den iOS als „Kalender-Abo" abonnieren kann (automatische Updates).
//
// Alle Endpunkte außer /feed.ics erwarten den Header "x-famorga-token" mit
// dem Wert des SYNC_TOKEN-Secrets. /feed.ics nimmt den Token als
// Query-Parameter, weil Apples Kalender-Abo keine eigenen Header senden kann.

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

function cors(resp) {
  resp.headers.set("Access-Control-Allow-Origin", "*");
  resp.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  resp.headers.set("Access-Control-Allow-Headers", "Content-Type, x-famorga-token");
  return resp;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function checkToken(req, env) {
  const header = req.headers.get("x-famorga-token");
  const url = new URL(req.url);
  const fromQuery = url.searchParams.get("token");
  const token = header || fromQuery;
  return Boolean(env.SYNC_TOKEN) && token === env.SYNC_TOKEN;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return cors(new Response(null, { status: 204 }));

    try {
      if (url.pathname === "/classify" && req.method === "POST") {
        return cors(await handleClassify(req, env));
      }
      if (url.pathname === "/sync" && req.method === "POST") {
        return cors(await handleSync(req, env));
      }
      if (url.pathname === "/feed.ics" && req.method === "GET") {
        return cors(await handleFeed(req, env));
      }
      return cors(json({ error: "Not found" }, 404));
    } catch (err) {
      return cors(json({ error: String(err && err.message ? err.message : err) }, 500));
    }
  },
};

// ---------------------------------------------------------------------------
// POST /classify
// ---------------------------------------------------------------------------
async function handleClassify(req, env) {
  if (!checkToken(req, env)) return json({ error: "Ungültiger Zugangscode." }, 401);
  if (!env.ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY ist auf dem Worker nicht gesetzt." }, 500);

  const body = await req.json();
  const { image, mediaType, text } = body || {};
  if (!image && !text) return json({ error: "Kein Bild und kein Text übergeben." }, 400);

  const today = new Date().toISOString().slice(0, 10);
  const system = `Du hilfst einer Familie, Termine und ToDos aus Fotos, Screenshots oder Text zu erkennen.
Heutiges Datum: ${today} (Format YYYY-MM-DD).
Antworte AUSSCHLIESSLICH mit einem JSON-Objekt, keine Erklärungen, kein Markdown, kein Codeblock.
Format:
{"items":[
  {
    "kind": "event" | "todo",
    "title": string,
    "date": "YYYY-MM-DD"            // nur bei kind=event, bestmöglich aus dem Text/Bild ableiten
    "time": "HH:MM" oder "",         // nur bei kind=event, "" = ganztägig
    "endTime": "HH:MM" oder "",
    "location": string,
    "notes": string,                 // kurze Zusammenfassung, was es ist / Quelle
    "reminderLeadMinutes": number,    // sinnvoller Wert, Default 60
    "due": "YYYY-MM-DD" oder "",      // nur bei kind=todo
    "priority": "low"|"normal"|"high",// nur bei kind=todo
    "prepTodos": [ { "title": string, "leadDays": number } ]  // nur bei kind=event: zusätzliche Vorbereitungs-Aufgaben, die aus dem Inhalt logisch folgen (z.B. Geburtstagseinladung -> "Geschenk besorgen", Schulausflug -> "Anmeldung unterschreiben"); leer lassen wenn nichts Sinnvolles
  }
]}
Wenn im Inhalt mehrere Termine/ToDos stehen, gib mehrere items zurück. Wenn nichts Sinnvolles erkennbar ist, gib {"items":[]} zurück.`;

  const userContent = [];
  if (image) {
    userContent.push({
      type: "image",
      source: { type: "base64", media_type: mediaType || "image/jpeg", data: image },
    });
  }
  userContent.push({
    type: "text",
    text: text
      ? `Text:\n${text}`
      : "Erkenne Termine/ToDos in diesem Bild (Einladung, Elternbrief, Screenshot o.ä.).",
  });

  const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
      max_tokens: 1500,
      system,
      messages: [{ role: "user", content: userContent }],
    }),
  });

  if (!aiRes.ok) {
    const errText = await aiRes.text();
    return json({ error: `Anthropic API Fehler: ${errText}` }, 502);
  }
  const aiJson = await aiRes.json();
  const raw = (aiJson.content || []).map((b) => b.text || "").join("").trim();
  const parsed = extractJSON(raw);
  if (!parsed || !Array.isArray(parsed.items)) {
    return json({ error: "KI-Antwort konnte nicht ausgewertet werden.", raw }, 502);
  }
  return json({ items: parsed.items });
}

function extractJSON(text) {
  try {
    return JSON.parse(text);
  } catch (_) {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (_) {
        return null;
      }
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// POST /sync — Spiegelt Termine + Mitglieder für den .ics-Feed.
// ---------------------------------------------------------------------------
async function handleSync(req, env) {
  if (!checkToken(req, env)) return json({ error: "Ungültiger Zugangscode." }, 401);
  if (!env.FAMORGA_KV) return json({ error: "KV-Namespace FAMORGA_KV ist nicht gebunden." }, 500);

  const body = await req.json();
  const events = Array.isArray(body.events) ? body.events : [];
  const members = Array.isArray(body.members) ? body.members : [];
  await env.FAMORGA_KV.put("data", JSON.stringify({ events, members, updatedAt: new Date().toISOString() }));
  return json({ ok: true, count: events.length });
}

// ---------------------------------------------------------------------------
// GET /feed.ics — liefert den aktuellen Stand als iCalendar-Datei.
// ---------------------------------------------------------------------------
async function handleFeed(req, env) {
  if (!checkToken(req, env)) return new Response("Ungültiger Zugangscode.", { status: 401 });
  if (!env.FAMORGA_KV) return new Response("KV-Namespace fehlt.", { status: 500 });

  const raw = await env.FAMORGA_KV.get("data");
  const data = raw ? JSON.parse(raw) : { events: [], members: [] };
  const memberLookup = (id) => data.members.find((m) => m.id === id);
  const ics = buildICS(data.events, memberLookup);
  return new Response(ics, {
    status: 200,
    headers: { "content-type": "text/calendar; charset=utf-8" },
  });
}

// ---------------------------------------------------------------------------
// ICS-Erzeugung (1:1 Logik aus js/ics.js, hier dupliziert, da Cloudflare
// Workers das Frontend-Bundle nicht mit importieren — Worker-Code ist
// bewusst eigenständig/abhängigkeitsfrei).
// ---------------------------------------------------------------------------
function pad(n) {
  return String(n).padStart(2, "0");
}
function toICSDateTime(date, time) {
  const [y, m, d] = date.split("-").map(Number);
  if (!time) return { value: `${y}${pad(m)}${pad(d)}`, allDay: true };
  const [hh, mm] = time.split(":").map(Number);
  return { value: `${y}${pad(m)}${pad(d)}T${pad(hh)}${pad(mm)}00`, allDay: false };
}
function escapeText(str = "") {
  return String(str).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}
function fold(line) {
  if (line.length <= 75) return line;
  const chunks = [];
  let i = 0;
  while (i < line.length) {
    chunks.push((i === 0 ? "" : " ") + line.slice(i, i + 73));
    i += 73;
  }
  return chunks.join("\r\n");
}
function vAlarm(triggerMinutesBefore, description) {
  return [
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeText(description)}`,
    `TRIGGER:-PT${Math.max(0, triggerMinutesBefore)}M`,
    "END:VALARM",
  ];
}
function formatStamp(d) {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}
function eventToVEVENT(event, memberNames) {
  const start = toICSDateTime(event.date, event.time);
  const lines = ["BEGIN:VEVENT", `UID:${event.id}@famorga`];
  lines.push(`DTSTAMP:${formatStamp(new Date())}`);
  if (start.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${start.value}`);
  } else {
    lines.push(`DTSTART:${start.value}`);
    if (event.endTime) lines.push(`DTEND:${toICSDateTime(event.date, event.endTime).value}`);
  }
  const people = memberNames.length ? ` (${memberNames.join(", ")})` : "";
  lines.push(`SUMMARY:${escapeText(event.title + people)}`);
  if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
  const descParts = [];
  if (event.notes) descParts.push(event.notes);
  const openPrep = (event.prep || []).filter((p) => !p.done);
  if (openPrep.length) {
    descParts.push("Vorbereiten:");
    openPrep.forEach((p) => descParts.push("- " + p.text));
  }
  if (descParts.length) lines.push(`DESCRIPTION:${escapeText(descParts.join("\n"))}`);
  if (event.reminderLeadMinutes != null && !start.allDay) {
    lines.push(...vAlarm(event.reminderLeadMinutes, "Erinnerung: " + event.title));
  }
  (event.prep || []).forEach((p) => {
    if (p.leadDays && !p.done) lines.push(...vAlarm(p.leadDays * 24 * 60, "Vorbereiten: " + p.text));
  });
  lines.push("END:VEVENT");
  return lines;
}
function buildICS(events, memberLookup) {
  const out = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//FamOrga//Familienkalender//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Familienkalender (Abo)",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  events.forEach((e) => {
    const names = (e.memberIds || []).map((id) => memberLookup(id)?.name).filter(Boolean);
    out.push(...eventToVEVENT(e, names));
  });
  out.push("END:VCALENDAR");
  return out.map(fold).join("\r\n");
}
