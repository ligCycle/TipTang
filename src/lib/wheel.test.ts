import { test } from "node:test";
import assert from "node:assert/strict";
import {
  layoutSegments,
  drawSegment,
  clampSlots,
  taskOdds,
  spinFloor,
  TEMPLATES,
  cleanWheelPrice,
  cleanTasks,
  pruneRemoved,
  landingRotation,
  MIN_TASKS,
  MAX_TASKS,
  MAX_TASK_TEXT,
  type WheelTask,
} from "./wheel.ts";

const tasks: WheelTask[] = [
  { id: "A", text: "ร้องเพลง", noAction: false },
  { id: "B", text: "วิดพื้น", noAction: false },
  { id: "C", text: "เสียดาย", noAction: true },
];

test("layoutSegments: 3 tasks × 2 slots → 6 segments, copies not adjacent", () => {
  const keys = layoutSegments(tasks, 2, []).map((s) => s.key);
  assert.deepEqual(keys, ["A#0", "B#0", "C#0", "A#1", "B#1", "C#1"]);
});

test("layoutSegments: removed key is skipped", () => {
  const segs = layoutSegments(tasks, 2, ["B#1"]);
  assert.equal(segs.length, 5);
  assert.ok(!segs.some((s) => s.key === "B#1"));
  assert.equal(segs.find((s) => s.key === "B#0")?.taskId, "B");
});

test("drawSegment: uniform index via rand, empty → null", () => {
  const segs = layoutSegments(tasks, 1, []);
  assert.equal(drawSegment(segs, () => 0)?.key, "A#0");
  assert.equal(drawSegment(segs, () => 0.999)?.key, "C#0");
  assert.equal(drawSegment(segs, () => 0.5)?.key, "B#0");
  assert.equal(drawSegment([], () => 0), null);
});

test("clampSlots: caps tasks × slots at 48, never below 1", () => {
  assert.equal(clampSlots(13, 4), 3);
  assert.equal(clampSlots(24, 4), 2);
  assert.equal(clampSlots(2, 4), 4);
  assert.equal(clampSlots(2, 0), 1);
  assert.equal(clampSlots(2, 9), 4);
  assert.equal(clampSlots(60, 1), 1);
});

test("taskOdds: counts remaining segments per task after removals", () => {
  assert.deepEqual(taskOdds(tasks, 2, ["A#0", "A#1", "B#1"]), [
    { taskId: "A", text: "ร้องเพลง", remaining: 0 },
    { taskId: "B", text: "วิดพื้น", remaining: 1 },
    { taskId: "C", text: "เสียดาย", remaining: 2 },
  ]);
});

test("spinFloor: max(creatorMin, wheel + sound)", () => {
  assert.equal(spinFloor(20, 50, null), 50);
  assert.equal(spinFloor(20, 50, 30), 80);
  assert.equal(spinFloor(100, 50, 0), 100);
});

test("TEMPLATES: valid sizes and texts; only reward removes when hit", () => {
  for (const [key, tpl] of Object.entries(TEMPLATES)) {
    assert.ok(tpl.tasks.length >= MIN_TASKS && tpl.tasks.length <= MAX_TASKS, key);
    for (const t of tpl.tasks) assert.ok(t.text.length > 0 && t.text.length <= MAX_TASK_TEXT, t.text);
    assert.ok(!tpl.tasks.some((t) => t.text.includes("หมุนอีก")), key);
  }
  assert.equal(TEMPLATES.reward.removeWhenHit, true);
  assert.equal(TEMPLATES.task.removeWhenHit, false);
  assert.equal(TEMPLATES.game.removeWhenHit, false);
});

test("cleanWheelPrice: whole baht 1–100000", () => {
  assert.equal(cleanWheelPrice(50), 50);
  assert.equal(cleanWheelPrice("80"), 80);
  assert.equal(cleanWheelPrice(0), null);
  assert.equal(cleanWheelPrice(1.5), null);
  assert.equal(cleanWheelPrice(100001), null);
  assert.equal(cleanWheelPrice("abc"), null);
});

test("cleanTasks: trims, keeps ids, enforces 2–24 and text length", () => {
  assert.deepEqual(cleanTasks([{ id: "a", text: "  ร้อง  ", noAction: false }, { text: "เต้น", noAction: true }]), [
    { id: "a", text: "ร้อง", noAction: false },
    { id: null, text: "เต้น", noAction: true },
  ]);
  assert.equal(cleanTasks([{ text: "one" }]), null);
  assert.equal(cleanTasks([{ text: "a" }, { text: "   " }]), null);
  assert.equal(cleanTasks([{ text: "a" }, { text: "x".repeat(41) }]), null);
  assert.equal(cleanTasks(Array.from({ length: 25 }, (_, i) => ({ text: "t" + i }))), null);
  assert.equal(cleanTasks("nope"), null);
});

test("pruneRemoved: drops keys of deleted tasks and copies beyond slots", () => {
  assert.deepEqual(pruneRemoved(["A#0", "A#2", "Z#0", "B#1"], ["A", "B"], 2), ["A#0", "B#1"]);
  assert.deepEqual(pruneRemoved(["A#0", "A#0"], ["A"], 1), ["A#0"]);
});

test("landingRotation: whole turns then the segment centre under the top pointer", () => {
  assert.equal(landingRotation(4, 0, 5), 1755);
  assert.equal(landingRotation(4, 3, 5), 1485);
  assert.equal(landingRotation(1, 0, 2), 540);
});
