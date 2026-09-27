# Creator thank-you message after a tip — design

**Date:** 2026-09-28 · **Status:** approved in conversation

## What

A creator can set an optional thank-you message (≤ 300 chars). After a supporter submits a
tip, the success screen shows it as a speech card with the creator's avatar and name, above
the system status line. Empty = today's success screen, unchanged.

## Details

- **Data:** `User.thankYouMessage String?` — migration
  `20260928000000_add_thank_you_message`, deployed only on the founder's go-ahead.
- **API:** `profileSchema.thankYouMessage = z.string().trim().max(300).optional().or(z.literal(""))`;
  `PATCH /api/profile` stores `null` for empty, leaves it untouched when not sent.
- **Settings:** in the "หน้าโดเนท" section, a textarea "ข้อความขอบคุณหลังโดเนท (ไม่บังคับ)",
  `maxLength={300}`, live counter `n/300`, placeholder "ขอบคุณมากที่สนับสนุนนะ! 💖",
  included in `snapshot()` so the unsaved bar works.
- **Success screen:** plain text only (React escapes it; no links, no HTML), wrapper
  `whitespace-pre-line break-words` so the creator's line breaks show. Avatar (or initial) +
  display name above it. No profanity filter — it is the creator's own text.
- **Status line fixed alongside:** the system text now follows what actually happened —
  public vs. private (the "show on profile" checkbox) and never says "slip" while pending,
  so it also reads right for PayPal:
  - confirmed + public: "…ตรวจอัตโนมัติสำเร็จ ข้อความของคุณขึ้นบนหน้าโปรไฟล์แล้ว"
  - confirmed + private: "…ตรวจอัตโนมัติสำเร็จ ครีเอเตอร์ได้รับทิปของคุณแล้ว"
  - pending + public: "…ข้อความของคุณจะปรากฏบนหน้าโปรไฟล์เมื่อครีเอเตอร์ยืนยันการโอนแล้ว"
  - pending + private: "…ครีเอเตอร์จะเห็นทิปของคุณและยืนยันการโอนเร็ว ๆ นี้"

## Testing

tsc, eslint (5 pre-existing only), `npm test`, build; on localhost: set a two-line message,
submit a test tip (private, deleted afterwards), confirm the card shows both lines and the right
status text; clear the message → card gone; > 300 chars via API → 400.

## Not in scope

Per-amount messages, links/formatting, showing the message on the overlay.
