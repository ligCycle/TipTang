import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchOEmbed, oembedUrl } from "./youtube.ts";

const ID = "dQw4w9WgXcQ";
const fake = (status: number, body: unknown = {}) => {
  const calls: string[] = [];
  const impl = (async (url: string) => {
    calls.push(url);
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { impl, calls };
};

test("oembedUrl is built from the ID only", () => {
  assert.equal(
    oembedUrl(ID),
    "https://www.youtube.com/oembed?format=json&url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ",
  );
});

test("fetchOEmbed returns the cleaned title", async () => {
  const f = fake(200, { title: "  Never  Gonna\nGive You Up " });
  assert.deepEqual(await fetchOEmbed(ID, f.impl), { ok: true, title: "Never Gonna Give You Up" });
  assert.deepEqual(f.calls, [oembedUrl(ID)]);
});

test("fetchOEmbed: 401/404 mean the clip can't play; other failures keep it", async () => {
  assert.deepEqual(await fetchOEmbed(ID, fake(401).impl), { ok: false, reason: "gone" });
  assert.deepEqual(await fetchOEmbed(ID, fake(404).impl), { ok: false, reason: "gone" });
  assert.deepEqual(await fetchOEmbed(ID, fake(500).impl), { ok: true, title: null });
  const throws = (async () => {
    throw new Error("network");
  }) as unknown as typeof fetch;
  assert.deepEqual(await fetchOEmbed(ID, throws), { ok: true, title: null });
  assert.deepEqual(await fetchOEmbed(ID, fake(200, { nope: 1 }).impl), { ok: true, title: null });
});

test("fetchOEmbed refuses a bad ID without fetching", async () => {
  const f = fake(200, { title: "x" });
  assert.deepEqual(await fetchOEmbed("../../etc", f.impl), { ok: false, reason: "gone" });
  assert.equal(f.calls.length, 0);
});
