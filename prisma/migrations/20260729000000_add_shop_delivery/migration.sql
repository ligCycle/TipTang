-- AlterTable: digital auto-delivery. ShopItem holds the deliverable (link/key/
-- message); ShopOrder snapshots it at purchase time + gets a receipt token.
ALTER TABLE "ShopItem" ADD COLUMN     "deliverableText" TEXT;

ALTER TABLE "ShopOrder" ADD COLUMN     "deliverableText" TEXT;
ALTER TABLE "ShopOrder" ADD COLUMN     "receiptToken" TEXT;
CREATE UNIQUE INDEX "ShopOrder_receiptToken_key" ON "ShopOrder"("receiptToken");
