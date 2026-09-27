/**
 * PromptPay id check — pure, shared by the settings form and the API.
 *
 * Accepted: a Thai mobile number (10 digits, starts with 0) or a Thai
 * national id (13 digits, first digit 1–8) whose last digit matches the
 * official checksum:
 * sum(digit[i] * (13 - i)) for i = 0..11, check = (11 - sum % 11) % 10.
 * The checksum catches most typos in a 13-digit id, which would otherwise
 * produce a QR that no bank can pay.
 */
export function isValidPromptpayId(id: string): boolean {
  if (/^0\d{9}$/.test(id)) return true;
  // First digit is the person type, 1–8 — an id never starts with 0 or 9.
  if (!/^[1-8]\d{12}$/.test(id)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(id[i]) * (13 - i);
  return (11 - (sum % 11)) % 10 === Number(id[12]);
}
