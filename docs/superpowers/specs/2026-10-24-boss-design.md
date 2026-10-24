# ตีบอส (boss raid) — design

Project 10, the last one in the "เพิ่มลูกเล่นการโดเนท" roadmap (master plan `C:\Users\ggtan\.claude\plans\1-2-drifting-lemur.md`, approved 2026-10-23).

**Founder decisions:**
- Tips deal damage at 1 baht = 1 HP.
- A defeated boss unlocks its reward, then the next boss appears.

**Rules already set:**
- R4: extra damage carries over to the next boss. One big tip can defeat several bosses, and the overlay plays one kill per boss, collapsing a long chain into a summary.
- Live-only, like the combo (*master-plan call*).
- When the list runs out, the last boss respawns.

Calls marked *ruling* are mine.

## Creator side

- **Hub card:** "ตีบอส" (`boss`), icon `zap`, `fanPage false`, `obsPath "/boss"`, `obsSize "600×320"`, toggle `bossToggle`.
- **Settings page** (`/dashboard/features/boss`):
  - **① Boss list** (up to 10):
    - a name (≤ 30 characters), HP in baht (1–1,000,000), an optional reward (≤ 40 characters, same no-money rule as other rewards), an optional library picture (STICKER);
    - add, delete, up/down;
    - the current boss is marked.
  - **② Progress:** the current boss and its HP left, plus "เริ่มใหม่ที่บอสตัวแรก" (reset; confirm dialog).
  - **③ OBS link, colour, test, live badge.** The live badge copies the combo's: counts only while the OBS link is open.
- **To-do list:** a defeated boss with a reward adds a `kind: "boss"` item, showing the boss name, the reward, who finished it and the top damage.

## Data

User fields:

| Field | Default | Notes |
|---|---|---|
| `bossEnabled` | false | |
| `bossLife` | 0 | How many bosses have been defeated in this run; the current boss is `bosses[min(life, n−1)]` |
| `bossDamage` | 0 | Damage dealt to the current boss so far |
| `bossSeenAt` | null | Last poll of the boss link (live-only) |
| `bossColor` | null | |

