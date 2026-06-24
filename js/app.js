// app.js — Steuerung und Oberfläche der Familien-App.
import { store } from "./store.js";
import { buildICS, downloadICS } from "./ics.js";
import { classifyCapture, aiConfigured, fileToDataURL } from "./ai.js";
import { initSync, feedUrl } from "./sync.js";
import { holidayOn, upcomingHolidays } from "./ferien-bw.js";

// ---------------------------------------------------------------------------
// Kleine Helfer
// ---------------------------------------------------------------------------
const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, props = {}, ...children) => {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (v !== null && v !== undefined && v !== false) {
      node.setAttribute(k, v);
    }
  });
  children.flat().forEach((c) => {
    if (c == null || c === false) return;
    node.append(c.nodeType ? c : document.createTextNode(c));
  });
  return node;
};

const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const MONTHS = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
const SOURCE_LABELS = {
  whatsapp: "💬 WhatsApp",
  mail: "✉️ E-Mail",
  paper: "📄 Elternbrief",
  post: "📮 Post",
  other: "📌 Sonstiges",
  manual: "✍️ Manuell",
  ai: "✨ KI-Erkennung",
  prep: "🧩 Vorbereitung",
};

// Termin-Vorlagen: fertige Vorbereitungs-Checklisten mit Vorlaufzeit (in Tagen
// vor dem Termin). Beim Anwenden werden die Schritte an die Vorbereitungsliste
// angehängt; ist der Titel noch leer, wird der Vorlagenname vorgeschlagen.
const EVENT_TEMPLATES = [
  { emoji: "🎂", name: "Kindergeburtstag", prep: [
    { text: "Geschenk besorgen", leadDays: 7 },
    { text: "Karte schreiben", leadDays: 2 },
    { text: "Geschenk verpacken", leadDays: 1 },
  ]},
  { emoji: "🏖", name: "Urlaub", prep: [
    { text: "Reisepässe/Ausweise prüfen", leadDays: 7 },
    { text: "Medikamente besorgen", leadDays: 3 },
    { text: "Koffer packen", leadDays: 1 },
  ]},
  { emoji: "🩺", name: "Arzttermin", prep: [
    { text: "Versichertenkarte bereitlegen", leadDays: 1 },
    { text: "Vorbefunde/Unterlagen einpacken", leadDays: 1 },
  ]},
  { emoji: "🎒", name: "Klassenfahrt", prep: [
    { text: "Anmeldung unterschreiben", leadDays: 7 },
    { text: "Betrag einzahlen", leadDays: 5 },
    { text: "Koffer packen", leadDays: 1 },
  ]},
  { emoji: "🎉", name: "Schulfest", prep: [
    { text: "Kuchen backen", leadDays: 1 },
    { text: "Helfer-Schicht eintragen", leadDays: 3 },
  ]},
  { emoji: "👪", name: "Elternabend", prep: [
    { text: "Fragen notieren", leadDays: 1 },
  ]},
  { emoji: "⚽", name: "Sport/Verein", prep: [
    { text: "Sportzeug packen", leadDays: 1 },
  ]},
];

// ToDo-Vorlagen: füllen beim Anlegen Titel, Priorität und eine Notiz-Liste
// vor (alles danach frei editierbar).
const TODO_TEMPLATES = [
  { emoji: "🛒", name: "Einkaufen", title: "Einkaufen", priority: "normal",
    notes: "Milch\nBrot\nButter\nEier\nObst\nGemüse" },
  { emoji: "🧺", name: "Wocheneinkauf", title: "Wocheneinkauf", priority: "normal",
    notes: "Getränke\nNudeln/Reis\nGemüse & Obst\nMilchprodukte\nBrot\nSnacks für die Kinder\nPutz-/Hygienezeug" },
  { emoji: "💊", name: "Apotheke", title: "In die Apotheke", priority: "normal",
    notes: "Rezept einlösen\n" },
  { emoji: "🎁", name: "Geschenk besorgen", title: "Geschenk besorgen", priority: "normal", notes: "" },
];

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const parseISO = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const fmtDate = (iso) => {
  const d = parseISO(iso);
  return `${WEEKDAYS[d.getDay()]}., ${d.getDate()}. ${MONTHS[d.getMonth()]}`;
};
const daysFromToday = (iso) => {
  const a = parseISO(todayISO());
  const b = parseISO(iso);
  return Math.round((b - a) / 86400000);
};
const relativeDay = (iso) => {
  const diff = daysFromToday(iso);
  if (diff === 0) return "Heute";
  if (diff === 1) return "Morgen";
  if (diff === -1) return "Gestern";
  if (diff > 1 && diff < 7) return `in ${diff} Tagen`;
  return fmtDate(iso);
};

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------
const TABS = [
  { id: "today", label: "Heute", icon: "🏠" },
  { id: "inbox", label: "Posteingang", icon: "📥" },
  { id: "calendar", label: "Kalender", icon: "📅" },
  { id: "todos", label: "ToDos", icon: "✅" },
  { id: "family", label: "Familie", icon: "👨‍👩‍👧‍👦" },
];

function currentTab() {
  const hash = location.hash.replace("#", "");
  return TABS.some((t) => t.id === hash) ? hash : "today";
}

window.addEventListener("hashchange", render);
store.subscribe(render);

// Einfacher iOS-Kurzbefehl-Weg: Der Kurzbefehl kopiert den geteilten Text in
// die Zwischenablage und öffnet die App mit ?import=1. Die App zeigt dann im
// Posteingang einen Knopf, der den Text aus der Zwischenablage übernimmt
// (Lesen der Zwischenablage braucht eine Nutzer-Geste = Knopfdruck).
let pendingClipboardImport = new URLSearchParams(location.search).get("import") === "1";
if (pendingClipboardImport) {
  history.replaceState(null, "", location.pathname);
  if (currentTab() !== "inbox") location.hash = "#inbox";
}

// ---------------------------------------------------------------------------
// Render-Einstieg
// ---------------------------------------------------------------------------
function render() {
  const root = $("#app");
  root.innerHTML = "";
  const tab = currentTab();

  root.append(renderHeader(tab));

  const main = el("main", { class: "content" });
  if (tab === "today") renderToday(main);
  else if (tab === "inbox") renderInbox(main);
  else if (tab === "calendar") renderCalendar(main);
  else if (tab === "todos") renderTodos(main);
  else if (tab === "family") renderFamily(main);
  root.append(main);

  root.append(renderTabBar(tab));
}

function renderHeader(tab) {
  const titles = {
    today: "Heute & Demnächst",
    inbox: "Posteingang",
    calendar: "Familienkalender",
    todos: "Aufgaben",
    family: "Familie & Einstellungen",
  };
  const header = el("header", { class: "appbar" },
    el("h1", {}, titles[tab]),
  );
  if (tab === "calendar") {
    header.append(el("button", { class: "icon-btn", title: "In iOS-Kalender exportieren", onclick: exportAllICS }, "📤"));
  }
  return header;
}

function renderTabBar(active) {
  const bar = el("nav", { class: "tabbar" });
  TABS.forEach((t) => {
    bar.append(
      el("a", { href: "#" + t.id, class: "tab" + (t.id === active ? " active" : "") },
        el("span", { class: "tab-icon" }, t.icon),
        el("span", { class: "tab-label" }, t.label),
      )
    );
  });
  return bar;
}

