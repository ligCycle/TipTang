import { test } from "node:test";
import assert from "node:assert/strict";
import {
  stage,
  nudgeTemplate,
  compareRows,
  ACTIVE_WINDOW_DAYS,
  type SortableRow,
} from "./activation.ts";

const NOW = new Date("2026-09-20T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

test("no PromptPay → NO_PROMPTPAY, regardless of anything else", () => {
  assert.equal(
    stage({ promptpayId: null, overlayLastSeenAt: daysAgo(1), lastConfirmedTipAt: daysAgo(1) }, NOW),
    "NO_PROMPTPAY",
  );
  assert.equal(
    stage({ promptpayId: "", overlayLastSeenAt: null, lastConfirmedTipAt: null }, NOW),
    "NO_PROMPTPAY",
  );
});

test("PromptPay set, overlay never seen, no tip → NO_OVERLAY", () => {
  assert.equal(
    stage({ promptpayId: "0812345678", overlayLastSeenAt: null, lastConfirmedTipAt: null }, NOW),
    "NO_OVERLAY",
  );
});

test("overlay seen, no confirmed tip → NO_TIP", () => {
  assert.equal(
    stage({ promptpayId: "0812345678", overlayLastSeenAt: daysAgo(2), lastConfirmedTipAt: null }, NOW),
    "NO_TIP",
  );
});

test("confirmed tip inside the window → ACTIVE; outside → IDLE; boundary is ACTIVE", () => {
  const base = { promptpayId: "0812345678", overlayLastSeenAt: daysAgo(1) };
  assert.equal(stage({ ...base, lastConfirmedTipAt: daysAgo(29) }, NOW), "ACTIVE");
  assert.equal(stage({ ...base, lastConfirmedTipAt: daysAgo(31) }, NOW), "IDLE");
  assert.equal(stage({ ...base, lastConfirmedTipAt: daysAgo(ACTIVE_WINDOW_DAYS) }, NOW), "ACTIVE");
});

test("tips but overlay never recorded (pre-feature creators) → never NO_OVERLAY", () => {
  const base = { promptpayId: "0812345678", overlayLastSeenAt: null };
  assert.equal(stage({ ...base, lastConfirmedTipAt: daysAgo(3) }, NOW), "ACTIVE");
  assert.equal(stage({ ...base, lastConfirmedTipAt: daysAgo(90) }, NOW), "IDLE");
});

test("nudge template only for the two self-fixable stages", () => {
  assert.equal(nudgeTemplate("NO_PROMPTPAY"), "NO_PROMPTPAY");
  assert.equal(nudgeTemplate("NO_OVERLAY"), "NO_OVERLAY");
  assert.equal(nudgeTemplate("NO_TIP"), null);
  assert.equal(nudgeTemplate("ACTIVE"), null);
  assert.equal(nudgeTemplate("IDLE"), null);
});

test("rows sort by stage, then stuck-longest first", () => {
  const row = (
    s: SortableRow["stage"],
    createdDays: number,
    tipDays: number | null,
  ): SortableRow => ({
    stage: s,
    createdAt: daysAgo(createdDays),
    promptpayId: s === "NO_PROMPTPAY" ? null : "x",
    overlayLastSeenAt: null,
    lastConfirmedTipAt: tipDays === null ? null : daysAgo(tipDays),
  });
  const rows = [
    row("ACTIVE", 100, 1),
    row("NO_TIP", 20, null),
    row("NO_PROMPTPAY", 5, null),
    row("NO_PROMPTPAY", 40, null),
    row("IDLE", 200, 60),
    row("IDLE", 200, 45),
    row("ACTIVE", 100, 10),
    row("NO_OVERLAY", 15, null),
  ];
  const sorted = [...rows].sort(compareRows);
  const days = (d: Date | null) =>
    d ? Math.round((NOW.getTime() - d.getTime()) / 86_400_000) : "-";
  assert.deepEqual(
    sorted.map((r) => `${r.stage}:${days(r.createdAt)}:${days(r.lastConfirmedTipAt)}`),
    [
      "NO_PROMPTPAY:40:-", // oldest signup first
      "NO_PROMPTPAY:5:-",
      "NO_OVERLAY:15:-",
      "NO_TIP:20:-",
      "IDLE:200:60", // longest silence first
      "IDLE:200:45",
      "ACTIVE:100:1", // most recent tip first
      "ACTIVE:100:10",
    ],
  );
});
