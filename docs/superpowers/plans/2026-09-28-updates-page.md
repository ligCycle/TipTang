# "What's new" Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** Public dated changelog at `/[locale]/updates` + an unseen-updates dot on the dashboard.
**Spec:** `docs/superpowers/specs/2026-09-28-updates-page-design.md`.
**Constraints:** no migration · lint stays at 5 · never push before "merge push" · commits end with
`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

### Task 1: Data + logic (TDD)
- [ ] `src/lib/updates.test.ts`: newest-first, unique ids starting with `date + "-"`, tags ⊂
  {creator, supporter, security}, dates match `^\d{4}-\d{2}-\d{2}$`, `hasUnseenUpdate(null)` true,
  `hasUnseenUpdate(UPDATES[0].id)` false, `hasUnseenUpdate(UPDATES[1].id)` true.
- [ ] Run → fails (module missing).
- [ ] `src/lib/updates.ts`: `UpdateTag`, `Update`, `UPDATES` (7 entries), `UPDATES_SEEN_KEY =
  "tiptang_last_seen_update"`, `latestUpdateId()`, `hasUnseenUpdate(lastSeen: string | null)`.
- [ ] Run → pass; commit.

### Task 2: Page + copy + footer + sitemap
- [ ] i18n namespace `updates` (title, intro, metaDescription, tagCreator, tagSupporter,
  tagSecurity, tryIt) and `common.updates` in th + en.
- [ ] `src/app/[locale]/updates/page.tsx`: `generateMetadata` (title, description, canonical,
  hreflang), `setRequestLocale`, group `UPDATES` by `date`, render dated sections with tag chips,
  title, body, optional `<Link href={u.href}>` "ลองเลย →"; mounts `<MarkUpdatesSeen />`.
- [ ] `src/components/MarkUpdatesSeen.tsx`: client, `useEffect` writes `latestUpdateId()` to
  localStorage (try/catch) and dispatches a `storage`-style event so an open dashboard updates.
- [ ] Footer link in `src/app/[locale]/layout.tsx`; sitemap entry per locale (priority 0.6).
- [ ] tsc/eslint; commit.

### Task 3: Dashboard dot
- [ ] `src/components/UpdatesPill.tsx`: client pill `<Link href="/{locale}/updates">` with
  `useSyncExternalStore(subscribe(storage events), () => localStorage value, () => latestUpdateId())`;
  red dot + `sr-only` "new" when `hasUnseenUpdate(value)`.
- [ ] Mount in `src/app/[locale]/dashboard/page.tsx` after the guide pill (same `pillClass`, passed
  as a prop).
- [ ] tsc/eslint/test/build; commit.

### Task 4: Verify on localhost
- [ ] `/th/updates`, `/en/updates` (titles, dates, chips, links), phone width, footer link, sitemap.
- [ ] Dashboard: dot visible with empty storage → visit updates → back → dot gone.
