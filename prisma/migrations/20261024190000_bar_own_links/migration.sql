-- Bars link: a bar whose own link is open is left out of the bars link (2026-10-24)
ALTER TABLE "User" ADD COLUMN "goalLinkSeenAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "timerLinkSeenAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "comboLinkSeenAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "pkLinkSeenAt" TIMESTAMP(3);
