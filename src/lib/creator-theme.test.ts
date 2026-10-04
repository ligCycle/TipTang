import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STEPS,
  parseHex,
  contrast,
  clashesWithTip,
  creatorRamp,
  creatorThemeCss,
} from "./creator-theme.ts";

const WHITE = "#ffffff";
const DARK_BG = "#140b11";

test("parseHex normalises #rgb and #rrggbb, rejects the rest", () => {
  assert.equal(parseHex("#ABC"), "#aabbcc");
  assert.equal(parseHex(" #7C3AED "), "#7c3aed");
  assert.equal(parseHex("red"), null);
  assert.equal(parseHex("#12345"), null);
  assert.equal(parseHex(null), null);
});

test("no override for empty, default pink or invalid colours", () => {
  for (const v of [null, undefined, "", "#ec4899", "#EC4899", "red;}body{display:none}"]) {
    assert.equal(creatorThemeCss(v), null, String(v));
  }
});

test("ramps have all ten steps as #rrggbb", () => {
  const { light, dark } = creatorRamp("#7c3aed");
  for (const s of STEPS) {
    assert.match(light[s], /^#[0-9a-f]{6}$/);
    assert.match(dark[s], /^#[0-9a-f]{6}$/);
  }
});

test("buttons and text stay readable for light and dark channel colours", () => {
  for (const c of ["#facc15", "#f59e0b", "#06b6d4", "#ffffff", "#7c3aed", "#0f172a", "#1e3a8a"]) {
    const { light, dark } = creatorRamp(c);
    assert.ok(contrast(light[600], WHITE) >= 4.5, `${c} light600 ${light[600]}`);
    assert.ok(contrast(light[700], WHITE) >= 4.5, `${c} light700 ${light[700]}`);
    assert.ok(contrast(light[900], WHITE) >= 7, `${c} light900 ${light[900]}`);
    assert.ok(contrast(dark[600], DARK_BG) >= 4.5, `${c} dark600 ${dark[600]}`);
    assert.ok(contrast(dark[700], DARK_BG) >= 4.5, `${c} dark700 ${dark[700]}`);
  }
});

test("orange-ish colours swap the tip text colour; others don't", () => {
  assert.equal(clashesWithTip("#f59e0b"), true);
  assert.equal(clashesWithTip("#3b82f6"), false);
  assert.equal(clashesWithTip("#64748b"), false); // grey: low saturation
  assert.match(creatorThemeCss("#f59e0b") ?? "", /--color-tip-600:/);
  assert.doesNotMatch(creatorThemeCss("#3b82f6") ?? "", /--color-tip-600:/);
});

test("CSS covers light + dark and only contains #rrggbb colours", () => {
  const css = creatorThemeCss("#7c3aed") ?? "";
  assert.match(css, /^:root\{--color-brand-50:#[0-9a-f]{6};/);
  assert.ok(css.includes(':root[data-theme="dark"]{--color-brand-50:'));
  for (const m of css.match(/#[0-9a-fA-F]+/g) ?? []) assert.equal(m.length, 7, m);
});
