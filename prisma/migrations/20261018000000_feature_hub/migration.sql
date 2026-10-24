-- Feature hub: alert switch, onboarding flag,
-- alert tiers by amount, library videos, sound sets and fan sound picks.
ALTER TABLE "User" ADD COLUMN "alertsEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "featuresOnboardedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "timerShowRates" BOOLEAN NOT NULL DEFAULT true;

-- Creators who already set up an overlay never see the first-visit chooser.
UPDATE "User" SET "featuresOnboardedAt" = NOW() WHERE "overlayKey" IS NOT NULL;

ALTER TYPE "AlertAssetKind" ADD VALUE 'VIDEO';
-- Library file name shown to fans when they pick a sound.
ALTER TABLE "AlertAsset" ADD COLUMN "name" TEXT;

CREATE TABLE "AlertTier" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "minAmount" INTEGER NOT NULL,
    "soundUrl" TEXT,
    "imageUrl" TEXT,
    "videoUrl" TEXT,
    "durationSec" INTEGER,
    "celebrate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AlertTier_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AlertTier_userId_minAmount_key" ON "AlertTier"("userId", "minAmount");
ALTER TABLE "AlertTier" ADD CONSTRAINT "AlertTier_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Same as every other table (20260930000000_security_hardening): RLS on, no
-- policies; the app's owner role bypasses it.
ALTER TABLE "AlertTier" ENABLE ROW LEVEL SECURITY;

-- The big-tip celebration moves into tiers: a creator's existing threshold
-- becomes one tier that celebrates (User.bigTipThreshold is no longer read).
INSERT INTO "AlertTier" ("id", "userId", "minAmount", "celebrate")
SELECT gen_random_uuid()::text, "id", LEAST("bigTipThreshold", 1000000), true
FROM "User" WHERE "bigTipThreshold" > 0;

-- Sound sets (src/lib/alert-sets.ts): named groups of library files; the
-- active set drives normal alerts and the sounds fans may pick.
CREATE TABLE "AlertSet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AlertSet_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AlertSet_userId_idx" ON "AlertSet"("userId");
ALTER TABLE "AlertSet" ADD CONSTRAINT "AlertSet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AlertSetItem" (
    "setId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "fanPickable" BOOLEAN NOT NULL DEFAULT true,
    "minAmount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "AlertSetItem_pkey" PRIMARY KEY ("setId","assetId")
);
ALTER TABLE "AlertSetItem" ADD CONSTRAINT "AlertSetItem_setId_fkey" FOREIGN KEY ("setId") REFERENCES "AlertSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AlertSetItem" ADD CONSTRAINT "AlertSetItem_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "AlertAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "User" ADD COLUMN "activeSetId" TEXT;
ALTER TABLE "User" ADD COLUMN "soundPickEnabled" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "User_activeSetId_key" ON "User"("activeSetId");
ALTER TABLE "User" ADD CONSTRAINT "User_activeSetId_fkey" FOREIGN KEY ("activeSetId") REFERENCES "AlertSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Tip" ADD COLUMN "pickedSoundId" TEXT;
ALTER TABLE "Tip" ADD CONSTRAINT "Tip_pickedSoundId_fkey" FOREIGN KEY ("pickedSoundId") REFERENCES "AlertAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "AlertSetItem_assetId_idx" ON "AlertSetItem"("assetId");
CREATE INDEX "Tip_pickedSoundId_idx" ON "Tip"("pickedSoundId");

ALTER TABLE "AlertSet" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AlertSetItem" ENABLE ROW LEVEL SECURITY;

-- Spin wheel (src/lib/wheel.ts): wheels, their tasks, and one spin per tip.
CREATE TYPE "SpinStatus" AS ENUM ('ACTIVE', 'CANCELLED');

