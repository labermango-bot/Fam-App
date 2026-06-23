// store.js — zentrale Datenhaltung der Familien-App.
// Alles wird lokal im Browser (localStorage) gespeichert: keine Cloud,
// keine Anmeldung, funktioniert offline. Daten lassen sich exportieren
// und auf einem anderen Gerät wieder importieren.

const STORAGE_KEY = "famorga.v1";

const DEFAULT_COLORS = [
  "#0a84ff", "#ff375f", "#30d158", "#ff9f0a",
  "#bf5af2", "#64d2ff", "#ffd60a", "#ac8e68",
];

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
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
      reminderLeadMinutes: data.reminderLeadMinutes ?? 60,
      source: data.source || "manual",
      createdAt: new Date().toISOString(),
    };
    state.events.push(e);
    persist();
    return e;
  },
  updateEvent(id, patch) {
    const e = store.event(id);
    if (e) Object.assign(e, patch);
    persist();
  },
  removeEvent(id) {
    state.events = state.events.filter((e) => e.id !== id);
    persist();
  },
  togglePrep(eventId, prepId) {
    const e = store.event(eventId);
    const p = e && e.prep.find((x) => x.id === prepId);
    if (p) {
      p.done = !p.done;
      persist();
    }
  },
  addPrep(eventId, text, leadDays = 0) {
    const e = store.event(eventId);
    if (e) {
      e.prep.push({ id: uid(), text, done: false, leadDays });
      persist();
    }
  },
  removePrep(eventId, prepId) {
    const e = store.event(eventId);
    if (e) {
      e.prep = e.prep.filter((p) => p.id !== prepId);
      persist();
    }
  },

  // --- ToDos --------------------------------------------------------------
  todos() {
    return state.todos;
  },
  addTodo(data) {
    const t = {
      id: uid(),
      title: data.title || "Neues ToDo",
      memberId: data.memberId || null,
      due: data.due || "",
      done: false,
      priority: data.priority || "normal", // low | normal | high
      notes: data.notes || "",
      source: data.source || "manual",
      createdAt: new Date().toISOString(),
    };
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

  // --- Import / Export ----------------------------------------------------
  exportJSON() {
    return JSON.stringify(state, null, 2);
  },
  importJSON(json) {
    const parsed = JSON.parse(json);
    state = {
      members: parsed.members || [],
      events: parsed.events || [],
      todos: parsed.todos || [],
      inbox: parsed.inbox || [],
      meta: parsed.meta || { createdAt: new Date().toISOString() },
    };
    persist();
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
