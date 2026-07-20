import type { ReactNode } from "react";
import type { Metadata } from "next";
import "../globals.css";

export const metadata: Metadata = {
  title: "TipTang Overlay",
  robots: { index: false, follow: false },
};

// Standalone layout for the OBS browser-source overlay — transparent background,
// no header/footer/banner. Lives outside [locale] so none of the app chrome renders.
export default function OverlayLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ background: "transparent" }}>{children}</body>
    </html>
  );
}
