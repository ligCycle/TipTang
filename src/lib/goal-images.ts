import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * A goal item picture must be one of the creator's own library images.
 * Returns the URL, null to clear, or undefined when it isn't allowed.
 */
export async function ownLibraryImage(userId: string, url: unknown): Promise<string | null | undefined> {
  if (url === null) return null;
  if (typeof url !== "string") return undefined;
  const n = await prisma.alertAsset.count({ where: { userId, url, kind: "STICKER" } });
  return n > 0 ? url : undefined;
}
