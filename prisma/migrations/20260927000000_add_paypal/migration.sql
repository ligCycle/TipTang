-- PayPal for overseas supporters.
CREATE TYPE "PaymentMethod" AS ENUM ('PROMPTPAY', 'PAYPAL');
ALTER TABLE "User" ADD COLUMN "paypalHandle" TEXT;
ALTER TABLE "Tip" ADD COLUMN "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'PROMPTPAY';
