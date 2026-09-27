# PayPal Tips + Wallet Hint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let creators add an optional PayPal.me for overseas supporters (money goes straight to the creator, receipt read by Gemini, always manually confirmed) and tell PromptPay payers plainly which apps can scan the QR.

**Architecture:** One migration (`User.paypalHandle`, `Tip.paymentMethod`). Pure helpers in `src/lib/paypal.ts` (handle normalisation, link, JSON-fence stripping, receipt judging) with unit tests; a Gemini reader in `src/lib/paypal-receipt.ts`. `POST /api/tips` skips the bank verifier for PayPal and forces PENDING. `TipForm` gets a method switch and a PayPal pay panel; the dashboard shows a PayPal badge and new verdict labels.

**Tech Stack:** Next.js 16 App Router, Prisma 7 + PostgreSQL (production DB used locally), next-intl, Tailwind v4, Gemini REST (`generateContent`), `node --test` via `npm test`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-27-paypal-and-wallet-hints-design.md`.
- Migration is hand-written SQL; `npx prisma migrate deploy` runs **only after the founder says so**, then `npx prisma generate`.
- Never push; the founder says "merge push".
- ESLint stays at exactly 5 pre-existing `react-hooks/set-state-in-effect` errors.
- All tip amounts stay THB (`Tip.currency` untouched). PayPal link format: `https://paypal.me/<handle>/<amount>THB`.
- PayPal tips: never call `verifySlip`; `status` always `PENDING`, `autoVerified` false, even when `autoConfirmTips` is on.
- Duplicate key for PayPal: `transRef = "PP:" + transactionId.trim().toUpperCase()`.
- Gemini reply: `responseMimeType: "application/json"` **and** `stripJsonFences()` before `JSON.parse`; parse failure → verdict `"unreadable"`, never a throw.
- Handle regex `^[A-Za-z0-9]{1,20}$`. Brand names as plain text only (no logos).
- Thai copy uses "โดเนท". Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Write source files with the Write/Edit tools or Python scripts — Bash heredocs break on `'`.

---

## File structure

| File | Responsibility |
|---|---|
| `prisma/schema.prisma`, `prisma/migrations/20260927000000_add_paypal/migration.sql` | new columns + enum |
| `src/lib/paypal.ts` + `src/lib/paypal.test.ts` | pure helpers (no server-only, runs under node --test) |
| `src/lib/paypal-receipt.ts` | Gemini call → `PaypalRead` |
| `src/lib/validators.ts`, `src/app/api/profile/route.ts` | accept + normalise `paypalHandle` |
| `src/components/SettingsForm.tsx`, `src/app/[locale]/dashboard/settings/page.tsx` | settings field |
| `src/app/api/tips/route.ts` | PayPal branch |
| `src/components/PaypalPayPanel.tsx` (new), `src/components/TipForm.tsx`, `src/app/[locale]/[username]/page.tsx` | donate UI |
| `src/components/TipRow.tsx`, `src/app/[locale]/dashboard/page.tsx` | dashboard badges |
| `messages/th.json`, `messages/en.json` | copy (one script, Task 4) |

---

### Task 1: Schema + migration

**Files:** Modify `prisma/schema.prisma`; Create `prisma/migrations/20260927000000_add_paypal/migration.sql`

**Interfaces:** Produces `User.paypalHandle: string | null`, `enum PaymentMethod { PROMPTPAY PAYPAL }`, `Tip.paymentMethod: PaymentMethod` (default PROMPTPAY).

- [ ] **Step 1: Schema.** After the `enum TimerEffect { … }` block add:

```prisma
// How a supporter paid. PROMPTPAY = the Thai QR (default, every old tip);
// PAYPAL = the creator's PayPal.me, for supporters abroad.
enum PaymentMethod {
  PROMPTPAY
  PAYPAL
}
```

In `model User`, directly after `promptpayId  String?` add:

```prisma
  // PayPal.me name only (no URL), for overseas supporters. Null = PayPal off.
  // Public on purpose: it is rendered as a paypal.me link on the donate page.
  paypalHandle String?
```

In `model Tip`, directly after `timerEffect     TimerEffect @default(ADD)` add:

```prisma
  paymentMethod   PaymentMethod @default(PROMPTPAY)
```

- [ ] **Step 2: Migration SQL**

```sql
-- PayPal for overseas supporters.
CREATE TYPE "PaymentMethod" AS ENUM ('PROMPTPAY', 'PAYPAL');
ALTER TABLE "User" ADD COLUMN "paypalHandle" TEXT;
ALTER TABLE "Tip" ADD COLUMN "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'PROMPTPAY';
```

