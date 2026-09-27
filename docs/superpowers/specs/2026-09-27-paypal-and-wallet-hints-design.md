# PayPal tips for overseas supporters + "which apps can scan" hint — design

**Date:** 2026-09-27
**Status:** approved in conversation, awaiting spec review

## Why

TipTang only takes PromptPay QR. Research (Omise/Opn and Stripe Thailand pricing and
restricted-business pages, 2026-09-27) showed:

- Thai QR is interoperable: every Thai bank app plus TrueMoney and ShopeePay can pay it,
  so Thai supporters are already covered. The real gaps are overseas supporters and
  unclear messaging.
- Cards / Google Pay / Apple Pay need a payment gateway where money flows through
  TipTang (3.65%+ fees, and both Omise and Stripe list "donations to individuals" /
  payment aggregation as prohibited or pre-approval-only). That breaks the
  "0% fee, money straight to the creator" promise and needs a company + approval.
  **Out of scope.**
- TrueMoney gift envelopes were rejected: a link is bearer cash, verification relies on
  an unofficial API, and it adds no new payers (TrueMoney users can already scan the QR).

Decided with the founder:

- **A.** Under the PromptPay QR, state plainly which apps can pay it.
- **B.** Optional PayPal.me per creator for overseas supporters. Money goes supporter →
  creator's PayPal directly; TipTang never touches it. PayPal's fees are the creator's.
- **Level-1 receipt check:** Gemini reads the uploaded PayPal receipt and flags it on the
  dashboard. PayPal tips are **never auto-confirmed**.

## 1. Amounts stay in baht

PayPal.me links carry an amount and currency: `https://paypal.me/<handle>/<amount>THB`.
PayPal converts on the payer's side. We record the tip as THB exactly like PromptPay, so
overlay, leaderboard, goal bar, subathon timer, and minimum tip keep working unchanged.
`Tip.currency` stays `"THB"`.

## 2. Data (one migration)

- `User.paypalHandle String?` — the PayPal.me name only (no URL). Null = PayPal off.
- `enum PaymentMethod { PROMPTPAY PAYPAL }`, `Tip.paymentMethod PaymentMethod @default(PROMPTPAY)`.

Migration `prisma/migrations/20260927000000_add_paypal/migration.sql`, deployed only after
the founder's go-ahead.

Handle normalisation (`normalizePaypalHandle` in `src/lib/paypal.ts`, unit-tested):
accept `name`, `@name`, `paypal.me/name`, `https://www.paypal.me/name/10`,
`https://paypal.com/paypalme/name`; return the name if it matches `^[A-Za-z0-9]{1,20}$`,
else `null` (invalid → settings shows an error, nothing saved). Empty input clears it.
`paypalLink(handle, amount)` → `https://paypal.me/<handle>/<amount>THB` (amount is a
whole number of baht — tip amounts are already integers).

## 3. Creator settings

In the "การรับเงิน" section of `SettingsForm`, below PromptPay:

- Field "PayPal.me (ไม่บังคับ)" with placeholder `paypal.me/yourname`.
- Hint: "สำหรับคนดูต่างประเทศ · PayPal หักค่าธรรมเนียมจากยอดที่คุณได้รับ (ประมาณ 4–5% + ค่าแลกเงิน) · ทิปผ่าน PayPal ต้องกดยืนยันเองทุกครั้ง"
- Saved through the existing `PATCH /api/profile` (`profileSchema` gains `paypalHandle`,
  normalised server-side; invalid → 400 `invalid_paypal`).
- Included in the settings `snapshot()` so the unsaved-changes bar works.

## 4. Donate page

Only when the creator has both `promptpayId` and `paypalHandle`: a two-option switch at the
top of `TipForm` — `พร้อมเพย์ (ในไทย)` | `PayPal (ต่างประเทศ)`, default PromptPay.
Without a PayPal handle nothing changes.

The form fields (amount, name, message, public checkbox, timer choice) are identical for
both methods. The `pay` step differs:

- **PromptPay:** existing QR flow. Under the QR, replace the current `payAnyApp` line with
  a small chip row: `แอปธนาคารทุกธนาคาร · TrueMoney · ShopeePay` (text, no brand logos)
  plus the existing "ไม่ต้องมีบัญชีธนาคารก็โดเนทได้". This is item **A** and applies to
  every creator.
- **PayPal:** no `/api/qr` call. Show "จ่าย ฿{amount} ผ่าน PayPal" as a link
  (`target="_blank" rel="noopener noreferrer"`) to `paypalLink(...)`, a one-line note
  "ยอดจะแปลงเป็นสกุลเงินของคุณในหน้า PayPal · PayPal อาจมียอดขั้นต่ำของตัวเองสำหรับการโอนข้ามประเทศ"
  (we do not enforce a PayPal minimum ourselves — PayPal rejects too-small payments in its
  own window, which is acceptable), then the same upload box labelled
  "แนบภาพหน้าจอยืนยันการชำระเงินของ PayPal".

