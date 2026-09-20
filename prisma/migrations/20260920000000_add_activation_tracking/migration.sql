-- Activation tracking for the admin funnel view.
-- overlayLastSeenAt: last valid poll from the OBS alert overlay (throttled to one write / 5 min).
-- activationNudgeSentAt: the once-ever reminder guard.
ALTER TABLE "User" ADD COLUMN "overlayLastSeenAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "activationNudgeSentAt" TIMESTAMP(3);
