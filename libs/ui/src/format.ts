/** `AED 1,240.50`: code first, a space, two decimals, comma thousands. Western numerals always. */
export function formatAED(amount: number): string {
  return `AED ${amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

/**
 * Spreads typed or pasted digits across one-time-code boxes starting at `index`. Non-digits are
 * dropped and anything past the last box is ignored. Returns the new values and the box to focus.
 */
export function fillOtpDigits(
  values: readonly string[],
  index: number,
  input: string,
  length: number,
): { values: string[]; focus: number } {
  const digits = input.replace(/\D/g, '');
  const next = Array.from({ length }, (_, i) => values[i] ?? '');
  if (digits.length === 0) {
    next[index] = '';
    return { values: next, focus: index };
  }
  for (let k = 0; k < digits.length && index + k < length; k++) next[index + k] = digits[k];
  return { values: next, focus: Math.min(index + digits.length, length - 1) };
}
