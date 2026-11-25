// ioscal.js — Termine über einen iOS-Kurzbefehl direkt in einen bestimmten
// iOS-Kalender (z. B. den mit dem Partner geteilten) schreiben.
//
// Warum ein Kurzbefehl? Eine Web-App darf nicht selbst in den iOS-Kalender
// schreiben, und .ics-Dateien landen (wenn überhaupt) im Standardkalender.
// Die Kurzbefehle-App dagegen kann mit „Neues Ereignis hinzufügen" in einen
// fest gewählten Kalender schreiben. FamOrga startet den Kurzbefehl per
//   shortcuts://run-shortcut?name=…&input=text&text=<JSON>
// und übergibt die Termine als JSON:
//   { "termine": [ { titel, start, ende, ganztaegig, ort, notizen }, … ] }
// start/ende im deutschen Format "TT.MM.JJJJ HH:MM" (ganztägig nur "TT.MM.JJJJ"),
// das die Kurzbefehle-App auf einem deutschen iPhone sicher als Datum erkennt.
import { eventSummary, eventDescription } from "./ics.js";

export const DEFAULT_SHORTCUT_NAME = "FamOrga Termin";

const pad = (n) => String(n).padStart(2, "0");

function fmtDate(d) {
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}
function fmtDateTime(d) {
  return `${fmtDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function toDate(dateISO, time) {
  const [y, m, d] = dateISO.split("-").map(Number);
  const [hh, mm] = (time || "00:00").split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm);
}

// Ein FamOrga-Termin -> Eintrag für den Kurzbefehl.
export function eventToShortcutItem(event, memberLookup) {
  const names = (event.memberIds || []).map((id) => memberLookup(id)?.name).filter(Boolean);
  const allDay = !event.time;
  const start = toDate(event.date, event.time);
  let end;
  if (allDay) {
    end = start;
  } else if (event.endTime && event.endTime > event.time) {
    end = toDate(event.date, event.endTime);
  } else {
    end = new Date(start.getTime() + 60 * 60 * 1000); // ohne Ende: 1 Stunde
  }
  return {
    titel: eventSummary(event, names),
    start: allDay ? fmtDate(start) : fmtDateTime(start),
    ende: allDay ? fmtDate(end) : fmtDateTime(end),
    ganztaegig: allDay,
    ort: event.location || "",
    notizen: eventDescription(event),
  };
}

export function shortcutPayload(events, memberLookup) {
  return JSON.stringify({ termine: events.map((e) => eventToShortcutItem(e, memberLookup)) });
}

export function shortcutURL(name, events, memberLookup) {
  const text = shortcutPayload(events, memberLookup);
  return "shortcuts://run-shortcut?name=" + encodeURIComponent(name || DEFAULT_SHORTCUT_NAME) +
    "&input=text&text=" + encodeURIComponent(text);
}

// Schritt-für-Schritt-Anleitung (einmalig in der Kurzbefehle-App bauen).
// Jeder Schritt: Überschrift + einzelne Taps.
export function shortcutSetupSteps(name) {
  const FELD = (feld, key) =>
    `„${feld}“: Feld GEDRÜCKT halten → „Variable auswählen“ → oben in „Mit jedem Objekt … wiederholen“ die Blase „Wiederholungsobjekt“ antippen → die eingefügte Blase nochmals antippen → Typ „Wörterbuch“ → bei „Schlüssel“ ${key} eintippen → „Fertig“.`;
  return [
    { title: "Neuen Kurzbefehl anlegen", items: [
      "Kurzbefehle-App öffnen → unten rechts bzw. oben „+“.",
      `Oben auf den Namen tippen → „Umbenennen“ → exakt „${name}“ eingeben.`,
    ]},
    { title: "Aktion 1: Wörterbuchwert", items: [
      "Unten ins Suchfeld „Wörterbuchwert“ tippen → „Wörterbuchwert abrufen“ antippen.",
      "Es erscheint: „Wert für Schlüssel in Wörterbuch abrufen“.",
      "Auf das hellblaue „Schlüssel“ tippen → termine eintippen.",
      "Auf das hellblaue „Wörterbuch“ tippen → „Kurzbefehl-Eingabe“ wählen. (Oben erscheint dann ein Block „Empfangen … Eingabe“ – den einfach so lassen.)",
    ]},
    { title: "Aktion 2: Wiederholen", items: [
      "Im Suchfeld „Mit jedem wiederholen“ suchen und antippen.",
      "Es erscheint „Mit jedem Objekt aus Wörterbuchwert wiederholen“ und darunter „Wiederholung beenden“.",
    ]},
    { title: "Aktion 3: Ereignis anlegen", items: [
      "Im Suchfeld „Ereignis“ suchen → die rote Kalender-Aktion „Neues Ereignis hinzufügen“ (je nach iOS „Ereignis erstellen“) antippen.",
      "Die Aktion landet ganz unten. Gedrückt halten und nach oben ziehen, sodass sie ZWISCHEN „Mit jedem … wiederholen“ und „Wiederholung beenden“ steht (sie wird dann eingerückt).",
      "In der Aktion auf den Kalender (z. B. „Kalender“) tippen → euren GEMEINSAMEN Kalender auswählen.",
    ]},
    { title: "Felder der Ereignis-Aktion verknüpfen (5×)", items: [
      FELD("Titel", "titel"),
      FELD("von (z. B. „Morgen mittag“)", "start"),
      FELD("bis (z. B. „Morgen um 13:00 Uhr“)", "ende"),
      "Falls Ort/Notizen nicht sichtbar: auf den Pfeil ⌄ der Aktion tippen, dann:",
      FELD("Ort", "ort"),
      FELD("Notizen", "notizen"),
    ]},
    { title: "Optional", items: [
      "Bei „Hinweis“ eine Erinnerung wählen (z. B. 1 Stunde vorher).",
      "Wenn du jeden Termin vor dem Speichern sehen/bestätigen willst: „Bereich zum Erstellen anzeigen“ einschalten.",
    ]},
    { title: "Testen", items: [
      "Oben auf „Fertig“/„<“, zurück in FamOrga → „🧪 Test-Termin senden“.",
      "iOS fragt einmalig nach Kalenderzugriff → „Erlauben“. Danach steht morgen 10:00 „FamOrga Test“ in eurem gemeinsamen Kalender (anschließend dort löschen).",
    ]},
  ];
}

// Beispieltermin für den Test (morgen 10–11 Uhr).
export function testEvent() {
  const d = new Date(); d.setDate(d.getDate() + 1);
  const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return { id: "test", title: "FamOrga Test", date: iso, time: "10:00", endTime: "11:00",
    location: "", notes: "Test – kann gelöscht werden.", memberIds: [] };
}
