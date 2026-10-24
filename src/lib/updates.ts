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
    id: "2026-10-24-two-obs-links",
    date: "2026-10-24",
    tags: ["creator"],
    href: "/dashboard/features",
    th: {
      title: "เชื่อม OBS ง่ายขึ้น เหลือ 2 ลิงก์",
      body: "ลิงก์แจ้งเตือนเดิมกลายเป็นลิงก์หลัก ป๊อปอัปทุกอย่างขึ้นในนี้ทีละอย่างไม่ทับกัน และมีลิงก์แถบอีกอันสำหรับเป้าหมาย นาฬิกา PK คอมโบ และบอส คัดลอกได้ที่การ์ด \"เชื่อม OBS\" หน้าลูกเล่น ระหว่างตั้งค่าจะเห็นกรอบ \"เชื่อมต่อแล้ว\" ซึ่งหายเองตอนเริ่มไลฟ์",
    },
    en: {
      title: "Easier OBS setup: just 2 links",
      body: "Your old alert link is now the main link: every popup plays there, one at a time. A second bars link holds the goal, timer, PK, combo and boss. Copy both from the \"Connect OBS\" card on the features page. While setting up you'll see a \"connected\" frame that hides itself once you go live.",
    },
  },
  {
    id: "2026-10-24-feature-hub",
    date: "2026-10-24",
    tags: ["creator"],
    href: "/dashboard/features",
    th: {
      title: "หน้าลูกเล่นใหม่ เปิดปิดได้จากที่เดียว",
      body: "ลูกเล่นทั้งหมดรวมอยู่ในหน้า \"ลูกเล่น\" เปิดปิดได้จากสวิตช์บนการ์ด ทุกหน้ามีพรีวิวให้เห็นหน้าตาก่อนขึ้นจอ และมีปุ่มทดสอบบนจอ OBS",
    },
    en: {
      title: "A new features page, everything in one place",
      body: "Every feature now lives on the \"Features\" page with an on/off switch on its card. Each settings page shows a preview of how it looks on stream and has a test-on-OBS button.",
    },
  },
  {
    id: "2026-10-24-wheel",
    date: "2026-10-24",
    tags: ["creator", "supporter"],
    href: "/dashboard/features/wheel",
    th: {
      title: "วงล้อสุ่มภารกิจ",
      body: "แฟนติ๊ก \"หมุนวงล้อ\" ตอนทิป เมื่อยืนยันทิปแล้ววงล้อหมุนบนจอไลฟ์ ภารกิจที่ได้เข้ารายการภารกิจค้างทำให้คุณทำ",
    },
    en: {
      title: "Spin wheel of tasks",
      body: "Fans tick \"Spin the wheel\" when they tip. Once you confirm the tip, the wheel spins on stream and the task lands in your to-do list.",
    },
  },
  {
    id: "2026-10-24-gacha",
    date: "2026-10-24",
    tags: ["creator", "supporter"],
    href: "/dashboard/features/gacha",
    th: {
      title: "กาชา 3 ระดับ",
      body: "แฟนสุ่มกาชาไปกับทิป เห็นโอกาสของแต่ละระดับก่อนจ่ายเสมอ (ธรรมดา หายาก สุดหายาก) แคปซูลเปิดบนจอไลฟ์ รางวัลเข้ารายการภารกิจค้างทำ รางวัลต้องไม่ใช่เงินหรือของที่มีมูลค่าเป็นเงิน",
    },
    en: {
      title: "Gacha with 3 rarities",
      body: "Fans can add a gacha pull to their tip and always see the odds first (common, rare, epic). The capsule opens on stream and the prize goes to your to-do list. Prizes can't be money or worth money.",
    },
  },
  {
    id: "2026-10-24-clip-and-voice",
    date: "2026-10-24",
    tags: ["creator", "supporter"],
    href: "/dashboard/features/media",
    th: {
      title: "ขอคลิป/เพลง และฝากเสียง",
      body: "แฟนแนบลิงก์ YouTube หรืออัดเสียงสั้น ๆ (ไม่เกิน 30 วินาที) มากับทิปได้ คลิปและเสียงเข้าคิวให้คุณอนุมัติก่อน (หรือเปิดอนุมัติอัตโนมัติ) แล้วเล่นบนจอไลฟ์ตามลำดับ",
    },
    en: {
      title: "Clip requests and voice messages",
      body: "Fans can attach a YouTube link or a short voice message (up to 30 s) to their tip. They queue for your approval (or auto-approve) and play on stream in order.",
    },
  },
  {
    id: "2026-10-24-pk",
    date: "2026-10-24",
    tags: ["creator", "supporter"],
    href: "/dashboard/features/pk",
    th: {
      title: "PK แข่งยอดทิป",
      body: "แบ่งสองฝั่งแข่งกันในไลฟ์เดียว แฟนเลือกฝั่งตอนทิป หรือท้า PK กับครีเอเตอร์ TipTang คนอื่นด้วยชื่อผู้ใช้ จอไลฟ์โชว์แถบสองสี เวลาที่เหลือ และผู้ชนะ",
    },
    en: {
      title: "PK tip battles",
      body: "Split your stream into two sides and let fans pick one when they tip, or challenge another TipTang creator by username. The stream shows a two-color bar, the time left and the winner.",
    },
  },
  {
    id: "2026-10-24-boss-raid",
    date: "2026-10-24",
    tags: ["creator"],
    href: "/dashboard/features/boss",
    th: {
      title: "ตีบอส",
      body: "ทิปกลายเป็นดาเมจ 1 บาท = 1 HP ตั้งบอสได้หลายตัวพร้อมรางวัล ปิดบอสได้รางวัลเข้าภารกิจค้างทำ แล้วบอสตัวต่อไปก็มา",
    },
    en: {
      title: "Boss raid",
      body: "Tips deal damage, 1 baht = 1 HP. Set up several bosses with rewards; each one defeated adds its reward to your to-do list, then the next boss appears.",
    },
  },
  {
    id: "2026-10-24-combo",
    date: "2026-10-24",
    tags: ["creator"],
    href: "/dashboard/features/combo",
    th: {
      title: "คอมโบทิป",
      body: "เมื่อมีหลายคนทิปติด ๆ กัน คอมโบเริ่มบนจอไลฟ์ หลอดเต็มเลเวลขึ้นและปลดล็อกรางวัลที่คุณตั้งไว้",
    },
    en: {
      title: "Combo tips",
      body: "When several fans tip in a row, a combo starts on stream. Each full bar levels up and unlocks the reward you set.",
    },
  },
  {
    id: "2026-10-24-wishlist-goal",
    date: "2026-10-24",
    tags: ["creator", "supporter"],
    href: "/dashboard/features/goal",
    th: {
      title: "เป้าหมายหลายชิ้นและแถบ 4 แบบ",
      body: "ตั้งของที่อยากได้ได้หลายชิ้น แฟนเลือกได้ว่าทิปนี้ช่วยซื้อชิ้นไหน และเลือกหน้าตาแถบได้ 4 แบบ (แบบหลัก ใหญ่ กระจก วงกลม)",
    },
    en: {
      title: "Wishlist goals and 4 bar styles",
      body: "List several things you're saving for and let fans choose which one their tip helps buy. Pick from 4 bar styles: classic, big, glass and ring.",
    },
  },
  {
    id: "2026-10-24-sound-pick",
    date: "2026-10-24",
    tags: ["creator", "supporter"],
    href: "/dashboard/library",
    th: {
      title: "แฟนเลือกเสียงแจ้งเตือนได้",
      body: "แฟนเลือกเสียงจากคลังของคุณตอนทิปได้ และคุณจัดเสียงเป็นชุดสลับใช้ได้ในคลังเสียงและรูป",
    },
    en: {
      title: "Fans can pick the alert sound",
      body: "Fans can choose a sound from your library when they tip, and you can organize sounds into sets to switch between in your library.",
    },
  },
  {
    id: "2026-10-24-terms-update",
    date: "2026-10-24",
    tags: ["creator", "supporter"],
    href: "/terms",
    th: {
      title: "อัปเดตข้อกำหนดและนโยบายความเป็นส่วนตัว",
      body: "เพิ่มส่วนลูกเล่นจากแฟน เช่น การสุ่มรางวัล ลิขสิทธิ์คลิปที่ขอ และการเก็บเสียงที่ฝาก อ่านได้ในหน้าข้อกำหนดและนโยบายความเป็นส่วนตัว",
    },
    en: {
      title: "Updated terms and privacy policy",
      body: "New sections cover fan features such as random prizes, copyright for requested clips and how voice messages are kept. Read them on the terms and privacy pages.",
    },
  },
  {
    id: "2026-10-09-channel-colour",
    date: "2026-10-09",
    tags: ["creator"],
    href: "/dashboard/settings",
    th: {
      title: "สีธีมของคุณ ใช้ได้ทั้งหน้าโดเนทและแดชบอร์ด",
      body: "สีธีมหน้าโปรไฟล์ที่ตั้งในหน้าตั้งค่า ตอนนี้เปลี่ยนสีทั้งหน้าโดเนทและแดชบอร์ดของคุณ ทั้งปุ่ม ลิงก์ และเมนู ระบบปรับความเข้มให้ตัวหนังสืออ่านง่ายเสมอ",
    },
    en: {
      title: "Your theme color, on your donate page and dashboard",
      body: "The profile theme color from settings now paints your whole donate page and dashboard — buttons, links and menus. TipTang adjusts the shade so text stays readable.",
    },
  },
  {
    id: "2026-10-09-dark-alert-card",
    date: "2026-10-09",
    tags: ["creator"],
    href: "/dashboard/features",
    th: {
      title: "การ์ดแจ้งเตือนแบบมืด",
      body: "เลือก \"การ์ดมืด\" ในหน้า OBS ได้แล้ว พื้นเข้มเรืองแสงตามสีการ์ดของคุณ ยอดทิปเด่นด้วยสีส้ม เห็นชัดบนเกมฉากสว่าง",
    },
    en: {
      title: "Dark alert card",
      body: "Pick \"Dark card\" on the OBS page: a dark card that glows in your alert color, with the tip amount in orange — easy to see over bright games.",
    },
  },
  {
    id: "2026-09-30-account-security",
    date: "2026-09-30",
    tags: ["creator", "security"],
    href: "/dashboard/settings",
    th: {
      title: "บัญชีปลอดภัยขึ้น",
      body: "เราส่งอีเมลเตือนทันทีเมื่อเลขพร้อมเพย์ PayPal หรือรหัสผ่านถูกเปลี่ยน มีปุ่ม \"ออกจากระบบทุกเครื่อง\" ในหน้าตั้งค่า การตั้งรหัสผ่านใหม่จะออกจากระบบทุกเครื่องให้อัตโนมัติ และการเดารหัสผ่านซ้ำ ๆ จะถูกบล็อก",
    },
    en: {
      title: "Safer accounts",
      body: "You now get an email the moment your PromptPay, PayPal or password changes. Settings has a \"sign out everywhere\" button, resetting your password signs out every device, and repeated password guessing is blocked.",
    },
  },
  {
    id: "2026-09-30-overlay-new-link",
    date: "2026-09-30",
    tags: ["creator", "security"],
    href: "/dashboard/features/alerts",
    th: {
      title: "สร้างลิงก์ OBS ใหม่ได้",
      body: "ถ้าเผลอโชว์ลิงก์ overlay บนไลฟ์ กด \"สร้างลิงก์ใหม่\" ในหน้า OBS ลิงก์เก่าจะใช้ไม่ได้ทันที แล้วเอาลิงก์ใหม่ไปใส่ใน OBS",
    },
    en: {
      title: "Make a new OBS link",
      body: "Showed your overlay link on stream by accident? Press \"Make a new link\" on the OBS page — the old one stops working at once — then paste the new one into OBS.",
    },
  },
  {
    id: "2026-09-30-slip-retention",
    date: "2026-09-30",
    tags: ["creator", "supporter", "security"],
    href: "/privacy",
    th: {
      title: "สลิปถูกลบอัตโนมัติหลัง 90 วัน และลบบัญชีได้เอง",
      body: "รูปสลิปมีชื่อและเลขบัญชีของทั้งคนโอนและคนรับ เราจึงลบให้อัตโนมัติ 90 วันหลังยืนยันหรือปฏิเสธรายการ ครีเอเตอร์ลบบัญชีพร้อมข้อมูลทั้งหมดได้เองในหน้าตั้งค่า",
    },
    en: {
      title: "Slips deleted after 90 days, and self-serve account deletion",
      body: "Slips show both sides' names and account numbers, so they're now deleted automatically 90 days after a payment is confirmed or rejected. Creators can delete their account and all its data from settings.",
    },
  },
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
    href: "/dashboard/features",
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