// ---------------------------------------------------------------------------
// View: Cockpit (Startseite „Heute")
// ---------------------------------------------------------------------------
function greeting() {
  const h = new Date().getHours();
  if (h < 11) return "Guten Morgen";
  if (h < 18) return "Guten Tag";
  return "Guten Abend";
}

// Familien-Ampel: bewertet offene Vorbereitungen anhand der Vorlaufzeit.
//   rot   = Termin steht heute/morgen an und Vorbereitung fehlt, oder die
//           Vorbereitungs-Frist ist bereits überschritten.
//   gelb  = eine Vorbereitungs-Frist ist in den nächsten 48 h fällig.
//   grün  = nichts Offenes in Sicht.
// Liefert zugleich die Liste der betroffenen Punkte (rot zuerst).
function familyStatus(events) {
  let level = "green";
  const alerts = [];
  events.forEach((e) => {
    const dEvent = daysFromToday(e.date);
    if (dEvent < 0) return;
    (e.prep || []).forEach((p) => {
      if (p.done) return;
      const dDeadline = dEvent - (p.leadDays || 0); // Tage bis zur Vorbereitungs-Frist
      if (dEvent <= 1 || dDeadline < 0) {
        alerts.push({ event: e, prep: p, urgency: "red" });
        level = "red";
      } else if (dDeadline <= 2) {
        alerts.push({ event: e, prep: p, urgency: "yellow" });
        if (level !== "red") level = "yellow";
      }
    });
  });
  alerts.sort((a, b) => (a.urgency === b.urgency ? 0 : a.urgency === "red" ? -1 : 1));
  return { level, alerts };
}

// Lokale Wochen-Zusammenfassung (kein KI-Aufruf): Termine & Vorbereitungen
// der nächsten 7 Tage, plus den vollsten Tag.
function weekSummary(events) {
  const wk = events.filter((e) => {
    const d = daysFromToday(e.date);
    return d >= 0 && d <= 6;
  });
  const openPrep = wk.reduce((n, e) => n + (e.prep || []).filter((p) => !p.done).length, 0);
  const byDay = {};
  wk.forEach((e) => { byDay[e.date] = (byDay[e.date] || 0) + 1; });
  let busiest = null, max = 1;
  Object.entries(byDay).forEach(([d, n]) => { if (n > max) { max = n; busiest = d; } });
  const parts = [`${wk.length} Termin${wk.length === 1 ? "" : "e"} in den nächsten 7 Tagen`];
  if (openPrep) parts.push(`${openPrep} Vorbereitung${openPrep === 1 ? "" : "en"} offen`);
  if (busiest) parts.push(`${relativeDay(busiest)} besonders voll (${max} Termine)`);
  return parts;
}

// Kurzstatus pro Familienmitglied für das Cockpit.
function memberStatusLabel(m, events) {
  const openTodos = store.todos().filter((t) => t.memberId === m.id && !t.done).length;
  const todayEvents = events.filter((e) => e.date === todayISO() && (e.memberIds || []).includes(m.id)).length;
  const bits = [];
  if (openTodos) bits.push(`${openTodos} Aufgabe${openTodos === 1 ? "" : "n"}`);
  if (todayEvents) bits.push(`${todayEvents} Termin${todayEvents === 1 ? "" : "e"} heute`);
  return bits.length ? bits.join(" · ") : "alles erledigt ✓";
}

function renderToday(root) {
  const events = [...store.events()].sort(sortEvents);
  const upcoming = events.filter((e) => daysFromToday(e.date) >= 0).slice(0, 12);
  const inboxCount = store.inbox().filter((i) => !i.processed).length;
  const { level, alerts } = familyStatus(events);

  // Begrüßung + Datum
  const now = new Date();
  root.append(el("div", { class: "greet-card" },
    el("div", { class: "greet-hi" }, `${greeting()} 👋`),
    el("div", { class: "greet-date" }, `${WEEKDAYS[now.getDay()]}., ${now.getDate()}. ${MONTHS[now.getMonth()]}`),
  ));

  // Familien-Ampel
  const ampelText = {
    green: "Alles im Griff – keine offenen Vorbereitungen.",
    yellow: "Bald dran: etwas muss in den nächsten 48 Stunden erledigt werden.",
    red: "Achtung: ein Termin steht kurz bevor und es fehlt noch Vorbereitung.",
  };
  const ampelDot = { green: "🟢", yellow: "🟡", red: "🔴" };
  root.append(el("div", { class: "ampel ampel-" + level },
    el("span", { class: "ampel-dot" }, ampelDot[level]),
    el("span", {}, ampelText[level]),
  ));

  // Heute wichtig (fällige Vorbereitungen)
  if (alerts.length) {
    const sec = section("⚠️ Heute wichtig");
    alerts.slice(0, 8).forEach(({ event, prep, urgency }) => {
      sec.append(
        el("label", { class: "list-row prep-row" + (urgency === "red" ? " urgent" : "") },
          el("input", { type: "checkbox", onchange: () => store.togglePrep(event.id, prep.id) }),
          el("div", { class: "list-main" },
            el("div", { class: "list-title" }, prep.text),
            el("div", { class: "list-sub" }, `für „${event.title}" · ${relativeDay(event.date)}`),
          ),
        )
      );
    });
    root.append(sec);
  }

  // Wochen-Zusammenfassung (lokal)
  const sumSec = section("🤖 Diese Woche");
  const sumCard = el("div", { class: "card" });
  weekSummary(events).forEach((s) => sumCard.append(el("div", { class: "summary-line" }, "• " + s)));
  sumSec.append(sumCard);
  root.append(sumSec);

  // Nächste Termine
  const sec = section("📅 Nächste Termine");
  if (!upcoming.length) {
    sec.append(emptyState("Noch keine Termine.", "Termin hinzufügen", () => openEventDialog()));
  } else {
    let lastDate = null;
    upcoming.forEach((e) => {
      if (e.date !== lastDate) {
        sec.append(el("div", { class: "day-divider" }, relativeDay(e.date)));
        lastDate = e.date;
      }
      sec.append(eventRow(e));
    });
  }
  root.append(sec);

  // Familienstatus
  if (store.members().length) {
    const famSec = section("👨‍👩‍👧‍👦 Familienstatus");
    store.members().forEach((m) => {
      famSec.append(
        el("a", { class: "list-row", href: "#todos" },
          el("span", { class: "avatar", style: `background:${m.color}` }, m.name.slice(0, 1)),
          el("div", { class: "list-main" },
            el("div", { class: "list-title" }, m.name),
            el("div", { class: "list-sub" }, memberStatusLabel(m, events)),
          ),
        )
      );
    });
    root.append(famSec);
  }

  // Neue Eingänge
  const inSec = section("📥 Posteingang");
  inSec.append(
    el("a", { class: "list-row", href: "#inbox" },
      el("div", { class: "list-main" },
        el("div", { class: "list-title" }, inboxCount ? `${inboxCount} neue Eingänge` : "Posteingang leer"),
        el("div", { class: "list-sub" }, inboxCount ? "Tippen zum Sortieren" : "🎉 nichts zu tun"),
      ),
    )
  );
  root.append(inSec);

  root.append(fab(() => openEventDialog()));
}