CREATE TABLE "Wheel" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL DEFAULT 50,
    "slots" INTEGER NOT NULL DEFAULT 1,
    "removeWhenHit" BOOLEAN NOT NULL DEFAULT false,
    "removed" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Wheel_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Wheel_userId_idx" ON "Wheel"("userId");
ALTER TABLE "Wheel" ADD CONSTRAINT "Wheel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WheelTaskRow" (
    "id" TEXT NOT NULL,
    "wheelId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "noAction" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL,
    CONSTRAINT "WheelTaskRow_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WheelTaskRow_wheelId_idx" ON "WheelTaskRow"("wheelId");
ALTER TABLE "WheelTaskRow" ADD CONSTRAINT "WheelTaskRow_wheelId_fkey" FOREIGN KEY ("wheelId") REFERENCES "Wheel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Spin" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tipId" TEXT NOT NULL,
    "wheelId" TEXT,
    "segmentKey" TEXT NOT NULL,
    "taskText" TEXT NOT NULL,
    "noAction" BOOLEAN NOT NULL,
    "status" "SpinStatus" NOT NULL DEFAULT 'ACTIVE',
    "confirmedAt" TIMESTAMP(3) NOT NULL,
    "playedAt" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Spin_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Spin_tipId_key" ON "Spin"("tipId");
CREATE INDEX "Spin_userId_status_idx" ON "Spin"("userId", "status");
ALTER TABLE "Spin" ADD CONSTRAINT "Spin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Spin" ADD CONSTRAINT "Spin_tipId_fkey" FOREIGN KEY ("tipId") REFERENCES "Tip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Spin" ADD CONSTRAINT "Spin_wheelId_fkey" FOREIGN KEY ("wheelId") REFERENCES "Wheel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "User" ADD COLUMN "activeWheelId" TEXT;
ALTER TABLE "User" ADD COLUMN "wheelEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "wheelRulesAcceptedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "User_activeWheelId_key" ON "User"("activeWheelId");
ALTER TABLE "User" ADD CONSTRAINT "User_activeWheelId_fkey" FOREIGN KEY ("activeWheelId") REFERENCES "Wheel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Tip" ADD COLUMN "spinWheelId" TEXT;
CREATE INDEX "Tip_spinWheelId_idx" ON "Tip"("spinWheelId");

ALTER TABLE "Wheel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WheelTaskRow" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Spin" ENABLE ROW LEVEL SECURITY;

-- Combo tip (src/lib/combo.ts): runs of confirmed tips, the tips in them, and rewards reached.
CREATE TYPE "ComboStatus" AS ENUM ('ACTIVE', 'ENDED', 'STOPPED');

CREATE TABLE "Combo" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "ComboStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL,
    "lastTipAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "level" INTEGER NOT NULL DEFAULT 1,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "sizes" INTEGER[],
    "rewards" TEXT[],
    CONSTRAINT "Combo_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Combo_userId_status_idx" ON "Combo"("userId", "status");
ALTER TABLE "Combo" ADD CONSTRAINT "Combo_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ComboTip" (
    "tipId" TEXT NOT NULL,
    "comboId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "levelAfter" INTEGER NOT NULL,
    "counted" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "ComboTip_pkey" PRIMARY KEY ("tipId")
);
CREATE INDEX "ComboTip_comboId_idx" ON "ComboTip"("comboId");
ALTER TABLE "ComboTip" ADD CONSTRAINT "ComboTip_tipId_fkey" FOREIGN KEY ("tipId") REFERENCES "Tip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComboTip" ADD CONSTRAINT "ComboTip_comboId_fkey" FOREIGN KEY ("comboId") REFERENCES "Combo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ComboReward" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "comboId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "reachedAt" TIMESTAMP(3) NOT NULL,
    "doneAt" TIMESTAMP(3),
    CONSTRAINT "ComboReward_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ComboReward_comboId_level_key" ON "ComboReward"("comboId", "level");
CREATE INDEX "ComboReward_userId_doneAt_idx" ON "ComboReward"("userId", "doneAt");
ALTER TABLE "ComboReward" ADD CONSTRAINT "ComboReward_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComboReward" ADD CONSTRAINT "ComboReward_comboId_fkey" FOREIGN KEY ("comboId") REFERENCES "Combo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "User" ADD COLUMN "comboEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "comboDifficulty" TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE "User" ADD COLUMN "comboRows" JSONB;
ALTER TABLE "User" ADD COLUMN "comboColor" TEXT;
ALTER TABLE "User" ADD COLUMN "comboOverlaySeenAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "comboCooldownUntil" TIMESTAMP(3);

ALTER TABLE "Tip" ADD COLUMN "comboEligible" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "Tip_creatorId_comboEligible_confirmedAt_idx" ON "Tip"("creatorId", "comboEligible", "confirmedAt");

ALTER TABLE "Combo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ComboTip" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ComboReward" ENABLE ROW LEVEL SECURITY;

-- Goal "หลายชิ้น" (src/lib/wishlist.ts): items, where each tip's baht landed, and the goal's type/style/display.
CREATE TABLE "WishItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "imageUrl" TEXT,
    "position" INTEGER NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WishItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WishItem_userId_deletedAt_idx" ON "WishItem"("userId", "deletedAt");
ALTER TABLE "WishItem" ADD CONSTRAINT "WishItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WishAlloc" (
    "id" TEXT NOT NULL,
    "tipId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WishAlloc_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WishAlloc_itemId_idx" ON "WishAlloc"("itemId");
CREATE INDEX "WishAlloc_tipId_idx" ON "WishAlloc"("tipId");
ALTER TABLE "WishAlloc" ADD CONSTRAINT "WishAlloc_tipId_fkey" FOREIGN KEY ("tipId") REFERENCES "Tip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WishAlloc" ADD CONSTRAINT "WishAlloc_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "WishItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "User" ADD COLUMN "goalType" TEXT NOT NULL DEFAULT 'single';
ALTER TABLE "User" ADD COLUMN "goalStyle" TEXT NOT NULL DEFAULT 'classic';
ALTER TABLE "User" ADD COLUMN "goalDisplay" TEXT NOT NULL DEFAULT 'all';

ALTER TABLE "Tip" ADD COLUMN "wishItemId" TEXT;
CREATE INDEX "Tip_wishItemId_idx" ON "Tip"("wishItemId");

ALTER TABLE "WishItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WishAlloc" ENABLE ROW LEVEL SECURITY;

-- Project 6: ขอคลิป/เพลง (media request queue)
CREATE TYPE "MediaStatus" AS ENUM ('HELD', 'PENDING', 'APPROVED', 'PLAYING', 'PLAYED', 'SKIPPED', 'REMOVED', 'CANCELLED');

ALTER TABLE "User" ADD COLUMN "mediaEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "mediaMinAmount" INTEGER NOT NULL DEFAULT 50;
ALTER TABLE "User" ADD COLUMN "mediaMaxSec" INTEGER NOT NULL DEFAULT 180;
ALTER TABLE "User" ADD COLUMN "mediaAutoApprove" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "mediaAutoAckAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "mediaVolume" INTEGER NOT NULL DEFAULT 70;
ALTER TABLE "User" ADD COLUMN "mediaPaused" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "mediaSeenAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "mediaColor" TEXT;

CREATE TABLE "MediaRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tipId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'clip',
    "videoId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startSec" INTEGER NOT NULL DEFAULT 0,
    "status" "MediaStatus" NOT NULL DEFAULT 'HELD',
    "position" INTEGER NOT NULL DEFAULT 0,
    "queuedAt" TIMESTAMP(3),
    "promotedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MediaRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MediaRequest_tipId_key" ON "MediaRequest"("tipId");
CREATE INDEX "MediaRequest_userId_status_position_idx" ON "MediaRequest"("userId", "status", "position");
ALTER TABLE "MediaRequest" ADD CONSTRAINT "MediaRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaRequest" ADD CONSTRAINT "MediaRequest_tipId_fkey" FOREIGN KEY ("tipId") REFERENCES "Tip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MediaRequest" ENABLE ROW LEVEL SECURITY;

-- Project 7: ฝากเสียง (voice message)
ALTER TABLE "User" ADD COLUMN "voiceEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "voiceMinAmount" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "User" ADD COLUMN "voiceAutoApprove" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "voiceAutoAckAt" TIMESTAMP(3);

ALTER TABLE "MediaRequest" ALTER COLUMN "videoId" DROP NOT NULL;
ALTER TABLE "MediaRequest" ADD COLUMN "audioKey" TEXT;
ALTER TABLE "MediaRequest" ADD COLUMN "durationSec" INTEGER;
ALTER TABLE "MediaRequest" ADD COLUMN "audioPurgedAt" TIMESTAMP(3);
CREATE INDEX "MediaRequest_kind_audioPurgedAt_idx" ON "MediaRequest"("kind", "audioPurgedAt");

-- Project 8: กาชา (rarity capsule)
ALTER TABLE "User" ADD COLUMN "gachaEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "gachaPrice" INTEGER NOT NULL DEFAULT 50;
ALTER TABLE "User" ADD COLUMN "gachaCommon" INTEGER NOT NULL DEFAULT 70;
ALTER TABLE "User" ADD COLUMN "gachaRare" INTEGER NOT NULL DEFAULT 25;
ALTER TABLE "User" ADD COLUMN "gachaEpic" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "User" ADD COLUMN "gachaVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "gachaColor" TEXT;
ALTER TABLE "User" ADD COLUMN "gachaRulesAcceptedAt" TIMESTAMP(3);

ALTER TABLE "Tip" ADD COLUMN "gachaPull" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Tip" ADD COLUMN "gachaBox" JSONB;

CREATE TABLE "GachaPrize" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rarity" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "imageUrl" TEXT,
    "noAction" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GachaPrize_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GachaPrize_userId_idx" ON "GachaPrize"("userId");
ALTER TABLE "GachaPrize" ADD CONSTRAINT "GachaPrize_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "GachaPull" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tipId" TEXT NOT NULL,
    "rarity" TEXT NOT NULL,
    "prizeId" TEXT,
    "prizeText" TEXT NOT NULL,
    "imageUrl" TEXT,
    "noAction" BOOLEAN NOT NULL DEFAULT false,
    "status" "SpinStatus" NOT NULL DEFAULT 'ACTIVE',
    "confirmedAt" TIMESTAMP(3) NOT NULL,
    "playedAt" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GachaPull_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GachaPull_tipId_key" ON "GachaPull"("tipId");
CREATE INDEX "GachaPull_userId_status_idx" ON "GachaPull"("userId", "status");
ALTER TABLE "GachaPull" ADD CONSTRAINT "GachaPull_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GachaPull" ADD CONSTRAINT "GachaPull_tipId_fkey" FOREIGN KEY ("tipId") REFERENCES "Tip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GachaPrize" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GachaPull" ENABLE ROW LEVEL SECURITY;

-- Project 9: PK
CREATE TYPE "PkStatus" AS ENUM ('PENDING', 'ACTIVE', 'ENDED', 'CANCELLED', 'DECLINED');

ALTER TABLE "User" ADD COLUMN "pkEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "pkInvitesOff" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Tip" ADD COLUMN "pkMatchId" TEXT;
ALTER TABLE "Tip" ADD COLUMN "pkSide" TEXT;
CREATE INDEX "Tip_pkMatchId_status_idx" ON "Tip"("pkMatchId", "status");
CREATE INDEX "Tip_creatorId_status_createdAt_idx" ON "Tip"("creatorId", "status", "createdAt");

CREATE TABLE "PkMatch" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "ownerId" TEXT,
    "opponentId" TEXT,
    "status" "PkStatus" NOT NULL DEFAULT 'ACTIVE',
    "nameA" TEXT NOT NULL,
    "nameB" TEXT NOT NULL,
    "colorA" TEXT NOT NULL,
    "colorB" TEXT NOT NULL,
    "durationSec" INTEGER NOT NULL,
    "graceSec" INTEGER NOT NULL DEFAULT 60,
    "startedAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "totalA" INTEGER,
    "totalB" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PkMatch_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PkMatch_ownerId_status_idx" ON "PkMatch"("ownerId", "status");
CREATE INDEX "PkMatch_opponentId_status_idx" ON "PkMatch"("opponentId", "status");
ALTER TABLE "PkMatch" ADD CONSTRAINT "PkMatch_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PkMatch" ADD CONSTRAINT "PkMatch_opponentId_fkey" FOREIGN KEY ("opponentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PkMatch" ENABLE ROW LEVEL SECURITY;

-- Boss raid (project 10)
ALTER TABLE "User" ADD COLUMN "bossEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "bossRun" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "bossLife" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "bossDamage" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "bossDefId" TEXT;
ALTER TABLE "User" ADD COLUMN "bossSeenAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "bossColor" TEXT;

CREATE TABLE "BossDef" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hp" INTEGER NOT NULL,
    "reward" TEXT NOT NULL DEFAULT '',
    "imageUrl" TEXT,
    "position" INTEGER NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BossDef_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BossDef_userId_deletedAt_idx" ON "BossDef"("userId", "deletedAt");
ALTER TABLE "BossDef" ADD CONSTRAINT "BossDef_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "BossHit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tipId" TEXT NOT NULL,
    "run" INTEGER NOT NULL,
    "life" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "fan" TEXT NOT NULL,
    "counted" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BossHit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BossHit_userId_run_life_idx" ON "BossHit"("userId", "run", "life");
CREATE INDEX "BossHit_tipId_idx" ON "BossHit"("tipId");
ALTER TABLE "BossHit" ADD CONSTRAINT "BossHit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BossHit" ADD CONSTRAINT "BossHit_tipId_fkey" FOREIGN KEY ("tipId") REFERENCES "Tip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "BossKill" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "run" INTEGER NOT NULL,
    "life" INTEGER NOT NULL,
    "bossName" TEXT NOT NULL,
    "hp" INTEGER NOT NULL,
    "reward" TEXT NOT NULL,
    "imageUrl" TEXT,
    "killer" TEXT NOT NULL,
    "topFan" TEXT NOT NULL,
    "topAmount" INTEGER NOT NULL,
    "killedAt" TIMESTAMP(3) NOT NULL,
    "playedAt" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),
    CONSTRAINT "BossKill_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BossKill_userId_run_life_key" ON "BossKill"("userId", "run", "life");
CREATE INDEX "BossKill_userId_playedAt_idx" ON "BossKill"("userId", "playedAt");
CREATE INDEX "BossKill_userId_doneAt_idx" ON "BossKill"("userId", "doneAt");
CREATE INDEX "BossKill_userId_killedAt_idx" ON "BossKill"("userId", "killedAt");
ALTER TABLE "BossKill" ADD CONSTRAINT "BossKill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BossDef" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BossHit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BossKill" ENABLE ROW LEVEL SECURITY;

-- Two OBS links (project 11)
ALTER TABLE "User" ADD COLUMN "mainSeenAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "barsSeenAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "wheelSeenAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "gachaSeenAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "bossLinkSeenAt" TIMESTAMP(3);
ALTER TABLE "MediaRequest" ADD COLUMN "pausedMs" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MediaRequest" ADD COLUMN "pausedAt" TIMESTAMP(3);

-- PK: a side that gives up loses (founder 2026-10-24)
ALTER TABLE "PkMatch" ADD COLUMN "forfeitBy" TEXT;
