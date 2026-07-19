-- AlterTable
ALTER TABLE "Tip" ADD COLUMN     "autoVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "transRef" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Tip_transRef_key" ON "Tip"("transRef");
