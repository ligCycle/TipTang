# กาชา (rarity capsule) — design

Project 8 of the "เพิ่มลูกเล่นการโดเนท" roadmap. The master plan is `C:\Users\ggtan\.claude\plans\1-2-drifting-lemur.md`, approved 2026-10-23.

Founder decisions:
- A gacha box with three rarities: ธรรมดา, หายาก, สุดหายาก.
- The system sets the odds (70/25/5) and the creator can adjust them.
- Fans always see the percentages before they tip.

Calls marked *ruling* are mine. The wheel (project 3, `src/lib/wheel.ts`, `wheel-server.ts`) is the pattern to reuse throughout.

## Fan side (donate page)

- **Checkbox card:** "สุ่มกาชา ฿<price>", shown when the card is on and the box has at least one prize.
- **Odds disclosure:** a "ดูโอกาส" link opens the list. It shows each rarity with its *effective* odds and its prizes.
  - A rarity with no prizes shows 0%, and the others are scaled up proportionally.
  - Prizes inside a rarity have equal odds.
- **Price:**
  - Default price is ฿50.
  - It adds to the other extras through `extrasFloor`.
  - Locked below the floor; the amount is never raised.
  - *Ruling G1:* when the amount falls short, extras drop in this order: clip/voice, then gacha, then wheel, then sound (newest first). The server checks in the reverse order: sound, then wheel, then gacha, then media.
- **What the form sends:** `gachaSeen` = the box version the fan looked at (`gachaVersion`, an integer bumped on every odds or prize change).
  - If the version changed before the tip arrives, the pull is dropped (`gachaDropped`). The fan must never get odds they didn't see.

## Data

User fields:

| Field | Default |
|---|---|
| `gachaEnabled` | `false` |
| `gachaPrice` | `50` |
| `gachaCommon` | `70` |
| `gachaRare` | `25` |
| `gachaEpic` | `5` |
| `gachaVersion` | `0` |
| `gachaColor` | null |

`GachaPrize`:
- Fields: `{id, userId, rarity ("common"|"rare"|"epic"), text ≤ 40, imageUrl?, noAction Boolean, position, deletedAt?, createdAt}`.
- At most 10 per rarity and 24 in total (*ruling*).

`Tip.gachaPull Boolean @default(false)`: the fan asked for a pull and it stood at creation.

`GachaPull`:
- Fields: `{id, userId, tipId @unique (cascade), rarity, prizeId? (no FK), prizeText, imageUrl?, noAction, status ACTIVE|CANCELLED, confirmedAt, playedAt?, doneAt?, createdAt}`.
- The prize is snapshotted, so editing or deleting a prize later doesn't change past results.

Schema is folded into the unapplied feature_hub migration, with RLS on.

## Draw (R5 pipeline)

- **When it runs:** `gachaStartTx(tx, tipId, now)` runs at confirm, before the status update, like `startSpinTx`.
- **New pull:**
  1. Read the current odds and live prizes.
  2. Compute the effective odds.
  3. Draw a rarity with `crypto.randomInt`, then a prize uniformly within it.
  4. Create the pull.
- **Re-confirm after a reject:** the earlier pull goes back to ACTIVE with the same result. There is no re-roll.
- **Empty box at confirm** (no live prizes): returns `"empty"`.
  - The confirm route gives **409 `gacha_empty`**, the same flow as `wheel_empty`. The dashboard asks the creator, and `force` confirms without a pull.
  - The auto-confirm path drops the pull and tells the fan (`gachaDropped`).
- **Reject:** `cancelGachaTx` sets the pull to CANCELLED. It runs in `onTipRejectedTx` after `cancelSpinTx`.
- **Locks:** there is no prize row lock. The snapshot makes concurrent edits harmless. Lock order is unchanged.

## Overlay (`/overlay/<u>/gacha`, R6)

- **Polling:** the overlay polls every 3 s and claims the oldest unplayed ACTIVE pull from the last hour by setting `playedAt` (`nextOverlaySpin` pattern), so a pull shows once across sources.
- **Animation:** about 6 s in total.
  - A capsule drops in and shakes.
  - It cracks open in the rarity colour: ธรรมดา slate, หายาก violet, สุดหายาก gold with sparkle.
  - The reveal shows "<fan> ได้ <prize>!" with a rarity badge, then hides.
  - Plain CSS keyframes, no libraries.
- **Test:** a Redis test like `pushWheelTest`, shaped `GachaTest = {id, rarity, prizeText}`. It is never claimed and lasts 15 s.

## Creator side

- **Hub card:** "กาชา" (`gacha`), icon `gift`, fan-page tag, `obsPath: "/gacha"`, `obsSize: "500×500"`.
  - The `gachaToggle` needs the random-feature rules (*ruling G2*): one acceptance, `wheelRulesAcceptedAt`, covers the wheel and the gacha. The rules dialog text is extended to name both. Turning it on without having accepted returns 409 `rules`, and the page opens the shared checklist.
