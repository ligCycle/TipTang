-- Creator-chosen minimum tip. Default 1 baht = exactly today's behaviour.
ALTER TABLE "User" ADD COLUMN "minTipAmount" INTEGER NOT NULL DEFAULT 1;
