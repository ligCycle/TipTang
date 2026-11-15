/**
 * Words on the OBS overlays, in the language the creator picked for their
 * stream (User.overlayLang, set on the "เชื่อม OBS" card). Thai is the
 * default; existing OBS links keep working and switch with the setting.
 * Pure, no "server-only" import — so it runs under `node --test`.
 */

export type OverlayLang = "th" | "en";
export const OVERLAY_LANGS: readonly OverlayLang[] = ["th", "en"];

/** A stored or posted value, falling back to Thai for anything unknown. */
export function overlayLangOf(raw: unknown): OverlayLang {
  return raw === "en" ? "en" : "th";
}

const th = {
  anonymous: "ผู้ไม่ประสงค์ออกนาม",
  sampleSupporter: "ผู้สนับสนุนตัวอย่าง",
  sampleMessage: "ทดสอบ Donation Alert",
  newTip: "ทิปใหม่!",
  comboLevel: (n: number) => `คอมโบทิป เลเวล ${n}`,
  minutes: (n: number) => `${n} นาที`,
  towards: (name: string) => `ช่วยซื้อ ${name}`,

  mainLink: "ลิงก์หลัก",
  barsLink: "ลิงก์แถบ",
  connected: "เชื่อมต่อแล้ว",
  hintHides: "ป้ายนี้หายเองตอนเริ่มไลฟ์หรืออัด",

  bossDefeated: (name: string) => `ปิดบอส ${name}!`,
  bossFinishedBy: "ปิดโดย",
  bossTopDamage: "ดาเมจสูงสุด",
  unlocked: "ปลดล็อก:",
  bossChain: (n: number) => `ปิดบอส ${n} ตัวรวด!`,
  bossLastHit: "ปิดท้ายโดย",
  bossRewardsToTodo: "รางวัลทั้งหมดเข้าภารกิจค้างทำแล้ว",
  bossOf: (i: number, total: number) => `บอส ${i}/${total}`,
  bossRule: "ทิป 1 บาท = 1 ดาเมจ",

  comboTitle: "คอมโบทิป",
  level: (n: number) => `เลเวล ${n}`,
  levelUp: (n: number) => `เลเวล ${n}!`,
  more: (amount: string) => `อีก ฿${amount} →`,
  unlockedList: "ปลดล็อกแล้ว:",
  comboOver: "คอมโบทิปจบแล้ว",
  comboSummary: (total: string, fans: number) => `รวม ฿${total} จาก ${fans} คน · ขอบคุณทุกคน`,
  soClose: "(เกือบได้!)",

  rarity: { common: "ธรรมดา", rare: "หายาก", epic: "สุดหายาก" },
  gachaGot: (fan: string) => `${fan} ได้`,
  wheelSpun: (fan: string) => `${fan} หมุนได้`,

  goal: "เป้าหมาย",
  goalFull: "ครบแล้ว!",
  goalMoreItems: (n: number) => `+${n} ชิ้น`,
  goalNext: "ถัดไป:",
  goalFullThanks: "ครบแล้ว! ขอบคุณทุกคน",
  fromFans: (amount: string, fans: number) => `${amount} จาก ${fans} คน`,

  clickForSound: "คลิกเพื่อเปิดเสียง",
  test: "ทดสอบ",
  voiceFrom: (fan: string, amount: string) => `ฝากเสียงจาก ${fan} · ฿${amount}`,
  requestedBy: (fan: string, amount: string) => `ขอโดย ${fan} · ฿${amount}`,
  voiceTest: "ทดสอบเสียง",
  voice: "ฝากเสียง",
  clipTest: "คลิปทดสอบ",
  youtubeClip: "คลิป YouTube",

  pkTimeUp: "หมดเวลา · รอนับทิปที่กำลังยืนยัน",
  pkCounted: "นับจากทิปที่แต่ละฝั่งยืนยัน",
  pkWins: (name: string) => `${name} ชนะ!`,
  pkDraw: "เสมอ!",
  pkForfeit: "อีกฝ่ายยอมแพ้",

  seconds: (n: number) => `${n} วิ`,
  timerPaused: "พักอยู่",
  timerUp: "หมดเวลา!",
  timerLeft: "เหลือเวลา",
  timerAdd: (baht: number) => `ทิปทุก ${baht} บาท`,
  timerReduce: (baht: number) => `ทิปลดเวลาทุก ${baht} บาท`,
  timerReduceMin: (baht: number) => `(ขั้นต่ำ ${baht} บาท)`,
  timerMax: (time: string) => `สูงสุด ${time}`,

  todoTitle: (n: number) => `ภารกิจค้างทำ (${n})`,
  todoEarlier: (n: number) => `+${n} รายการก่อนหน้า`,

  topTitle: "ท็อปผู้สนับสนุน",
  range: { today: "วันนี้", "7d": "7 วัน", "30d": "30 วัน", all: "ทั้งหมด" },
};

