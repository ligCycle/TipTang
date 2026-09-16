-- Subathon "sabotage": viewers may pay to REDUCE the timer, on the creator's
-- terms. Every default keeps today's behaviour: feature off, and every tip
-- adds time (timerEffect ADD) unless the supporter picks otherwise.
CREATE TYPE "TimerEffect" AS ENUM ('ADD', 'REDUCE', 'NONE');

ALTER TABLE "User" ADD COLUMN "timerReduceEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "timerReduceBahtPerUnit" INTEGER NOT NULL DEFAULT 20;
ALTER TABLE "User" ADD COLUMN "timerReduceSecondsPerUnit" INTEGER NOT NULL DEFAULT 60;
ALTER TABLE "User" ADD COLUMN "timerReduceMinAmount" INTEGER NOT NULL DEFAULT 20;
ALTER TABLE "User" ADD COLUMN "timerFloorSeconds" INTEGER NOT NULL DEFAULT 300;

ALTER TABLE "Tip" ADD COLUMN "timerEffect" "TimerEffect" NOT NULL DEFAULT 'ADD';
