import "server-only";
import { prisma } from "@/lib/prisma";
import { cleanPrice } from "@/lib/alert-sets";

export type ItemInput = { assetId: string; fanPickable: boolean; minAmount: number };

/**
 * Validate set items from a request body: every file must be the creator's
 * own, prices whole baht in range. Null = reject the whole request.
 */
export async function parseItems(userId: string, raw: unknown): Promise<ItemInput[] | null> {
  if (!Array.isArray(raw)) return null;
  const items: ItemInput[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") return null;
    const o = r as Record<string, unknown>;
    if (typeof o.assetId !== "string") return null;
    const minAmount = o.minAmount === undefined ? 0 : cleanPrice(o.minAmount);
    if (minAmount === null) return null;
    items.push({ assetId: o.assetId, fanPickable: o.fanPickable !== false, minAmount });
  }
  const ids = [...new Set(items.map((i) => i.assetId))];
  if (ids.length !== items.length) return null;
  if (ids.length > 0) {
    const own = await prisma.alertAsset.count({ where: { id: { in: ids }, userId } });
    if (own !== ids.length) return null;
  }
  return items;
}
