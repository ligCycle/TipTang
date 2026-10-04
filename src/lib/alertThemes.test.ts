import { test } from "node:test";
import assert from "node:assert/strict";
import { ALERT_THEMES, DEFAULT_ALERT_THEME, isAlertTheme } from "./alertThemes.ts";

test("light and dark are the only alert themes; light is the default", () => {
  assert.deepEqual([...ALERT_THEMES], ["light", "dark"]);
  assert.equal(DEFAULT_ALERT_THEME, "light");
});

test("isAlertTheme accepts known themes only", () => {
  assert.equal(isAlertTheme("dark"), true);
  assert.equal(isAlertTheme("light"), true);
  for (const v of ["Dark", "", null, undefined, 1, "neon"]) assert.equal(isAlertTheme(v), false);
});
