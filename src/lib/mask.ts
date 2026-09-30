/**
 * Show just enough of a payout destination for its owner to recognise it in
 * an email: "0812345678" → "•••5678", a PayPal handle → "ti•••".
 */
export function maskPayout(value: string | null | undefined): string {
  if (!value) return "—";
  if (/^\d+$/.test(value)) return `•••${value.slice(-4)}`;
  return `${value.slice(0, 2)}•••`;
}
