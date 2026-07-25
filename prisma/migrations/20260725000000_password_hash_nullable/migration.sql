-- AlterTable: OAuth (Google) users have no password.
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;
