/**
 * Pure rules for the spin wheel ("วงล้อสุ่ม"). A wheel has tasks; every task
 * gets the same number of segments ("แต่ละภารกิจมีกี่ช่อง"), spread evenly round
 * the wheel. The server draws uniformly over the segments still left.
 */

export const MAX_WHEELS = 20;
export const MIN_TASKS = 2;
export const MAX_TASKS = 24;
export const MAX_SEGMENTS = 48;
export const MAX_SLOTS = 4;
export const MAX_TASK_TEXT = 40;
export const DEFAULT_WHEEL_PRICE = 50;
/** A confirmed spin not yet shown on stream still plays within this window. */
export const LATE_PLAY_MS = 3_600_000;

export type WheelTask = { id: string; text: string; noAction: boolean };
export type Segment = { key: string; taskId: string };

export function segmentKey(taskId: string, copy: number) {
  return `${taskId}#${copy}`;
}

/** Round-robin copies (all tasks copy 0, then copy 1, …) so copies never sit together, minus removed keys. */
export function layoutSegments(tasks: WheelTask[], slots: number, removed: string[]): Segment[] {
  const gone = new Set(removed);
  const out: Segment[] = [];
  for (let copy = 0; copy < slots; copy++) {
    for (const t of tasks) {
      const key = segmentKey(t.id, copy);
      if (!gone.has(key)) out.push({ key, taskId: t.id });
    }
  }
  return out;
}

export function drawSegment(segments: Segment[], rand: () => number): Segment | null {
  if (segments.length === 0) return null;
  const i = Math.min(segments.length - 1, Math.floor(rand() * segments.length));
  return segments[i];
}

/** The largest slots-per-task ≤ the request (and ≤ MAX_SLOTS) that keeps tasks × slots ≤ MAX_SEGMENTS; at least 1. */
export function clampSlots(taskCount: number, slots: number): number {
  const want = Math.min(MAX_SLOTS, Math.max(1, Math.floor(slots) || 1));
  const room = taskCount > 0 ? Math.floor(MAX_SEGMENTS / taskCount) : MAX_SLOTS;
  return Math.max(1, Math.min(want, room));
}

export function taskOdds(tasks: WheelTask[], slots: number, removed: string[]) {
  const segs = layoutSegments(tasks, slots, removed);
  return tasks.map((t) => ({
    taskId: t.id,
    text: t.text,
    remaining: segs.filter((s) => s.taskId === t.id).length,
  }));
}

/** Spin and picked sound prices add up; the creator minimum is the floor. */
export function spinFloor(creatorMin: number, wheelPrice: number, soundPrice: number | null): number {
  return Math.max(creatorMin, wheelPrice + (soundPrice ?? 0));
}

export type TemplateKey = "task" | "reward" | "game";
export type WheelTemplate = {
  name: string;
  removeWhenHit: boolean;
  tasks: { text: string; noAction?: boolean }[];
};

/** Starter wheels (Thai copy; the creator edits freely). No "spin again" — one spin per tip. */
export const TEMPLATES: Record<TemplateKey, WheelTemplate> = {
  task: {
    name: "วงล้อภารกิจ",
    removeWhenHit: false,
    tasks: [
      { text: "ร้องเพลง 1 ท่อน" },
      { text: "วิดพื้น 10 ครั้ง" },
      { text: "พูดสำเนียงใต้ 1 ตา" },
      { text: "ปิดเสียงเกม 5 นาที" },
      { text: "เต้น 10 วิ" },
      { text: "อ่านคอมเมนต์ด้วยเสียงสูง 1 นาที" },
      { text: "เสียดาย ไม่ได้อะไร", noAction: true },
    ],
  },
  reward: {
    name: "วงล้อรางวัลแฟน",
    removeWhenHit: true,
    tasks: [
      { text: "ได้ตะโกนชื่อบนไลฟ์" },
      { text: "เลือกเกมต่อไป" },
      { text: "ถาม 1 คำถาม" },
      { text: "ตั้งชื่อตัวละคร" },
      { text: "เสียดาย ไม่ได้อะไร", noAction: true },
      { text: "เสียดาย ไม่ได้อะไร", noAction: true },
    ],
  },
  game: {
    name: "วงล้อเกม",
    removeWhenHit: false,
    tasks: [
      { text: "ใช้แค่ปืนพก" },
      { text: "ห้ามกระโดด 1 นาที" },
      { text: "เปลี่ยนตัวละคร" },
      { text: "เล่นกลับหัวกล้อง" },
      { text: "เสียดาย ไม่ได้อะไร", noAction: true },
    ],
  },
};
