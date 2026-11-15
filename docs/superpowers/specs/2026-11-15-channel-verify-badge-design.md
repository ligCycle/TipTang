# Channel-owner badge ("เครื่องหมายยืนยันเจ้าของช่อง") — design

Approved by the founder 2026-11-15.

## Why
A creator (SlowMoji Channel) asked for a "verified" mark on the donate page so viewers trust it. Viewers don't know TipTang the way they know EasyDonate, so they need proof the page belongs to the channel owner and isn't an impostor collecting money with their own PromptPay. Verified here means **this TipTang account controls that channel**, nothing more (not identity, not "100%").

## Goals
- Creator asks for the badge for one of the channel links already saved on their profile.
- Founder checks the channel by hand (the TipTang link is in its description or bio) and approves or rejects in /admin.
- Donate page shows a pink scalloped badge after the creator's name; tapping it says which channel was verified, with a link to it.

## Non-goals
- No automatic reading of channel bios, no periodic re-check (the founder revokes by hand), no platform login (OAuth), no ID documents, no emails.

## Anti-goals
- No long text on the donate page (the founder rejected a "✓ ยืนยันแล้ว: เจ้าของช่อง …" line as cluttered).
- No badge that copies a platform's blue tick: the shape is our own SVG in TipTang pink (#e8467f), never the stock image the founder found (pngtree watermark).

## Approach (chosen: A)
- **A, link-back + manual approval** (chosen): no personal data, quick to build, manual work is fine at today's size.
- B, platform OAuth: strongest, but per-platform app approval and TikTok/Facebook may not allow it. Later, if manual review stops scaling.
- C, ID documents: rejected, sensitive data and it proves a person, not channel ownership.

## Behaviour
- Verifiable platforms: youtube, twitch, tiktok, facebook, kick, instagram, x (not discord, not website).
- Creator card on the "โปรไฟล์และหน้าโดเนท" page: pick a saved channel link, instructions to paste `tiptang.com/<username>` in that channel's description or bio, button "ขอเครื่องหมาย". States: none / pending (can cancel) / verified / rejected (can ask again). If no verifiable link is saved: a hint to add one in the social links and save first.
- Request stores the platform key and the URL **as saved at request time**.
- Admin section "คำขอยืนยันช่อง": pending requests with creator, channel link (opens in a new tab), the TipTang link to look for, approve / reject. Verified list below with revoke.
- Approve only works on a pending request. Reject and revoke both leave the creator in "rejected" (they can ask again).
- Editing or removing the verified channel link drops the badge at once: the profile save clears the request when the saved URL for that platform no longer equals the stored URL; the donate page also only shows the badge when they still match.
- Changing display name keeps the badge (the popover names the verified channel).
- Donate page: badge right after the name, same height as the text; tap opens a small box "ยืนยันแล้วว่าเป็นเจ้าของช่อง <Platform>" + link; tap outside or Escape closes it.

## Data
`User`: `channelVerifyStatus ChannelVerifyStatus?` (PENDING | VERIFIED | REJECTED; null = never asked), `channelVerifyKey String?`, `channelVerifyUrl String?`, `channelVerifyRequestedAt DateTime?`, `channelVerifiedAt DateTime?`. One new migration; production migration only with the founder's go-ahead.

## Process
Built on `feature-hub`, run locally on the `prisma dev` database `tiptang-hub2`, the founder tests all three sides before any push.
