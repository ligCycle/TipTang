/**
 * Pure rules for the spin wheel ("วงล้อสุ่ม"). A wheel has tasks; every task
 * gets the same number of segments ("แต่ละภารกิจมีกี่ช่อง"), spread evenly round
 * the wheel. The server draws uniformly over the segments still left.
 */

import { extrasFloor } from "./wishlist.ts";

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

/**
 * Clockwise rotation (degrees) that spins `turns` full turns and stops with
 * segment `index` of `count` centred under the pointer at the top.
 */
export function landingRotation(count: number, index: number, turns: number): number {
  return turns * 360 - ((index + 0.5) * 360) / count;
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
  return extrasFloor(creatorMin, [wheelPrice, soundPrice]);
}

export const MAX_WHEEL_PRICE = 100_000;

/** Price per spin: whole baht 1–100,000, or null. */
export function cleanWheelPrice(v: unknown): number | null {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= MAX_WHEEL_PRICE ? n : null;
}

export type TaskInput = { id: string | null; text: string; noAction: boolean };

/** A wheel's task list from a request: 2–24 tasks, text 1–40 characters after trimming. */
export function cleanTasks(v: unknown): TaskInput[] | null {
  if (!Array.isArray(v) || v.length < MIN_TASKS || v.length > MAX_TASKS) return null;
  const out: TaskInput[] = [];
  for (const raw of v) {
    const o = raw as Record<string, unknown> | null;
    const text = typeof o?.text === "string" ? o.text.trim() : "";
    if (!text || text.length > MAX_TASK_TEXT) return null;
    out.push({ id: typeof o?.id === "string" ? o.id : null, text, noAction: o?.noAction === true });
  }
  return out;
}

/** Removed segment keys still meaningful after tasks or slots change. */
export function pruneRemoved(removed: string[], taskIds: string[], slots: number): string[] {
  const ids = new Set(taskIds);
  const out = new Set<string>();
  for (const k of removed) {
    const i = k.lastIndexOf("#");
    const copy = Number(k.slice(i + 1));
    if (ids.has(k.slice(0, i)) && Number.isInteger(copy) && copy >= 0 && copy < slots) out.add(k);
  }
  return [...out];
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
    name: "ภารกิจ",
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
    name: "รางวัลแฟน",
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
    name: "เกม",
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
