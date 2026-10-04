import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

type Tree = { [k: string]: string | Tree };

function load(locale: "th" | "en"): Tree {
  const url = new URL(`../../messages/${locale}.json`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")) as Tree;
}

function flatten(t: Tree, prefix = ""): [string, string][] {
  return Object.entries(t).flatMap(([k, v]) =>
    typeof v === "string"
      ? [[prefix + k, v] as [string, string]]
      : flatten(v, `${prefix}${k}.`),
  );
}

test("Thai UI copy is gender-neutral (no ครับ / ค่ะ)", () => {
  const bad = flatten(load("th"))
    .filter(([, v]) => /ครับ|ค่ะ/.test(v))
    .map(([k]) => k);
  assert.deepEqual(bad, []);
});

test("TipMe appears only in the 'coming from TipMe?' FAQ question", () => {
  for (const locale of ["th", "en"] as const) {
    const keys = flatten(load(locale))
      .filter(([, v]) => /TipMe/.test(v))
      .map(([k]) => k);
    assert.deepEqual(keys, ["landing.faqQ4"], locale);
  }
});

test("the tagline exists in both locales", () => {
  for (const locale of ["th", "en"] as const) {
    const tagline = flatten(load(locale)).find(([k]) => k === "common.tagline");
    assert.ok(tagline?.[1].startsWith("Every Tip Matters"), locale);
  }
});
