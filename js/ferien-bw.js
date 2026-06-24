// ferien-bw.js — Schulferien Baden-Württemberg, fest hinterlegt (offline).
// Quelle: Kultusministerium Baden-Württemberg. "end" ist INKLUSIV, also der
// letzte Ferientag (Schule startet am Folgetag wieder).
//
// HINWEIS: Diese Daten bitte gegen die amtliche Veröffentlichung prüfen und
// bei Bedarf hier korrigieren — die Liste ist die einzige Stelle, die dafür
// angepasst werden muss.
export const SCHULFERIEN_BW = [
  // Schuljahr 2025/2026
  { name: "Herbstferien", start: "2025-10-27", end: "2025-10-31" },
  { name: "Weihnachtsferien", start: "2025-12-22", end: "2026-01-05" },
  { name: "Osterferien", start: "2026-03-30", end: "2026-04-10" },
  { name: "Pfingstferien", start: "2026-05-26", end: "2026-06-06" },
  { name: "Sommerferien", start: "2026-07-30", end: "2026-09-12" },
  // Schuljahr 2026/2027
  { name: "Herbstferien", start: "2026-10-26", end: "2026-10-31" },
  { name: "Weihnachtsferien", start: "2026-12-23", end: "2027-01-09" },
  { name: "Osterferien", start: "2027-03-29", end: "2027-04-10" },
  { name: "Pfingstferien", start: "2027-05-18", end: "2027-05-29" },
  { name: "Sommerferien", start: "2027-07-29", end: "2027-09-11" },
];

// Liefert die Ferien, in denen das ISO-Datum liegt (oder null).
// ISO-Strings "YYYY-MM-DD" lassen sich direkt lexikografisch vergleichen.
export function holidayOn(iso) {
  return SCHULFERIEN_BW.find((h) => iso >= h.start && iso <= h.end) || null;
}

// Liefert die nächsten (und gerade laufenden) Ferien ab fromISO.
export function upcomingHolidays(fromISO, limit = 4) {
  return SCHULFERIEN_BW.filter((h) => h.end >= fromISO).slice(0, limit);
}
