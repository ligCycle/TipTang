-- AlterTable
ALTER TABLE "User" ADD COLUMN     "overlayKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_overlayKey_key" ON "User"("overlayKey");
