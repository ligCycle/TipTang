/**
 * Public changelog shown at /[locale]/updates — pure data, runs under
 * `node --test`. Newest entry FIRST; add new entries at the top when a
 * feature ships. Only things users can see or use; back-office work stays out.
 *
 * `id` = "<date>-<slug>" and never changes once published: the dashboard's
 * "what's new" dot compares the newest id with the one the creator last saw.
 */

export type UpdateTag = "creator" | "supporter" | "security";

export type Update = {
  id: string;
  /** ISO YYYY-MM-DD; formatted for display at render time. */
  date: string;
  tags: UpdateTag[];
  /** In-app path for a "try it" link, without the locale ("/dashboard/settings"). */
  href?: string;
  th: { title: string; body: string };
  en: { title: string; body: string };
};

export const UPDATES_SEEN_KEY = "tiptang_last_seen_update";

export const UPDATES: Update[] = [
  {
    id: "2026-09-27-paypal",
    date: "2026-09-27",
    tags: ["creator", "supporter"],
    href: "/dashboard/settings",
    th: {
      title: "รับทิปจากคนดูต่างประเทศผ่าน PayPal",
      body: "ใส่ลิงก์ PayPal.me ในหน้าตั้งค่า หน้าโดเนทจะมีตัวเลือก PayPal ให้คนดูที่ไม่มีแอปธนาคารไทย เงินเข้าบัญชี PayPal ของคุณโดยตรง ทิปผ่าน PayPal ต้องกดยืนยันเองทุกครั้ง",
    },
    en: {
      title: "Tips from abroad with PayPal",
      body: "Add your PayPal.me in settings and your donate page gets a PayPal option for supporters without a Thai banking app. Money goes straight to your PayPal; PayPal tips always need your manual confirmation.",
    },
  },
  {
    id: "2026-09-27-thank-you",
    date: "2026-09-27",
    tags: ["creator"],
    href: "/dashboard/settings",
    th: {
      title: "ข้อความขอบคุณหลังโดเนท",
      body: "ตั้งข้อความสั้น ๆ ที่คนดูจะเห็นทันทีหลังส่งทิป พร้อมรูปโปรไฟล์ของคุณ อยู่ในหน้าตั้งค่า ส่วน \"หน้าโดเนท\"",
    },
    en: {
      title: "A thank-you message after each tip",
      body: "Set a short note supporters see right after they tip, with your profile picture. Find it in settings under \"Donate page\".",
    },
  },
  {
    id: "2026-09-27-kick-twitch",
    date: "2026-09-27",
    tags: ["creator"],
    href: "/dashboard/settings",
    th: {
      title: "เพิ่มลิงก์ Kick และ Twitch",
      body: "ใส่ลิงก์ช่อง Kick หรือ Twitch ได้แล้ว ไอคอนจะขึ้นบนหน้าโปรไฟล์ของคุณเหมือนแพลตฟอร์มอื่น",
    },
    en: {
      title: "Kick and Twitch links",
      body: "Add your Kick or Twitch channel; the icon shows on your profile like the other platforms.",
    },
  },
  {
    id: "2026-09-27-pay-apps",
    date: "2026-09-27",
    tags: ["supporter"],
    th: {
      title: "บอกชัดว่าจ่ายด้วยแอปไหนได้บ้าง",
      body: "ใต้ QR พร้อมเพย์บอกแล้วว่าแอปธนาคารทุกธนาคาร TrueMoney และ ShopeePay สแกนจ่ายได้ ไม่ต้องมีบัญชีธนาคารก็โดเนทได้",
    },
    en: {
      title: "Clear about which apps can pay",
      body: "The PromptPay QR now says plainly that any Thai bank app, TrueMoney and ShopeePay can pay it — no bank account needed.",
    },
  },
  {
    id: "2026-09-16-min-tip",
    date: "2026-09-16",
    tags: ["creator"],
    href: "/dashboard/settings",
    th: {
      title: "ตั้งยอดโดเนทขั้นต่ำได้",
      body: "กำหนดยอดต่ำสุดที่รับ ปุ่มจำนวนเงินบนหน้าโดเนทจะปรับตามให้อัตโนมัติ",
    },
    en: {
      title: "Set a minimum tip",
      body: "Choose the smallest amount you accept; the quick-amount buttons on your donate page adjust to match.",
    },
  },
  {
    id: "2026-09-16-subathon-choices",
    date: "2026-09-16",
    tags: ["creator", "supporter"],
    href: "/dashboard/overlay",
    th: {
      title: "Subathon: คนดูเลือกได้ เพิ่มเวลา / ลดเวลา / แค่โดเนท",
      body: "เมื่อเปิดตัวจับเวลา Subathon คนดูเลือกได้ว่าทิปนี้จะทำอะไรกับเวลา และครีเอเตอร์เปิดโหมดลดเวลาได้เอง พร้อมตั้งอัตราและเวลาขั้นต่ำ",
    },
    en: {
      title: "Subathon: add time, reduce time, or just donate",
      body: "While a subathon timer runs, supporters choose what their tip does to the clock. Creators can turn on time reduction and set its rate and floor.",
    },
  },
  {
    id: "2026-09-16-private-slips",
    date: "2026-09-16",
    tags: ["security"],
    th: {
      title: "สลิปการโอนเก็บแบบส่วนตัว",
      body: "ภาพสลิปถูกเก็บในที่เก็บส่วนตัว เปิดดูได้เฉพาะครีเอเตอร์เจ้าของผ่านลิงก์ชั่วคราว ไม่มีลิงก์สาธารณะอีกต่อไป",
    },
    en: {
      title: "Transfer slips are now private",
      body: "Slip images live in private storage and open only for the creator who owns them, through short-lived links — no more public URLs.",
    },
  },
];

export function latestUpdateId(): string {
  return UPDATES[0].id;
}

/** Entries are only ever added on top, so a different newest id = something new. */
export function hasUnseenUpdate(lastSeenId: string | null): boolean {
  return lastSeenId !== latestUpdateId();
}