The client sends `paymentMethod=PAYPAL` in the existing multipart `POST /api/tips`.

i18n: new keys under `profile.*` and `settings.*` in both `messages/th.json` and
`messages/en.json` (English page shows English labels; the PayPal option matters most there).

## 5. `POST /api/tips` for PayPal

- `paymentMethod` parsed like `timerEffect`: `"PAYPAL"` → PAYPAL, anything else → PROMPTPAY.
- If PAYPAL and the creator has no `paypalHandle` → 400 `paypal_not_enabled`.
- Minimum tip, reduce-timer rules, file type/size checks, private slip upload: unchanged.
- The bank verifier (`verifySlip`) is **not** called. Instead `readPaypalReceipt(file)`
  (section 6) runs and produces `verifyCode` / `verifyDetail` / an optional transaction id.
- Duplicate guard: a receipt transaction id is stored in `Tip.transRef` as `PP:<id>`
  (shares the existing unique index with bank refs without colliding). If that
  `transRef` already exists → 409 `duplicate_slip`, same as PromptPay.
- `status` is always `PENDING`, `autoVerified` false, regardless of `autoConfirmTips`.
  Creator email notification and everything else: unchanged.

## 6. Receipt reader — `src/lib/paypal-receipt.ts`

Gemini call reusing the same env (`GEMINI_API_KEY`, `GEMINI_MODEL`) and timeout pattern as
`slip-verify.ts`, with a PayPal-specific prompt asking for strict JSON:

```json
{ "isPaypalReceipt": true, "completed": true, "amount": 300, "currency": "THB",
  "recipient": "Lig Stream", "transactionId": "9AB12345CD6789012" }
```

Parsing is defensive: the request sets `responseMimeType: "application/json"` like the
bank verifier, and the reply text still goes through `stripJsonFences()` (removes a
leading ```` ```json ```` / ```` ``` ```` line and a trailing ```` ``` ````, then trims) before
`JSON.parse`. A parse failure is `"unreadable"`, never a thrown error. `stripJsonFences`
lives in `src/lib/paypal.ts` and is unit-tested.

Pure comparison `judgePaypalReceipt(read, expectedAmountThb)` (unit-tested) →
`{ verifyCode, verifyDetail, transRef }`:

| condition | verifyCode | verifyDetail |
|---|---|---|
| reader disabled (no key) | `null` | `null` |
| reader error / timeout | `"unreadable"` | `null` |
| not a PayPal receipt | `"notslip"` | `null` |
| not completed (pending/failed) | `"pp_pending"` | status text |
| currency THB, amount within ±1 baht | `"match"` | recipient |
| currency THB, amount differs | `"amount"` | `฿<read amount>` |
| other currency | `"pp_currency"` | `<amount> <currency>` |

`transRef = "PP:" + transactionId.trim().toUpperCase()` when a transaction id was read
(normalised so the same receipt read with different casing/whitespace still collides),
else `null`.
Recipient is shown as detail only — PayPal receipts show a display name, not the
PayPal.me handle, so it can't be matched reliably.

## 7. Dashboard

`TipRow`: a `PayPal` badge when `paymentMethod === "PAYPAL"`; the slip link reads
"ดูใบเสร็จ"; new verify-badge labels for `pp_pending` ("PayPal: ยังไม่สำเร็จ") and
`pp_currency` ("PayPal: ยอด {detail} ตรวจเอง"). Existing codes keep their labels.
The dashboard page passes `paymentMethod` into the client tip objects.

## 8. Terms

One line added to the terms (th + en): payments made through PayPal are between the
supporter and the creator on PayPal; TipTang does not receive or refund them.

## 9. Testing

- Unit: `normalizePaypalHandle` (all accepted forms, invalid, empty), `paypalLink`,
  `stripJsonFences` (plain JSON, ```json fenced, bare ``` fenced, surrounding whitespace),
  `judgePaypalReceipt` (every row of the table, ±1 baht edge, lowercase/spaced
  transaction id normalises to the same `PP:` ref).
- Manual on localhost (production DB):
  1. Set a PayPal handle on the founder's account; settings save bar + invalid-handle error.
  2. Donate page shows the switch; PromptPay path unchanged; chip row visible.
  3. PayPal path: link opens `paypal.me/<handle>/<amount>THB`; submit with an image →
     tip is PENDING with the PayPal badge; creator with auto-confirm on still gets PENDING.
  4. Creator without a handle: no switch; `paymentMethod=PAYPAL` via fetch → 400.
  5. Clear the handle afterwards; delete the test tip.
- tsc, eslint (5 pre-existing errors only), `npm test`, `npm run build`.

## Not in scope

Gateways / cards / Google Pay / Apple Pay · TrueMoney gift envelopes · PayPal API
verification (level 2) · showing amounts in USD · automatic confirmation of PayPal tips.
