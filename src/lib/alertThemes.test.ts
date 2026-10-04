import { test } from "node:test";
import assert from "node:assert/strict";
import { ALERT_THEMES, DEFAULT_ALERT_THEME, darkCardGlow, isAlertTheme } from "./alertThemes.ts";
import { contrast } from "./creator-theme.ts";

test("light and dark are the only alert themes; light is the default", () => {
  assert.deepEqual([...ALERT_THEMES], ["light", "dark"]);
  assert.equal(DEFAULT_ALERT_THEME, "light");
});

test("isAlertTheme accepts known themes only", () => {
  assert.equal(isAlertTheme("dark"), true);
  assert.equal(isAlertTheme("light"), true);
  for (const v of ["Dark", "", null, undefined, 1, "neon"]) assert.equal(isAlertTheme(v), false);
});

test("darkCardGlow keeps a colour that already reads on the dark card", () => {
  assert.equal(darkCardGlow("#ec4899"), "#ec4899");
});

test("darkCardGlow lifts near-black colours to at least 3:1 on the dark card", () => {
  for (const c of ["#0f172a", "#000000"]) {
    const g = darkCardGlow(c);
    assert.match(g, /^#[0-9a-f]{6}$/i);
    assert.ok(contrast(g, "#120c16") >= 3, `${c} -> ${g}`);
  }
});
