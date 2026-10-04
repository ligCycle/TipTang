import localFont from "next/font/local";

// LINE Seed Sans TH (SIL OFL 1.1 — licence in ./fonts/LINESeedSansTH-OFL.txt),
// self-hosted so every device renders the same Thai. 500/600 map to the
// nearest provided weights; the system stack in globals.css is the fallback.
export const lineSeed = localFont({
  src: [
    { path: "./fonts/LINESeedSansTH-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/LINESeedSansTH-Bold.woff2", weight: "700", style: "normal" },
    { path: "./fonts/LINESeedSansTH-ExtraBold.woff2", weight: "800", style: "normal" },
  ],
  variable: "--font-line-seed",
  display: "swap",
});
