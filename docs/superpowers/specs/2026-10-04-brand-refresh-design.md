# Brand refresh (pink stays) — design

**Date:** 2026-10-04 · **Status:** approved in conversation

## Why

The founder brought a "visual brand direction" sheet (purple, mascot, 3D icons, LINE Seed Sans TH,
"Every Tip Matters"). A local spike compared the site in purple vs pink: purple read too close to
the competitor EasyDonate (electric blue `#0015FF`, anime mascot), so **pink stays**. From the
sheet we adopt only what gives TipTang its own identity without undoing earlier decisions (line
icons, no emoji): the tagline, a "money" accent colour, a real brand font, and a dark alert card.
"Alternative to TipMe" positioning goes away — TipMe closed on 2026-08-31, and a brand defined by
a dead competitor doesn't last.

## Decisions

### 1. Tagline and copy
- Tagline: **"Every Tip Matters"** / Thai **"ทุกการสนับสนุนมีความหมาย"**.
  - Footer on every page (under the links, above ©): `Every Tip Matters — ทุกการสนับสนุนมีความหมาย`
    (EN locale: `Every Tip Matters`).
  - Landing hero eyebrow: `ทางเลือกแทน TipMe · ฟรี 0%` → `Every Tip Matters · ฟรี 0%`
    (EN: `Every Tip Matters · 0% fees`).
  - Landing closing band title (`ctaBandTitle`) stays a call to action; the tagline appears in the
    band's description line instead of duplicating the footer.
- TipMe mentions:
  - Remove from: hero eyebrow; `meta.description` / `meta.ogDescription` (th + en); root
    `src/app/layout.tsx` description/OG/Twitter text and the three TipMe keywords; landing page
    JSON-LD description (`src/app/[locale]/page.tsx`); guide `why3` → "ย้ายมาง่าย ตั้งเสร็จใน
    5 นาที" (EN equivalent without TipMe).
  - Keep exactly one: a 4th landing FAQ item "เคยใช้ TipMe มาก่อน?" with a short how-to-move
    answer (EN: "Coming from TipMe?"). Easy to delete later.
- Gender-neutral copy: remove ครับ/ค่ะ from UI strings — `landing.faqA1`, `landing.faqA3`,
  `report.sent` (and any other th.json string ending in ครับ/ค่ะ found at implementation).

### 2. Tip accent colour (orange)
- New Tailwind token scale `--color-tip-{50,100,…,900}` in `@theme`, based on `#FF8A3D`
  (orange), with a dark-mode ramp under `[data-theme="dark"]` (same inversion idea as `brand`).
  Text uses must meet WCAG AA contrast on their backgrounds in both themes (use the 600–700 steps
  on light, 400–500 on dark).
- Used **only for displayed money amounts**: dashboard total (overview ฿ figure), the amount on
  each tip row, leaderboard/top-supporter amounts on the dashboard and public profile, and the
  amount badge on the dark alert card. Buttons, links, selected chips and headings use the brand
  ramp — TipTang pink, or the creator's channel colour where section 5 applies.

### 3. Font: LINE Seed Sans TH
- Self-hosted with `next/font/local`, files in `src/app/fonts/` — three weights: Regular (400),
  Bold (700), ExtraBold (800) of LINE Seed Sans TH (SIL OFL 1.1, from seed.line.me; the licence
  file is committed alongside). `display: swap`, exposed as a CSS variable and placed first in the
  body font stack, with the current system stack as fallback.
- Applied to the `[locale]` layout and the overlay layout (OBS overlays use it too).
- **Downloading the files needs the founder's explicit go-ahead** (file names, source, sizes
  stated first). If the official package has no woff2, convert the TTF/OTF to woff2 locally.

### 4. Dark alert card (overlay theme)
- New column `User.alertTheme String @default("light")` — values `light` | `dark`. Additive
  migration; existing creators keep the light card. Migration runs on production only with the
  founder's explicit go-ahead, before the code deploys.
- `src/lib/alertThemes.ts`: `ALERT_THEMES = ["light", "dark"] as const`, `type AlertTheme`,
  `isAlertTheme(v)`, `DEFAULT_ALERT_THEME = "light"` (pure, unit-tested — same shape as
  `alertStyles.ts`).
- API: `/api/overlay/asset` accepts `kind = "alertTheme"` (validated with `isAlertTheme`), same
  pattern as `alertStyle`. `/api/overlay/setup` returns `alertTheme`. The overlay page reads it
  and passes it to `OverlayClient`.