- [ ] **Step 3:** `npx prisma generate` → "Generated Prisma Client"; `npx tsc --noEmit` → clean.
- [ ] **Step 4: Commit** `git add prisma/schema.prisma prisma/migrations/20260927000000_add_paypal/migration.sql && git commit -m "Schema: User.paypalHandle + Tip.paymentMethod"` (+ Co-Authored-By line). Do **not** run `migrate deploy` (Task 8).

---

### Task 2: Pure helpers `src/lib/paypal.ts`

**Files:** Create `src/lib/paypal.ts`, `src/lib/paypal.test.ts`

**Interfaces — Produces:**
```ts
export function normalizePaypalHandle(input: string): string | null | "invalid";
export function paypalLink(handle: string, amountThb: number): string;
export function stripJsonFences(text: string): string;
export type PaypalRead =
  | { kind: "disabled" }
  | { kind: "error" }
  | { kind: "ok"; isPaypalReceipt: boolean; completed: boolean; status: string;
      amount: number | null; currency: string; recipient: string; transactionId: string };
export type PaypalVerdict = { verifyCode: string | null; verifyDetail: string | null; transRef: string | null };
export function judgePaypalReceipt(read: PaypalRead, expectedAmountThb: number): PaypalVerdict;
```
`normalizePaypalHandle` returns `null` for empty input (clear), the handle when valid, `"invalid"` otherwise.

- [ ] **Step 1: Failing tests** — create `src/lib/paypal.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizePaypalHandle,
  paypalLink,
  stripJsonFences,
  judgePaypalReceipt,
  type PaypalRead,
} from "./paypal.ts";

test("normalizePaypalHandle accepts names and paypal.me / paypal.com URLs", () => {
  for (const input of [
    "LigStream",
    "@LigStream",
    " paypal.me/LigStream ",
    "https://www.paypal.me/LigStream/10",
    "https://paypal.me/LigStream?locale.x=th_TH",
    "https://www.paypal.com/paypalme/LigStream",
  ]) {
    assert.equal(normalizePaypalHandle(input), "LigStream", input);
  }
  assert.equal(normalizePaypalHandle(""), null);
  assert.equal(normalizePaypalHandle("   "), null);
  assert.equal(normalizePaypalHandle("bad name!"), "invalid");
  assert.equal(normalizePaypalHandle("a".repeat(21)), "invalid");
  assert.equal(normalizePaypalHandle("https://evil.com/LigStream"), "invalid");
});

test("paypalLink puts a whole-baht THB amount in the path", () => {
  assert.equal(paypalLink("LigStream", 300), "https://paypal.me/LigStream/300THB");
});

test("stripJsonFences removes markdown fences and whitespace", () => {
  const json = '{"a":1}';
  assert.equal(stripJsonFences(json), json);
  assert.equal(stripJsonFences("```json\n" + json + "\n```"), json);
  assert.equal(stripJsonFences("```\n" + json + "\n```"), json);
  assert.equal(stripJsonFences("  \n```JSON\n" + json + "\n```  \n"), json);
});

const ok = (over: Partial<Extract<PaypalRead, { kind: "ok" }>> = {}): PaypalRead => ({
  kind: "ok",
  isPaypalReceipt: true,
  completed: true,
  status: "Completed",
  amount: 300,
  currency: "THB",
  recipient: "Lig Stream",
  transactionId: "9AB12345CD6789012",
  ...over,
});

test("judgePaypalReceipt maps every case to a verdict", () => {
  assert.deepEqual(judgePaypalReceipt({ kind: "disabled" }, 300), {
    verifyCode: null, verifyDetail: null, transRef: null,
  });
  assert.deepEqual(judgePaypalReceipt({ kind: "error" }, 300), {
    verifyCode: "unreadable", verifyDetail: null, transRef: null,
  });
  assert.equal(judgePaypalReceipt(ok({ isPaypalReceipt: false }), 300).verifyCode, "notslip");
  const pending = judgePaypalReceipt(ok({ completed: false, status: "Pending" }), 300);
  assert.equal(pending.verifyCode, "pp_pending");
  assert.equal(pending.verifyDetail, "Pending");
  assert.deepEqual(judgePaypalReceipt(ok(), 300), {
    verifyCode: "match", verifyDetail: "Lig Stream", transRef: "PP:9AB12345CD6789012",
  });
  assert.equal(judgePaypalReceipt(ok({ amount: 301 }), 300).verifyCode, "match"); // ±1 baht
  assert.equal(judgePaypalReceipt(ok({ amount: 299 }), 300).verifyCode, "match");
  const wrong = judgePaypalReceipt(ok({ amount: 250 }), 300);
  assert.equal(wrong.verifyCode, "amount");
  assert.match(wrong.verifyDetail ?? "", /250/);
  const usd = judgePaypalReceipt(ok({ amount: 8.5, currency: "usd" }), 300);
  assert.equal(usd.verifyCode, "pp_currency");
  assert.equal(usd.verifyDetail, "8.5 USD");
  assert.equal(judgePaypalReceipt(ok({ amount: null }), 300).verifyCode, "unreadable");
});

test("transaction ids are normalised so the same receipt collides", () => {
  const a = judgePaypalReceipt(ok({ transactionId: " 9ab12345cd6789012 " }), 300);
  const b = judgePaypalReceipt(ok({ transactionId: "9AB12345CD6789012" }), 300);
  assert.equal(a.transRef, b.transRef);
  assert.equal(judgePaypalReceipt(ok({ transactionId: "" }), 300).transRef, null);
});
```

