# FamOrga-Worker — KI-Erkennung & Kalender-Abo

Dieser kleine [Cloudflare Worker](https://workers.cloudflare.com/) ist das
Backend zur App. Er macht zwei Dinge, die eine rein lokale App nicht
sicher selbst kann:

1. **KI-Erkennung** (`/classify`): nimmt Foto/Screenshot/Text entgegen und
   lässt ein Vision-Modell über **Cloudflare Workers AI** daraus
   Termine/ToDos extrahieren. Workers AI läuft direkt im Cloudflare-Konto —
   kein externer API-Key, kein zweiter Account, keine Kreditkarte nötig.
   Standardmodell ist **Mistral Small 3.1** (`@cf/mistralai/mistral-small-3.1-24b-instruct`),
   vision-fähig und ohne EU-Lizenzsperre. (Metas Llama-3.2-Vision-Modelle
   sind absichtlich nicht gesetzt — deren Lizenz schließt EU-Nutzer aus.)
2. **Kalender-Abo** (`/sync` + `/feed.ics`): spiegelt eure Termine in einen
   kleinen Speicher (Cloudflare KV), damit iOS sie als automatisch
   aktualisiertes Abo-Kalender abonnieren kann.

Beides läuft im kostenlosen Rahmen: Cloudflare-Free-Tier (100.000
Requests/Tag für den Worker, 10.000 KI-„Neuronen"/Tag für Workers AI) – für
eine Familie bei weitem ausreichend, ohne Kreditkarte oder Zahlungsdaten.

> Hinweis: Zuvor nutzte dieses Projekt Google Gemini als KI-Backend. Google
> verlangt inzwischen für Nutzer in der EU/EWR eine hinterlegte Kreditkarte,
> auch für das kostenlose Kontingent (Fehler „429 quota exceeded, limit 0").
> Deshalb läuft die KI-Erkennung jetzt über Workers AI — bleibt im selben
> Cloudflare-Konto und braucht keinen separaten Schlüssel.

## Einmalige Einrichtung

Voraussetzung: [Node.js](https://nodejs.org) ist installiert.

```bash
cd worker
npm install -g wrangler        # Cloudflare-Kommandozeilentool
wrangler login                 # öffnet den Browser, mit Cloudflare-Konto anmelden (kostenlos)

# KV-Speicher für den Kalender-Feed anlegen:
wrangler kv namespace create FAMORGA_KV
# -> gibt eine "id" aus, die in wrangler.toml bei [[kv_namespaces]] eingetragen werden muss

# Workers-AI-Bindung ist in wrangler.toml schon als [ai] binding = "AI"
# eingetragen — kein Secret und kein API-Key nötig.

# Nur dieses eine Secret setzen (wird verschlüsselt bei Cloudflare
# gespeichert, NIE im Code):
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
