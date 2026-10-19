-- One place for alert media, organised in sets. Every creator gets an active
-- set "ชุดหลัก" holding exactly the files their alerts use today, so nothing
-- on stream changes. (Separate migration: 'VIDEO' was added to the enum in
-- the previous one and can't be used in the same transaction.)
--
-- Today: library sounds/stickers play at random and beat the main sound /
-- image; a main video replaces everything. The main files move into the
-- library (User.alertSoundUrl / alertImageUrl / alertVideoUrl are no longer
-- read) and join the set only where they would play now.
-- Deterministic ids ('set_' / 'mig_*_' + user id) let later steps refer to
-- rows made earlier in this script.

-- 1. One set per creator, made active.
INSERT INTO "AlertSet" ("id", "userId", "name", "updatedAt")
SELECT 'set_' || u."id", u."id", 'ชุดหลัก', NOW() FROM "User" u;
UPDATE "User" SET "activeSetId" = 'set_' || "id";

-- 2. Existing library sounds/stickers join it, unless a main video hid them.
INSERT INTO "AlertSetItem" ("setId", "assetId")
SELECT 'set_' || a."userId", a."id"
FROM "AlertAsset" a JOIN "User" u ON u."id" = a."userId"
WHERE a."kind" IN ('SOUND', 'STICKER') AND u."alertVideoUrl" IS NULL;

-- 3. Main files move into the library; each joins the set only where it
--    plays today. Decided before the inserts below, against the library as
--    it was before this migration.
CREATE TEMP TABLE "_mig_media" AS
SELECT u."id" AS uid,
       u."alertSoundUrl" AS snd,
       u."alertImageUrl" AS img,
       u."alertVideoUrl" AS vid,
       u."alertVideoUrl" IS NULL AND NOT EXISTS (
         SELECT 1 FROM "AlertAsset" a WHERE a."userId" = u."id" AND a."kind" = 'SOUND'
       ) AS snd_plays,
       u."alertVideoUrl" IS NULL AND NOT EXISTS (
         SELECT 1 FROM "AlertAsset" a WHERE a."userId" = u."id" AND a."kind" = 'STICKER'
       ) AS img_plays
FROM "User" u;

INSERT INTO "AlertAsset" ("id", "userId", "kind", "url")
SELECT 'mig_vid_' || uid, uid, 'VIDEO', vid FROM "_mig_media" WHERE vid IS NOT NULL;
INSERT INTO "AlertAsset" ("id", "userId", "kind", "url")
SELECT 'mig_img_' || uid, uid, 'STICKER', img FROM "_mig_media" WHERE img IS NOT NULL;
INSERT INTO "AlertAsset" ("id", "userId", "kind", "url")
SELECT 'mig_snd_' || uid, uid, 'SOUND', snd FROM "_mig_media" WHERE snd IS NOT NULL;

INSERT INTO "AlertSetItem" ("setId", "assetId")
SELECT 'set_' || uid, 'mig_vid_' || uid FROM "_mig_media" WHERE vid IS NOT NULL;
INSERT INTO "AlertSetItem" ("setId", "assetId")
SELECT 'set_' || uid, 'mig_img_' || uid FROM "_mig_media" WHERE img IS NOT NULL AND img_plays;
INSERT INTO "AlertSetItem" ("setId", "assetId")
SELECT 'set_' || uid, 'mig_snd_' || uid FROM "_mig_media" WHERE snd IS NOT NULL AND snd_plays;

DROP TABLE "_mig_media";
