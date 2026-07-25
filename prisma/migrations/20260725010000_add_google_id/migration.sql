-- AlterTable: link a Google account to a user (drives "connected" status).
ALTER TABLE "User" ADD COLUMN     "googleId" TEXT;
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");
