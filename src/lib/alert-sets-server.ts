import "server-only";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SET_NAME, type NormalMedia } from "@/lib/alert-sets";

/**
 * The creator's active set id. Every creator has one: the feature-hub
 * migration made "ชุดหลัก" for everyone who existed then; anyone newer gets
 * an empty one the first time it's needed.
 */
export async function getActiveSetId(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { activeSetId: true } });
  if (user?.activeSetId) return user.activeSetId;
  const set = await prisma.alertSet.create({
    data: { userId, name: DEFAULT_SET_NAME },
    select: { id: true },
  });
  await prisma.user.update({ where: { id: userId }, data: { activeSetId: set.id } });
  return set.id;
}

/**
 * What normal alerts draw from: the active set's sounds (with their minimum
 * tip), images and videos. `version` changes whenever the set or its items
 * change, so a running overlay knows to refresh.
 */
export async function activeSetMedia(userId: string): Promise<{ version: string; normal: NormalMedia }> {
  const setId = await getActiveSetId(userId);
  const set = await prisma.alertSet.findUnique({
    where: { id: setId },
    select: {
      updatedAt: true,
      items: { select: { minAmount: true, asset: { select: { kind: true, url: true } } } },
    },
  });
  const items = set?.items ?? [];
  return {
    version: `${setId}:${set?.updatedAt.getTime() ?? 0}`,
    normal: {
      sounds: items
        .filter((i) => i.asset.kind === "SOUND")
        .map((i) => ({ url: i.asset.url, minAmount: i.minAmount })),
      images: items.filter((i) => i.asset.kind === "STICKER").map((i) => i.asset.url),
      videos: items.filter((i) => i.asset.kind === "VIDEO").map((i) => i.asset.url),
    },
  };
}

/** Mark a set as changed (after any item change) so overlays refresh. */
export async function touchSet(setId: string): Promise<void> {
  await prisma.alertSet.update({ where: { id: setId }, data: { updatedAt: new Date() } });
}
