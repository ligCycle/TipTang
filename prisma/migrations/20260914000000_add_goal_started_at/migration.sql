-- AlterTable: goal bar "start a new round". When set, only tips confirmed at or
-- after this moment count toward the goal. NULL = count everything, which is
-- exactly the previous behaviour, so no backfill is needed.
ALTER TABLE "User" ADD COLUMN     "goalStartedAt" TIMESTAMP(3);
