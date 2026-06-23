// ai.js — Anbindung an den FamOrga-Worker für die KI-Erkennung
// (Foto/Screenshot/Text -> Termin- oder ToDo-Vorschlag).
import { store } from "./store.js";

function config() {
  const meta = store.get().meta || {};
  if (!meta.workerUrl || !meta.syncToken) return null;
  return { base: meta.workerUrl.replace(/\/+$/, ""), token: meta.syncToken };
}

export function aiConfigured() {
  return Boolean(config());
}

// payload: { image?: dataURL-string, text?: string }
export async function classifyCapture({ image, text }) {
  const cfg = config();
  if (!cfg) {
    throw new Error(
      "KI-Erkennung ist noch nicht eingerichtet. Unter „Familie -> KI & Kalender-Abo“ Worker-URL und Zugangscode eintragen."
    );
  }
  let body;
  if (image) {
    const m = /^data:(.+);base64,(.*)$/.exec(image);
    if (!m) throw new Error("Bild konnte nicht gelesen werden.");
    body = { image: m[2], mediaType: m[1], text: text || "" };
  } else {
    body = { text };
  }
  const res = await fetch(`${cfg.base}/classify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-famorga-token": cfg.token },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || `Fehler (${res.status}) bei der KI-Erkennung.`);
  }
  const data = await res.json();
  return data.items || [];
}

export function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
