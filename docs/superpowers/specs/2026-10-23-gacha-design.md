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
