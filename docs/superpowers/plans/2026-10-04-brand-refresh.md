# Brand Refresh (pink stays) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give TipTang its own identity without changing its pink: tagline instead of "TipMe alternative", orange for money amounts, LINE Seed Sans TH, an optional dark alert card, and creators' channel colour painting their own pages.

**Architecture:** Copy lives in `messages/{th,en}.json`. Colours are Tailwind v4 `@theme` tokens in `src/app/globals.css` (`brand-*` already; new `tip-*`). A creator's channel colour is turned into a full `brand-*` ramp by a pure TS module and injected as a plain `<style>` on their donate page and dashboard. The dark alert card is a new `User.alertTheme` column read by the overlay. The font is self-hosted with `next/font/local`.

**Tech Stack:** Next.js 16.3 App Router, React 19, Tailwind v4, next-intl, Prisma 7 + Postgres, `node:test`.

**Spec:** `docs/superpowers/specs/2026-10-04-brand-refresh-design.md`

## Global Constraints

- Brand stays pink; no primary-colour change, no 3D icons, no emoji, no mascot in this plan.
- Tagline: "Every Tip Matters" / "ทุกการสนับสนุนมีความหมาย". "TipMe" may appear only in `landing.faqQ4` (th + en); nowhere else in `messages/` or `src/`.
- Thai UI strings must not contain ครับ or ค่ะ.
- Tip accent: tokens `--color-tip-50 … --color-tip-900`, 400 = `#ff8a3d`; amounts use the class `text-tip-600` only; buttons/links/chips/headings keep `brand-*`.
- Creator theme applies on `/[locale]/[username]` and `/[locale]/dashboard/**` only; lobby pages stay pink; default/absent/invalid colour (`#ec4899`, null, bad hex) = no override.
- Creator ramp readability: light 600 (button bg) ≥ 4.5:1 vs white; light 700 ≥ 4.5:1 vs white; light 900 ≥ 7:1 vs white; dark 600 and 700 ≥ 4.5:1 vs `#140b11`. (Refines spec §5, which named "dark 500 vs white text": in dark mode the 600/700 steps are used as text and link colours on the dark page — same role as today's dark pink ramp — so they are checked against the background.)
- `alertTheme`: `"light"` (default) | `"dark"`; existing creators keep light.
- Font: LINE Seed Sans TH 400/700/800 via `next/font/local`, CSS variable `--font-line-seed`, `display: "swap"`, system stack kept as fallback; OFL licence committed next to the files.
- **The production DB must never be touched before "merge push".** After the schema change (Task 5) the dev server must run against a local `npx prisma dev` DB (temporary `.env.development.local`, deleted afterwards), because production has no `alertTheme` column yet. Never run `prisma migrate deploy` without an explicit local `DIRECT_URL`.
- Downloading the font zip needs the founder's explicit approval first (file `LINE_Seed_Sans_TH.zip`, source `https://seed.line.me/src/images/fonts/LINE_Seed_Sans_TH.zip`, 1,244,389 bytes).
- `npx eslint` must report exactly the 5 pre-existing `react-hooks/set-state-in-effect` errors. No `any`. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; never `git add -A`.

## Review Focus

1. **A creator picks a very light or very dark channel colour** (yellow `#facc15`, white `#ffffff`, near-black `#0f172a`) → buttons and links stay readable in light and dark mode. Pinned by the contrast tests in Task 3.
2. **A bad value reaches the colour code** (legacy row, manual DB edit: `red;}body{display:none}`) → nothing is injected, page looks default. Pinned by the Task 3 injection test.
3. **Leaving a creator's page** (donate page → landing via client navigation) → the lobby is pink again. Pinned by the Task 7 navigation check.
4. **Existing creators live on stream when this deploys** → their alert card is unchanged (light). Pinned by the Task 5 default test and the overlay fallback to `DEFAULT_ALERT_THEME`.
5. **Font can't load (blocked, slow)** → text still renders in the system Thai font, no layout break. Pinned by the Task 6 fallback-stack check.

---

### Task 1: Tagline, de-TipMe copy, gender-neutral copy

**Files:**
- Create: `src/lib/copy.test.ts`
- Modify: `messages/th.json`, `messages/en.json`, `src/app/[locale]/layout.tsx` (footer), `src/app/[locale]/page.tsx` (JSON-LD, FAQ count), `src/app/layout.tsx` (metadata)

**Interfaces:** Produces message keys `common.tagline`, `landing.faqQ4`, `landing.faqA4`.

- [ ] **Step 1: Write the failing test** — `src/lib/copy.test.ts`

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

type Tree = { [k: string]: string | Tree };

function load(locale: "th" | "en"): Tree {
  const url = new URL(`../../messages/${locale}.json`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")) as Tree;
}

function flatten(t: Tree, prefix = ""): [string, string][] {
  return Object.entries(t).flatMap(([k, v]) =>
    typeof v === "string"
      ? [[prefix + k, v] as [string, string]]
      : flatten(v, `${prefix}${k}.`),
  );
}

test("Thai UI copy is gender-neutral (no ครับ / ค่ะ)", () => {
  const bad = flatten(load("th"))
    .filter(([, v]) => /ครับ|ค่ะ/.test(v))
    .map(([k]) => k);
  assert.deepEqual(bad, []);
});

test("TipMe appears only in the 'coming from TipMe?' FAQ question", () => {
  for (const locale of ["th", "en"] as const) {
    const keys = flatten(load(locale))
      .filter(([, v]) => /TipMe/.test(v))
      .map(([k]) => k);
    assert.deepEqual(keys, ["landing.faqQ4"], locale);
  }
});

test("the tagline exists in both locales", () => {
  for (const locale of ["th", "en"] as const) {
    const tagline = flatten(load(locale)).find(([k]) => k === "common.tagline");
    assert.ok(tagline?.[1].startsWith("Every Tip Matters"), locale);
  }
});
```

- [ ] **Step 2: Run it — expect FAIL** (`node --test src/lib/copy.test.ts`: ครับ keys listed, TipMe keys listed, tagline missing).

- [ ] **Step 3: Edit `messages/th.json`** (exact values):
  - `common.tagline`: `Every Tip Matters — ทุกการสนับสนุนมีความหมาย` (new key)
  - `landing.heroEyebrow`: `Every Tip Matters · ฟรี 0%`
  - `landing.ctaBandDesc`: `ทุกการสนับสนุนมีความหมาย — สมัครฟรี ตั้งค่า 5 นาที ไม่ต้องใส่บัตร`
  - `landing.faqA1`: same text with `ฟรีจริงครับ` → `ฟรีจริง`
  - `landing.faqA3`: same text with `ไม่ยากครับ` → `ไม่ยาก`
  - `landing.faqQ4` (new): `เคยใช้ TipMe มาก่อน?`
  - `landing.faqA4` (new): `ย้ายมาได้ในไม่ถึง 5 นาที: สมัคร ใส่เลขพร้อมเพย์ แล้วเปลี่ยนลิงก์ overlay ใน OBS เป็นของ TipTang จากนั้นเอาลิงก์หน้าโดเนทใหม่ไปแปะแทนลิงก์เดิมในช่องได้เลย`
  - `meta.description`: `TipTang รับทิป/โดเนทผ่านพร้อมเพย์ ฟรี 0% ไม่หักค่าธรรมเนียม เงินเข้าบัญชีคุณตรง ไม่ต้องรอถอน สำหรับครีเอเตอร์และสตรีมเมอร์ไทย พร้อม overlay สำหรับ OBS (แจ้งเตือน/เป้าหมาย/เสียงอ่านโดเนท)`
  - `meta.ogDescription`: `รับทิป/โดเนทผ่านพร้อมเพย์ ฟรี 0% เงินเข้าบัญชีตรง ไม่ต้องรอถอน พร้อม overlay สำหรับ OBS`
  - `guide.why3`: `ย้ายมาง่าย ตั้งเสร็จใน 5 นาที`
  - `report.sent`: `ส่งแล้ว! ขอบคุณที่แจ้ง เดี๋ยวแอดมินเข้ามาดูให้`

- [ ] **Step 4: Edit `messages/en.json`**:
  - `common.tagline`: `Every Tip Matters`
  - `landing.heroEyebrow`: `Every Tip Matters · 0% fees`
  - `landing.ctaBandDesc`: `Every tip matters — free to join, 5-minute setup, no card needed`
  - `landing.faqQ4`: `Coming from TipMe?`
  - `landing.faqA4`: `Switching takes under 5 minutes: sign up, add your PromptPay number and swap the OBS overlay link for TipTang's — then put your new donate link wherever the old one was.`
  - `meta.description`: `TipTang lets Thai creators and streamers receive tips and donations via PromptPay with 0% fees. Money goes straight to your bank — no holds, no withdrawals — with OBS overlays (alerts, goal bar, TTS).`
  - `meta.ogDescription`: `Tips & donations via PromptPay, 0% fees, money straight to your bank, with OBS overlays`
  - `guide.why3`: `easy to switch, set up in 5 minutes`

- [ ] **Step 5: Code edits**
  - `src/app/[locale]/page.tsx`: JSON-LD `description` → `"รับทิป/โดเนทผ่าน PromptPay ฟรี ไม่มีค่าธรรมเนียม สำหรับครีเอเตอร์และสตรีมเมอร์ไทย"`; FAQ list `{[1, 2, 3].map(` → `{[1, 2, 3, 4].map(`.
  - `src/app/layout.tsx`: in `description`, `openGraph.description`, `twitter.description` delete the phrase `ทางเลือกแทน TipMe` together with its leading ` — ` (keep the rest of each sentence, e.g. `… ไม่ต้องรอถอน พร้อม overlay สำหรับ OBS`); remove the three keywords `"แทน TipMe"`, `"TipMe"`, `"TipMe ปิด"`.
  - `src/app/[locale]/layout.tsx` footer: insert above `<p>© {new Date().getFullYear()} TipTang</p>`:

```tsx
            <p className="mb-1 font-semibold text-brand-900/70">{t("tagline")}</p>
```

- [ ] **Step 6: Verify** — `node --test src/lib/copy.test.ts` → 3 pass; `grep -rn "TipMe" src` → no output; `npx tsc --noEmit`; `npm test`.

- [ ] **Step 7: Commit** — `git add src/lib/copy.test.ts messages/th.json messages/en.json src/app/layout.tsx "src/app/[locale]/layout.tsx" "src/app/[locale]/page.tsx"`; message `Copy: "Every Tip Matters" tagline, drop TipMe positioning, gender-neutral Thai`.

---

### Task 2: Tip accent colour for money amounts

**Files:** Modify `src/app/globals.css`, `src/components/TipRow.tsx:176`, `src/app/[locale]/dashboard/page.tsx:263,284`, `src/app/[locale]/[username]/page.tsx:212,387`

**Interfaces:** Produces Tailwind utilities `*-tip-50 … *-tip-900` (used by Tasks 3 and 5: `--color-tip-600`, `bg-tip-400`, `text-tip-900`).

- [ ] **Step 1: Add the light ramp** inside the existing `@theme { … }` block in `globals.css`, after `--color-brand-900`:

```css
  /* Money amounts only (tips, totals, top supporters). Buttons stay brand. */
  --color-tip-50: #fff6ed;
  --color-tip-100: #ffead5;
  --color-tip-200: #fed2aa;
  --color-tip-300: #fdb274;
  --color-tip-400: #ff8a3d;
  --color-tip-500: #f96d16;
  --color-tip-600: #c2410c;
  --color-tip-700: #9a3412;
  --color-tip-800: #7c2d12;
  --color-tip-900: #5a1f0b;
```

- [ ] **Step 2: Add the dark ramp** inside the existing `[data-theme="dark"] { … }` block, after `--color-brand-900`:

```css
  --color-tip-50: #1e120c;
  --color-tip-100: #2b170d;
  --color-tip-200: #40200f;
  --color-tip-300: #5c2c12;
  --color-tip-400: #ff8a3d;
  --color-tip-500: #ff9a52;
  --color-tip-600: #ffa463;
  --color-tip-700: #ffbe8a;
  --color-tip-800: #ffd6b3;
  --color-tip-900: #ffead8;
```

- [ ] **Step 3: Apply to amounts** (class swaps only):
  - `TipRow.tsx` amount span: `text-brand-700` → `text-tip-600`.
  - `dashboard/page.tsx` received total `<p>`: `text-brand-600` → `text-tip-600`; top-supporter amount `<span className="tabular-nums">` → `<span className="font-semibold tabular-nums text-tip-600">`.
  - `[username]/page.tsx` recent-tip amount and supporter-total spans: `text-brand-700` → `text-tip-600`.

- [ ] **Step 4: Verify** — `npx tsc --noEmit`, `npm run build` (Tailwind must emit `.text-tip-600`: `grep -o "text-tip-600" .next/static/**/*.css` or check computed colour in Task 7). Contrast: `#c2410c` on `#fdf7f9` ≈ 5:1, `#ffa463` on `#140b11` > 9:1.

- [ ] **Step 5: Commit** — files above; message `Tip accent: orange for money amounts (light + dark ramps)`.

---

### Task 3: Creator colour ramp (pure)

**Files:** Create `src/lib/creator-theme.ts`, `src/lib/creator-theme.test.ts`

**Interfaces:** Produces `DEFAULT_PROFILE_COLOR = "#ec4899"`, `STEPS`, `type Step`, `type Ramp = Record<Step, string>`, `parseHex(v: unknown): string | null`, `mix(a, b, t): string`, `contrast(a, b): number`, `clashesWithTip(hex: string): boolean`, `creatorRamp(hex: string): { light: Ramp; dark: Ramp }`, `creatorThemeCss(color: unknown): string | null`.

- [ ] **Step 1: Write the failing test** — `src/lib/creator-theme.test.ts`

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STEPS,
  parseHex,
  contrast,
  clashesWithTip,
  creatorRamp,
  creatorThemeCss,
} from "./creator-theme.ts";

const WHITE = "#ffffff";
const DARK_BG = "#140b11";

test("parseHex normalises #rgb and #rrggbb, rejects the rest", () => {
  assert.equal(parseHex("#ABC"), "#aabbcc");
  assert.equal(parseHex(" #7C3AED "), "#7c3aed");
  assert.equal(parseHex("red"), null);
  assert.equal(parseHex("#12345"), null);
  assert.equal(parseHex(null), null);
});

test("no override for empty, default pink or invalid colours", () => {
  for (const v of [null, undefined, "", "#ec4899", "#EC4899", "red;}body{display:none}"]) {
    assert.equal(creatorThemeCss(v), null, String(v));
  }
});

test("ramps have all ten steps as #rrggbb", () => {
  const { light, dark } = creatorRamp("#7c3aed");
  for (const s of STEPS) {
    assert.match(light[s], /^#[0-9a-f]{6}$/);
    assert.match(dark[s], /^#[0-9a-f]{6}$/);
  }
});

test("buttons and text stay readable for light and dark channel colours", () => {
  for (const c of ["#facc15", "#f59e0b", "#06b6d4", "#ffffff", "#7c3aed", "#0f172a", "#1e3a8a"]) {
    const { light, dark } = creatorRamp(c);
    assert.ok(contrast(light[600], WHITE) >= 4.5, `${c} light600 ${light[600]}`);
    assert.ok(contrast(light[700], WHITE) >= 4.5, `${c} light700 ${light[700]}`);
    assert.ok(contrast(light[900], WHITE) >= 7, `${c} light900 ${light[900]}`);
    assert.ok(contrast(dark[600], DARK_BG) >= 4.5, `${c} dark600 ${dark[600]}`);
    assert.ok(contrast(dark[700], DARK_BG) >= 4.5, `${c} dark700 ${dark[700]}`);
  }
});

test("orange-ish colours swap the tip text colour; others don't", () => {
  assert.equal(clashesWithTip("#f59e0b"), true);
  assert.equal(clashesWithTip("#3b82f6"), false);
  assert.equal(clashesWithTip("#64748b"), false); // grey: low saturation
  assert.match(creatorThemeCss("#f59e0b") ?? "", /--color-tip-600:/);
  assert.doesNotMatch(creatorThemeCss("#3b82f6") ?? "", /--color-tip-600:/);
});

test("CSS covers light + dark and only contains #rrggbb colours", () => {
  const css = creatorThemeCss("#7c3aed") ?? "";
  assert.match(css, /^:root\{--color-brand-50:#[0-9a-f]{6};/);
  assert.ok(css.includes(':root[data-theme="dark"]{--color-brand-50:'));
  for (const m of css.match(/#[0-9a-fA-F]+/g) ?? []) assert.equal(m.length, 7, m);
});
```

- [ ] **Step 2: Run — expect FAIL** (`node --test src/lib/creator-theme.test.ts`, module not found).

- [ ] **Step 3: Implement** — `src/lib/creator-theme.ts`

```ts
/**
 * A creator's channel colour (profileColor) paints their own "room" — their
 * donate page and their signed-in dashboard. This turns one colour into a
 * full brand ramp (50–900, light + dark) with readability guarantees, and the
 * CSS that swaps it in. Pure, so it is unit-tested.
 */

export const DEFAULT_PROFILE_COLOR = "#ec4899";
const WHITE = "#ffffff";
const BLACK = "#000000";
/** Dark-mode page background (globals.css). */
const DARK_BG = "#140b11";
/** Hue of the tip accent #ff8a3d, in degrees. */
const TIP_HUE = 24;

export const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;
export type Step = (typeof STEPS)[number];
export type Ramp = Record<Step, string>;

const HEX6 = /^#[0-9a-f]{6}$/i;
const HEX3 = /^#[0-9a-f]{3}$/i;

/** "#abc" / "#aabbcc" (any case, surrounding spaces) → "#aabbcc"; anything else → null. */
export function parseHex(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (HEX6.test(s)) return s.toLowerCase();
  if (HEX3.test(s)) {
    const [r, g, b] = s.slice(1);
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return null;
}

type Rgb = [number, number, number];

function toRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(rgb: Rgb): string {
  return (
    "#" +
    rgb
      .map((x) => Math.round(Math.min(255, Math.max(0, x))).toString(16).padStart(2, "0"))
      .join("")
  );
}

/** Blend a toward b by t (0 = a, 1 = b). */
export function mix(a: string, b: string, t: number): string {
  const A = toRgb(a);
  const B = toRgb(b);
  return toHex([
    A[0] + (B[0] - A[0]) * t,
    A[1] + (B[1] - A[1]) * t,
    A[2] + (B[2] - A[2]) * t,
  ]);
}

function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio (1–21). */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Step c toward `toward` until it reaches `min` contrast against `against`. */
function pushUntil(c: string, toward: string, against: string, min: number): string {
  let x = c;
  for (let i = 0; i < 40 && contrast(x, against) < min; i++) x = mix(x, toward, 0.08);
  return x;
}

function hueSat(hex: string): { h: number; s: number } {
  const [r, g, b] = toRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s };
}

/** Saturated colours within 30° of the tip orange would blur buttons and amounts. */
export function clashesWithTip(hex: string): boolean {
  const { h, s } = hueSat(hex);
  const dist = Math.min(Math.abs(h - TIP_HUE), 360 - Math.abs(h - TIP_HUE));
  return s > 0.35 && dist < 30;
}

export function creatorRamp(accent: string): { light: Ramp; dark: Ramp } {
  const a = accent;
  const light: Ramp = {
    50: mix(a, WHITE, 0.93),
    100: mix(a, WHITE, 0.86),
    200: mix(a, WHITE, 0.74),
    300: mix(a, WHITE, 0.55),
    400: mix(a, WHITE, 0.25),
    500: a,
    // Primary button background: its white label must stay readable.
    600: pushUntil(mix(a, BLACK, 0.1), BLACK, WHITE, 4.5),
    // Links and accents on light surfaces.
    700: pushUntil(mix(a, BLACK, 0.25), BLACK, WHITE, 4.5),
    800: mix(a, BLACK, 0.4),
    // Headings.
    900: pushUntil(mix(a, BLACK, 0.6), BLACK, WHITE, 7),
  };
  const dark: Ramp = {
    50: mix(a, DARK_BG, 0.92),
    100: mix(a, DARK_BG, 0.85),
    200: mix(a, DARK_BG, 0.75),
    300: mix(a, DARK_BG, 0.6),
    400: mix(a, DARK_BG, 0.1),
    500: a,
    // Links and headings on the dark page (same role as today's dark pink 600/700).
    600: pushUntil(mix(a, WHITE, 0.1), WHITE, DARK_BG, 4.5),
    700: pushUntil(mix(a, WHITE, 0.3), WHITE, DARK_BG, 4.5),
    800: mix(a, WHITE, 0.55),
    900: mix(a, WHITE, 0.8),
  };
  return { light, dark };
}

function vars(r: Ramp): string {
  return STEPS.map((s) => `--color-brand-${s}:${r[s]};`).join("");
}

/**
 * CSS that swaps the brand ramp (and the page's tinted background) for the
 * creator's colour. `:root[data-theme="dark"]` outranks globals.css's
 * `[data-theme="dark"]`. Null = keep TipTang pink (no colour, the default
 * pink, or anything that isn't a hex colour — raw input never reaches CSS).
 */
export function creatorThemeCss(color: unknown): string | null {
  const hex = parseHex(color);
  if (!hex || hex === DEFAULT_PROFILE_COLOR) return null;
  const { light, dark } = creatorRamp(hex);
  const clash = clashesWithTip(hex);
  return (
    `:root{${vars(light)}${clash ? `--color-tip-600:${light[900]};` : ""}}` +
    `:root[data-theme="dark"]{${vars(dark)}${clash ? `--color-tip-600:${dark[900]};` : ""}}` +
    `:root body{background:radial-gradient(1100px 500px at 100% -10%,${light[100]} 0%,transparent 55%),radial-gradient(900px 500px at -10% 0%,#fff4e6 0%,transparent 50%),var(--background);}` +
    `:root[data-theme="dark"] body{background:radial-gradient(1100px 500px at 100% -10%,${dark[200]} 0%,transparent 55%),radial-gradient(900px 500px at -10% 0%,${dark[100]} 0%,transparent 50%),var(--background);}`
  );
}
```

- [ ] **Step 4: Run — expect PASS** (`node --test src/lib/creator-theme.test.ts` → 6 pass), then `npx tsc --noEmit`, `npm test`.

- [ ] **Step 5: Commit** — the two files; message `Creator theme: brand ramp from a channel colour, with contrast guarantees`.

---

### Task 4: Paint the creator's room (donate page + dashboard)

**Files:** Create `src/components/CreatorTheme.tsx`; modify `src/app/[locale]/dashboard/layout.tsx`, `src/app/[locale]/[username]/page.tsx`

**Interfaces:** Consumes `creatorThemeCss(color: unknown): string | null` (Task 3). Produces `<CreatorTheme color={string | null | undefined} />`.

- [ ] **Step 1: Component** — `src/components/CreatorTheme.tsx`

```tsx
import { creatorThemeCss } from "@/lib/creator-theme";

/**
 * Repaints the brand colours with a creator's channel colour while this
 * component is mounted (their donate page or their dashboard). A plain
 * <style> — no href/precedence — so React leaves it in place and removes it
 * when the visitor navigates back to the pink "lobby" pages.
 */
export function CreatorTheme({ color }: { color: string | null | undefined }) {
  const css = creatorThemeCss(color);
  if (!css) return null;
  return <style>{css}</style>;
}
```

- [ ] **Step 2: Dashboard layout** — in `dashboard/layout.tsx` add imports `import { prisma } from "@/lib/prisma";` and `import { CreatorTheme } from "@/components/CreatorTheme";`, then replace `return <>{children}</>;` with:

```tsx
  // The signed-in creator's channel colour paints their own pages.
  const me = session.user.id
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { profileColor: true },
      })
    : null;

  return (
    <>
      <CreatorTheme color={me?.profileColor} />
      {children}
    </>
  );
```

- [ ] **Step 3: Donate page** — in `[username]/page.tsx` import `CreatorTheme` and render `<CreatorTheme color={creator.profileColor} />` as the first child of the element returned by the page component (the wrapper that carries `style={accentStyle}`). Leave the existing `accent`/`--accent` styles as they are.

- [ ] **Step 4: Verify** — `npx tsc --noEmit`, `npx eslint` (5 known errors only), `npm run build`. Visual checks happen in Task 7.

- [ ] **Step 5: Commit** — the three files; message `Creator theme: channel colour paints the donate page and dashboard`.

---

### Task 5: Dark alert card (data, API, overlay, settings)

**Files:**
- Create: `src/lib/alertThemes.ts`, `src/lib/alertThemes.test.ts`, `prisma/migrations/20261004000000_add_alert_theme/migration.sql`
- Modify: `prisma/schema.prisma` (after `alertStyle`), `src/app/api/overlay/asset/route.ts` (after the `alertStyle` branch), `src/app/api/overlay/setup/route.ts`, `src/app/overlay/[username]/page.tsx`, `src/components/OverlayClient.tsx`, `src/components/OverlaySettings.tsx`, `messages/th.json`, `messages/en.json`

**Interfaces:** Consumes Tailwind `bg-tip-400`, `text-tip-900` (Task 2), `DEFAULT_COLOR` from `src/lib/colors.ts`. Produces `ALERT_THEMES`, `type AlertTheme`, `DEFAULT_ALERT_THEME`, `isAlertTheme(v: unknown): v is AlertTheme`; `OverlayClient` prop `alertTheme: string`; setup API field `alertTheme`; asset API kind `"alertTheme"` with form field `theme`.

- [ ] **Step 1: Failing test** — `src/lib/alertThemes.test.ts`

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { ALERT_THEMES, DEFAULT_ALERT_THEME, isAlertTheme } from "./alertThemes.ts";

test("light and dark are the only alert themes; light is the default", () => {
  assert.deepEqual([...ALERT_THEMES], ["light", "dark"]);
  assert.equal(DEFAULT_ALERT_THEME, "light");
});

test("isAlertTheme accepts known themes only", () => {
  assert.equal(isAlertTheme("dark"), true);
  assert.equal(isAlertTheme("light"), true);
  for (const v of ["Dark", "", null, undefined, 1, "neon"]) assert.equal(isAlertTheme(v), false);
});
```

Run `node --test src/lib/alertThemes.test.ts` → FAIL (module not found).

- [ ] **Step 2: Implement** — `src/lib/alertThemes.ts`

```ts
// Look of the OBS donation-alert card. "light" = the original gradient card;
// "dark" = a dark glass card that glows in the creator's alert colour.
// Shared by the overlay (apply), the settings picker and the API (validate).
export const ALERT_THEMES = ["light", "dark"] as const;

export type AlertTheme = (typeof ALERT_THEMES)[number];

export const DEFAULT_ALERT_THEME: AlertTheme = "light";

export function isAlertTheme(v: unknown): v is AlertTheme {
  return typeof v === "string" && (ALERT_THEMES as readonly string[]).includes(v);
}
```

Run → 2 pass.

- [ ] **Step 3: Schema + migration (local only)**
  - `prisma/schema.prisma`, right after the `alertStyle` field:

```prisma
  // Alert card look (src/lib/alertThemes.ts): "light" gradient card or
  // "dark" glow card. Existing creators keep "light".
  alertTheme    String  @default("light")
```

  - `prisma/migrations/20261004000000_add_alert_theme/migration.sql`:

```sql
-- OBS alert card theme: "light" (original gradient card) or "dark" (glow card).
-- Existing creators keep the light card.
ALTER TABLE "User" ADD COLUMN "alertTheme" TEXT NOT NULL DEFAULT 'light';
```

  - Run `npx prisma generate` (no database contact). **Do not** run `migrate deploy` here.

- [ ] **Step 4: API**
  - `asset/route.ts`: add `import { isAlertTheme } from "@/lib/alertThemes";` and, directly after the `alertStyle` branch:

```ts
  // Alert card theme (light gradient card / dark glow card).
  if (kind === "alertTheme") {
    const theme = String(form?.get("theme") ?? "");
    if (!isAlertTheme(theme)) {
      return NextResponse.json({ error: "invalid" }, { status: 400 });
    }
    await prisma.user.update({
      where: { id: session.user.id },
      data: { alertTheme: theme },
    });
    revalidateOverlay();
    return NextResponse.json({ ok: true, theme });
  }
```

  - `setup/route.ts`: add `alertTheme: true,` to the `select` (next to `alertStyle`) and `alertTheme: user.alertTheme,` to the JSON response (next to `alertStyle`).
  - `overlay/[username]/page.tsx`: add `alertTheme: true,` to the `select`; import `{ DEFAULT_ALERT_THEME, isAlertTheme }` from `@/lib/alertThemes`; pass

```tsx
      alertTheme={isAlertTheme(user.alertTheme) ? user.alertTheme : DEFAULT_ALERT_THEME}
```

- [ ] **Step 5: Dark card in `OverlayClient.tsx`**
  - Add prop `alertTheme` (type `string`) to the destructured props and the props type; import `DEFAULT_COLOR` from `@/lib/colors`.
  - Replace the `cardStyle` computation with:

```tsx
  const dark = alertTheme === "dark";
  const glow = useCustom ? color! : DEFAULT_COLOR;
  const cardStyle = dark
    ? {
        borderColor: glow,
        boxShadow: `0 0 0 1px ${glow}66, 0 0 32px ${glow}80, 0 24px 48px -16px rgba(0,0,0,0.7)`,
      }
    : useCustom
      ? {
          backgroundImage: `linear-gradient(to bottom right, ${color}, ${darken(color!, 0.3)})`,
        }
      : undefined;
```

  - In the card `className`, replace `shadow-2xl ring-1 ring-white/20 ${useCustom ? "" : "bg-gradient-to-br from-brand-500 to-brand-700"}` with:

```tsx
shadow-2xl ${
            dark
              ? "border-[1.5px] bg-[#120c16]/90 backdrop-blur-md"
              : `ring-1 ring-white/20 ${useCustom ? "" : "bg-gradient-to-br from-brand-500 to-brand-700"}`
          }
```

  - Right after the `{isBig && ( … SUPER TIP! … )}` block insert:

```tsx
          {dark && !isBig && (
            <p
              className="mb-2 text-xs font-bold uppercase tracking-widest"
              style={{ color: glow }}
            >
              ทิปใหม่!
            </p>
          )}
```

  - Amount badge `className="rounded-full bg-white/25 px-3 py-1 text-lg font-black"` → `className={\`rounded-full px-3 py-1 text-lg font-black ${dark ? "bg-tip-400 text-tip-900" : "bg-white/25"}\`}`.

- [ ] **Step 6: Settings picker in `OverlaySettings.tsx`**
  - `Config` type: add `alertTheme: string;` after `alertStyle`. In `load()`: add `alertTheme: d.alertTheme ?? "light",` after `alertStyle`.
  - Import `{ ALERT_THEMES, DEFAULT_ALERT_THEME }` from `@/lib/alertThemes`.
  - After `saveAlertStyle` add:

```tsx
  // Alert card theme — saved immediately on pick.
  async function saveAlertTheme(theme: string) {
    setConfig((c) => (c ? { ...c, alertTheme: theme } : c));
    const fd = new FormData();
    fd.set("kind", "alertTheme");
    fd.set("theme", theme);
    await fetch("/api/overlay/asset", { method: "POST", body: fd });
  }
```

  - Immediately before the `{/* Alert animation style */}` block insert:

```tsx
              {/* Alert card theme */}
              <div className="rounded-xl bg-brand-50 p-3">
                <p className="mb-1 flex items-center gap-2 text-sm font-medium text-brand-900/80">
                  <Icon name="palette" />
                  {t("obsAlertTheme")}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {ALERT_THEMES.map((th) => {
                    const active = (config.alertTheme || DEFAULT_ALERT_THEME) === th;
                    return (
                      <button
                        key={th}
                        type="button"
                        aria-pressed={active}
                        onClick={() => saveAlertTheme(th)}
                        className={`rounded-xl border-2 p-2 text-left text-sm font-medium transition ${
                          active ? "border-brand-600" : "border-transparent hover:border-brand-200"
                        }`}
                      >
                        <span
                          className={`mb-2 flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-[11px] font-bold text-white ${
                            th === "dark"
                              ? "border border-brand-400 bg-[#120c16] shadow-[0_0_12px_rgba(236,72,153,0.45)]"
                              : "bg-gradient-to-br from-brand-500 to-brand-700"
                          }`}
                        >
                          <span className="inline-flex items-center gap-1">
                            <Icon name="heart" className="h-3 w-3" />
                            {t("obsThemeSample")}
                          </span>
                          <span
                            className={`rounded-full px-1.5 ${
                              th === "dark" ? "bg-tip-400 text-tip-900" : "bg-white/25"
                            }`}
                          >
                            ฿100
                          </span>
                        </span>
                        <span className="text-brand-900">
                          {th === "dark" ? t("obsThemeDark") : t("obsThemeLight")}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-xs text-brand-900/50">{t("obsAlertThemeHint")}</p>
              </div>
```

  - Messages, `dashboard` namespace — th: `obsAlertTheme` "ธีมการ์ดแจ้งเตือน", `obsThemeLight` "การ์ดสว่าง", `obsThemeDark` "การ์ดมืด", `obsThemeSample` "ผู้สนับสนุน", `obsAlertThemeHint` "การ์ดมืดเรืองแสงตามสีการ์ดที่ตั้งไว้ด้านบน เด่นชัดบนเกมฉากสว่าง"; en: "Alert card theme", "Light card", "Dark card", "Supporter", "The dark card glows in the card colour set above — stands out over bright games".

- [ ] **Step 7: Verify** — `node --test src/lib/alertThemes.test.ts`, `npx tsc --noEmit`, `npx eslint` (5 known), `npm test`, `npm run build`. (Runtime checks in Task 7 on a local DB.)

- [ ] **Step 8: Commit** — all Task 5 files; message `Overlay: optional dark alert card (alertTheme), picker in OBS settings`.

---

### Task 6: LINE Seed Sans TH font

**Precondition:** the founder has approved downloading `LINE_Seed_Sans_TH.zip` (1,244,389 bytes) from `https://seed.line.me/src/images/fonts/LINE_Seed_Sans_TH.zip`.

**Files:** Create `src/app/fonts.ts`, `src/app/fonts/LINESeedSansTH-Regular.woff2`, `…-Bold.woff2`, `…-ExtraBold.woff2` (or `.ttf` if the package has no woff2), `src/app/fonts/LINESeedSansTH-OFL.txt`; modify `src/app/[locale]/layout.tsx`, `src/app/overlay/layout.tsx`, `src/app/globals.css` (body `font-family`)

**Interfaces:** Produces `lineSeed` (`next/font/local` result with `.variable` = class that defines `--font-line-seed`).

- [ ] **Step 1: Download and inspect** (scratchpad, not the repo): `curl -L -o "$SP/LINE_Seed_Sans_TH.zip" https://seed.line.me/src/images/fonts/LINE_Seed_Sans_TH.zip`; unzip with `powershell -NoProfile -Command "Expand-Archive -Path '<zip>' -DestinationPath '<dir>'"`; list files. Pick the Regular, Bold and ExtraBold files of the **web** set (woff2 preferred, else ttf) and the licence text (OFL).

- [ ] **Step 2: Copy into the repo** as `src/app/fonts/LINESeedSansTH-Regular.woff2`, `LINESeedSansTH-Bold.woff2`, `LINESeedSansTH-ExtraBold.woff2` (keep the real extension) and `LINESeedSansTH-OFL.txt`. Record original names and byte sizes in the commit message body.

- [ ] **Step 3: `src/app/fonts.ts`** (adjust extensions to the copied files):

```ts
import localFont from "next/font/local";

// LINE Seed Sans TH (SIL OFL 1.1 — licence in ./fonts/LINESeedSansTH-OFL.txt),
// self-hosted so every device renders the same Thai. 500/600 map to the
// nearest provided weights; the system stack in globals.css is the fallback.
export const lineSeed = localFont({
  src: [
    { path: "./fonts/LINESeedSansTH-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/LINESeedSansTH-Bold.woff2", weight: "700", style: "normal" },
    { path: "./fonts/LINESeedSansTH-ExtraBold.woff2", weight: "800", style: "normal" },
  ],
  variable: "--font-line-seed",
  display: "swap",
});
```

- [ ] **Step 4: Apply**
  - `[locale]/layout.tsx`: `import { lineSeed } from "../fonts";` and change `<html lang={locale} className="h-full antialiased" …>` to `className={\`${lineSeed.variable} h-full antialiased\`}`.
  - `overlay/layout.tsx`: `import { lineSeed } from "../fonts";` and add `className={lineSeed.variable}` to `<html>`.
  - `globals.css` body `font-family`: put `var(--font-line-seed),` first, keep the existing stack after it.

- [ ] **Step 5: Verify** — `npx tsc --noEmit`, `npm run build` (fonts emitted under `.next/static/media`), then in Task 7: computed `font-family` of `body` starts with the LINE Seed family name on landing and on an overlay page; with the font request blocked the page still renders Thai in the fallback (Review Focus 5).

- [ ] **Step 6: Commit** — font files, licence, `fonts.ts`, the two layouts, `globals.css`; message `Font: self-hosted LINE Seed Sans TH (400/700/800, OFL)`.

---

### Task 7: What's new + end-to-end visual verification

**Files:** Modify `src/lib/updates.ts` (two entries at the top)

- [ ] **Step 1: Entries** — add at the top of `UPDATES`:

```ts
  {
    id: "2026-10-04-channel-colour",
    date: "2026-10-04",
    tags: ["creator"],
    href: "/dashboard/settings",
    th: {
      title: "สีช่องของคุณ ใช้ทั้งห้อง",
      body: "สีช่องที่ตั้งในหน้าตั้งค่า ตอนนี้เปลี่ยนสีทั้งหน้าโดเนทและแดชบอร์ดของคุณ ทั้งปุ่ม ลิงก์ และเมนู",
    },
    en: {
      title: "Your channel colour, everywhere in your space",
      body: "The channel colour from settings now paints your whole donate page and dashboard — buttons, links and menus.",
    },
  },
  {
    id: "2026-10-04-dark-alert-card",
    date: "2026-10-04",
    tags: ["creator"],
    href: "/dashboard/overlay",
    th: {
      title: "การ์ดแจ้งเตือนแบบมืด",
      body: "เลือก \"การ์ดมืด\" ในหน้า OBS ได้แล้ว พื้นเข้มเรืองแสงตามสีการ์ดของคุณ ยอดทิปเด่นด้วยสีส้ม เห็นชัดบนเกมฉากสว่าง",
    },
    en: {
      title: "Dark alert card",
      body: "Pick \"Dark card\" on the OBS page: a dark card that glows in your alert colour, with the tip amount in orange — easy to see over bright games.",
    },
  },
```

`npm test` (updates tests: unique ids, newest first) → pass. Commit `What's new: channel colour + dark alert card`.

- [ ] **Step 2: Local DB** — `npx prisma dev --name tiptang-brand --detach`; with `DIRECT_URL=<that local URL>` run `npx prisma migrate deploy`; create temporary `.env.development.local` with `DATABASE_URL`/`DIRECT_URL` = local URL and `STORAGE_DRIVER="local"`; start the dev server (preview `tiptang-dev`). Register a throwaway creator through `/api/register`.

- [ ] **Step 3: Checks** (screenshots for the report)
  - Landing (light + dark): eyebrow "Every Tip Matters · ฟรี 0%", footer tagline, FAQ 4 present; no "TipMe" elsewhere; `body` font is LINE Seed.
  - Creator with no colour: dashboard pink, amounts orange (`text-tip-600` computed `rgb(194, 65, 12)` light / `rgb(255, 164, 99)` dark).
  - Set channel colour violet `#7c3aed`, then amber `#f59e0b`, then slate `#64748b` (Settings): dashboard and donate page fully recoloured incl. header/footer, light + dark; amber → amounts not orange (clash rule).
  - From the donate page click the logo (client navigation) → landing is pink again (Review Focus 3).
  - OBS page: theme picker visible; pick "การ์ดมืด" → `/overlay/<user>?key=…&test=1` shows dark card with glow + orange badge, normal and big tip; pick light → original card. Goal/timer overlays unchanged.
  - Font fallback (Review Focus 5): computed `font-family` of `body` lists the LINE Seed family first and still contains `"Noto Sans Thai"` / `Tahoma` after it; `document.fonts.check('16px "LINE Seed Sans TH"')`-style check (use the family name Next generated, read from the computed style) is true after load.

- [ ] **Step 4: Clean up** — stop dev server; delete `.env.development.local`; `npx prisma dev stop tiptang-brand` and `npx prisma dev rm tiptang-brand`; remove throwaway uploads; `git status` shows only `?? .claude/`.

- [ ] **Step 5: Final verification** — `npx tsc --noEmit`, `npx eslint` (5 known), `npm test`, `npm run build`.
