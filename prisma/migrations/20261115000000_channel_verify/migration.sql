-- Channel-owner badge (2026-11-15)
CREATE TYPE "ChannelVerifyStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');
ALTER TABLE "User" ADD COLUMN "channelVerifyStatus" "ChannelVerifyStatus";
ALTER TABLE "User" ADD COLUMN "channelVerifyKey" TEXT;
ALTER TABLE "User" ADD COLUMN "channelVerifyUrl" TEXT;
ALTER TABLE "User" ADD COLUMN "channelVerifyRequestedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "channelVerifiedAt" TIMESTAMP(3);
