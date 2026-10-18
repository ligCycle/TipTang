-- Feature hub: alert switch, positions on the single OBS link, onboarding flag,
-- alert tiers by amount, and library videos (used only by tiers).
ALTER TABLE "User" ADD COLUMN "alertsEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "alertPosition" TEXT NOT NULL DEFAULT 'center';
ALTER TABLE "User" ADD COLUMN "goalPosition" TEXT NOT NULL DEFAULT 'bottom-center';
ALTER TABLE "User" ADD COLUMN "timerPosition" TEXT NOT NULL DEFAULT 'top-right';
ALTER TABLE "User" ADD COLUMN "featuresOnboardedAt" TIMESTAMP(3);

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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AlertTier_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AlertTier_userId_minAmount_key" ON "AlertTier"("userId", "minAmount");
ALTER TABLE "AlertTier" ADD CONSTRAINT "AlertTier_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Same as every other table (20260930000000_security_hardening): RLS on, no
-- policies; the app's owner role bypasses it.
ALTER TABLE "AlertTier" ENABLE ROW LEVEL SECURITY;
