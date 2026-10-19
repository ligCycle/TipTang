-- One place for alert media: the main sound / image / video set on the old
-- OBS page move into the library, switched on for normal alerts exactly when
-- they play today (separate migration: 'VIDEO' was added to the enum in the
-- previous one and can't be used in the same transaction).
--
-- Today: a library file switched on beats the main one, and a main video
-- replaces everything. So a moved file is on only where it would play now.
-- (User.alertSoundUrl / alertImageUrl / alertVideoUrl are no longer read.)

INSERT INTO "AlertAsset" ("id", "userId", "kind", "url", "inRandom")
SELECT gen_random_uuid()::text, u."id", 'VIDEO', u."alertVideoUrl", true
FROM "User" u WHERE u."alertVideoUrl" IS NOT NULL;

INSERT INTO "AlertAsset" ("id", "userId", "kind", "url", "inRandom")
SELECT gen_random_uuid()::text, u."id", 'STICKER', u."alertImageUrl",
  u."alertVideoUrl" IS NULL AND NOT EXISTS (
    SELECT 1 FROM "AlertAsset" a WHERE a."userId" = u."id" AND a."kind" = 'STICKER' AND a."inRandom"
  )
FROM "User" u WHERE u."alertImageUrl" IS NOT NULL;

INSERT INTO "AlertAsset" ("id", "userId", "kind", "url", "inRandom")
SELECT gen_random_uuid()::text, u."id", 'SOUND', u."alertSoundUrl",
  u."alertVideoUrl" IS NULL AND NOT EXISTS (
    SELECT 1 FROM "AlertAsset" a WHERE a."userId" = u."id" AND a."kind" = 'SOUND' AND a."inRandom"
  )
FROM "User" u WHERE u."alertSoundUrl" IS NOT NULL;

-- With a main video, library sounds/stickers didn't play either.
UPDATE "AlertAsset" a SET "inRandom" = false
FROM "User" u
WHERE a."userId" = u."id" AND u."alertVideoUrl" IS NOT NULL
  AND a."kind" IN ('SOUND', 'STICKER') AND a."url" IS DISTINCT FROM u."alertVideoUrl";