`BossDef` (the creator's list):
- Fields: `{id, userId, name, hp, reward, imageUrl?, position, deletedAt?}`.
- The list order defines the run.
- Editing the current boss's HP below the damage already dealt kills it at the next hit.

`BossHit` (damage dealt by one tip to one boss life; a tip that kills spans several rows):
- Fields: `{id, userId, tipId (FK cascade), life, amount, fan, createdAt}`.
- Indexed `(userId, life)`.

`BossKill`:
- Fields: `{id, userId, life, bossName, reward, imageUrl, killer, topFan, topAmount, killedAt, playedAt?, doneAt?}`.
- The overlay claims one kill per poll (plays once across sources), and the to-do list reads it.

All schema goes into the feature_hub migration, with RLS on new tables.

## Rules (pure: `src/lib/boss.ts`)

**`applyDamage({life, damage}, amount, hps: number[])`** returns `{life, damage, pieces: {life, amount}[], kills: number[]}`.
- Damage fills the current boss.
- Overkill carries over to the next boss, on and on (R4).
- After the last boss, the last boss's HP repeats.
- A boss with HP ≤ 0 is skipped.

**`undoDamage({life, damage}, tipPiecesForCurrentLife)`** (reject) removes only the damage that tip dealt to the *current* boss.
- A defeated boss never comes back (the same rule as the combo's level never going down).
- Damage floors at 0.

**Kill summary:**
- *killer* = the fan whose tip finished the boss.
- *top damage* = the largest per-fan sum over that life's hits.
- Fan names are the tip's supporter name, already censored; anonymous fans count as one ("ผู้สนับสนุน").

## Pipeline (R5)

- **Confirm:** `bossConfirmTx(tx, tipId, now)` in `onTipConfirmedTx` after media (creator already locked).
  - It does nothing unless the card is on and the boss link was seen within `LIVE_MS` (live-only).
  - It needs a non-empty boss list.
  - It writes the BossHit pieces and any BossKill rows, then updates `bossLife`/`bossDamage`.
- **Reject:** `bossRejectTx(tx, tipId)` in `onTipRejectedTx`.
  - Removes the tip's hits on the *current* life and lowers `bossDamage` (floor 0).
  - Kills already made stay.
- **Re-confirm** after a reject: the old hits are deleted, then it is applied again as a new hit, if the boss link is still live.

## Overlay (`/overlay/<u>/boss`)

- **Polling:** every 2 s. The feed returns `{boss: {name, imageUrl, hp, damage, index, total}, kill: next unplayed BossKill (claimed) | null, color}`.
- **Live view:** boss card with picture, name and an HP bar (hp − damage). A "hit" shake and a "−฿N" pop appear when damage goes up between polls.
- **Kill:** a banner "ปิดบอส <name>!" with the killer, the top damage and the reward, for 5 s. Then the next boss slides in.
  - Kills are queued and play one per boss.
  - If more than 3 kills are waiting at once, they collapse into a single summary card: "ปิดบอส N ตัวรวด!" with the last killer (R4).
- **Test:** a Redis scripted test (15 s): damage ticks up, then one kill.
- **Hidden** when the card is off or the list is empty.

## Rulings

- **B1:** live-only (the boss link must be open, as with the combo).
- **B2:** reject undoes damage on the current boss only, and never revives a defeated boss.
- **B3:** the last boss respawns forever. Reset goes back to boss 1 and clears damage, but keeps the history.
- **B4:** rewards follow the no-money rule. The same soft check as the gacha (`looksLikeMoney`) applies to boss rewards.
- **B5:** editing the list during a run keeps `bossLife`/`bossDamage`. If the current boss is deleted, the next one in order becomes current, with damage kept and capped.

## Builder-check rulings (opus, 2026-10-24). These override the sections above.

- **C1. Locks.**
  - Boss confirm and reject run under the pipeline's creator lock. No insert happens before the lock.
  - Settings writes (list, reset, toggle) take `lockCreator`.
  - Reject runs after `comboRejectTx`.
- **C2. Re-confirm.**
  - BossHit gets a `counted` flag (like ComboTip).
  - A re-confirmed tip deals `amount − its kept hits on earlier (dead) lives`.
  - Live is re-checked.
  - A repeated confirm does nothing.
- **C3. Runs.**
  - `User.bossRun` goes up on reset. `run` is stored on BossHit and BossKill, indexed `(userId, run, life)`.
  - Reset marks unplayed kills as played (to-do items stay).
- **C4. Pointer.**
  - `User.bossDefId` points at the current boss. `bossLife` counts kills in the run.
  - Damage is applied over `[current, next…, last]` (the last boss respawns).
  - If the current boss is deleted, the next one by position becomes current, otherwise the last.
  - Damage is kept uncapped, so a boss whose HP was lowered below it dies on the next hit. The HP bar clamps at 0.
- **C5.** An empty list mid-run does nothing: no hits, the state is kept, the overlay is hidden.
- **C6. Big tips.**
  - Boss HP is at least 10 baht.
  - At most 100 kills per tip. Damage beyond that is not counted, since a tip can be at most ฿100,000.
- **C7. Ties and anonymous fans.**
  - Hits are ordered `createdAt, id` (earliest fan wins a tie), and the killing piece is included.
  - Fans are grouped with combo's `fanKey`.
  - An empty name shows as "ผู้สนับสนุน".
- **C8. Amounts.** Whole baht via combo's `baht()`. Under 0.5 deals no damage.
- **C9. Overlay.**
  - The feed carries `run`, `life` and `bossDefId`. The hit flash shows only when all three match the last poll and damage went up, and never on the first poll.
  - The feed returns `pending`. More than 3 waiting kills are claimed together as one summary `{count, lastKiller}`; otherwise one kill is claimed per poll.
  - Kills can only be claimed within 10 minutes (older ones are marked played).
  - BossKill stores `hp`.
- **C10. Test and card off.**
  - The test plays even with the card off, using a sample boss when the list is empty. It is never claimed and writes nothing to the DB.
  - `bossSeenAt` is touched before the enabled check, throttled to 30 s.
  - Card off keeps the state and marks unplayed kills as played.
- **C11. To-do.**
  - `TodoItem` gets `kind "boss"` plus `topFan`/`topAmount`.
  - The PATCH route gets a boss branch.
  - SpinTodo shows "ปิดโดย X · ดาเมจสูงสุด Y ฿N".
  - The todo overlay shows the boss name.
- **C12. Rewards.** The same 400 `money_prize` block as the gacha.
