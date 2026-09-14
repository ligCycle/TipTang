# Donate Page Layout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** หน้าโดเนทให้ฟอร์มเห็นทันที เป็นกล่องเดียวในหน้า สองคอลัมน์บนเดสก์ท็อป คอลัมน์เดียวเรียงถูกลำดับบนมือถือ

**Architecture:** แก้เฉพาะส่วน `return` ของ `src/app/[locale]/[username]/page.tsx` — root เป็น CSS grid ที่ `lg` (header เต็มแถว · main ซ้าย · aside ขวา) ลำดับ DOM = ลำดับมือถือ ไม่ใช้ `order-*` · ถอด `.card` ออกจากหัว/goal/อันดับ/ล่าสุด เหลือ `TipForm` (ซึ่งมี `.card` ของตัวเอง) เป็นกล่องเดียว · ข้อมูล/query/ตัวแปรด้านบน `return` ไม่แตะ ยกเว้นลบ `cardTint` ที่ไม่มีใครใช้แล้ว

**Tech Stack:** Next.js 16.2 App Router (server component) · Tailwind v4 · next-intl

**Spec:** `docs/superpowers/specs/2026-09-14-donate-page-layout-design.md`

## Global Constraints

- ทำบน branch ใหม่ `donate-layout` แยกจาก `main` · **ห้าม push** จนผู้ใช้ทดสอบ
- **ไม่แตะ `TipForm.tsx` / `ShopCheckout.tsx`** · ไม่แตะ query/ตัวแปรเหนือ `return` ยกเว้นลบ `cardTint`
- ไม่เพิ่ม i18n (ใช้ `topSupporters` `recentSupporters` `goalDefaultTitle` `goalProgress` `noSupporters` `namePlaceholder` `notConfigured` ที่มีอยู่)
- `npm run lint` error คงที่ **5**
- `.card` ในหน้าต้องเหลือ **1** (ของ TipForm) จาก 16
- หลัง `npm run build` ต้อง `rm -rf .next` ก่อน start dev ใหม่ (stale build ทำ API 404)

---

## File Structure

| ไฟล์ | หน้าที่ | สถานะ |
|---|---|---|
| `src/app/[locale]/[username]/page.tsx` | ส่วน `return` ทั้งก้อน + ลบ `cardTint` | แก้ |

---

### Task 1: โครงหน้าใหม่

**Files:**
- Modify: `src/app/[locale]/[username]/page.tsx:211-213` (ลบ `cardTint`) และ `215` ถึงท้ายไฟล์ (แทน `return` ทั้งก้อน)

**Interfaces:**
- Consumes (มีอยู่แล้วเหนือ `return`): `accentStyle` `accentGradient` `accent` `initial` `creator` `socials` `SOCIAL_PLATFORMS` `goalAmount` `goalPct` `raised` `topSupporters` `tips` `shopItems` `canTip` `t` `currencyLocale` `jsonLd` · components `Icon` `SocialIcon` `TipForm` `ShopCheckout` · `formatBaht`

- [ ] **Step 1: branch**

```bash
git checkout -b donate-layout
```

- [ ] **Step 2: ลบ `cardTint`**

ลบ 3 บรรทัดนี้ (ไม่มีใครใช้หลังแก้ — `TipForm` ทำ tint ของตัวเองจาก `accentColor`):

```ts
  // Translucent accent wash layered over each card's own bg — tints the whole
  // page in the creator's color while staying readable in light & dark mode.
  const cardTint = `linear-gradient(155deg, color-mix(in srgb, ${accent} 16%, transparent), color-mix(in srgb, ${accent} 5%, transparent))`;
```

- [ ] **Step 3: แทน `return (...)` ทั้งก้อนจนถึงท้ายไฟล์**

