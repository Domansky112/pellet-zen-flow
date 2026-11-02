const SYSTEM_NOTE_PATTERNS = [
  /^powtórne zamówienie \(duplikat leada [0-9a-f-]+\)$/i,
  /^nowe zgłoszenie z modułu kurniki$/i,
];

/** true, gdy tekst to znak systemowy (albo jest pusty), a nie notatka wpisana przez użytkownika. */
export function isSystemLeadNote(value: unknown): boolean {
  const v = String(value ?? "").trim();
  if (!v) return true;
  return SYSTEM_NOTE_PATTERNS.some((re) => re.test(v));
}

/** Notatka naprawdę wpisana przez użytkownika; znaki systemowe zwracane są jako pusty tekst. */
export function realLeadNote(value: unknown): string {
  const v = String(value ?? "").trim();
  return isSystemLeadNote(v) ? "" : v;
}
