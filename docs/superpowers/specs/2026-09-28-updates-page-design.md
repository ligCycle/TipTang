# "What's new" page — design

**Date:** 2026-09-28 · **Status:** approved in conversation

## Why

Two weeks of shipped features (PayPal, thank-you message, Kick/Twitch, wallet hints, minimum
tip, subathon choices, private slips) are invisible to the 17 creators unless they happen to
open settings. A public, dated changelog tells them without emails (the founder does not want to
spam creators) and shows visitors coming from TipMe that the site is actively maintained.

## Design

- **Content:** `src/lib/updates.ts` — `UPDATES: Update[]`, newest first. `Update = { id, date,
  tags, href?, th: { title, body }, en: { title, body } }`. `date` is ISO `YYYY-MM-DD`; `id` is
  `<date>-<slug>` and unique; `tags` ⊂ `creator | supporter | security`; `href` is an in-app path
  ("/dashboard/settings") for a "try it" link. No DB, no admin UI — new entries are added to the
  file at "merge push" time. Internal/back-office work is not listed.
- **Page:** `/[locale]/updates` (public, static). Title "มีอะไรใหม่ใน TipTang" / "What's new in
  TipTang", `generateMetadata` with description + canonical + hreflang for th/en. Entries grouped
  by date (formatted from ISO at render: "27 ก.ย. 2569" / "Sep 27, 2026", Bangkok time zone),
  each with tag chips, title, body, optional "ลองเลย →". Same look as the guide/legal pages.
  Linked from the footer ("มีอะไรใหม่") and listed in the sitemap.
- **Unseen dot:** a "มีอะไรใหม่" pill in the dashboard's top button row (next to "คู่มือ").
  `localStorage["tiptang_last_seen_update"]` holds the id of the newest entry the creator has seen;
  the dot shows when `UPDATES[0].id` differs (entries only ever get added on top, so any new newest
  id means new content — works even for two releases on the same day). Read with
  `useSyncExternalStore` (server snapshot = "no dot") so there is no hydration mismatch and no new
  `set-state-in-effect` lint error. Visiting `/updates` writes the newest id. Other devices show
  the dot once more — acceptable. Storage access is wrapped in try/catch.

## Initial entries

27 ก.ย. PayPal for overseas supporters (creator) · thank-you message after a tip (creator) ·
Kick & Twitch links (creator) · pay screen names bank apps / TrueMoney / ShopeePay (supporter);
16 ก.ย. minimum tip (creator) · subathon add / reduce / just-donate (creator + supporter) ·
private slip storage (security).

## Testing

Unit (`src/lib/updates.test.ts`): newest-first by date, ids unique and prefixed by their date,
tags valid, `hasUnseenUpdate` for null / older / newest id. Localhost: th + en pages, phone
width, footer link, dot appears on the dashboard and disappears after visiting the page.
