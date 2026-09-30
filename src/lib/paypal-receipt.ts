import "server-only";
import { stripJsonFences, type PaypalRead } from "@/lib/paypal";

/**
 * Read a PayPal payment-confirmation screenshot with Gemini. Level-1 check
 * only: it reads the image, it does NOT ask PayPal whether money moved, so a
 * doctored screenshot can pass — which is why PayPal tips are never
 * auto-confirmed. Same env and 7 s budget as the bank-slip reader. Never
 * throws: every failure becomes { kind: "error" } (→ "unreadable" flag).
 */
export async function readPaypalReceipt(file: File): Promise<PaypalRead> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { kind: "disabled" };
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  const prompt = [
    "You read screenshots of PayPal payment confirmations or PayPal activity details. Extract fields EXACTLY as shown — never guess.",
    "isPaypalReceipt = true only if this is a PayPal payment confirmation / receipt / transaction detail.",
    "completed = true only if the payment is shown as sent/completed (not pending, refunded, failed or cancelled). status = the status text as shown.",
    "amount = the amount the RECIPIENT is paid, as a plain number. currency = its 3-letter ISO code (THB, USD, EUR...). If several amounts are shown, prefer the one in THB.",
    "recipient = the name the money was sent to. transactionId = the PayPal transaction ID if shown, else empty string.",
  ].join("\n");

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 7000);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { inline_data: { mime_type: file.type, data: base64 } },
                { text: prompt },
              ],
            },
          ],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                isPaypalReceipt: { type: "BOOLEAN" },
                completed: { type: "BOOLEAN" },
                status: { type: "STRING" },
                amount: { type: "NUMBER", nullable: true },
                currency: { type: "STRING" },
                recipient: { type: "STRING" },
                transactionId: { type: "STRING" },
              },
              required: [
                "isPaypalReceipt",
                "completed",
                "status",
                "amount",
                "currency",
                "recipient",
                "transactionId",
              ],
            },
          },
        }),
      },
    );
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error("[paypal-receipt] HTTP", res.status, errBody.slice(0, 600));
      return { kind: "error" };
    }
    const json = await res.json().catch(() => null);
    const text: unknown = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== "string") return { kind: "error" };

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(stripJsonFences(text));
    } catch {
      // The model's text is a transcription of the receipt — log its size only.
      console.error("[paypal-receipt] JSON parse failed, length", text.length);
      return { kind: "error" };
    }
    // responseSchema types amount as NUMBER, so this is normally already a
    // number; the string clean-up is a fallback for "1,000"-style text only.
    // European "1.000,50" would misparse — acceptable while links are THB.
    const amountNum = Number(String(data.amount ?? "").replace(/[, ]/g, ""));
    const hasAmount =
      data.amount !== null && data.amount !== undefined && Number.isFinite(amountNum);
    return {
      kind: "ok",
      isPaypalReceipt: data.isPaypalReceipt === true,
      completed: data.completed === true,
      status: String(data.status ?? ""),
      amount: hasAmount ? amountNum : null,
      currency: String(data.currency ?? ""),
      recipient: String(data.recipient ?? ""),
      transactionId: String(data.transactionId ?? ""),
    };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    console.error("[paypal-receipt] fetch threw", aborted ? "ABORTED (timeout)" : err);
    return { kind: "error" };
  } finally {
    clearTimeout(timer);
  }
}
