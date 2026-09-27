/**
 * PayPal helpers — pure, no DB/network, run under `node --test`.
 *
 * TipTang never touches PayPal money: we only render the creator's PayPal.me
 * link and read the receipt screenshot the supporter uploads. Amounts stay in
 * THB (the link carries "<amount>THB"; PayPal converts on the payer's side).
 */

const HANDLE = /^[A-Za-z0-9]{1,20}$/;

/** null = cleared, string = valid handle, "invalid" = reject the save. */
export function normalizePaypalHandle(input: string): string | null | "invalid" {
  let s = input.trim();
  if (!s) return null;
  if (s.startsWith("@")) s = s.slice(1);
  if (/[/.]/.test(s)) {
    const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
    let url: URL;
    try {
      url = new URL(withScheme);
    } catch {
      return "invalid";
    }
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const parts = url.pathname.split("/").filter(Boolean);
    if (host === "paypal.me") s = parts[0] ?? "";
    else if (host === "paypal.com" && parts[0]?.toLowerCase() === "paypalme") {
      s = parts[1] ?? "";
    } else return "invalid";
  }
  return HANDLE.test(s) ? s : "invalid";
}

export function paypalLink(handle: string, amountThb: number): string {
  return `https://paypal.me/${encodeURIComponent(handle)}/${Math.round(amountThb)}THB`;
}

/** LLMs sometimes wrap JSON in markdown code fences even in JSON mode. */
export function stripJsonFences(text: string): string {
  return text
    .trim()
    .replace(/^`{3}[a-zA-Z]*\s*\n?/, "")
    .replace(/\n?\s*`{3}$/, "")
    .trim();
}

export type PaypalRead =
  | { kind: "disabled" }
  | { kind: "error" }
  | {
      kind: "ok";
      isPaypalReceipt: boolean;
      completed: boolean;
      status: string;
      amount: number | null;
      currency: string;
      recipient: string;
      transactionId: string;
    };

export type PaypalVerdict = {
  verifyCode: string | null;
  verifyDetail: string | null;
  transRef: string | null;
};

const thb = new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" });

/**
 * Turn what Gemini read into the dashboard flag. Never auto-confirms — the
 * caller keeps PayPal tips PENDING whatever this says. Recipient is detail
 * only: receipts show a display name, not the PayPal.me handle.
 */
export function judgePaypalReceipt(
  read: PaypalRead,
  expectedAmountThb: number,
): PaypalVerdict {
  if (read.kind === "disabled") {
    return { verifyCode: null, verifyDetail: null, transRef: null };
  }
  if (read.kind === "error") {
    return { verifyCode: "unreadable", verifyDetail: null, transRef: null };
  }
  if (!read.isPaypalReceipt) {
    return { verifyCode: "notslip", verifyDetail: null, transRef: null };
  }

  const id = read.transactionId.trim().toUpperCase();
  const transRef = id ? `PP:${id}` : null;

  if (!read.completed) {
    return { verifyCode: "pp_pending", verifyDetail: read.status || null, transRef };
  }
  if (read.amount === null || !Number.isFinite(read.amount)) {
    return { verifyCode: "unreadable", verifyDetail: null, transRef };
  }
  const currency = read.currency.trim().toUpperCase();
  if (currency !== "THB") {
    return { verifyCode: "pp_currency", verifyDetail: `${read.amount} ${currency}`, transRef };
  }
  if (Math.abs(read.amount - expectedAmountThb) <= 1) {
    return { verifyCode: "match", verifyDetail: read.recipient || null, transRef };
  }
  return { verifyCode: "amount", verifyDetail: thb.format(read.amount), transRef };
}