- [ ] **Step 2:** `node --test src/lib/paypal.test.ts` → FAIL (`Cannot find module './paypal.ts'`).

- [ ] **Step 3: Implement** `src/lib/paypal.ts`:

```ts
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
    else if (host === "paypal.com" && parts[0]?.toLowerCase() === "paypalme") s = parts[1] ?? "";
    else return "invalid";
  }
  return HANDLE.test(s) ? s : "invalid";
}

export function paypalLink(handle: string, amountThb: number): string {
  return `https://paypal.me/${encodeURIComponent(handle)}/${Math.round(amountThb)}THB`;
}

/** LLMs sometimes wrap JSON in ```json fences even in JSON mode. */
export function stripJsonFences(text: string): string {
  return text
    .trim()
    .replace(/^```[a-zA-Z]*\s*\n?/, "")
    .replace(/\n?\s*```$/, "")
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
export function judgePaypalReceipt(read: PaypalRead, expectedAmountThb: number): PaypalVerdict {
  if (read.kind === "disabled") return { verifyCode: null, verifyDetail: null, transRef: null };
  if (read.kind === "error") return { verifyCode: "unreadable", verifyDetail: null, transRef: null };
  if (!read.isPaypalReceipt) return { verifyCode: "notslip", verifyDetail: null, transRef: null };

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
```

- [ ] **Step 4:** `node --test src/lib/paypal.test.ts` → `pass 5`, `fail 0`.
- [ ] **Step 5: Commit** `git add src/lib/paypal.ts src/lib/paypal.test.ts && git commit -m "PayPal helpers: handle, link, fence-tolerant JSON, receipt verdicts"`.

---

### Task 3: Gemini receipt reader `src/lib/paypal-receipt.ts`

**Files:** Create `src/lib/paypal-receipt.ts`

**Interfaces:** Consumes `PaypalRead`, `stripJsonFences` (Task 2). Produces `export async function readPaypalReceipt(file: File): Promise<PaypalRead>` — never throws.

- [ ] **Step 1: Create the file**

```ts
import "server-only";
import { stripJsonFences, type PaypalRead } from "@/lib/paypal";

/**
 * Read a PayPal payment-confirmation screenshot with Gemini. Level-1 check
 * only: it reads the image, it does NOT ask PayPal whether money moved, so a
 * doctored screenshot can pass — which is why PayPal tips are never
 * auto-confirmed. Same env and 7 s budget as the bank-slip reader.
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
      console.error("[paypal-receipt] HTTP", res.status, (await res.text().catch(() => "")).slice(0, 600));
      return { kind: "error" };
    }
    const json = await res.json().catch(() => null);
    const text: unknown = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== "string") return { kind: "error" };

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(stripJsonFences(text));
    } catch {
      console.error("[paypal-receipt] JSON parse failed", text.slice(0, 600));
      return { kind: "error" };
    }
    const amountNum = Number(String(data.amount ?? "").replace(/[, ]/g, ""));
    return {
      kind: "ok",
      isPaypalReceipt: data.isPaypalReceipt === true,
      completed: data.completed === true,
      status: String(data.status ?? ""),
      amount: data.amount === null || data.amount === undefined || !Number.isFinite(amountNum) ? null : amountNum,
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
```

- [ ] **Step 2:** `npx tsc --noEmit && npx eslint src/lib/paypal-receipt.ts` → clean.
- [ ] **Step 3: Commit** `git add src/lib/paypal-receipt.ts && git commit -m "PayPal receipt reader (Gemini, level-1, never throws)"`.

---

### Task 4: Copy (all i18n keys, both locales)

**Files:** Modify `messages/th.json`, `messages/en.json` via a scratchpad Python script.

**Produces keys:** `settings.paypalHandle`, `settings.paypalHint`, `settings.paypalInvalid`; `profile.methodPromptpay`, `profile.methodPaypal`, `profile.payAppBanks`, `profile.payNoBank`, `profile.paypalPay`, `profile.paypalNote`, `profile.paypalUpload`, `profile.paypalNotEnabled`; `dashboard.paypalBadge`, `dashboard.viewReceipt`, `dashboard.verifyPpPending`, `dashboard.verifyPpCurrency`; terms `s5Body` gains one sentence.

- [ ] **Step 1: Write and run** `scratchpad/i18n-paypal.py` (run with `PYTHONIOENCODING=utf-8 python`):

```python
import io, json, os
os.chdir(r"C:\Users\ggtan\OneDrive\เดสก์ท็อป\pro")

def ins_after_first(s, key_line, block):
    i = s.index(key_line); j = s.index("\n", i) + 1
    return s[:j] + block + s[j:]

def lines(d):
    return "".join(f'    {json.dumps(k, ensure_ascii=False)}: {json.dumps(v, ensure_ascii=False)},\n' for k, v in d.items())

COPY = {
  "th": dict(
    settings={"paypalHandle": "PayPal.me (ไม่บังคับ)",
              "paypalHint": "สำหรับคนดูต่างประเทศ · PayPal หักค่าธรรมเนียมจากยอดที่คุณได้รับ (ประมาณ 4–5% + ค่าแลกเงิน) · ทิปผ่าน PayPal ต้องกดยืนยันเองทุกครั้ง",
              "paypalInvalid": "ชื่อ PayPal.me ไม่ถูกต้อง — ใช้ตัวอักษรอังกฤษหรือตัวเลข ไม่เกิน 20 ตัว"},
    profile={"methodPromptpay": "พร้อมเพย์ (ในไทย)",
             "methodPaypal": "PayPal (ต่างประเทศ)",
             "payAppBanks": "แอปธนาคารทุกธนาคาร",
             "payNoBank": "ไม่ต้องมีบัญชีธนาคารก็โดเนทได้",
             "paypalPay": "จ่าย {amount} ผ่าน PayPal",
             "paypalNote": "ยอดจะแปลงเป็นสกุลเงินของคุณในหน้า PayPal · PayPal อาจมียอดขั้นต่ำของตัวเองสำหรับการโอนข้ามประเทศ",
             "paypalUpload": "แนบภาพหน้าจอยืนยันการชำระเงินของ PayPal",
             "paypalNotEnabled": "ครีเอเตอร์ยังไม่ได้เปิดรับ PayPal"},
    dashboard={"paypalBadge": "PayPal",
               "viewReceipt": "ดูใบเสร็จ",
               "verifyPpPending": "PayPal: ยังไม่สำเร็จ",
               "verifyPpCurrency": "PayPal: ยอด {detail} ตรวจเอง"},
    terms=" การชำระเงินผ่าน PayPal เป็นธุรกรรมระหว่างผู้สนับสนุนกับครีเอเตอร์บน PayPal โดยตรง TipTang ไม่ได้รับเงินและไม่สามารถคืนเงินแทนได้",
  ),
  "en": dict(
    settings={"paypalHandle": "PayPal.me (optional)",
              "paypalHint": "For supporters abroad · PayPal deducts its fees from what you receive (about 4–5% + currency conversion) · PayPal tips always need your manual confirmation",
              "paypalInvalid": "Invalid PayPal.me name — English letters or digits, up to 20 characters"},
    profile={"methodPromptpay": "PromptPay (Thailand)",
             "methodPaypal": "PayPal (abroad)",
             "payAppBanks": "Any Thai bank app",
             "payNoBank": "No bank account needed to tip",
             "paypalPay": "Pay {amount} with PayPal",
             "paypalNote": "PayPal converts the amount to your currency · PayPal may have its own minimum for international payments",
             "paypalUpload": "Attach a screenshot of the PayPal payment confirmation",
             "paypalNotEnabled": "This creator hasn't enabled PayPal"},
    dashboard={"paypalBadge": "PayPal",
               "viewReceipt": "View receipt",
               "verifyPpPending": "PayPal: not completed",
               "verifyPpCurrency": "PayPal: {detail}, check manually"},
    terms=" Payments made through PayPal are between the supporter and the creator on PayPal; TipTang does not receive them and cannot refund them.",
  ),
}

for loc, c in COPY.items():
    p = f"messages/{loc}.json"
    s = io.open(p, encoding="utf-8").read()
    s = ins_after_first(s, '    "promptpayHint":', lines(c["settings"]))
    s = ins_after_first(s, '    "payAnyApp":', lines(c["profile"]))   # first = profile namespace
    s = ins_after_first(s, '    "viewSlip":', lines(c["dashboard"]))  # first = dashboard namespace
    # terms s5Body is the LAST "s5Body" (privacy has one earlier)
    i = s.rindex('    "s5Body": "'); j = s.index('",\n', i)
    s = s[:j] + c["terms"] + s[j:]
    json.loads(s)
    io.open(p, "w", encoding="utf-8", newline="\n").write(s)
    print(p, "ok")
```

- [ ] **Step 2:** Verify: `grep -n '"paypalBadge"\|"methodPaypal"\|"paypalHint"' messages/th.json messages/en.json` shows one hit per file per key; `grep -c "PayPal เป็นธุรกรรม" messages/th.json` → 1.
- [ ] **Step 3: Commit** `git add messages/th.json messages/en.json && git commit -m "Copy: PayPal settings, donate switch, wallet chips, dashboard labels, terms line"`.

---

### Task 5: Settings — save `paypalHandle`

**Files:** Modify `src/lib/validators.ts`, `src/app/api/profile/route.ts`, `src/components/SettingsForm.tsx`, `src/app/[locale]/dashboard/settings/page.tsx`

**Interfaces:** Consumes `normalizePaypalHandle` (Task 2), keys from Task 4. `PATCH /api/profile` accepts `paypalHandle?: string`, returns `{ ok: true, paypalHandle: string | null }` or `400 { error: "invalid_paypal" }`.

- [ ] **Step 1: Schema.** In `profileSchema`, after the `minTipAmount` line add:

```ts
  // Raw input (name or paypal.me URL); normalised in the route.
  paypalHandle: z.string().trim().max(200).optional().or(z.literal("")),
```

- [ ] **Step 2: Route.** In `src/app/api/profile/route.ts`: import `import { normalizePaypalHandle } from "@/lib/paypal";`; add `paypalHandle,` to the destructuring of `parsed.data`; right after the destructuring add:

```ts
  // undefined = field not sent (leave as is); null = cleared.
  const paypal =
    paypalHandle === undefined ? undefined : normalizePaypalHandle(paypalHandle);
  if (paypal === "invalid") {
    return NextResponse.json({ error: "invalid_paypal" }, { status: 400 });
  }
```

In the `prisma.user.update` `data`, after the `minTipAmount` spread add `...(paypal === undefined ? {} : { paypalHandle: paypal }),`. Change the final return to `return NextResponse.json({ ok: true, paypalHandle: paypal ?? null });`.

- [ ] **Step 3: SettingsForm.**
  1. `type Initial`: add `paypalHandle: string;` after `promptpayId: string;`.
  2. `snapshot()`: add `paypalHandle: f.paypalHandle,` after `promptpayId: f.promptpayId,`.
  3. After the PromptPay `<label>…</label>` block (the one ending with `{t("promptpayHint")}</span></label>`) insert:

```tsx
          <label className="block">
            <span className={labelClass}>{t("paypalHandle")}</span>
            <input
              value={form.paypalHandle}
              onChange={update("paypalHandle")}
              placeholder="paypal.me/yourname"
              className={inputClass}
              autoCapitalize="off"
              spellCheck={false}
            />
            <span className={hintClass}>{t("paypalHint")}</span>
          </label>
```

  4. In `onSubmit`, replace the error mapping `data.error === "username_taken" ? t("errorUsernameTaken") : tc("loading")` with:

```tsx
          data.error === "username_taken"
            ? t("errorUsernameTaken")
            : data.error === "invalid_paypal"
              ? t("paypalInvalid")
              : tc("loading"),
```

  5. Replace `setSavedForm(form);` in the success path with:

```tsx
      // Show the stored (normalised) handle, e.g. a pasted URL becomes the name.
      const saved = await res.json().catch(() => ({}));
      const next = { ...form, paypalHandle: saved.paypalHandle ?? "" };
      setForm(next);
      setSavedForm(next);
```

  (`update("paypalHandle")` works because `update` is keyed by `Initial`'s string fields — check the helper's type and extend it if it enumerates keys.)

- [ ] **Step 4: Settings page.** In `src/app/[locale]/dashboard/settings/page.tsx` add `paypalHandle: true,` to the user `select` and `paypalHandle: user.paypalHandle ?? "",` to `initial`.
- [ ] **Step 5:** `npx tsc --noEmit && npx eslint src/components/SettingsForm.tsx src/app/api/profile/route.ts src/lib/validators.ts` → clean.
- [ ] **Step 6: Commit** `git add src/lib/validators.ts src/app/api/profile/route.ts src/components/SettingsForm.tsx "src/app/[locale]/dashboard/settings/page.tsx" && git commit -m "Settings: optional PayPal.me handle, normalised on save"`.

---

### Task 6: `POST /api/tips` PayPal branch

**Files:** Modify `src/app/api/tips/route.ts`

**Interfaces:** Consumes `readPaypalReceipt` (Task 3), `judgePaypalReceipt` (Task 2), `Tip.paymentMethod` (Task 1). New error `400 { error: "paypal_not_enabled" }`.

- [ ] **Step 1: Imports.** Change `import { verifySlip, receiverMatches } from "@/lib/slip-verify";` to `import { verifySlip, receiverMatches, type SlipVerifyResult } from "@/lib/slip-verify";` and add:

```ts
import { judgePaypalReceipt } from "@/lib/paypal";
import { readPaypalReceipt } from "@/lib/paypal-receipt";
```

- [ ] **Step 2:** Add `paypalHandle: true,` to the creator `select`.
- [ ] **Step 3: Parse the method.** Directly after the `timerEffect` validation block (the one returning `reduce_not_allowed`) insert:

```ts
  // PAYPAL only when the creator has a PayPal.me; anything else is PromptPay.
  const paymentMethod: "PROMPTPAY" | "PAYPAL" =
    form.get("paymentMethod") === "PAYPAL" ? "PAYPAL" : "PROMPTPAY";
  if (paymentMethod === "PAYPAL" && !creator.paypalHandle) {
    return NextResponse.json({ error: "paypal_not_enabled" }, { status: 400 });
  }
```

- [ ] **Step 4: Skip the bank verifier for PayPal.** Replace `const verify = await verifySlip(slip);` with:

```ts
  // PayPal receipts are not bank slips — the PayPal branch below judges them.
  const verify: SlipVerifyResult =
    paymentMethod === "PAYPAL"
      ? { ok: false, reason: "disabled" }
      : await verifySlip(slip);
```

- [ ] **Step 5: PayPal verdict + forced PENDING.** Directly before the line `  // Private bucket — the dashboard reaches it via /api/tips/[id]/slip only.` insert:

```ts
  // PayPal: level-1 read of the receipt for the dashboard flag, duplicate
  // guard on the transaction id, and NEVER auto-confirm (a screenshot can be
  // edited and we can't ask PayPal whether the money moved).
  if (paymentMethod === "PAYPAL") {
    const judged = judgePaypalReceipt(
      await readPaypalReceipt(slip),
      parsed.data.amount,
    );
    if (judged.transRef) {
      const dup = await prisma.tip.findUnique({
        where: { transRef: judged.transRef },
        select: { id: true },
      });
      if (dup) {
        return NextResponse.json({ error: "duplicate_slip" }, { status: 409 });
      }
    }
    status = "PENDING";
    autoVerified = false;
    confirmedAt = null;
    transRef = judged.transRef;
    verifyCode = judged.verifyCode;
    verifyDetail = judged.verifyDetail;
  }
```

- [ ] **Step 6:** In `prisma.tip.create` `data`, add `paymentMethod,` after `timerEffect,`.
- [ ] **Step 7:** `npx tsc --noEmit && npx eslint src/app/api/tips/route.ts` → clean.
- [ ] **Step 8: Commit** `git add src/app/api/tips/route.ts && git commit -m "Tips API: PayPal branch — receipt verdict, dup guard, always pending"`.

---

### Task 7: Donate page — method switch, PayPal panel, wallet chips

**Files:** Create `src/components/PaypalPayPanel.tsx`; Modify `src/components/TipForm.tsx`, `src/app/[locale]/[username]/page.tsx`

**Interfaces:** Consumes `paypalLink` (Task 2), `profile.*` keys (Task 4). `TipForm` gains prop `paypalHandle?: string | null`.

- [ ] **Step 1: Create `src/components/PaypalPayPanel.tsx`**

```tsx
"use client";

import { useTranslations } from "next-intl";
import { paypalLink } from "@/lib/paypal";

/** The PayPal half of the pay step: open PayPal, then come back to upload. */
export function PaypalPayPanel({
  handle,
  amount,
  amountLabel,
  accentStyle,
}: {
  handle: string;
  amount: number;
  amountLabel: string;
  accentStyle?: React.CSSProperties;
}) {
  const t = useTranslations("profile");
  return (
    <div className="text-center">
      <a
        href={paypalLink(handle, amount)}
        target="_blank"
        rel="noopener noreferrer"
        style={accentStyle}
        className="btn-primary inline-flex w-full justify-center transition hover:brightness-95"
      >
        {t("paypalPay", { amount: amountLabel })}
      </a>
      <p className="mx-auto mt-3 max-w-sm text-xs text-brand-900/55">
        {t("paypalNote")}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: TipForm prop + state.** Add `paypalHandle = null,` to the destructured props and `/** Creator's PayPal.me name; null = PromptPay only. */ paypalHandle?: string | null;` to the prop type. After `const [timerEffect, setTimerEffect] = …;` add:

```tsx
  const [method, setMethod] = useState<"PROMPTPAY" | "PAYPAL">("PROMPTPAY");
```

and add `import { PaypalPayPanel } from "@/components/PaypalPayPanel";` to the imports.

- [ ] **Step 3: Skip the QR call for PayPal.** At the top of `generateQr`, directly after `if (!Number.isFinite(amount) || amount < 1) return;` insert:

```tsx
    if (method === "PAYPAL") {
      setStep("pay");
      return;
    }
```

- [ ] **Step 4: Send the method.** In `submitTip`, after `fd.set("timerEffect", …);` add `fd.set("paymentMethod", method);`, and add `paypal_not_enabled: t("paypalNotEnabled"),` to the error `map`.

- [ ] **Step 5: The switch.** Directly inside `<form onSubmit={generateQr} className="space-y-5">`, before the quick-amount `<div>`, insert:

```tsx
          {paypalHandle && (
            <div className="grid grid-cols-2 gap-2" role="radiogroup">
              {(["PROMPTPAY", "PAYPAL"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={method === m}
                  onClick={() => setMethod(m)}
                  style={method === m ? primaryStyle : undefined}
                  className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                    method === m
                      ? "bg-brand-600 text-white"
                      : "bg-brand-100 text-brand-900/70 hover:bg-brand-200"
                  }`}
                >
                  {t(m === "PROMPTPAY" ? "methodPromptpay" : "methodPaypal")}
                </button>
              ))}
            </div>
          )}
