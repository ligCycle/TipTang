"use client";

import { useTranslations } from "next-intl";
import { paypalLink } from "@/lib/paypal";

/** The PayPal half of the pay step: open PayPal, then come back to upload. */
export function PaypalPayPanel({
  handle,
  amount,
  amountLabel,
  accentStyle,
}: {
  handle: string;
  amount: number;
  amountLabel: string;
  accentStyle?: React.CSSProperties;
}) {
  const t = useTranslations("profile");
  return (
    <div className="text-center">
      <a
        href={paypalLink(handle, amount)}
        target="_blank"
        rel="noopener noreferrer"
        style={accentStyle}
        className="btn-primary inline-flex w-full justify-center transition hover:brightness-95"
      >
        {t("paypalPay", { amount: amountLabel })}
      </a>
      <p className="mx-auto mt-3 max-w-sm text-xs text-brand-900/55">
        {t("paypalNote")}
      </p>
    </div>
  );
}