// ---------------------------------------------------------------------------
// View: Posteingang (Schnell-Erfassung)
// ---------------------------------------------------------------------------
function renderInbox(root) {
  const intro = el("p", { class: "hint" },
    "Alles reinwerfen, was an dich herangetragen wird – aus WhatsApp, Mail, " +
    "Elternbriefen oder Post. Per KI automatisch erkennen lassen oder in Ruhe selbst umwandeln.");
  root.append(intro);

  // Über den iOS-Kurzbefehl geöffnet (?import=1): geteilten Text aus der
  // Zwischenablage übernehmen. Der Knopfdruck liefert die nötige Nutzer-Geste,
  // damit Safari die Zwischenablage lesen darf.
  if (pendingClipboardImport) {
    const importCard = el("div", { class: "card" },
      el("p", { class: "hint" }, "📤 Aus dem Teilen-Menü erhalten. Tippe, um den geteilten Text zu übernehmen:"),
      el("button", { class: "btn primary block", onclick: async () => {
        try {
          const clip = await navigator.clipboard.readText();
          pendingClipboardImport = false;
          const t = (clip || "").trim();
          if (!t) { alert("Die Zwischenablage ist leer."); render(); return; }
          if (aiConfigured()) runCapture({ text: t, source: "whatsapp" });
          else { store.addInbox(t, "whatsapp"); render(); }
        } catch (err) {
          alert("Zwischenablage konnte nicht gelesen werden. Bitte den Text unten manuell einfügen.");
        }
      }}, "📋 Geteilten Text übernehmen & analysieren"),
    );
    root.append(importCard);
  }

  const text = el("textarea", { class: "input", rows: "3", placeholder: "z. B. „Mittwoch Sportzeug für Lea“ oder Text aus WhatsApp einfügen…" });
  const addBtn = el("button", { class: "btn", onclick: () => {
    const t = text.value.trim();
    if (!t) return;
    store.addInbox(t, "other");
    text.value = "";
  }}, "In Posteingang");

  // Datei-Feld in ein <label> einwickeln statt fileInput.click() aufzurufen:
  // Das programmatische .click() auf ein verstecktes Feld ist auf iOS
  // unzuverlässig; das native Label öffnet die Auswahl Fotomediathek /
  // Foto aufnehmen / Datei zuverlässig. Ohne "capture" gibt es die volle
  // Auswahl (mit capture="environment" ginge nur die Live-Kamera).
  const fileInput = el("input", {
    type: "file", accept: "image/*", style: "display:none",
    onchange: (ev) => {
      const file = ev.target.files[0];
      ev.target.value = "";
      if (file) runCapture({ file, source: "other" });
    },
  });
  const photoBtn = el("label", { class: "btn primary" }, "✨📷 Foto/Screenshot → KI", fileInput);
  const aiBtn = el("button", { class: "btn primary", type: "button", onclick: () => {
    const t = text.value.trim();
    if (!t) return;
    runCapture({ text: t, source: "other" });
    text.value = "";
  }}, "✨ KI: Text erkennen");

  const captureCard = el("div", { class: "card capture" }, text,
    el("div", { class: "row gap wrap" }, photoBtn, aiBtn, addBtn));
  // Screenshots/Bilder lassen sich auch direkt ins Textfeld einfügen (Strg/Cmd+V).
  text.addEventListener("paste", (ev) => {
    const item = [...(ev.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
    if (!item) return;
    ev.preventDefault();
    const file = item.getAsFile();
    if (file) runCapture({ file, source: "other" });
  });
  if (!aiConfigured()) {
    captureCard.append(el("p", { class: "hint small" },
      "💡 KI-Erkennung & Foto-Auswertung erst nach Einrichtung unter „Familie → KI & Kalender-Abo“ verfügbar."));
  }
  root.append(captureCard);

  const items = store.inbox();
  const sec = section("Zu sortieren");
  if (!items.length) {
    sec.append(emptyState("Posteingang leer. 🎉", null));
  } else {
    items.forEach((item) => {
      sec.append(
        el("div", { class: "card inbox-item" },
          el("div", { class: "row between" },
            el("span", { class: "tag" }, SOURCE_LABELS[item.source] || item.source),
            el("span", { class: "muted small" }, relativeDay(item.createdAt.slice(0, 10))),
          ),
          el("div", { class: "inbox-text" }, item.text),
          el("div", { class: "row gap wrap" },
            el("button", { class: "btn small primary", onclick: () => convertInbox(item, "event") }, "→ Termin"),
            el("button", { class: "btn small", onclick: () => convertInbox(item, "todo") }, "→ ToDo"),
            el("button", { class: "btn small ghost", onclick: () => store.removeInbox(item.id) }, "Verwerfen"),
          ),
        )
      );
    });
  }
  root.append(sec);
}

// ---------------------------------------------------------------------------
// KI-Erkennung: Foto/Screenshot/Text -> Termin- oder ToDo-Vorschlag
// ---------------------------------------------------------------------------
async function runCapture({ file, text, source }) {
  if (!aiConfigured()) {
    alert("Bitte zuerst unter „Familie → KI & Kalender-Abo“ Worker-URL und Zugangscode eintragen.");
    return;
  }
  const closeLoading = openLoadingModal("KI erkennt Termine/ToDos …");
  try {
    const payload = file ? { image: await fileToDataURL(file) } : { text };
    const items = await classifyCapture(payload);
    closeLoading();
    openAIReviewDialog(items, source);
  } catch (err) {
    closeLoading();
    alert(err.message || "KI-Erkennung fehlgeschlagen.");
  }
}

function openLoadingModal(message) {
  openModal("Einen Moment …", el("div", { class: "ai-loading" }, el("div", { class: "spinner" }), el("p", {}, message)));
  return closeModal;
}

function openAIReviewDialog(items, source) {
  if (!items || !items.length) {
    alert("Die KI konnte hier keinen Termin oder ToDo erkennen. Bitte manuell anlegen.");
    return;
  }
  const body = el("div", { class: "ai-review" },
    el("p", { class: "hint" }, "KI-Vorschläge prüfen, bei Bedarf korrigieren, dann übernehmen."));
  let remaining = items.length;
  items.forEach((item) => {
    const card = renderAIItemCard(item, source, () => {
      remaining--;
      card.remove();
      if (remaining <= 0) closeModal();
    });
    body.append(card);
  });
  openModal("KI-Vorschläge", body);
}

function renderAIItemCard(item, source, onResolved) {
  const isEvent = item.kind !== "todo";
  const title = el("input", { class: "input", value: item.title || "" });
  const notes = el("textarea", { class: "input", rows: "2" }, item.notes || "");

  let card;
  if (isEvent) {
    const date = el("input", { class: "input", type: "date", value: item.date || todayISO() });
    const time = el("input", { class: "input", type: "time", value: item.time || "" });
    const endTime = el("input", { class: "input", type: "time", value: item.endTime || "" });
    const location = el("input", { class: "input", value: item.location || "" });
    const reminder = el("select", { class: "input" },
      ...[[0,"zur Startzeit"],[15,"15 Min vorher"],[30,"30 Min vorher"],[60,"1 Std vorher"],[120,"2 Std vorher"],[1440,"1 Tag vorher"]]
        .map(([v,l]) => el("option", { value: v, selected: (item.reminderLeadMinutes ?? 60) === v }, l)));

    const memberWrap = el("div", { class: "chip-row" });
    const selected = new Set();
    store.members().forEach((m) => {
      const chip = el("button", { type: "button", class: "chip", style: `border-color:${m.color}` }, m.name);
      chip.onclick = () => {
        if (selected.has(m.id)) { selected.delete(m.id); chip.classList.remove("active"); chip.style.cssText = `border-color:${m.color}`; }
        else { selected.add(m.id); chip.classList.add("active"); chip.style.cssText = `background:${m.color};border-color:${m.color};color:#fff`; }
      };
      memberWrap.append(chip);
    });

    const prepItems = (item.prepTodos || []).map((p) => ({ id: store.uid(), text: p.title || "", done: false, leadDays: p.leadDays || 0 }));
    const prepList = el("div", { class: "prep-edit" });
    function renderPrep() {
      prepList.innerHTML = "";
      prepItems.forEach((p, idx) => {
        prepList.append(el("div", { class: "row gap center" },
          el("input", { class: "input flex", value: p.text, oninput: (ev) => p.text = ev.target.value }),
          el("select", { class: "input narrow", onchange: (ev) => p.leadDays = Number(ev.target.value) },
            ...[[0,"am Tag"],[1,"1 Tag vor"],[2,"2 Tage vor"],[3,"3 Tage vor"],[7,"1 Woche vor"]]
              .map(([v,l]) => el("option", { value: v, selected: (p.leadDays||0) === v }, l))),
          el("button", { class: "icon-btn ghost", type: "button", onclick: () => { prepItems.splice(idx,1); renderPrep(); } }, "✕"),
        ));
      });
    }
    renderPrep();
    const addPrepBtn = el("button", { class: "btn small", type: "button", onclick: () => { prepItems.push({ id: store.uid(), text: "", done: false, leadDays: 0 }); renderPrep(); } }, "+ Vorbereitungs-Schritt");

    card = el("div", { class: "card ai-item" },
      el("span", { class: "tag" }, "📅 Termin-Vorschlag"),
      field("Titel", title),
      el("div", { class: "row gap" }, field("Datum", date), field("Uhrzeit", time)),
      el("div", { class: "row gap" }, field("Ende (optional)", endTime), field("Erinnerung", reminder)),
      field("Ort", location),
      field("Für wen?", memberWrap),
      field("Vorbereiten", el("div", {}, prepList, addPrepBtn)),
      field("Notizen", notes),
      el("div", { class: "row gap" },
        el("button", { class: "btn primary small", onclick: () => {
          if (!title.value.trim()) { title.focus(); return; }
          store.addEvent({
            title: title.value.trim(), date: date.value, time: time.value, endTime: endTime.value,
            location: location.value.trim(), notes: notes.value.trim(),
            memberIds: [...selected], prep: prepItems.filter((p) => p.text.trim()),
            reminderLeadMinutes: Number(reminder.value), source: source || "ai",
          });
          onResolved();
        }}, "✓ Termin anlegen"),
        el("button", { class: "btn small ghost", onclick: onResolved }, "Verwerfen"),
      ),
    );
  } else {
    const due = el("input", { class: "input", type: "date", value: item.due || "" });
    const memberSel = el("select", { class: "input" },
      el("option", { value: "" }, "— niemand zugeordnet —"),
      ...store.members().map((m) => el("option", { value: m.id }, m.name)));
    const prio = el("select", { class: "input" },
      ...[["low","Niedrig"],["normal","Normal"],["high","Hoch 🔴"]].map(([v,l]) => el("option", { value: v, selected: (item.priority || "normal") === v }, l)));

    card = el("div", { class: "card ai-item" },
      el("span", { class: "tag" }, "✅ ToDo-Vorschlag"),
      field("Aufgabe", title),
      el("div", { class: "row gap" }, field("Für wen?", memberSel), field("Priorität", prio)),
      field("Fällig am", due),
      field("Notizen", notes),
      el("div", { class: "row gap" },
        el("button", { class: "btn primary small", onclick: () => {
          if (!title.value.trim()) { title.focus(); return; }
          store.addTodo({
            title: title.value.trim(), memberId: memberSel.value || null, due: due.value,
            priority: prio.value, notes: notes.value.trim(), source: source || "ai",
          });
          onResolved();
        }}, "✓ ToDo anlegen"),
        el("button", { class: "btn small ghost", onclick: onResolved }, "Verwerfen"),
      ),
    );
  }
  return card;
}

function convertInbox(item, type) {
  if (type === "event") {
    openEventDialog({ title: item.text.slice(0, 60), notes: item.text, source: item.source }, () => store.removeInbox(item.id));
  } else {
    openTodoDialog({ title: item.text.slice(0, 80), notes: item.text, source: item.source }, () => store.removeInbox(item.id));
  }
}

// ---------------------------------------------------------------------------
// View: Kalender
// ---------------------------------------------------------------------------
let calCursor = todayISO();
let calView = "month"; // "month" | "week"

const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function startOfWeek(iso) {
  const d = parseISO(iso);
  const off = (d.getDay() + 6) % 7; // Montag = 0
  d.setDate(d.getDate() - off);
  return isoOf(d);
}
function shiftWeek(delta) {
  const d = parseISO(calCursor);
  d.setDate(d.getDate() + delta * 7);
  calCursor = isoOf(d);
  render();
}

function viewToggle() {
  const mk = (id, label) => el("button", {
    class: "seg" + (calView === id ? " active" : ""),
    onclick: () => { calView = id; render(); },
  }, label);
  return el("div", { class: "seg-row" }, mk("month", "Monat"), mk("week", "Woche"));
}

// Navigationszeile mit ‹ Titel › und einem „Heute"-Rücksprung.
function calNav(label, onPrev, onNext) {
  return el("div", { class: "cal-nav" },
    el("button", { class: "icon-btn", onclick: onPrev }, "‹"),
    el("div", { class: "cal-month" }, label),
    el("button", { class: "icon-btn", onclick: onNext }, "›"),
    el("button", { class: "btn small cal-today", onclick: () => { calCursor = todayISO(); render(); } }, "Heute"),
  );
}

// Horizontales Wischen erkennen (ohne vertikales Scrollen zu stören).
function attachSwipe(node, onSwipeLeft, onSwipeRight) {
  let x0 = null, y0 = null;
  node.addEventListener("touchstart", (e) => {
    const t = e.changedTouches[0]; x0 = t.clientX; y0 = t.clientY;
  }, { passive: true });
  node.addEventListener("touchend", (e) => {
    if (x0 == null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - x0, dy = t.clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      (dx < 0 ? onSwipeLeft : onSwipeRight)();
    }
  }, { passive: true });
}

function renderCalendar(root) {
  root.append(viewToggle());
  if (calView === "week") return renderWeek(root);

  attachSwipe(root, () => shiftMonth(1), () => shiftMonth(-1));

  const cursor = parseISO(calCursor);
  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  root.append(calNav(`${MONTHS[month]} ${year}`, () => shiftMonth(-1), () => shiftMonth(1)));

  // Personen-Filter (Chips)
  root.append(renderMemberFilter());

  const grid = el("div", { class: "cal-grid" });
  WEEKDAYS.slice(1).concat(WEEKDAYS[0]).forEach((w) =>
    grid.append(el("div", { class: "cal-dow" }, w)));

  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7; // Montag zuerst
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const eventsByDay = groupEventsByDate();

  for (let i = 0; i < startOffset; i++) grid.append(el("div", { class: "cal-cell empty" }));
  for (let day = 1; day <= daysInMonth; day++) {
    const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dayEvents = (eventsByDay[iso] || []).filter(passesFilter);
    const isToday = iso === todayISO();
    const holiday = holidayOn(iso);
    const cell = el("div", {
      class: "cal-cell" + (isToday ? " today" : "") + (holiday ? " holiday" : ""),
      title: holiday ? holiday.name : null,
      onclick: () => openDayDialog(iso),
    },
      el("span", { class: "cal-day-num" }, String(day)),
      el("div", { class: "cal-dots" },
        ...dayEvents.slice(0, 4).map((e) => {
          const m = store.member((e.memberIds || [])[0]);
          return el("span", { class: "dot", style: `background:${m ? m.color : "#8e8e93"}` });
        }),
      ),
    );
    grid.append(cell);
  }
  root.append(grid);

  // Schulferien Baden-Württemberg (kommende + laufende)
  const holidays = upcomingHolidays(todayISO(), 4);
  if (holidays.length) {
    const fSec = section("🏖 Schulferien (BW)");
    holidays.forEach((h) => {
      const running = todayISO() >= h.start && todayISO() <= h.end;
      fSec.append(
        el("div", { class: "list-row" },
          el("div", { class: "list-main" },
            el("div", { class: "list-title" }, h.name + (running ? "  · läuft" : "")),
            el("div", { class: "list-sub muted" }, `${fmtDate(h.start)} – ${fmtDate(h.end)}`),
          ),
        )
      );
    });
    root.append(fSec);
  }

  // Liste der Termine im Monat
  const monthEvents = store.events()
    .filter((e) => e.date.startsWith(`${year}-${String(month + 1).padStart(2, "0")}`))
    .filter(passesFilter)
    .sort(sortEvents);
  const sec = section("Termine im Monat");
  if (!monthEvents.length) sec.append(emptyState("Keine Termine in diesem Monat.", null));
  else monthEvents.forEach((e) => sec.append(eventRow(e)));
  root.append(sec);

  root.append(fab(() => openEventDialog()));
}

// Wochenansicht: Mo–So, pro Tag die Termine (gefiltert), mit Ferien-Hinweis.
function renderWeek(root) {
  const monday = startOfWeek(calCursor);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = parseISO(monday);
    d.setDate(d.getDate() + i);
    days.push(isoOf(d));
  }
  const sunday = days[6];

  attachSwipe(root, () => shiftWeek(1), () => shiftWeek(-1));

  const label = `${parseISO(monday).getDate()}. ${MONTHS[parseISO(monday).getMonth()]} – ${parseISO(sunday).getDate()}. ${MONTHS[parseISO(sunday).getMonth()]}`;
  root.append(calNav(label, () => shiftWeek(-1), () => shiftWeek(1)));
  root.append(renderMemberFilter());

  const eventsByDay = groupEventsByDate();
  days.forEach((iso) => {
    const dayEvents = (eventsByDay[iso] || []).filter(passesFilter).sort(sortEvents);
    const holiday = holidayOn(iso);
    const isToday = iso === todayISO();
    const head = el("div", { class: "week-day-head" + (isToday ? " today" : "") },
      el("span", {}, relativeDay(iso)),
      holiday ? el("span", { class: "badge-event" }, "🏖 " + holiday.name) : null,
    );
    const sec = el("section", { class: "section week-day" }, head);
    if (!dayEvents.length) {
      sec.append(el("div", { class: "muted small week-empty" }, "—"));
    } else {
      dayEvents.forEach((e) => sec.append(eventRow(e)));
    }
    root.append(sec);
  });

  root.append(fab(() => openEventDialog({ date: todayISO() >= monday && todayISO() <= sunday ? todayISO() : monday })));
}

let activeFilter = null; // memberId oder null = alle
function renderMemberFilter() {
  const wrap = el("div", { class: "chip-row" });
  wrap.append(el("button", {
    class: "chip" + (activeFilter === null ? " active" : ""),
    onclick: () => { activeFilter = null; render(); },
  }, "Alle"));
  store.members().forEach((m) => {
    wrap.append(el("button", {
      class: "chip" + (activeFilter === m.id ? " active" : ""),
      style: activeFilter === m.id ? `background:${m.color};border-color:${m.color};color:#fff` : `border-color:${m.color}`,
      onclick: () => { activeFilter = m.id; render(); },
    }, m.name));
  });
  return wrap;
}
function passesFilter(e) {
  return activeFilter === null || (e.memberIds || []).includes(activeFilter);
}
function shiftMonth(delta) {
  const d = parseISO(calCursor);
  d.setMonth(d.getMonth() + delta);
  calCursor = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  render();
}
function groupEventsByDate() {
  const map = {};
  store.events().forEach((e) => {
    (map[e.date] = map[e.date] || []).push(e);
  });
  return map;
}
function openDayDialog(iso) {
  const dayEvents = (groupEventsByDate()[iso] || []).filter(passesFilter).sort(sortEvents);
  const body = el("div", {});
  if (!dayEvents.length) body.append(el("p", { class: "muted" }, "Keine Termine an diesem Tag."));
  else dayEvents.forEach((e) => body.append(eventRow(e)));
  body.append(el("button", { class: "btn primary block", onclick: () => { closeModal(); openEventDialog({ date: iso }); } }, "+ Termin an diesem Tag"));
  openModal(fmtDate(iso), body);
}

// ---------------------------------------------------------------------------
// View: ToDos
// ---------------------------------------------------------------------------
function renderTodos(root) {
  const todos = [...store.todos()].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const pa = { high: 0, normal: 1, low: 2 }[a.priority];
    const pb = { high: 0, normal: 1, low: 2 }[b.priority];
    if (pa !== pb) return pa - pb;
    return (a.due || "9999").localeCompare(b.due || "9999");
  });

  const open = todos.filter((t) => !t.done);
  const done = todos.filter((t) => t.done);

  const secOpen = section(`Offen (${open.length})`);
  if (!open.length) secOpen.append(emptyState("Keine offenen Aufgaben. 🎉", "ToDo hinzufügen", () => openTodoDialog()));
  open.forEach((t) => secOpen.append(todoRow(t)));
  root.append(secOpen);

  if (done.length) {
    const secDone = section(`Erledigt (${done.length})`);
    done.forEach((t) => secDone.append(todoRow(t)));
    root.append(secDone);
  }

  root.append(fab(() => openTodoDialog()));
}

