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
// Optional free fallback (e.g. "gemini") used ONLY when the primary provider is
// unavailable — out of quota / API error / no key. Lets us run a real bank-side
// check while quota lasts, then fall back to the free OCR tier instead of just
// dropping every slip to manual review.
const FALLBACK = process.env.SLIP_VERIFY_FALLBACK;

async function runProvider(
  name: string | undefined,
  file: File,
): Promise<SlipVerifyResult> {
  if (name === "easyslip") return viaEasySlip(file);
  if (name === "slipok") return viaSlipOk(file);
  if (name === "gemini") return viaGemini(file);
  return { ok: false, reason: "disabled" };
}

export async function verifySlip(file: File): Promise<SlipVerifyResult> {
  try {
    const primary = await runProvider(PROVIDER, file);
    // A success OR a `duplicate` is a DEFINITIVE answer from the real bank-side
    // check — use it as-is. NEVER fall back on `duplicate`: the real API knows
    // the slip was already used; Gemini can't, so falling back would let a
    // reused slip slip through. (transRef is also unique in the DB as a backstop.)
    if (primary.ok || primary.reason === "duplicate") return primary;
    // Primary out of quota / errored / not configured → try the free fallback.
    // We do NOT fall back on `invalid`/`timeout` — trust the real API's verdict
    // (invalid) and avoid stacking two timeouts past the serverless limit.
    if (
      FALLBACK &&
      FALLBACK !== PROVIDER &&
      (primary.reason === "error" || primary.reason === "disabled")
    ) {
      return await runProvider(FALLBACK, file);
    }
    return primary;
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
  // HTTP-level failure = provider unavailable (out of quota / rate-limited /
  // server error) → "error" so verifySlip can fall back to the free tier.
  if (!res.ok) return { ok: false, reason: "error" };
  const json = await res.json().catch(() => null);
  if (!json?.data) return { ok: false, reason: "invalid" };

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
  // log=false on purpose. With log=true SlipOK verifies the slip's receiver
  // against the ONE bank account bound to the branch (returns 1014 on mismatch)
  // and stores the slip for its own dedupe. TipTang is multi-creator — every
  // creator has a different PromptPay — so a single "main account" check is
  // wrong here. We send log=false so SlipOK just confirms the slip is a real
  // bank transaction and returns the parsed data; we then verify the amount and
  // that the receiver matches THIS creator (receiverMatches) and block reuse via
  // our own unique transRef. See the "Compare Receiver Account" section of the
  // SlipOK API Guide — this is the documented flow for log=false integrations.
  fd.set("log", "false");
  const res = await fetch(`https://api.slipok.com/api/line/apikey/${branch}`, {
    method: "POST",
    headers: { "x-authorization": key },
    body: fd,
  });
  // HTTP-level failure = provider unavailable (out of quota / rate-limited /
  // server error / bad key / wrong branch), NOT a bad slip → "error" so
  // verifySlip can fall back. Log the real cause (status + body) so a failing
  // integration is diagnosable in the server logs instead of a silent "error".
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    console.error("[slipok] HTTP", res.status, errBody.slice(0, 600));
    return { ok: false, reason: "error" };
  }
  const json = await res.json().catch(() => null);
  // SlipOK returns success:false with code 1012 when the slip was already used.
  if (!json?.success) {
    if (json?.code === 1012) return { ok: false, reason: "duplicate" };
    console.error("[slipok] not success", JSON.stringify(json)?.slice(0, 600));
    return { ok: false, reason: "invalid" };
  }
  const d = json.data ?? {};
  // One-time diagnostic during rollout — safe to remove once verified.
  console.error("[slipok] ok data", JSON.stringify(d).slice(0, 800));
  // Response shape per SlipOK API Guide v1.13: data.transRef, data.amount, and
  // the receiver nested under data.receiver — account.value for a bank account,
  // proxy.value for PromptPay (both MASKED, e.g. "xxx-x-x3109-x" / "086xxx2341").
  // Per the "Compare Receiver Account" section, match on account.value OR
  // proxy.value OR ref1; receiverMatches() strips the masking and checks last-4.
  const recv = d.receiver ?? {};
  const transRef = d.transRef;
  const amount = Number(d.amount);
  const receiverRaw = JSON.stringify({
    displayName: recv.displayName ?? "",
    name: recv.name ?? "",
    account: recv.account?.value ?? "",
    proxy: recv.proxy?.value ?? "",
    ref1: d.ref1 ?? "",
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
  // gemini-2.0-flash no longer has a free-tier quota (returns 429 limit:0);
  // the 2.5 flash family still does. Override with GEMINI_MODEL if needed.
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

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
    // API-level failure (bad key / wrong model / quota / bad request) is OUR
    // problem, not a bad slip → reason "error" (shows "couldn't verify", not
    // "not a slip"). Log the real cause so it's visible in the server logs.
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error("[gemini] HTTP", res.status, errBody.slice(0, 600));
      return { ok: false, reason: "error" };
    }
    const json = await res.json().catch(() => null);
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      console.error(
        "[gemini] no text in response",
        JSON.stringify(json)?.slice(0, 600),
      );
      return { ok: false, reason: "error" };
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      console.error("[gemini] JSON parse failed", text.slice(0, 600));
      return { ok: false, reason: "error" };
    }

    if (!data?.isSlip) {
      console.error("[gemini] isSlip=false", JSON.stringify(data).slice(0, 600));
      return { ok: false, reason: "invalid" };
    }
    const amount = Number(String(data.amount ?? "").replace(/[, ]/g, ""));
    const transRef = String(data.transRef ?? "").trim();
    if (!Number.isFinite(amount) || amount <= 0 || !transRef) {
      console.error(
        "[gemini] missing amount/transRef",
        JSON.stringify(data).slice(0, 600),
      );
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
    console.error("[gemini] fetch threw", aborted ? "ABORTED (timeout)" : err);
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
