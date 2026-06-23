# FamOrga 👨‍👩‍👧‍👦 — Familienorganisation für vier Kinder (und mehr)

Eine kleine, schnelle App, die den Alltag einer Familie an **einem Ort**
bündelt: Termine, Vorbereitungen, Erinnerungen und ToDos. Sie läuft als
**installierbare Web-App (PWA)** direkt auf dem iPhone-Homescreen, funktioniert
**offline** und speichert alle Daten **nur lokal auf dem Gerät** – keine Cloud,
keine Anmeldung, keine Kosten.

## Welches Problem löst die App?

Du hast es so beschrieben:

> „Es gibt einen Kalender im iOS mit Terminen … Termine müssen teilweise
> vorbereitet werden und man muss erinnert werden; weitere Termine und ToDos
> kommen aus WhatsApp, Mails, Blättern die die Kinder mitbringen oder Post.“

Genau dafür gibt es fünf Bereiche:

| Bereich | Wofür |
|---|---|
| 🏠 **Heute** | Übersicht: Was steht an? Was muss *jetzt* vorbereitet werden? |
| 📥 **Posteingang** | Schnell-Erfassung. Alles aus WhatsApp/Mail/Elternbrief/Post mit einem Tipp festhalten und später in Termin oder ToDo umwandeln. |
| 📅 **Kalender** | Monatsansicht, farbig pro Familienmitglied, mit Export in den iOS-Kalender. |
| ✅ **ToDos** | Aufgaben pro Person, mit Fälligkeit und Priorität. |
| 👨‍👩‍👧‍👦 **Familie** | Mitglieder & Farben verwalten, Datensicherung. |

### Die drei Kern-Ideen

1. **Vorbereitung gehört zum Termin.** Jeder Termin kann eine Checkliste haben
   („Sportzeug packen“, „Formular unterschreiben“) – jeweils mit **Vorlaufzeit**
   (z. B. „1 Tag vorher“). Die Startseite zeigt automatisch, was *heute* dran ist.

2. **Ein Posteingang für das ganze Chaos.** Statt dass Infos in WhatsApp, Mail
   und Elternbriefen versickern, wirfst du sie als Notiz in den Posteingang und
   sortierst sie in einer ruhigen Minute in Termin/ToDo um.

3. **Der iOS-Kalender bleibt die Wahrheit.** Termine lassen sich als
   `.ics`-Datei exportieren – einzeln oder alle zusammen – und mit einem Tipp in
   den Apple-Kalender übernehmen, inklusive **Erinnerungen** und **Vorbereitungs-Alarmen**.

## Auf dem iPhone installieren

1. Die App auf einem Webserver bereitstellen (siehe „Starten“) und die URL in
   **Safari** öffnen.
2. Teilen-Symbol → **„Zum Home-Bildschirm“**.
3. Fertig: FamOrga startet wie eine normale App im Vollbild und läuft offline.

## Starten / lokal ausprobieren

Es gibt keinen Build-Schritt – reines HTML/CSS/JavaScript. Ein einfacher
Webserver genügt (Service Worker brauchen `http(s)`, nicht `file://`):

```bash
# Variante 1: Python
python3 -m http.server 8000

# Variante 2: Node
npx serve .
```

Dann `http://localhost:8000` öffnen. Für die echte Nutzung auf dem iPhone die
Dateien z. B. auf GitHub Pages, Netlify oder einen kleinen Webspace legen.

## Termine in den iOS-Kalender übernehmen

- **Ein Termin:** im Termin-Dialog auf **„📤 .ics“**.
- **Alle Termine:** im Kalender oben rechts auf **📤** (oder unter *Familie → Daten*).

Die heruntergeladene `.ics`-Datei in „Dateien“ oder per Mail antippen →
**„Zum Kalender hinzufügen“**. Erinnerung und Vorbereitungs-Alarme sind enthalten.

## Was automatisch geht – und was (noch) nicht

Ehrlich eingeordnet, damit keine falschen Erwartungen entstehen:

- ✅ Termine, Vorbereitungen, Erinnerungen, ToDos, Personen-Farben, Kalender-Export,
  Offline-Betrieb, Datensicherung (Export/Import als JSON).
- ⚠️ **WhatsApp und Mail werden nicht automatisch ausgelesen.** Apple/Meta lassen
  das aus Datenschutzgründen für eine reine Geräte-App nicht zu. Der **Posteingang**
  ist die bewusst einfache Brücke: Text aus WhatsApp/Mail kopieren und einfügen –
  zwei Sekunden, dann ist es sicher festgehalten.
- 🔜 Mögliche Ausbaustufen: echtes Mehrgeräte-Sync (z. B. über einen kleinen
  Server oder eine geteilte Datei), automatische Termin-Erkennung aus eingefügtem
  Text, Push-Benachrichtigungen.

## Datenschutz

Alle Daten liegen ausschließlich im lokalen Speicher des Browsers/der App auf
deinem Gerät. Beim Löschen der App bzw. der Website-Daten gehen sie verloren –
deshalb gibt es unter *Familie → Daten* den Export einer Sicherungsdatei.

## Technik (kurz)

- Reines **Vanilla JavaScript** (ES-Module), **kein** Framework, **kein** Build.
- `js/store.js` – Datenmodell & Speicherung (localStorage)
- `js/ics.js` – iCalendar-Export (RFC 5545, inkl. `VALARM`)
- `js/app.js` – Oberfläche & Steuerung
- `sw.js` + `manifest.webmanifest` – Offline-/Installations-Fähigkeit (PWA)

## Lizenz

Zur freien privaten Nutzung in der Familie.
