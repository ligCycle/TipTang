import "server-only";

/**
 * Slip verification against a Thai slip-checking provider (SlipOK / EasySlip).
 *
 * Design: FAIL-SAFE. We only ever report `ok: true` when we can positively
 * parse a verified transaction. Any doubt (provider off, network error,
 * unexpected response shape) returns `ok: false` → the caller keeps the tip
 * PENDING for manual review. We NEVER auto-confirm on uncertainty.
 *
 * Enable by setting SLIP_VERIFY_PROVIDER + the provider's key in .env.
 * NOTE: confirm the exact endpoint/field names against the provider's current
 * docs when you plug in a real key — parsing here is defensive on purpose.
 */

export type SlipVerifyResult =
  | { ok: false; reason: "disabled" | "error" | "invalid" | "duplicate" }
  | { ok: true; transRef: string; amount: number; receiverRaw: string };

const PROVIDER = process.env.SLIP_VERIFY_PROVIDER; // "easyslip" | "slipok"

export async function verifySlip(file: File): Promise<SlipVerifyResult> {
  try {
    if (PROVIDER === "easyslip") return await viaEasySlip(file);
    if (PROVIDER === "slipok") return await viaSlipOk(file);
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
