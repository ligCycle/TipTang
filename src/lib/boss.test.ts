import { test } from "node:test";
import assert from "node:assert/strict";
import { applyDamage, undoDamage, bossAt, topDamage, cleanBossName, cleanBossHp, MAX_BOSSES } from "./boss.ts";

const HPS = [100, 200, 300];

test("damage fills the current boss without killing it", () => {
  assert.deepEqual(applyDamage({ life: 0, damage: 0 }, 60, HPS), {
    life: 0,
    damage: 60,
    pieces: [{ life: 0, amount: 60 }],
    kills: [],
  });
});

test("overkill carries over: one tip can defeat several bosses (R4)", () => {
  assert.deepEqual(applyDamage({ life: 0, damage: 50 }, 400, HPS), {
    life: 2,
    damage: 150,
    pieces: [
      { life: 0, amount: 50 },
      { life: 1, amount: 200 },
      { life: 2, amount: 150 },
    ],
    kills: [0, 1],
  });
});

test("an exact kill moves to the next boss with 0 damage", () => {
  assert.deepEqual(applyDamage({ life: 0, damage: 0 }, 100, HPS), {
    life: 1,
    damage: 0,
    pieces: [{ life: 0, amount: 100 }],
    kills: [0],
  });
});

test("after the last boss, the last one respawns", () => {
  const r = applyDamage({ life: 2, damage: 0 }, 650, HPS);
  assert.deepEqual(r.kills, [2, 3]);
  assert.equal(r.life, 4);
  assert.equal(r.damage, 50);
  assert.equal(bossAt(HPS, 4), 2);
  assert.equal(bossAt(HPS, 0), 0);
  assert.equal(bossAt([], 3), -1);
});

test("nothing happens with no bosses, zero or bad amounts", () => {
  assert.deepEqual(applyDamage({ life: 1, damage: 5 }, 50, []), { life: 1, damage: 5, pieces: [], kills: [] });
  assert.deepEqual(applyDamage({ life: 0, damage: 5 }, 0, HPS), { life: 0, damage: 5, pieces: [], kills: [] });
  assert.deepEqual(applyDamage({ life: 0, damage: 5 }, Number.NaN, HPS), { life: 0, damage: 5, pieces: [], kills: [] });
});

test("damage above a lowered HP kills on the next hit", () => {
  const r = applyDamage({ life: 0, damage: 150 }, 1, HPS);
  assert.deepEqual(r.kills, [0]);
  assert.equal(r.life, 1);
});

test("undoDamage removes only the current boss's damage from that tip, never below 0 (B2)", () => {
  assert.deepEqual(undoDamage({ life: 2, damage: 150 }, [{ life: 1, amount: 200 }, { life: 2, amount: 150 }]), { life: 2, damage: 0 });
  assert.deepEqual(undoDamage({ life: 2, damage: 100 }, [{ life: 2, amount: 150 }]), { life: 2, damage: 0 });
  assert.deepEqual(undoDamage({ life: 3, damage: 40 }, [{ life: 2, amount: 150 }]), { life: 3, damage: 40 });
});

test("topDamage sums by fan (names trimmed, case-insensitive; empty = one fan)", () => {
  assert.deepEqual(
    topDamage([
      { fan: "Mali", amount: 50 },
      { fan: "mali ", amount: 60 },
      { fan: "Ton", amount: 100 },
      { fan: "", amount: 30 },
    ]),
    { fan: "Mali", amount: 110 },
  );
  assert.equal(topDamage([]), null);
});

test("cleaners", () => {
  assert.equal(MAX_BOSSES, 10);
  assert.equal(cleanBossName("  มังกร "), "มังกร");
  assert.equal(cleanBossName("x".repeat(31)), null);
  assert.equal(cleanBossHp(500), 500);
  assert.equal(cleanBossHp(0), null);
  assert.equal(cleanBossHp(1.5), null);
  assert.equal(cleanBossHp(1_000_001), null);
});
