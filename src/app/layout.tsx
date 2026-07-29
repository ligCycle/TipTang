import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  metadataBase: new URL("https://tiptang.com"),
  title: {
    default: "TipTang — รับทิป & โดเนทผ่าน PromptPay ฟรี",
    template: "%s · TipTang",
  },
  description:
    "TipTang รับทิป/โดเนทผ่านพร้อมเพย์ ฟรี 0% ไม่หักค่าธรรมเนียม เงินเข้าบัญชีคุณตรง ไม่ต้องรอถอน — ทางเลือกแทน TipMe สำหรับครีเอเตอร์และสตรีมเมอร์ไทย พร้อม overlay สำหรับ OBS (แจ้งเตือน/เป้าหมาย/เสียงอ่านโดเนท)",
  keywords: [
    "รับโดเนท",
    "รับทิป",
    "โดเนทครีเอเตอร์",
    "แทน TipMe",
    "TipMe",
    "TipMe ปิด",
    "PromptPay โดเนท",
    "donation alert",
    "overlay OBS",
    "รับเงินสนับสนุน",
    "tip creator Thailand",
  ],
  applicationName: "TipTang",
  openGraph: {
    siteName: "TipTang",
    type: "website",
    title: "TipTang — รับทิป & โดเนทผ่าน PromptPay ฟรี",
    description:
      "รับทิป/โดเนทผ่านพร้อมเพย์ ฟรี 0% เงินเข้าบัญชีตรง ไม่ต้องรอถอน — ทางเลือกแทน TipMe พร้อม overlay สำหรับ OBS",
  },
  twitter: {
    card: "summary_large_image",
    title: "TipTang — รับทิป & โดเนทผ่าน PromptPay ฟรี",
    description:
      "รับทิป/โดเนทผ่านพร้อมเพย์ ฟรี 0% เงินเข้าบัญชีตรง ไม่ต้องรอถอน — ทางเลือกแทน TipMe พร้อม overlay สำหรับ OBS",
  },
};

// The <html>/<body> tags live in [locale]/layout.tsx so the lang attribute can
// follow the active locale. This root layout is a pass-through.
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
