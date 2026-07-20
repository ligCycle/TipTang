import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  metadataBase: new URL("https://tiptang.com"),
  title: { default: "TipTang", template: "%s · TipTang" },
  description: "Get tipped by your fans easily with PromptPay",
  openGraph: {
    siteName: "TipTang",
    type: "website",
    title: "TipTang",
    description: "Get tipped by your fans easily with PromptPay",
  },
};

// The <html>/<body> tags live in [locale]/layout.tsx so the lang attribute can
// follow the active locale. This root layout is a pass-through.
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
