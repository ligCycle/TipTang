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

ALTER TABLE "AlertSet" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AlertSetItem" ENABLE ROW LEVEL SECURITY;
