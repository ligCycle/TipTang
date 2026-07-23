import "server-only";

/**
 * Slip verification against a Thai slip-checking provider (SlipOK / EasySlip)
 * or a vision LLM (Gemini).
 *
 * Design: FAIL-SAFE. We only ever report `ok: true` when we can positively
 * parse a verified transaction. Any doubt (provider off, network error,
 * timeout, unexpected response shape) returns `ok: false` → the caller keeps
 * the tip PENDING for manual review. We NEVER auto-confirm on uncertainty.
 *
 * Enable by setting SLIP_VERIFY_PROVIDER + the provider's key in .env.
 * NOTE: confirm the exact endpoint/field names against the provider's current
 * docs when you plug in a real key — parsing here is defensive on purpose.
 *
 * IMPORTANT re: "gemini" — this READS the slip image (OCR-style); it does NOT
 * verify the transaction against the bank, so a doctored image can pass. It is
 * a low-cost convenience tier, kept fail-safe. Use SlipOK/EasySlip for true
 * bank-side verification.
 */

export type SlipVerifyResult =
  | { ok: false; reason: "disabled" | "error" | "invalid" | "duplicate" | "timeout" }
  | { ok: true; transRef: string; amount: number; receiverRaw: string };

const PROVIDER = process.env.SLIP_VERIFY_PROVIDER; // "easyslip" | "slipok" | "gemini"

export async function verifySlip(file: File): Promise<SlipVerifyResult> {
  try {
    if (PROVIDER === "easyslip") return await viaEasySlip(file);
    if (PROVIDER === "slipok") return await viaSlipOk(file);
    if (PROVIDER === "gemini") return await viaGemini(file);
    return { ok: false, reason: "disabled" };
  } catch {
    return { ok: false, reason: "error" };
  }
}

async function viaEasySlip(file: File): Promise<SlipVerifyResult> {
  const token = process.env.EASYSLIP_API_TOKEN;
  if (!token) return { ok: false, reason: "disabled" };

  const fd = new FormData();
  fd.set("file", file);
  const res = await fetch("https://developer.easyslip.com/api/v1/verify", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.data) return { ok: false, reason: "invalid" };

  const d = json.data;
  const transRef = d.transRef ?? d.ref ?? d.transactionId;
  const amount = Number(d.amount?.amount ?? d.amount);
  const receiverRaw = JSON.stringify(d.receiver ?? {});
  if (!transRef || !Number.isFinite(amount)) return { ok: false, reason: "invalid" };
  return { ok: true, transRef: String(transRef), amount, receiverRaw };
}

async function viaSlipOk(file: File): Promise<SlipVerifyResult> {
  const key = process.env.SLIPOK_API_KEY;
  const branch = process.env.SLIPOK_BRANCH_ID;
  if (!key || !branch) return { ok: false, reason: "disabled" };

  const fd = new FormData();
  fd.set("files", file);
  fd.set("log", "true");
  const res = await fetch(`https://api.slipok.com/api/line/apikey/${branch}`, {
    method: "POST",
    headers: { "x-authorization": key },
    body: fd,
  });
  const json = await res.json().catch(() => null);
  // SlipOK returns success:false with code 1012 when the slip was already used.
  if (!json?.success) {
    if (json?.code === 1012) return { ok: false, reason: "duplicate" };
    return { ok: false, reason: "invalid" };
  }
  const d = json.data ?? {};
  const transRef = d.transRef ?? d.transRefId;
  const amount = Number(d.amount);
  const receiverRaw = JSON.stringify({
    name: d.receiverName ?? d.receiver ?? "",
    account: d.receivingBank ?? d.receiver ?? "",
  });
  if (!transRef || !Number.isFinite(amount)) return { ok: false, reason: "invalid" };
  return { ok: true, transRef: String(transRef), amount, receiverRaw };
}

/**
 * Read the slip with Gemini (vision). OCR-style extraction of amount / receiver
 * / transRef — NOT a bank-side check. Fail-safe: any uncertainty → ok:false.
 */
async function viaGemini(file: File): Promise<SlipVerifyResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: false, reason: "disabled" };
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  const prompt = [
    "You are an OCR reader for Thai bank transfer slips. Read the image and extract fields EXACTLY as shown — never guess or invent values.",
    "The receiver may be labelled: โอนไปที่, ผู้รับเงิน, เข้าบัญชี, บัญชีปลายทาง, To, Receiver, or shown as a name right after a bank logo.",
    "Thai slips often MASK the receiver, e.g. 'นาย ว*** ท***', 'xxx-x-xx123-4', '081-xxx-x123'. Strip dashes '-' and asterisks '*' and return whatever readable characters remain.",
    "receiverAccount = the receiver's account number / PromptPay phone or id, DIGITS ONLY (drop any masking).",
    "amount = the transferred amount in THB as a plain number (no commas, no currency symbol).",
    "transRef = the transaction reference / reference no. printed on the slip.",
    "If the image is NOT a bank transfer slip, set isSlip=false.",
  ].join("\n");

  // Guard against Vercel's function timeout: bail at 7s so the tip still saves
  // as PENDING instead of the whole request 504-ing.
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
                isSlip: { type: "BOOLEAN" },
                amount: { type: "NUMBER", nullable: true },
                receiverName: { type: "STRING" },
                receiverAccount: { type: "STRING" },
                transRef: { type: "STRING", nullable: true },
              },
              required: [
                "isSlip",
                "amount",
                "receiverName",
                "receiverAccount",
                "transRef",
              ],
            },
          },
        }),
      },
    );
    if (!res.ok) return { ok: false, reason: "invalid" };
    const json = await res.json().catch(() => null);
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return { ok: false, reason: "invalid" };

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return { ok: false, reason: "invalid" };
    }

    if (!data?.isSlip) return { ok: false, reason: "invalid" };
    const amount = Number(String(data.amount ?? "").replace(/[, ]/g, ""));
    const transRef = String(data.transRef ?? "").trim();
    if (!Number.isFinite(amount) || amount <= 0 || !transRef) {
      return { ok: false, reason: "invalid" };
    }
    // Stuff both name + account digits so receiverMatches (last-4) can find it.
    const receiverRaw = JSON.stringify({
      name: String(data.receiverName ?? ""),
      account: String(data.receiverAccount ?? ""),
    });
    return { ok: true, transRef, amount, receiverRaw };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return { ok: false, reason: aborted ? "timeout" : "error" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Best-effort receiver check: the creator's PromptPay id last-4 digits should
 * appear in the (usually masked) receiver info. If we can't confirm the money
 * went to THIS creator, we don't auto-confirm (caller keeps it PENDING).
 */
export function receiverMatches(
  promptpayId: string | null | undefined,
  receiverRaw: string,
): boolean {
  const digits = (promptpayId ?? "").replace(/\D/g, "");
  if (digits.length < 4) return false;
  const recvDigits = receiverRaw.replace(/\D/g, "");
  return recvDigits.includes(digits.slice(-4));
}
