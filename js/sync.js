// sync.js — spiegelt Termine an den eigenen Worker, damit der
// Kalender-Abo-Feed (/feed.ics) immer den aktuellen Stand zeigt.
// Läuft nur, wenn unter "Familie -> KI & Kalender-Abo" eine Worker-URL und
// ein Zugangscode eingetragen sind; ohne das passiert hier nichts.
import { store } from "./store.js";

let timer = null;

export function initSync() {
  store.subscribe(() => {
    clearTimeout(timer);
    timer = setTimeout(pushSync, 1500);
  });
}

function config() {
  const meta = store.get().meta || {};
  if (!meta.workerUrl || !meta.syncToken) return null;
  return { base: meta.workerUrl.replace(/\/+$/, ""), token: meta.syncToken };
}

async function pushSync() {
  const cfg = config();
  if (!cfg) return;
  try {
    await fetch(`${cfg.base}/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-famorga-token": cfg.token },
      body: JSON.stringify({ events: store.events(), members: store.members() }),
    });
  } catch (_) {
    // Offline oder Worker nicht erreichbar — wird beim nächsten Datenwechsel erneut versucht.
  }
}

export function feedUrl() {
  const cfg = config();
  if (!cfg) return null;
  return `${cfg.base}/feed.ics?token=${encodeURIComponent(cfg.token)}`;
}

export function isConfigured() {
  return Boolean(config());
}
