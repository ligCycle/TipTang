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
    // overflow:hidden — an OBS overlay never scrolls; this stops confetti (or
    // any transient off-screen element) from expanding the document and
    // nudging the centered alert card sideways.
    <html lang="en" style={{ overflow: "hidden" }}>
      <body style={{ background: "transparent", overflow: "hidden" }}>
        {children}
      </body>
    </html>
  );
}
