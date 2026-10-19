-- Feature hub: alert switch, onboarding flag,
-- alert tiers by amount, and library videos (used only by tiers).
ALTER TABLE "User" ADD COLUMN "alertsEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "featuresOnboardedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "timerShowRates" BOOLEAN NOT NULL DEFAULT true;

-- Creators who already set up an overlay never see the first-visit chooser.
UPDATE "User" SET "featuresOnboardedAt" = NOW() WHERE "overlayKey" IS NOT NULL;

ALTER TYPE "AlertAssetKind" ADD VALUE 'VIDEO';

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
