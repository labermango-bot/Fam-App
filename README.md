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
| 👨‍👩‍👧‍👦 **Familie** | Mitglieder & Farben verwalten, Datensicherung, KI & Kalender-Abo. |

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

## KI-Erkennung aus Foto/Screenshot/Text (optional)

Im **Posteingang** lässt sich ein Foto/Screenshot aufnehmen, eine Bild-Datei
einfügen (Strg/Cmd+V) oder Text eingeben – die KI erkennt daraus automatisch
einen **Termin** oder ein **ToDo** und erstellt bei Bedarf direkt passende
**Vorbereitungs-Schritte** (z. B. aus einer Geburtstagseinladung wird der Termin
plus „Geschenk besorgen“ als Vorbereitung mit Vorlaufzeit). Vor dem Anlegen gibt
es immer eine Prüf-/Korrektur-Ansicht.

Dafür wird ein kleiner, eigener Cloudflare-Worker als Backend benötigt. Die
KI-Erkennung läuft über **Cloudflare Workers AI** – läuft direkt im
selben kostenlosen Cloudflare-Konto, kein separater API-Key, kein
zweiter Account, keine Kreditkarte nötig. Einmalige Einrichtung: siehe
[`worker/README.md`](worker/README.md). Danach unter **Familie → KI &
Kalender-Abo** Worker-URL + Zugangscode eintragen.

## Kalender-Abo für iOS (optional, automatisch aktuell)

Nach Einrichtung desselben Workers gibt es zusätzlich einen Abo-Link
(`…/feed.ics?token=…`), den du **und deine Frau** je einmal in iOS unter
**Einstellungen → Kalender → Accounts → Account hinzufügen → Andere →
Kalenderabo hinzufügen** eintragt. iOS holt sich darüber automatisch (laut
System-Vorgabe, ca. stündlich) die aktuellen Termine aus FamOrga – ohne
Apple-ID-Zugangsdaten. Es ist eine **Einbahnstraße** (App → iOS-Kalender) und
erscheint als **zusätzlicher** Kalender, nicht als Vermischung mit eurem
bestehenden gemeinsamen Kalender.

## Was automatisch geht – und was (noch) nicht

Ehrlich eingeordnet, damit keine falschen Erwartungen entstehen:

- ✅ Termine, Vorbereitungen, Erinnerungen, ToDos, Personen-Farben, Kalender-Export,
  Offline-Betrieb, Datensicherung (Export/Import als JSON).
- ✅ **Optional**: KI-Erkennung aus Foto/Screenshot/Text (inkl. automatischer
  Vorbereitungs-ToDos) und automatisch aktueller iOS-Kalender-Abo-Link – beides
  erfordert die einmalige Worker-Einrichtung oben.
- ⚠️ **WhatsApp und Mail werden nicht automatisch ausgelesen.** Apple/Meta lassen
  das aus Datenschutzgründen für eine reine Geräte-App nicht zu. Der **Posteingang**
  ist die bewusst einfache Brücke: Text aus WhatsApp/Mail kopieren und einfügen,
  oder einen Screenshot hochladen – dann übernimmt die KI den Rest.
- ⚠️ Der Kalender-Abo-Link ist nur eine Richtung (App → iOS). Eine echte
  Zwei-Wege-Synchronisation mit eurem gemeinsamen Kalender wäre über CalDAV
  möglich, ist aber deutlich komplexer (Apple-App-Passwort nötig) und wurde
  bewusst nicht umgesetzt.
- 🔜 Mögliche Ausbaustufen: Push-Benachrichtigungen, echte Zwei-Wege-CalDAV-Sync.

## Datenschutz

Alle Daten liegen ausschließlich im lokalen Speicher des Browsers/der App auf
deinem Gerät. Beim Löschen der App bzw. der Website-Daten gehen sie verloren –
deshalb gibt es unter *Familie → Daten* den Export einer Sicherungsdatei.

## Technik (kurz)

- Reines **Vanilla JavaScript** (ES-Module), **kein** Framework, **kein** Build.
- `js/store.js` – Datenmodell & Speicherung (localStorage)
- `js/ics.js` – iCalendar-Export (RFC 5545, inkl. `VALARM`)
- `js/ai.js` – Anbindung an den Worker für die KI-Erkennung (optional)
- `js/sync.js` – Spiegelt Termine an den Worker für den Kalender-Abo-Feed (optional)
- `js/app.js` – Oberfläche & Steuerung
- `sw.js` + `manifest.webmanifest` – Offline-/Installations-Fähigkeit (PWA)
- `worker/` – optionaler Cloudflare Worker (KI-Erkennung + Kalender-Abo-Feed), siehe `worker/README.md`

## Lizenz

Zur freien privaten Nutzung in der Familie.
