# FamOrga-Worker — KI-Erkennung & Kalender-Abo

Dieser kleine [Cloudflare Worker](https://workers.cloudflare.com/) ist das
Backend zur App. Er macht zwei Dinge, die eine rein lokale App nicht
sicher selbst kann:

1. **KI-Erkennung** (`/classify`): nimmt Foto/Screenshot/Text entgegen und
   lässt Claude (Anthropic) daraus Termine/ToDos extrahieren. Der
   Anthropic-API-Key liegt nur hier auf dem Server, nie im Browser.
2. **Kalender-Abo** (`/sync` + `/feed.ics`): spiegelt eure Termine in einen
   kleinen Speicher (Cloudflare KV), damit iOS sie als automatisch
   aktualisiertes Abo-Kalender abonnieren kann.

Kostenlos im Rahmen des Cloudflare-Free-Tiers (100.000 Requests/Tag) – für
eine Familie bei weitem ausreichend. Die Anthropic-API-Nutzung wird separat
nach Verbrauch abgerechnet (siehe unten).

## Wichtig: „Claude-Abo" reicht hier nicht aus

Ein **claude.ai-Abo (Pro/Max)** ist ein Chat-Abo für die Claude-Webseite/App
und kann technisch **nicht** von einem eigenen Programm aus angesprochen
werden. Für die Anbindung an dieses Programm braucht man einen **separaten
API-Key** von [console.anthropic.com](https://console.anthropic.com) – das
ist ein anderes Konto/Produkt als claude.ai, mit eigener (meist sehr
günstiger) Abrechnung nach Nutzung (ein paar Cent pro Foto-Erkennung).

Schritte:
1. Konto auf [console.anthropic.com](https://console.anthropic.com) anlegen.
2. Unter „API Keys" einen neuen Key erstellen, etwas Guthaben aufladen
   (ein paar Euro reichen für sehr lange).
3. Den Key gleich unten bei „Secrets setzen" verwenden.

## Einmalige Einrichtung

Voraussetzung: [Node.js](https://nodejs.org) ist installiert.

```bash
cd worker
npm install -g wrangler        # Cloudflare-Kommandozeilentool
wrangler login                 # öffnet den Browser, mit Cloudflare-Konto anmelden (kostenlos)

# KV-Speicher für den Kalender-Feed anlegen:
wrangler kv namespace create FAMORGA_KV
# -> gibt eine "id" aus, die in wrangler.toml bei [[kv_namespaces]] eingetragen werden muss

# Secrets setzen (werden verschlüsselt bei Cloudflare gespeichert, NIE im Code):
wrangler secret put ANTHROPIC_API_KEY
# -> Anthropic API-Key von console.anthropic.com einfügen

wrangler secret put SYNC_TOKEN
# -> einen frei erfundenen, langen Code eingeben, z. B. 32 zufällige Zeichen.
#    Diesen Code braucht ihr (du + deine Frau) später in der App unter
#    "Familie -> KI & Kalender-Abo", damit nicht jeder Fremde im Internet
#    euren Worker benutzen kann.

# Deployment:
wrangler deploy
```

Am Ende zeigt `wrangler deploy` eine URL wie:

```
https://famorga-api.<dein-cloudflare-name>.workers.dev
```

Diese URL + den selbst gewählten `SYNC_TOKEN` trägt ihr in der App unter
**Familie → KI & Kalender-Abo** ein. Danach:

- Fotos/Screenshots/Text werden über `/classify` automatisch als
  Termin- oder ToDo-Vorschlag erkannt (mit Rückfrage zur Bestätigung).
- Die App zeigt euch einen Link `…/feed.ics?token=…`. Diesen Link in
  **iOS: Einstellungen → Kalender → Accounts → Account hinzufügen →
  Andere → Kalenderabo hinzufügen** eintragen – einmal bei dir, einmal bei
  deiner Frau. iOS aktualisiert das Abo automatisch (ca. stündlich, vom
  System vorgegeben, nicht exakt steuerbar).

## Grenzen, ehrlich gesagt

- Das Abo ist **nur eine Richtung**: App → iOS-Kalender. Änderungen, die
  ihr direkt im iOS-Kalender an diesen Terminen macht, fließen nicht
  zurück in die App.
- Es ist ein **zusätzlicher** Kalender in iOS, kein Hineinmischen in einen
  bestehenden gemeinsamen Kalender (Apple lässt das für Abo-Kalender nicht
  zu) – farblich aber genauso gut von den „echten" Terminen unterscheidbar.
- KI-Erkennung ist nicht perfekt – deshalb gibt es vor dem Anlegen immer
  eine Bestätigungs-Ansicht zum Prüfen/Korrigieren.
