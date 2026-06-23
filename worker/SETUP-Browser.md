# Worker einrichten — komplett im Browser (ohne Kommandozeile)

Diese Anleitung richtet das Backend (KI-Erkennung + Kalender-Abo) komplett
über die Cloudflare-Webseite ein. Funktioniert auch vom iPhone/iPad.

> **Sicherheits-Grundregel:** Der Gemini-API-Key und der Zugangscode kommen
> **nur** in die Cloudflare-Oberfläche (verschlüsselt). Niemals in eine Datei,
> niemals ins GitHub-Repo, niemals in einen Chat. Falls ein Key doch mal
> irgendwo sichtbar war: in Google AI Studio löschen und neu erstellen.

---

## Was du vorbereitet brauchst

1. **Gemini-API-Key** von [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
   („Create API key“, sieht aus wie `AIza…`). Nur dein Google-Konto nötig.
2. **Zugangscode** (frei erfunden, lang & zufällig) — schützt deinen Worker,
   damit ihn nicht Fremde benutzen. Du bekommst von mir im Chat einen
   Vorschlag, oder denk dir selbst ~25 zufällige Zeichen aus.
3. **Cloudflare-Konto** (kostenlos): [dash.cloudflare.com](https://dash.cloudflare.com) → registrieren.

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

## Schritt 5: Key und Zugangscode hinterlegen

Immer noch unter **„Settings“ → „Variables and Secrets“** → **„Add“**:

| Name | Wert | Typ |
|---|---|---|
| `GEMINI_API_KEY` | dein **neuer** Gemini-Key (`AIza…`) | **Secret** (verschlüsselt) |
| `SYNC_TOKEN` | dein Zugangscode | **Secret** (verschlüsselt) |
| `GEMINI_MODEL` | `gemini-2.0-flash` | Text (optional, sonst Standard) |

Danach **„Deploy“ / Speichern**, damit alles aktiv wird.

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