function todoRow(t) {
  const m = store.member(t.memberId);
  const overdue = t.due && !t.done && daysFromToday(t.due) < 0;
  // Aus einem Termin-Vorbereitungsschritt entstanden? Dann kennzeichnen und
  // den Absprung zum Termin anbieten.
  const linkedEvent = t.eventId ? store.event(t.eventId) : null;
  return el("div", { class: "list-row todo" + (t.done ? " done" : "") },
    el("input", { type: "checkbox", checked: t.done, onchange: () => store.toggleTodo(t.id) }),
    el("div", { class: "list-main", onclick: () => openTodoDialog(t) },
      el("div", { class: "list-title" },
        t.priority === "high" ? el("span", { class: "prio-flag" }, "🔴 ") : null,
        t.title),
      el("div", { class: "list-sub" },
        m ? el("span", { class: "person-pill", style: `background:${m.color}` }, m.name) : null,
        t.due ? el("span", { class: overdue ? "danger" : "muted" }, (m ? " · " : "") + "fällig " + relativeDay(t.due)) : null,
        linkedEvent
          ? el("span", { class: "badge-event" }, `📅 ${linkedEvent.title}`)
          : (t.source && t.source !== "manual" ? el("span", { class: "muted" }, " · " + (SOURCE_LABELS[t.source] || "")) : null),
      ),
    ),
    linkedEvent
      ? el("button", { class: "icon-btn ghost", title: "Zum Termin springen", onclick: (ev) => { ev.stopPropagation(); openEventDialog(linkedEvent); } }, "📅")
      : null,
    el("button", { class: "icon-btn ghost", onclick: () => store.removeTodo(t.id) }, "🗑"),
  );
}

