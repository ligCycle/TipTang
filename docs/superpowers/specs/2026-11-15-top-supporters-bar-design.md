# Top supporters bar ("ท็อปผู้สนับสนุน") — design

Approved by the founder 2026-11-15.

## Why
Lingkinpug (active creator) asked for a top-donor board on the live screen: "it makes people compete for the top". TipTang already ranks supporters on the donate page and dashboard (`topSupporters` in `src/lib/leaderboard.ts`) but has nothing for OBS.

## What
A new bar feature `top`, shown on the bars OBS link and on its own link `/overlay/<username>/top`, like goal / combo / PK.

```
 ท็อปผู้สนับสนุน · 30 วัน
 1  น้องมิ้น        ฿1,250
 2  พี่โอ๊ต           ฿800
 3  Skye             ฿450
```

- Creator settings (feature page `/dashboard/features/top` + hub card): on/off, range today / 7 days / 30 days / all time (default 30 days), rows 3 / 5 / 10 (default 5).
- Same ranking as the donate page: confirmed tips only, `publicOnly` (supporters who chose to show their name), names folded the same way. Range uses `rangeStart` from `src/lib/range.ts` (Bangkok calendar days).
- Hides itself when off or when nobody is ranked yet.
- Colour: the creator's alert colour (no new colour setting).
- Updates through the bars link's one poll (`barsFeed`, every 4 s). Its own link polls every 15 s. No new poll per feature on the bars link (Vercel cost rule).

## Data
`User.topEnabled Boolean @default(false)`, `topRange String @default("30d")`, `topCount Int @default(5)`, `topLinkSeenAt DateTime?`. One migration; production only with the founder's go-ahead.

## Non-goals
Its own colour, per-stream reset, showing amounts hidden, anonymous supporters, animations beyond a simple fade.

## Process
Built on `feature-hub`, tested locally (prisma dev `tiptang-hub2`) by the founder before any push.
