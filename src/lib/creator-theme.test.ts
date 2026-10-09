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
const BLACK = "#000000";
const DARK_BG = "#140b11";
/** Lightest dark surface brand text sits on (.card-solid). */
const DARK_SURFACE = "#26161f";

/** HSL (h in degrees, s/l in 0–1) → #rrggbb, for the sweep below. */
function hsl(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return (
    "#" +
    [r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, "0")).join("")
  );
}

/**
 * Every 15° of hue × 3 saturations × 7 lightnesses, plus greys, presets and
 * the colours that broke earlier versions (bright yellows/cyans, white,
 * violet, slate, navy, near-black, pinks).
 */
const COLOURS = [
  ...Array.from({ length: 24 }, (_, i) =>
    [0.25, 0.6, 1].flatMap((s) =>
      [0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9].map((l) => hsl(i * 15, s, l)),
    ),
  ).flat(),
  "#ffffff",
  "#000000",
  "#808080",
  "#facc15",
  "#f59e0b",
  "#06b6d4",
  "#22c55e",
  "#84cc16",
  "#7c3aed",
  "#64748b",
  "#0f172a",
  "#1e3a8a",
  "#f472b6",
  "#ff69b4",
];

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

test("creatorRamp normalises its input and rejects anything that isn't hex", () => {
  assert.deepEqual(creatorRamp(" #7C3AED "), creatorRamp("#7c3aed"));
  assert.throws(() => creatorRamp("red;}x{"));
});

test("light buttons and text stay readable; dark 500 keeps 3:1 on the page", () => {
  for (const c of COLOURS) {
    const { light, dark } = creatorRamp(c);
    assert.ok(contrast(light[600], WHITE) >= 4.5, `${c} light600 ${light[600]}`);
    assert.ok(contrast(light[700], WHITE) >= 4.5, `${c} light700 ${light[700]}`);
    assert.ok(contrast(light[900], WHITE) >= 7, `${c} light900 ${light[900]}`);
    assert.ok(contrast(dark[500], DARK_BG) >= 3, `${c} dark500 ${dark[500]}`);
  }
});

test("dark 600/700 read on the lightest dark surface; white labels on 600 reach 3:1", () => {
  for (const c of COLOURS) {
    const { dark } = creatorRamp(c);
    assert.ok(contrast(dark[600], DARK_SURFACE) >= 4.5, `${c} dark600 ${dark[600]} on surface`);
    assert.ok(contrast(WHITE, dark[600]) >= 3, `${c} white on dark600 ${dark[600]}`);
    assert.ok(contrast(dark[700], DARK_SURFACE) >= 4.5, `${c} dark700 ${dark[700]} on surface`);
    // Contrast against black rises strictly with luminance: 700 is strictly lighter.
    assert.ok(
      contrast(dark[700], BLACK) > contrast(dark[600], BLACK),
      `${c} dark700 ${dark[700]} not lighter than dark600 ${dark[600]}`,
    );
  }
});

test("light 500 and 800 have a contrast floor on white", () => {
  for (const c of COLOURS) {
    const { light } = creatorRamp(c);
    assert.ok(contrast(light[500], WHITE) >= 3, `${c} light500 ${light[500]}`);
    assert.ok(contrast(light[800], WHITE) >= 4.5, `${c} light800 ${light[800]}`);
  }
});

test("ramp steps only get stronger: darker on light, lighter on dark", () => {
  const lightSteps = [500, 600, 700, 800, 900] as const;
  // Dark 500 is left out: it is the raw accent (focus ring, chart), while 600 is
  // capped for white labels, so a bright accent's 500 is lighter than its 600.
  const darkSteps = [600, 700, 800, 900] as const;
  for (const c of COLOURS) {
    const { light, dark } = creatorRamp(c);
    for (let i = 1; i < lightSteps.length; i++) {
      const [p, s] = [lightSteps[i - 1], lightSteps[i]];
      assert.ok(
        contrast(light[s], WHITE) >= contrast(light[p], WHITE),
        `${c} light${s} ${light[s]} weaker than light${p} ${light[p]}`,
      );
    }
    for (let i = 1; i < darkSteps.length; i++) {
      const [p, s] = [darkSteps[i - 1], darkSteps[i]];
      assert.ok(
        contrast(dark[s], DARK_BG) >= contrast(dark[p], DARK_BG),
        `${c} dark${s} ${dark[s]} weaker than dark${p} ${dark[p]}`,
      );
    }
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
