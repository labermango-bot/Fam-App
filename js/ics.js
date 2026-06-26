// ics.js — erzeugt iCalendar-Dateien (.ics).
// Damit lassen sich Termine direkt in den iOS-/Apple-Kalender (oder Google
// Kalender) übernehmen: Datei antippen -> "Zum Kalender hinzufügen".
// Vorbereitungs-Schritte werden als zusätzliche Alarme (VALARM) eingebettet.

function pad(n) {
  return String(n).padStart(2, "0");
}

// Lokale Zeit -> "YYYYMMDDTHHMMSS" (floating time, ohne Z = Gerätezeit).
function toICSDateTime(date, time) {
  const [y, m, d] = date.split("-").map(Number);
  if (!time) {
    // Ganztägig: nur Datum (VALUE=DATE).
    return { value: `${y}${pad(m)}${pad(d)}`, allDay: true };
  }
  const [hh, mm] = time.split(":").map(Number);
  return { value: `${y}${pad(m)}${pad(d)}T${pad(hh)}${pad(mm)}00`, allDay: false };
}

function escapeText(str = "") {
  return String(str)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function fold(line) {
  // RFC 5545: Zeilen auf 75 Oktette begrenzen.
  if (line.length <= 75) return line;
  const chunks = [];
  let i = 0;
  while (i < line.length) {
    chunks.push((i === 0 ? "" : " ") + line.slice(i, i + 73));
    i += 73;
  }
  return chunks.join("\r\n");
}

function addMinutes(date, time, deltaMin) {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = (time || "00:00").split(":").map(Number);
  const dt = new Date(y, m - 1, d, hh, mm);
  dt.setMinutes(dt.getMinutes() + deltaMin);
  return dt;
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

function eventToVEVENT(event, memberNames) {
  const start = toICSDateTime(event.date, event.time);
  const lines = ["BEGIN:VEVENT", `UID:${event.id}@famorga`];

  lines.push(`DTSTAMP:${formatStamp(new Date())}`);

  if (start.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${start.value}`);
  } else {
    lines.push(`DTSTART:${start.value}`);
    if (event.endTime) {
      const end = toICSDateTime(event.date, event.endTime);
      lines.push(`DTEND:${end.value}`);
    }
  }

  const people = memberNames.length ? ` (${memberNames.join(", ")})` : "";
  lines.push(`SUMMARY:${escapeText(event.title + people)}`);

  if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);

  // Notizen + offene Vorbereitungs-Schritte in die Beschreibung packen.
  const descParts = [];
  if (event.notes) descParts.push(event.notes);
  const openPrep = (event.prep || []).filter((p) => !p.done);
  if (openPrep.length) {
    descParts.push("Vorbereiten:");
    openPrep.forEach((p) => descParts.push("- " + p.text));
  }
  if ((event.bring || []).length) {
    descParts.push("Mitbringen:");
    event.bring.forEach((b) => descParts.push("- " + b.text));
  }
  if (event.budget) descParts.push("Budget: " + event.budget);
  if (descParts.length) lines.push(`DESCRIPTION:${escapeText(descParts.join("\n"))}`);

  // Haupt-Erinnerung. Bei ganztägigen Terminen einen Alarm um 9:00 am Tag
  // setzen (DTSTART ist Mitternacht -> +9 Std), sonst zur Vorlaufzeit.
  if (event.reminderLeadMinutes != null) {
    if (start.allDay) {
      lines.push(
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `DESCRIPTION:${escapeText("Erinnerung: " + event.title)}`,
        "TRIGGER:PT9H",
        "END:VALARM",
      );
    } else {
      lines.push(...vAlarm(event.reminderLeadMinutes, "Erinnerung: " + event.title));
    }
  }
  // Je Vorbereitungs-Schritt mit Vorlauftagen ein eigener Alarm.
  (event.prep || []).forEach((p) => {
    if (p.leadDays && !p.done) {
      lines.push(...vAlarm(p.leadDays * 24 * 60, "Vorbereiten: " + p.text));
    }
  });

  lines.push("END:VEVENT");
  return lines;
}

function formatStamp(d) {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

export function buildICS(events, memberLookup) {
  const out = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//FamOrga//Familienkalender//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Familienkalender",
  ];
  events.forEach((e) => {
    const names = (e.memberIds || [])
      .map((id) => memberLookup(id)?.name)
      .filter(Boolean);
    out.push(...eventToVEVENT(e, names));
  });
  out.push("END:VCALENDAR");
  return out.map(fold).join("\r\n");
}

export function downloadICS(filename, content) {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".ics") ? filename : filename + ".ics";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
