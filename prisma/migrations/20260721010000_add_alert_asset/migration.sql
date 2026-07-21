-- CreateEnum
CREATE TYPE "AlertAssetKind" AS ENUM ('SOUND', 'STICKER');

-- CreateTable
CREATE TABLE "AlertAsset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "AlertAssetKind" NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AlertAsset_userId_kind_idx" ON "AlertAsset"("userId", "kind");

-- AddForeignKey
ALTER TABLE "AlertAsset" ADD CONSTRAINT "AlertAsset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
