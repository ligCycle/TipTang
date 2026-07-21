-- CreateEnum
CREATE TYPE "ShopItemType" AS ENUM ('DIGITAL', 'COMMISSION');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED', 'DELIVERED');

-- CreateTable
CREATE TABLE "ShopItem" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "type" "ShopItemType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "imageUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopOrder" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "itemTitle" TEXT NOT NULL,
    "buyerName" TEXT NOT NULL,
    "buyerContact" TEXT NOT NULL,
    "note" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "slipUrl" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "transRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "ShopOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShopItem_creatorId_isArchived_idx" ON "ShopItem"("creatorId", "isArchived");

-- CreateIndex
CREATE UNIQUE INDEX "ShopOrder_transRef_key" ON "ShopOrder"("transRef");

-- CreateIndex
CREATE INDEX "ShopOrder_creatorId_status_idx" ON "ShopOrder"("creatorId", "status");

-- AddForeignKey
ALTER TABLE "ShopItem" ADD CONSTRAINT "ShopItem_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopOrder" ADD CONSTRAINT "ShopOrder_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ShopItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopOrder" ADD CONSTRAINT "ShopOrder_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
