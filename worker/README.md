# FamOrga-Worker — KI-Erkennung & Kalender-Abo

Dieser kleine [Cloudflare Worker](https://workers.cloudflare.com/) ist das
Backend zur App. Er macht zwei Dinge, die eine rein lokale App nicht
sicher selbst kann:

1. **KI-Erkennung** (`/classify`): nimmt Foto/Screenshot/Text entgegen und
   lässt Google Gemini daraus Termine/ToDos extrahieren. Der Gemini-API-Key
   liegt nur hier auf dem Server, nie im Browser.
2. **Kalender-Abo** (`/sync` + `/feed.ics`): spiegelt eure Termine in einen
   kleinen Speicher (Cloudflare KV), damit iOS sie als automatisch
   aktualisiertes Abo-Kalender abonnieren kann.

Beides läuft im kostenlosen Rahmen: Cloudflare-Free-Tier (100.000
Requests/Tag) und Googles kostenloses Gemini-Kontingent (Stand heute z. B.
Gemini 2.0 Flash mit großzügigem Tageslimit) – für eine Familie bei weitem
ausreichend, ohne Kreditkarte oder Zahlungsdaten.

## Kostenlosen Gemini-API-Key erstellen

Ein **API-Key** ist hier nötig (kein "Abo", keine Zahlungsdaten) – einfach
ein kostenloser Zugangsschlüssel für Googles KI:

1. [aistudio.google.com/apikey](https://aistudio.google.com/apikey) öffnen,
   mit Google-Konto anmelden.
2. „Create API key" klicken, Key kopieren.
3. Den Key gleich unten bei „Secrets setzen" verwenden.

Wichtig zur Sicherheit: Dieser Key wird **nie** in eine Datei im Repo
geschrieben, auch nicht in `wrangler.toml`. Der Befehl `wrangler secret put`
lädt ihn direkt verschlüsselt zu Cloudflare hoch – im (öffentlichen!)
GitHub-Repo steht nur der Worker-*Code*, der den Key zur Laufzeit aus einer
Umgebungsvariable liest, niemals der Key selbst.

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
wrangler secret put GEMINI_API_KEY
# -> kostenlosen Gemini-API-Key von aistudio.google.com/apikey einfügen

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
