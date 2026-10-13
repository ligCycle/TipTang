import { test } from "node:test";
import assert from "node:assert/strict";
import { jsonLdString } from "./jsonld.ts";

test("a script-closing string cannot escape the data block", () => {
  const out = jsonLdString({ name: "</script><script>alert(1)</script>" });
  assert.ok(!out.includes("<"), "no raw < in the serialised output");
  assert.ok(!/<\/script/i.test(out));
});

test("the output still parses back to the original value", () => {
  const value = {
    name: "</script><b>x</b> & \u2028 \u2029 ไทย",
    nested: { bio: "<!-- not a comment -->" },
  };
  assert.deepEqual(JSON.parse(jsonLdString(value)), value);
});

test("ordinary values are unchanged apart from escapes", () => {
  assert.equal(jsonLdString({ a: 1, b: "x" }), '{"a":1,"b":"x"}');
});