```

- [ ] **Step 6: Pay step.** Change `{step === "pay" && qr && (` to `{step === "pay" && (qr || method === "PAYPAL") && (`. Wrap the existing QR `<div className="text-center">…</div>` so it renders only for PromptPay, add the PayPal panel, and replace the `payAnyApp` paragraph with the chip row. The resulting block:

```tsx
          {method === "PAYPAL" && paypalHandle ? (
            <PaypalPayPanel
              handle={paypalHandle}
              amount={amount}
              amountLabel={formatBaht(amount, currencyLocale)}
              accentStyle={primaryStyle}
            />
          ) : (
            <div className="text-center">
              {/* …existing scanToPay <p>, QR <img>, save-QR <a>, scanHint and saveQrHint <p>s unchanged… */}
              <div className="mx-auto mt-3 max-w-sm rounded-lg bg-brand-100/60 px-3 py-2 text-xs font-medium text-brand-900/70">
                <div className="flex flex-wrap items-center justify-center gap-1.5">
                  <Icon name="smartphone" className="h-3.5 w-3.5" />
                  {[t("payAppBanks"), "TrueMoney", "ShopeePay"].map((app) => (
                    <span key={app} className="rounded-full bg-white/70 px-2 py-0.5 dark:bg-white/10">
                      {app}
                    </span>
                  ))}
                </div>
                <p className="mt-1">{t("payNoBank")}</p>
              </div>
            </div>
          )}
```

(The comment line stands for the existing elements — move them, do not delete them. Only the old `<p …>{t("payAnyApp")}</p>` is replaced.)

On the `SlipDropzone`, change `label={t("uploadSlip")}` to `label={method === "PAYPAL" ? t("paypalUpload") : t("uploadSlip")}`.

- [ ] **Step 7: Donate page.** In `src/app/[locale]/[username]/page.tsx` add `paypalHandle: true,` to the creator `select` (next to `promptpayId: true,`) and `paypalHandle={creator.paypalHandle}` to `<TipForm …/>`.
- [ ] **Step 8:** `npx tsc --noEmit && npx eslint src/components/TipForm.tsx src/components/PaypalPayPanel.tsx "src/app/[locale]/[username]/page.tsx"` → clean.
- [ ] **Step 9: Commit** `git add src/components/PaypalPayPanel.tsx src/components/TipForm.tsx "src/app/[locale]/[username]/page.tsx" && git commit -m "Donate page: PromptPay/PayPal switch, PayPal pay panel, wallet chips under the QR"`.

---

### Task 8: Dashboard badges

**Files:** Modify `src/components/TipRow.tsx`, `src/app/[locale]/dashboard/page.tsx`

- [ ] **Step 1: Data.** In the dashboard `prisma.tip.findMany` select add `paymentMethod: true,`; in `clientTips` add `paymentMethod: tip.paymentMethod,`.
- [ ] **Step 2: TipRow type.** Add `paymentMethod: "PROMPTPAY" | "PAYPAL";` to `type Tip`.
- [ ] **Step 3: Verdict styles/icons/labels.** Add to `VERIFY_STYLES`: `pp_pending: "bg-amber-100 text-amber-800", pp_currency: "bg-sky-100 text-sky-800",`; to `VERIFY_ICONS`: `pp_pending: "clock", pp_currency: "help-circle",`; in the `verifyLabel` switch add:

```tsx
      case "pp_pending":
        return t("verifyPpPending");
      case "pp_currency":
        return t("verifyPpCurrency", { detail: tip.verifyDetail ?? "" });
```

- [ ] **Step 4: Badge.** After the `{tip.timerEffect === "NONE" && (…)}` badge add:

```tsx
          {tip.paymentMethod === "PAYPAL" && (
            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800">
              {t("paypalBadge")}
            </span>
          )}
```

- [ ] **Step 5: Link label.** Replace `{t("viewSlip")}` with `{tip.paymentMethod === "PAYPAL" ? t("viewReceipt") : t("viewSlip")}`.
- [ ] **Step 6:** `npx tsc --noEmit && npx eslint src/components/TipRow.tsx "src/app/[locale]/dashboard/page.tsx"` → clean; `npm test` → all pass (29 existing + 5 new = 34); `npm run build` → `✓ Compiled successfully`; `npx eslint src 2>&1 | tail -1` → `✖ 5 problems`.
- [ ] **Step 7: Commit** `git add src/components/TipRow.tsx "src/app/[locale]/dashboard/page.tsx" && git commit -m "Dashboard: PayPal badge, receipt link, PayPal verdict labels"`.

---

### Task 9: Migrate and verify on localhost

- [ ] **Step 1:** Tell the founder exactly what runs (`CREATE TYPE "PaymentMethod"`, two nullable/defaulted columns, no data change) and wait for an explicit go-ahead. Then `npx prisma migrate deploy && npx prisma generate` → `Applied migration 20260927000000_add_paypal`.
- [ ] **Step 2:** `preview_start` name `tiptang-dev`; the founder logs in (never type credentials).
- [ ] **Step 3: Settings.** On `/th/dashboard/settings`: typing in the PayPal field shows the unsaved bar; `bad name!` → save shows `paypalInvalid`; pasting `https://www.paypal.me/<founder's handle or a test name>` saves and the field becomes the bare name. Record the value used so Step 7 can clear it.
- [ ] **Step 4: Donate page** `/th/lig_1569`: switch visible; PromptPay path generates the QR and shows the three chips + no-bank line; PayPal path shows the "จ่าย ฿X ผ่าน PayPal" link whose `href` is `https://paypal.me/<handle>/<X>THB` (check via `read_page`, don't pay).
- [ ] **Step 5: PayPal submit.** Upload any small PNG on the PayPal path and submit → success screen; on the dashboard the tip is `รอยืนยัน` with the `PayPal` badge and a verdict chip (likely `notslip`); confirm it was PENDING even though the founder's account has auto-confirm on. Then delete that tip from the dashboard.
- [ ] **Step 6: Guard.** From a creator page whose owner has no handle, `POST /api/tips` with `paymentMethod=PAYPAL` via `fetch` → `400 paypal_not_enabled`. No console errors on any page.
- [ ] **Step 7:** Clear the PayPal field in settings (unless the founder wants to keep it) and report results; wait for "merge push".

---

## Self-review

- **Spec coverage:** §1 THB link → Task 2 `paypalLink`, Task 7 · §2 data → Task 1, normalisation → Task 2 · §3 settings → Task 5 (+ copy Task 4) · §4 donate switch, PayPal note incl. minimum, upload label, wallet chips (A) → Task 7 · §5 API (parse, 400, skip verifier, dup `PP:`, always PENDING) → Task 6 · §6 reader + fences + verdict table + normalised ids → Tasks 2–3 · §7 dashboard → Task 8 · §8 terms → Task 4 · §9 testing → Tasks 2, 8, 9.
- **Placeholders:** the only elided code is the explicitly-described move of existing QR elements in Task 7 Step 6.
- **Types:** `normalizePaypalHandle` returns `string | null | "invalid"` (Tasks 2, 5); `PaypalRead`/`judgePaypalReceipt`/`readPaypalReceipt` match (2, 3, 6); `paymentMethod` literal union `"PROMPTPAY" | "PAYPAL"` matches the Prisma enum (1, 6, 7, 8); i18n keys used in 5/7/8 all created in 4.