// ---------------------------------------------------------------------------
// View: Familie & Einstellungen
// ---------------------------------------------------------------------------
function renderFamily(root) {
  const sec = section("Familienmitglieder");
  store.members().forEach((m) => {
    sec.append(
      el("div", { class: "list-row" },
        el("span", { class: "avatar", style: `background:${m.color}` }, m.name.slice(0, 1)),
        el("div", { class: "list-main" },
          el("div", { class: "list-title" }, m.name),
          el("div", { class: "list-sub muted" }, m.role === "parent" ? "Elternteil" : "Kind"),
        ),
        el("button", { class: "icon-btn ghost", onclick: () => openMemberDialog(m) }, "✏️"),
        el("button", { class: "icon-btn ghost", onclick: () => {
          if (confirm(`${m.name} entfernen?`)) store.removeMember(m.id);
        }}, "🗑"),
      )
    );
  });
  sec.append(el("button", { class: "btn block", onclick: () => openMemberDialog() }, "+ Person hinzufügen"));
  root.append(sec);

  const tools = section("Daten");
  tools.append(
    el("button", { class: "btn block", onclick: exportAllICS }, "📅 Alle Termine als iOS-Kalender (.ics)"),
    el("button", { class: "btn block", onclick: exportBackup }, "💾 Datensicherung exportieren (.json)"),
    el("label", { class: "btn block" }, "📂 Sicherung importieren",
      el("input", { type: "file", accept: ".json", style: "display:none", onchange: importBackup }),
    ),
  );
  if (store.hasRecovery()) {
    tools.append(el("button", { class: "btn block danger", onclick: restoreRecovery }, "↩️ Letzten Stand wiederherstellen (vor Import)"));
  }
  root.append(tools);

  root.append(renderAISettings());

  const about = el("div", { class: "card muted small" },
    el("p", {}, "FamOrga speichert alle Daten nur lokal auf diesem Gerät – keine Cloud, keine Anmeldung."),
    el("p", {}, "Tipp: Über das Teilen-Symbol in Safari „Zum Home-Bildschirm“ wählen, dann startet die App wie eine normale iPhone-App."),
  );
  root.append(about);
}

