// store.js — zentrale Datenhaltung der Familien-App.
// Alles wird lokal im Browser (localStorage) gespeichert: keine Cloud,
// keine Anmeldung, funktioniert offline. Daten lassen sich exportieren
// und auf einem anderen Gerät wieder importieren.

const STORAGE_KEY = "famorga.v1";
const RECOVERY_KEY = "famorga.v1.recovery";

const DEFAULT_COLORS = [
  "#0a84ff", "#ff375f", "#30d158", "#ff9f0a",
  "#bf5af2", "#64d2ff", "#ffd60a", "#ac8e68",
];

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Verschiebt ein ISO-Datum ("YYYY-MM-DD") um deltaDays Tage (UTC, ohne
// Zeitzonen-Verschiebung). Negatives delta = früheres Datum.
function shiftISODate(iso, deltaDays) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00Z");
  if (isNaN(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function makeTodo(data) {
  return {
    id: uid(),
    title: data.title || "Neues ToDo",
    memberId: data.memberId || null,
    due: data.due || "",
    done: data.done || false,
    priority: data.priority || "normal", // low | normal | high
    notes: data.notes || "",
    source: data.source || "manual",
    eventId: data.eventId || null,   // verknüpfter Termin (bei Vorbereitungs-ToDos)
    prepId: data.prepId || null,     // verknüpfter Vorbereitungs-Schritt
    createdAt: new Date().toISOString(),
  };
}

// Hält für jeden Vorbereitungs-Schritt eines Termins ein verknüpftes ToDo
// mit Zieldatum (Termindatum minus Vorlaufzeit) aktuell. Wird bei jedem
// Anlegen/Ändern eines Termins aufgerufen. Mutiert state.todos direkt; der
// Aufrufer ist fürs persist() zuständig.
function reconcilePrepTodos(event) {
  const prep = (event.prep || []).filter((p) => (p.text || "").trim());
  const wantedIds = new Set(prep.map((p) => p.id));
  // Verwaiste Vorbereitungs-ToDos dieses Termins entfernen.
  state.todos = state.todos.filter(
    (t) => !(t.eventId === event.id && t.prepId && !wantedIds.has(t.prepId))
  );
  const memberId = (event.memberIds || [])[0] || null;
  prep.forEach((p) => {
    const due = shiftISODate(event.date, -(p.leadDays || 0));
    const existing = state.todos.find((t) => t.eventId === event.id && t.prepId === p.id);
    if (existing) {
      existing.title = p.text.trim();
      existing.due = due;
      existing.done = !!p.done;
      if (!existing.memberId) existing.memberId = memberId;
    } else {
      state.todos.push(makeTodo({
        title: p.text.trim(), due, memberId, done: !!p.done,
        source: "prep", eventId: event.id, prepId: p.id,
      }));
    }
  });
}

function seedState() {
  // Erststart: eine Familie mit Eltern + vier Kindern als Platzhalter.
  const names = ["Mama", "Papa", "Kind 1", "Kind 2", "Kind 3", "Kind 4"];
  const members = names.map((name, i) => ({
    id: uid(),
    name,
    color: DEFAULT_COLORS[i % DEFAULT_COLORS.length],
    role: i < 2 ? "parent" : "child",
  }));
  return {
    members,
    events: [],
    todos: [],
    inbox: [],
    shopping: [],
    birthdays: [],
    meta: { createdAt: new Date().toISOString(), onboarded: false },
  };
}

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedState();
    const parsed = JSON.parse(raw);
    // Defensiv: fehlende Felder ergänzen, falls ein altes Format vorliegt.
    return {
      members: parsed.members || [],
      events: parsed.events || [],
      todos: parsed.todos || [],
      inbox: parsed.inbox || [],
      shopping: parsed.shopping || [],
      birthdays: parsed.birthdays || [],
      meta: parsed.meta || { createdAt: new Date().toISOString() },
    };
  } catch (e) {
    console.error("Konnte gespeicherte Daten nicht lesen, starte neu.", e);
    return seedState();
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  listeners.forEach((fn) => fn(state));
}

export const store = {
  uid,
  defaultColors: DEFAULT_COLORS,

  get() {
    return state;
  },

  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  // --- Familienmitglieder -------------------------------------------------
  members() {
    return state.members;
  },
  member(id) {
    return state.members.find((m) => m.id === id);
  },
  addMember({ name, color, role }) {
    const m = { id: uid(), name, color: color || nextColor(), role: role || "child" };
    state.members.push(m);
    persist();
    return m;
  },
  updateMember(id, patch) {
    const m = store.member(id);
    if (m) Object.assign(m, patch);
    persist();
  },
  removeMember(id) {
    state.members = state.members.filter((m) => m.id !== id);
    // Verknüpfungen lösen, damit keine "Geister"-Zuordnungen bleiben.
    state.events.forEach((e) => {
      e.memberIds = (e.memberIds || []).filter((x) => x !== id);
    });
    state.todos.forEach((t) => {
      if (t.memberId === id) t.memberId = null;
    });
    persist();
  },

  // --- Termine ------------------------------------------------------------
  events() {
    return state.events;
  },
  event(id) {
    return state.events.find((e) => e.id === id);
  },
  addEvent(data) {
    const e = {
      id: uid(),
      title: data.title || "Neuer Termin",
      date: data.date,            // "YYYY-MM-DD"
      time: data.time || "",      // "HH:MM" oder leer = ganztägig
      endTime: data.endTime || "",
      location: data.location || "",
      notes: data.notes || "",
      memberIds: data.memberIds || [],
      prep: data.prep || [],      // [{id, text, done, leadDays}]
      bring: data.bring || [],    // [{id, text, done}] — am Termin mitbringen
      budget: data.budget || "",  // freie Angabe, z. B. "20 €"
      reminderLeadMinutes: data.reminderLeadMinutes ?? 60,
      source: data.source || "manual",
      createdAt: new Date().toISOString(),
    };
    state.events.push(e);
    reconcilePrepTodos(e);
    persist();
    return e;
  },
  updateEvent(id, patch) {
    const e = store.event(id);
    if (e) {
      Object.assign(e, patch);
      reconcilePrepTodos(e);
    }
    persist();
  },
  removeEvent(id) {
    state.events = state.events.filter((e) => e.id !== id);
    // Verknüpfte Vorbereitungs-ToDos mit entfernen.
    state.todos = state.todos.filter((t) => t.eventId !== id);
    persist();
  },
  togglePrep(eventId, prepId) {
    const e = store.event(eventId);
    const p = e && e.prep.find((x) => x.id === prepId);
    if (p) {
      p.done = !p.done;
      // Verknüpftes ToDo synchron halten.
      const linked = state.todos.find((t) => t.eventId === eventId && t.prepId === prepId);
      if (linked) linked.done = p.done;
      persist();
    }
  },
  addPrep(eventId, text, leadDays = 0) {
    const e = store.event(eventId);
    if (e) {
      e.prep.push({ id: uid(), text, done: false, leadDays });
      reconcilePrepTodos(e);
      persist();
    }
  },
  removePrep(eventId, prepId) {
    const e = store.event(eventId);
    if (e) {
      e.prep = e.prep.filter((p) => p.id !== prepId);
      state.todos = state.todos.filter((t) => !(t.eventId === eventId && t.prepId === prepId));
      persist();
    }
  },

  // --- ToDos --------------------------------------------------------------
  todos() {
    return state.todos;
  },
  addTodo(data) {
    const t = makeTodo(data);
    state.todos.push(t);
    persist();
    return t;
  },
  updateTodo(id, patch) {
    const t = state.todos.find((x) => x.id === id);
    if (t) Object.assign(t, patch);
    persist();
  },
  toggleTodo(id) {
    const t = state.todos.find((x) => x.id === id);
    if (t) {
      t.done = !t.done;
      // Falls aus einem Termin-Vorbereitungsschritt: dort synchron abhaken.
      if (t.eventId && t.prepId) {
        const e = store.event(t.eventId);
        const p = e && (e.prep || []).find((x) => x.id === t.prepId);
        if (p) p.done = t.done;
      }
      persist();
    }
  },
  removeTodo(id) {
    state.todos = state.todos.filter((t) => t.id !== id);
    persist();
  },

  // --- Posteingang (Schnell-Erfassung) -----------------------------------
  inbox() {
    return state.inbox;
  },
  addInbox(text, source = "other") {
    const item = {
      id: uid(),
      text,
      source, // whatsapp | mail | paper | post | other
      processed: false,
      createdAt: new Date().toISOString(),
    };
    state.inbox.unshift(item);
    persist();
    return item;
  },
  removeInbox(id) {
    state.inbox = state.inbox.filter((i) => i.id !== id);
    persist();
  },

  // --- Einkaufsliste ------------------------------------------------------
  shopping() {
    return state.shopping;
  },
  // Nimmt einen Text (z. B. aus WhatsApp) und legt pro Zeile / pro durch
  // Komma getrenntem Eintrag einen abhakbaren Artikel an. Gibt die Anzahl
  // der hinzugefügten Artikel zurück.
  addShopping(text, shop = null) {
    const mem = (state.meta.shopMemory = state.meta.shopMemory || {});
    const items = String(text || "")
      .split(/[\n,;]+/)
      .map((s) => s.replace(/^[\s\-*•·–]+/, "").trim()) // Aufzählungszeichen entfernen
      .filter(Boolean);
    items.forEach((t) => {
      // Markt: explizit übergeben, sonst gemerkter Markt für diesen Artikel.
      const resolved = shop || mem[t.toLowerCase()] || "";
      if (shop) mem[t.toLowerCase()] = shop;
      state.shopping.push({ id: uid(), text: t, done: false, shop: resolved, createdAt: new Date().toISOString() });
    });
    if (items.length) persist();
    return items.length;
  },
  toggleShopping(id) {
    const i = state.shopping.find((x) => x.id === id);
    if (i) { i.done = !i.done; persist(); }
  },
  // Markt eines Artikels setzen und die Zuordnung merken (für nächstes Mal).
  setShoppingShop(id, shop) {
    const i = state.shopping.find((x) => x.id === id);
    if (!i) return;
    i.shop = shop || "";
    const mem = (state.meta.shopMemory = state.meta.shopMemory || {});
    if (shop) mem[i.text.toLowerCase()] = shop;
    else delete mem[i.text.toLowerCase()];
    persist();
  },
  removeShopping(id) {
    state.shopping = state.shopping.filter((i) => i.id !== id);
    persist();
  },
  clearCheckedShopping() {
    state.shopping = state.shopping.filter((i) => !i.done);
    persist();
  },

  // --- Geburtstage --------------------------------------------------------
  birthdays() {
    return state.birthdays;
  },
  addBirthday({ name, day, month, year, memberId }) {
    const b = {
      id: uid(),
      name: name || "Geburtstag",
      day: Number(day),            // 1–31
      month: Number(month),        // 1–12
      year: year ? Number(year) : null, // optional, für Altersanzeige
      memberId: memberId || null,
    };
    state.birthdays.push(b);
    persist();
    return b;
  },
  updateBirthday(id, patch) {
    const b = state.birthdays.find((x) => x.id === id);
    if (b) Object.assign(b, patch);
    persist();
  },
  removeBirthday(id) {
    state.birthdays = state.birthdays.filter((b) => b.id !== id);
    persist();
  },

  // --- Import / Export ----------------------------------------------------
  exportJSON() {
    return JSON.stringify(state, null, 2);
  },
  importJSON(json) {
    const parsed = JSON.parse(json);
    // Sicherheitsnetz: den bisherigen Stand separat aufheben, bevor er
    // überschrieben wird — falls der Import ein Versehen war, lässt sich
    // damit der Zustand von direkt davor wiederherstellen.
    try { localStorage.setItem(RECOVERY_KEY, JSON.stringify(state)); } catch (e) {}
    state = {
      members: parsed.members || [],
      events: parsed.events || [],
      todos: parsed.todos || [],
      inbox: parsed.inbox || [],
      shopping: parsed.shopping || [],
      birthdays: parsed.birthdays || [],
      meta: parsed.meta || { createdAt: new Date().toISOString() },
    };
    persist();
  },
  hasRecovery() {
    return Boolean(localStorage.getItem(RECOVERY_KEY));
  },
  restoreRecovery() {
    const raw = localStorage.getItem(RECOVERY_KEY);
    if (!raw) return false;
    state = JSON.parse(raw);
    localStorage.removeItem(RECOVERY_KEY);
    persist();
    return true;
  },
  setMeta(patch) {
    Object.assign(state.meta, patch);
    persist();
  },
};

function nextColor() {
  const used = new Set(state.members.map((m) => m.color));
  return DEFAULT_COLORS.find((c) => !used.has(c)) || DEFAULT_COLORS[0];
}