export type OverlayText = typeof th;

const en: OverlayText = {
  anonymous: "Anonymous",
  sampleSupporter: "Sample supporter",
  sampleMessage: "Testing the donation alert",
  newTip: "New tip!",
  comboLevel: (n) => `Combo level ${n}`,
  minutes: (n) => `${n} min`,
  towards: (name) => `Towards ${name}`,

  mainLink: "Main link",
  barsLink: "Bars link",
  connected: "Connected",
  hintHides: "This label hides itself when you go live or record",

  bossDefeated: (name) => `${name} defeated!`,
  bossFinishedBy: "Finished by",
  bossTopDamage: "Top damage",
  unlocked: "Unlocked:",
  bossChain: (n) => `${n} bosses in a row!`,
  bossLastHit: "Last hit by",
  bossRewardsToTodo: "Every reward went to the to-do list",
  bossOf: (i, total) => `Boss ${i}/${total}`,
  bossRule: "1 baht = 1 damage",

  comboTitle: "Combo tip",
  level: (n) => `Level ${n}`,
  levelUp: (n) => `Level ${n}!`,
  more: (amount) => `฿${amount} more →`,
  unlockedList: "Unlocked:",
  comboOver: "Combo over",
  comboSummary: (total, fans) => `฿${total} from ${fans} ${fans === 1 ? "person" : "people"} · thank you all`,
  soClose: "(so close!)",

  rarity: { common: "Common", rare: "Rare", epic: "Epic" },
  gachaGot: (fan) => `${fan} got`,
  wheelSpun: (fan) => `${fan} spun`,

  goal: "Goal",
  goalFull: "Done!",
  goalMoreItems: (n) => `+${n} more`,
  goalNext: "Next:",
  goalFullThanks: "Done! Thank you all",
  fromFans: (amount, fans) => `${amount} from ${fans} ${fans === 1 ? "person" : "people"}`,

  clickForSound: "Click to turn the sound on",
  test: "Test",
  voiceFrom: (fan, amount) => `Voice from ${fan} · ฿${amount}`,
  requestedBy: (fan, amount) => `Requested by ${fan} · ฿${amount}`,
  voiceTest: "Voice test",
  voice: "Voice message",
  clipTest: "Test clip",
  youtubeClip: "YouTube clip",

  pkTimeUp: "Time's up · counting tips still being confirmed",
  pkCounted: "Counted from tips each side confirmed",
  pkWins: (name) => `${name} wins!`,
  pkDraw: "Draw!",
  pkForfeit: "The other side gave up",

  seconds: (n) => `${n} s`,
  timerPaused: "Paused",
  timerUp: "Time's up!",
  timerLeft: "Time left",
  timerAdd: (baht) => `Every ${baht} baht`,
  timerReduce: (baht) => `Every ${baht} baht takes off`,
  timerReduceMin: (baht) => `(from ${baht} baht)`,
  timerMax: (time) => `Max ${time}`,

  todoTitle: (n) => `To-do (${n})`,
  todoEarlier: (n) => `+${n} earlier`,

  topTitle: "Top supporters",
  range: { today: "Today", "7d": "7 days", "30d": "30 days", all: "All time" },
};

export const OVERLAY_TEXT: Record<OverlayLang, OverlayText> = { th, en };