function renderAISettings() {
  const meta = store.get().meta || {};
  const sec = section("KI & Kalender-Abo");
  sec.append(el("p", { class: "hint" },
    "Optional: eigener Worker für Foto/Text-Erkennung per KI und einen " +
    "automatisch aktualisierten Kalender-Abo-Link für iOS. Einrichtung siehe worker/README.md im Projekt."));

  const urlInput = el("input", { class: "input", placeholder: "https://famorga-api.dein-name.workers.dev", value: meta.workerUrl || "" });
  const tokenInput = el("input", { class: "input", placeholder: "Zugangscode (von dir frei gewählt)", value: meta.syncToken || "" });
  const saveBtn = el("button", { class: "btn", onclick: () => {
    store.setMeta({ workerUrl: urlInput.value.trim(), syncToken: tokenInput.value.trim() });
    renderFeedLink();
  }}, "Speichern");

  sec.append(el("div", { class: "card" }, field("Worker-URL", urlInput), field("Zugangscode", tokenInput), saveBtn));

  const feedBox = el("div", {});
  function renderFeedLink() {
    feedBox.innerHTML = "";
    const url = feedUrl();
    if (!url) {
      feedBox.append(el("p", { class: "muted small" }, "Noch keine Worker-URL/Zugangscode hinterlegt — kein Abo-Link verfügbar."));
      return;
    }
    feedBox.append(
      el("div", { class: "card" },
        el("p", { class: "field-label" }, "Kalender-Abo-Link (für dich und deine Frau, je einmal in iOS hinzufügen):"),
        el("p", { class: "ai-feed-url" }, url),
        el("button", { class: "btn small", onclick: () => {
          navigator.clipboard?.writeText(url).then(() => alert("Link kopiert. In iOS: Einstellungen → Kalender → Accounts → Account hinzufügen → Andere → Kalenderabo hinzufügen."));
        }}, "📋 Link kopieren"),
      )
    );
  }
  renderFeedLink();
  sec.append(feedBox);
  return sec;
}

// ---------------------------------------------------------------------------
// Gemeinsame UI-Bausteine
// ---------------------------------------------------------------------------
function section(title) {
  return el("section", { class: "section" }, title ? el("h2", { class: "section-title" }, title) : null);
}
function emptyState(text, ctaLabel, onClick) {
  const wrap = el("div", { class: "empty" }, el("p", {}, text));
  if (ctaLabel) wrap.append(el("button", { class: "btn primary", onclick: onClick }, ctaLabel));
  return wrap;
}
function fab(onClick) {
  return el("button", { class: "fab", onclick: onClick, title: "Hinzufügen" }, "+");
}
function sortEvents(a, b) {
  if (a.date !== b.date) return a.date.localeCompare(b.date);
  return (a.time || "99:99").localeCompare(b.time || "99:99");
}

