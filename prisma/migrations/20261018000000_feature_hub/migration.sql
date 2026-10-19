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
