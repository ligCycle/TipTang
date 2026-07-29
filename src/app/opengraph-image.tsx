import { ImageResponse } from "next/og";

// Open Graph / Twitter card image for link previews (FB / IG / Discord / X).
// Intentionally English + brand-only: Satori's default font covers Latin but
// NOT Thai, and no Thai font is bundled. The Thai selling copy lives in the OG
// description (src/app/layout.tsx), which renders as the preview text — so we
// get a reliable image plus a Thai message without risking tofu (□□□) glyphs.
export const alt =
  "TipTang — tips & donations via PromptPay, 0% fees, money straight to your bank";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background:
            "linear-gradient(135deg, #ec4880 0%, #d92668 45%, #991748 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
          padding: "80px",
        }}
      >
        <div style={{ display: "flex", fontSize: 130, fontWeight: 800, letterSpacing: "-4px" }}>
          TipTang
        </div>
        <div style={{ display: "flex", marginTop: 10, fontSize: 46, opacity: 0.95 }}>
          {"Tips & donations via PromptPay"}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 52,
            background: "#ffffff",
            color: "#b71753",
            fontSize: 40,
            fontWeight: 700,
            padding: "22px 48px",
            borderRadius: 9999,
          }}
        >
          {"0% fees · money straight to your bank"}
        </div>
        <div style={{ display: "flex", marginTop: 44, fontSize: 32, opacity: 0.85 }}>
          tiptang.com
        </div>
      </div>
    ),
    { ...size },
  );
}