function eventRow(e) {
  const members = (e.memberIds || []).map((id) => store.member(id)).filter(Boolean);
  const openPrep = (e.prep || []).filter((p) => !p.done).length;
  const bringCount = (e.bring || []).length;
  return el("div", { class: "list-row event", onclick: () => openEventDialog(e) },
    el("div", { class: "time-col" },
      e.time ? el("span", { class: "time" }, e.time) : el("span", { class: "time muted" }, "ganzt."),
    ),
    el("div", { class: "list-main" },
      el("div", { class: "list-title" }, e.title),
      el("div", { class: "list-sub" },
        e.location ? el("span", { class: "muted" }, "📍 " + e.location + "  ") : null,
        ...members.map((m) => el("span", { class: "person-pill", style: `background:${m.color}` }, m.name)),
        openPrep ? el("span", { class: "badge-prep" }, `📋 ${openPrep}`) : null,
        bringCount ? el("span", { class: "badge-bring" }, `🎒 ${bringCount}`) : null,
        e.budget ? el("span", { class: "badge-budget" }, `💶 ${e.budget}`) : null,
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// Modal-Infrastruktur
// ---------------------------------------------------------------------------
function openModal(title, body) {
  closeModal();
  const overlay = el("div", { class: "modal-overlay", id: "modal", onclick: (ev) => { if (ev.target.id === "modal") closeModal(); } },
    el("div", { class: "modal" },
      el("div", { class: "modal-head" },
        el("h3", {}, title),
        el("button", { class: "icon-btn", onclick: closeModal }, "✕"),
      ),
      el("div", { class: "modal-body" }, body),
    )
  );
  document.body.append(overlay);
}
function closeModal() {
  const m = $("#modal");
  if (m) m.remove();
}

function field(labelText, inputNode) {
  return el("label", { class: "field" }, el("span", { class: "field-label" }, labelText), inputNode);
}

// ---------------------------------------------------------------------------
// Dialog: Termin
// ---------------------------------------------------------------------------
function openEventDialog(existing = null, onSaved = null) {
  const isEdit = existing && existing.id;
  const e = isEdit ? existing : {
    title: existing?.title || "", date: existing?.date || todayISO(), time: "", endTime: "",
    location: "", notes: existing?.notes || "", memberIds: [], prep: [],
    reminderLeadMinutes: 60, source: existing?.source || "manual",
  };

  const title = el("input", { class: "input", value: e.title, placeholder: "Worum geht's?" });
  const date = el("input", { class: "input", type: "date", value: e.date });
  const time = el("input", { class: "input", type: "time", value: e.time });
  const endTime = el("input", { class: "input", type: "time", value: e.endTime });
  const location = el("input", { class: "input", value: e.location, placeholder: "Ort (optional)" });
  const notes = el("textarea", { class: "input", rows: "2", placeholder: "Notizen" }, e.notes || "");
  const reminder = el("select", { class: "input" },
    ...[[0,"zur Startzeit"],[15,"15 Min vorher"],[30,"30 Min vorher"],[60,"1 Std vorher"],[120,"2 Std vorher"],[1440,"1 Tag vorher"]]
      .map(([v,l]) => el("option", { value: v, selected: e.reminderLeadMinutes === v }, l)));

  // Personen-Auswahl
  const memberWrap = el("div", { class: "chip-row" });
  const selected = new Set(e.memberIds);
  store.members().forEach((m) => {
    const chip = el("button", { type: "button",
      class: "chip" + (selected.has(m.id) ? " active" : ""),
      style: selected.has(m.id) ? `background:${m.color};border-color:${m.color};color:#fff` : `border-color:${m.color}`,
    }, m.name);
    chip.onclick = () => {
      if (selected.has(m.id)) { selected.delete(m.id); chip.classList.remove("active"); chip.style.cssText = `border-color:${m.color}`; }
      else { selected.add(m.id); chip.classList.add("active"); chip.style.cssText = `background:${m.color};border-color:${m.color};color:#fff`; }
    };
    memberWrap.append(chip);
  });

  // Vorbereitungs-Checkliste
  const prepList = el("div", { class: "prep-edit" });
  const prepItems = (e.prep || []).map((p) => ({ ...p }));
  function renderPrep() {
    prepList.innerHTML = "";
    prepItems.forEach((p, idx) => {
      prepList.append(el("div", { class: "row gap center" },
        el("input", { class: "input flex", value: p.text, placeholder: "z. B. Sportzeug packen", oninput: (ev) => p.text = ev.target.value }),
        el("select", { class: "input narrow", onchange: (ev) => p.leadDays = Number(ev.target.value) },
          ...[[0,"am Tag"],[1,"1 Tag vor"],[2,"2 Tage vor"],[3,"3 Tage vor"],[7,"1 Woche vor"]]
            .map(([v,l]) => el("option", { value: v, selected: (p.leadDays||0) === v }, l))),
        el("button", { class: "icon-btn ghost", type: "button", onclick: () => { prepItems.splice(idx,1); renderPrep(); } }, "✕"),
      ));
    });
  }
  renderPrep();
  const addPrepBtn = el("button", { class: "btn small", type: "button", onclick: () => { prepItems.push({ id: store.uid(), text: "", done: false, leadDays: 0 }); renderPrep(); } }, "+ Vorbereitungs-Schritt");

  // Vorlagen-Auswahl: hängt fertige Checklisten an und schlägt ggf. den Titel vor.
  const tmplSelect = el("select", { class: "input tmpl-select" },
    el("option", { value: "" }, "📋 Vorlage übernehmen …"),
    ...EVENT_TEMPLATES.map((t, i) => el("option", { value: String(i) }, `${t.emoji} ${t.name}`)),
  );
  tmplSelect.onchange = () => {
    const t = EVENT_TEMPLATES[Number(tmplSelect.value)];
    tmplSelect.value = "";
    if (!t) return;
    if (!title.value.trim()) title.value = t.name;
    t.prep.forEach((p) => prepItems.push({ id: store.uid(), text: p.text, done: false, leadDays: p.leadDays }));
    renderPrep();
  };

  // Mitbringen-Checkliste (am Termin selbst dabei zu haben)
  const bringList = el("div", { class: "prep-edit" });
  const bringItems = (e.bring || []).map((b) => ({ ...b }));
  function renderBring() {
    bringList.innerHTML = "";
    bringItems.forEach((b, idx) => {
      bringList.append(el("div", { class: "row gap center" },
        el("input", { class: "input flex", value: b.text, placeholder: "z. B. Geschenk", oninput: (ev) => b.text = ev.target.value }),
        el("button", { class: "icon-btn ghost", type: "button", onclick: () => { bringItems.splice(idx,1); renderBring(); } }, "✕"),
      ));
    });
  }
  renderBring();
  const addBringBtn = el("button", { class: "btn small", type: "button", onclick: () => { bringItems.push({ id: store.uid(), text: "", done: false }); renderBring(); } }, "+ Mitbringen");

  // Budget (freie Angabe)
  const budget = el("input", { class: "input", value: e.budget || "", placeholder: "z. B. 20 €" });

  const body = el("div", {},
    field("Titel", title),
    el("div", { class: "row gap" }, field("Datum", date), field("Uhrzeit", time)),
    el("div", { class: "row gap" }, field("Ende (optional)", endTime), field("Erinnerung", reminder)),
    field("Ort", location),
    field("Für wen?", memberWrap),
    field("Vorbereiten", el("div", {}, tmplSelect, prepList, addPrepBtn)),
    field("Mitbringen", el("div", {}, bringList, addBringBtn)),
    field("Budget", budget),
    field("Notizen", notes),
    el("div", { class: "modal-actions" },
      isEdit ? el("button", { class: "btn danger", onclick: () => { if (confirm("Termin löschen?")) { store.removeEvent(e.id); closeModal(); } } }, "Löschen") : null,
      isEdit ? el("button", { class: "btn", onclick: () => exportOneICS(e) }, "📤 .ics") : null,
      el("button", { class: "btn primary", onclick: save }, isEdit ? "Speichern" : "Hinzufügen"),
    ),
  );

  function save() {
    if (!title.value.trim()) { title.focus(); return; }
    const data = {
      title: title.value.trim(), date: date.value, time: time.value, endTime: endTime.value,
      location: location.value.trim(), notes: notes.value.trim(),
      memberIds: [...selected], prep: prepItems.filter((p) => p.text.trim()),
      bring: bringItems.filter((b) => b.text.trim()), budget: budget.value.trim(),
      reminderLeadMinutes: Number(reminder.value), source: e.source,
    };
    if (isEdit) store.updateEvent(e.id, data);
    else store.addEvent(data);
    closeModal();
    if (onSaved) onSaved();
  }

  openModal(isEdit ? "Termin bearbeiten" : "Neuer Termin", body);
}

// ---------------------------------------------------------------------------
// Dialog: ToDo
// ---------------------------------------------------------------------------
function openTodoDialog(existing = null, onSaved = null) {
  const isEdit = existing && existing.id;
  const t = isEdit ? existing : { title: existing?.title || "", memberId: null, due: "", priority: "normal", notes: existing?.notes || "", source: existing?.source || "manual" };

  const title = el("input", { class: "input", value: t.title, placeholder: "Was ist zu tun?" });
  const memberSel = el("select", { class: "input" },
    el("option", { value: "", selected: !t.memberId }, "— niemand zugeordnet —"),
    ...store.members().map((m) => el("option", { value: m.id, selected: t.memberId === m.id }, m.name)));
  const due = el("input", { class: "input", type: "date", value: t.due });
  const prio = el("select", { class: "input" },
    ...[["low","Niedrig"],["normal","Normal"],["high","Hoch 🔴"]].map(([v,l]) => el("option", { value: v, selected: t.priority === v }, l)));
  const notes = el("textarea", { class: "input", rows: "2", placeholder: "Notizen" }, t.notes || "");

  // Stammt das ToDo aus einem Termin? Banner mit Absprung anzeigen.
  const linkedEvent = t.eventId ? store.event(t.eventId) : null;
  const linkBanner = linkedEvent
    ? el("div", { class: "event-link-banner", onclick: () => { closeModal(); openEventDialog(linkedEvent); } },
        el("span", {}, `📅 Gehört zum Termin „${linkedEvent.title}" (${relativeDay(linkedEvent.date)})`),
        el("span", { class: "event-link-go" }, "Zum Termin ›"),
      )
    : null;

  // Vorlagen-Auswahl (nur bei neuen ToDos): füllt Titel/Priorität/Notizen vor.
  let tmplField = null;
  if (!isEdit && !linkedEvent) {
    const tmplSelect = el("select", { class: "input tmpl-select" },
      el("option", { value: "" }, "📋 Vorlage übernehmen …"),
      ...TODO_TEMPLATES.map((tpl, i) => el("option", { value: String(i) }, `${tpl.emoji} ${tpl.name}`)),
    );
    tmplSelect.onchange = () => {
      const tpl = TODO_TEMPLATES[Number(tmplSelect.value)];
      tmplSelect.value = "";
      if (!tpl) return;
      if (!title.value.trim()) title.value = tpl.title;
      if (tpl.priority) prio.value = tpl.priority;
      if (tpl.notes) notes.value = notes.value.trim() ? notes.value.trim() + "\n" + tpl.notes : tpl.notes;
    };
    tmplField = field("Vorlage", tmplSelect);
  }

  const body = el("div", {},
    linkBanner,
    tmplField,
    field("Aufgabe", title),
    el("div", { class: "row gap" }, field("Für wen?", memberSel), field("Priorität", prio)),
    field("Fällig am", due),
    field("Notizen", notes),
    el("div", { class: "modal-actions" },
      isEdit ? el("button", { class: "btn danger", onclick: () => { store.removeTodo(t.id); closeModal(); } }, "Löschen") : null,
      el("button", { class: "btn primary", onclick: save }, isEdit ? "Speichern" : "Hinzufügen"),
    ),
  );

  function save() {
    if (!title.value.trim()) { title.focus(); return; }
    const data = { title: title.value.trim(), memberId: memberSel.value || null, due: due.value, priority: prio.value, notes: notes.value.trim(), source: t.source };
    if (isEdit) store.updateTodo(t.id, data);
    else store.addTodo(data);
    closeModal();
    if (onSaved) onSaved();
  }

  openModal(isEdit ? "ToDo bearbeiten" : "Neues ToDo", body);
}

// ---------------------------------------------------------------------------
// Dialog: Familienmitglied
// ---------------------------------------------------------------------------
function openMemberDialog(existing = null) {
  const isEdit = !!existing;
  const m = existing || { name: "", color: store.defaultColors[0], role: "child" };
  const name = el("input", { class: "input", value: m.name, placeholder: "Name" });
  const role = el("select", { class: "input" },
    el("option", { value: "child", selected: m.role === "child" }, "Kind"),
    el("option", { value: "parent", selected: m.role === "parent" }, "Elternteil"));
  const colorWrap = el("div", { class: "chip-row" });
  let chosen = m.color;
  store.defaultColors.forEach((c) => {
    const sw = el("button", { type: "button", class: "color-swatch" + (c === chosen ? " active" : ""), style: `background:${c}` });
    sw.onclick = () => { chosen = c; colorWrap.querySelectorAll(".color-swatch").forEach((x) => x.classList.remove("active")); sw.classList.add("active"); };
    colorWrap.append(sw);
  });

  const body = el("div", {},
    field("Name", name),
    field("Rolle", role),
    field("Farbe", colorWrap),
    el("div", { class: "modal-actions" },
      el("button", { class: "btn primary", onclick: save }, isEdit ? "Speichern" : "Hinzufügen"),
    ),
  );
  function save() {
    if (!name.value.trim()) { name.focus(); return; }
    if (isEdit) store.updateMember(m.id, { name: name.value.trim(), role: role.value, color: chosen });
    else store.addMember({ name: name.value.trim(), role: role.value, color: chosen });
    closeModal();
  }
  openModal(isEdit ? "Person bearbeiten" : "Person hinzufügen", body);
}

// ---------------------------------------------------------------------------
// Export / Import
// ---------------------------------------------------------------------------
function exportAllICS() {
  const events = store.events();
  if (!events.length) { alert("Noch keine Termine zum Exportieren."); return; }
  downloadICS("Familienkalender", buildICS(events, (id) => store.member(id)));
}
function exportOneICS(e) {
  downloadICS(e.title.replace(/[^\wäöüÄÖÜ ]/g, "") || "Termin", buildICS([e], (id) => store.member(id)));
}
function exportBackup() {
  const blob = new Blob([store.exportJSON()], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `famorga-backup-${todayISO()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function importBackup(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  const proceed = confirm(
    "Dies ersetzt ALLE aktuellen Daten (Termine, ToDos, Mitglieder, Posteingang) durch den Inhalt dieser Sicherungsdatei. Der bisherige Stand wird vorher als Wiederherstellungspunkt gesichert, falls das ein Versehen ist. Fortfahren?"
  );
  ev.target.value = "";
  if (!proceed) return;
  const reader = new FileReader();
  reader.onload = () => {
    try { store.importJSON(reader.result); alert("Sicherung importiert."); }
    catch (err) { alert("Datei konnte nicht gelesen werden."); }
  };
  reader.readAsText(file);
}
function restoreRecovery() {
  if (!confirm("Letzten Stand (von vor dem letzten Import) wiederherstellen?")) return;
  if (store.restoreRecovery()) alert("Wiederherstellt.");
  else alert("Kein Wiederherstellungspunkt vorhanden.");
}

// ---------------------------------------------------------------------------
// Geteilter Text (z. B. über einen iOS-Kurzbefehl aus dem Teilen-Menü von
// WhatsApp/Mail) — kommt als ?text=… in der URL an. Direkt analysieren statt
// nur in den Posteingang zu legen, damit "Teilen -> fertig" reicht.
// ---------------------------------------------------------------------------
function handleSharedText() {
  const params = new URLSearchParams(location.search);
  const shared = params.get("text");
  if (!shared || !shared.trim()) return;
  history.replaceState(null, "", location.pathname + location.hash);
  location.hash = "#inbox";
  if (aiConfigured()) {
    runCapture({ text: shared.trim(), source: "whatsapp" });
  } else {
    store.addInbox(shared.trim(), "whatsapp");
  }
}

// ---------------------------------------------------------------------------
// Service Worker (Offline-Fähigkeit)
// ---------------------------------------------------------------------------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

initSync();
render();
handleSharedText();
