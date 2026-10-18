/** Dirhams as typed ("12.5", "12,50", "") to fils; empty is 0; anything else is null. */
export function filsFromAed(text: string): number | null {
  const value = text.trim().replace(',', '.');
  if (value === '') return 0;
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(value)) return null;
  return Math.round(Number(value) * 100);
}

/** Fils back to what the field shows: "" for none, "10" or "12.50". */
export const aedText = (fils: number | undefined | null) =>
  fils ? (fils / 100).toFixed(fils % 100 === 0 ? 0 : 2) : '';
