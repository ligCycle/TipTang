/**
 * Pure rules for the goal's "หลายชิ้น" (wishlist) type. Money that lands on an
 * item stays there; it only moves on the events below (delete an unfilled
 * item, lower a price, reject a tip). See
 * docs/superpowers/specs/2026-10-23-wishlist-goal-design.md.
 */

export const MAX_ITEMS = 10;
export const MAX_ITEM_NAME = 40;
export const MAX_ITEM_PRICE = 1_000_000;

export const GOAL_STYLES = ["classic", "big", "glass", "ring"] as const;
export type GoalStyle = (typeof GOAL_STYLES)[number];
export const GOAL_DISPLAYS = ["main", "all", "rotate"] as const;
export type GoalDisplay = (typeof GOAL_DISPLAYS)[number];
export const GOAL_TYPES = ["single", "multi"] as const;
export type GoalType = (typeof GOAL_TYPES)[number];

export const isGoalStyle = (v: unknown): v is GoalStyle => (GOAL_STYLES as readonly unknown[]).includes(v);
export const isGoalDisplay = (v: unknown): v is GoalDisplay => (GOAL_DISPLAYS as readonly unknown[]).includes(v);
export const isGoalType = (v: unknown): v is GoalType => (GOAL_TYPES as readonly unknown[]).includes(v);

/** An item in list order (order = priority); `raised` counts the current round only. */
export type ItemState = { id: string; price: number; raised: number };
export type Allocation = { itemId: string; amount: number };

export function isFull(item: ItemState): boolean {
  return item.raised >= item.price;
}

export function topUnfilled(items: ItemState[]): ItemState | null {
  return items.find((i) => !isFull(i)) ?? null;
}

/** One row per item (amounts summed), in first-seen order. */
function merge(rows: Allocation[]): Allocation[] {
  const byItem = new Map<string, Allocation>();
  for (const r of rows) {
    const cur = byItem.get(r.itemId);
    if (cur) cur.amount += r.amount;
    else byItem.set(r.itemId, { ...r });
  }
  return [...byItem.values()];
}

/**
 * Where a tip's baht goes: the chosen item (if it isn't full), then the
 * unfilled items after it in order, wrapping to the top (no choice = start at
 * the top). Whatever is left when every item is full goes to the last item.
 */
export function allocate(items: ItemState[], amount: number, chosenId: string | null): Allocation[] {
  if (!Number.isFinite(amount) || amount <= 0 || items.length === 0) return [];
  const start = Math.max(0, chosenId ? items.findIndex((i) => i.id === chosenId) : 0);
  const room = items.map((i) => Math.max(0, i.price - i.raised));
  const rows: Allocation[] = [];
  let left = amount;
  for (let k = 0; k < items.length && left > 0; k++) {
    const idx = (start + k) % items.length;
    const take = Math.min(left, room[idx]);
    if (take > 0) {
      rows.push({ itemId: items[idx].id, amount: take });
      left -= take;
    }
  }
  if (left > 0) rows.push({ itemId: items[items.length - 1].id, amount: left });
  return merge(rows);
}

/** Deleting an item: an unfilled one's baht goes to the remaining items (top unfilled first); a full one moves nothing. */
export function moveOnDelete(items: ItemState[], deletedId: string): Allocation[] {
  const gone = items.find((i) => i.id === deletedId);
  if (!gone || isFull(gone) || gone.raised <= 0) return [];
  const rest = items.filter((i) => i.id !== deletedId);
  return allocate(rest, gone.raised, null);
}

/** Lowering a price below what's raised: the excess flows to the next unfilled items. */
export function spillOnPrice(items: ItemState[], itemId: string, newPrice: number): { from: string; to: Allocation[] } {
  const item = items.find((i) => i.id === itemId);
  // Only what the lower price frees moves: baht already past the old price
  // (an item over 100%) stays, and raising or keeping a price moves nothing.
  const excess = item ? Math.min(item.raised, item.price) - newPrice : 0;
  if (!item || excess <= 0) return { from: itemId, to: [] };
  // The item counts as full at its new price; allocation starts at it and
  // moves on to the unfilled items after it.
  const others = items.map((i) => (i.id === itemId ? { ...i, price: newPrice, raised: newPrice } : i));
  const to = allocate(others, excess, itemId).filter((r) => r.itemId !== itemId);
  return { from: itemId, to };
}

/** Paid extras on one tip add up; the creator minimum is the floor. */
export function extrasFloor(creatorMin: number, prices: (number | null)[]): number {
  return Math.max(creatorMin, prices.reduce<number>((sum, p) => sum + (p ?? 0), 0));
}

export function cleanItemName(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length > 0 && s.length <= MAX_ITEM_NAME ? s : null;
}

export function cleanItemPrice(v: unknown): number | null {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= MAX_ITEM_PRICE ? n : null;
}