- Dark card look: near-black translucent background with backdrop blur; 1.5px border plus outer
  glow in the accent colour (creator's `alertColor` if set, else brand pink); small uppercase label
  "ทิปใหม่!" / "New tip!"; supporter name in white; amount badge in the tip-orange accent; message
  in white/90; timer-delta pill as today. Entrance animations (`alert-<style>`), big-tip sizing
  and confetti behave exactly as on the light card.
- OBS settings page: a "ธีมการ์ด" picker (two tiles with mini previews: การ์ดสว่าง / การ์ดมืด)
  above the animation-style picker; selecting saves immediately like the style picker; the
  existing preview link shows the chosen theme.
- Goal bar and timer overlays already use a dark glass card (`bg-black/55`) — unchanged.

### 5. Creator channel colour themes the creator's "room"
TipTang is a building; each creator owns a room and may paint it. The creator's `profileColor`
(the "channel colour" already set in Settings) recolours **every** brand-coloured element — buttons,
links, chips, checkboxes, borders, header and footer — on:
- their public donate page `/[locale]/[username]` (what visitors see), and
- their own signed-in pages under `/[locale]/dashboard/**` (dashboard, settings, OBS, shop).
Public "lobby" pages (landing, guide, updates, legal, login/register) stay TipTang pink. OBS
overlays keep using `alertColor`/`goalColor`/`timerColor` as today.

How:
- `src/lib/creator-theme.ts` (pure, unit-tested):
  - `parseHex(v)` accepts `#rgb` / `#rrggbb` (as the validator does), returns normalised
    `#rrggbb` or null.
  - `creatorRamp(hex)` → `{ light: Record<50..900, "#rrggbb">, dark: Record<50..900, "#rrggbb"> }`
    computed by mixing the accent with white/black (light) and with the dark background
    `#140b11`/white (dark), mirroring the shape of today's pink ramps. The step used as the
    primary button background (light 600, dark 500) is darkened/lightened until white text on it
    reaches a contrast ratio ≥ 4.5:1, so a yellow or cyan channel colour still gives readable
    buttons.
  - `creatorThemeCss(hex)` → a CSS string
    `:root{--color-brand-50:…;…}:root[data-theme="dark"]{…}` (the dark rule's higher specificity
    beats the global dark ramp). If the accent's hue is within 30° of the tip orange, it also sets
    the tip text steps to the foreground colour so money amounts stay distinguishable from buttons.
  - Returns `null` for no colour, an invalid colour, or the default `#ec4899` — the page then keeps
    today's hand-tuned pink exactly.
- `src/components/CreatorTheme.tsx`: server component rendering a plain `<style>` (no
  `href`/`precedence`, so React keeps it in place and removes it on navigation away) with
  `creatorThemeCss(color)`; renders nothing when that returns null. The colour is re-validated by
  `parseHex` before it reaches CSS text (no CSS injection).
- Rendered by the donate page (creator's `profileColor`) and by `dashboard/layout.tsx` (the signed-in
  creator's `profileColor`). The existing `--accent` inline styles on the donate page keep working;
  where they duplicate the ramp they may be simplified.

## Out of scope
Mascot illustration (founder will supply a pink version later), logo, primary colour change,
3D icons, TH Sarabun.

## Testing
- Unit: `alertThemes.test.ts` (accepts light/dark, rejects others, default is light).
- `npx tsc --noEmit`, `npx eslint` (exactly the 5 pre-existing errors), `npm test`, `npm run build`.
- Local visual check: landing (hero eyebrow, footer tagline, FAQ 4), dashboard amounts in orange
  (light + dark), font applied (computed `font-family` on body and overlay), contrast spot-check.
- Overlay both themes on a local throwaway DB (`npx prisma dev` + temporary
  `.env.development.local`, deleted afterwards): theme picker saves, `?test=1` preview shows light
  vs dark card, normal and big tip.
- Production migration only at "merge push" with explicit approval.
- Unit: `creator-theme.test.ts` — `#rgb` expansion, invalid/default → null, ramp shape, white-text
  contrast ≥ 4.5 on the button step for light colours (e.g. `#f59e0b`, `#06b6d4`), tip-clash rule,
  CSS string contains only `#rrggbb` values.
- Visual: donate page and dashboard with a few channel colours (violet, amber, slate) in light and
  dark; landing stays pink; navigating donate page → landing reverts to pink.
- Add "What's new" entries (creator tag) for the dark alert card and channel-colour theming.
