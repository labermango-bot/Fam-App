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
export function shortcutSetupSteps(name) {
  return [
    `Kurzbefehle-App öffnen → „+“ → oben den Namen exakt „${name}“ eingeben.`,
    "Aktion „Wörterbuch abrufen“ hinzufügen → als Eingabe „Kurzbefehl-Eingabe“ wählen.",
    "Aktion „Wörterbuchwert abrufen“ hinzufügen → Wert für Schlüssel „termine“ im Wörterbuch.",
    "Aktion „Mit jedem wiederholen“ hinzufügen (wiederholt mit jedem Objekt im Wörterbuchwert).",
    "Innerhalb der Wiederholung: Aktion „Neues Ereignis hinzufügen“. Dort als Kalender euren GEMEINSAMEN Kalender auswählen.",
    "Felder befüllen: jeweils auf das Feld tippen → Variable „Wiederholungsobjekt“ wählen → diese Variable nochmals antippen, als Typ „Wörterbuch“ wählen und den Schlüssel eintragen: Titel = „titel“, Startdatum = „start“, Enddatum = „ende“, Ort = „ort“, Notizen = „notizen“.",
    "Optional: „Ganztägig“ ebenso mit Schlüssel „ganztaegig“ belegen, eine Benachrichtigung (z. B. 1 Stunde vorher) wählen und – wenn du jeden Termin vor dem Speichern sehen/bestätigen willst – unter „Mehr anzeigen“ das Anzeigen des Bearbeitungsfensters einschalten.",
    "Fertig. Beim ersten Start fragt iOS einmalig, ob der Kurzbefehl auf den Kalender zugreifen darf → „Erlauben“.",
  ];
}
