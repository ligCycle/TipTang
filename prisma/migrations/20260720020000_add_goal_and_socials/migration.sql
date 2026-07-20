-- AlterTable
ALTER TABLE "User" ADD COLUMN     "goalAmount" DECIMAL(10,2),
ADD COLUMN     "goalTitle" TEXT,
ADD COLUMN     "socialLinks" JSONB;