- **Settings page** (`/dashboard/features/gacha`):
  - ① **Odds:** three linked sliders that always sum to 100 (`rebalance`), the effective-odds preview, and "คืนค่าเริ่มต้น 70/25/5".
  - ② **Prizes:** per rarity, a list with text, an optional library picture (STICKER) and "ไม่ต้องทำอะไร" (noAction), plus add, delete and reorder.
  - ③ **Price.**
  - ④ **OBS link, colour, test, preview.**
  - Every odds or prize change bumps `gachaVersion`.
- **To-do list:** `todoItems` adds `kind: "gacha"` for ACTIVE pulls with `noAction=false`. It shows the fan, the prize and the rarity, with done/undo, and is shared with the wheel and combo items.
- **Tip row:** a badge "กาชา: <prize> (<rarity>)".
- **Terms:** the random-features section adds that gacha results come from the system's draw at the displayed odds. The no-money rule stays.

## Rulings (P8)

- **G1:** drop order media → gacha → wheel → sound. `mediaExtrasDrop` gains a `gacha` slot.
- **G2:** one rules acceptance covers both random features.
- **G3:** the version check protects the odds the fan saw. A mismatch drops the pull and never blocks the tip.
- **G4:** the prize is snapshotted at draw time.
- **G5:** an empty box at confirm behaves like the wheel: 409 plus force on manual confirm, dropped on auto-confirm.

## Builder-check rulings (opus, 2026-10-23). These override the sections above.

- **K1. Snapshot on the tip** (replaces G3 and G5).
  - At creation the server checks `gachaSeen === gachaVersion`. A mismatch means `gachaDropped`.
  - If the versions match, it writes `Tip.gachaBox Json` = `{odds, prizes:[{id, rarity, text, imageUrl, noAction}]}`, taken from live prizes.
  - At confirm, the draw uses that snapshot, so the fan gets exactly the odds they saw, even hours later.
  - A box can't be empty at confirm, so there is no `gacha_empty` 409, and the wheel's 409 contract is untouched.
- **K2. Draw placement.**
  - Manual confirm: `gachaStartTx` runs after `startSpinTx`, inside the same Tip-locked transaction.
  - Auto-confirm: it runs in the main transaction after the spin, with its own retry guarded by `stillConfirmed`, kept separate from the spin retry.
  - Dropped or failed: `Tip.gachaPull = false`, so a later reject and re-confirm never draws.
  - Re-confirm restores the earlier pull, keeping `playedAt`, so it doesn't replay.
- **K3. No User lock is needed for the draw.** It reads only the tip's snapshot.
- **K4. To-do list.**
  - `TodoItem` gets `kind: "gacha"` and `rarity`.
  - `PATCH /api/wheels/spins` gets a gacha branch.
  - `SpinTodo` and the todo overlay show a rarity chip.
  - Only `noAction = false` pulls are listed.
- **K5. Separate rules acceptance** (replaces G2). The wheel's rules promise equal odds, which doesn't hold for the gacha.
  - `User.gachaRulesAcceptedAt`.
  - Its own 3-point checklist: odds are set by the creator and shown to fans; prizes must not be money or have money value; the creator is responsible for delivering them.
  - `POST /api/gacha/rules` enables only the gacha.
  - The terms' random-features bullet is reworded: the wheel has equal slots; the gacha uses the displayed rarity odds.
- **K6. All-zero fallback.** If every rarity that has prizes is set to 0%, those rarities share evenly. The settings page warns, and a 0% rarity that has prizes shows "0% (ไม่ออก)" when others can come out.
- **K7. Display.** Show rarity percentages only, plus "ของในระดับเดียวกันมีโอกาสเท่ากัน". The figures use the largest remainder and always sum to 100.
- **K8. Server floors.**
  - Gacha is checked after the wheel: `extrasFloor(min, [sound, spin, gachaPrice])`.
  - Clip and voice use `[sound, spin, gacha, theirMin]`.
- **K9. The card shows only** when there is at least one live prize and the effective weights total more than 0. Deleting a prize soft-deletes it and bumps the version.
- **K10. Overlay.** `nextOverlayPull` mirrors `nextOverlaySpin`: a 3-try claim, the tip must be CONFIRMED, and a 1 h late-play window. The test payload includes `imageUrl`.
- **K11. Money prizes** (Thai gambling-law sensitivity).
  - A soft server check refuses prize text matching money terms, `/฿|บาท|\d+\s*(บ\.|thb)|เงิน|โอน|ทรูมันนี่|truemoney|บัตรเติม|gift ?card|voucher|คูปอง/i`, with `money_prize`.
  - The settings page and the fan's odds sheet say "รางวัลไม่ใช่เงินหรือของมีมูลค่าเป็นเงิน".
  - **The founder should confirm the wording before launch** (final report).
- **Noted, not in scope:** the wheel has the same latent issue as K2: a forced or dropped spin keeps `spinWheelId`, so reject and re-confirm can draw. This is flagged in the final report.
