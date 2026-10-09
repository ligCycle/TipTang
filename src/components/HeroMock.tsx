import { getTranslations } from "next-intl/server";
import QRCode from "qrcode";
import { Icon } from "@/components/Icon";

/**
 * A static mock of a creator's tip page, drawn with Tailwind only. It is
 * decoration that says "this is the product" — hidden from assistive tech.
 * The QR is real (it opens tiptang.com) so the mock never shows a
 * placeholder where the payment code would be. Dark modules on a white tile
 * in both themes, like a printed code, so phone cameras can read it.
 */
export async function HeroMock() {
  const t = await getTranslations("landing");
  const qrSvg = await QRCode.toString("https://tiptang.com", {
    type: "svg",
    margin: 0,
    errorCorrectionLevel: "M",
    color: { dark: "#1c1420", light: "#0000" },
  });
  return (
    <div aria-hidden className="relative w-full max-w-sm">
      <div className="rounded-3xl border border-brand-900/10 bg-white p-5 shadow-[0_30px_60px_-30px_color-mix(in_srgb,var(--color-brand-800)_45%,transparent)] dark:bg-brand-50 dark:shadow-[0_30px_60px_-30px_rgba(0,0,0,0.6)]">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-lg font-black text-white">
            T
          </div>
          <div className="min-w-0">
            <p className="truncate font-bold text-brand-900">{t("mockName")}</p>
            <p className="text-sm font-medium text-brand-600">@yourname</p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          {["฿20", "฿50", "฿100"].map((amt, i) => (
            <div
              key={amt}
              className={`rounded-xl py-2 text-center text-sm font-bold ${
                i === 1
                  ? "bg-brand-600 text-white"
                  : "border border-brand-900/10 text-brand-900/80"
              }`}
            >
              {amt}
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-2 rounded-xl border border-brand-900/10 px-3 py-2 text-sm text-brand-900/70">
          <Icon name="heart" className="h-4 w-4 text-brand-500" />
          {t("mockMessage")}
        </div>

        <div className="mt-4 flex items-center gap-4">
          <div
            className="aspect-square w-24 shrink-0 rounded-2xl bg-white p-2.5 ring-1 ring-brand-900/10 [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <p className="text-sm font-medium text-brand-900/70">{t("mockScan")}</p>
        </div>
      </div>

      {/* The payoff: a confirmed tip, sitting on the card's corner */}
      <div className="ink absolute -bottom-4 right-3 flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold shadow-lg sm:-right-6">
        <Icon name="check-circle" className="h-4 w-4 text-emerald-400" />
        {t("mockPaid")}
      </div>
    </div>
  );
}
