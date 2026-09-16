-- Slips move to a PRIVATE bucket. slipKey holds the storage object key and is
-- served through /api/tips/[id]/slip (owner-only signed URL). slipUrl stays for
-- rows that have not been migrated yet; scripts/migrate-slips.ts moves them.
ALTER TABLE "Tip" ADD COLUMN     "slipKey" TEXT;
