# Worker einrichten — komplett im Browser (ohne Kommandozeile)

Diese Anleitung richtet das Backend (KI-Erkennung + Kalender-Abo) komplett
über die Cloudflare-Webseite ein. Funktioniert auch vom iPhone/iPad.

> **Sicherheits-Grundregel:** Der Zugangscode kommt **nur** in die
> Cloudflare-Oberfläche (verschlüsselt). Niemals in eine Datei, niemals ins
> GitHub-Repo, niemals in einen Chat.

---

## Was du vorbereitet brauchst

1. **Zugangscode** (frei erfunden, lang & zufällig) — schützt deinen Worker,
   damit ihn nicht Fremde benutzen. Du bekommst von mir im Chat einen
   Vorschlag, oder denk dir selbst ~25 zufällige Zeichen aus.
2. **Cloudflare-Konto** (kostenlos): [dash.cloudflare.com](https://dash.cloudflare.com) → registrieren.

Ein externer KI-API-Key wird **nicht** benötigt: Die KI-Erkennung läuft über
**Cloudflare Workers AI**, das im selben kostenlosen Cloudflare-Konto läuft
(10.000 KI-„Neuronen“/Tag kostenlos, keine Kreditkarte nötig).

---

## Schritt 1: Worker anlegen

1. In Cloudflare links auf **„Workers & Pages“** (evtl. unter „Compute“).
2. **„Create application“ → „Create Worker“**.
3. Namen vergeben, z. B. **`famorga-api`** (wird Teil der Adresse).
4. **„Deploy“** — es entsteht ein Beispiel-Worker („Hello World“).

## Schritt 2: Code einfügen

1. Beim Worker auf **„Edit code“** (das `</>`-Symbol / Online-Editor).
2. Den gesamten vorhandenen Beispiel-Code **markieren und löschen**.
3. Den kompletten Inhalt von **`worker/index.js`** aus diesem Repo
   **hineinkopieren**.
4. Oben rechts **„Deploy“**.

## Schritt 3: Speicher (KV) für den Kalender anlegen

1. Links **„Storage & Databases“ → „KV“** (oder „Workers & Pages“ → „KV“).
2. **„Create a namespace“**, Name z. B. **`famorga-kv`**, anlegen.

## Schritt 4: Worker mit dem Speicher verbinden

1. Zurück zum Worker → Reiter **„Settings“** → **„Bindings“** → **„Add binding“**.
2. Typ **„KV namespace“** wählen:
   - **Variable name:** muss exakt **`FAMORGA_KV`** heißen (genau so).
   - **KV namespace:** den eben erstellten (`famorga-kv`) auswählen.
3. Speichern.
4. Noch einmal **„Add binding“**, diesmal Typ **„Workers AI“** wählen:
   - **Variable name:** muss exakt **`AI`** heißen (genau so).
   - Kein Auswahl-Namespace nötig — einfach speichern.

## Schritt 5: Zugangscode hinterlegen

Unter **„Settings“ → „Variables and Secrets“** → **„Add“**:

| Name | Wert | Typ |
|---|---|---|
| `SYNC_TOKEN` | dein Zugangscode | **Secret** (verschlüsselt) |

Ein API-Key ist hier **nicht** nötig — die KI läuft über die `AI`-Bindung
aus Schritt 4. Danach **„Deploy“ / Speichern** klicken, damit alles aktiv wird.

## Schritt 6: Worker-Adresse holen

Auf der Worker-Übersicht steht die URL, z. B.:

```
https://famorga-api.dein-name.workers.dev
```

## Schritt 7: In der App eintragen

In FamOrga unter **Familie → KI & Kalender-Abo**:

- **Worker-URL:** die Adresse aus Schritt 6
- **Zugangscode:** dein `SYNC_TOKEN` (derselbe wie in Schritt 5)
- **Speichern**.

Fertig. Test: **Posteingang** → Foto/Text → **„✨ KI: Text erkennen“**.
Für den Kalender erscheint unter *Familie* zusätzlich der Abo-Link
(`…/feed.ics?token=…`), den du in iOS abonnierst.

---

## Wenn etwas anders aussieht

Cloudflare benennt Menüpunkte gelegentlich um. Such dann nach der Funktion
(„Bindings“, „Variables“, „KV“) statt nach dem exakten Wort — oder schick mir
einen Screenshot, dann lotse ich dich durch.