```tsx
  return (
    <div
      className="mx-auto max-w-5xl lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-8"
      style={accentStyle}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Profile header — full width and NOT a card. The tip form below is the
          only card on the page, so that is where the eye lands. DOM order here
          (header → form → sidebar) is also the mobile order; the grid only
          rearranges it at lg. */}
      <header className="lg:col-span-2">
        <div
          className="h-24 w-full overflow-hidden rounded-3xl sm:h-32"
          style={{ backgroundImage: accentGradient }}
        >
          {creator.coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={creator.coverUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          )}
        </div>
        <div className="flex flex-wrap items-end gap-x-5 gap-y-3 px-2 sm:px-4">
          {/* Avatar overlaps the bottom edge of the cover */}
          <div
            className="-mt-10 flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-white text-3xl font-black text-white shadow-lg"
            style={{ backgroundImage: accentGradient }}
          >
            {creator.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={creator.avatarUrl}
                alt={creator.displayName}
                className="h-full w-full object-cover"
              />
            ) : (
              initial
            )}
          </div>
          <div className="min-w-0 flex-1 pt-2">
            <h1 className="text-2xl font-extrabold text-brand-900 sm:text-3xl">
              {creator.displayName}
            </h1>
            <p className="text-sm font-medium" style={{ color: accent }}>
              @{creator.username}
            </p>
          </div>
          {SOCIAL_PLATFORMS.some((p) => socials[p.key]) && (
            <div className="flex flex-wrap items-center gap-2 pt-2">
              {SOCIAL_PLATFORMS.filter((p) => socials[p.key]).map((p) => (
                <a
                  key={p.key}
                  href={socials[p.key]}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  title={p.label}
                  aria-label={p.label}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-black/5 bg-white shadow-sm transition hover:scale-110 hover:shadow"
                >
                  <SocialIcon platform={p.key} />
                </a>
              ))}
            </div>
          )}
        </div>
        {creator.bio && (
          <p className="mt-3 max-w-2xl px-2 text-brand-900/70 sm:px-4">
            {creator.bio}
          </p>
        )}
      </header>

      {/* Main column — the one card on the page */}
      <div className="mt-6 space-y-8">
        {canTip ? (
          <TipForm
            username={creator.username}
            creatorName={creator.displayName}
            accentColor={accent}
          />
        ) : (
          <div className="card rounded-2xl p-6 text-center text-brand-900/70">
            {t("notConfigured")}
          </div>
        )}

        {shopItems.length > 0 && (
          <ShopCheckout
            username={creator.username}
            items={shopItems}
            accentColor={accent}
          />
        )}
      </div>

      {/* Sidebar — social proof. Headings and dividers, no boxes, so it
          reads as context rather than competing with the form. */}
      <aside className="mt-8 space-y-8 lg:mt-6">
        {goalAmount > 0 && (
          <section>
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="flex min-w-0 items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand-900/60">
                <Icon name="target" />
                <span className="truncate">
                  {creator.goalTitle || t("goalDefaultTitle")}
                </span>
              </h2>
              <span
                className="shrink-0 text-sm font-bold tabular-nums"
                style={{ color: accent }}
              >
                {goalPct}%
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-brand-100">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, goalPct)}%`,
                  backgroundImage: `linear-gradient(to right, ${accent}, color-mix(in srgb, ${accent}, black 20%))`,
                }}
              />
            </div>
            <p className="mt-2 text-sm tabular-nums text-brand-900/70">
              {t("goalProgress", {
                raised: formatBaht(raised, currencyLocale),
                goal: formatBaht(goalAmount, currencyLocale),
              })}
            </p>
          </section>
        )}

        {topSupporters.length > 0 && (
          <section>
            <h2 className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand-900/60">
              <Icon name="trophy" />
              {t("topSupporters")}
            </h2>
            <ol className="divide-y divide-brand-900/10">
              {topSupporters.map((s, i) => (
                <li key={s.name} className="flex items-center gap-3 py-2.5">
                  <span
                    className="w-5 shrink-0 text-sm font-black tabular-nums"
                    style={{ color: accent }}
                  >
                    {i + 1}
                  </span>
                  <span
                    className={`min-w-0 flex-1 truncate text-brand-800 ${
                      i === 0 ? "font-bold" : "font-medium"
                    }`}
                  >
                    {s.name}
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-brand-700">
                    {formatBaht(s.total, currencyLocale)}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}

        <section>
          <h2 className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand-900/60">
            <Icon name="heart" />
            {t("recentSupporters")}
          </h2>
          {tips.length === 0 ? (
            <p className="py-2 text-sm text-brand-900/50">{t("noSupporters")}</p>
          ) : (
            <ul className="divide-y divide-brand-900/10">
              {tips.map((tip) => (
                <li key={tip.id} className="py-3">
                  <div className="flex items-center gap-3">
                    <span className="min-w-0 flex-1 truncate font-medium text-brand-800">
                      {tip.supporterName || t("namePlaceholder")}
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-brand-700">
                      {formatBaht(Number(tip.amount), currencyLocale)}
                    </span>
                  </div>
                  {tip.message && (
                    <p className="mt-1 text-sm text-brand-900/70">{tip.message}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}
```

- [ ] **Step 4: ตรวจ type + lint**

Run: `npx tsc --noEmit` → ผ่านเงียบ (ถ้าฟ้อง `cardTint` unused/undefined = ขั้น 2 ไม่ครบ)
Run: `npm run lint 2>&1 | grep problems` → `✖ 5 problems`

- [ ] **Step 5: Commit**

```bash
git add "src/app/[locale]/[username]/page.tsx"
git commit -m "Put the tip form first on the donate page; two columns on desktop

The form is now the only card on the page. Header, goal, leaderboard and
recent supporters drop their boxes and become headings with dividers in a
sidebar, so the page reads as \"here is where you donate, and here is who
already did\" instead of a stack of equal cards with the form buried
fourth. DOM order doubles as the mobile order.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: ตรวจตาม spec

**Files:** ไม่แก้

- [ ] **Step 1: dev server สะอาด**

`npm run build` ผ่าน → `rm -rf .next` → `preview_start` `tiptang-dev`

- [ ] **Step 2: นับกล่อง + ข้อมูลเท่าเดิม (ไม่ต้องล็อกอิน)**

Run:
```bash
node -e "fetch('http://localhost:3000/th/lig_1569').then(r=>r.text()).then(h=>{
  const cards=(h.match(/class=\"[^\"]*\bcard\b/g)||[]).length;
  const t=h.replace(/<script[\s\S]*?<\/script>/g,'').replace(/<[^>]+>/g,'|').replace(/\|+/g,'|');
  console.log('cards:',cards,'(ต้อง 1)');
  console.log('goal:',(t.match(/\|(\d+)%\|[^|]*\|ได้รับแล้ว[^|]*/)||['?'])[0]);
  console.log('มี TipForm:',/สร้าง QR พร้อมเพย์/.test(t));
})"
```
Expected: `cards: 1` · goal เท่าก่อนแก้ (`0% … ฿0.00 จาก ฿10,000.00`) · TipForm true

- [ ] **Step 3: ลำดับมือถือจาก DOM**

Run:
```bash
node -e "fetch('http://localhost:3000/th/lig_1569').then(r=>r.text()).then(h=>{
  const order=[...h.matchAll(/<(header|aside)|สร้าง QR พร้อมเพย์|อันดับผู้สนับสนุน|ผู้สนับสนุนล่าสุด/g)].map(m=>m[0]);
  console.log(order.join(' → '));
  console.log('มี order-*:', /\border-\d/.test(h));
})"
```
Expected: `<header → สร้าง QR พร้อมเพย์ → <aside → อันดับผู้สนับสนุน → ผู้สนับสนุนล่าสุด` · `order-*: false`

- [ ] **Step 4: ดูจริงในเบราว์เซอร์ (หน้าสาธารณะ ผมเปิดเองได้)**

`navigate` `/th/lig_1569` → `resize_window` desktop → screenshot: หัวเต็มแถว, ฟอร์มซ้าย, sidebar ขวา, **ฟอร์มเห็นโดยไม่เลื่อน**
→ `resize_window` mobile → screenshot: คอลัมน์เดียว ฟอร์มถัดจากหัว · `javascript_tool`: `document.documentElement.scrollWidth <= innerWidth` (ไม่มี scroll แนวนอน)
→ `resize_window` colorScheme dark → screenshot อ่านออก
→ `read_console_messages onlyErrors` → ว่าง
→ กดปุ่ม "สร้าง QR พร้อมเพย์" (`find` → `computer left_click`) → ต้องขึ้น QR (TipForm ไม่กระทบ)
→ `navigate` `/th/nongmewtumarai` → เรนเดอร์ปกติ (มี goal มีทิป)

- [ ] **Step 5: รายงาน — ไม่ push**

สรุป commit, ผลตรวจ, ภาพ (ถ้าถ่ายได้) แล้วรอผู้ใช้

---

## Self-review

**Spec coverage** — ฟอร์มเห็นทันที + กล่องเดียว (T1 โครง) · grid lg / DOM = mobile order (T1 root + T2 ขั้น 3) · header ไม่ใช่กล่อง + cover คงอยู่ (T1 header) · sidebar หัวข้อ+เส้น (T1 aside) · ลบ cardTint (T1 ขั้น 2) · ไม่แตะ TipForm/ShopCheckout ✓ · ไม่เพิ่ม i18n ✓ · ทดสอบ 7 ข้อของ spec อยู่ใน T2

**Placeholder scan** — ไม่มี

**Type consistency** — ใช้ตัวแปร/คอมโพเนนต์ที่มีอยู่จริงในไฟล์ทั้งหมด (`SOCIAL_PLATFORMS` `socials` `initial` `accentGradient` `accentStyle` `jsonLd` `Icon` `SocialIcon` `TipForm` `ShopCheckout` `formatBaht`) · `Icon` name ที่ใช้ `target` `trophy` `heart` มีใน `IconName` ✓
