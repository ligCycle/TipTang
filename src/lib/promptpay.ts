import "server-only";
import generatePayload from "promptpay-qr";
import QRCode from "qrcode";

/**
 * Build a PromptPay EMVCo payload for the given target (phone number or
 * national/tax id) and amount, then render it as a PNG data URL.
 *
 * SECURITY (PDPA): the `target` (creator's PromptPay id) must only ever be
 * read server-side from the database — never accept it from the client.
 */
export async function generatePromptPayQr(target: string, amount: number) {
  const payload = generatePayload(target, { amount });
  const dataUrl = await QRCode.toDataURL(payload, {
    margin: 1,
    width: 480,
    errorCorrectionLevel: "M",
  });
  return { payload, dataUrl };
}
