import { test } from "node:test";
import assert from "node:assert/strict";
import { bytesMatchType } from "./filetype.ts";

const b = (...xs: (number | string)[]) =>
  new Uint8Array(
    xs.flatMap((x) => (typeof x === "string" ? [...x].map((c) => c.charCodeAt(0)) : [x])),
  );

test("real images pass as their declared type", () => {
  assert.ok(bytesMatchType("image/jpeg", b(0xff, 0xd8, 0xff, 0xe0)));
  assert.ok(bytesMatchType("image/png", b(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a)));
  assert.ok(bytesMatchType("image/gif", b("GIF89a")));
  assert.ok(bytesMatchType("image/webp", b("RIFF", 0, 0, 0, 0, "WEBP")));
});

test("audio and video signatures", () => {
  assert.ok(bytesMatchType("audio/mpeg", b("ID3", 4, 0)));
  assert.ok(bytesMatchType("audio/mp3", b(0xff, 0xfb, 0x90)));
  assert.ok(bytesMatchType("audio/x-wav", b("RIFF", 0, 0, 0, 0, "WAVE")));
  assert.ok(bytesMatchType("audio/ogg", b("OggS")));
  assert.ok(bytesMatchType("video/webm", b(0x1a, 0x45, 0xdf, 0xa3)));
  assert.ok(bytesMatchType("video/mp4", b(0, 0, 0, 0x20, "ftypisom")));
});

test("a renamed file fails", () => {
  // HTML/SVG uploaded with image/png claimed
  assert.equal(bytesMatchType("image/png", b("<svg xmlns=")), false);
  // a WAV claimed as WebP (same RIFF container, different form)
  assert.equal(bytesMatchType("image/webp", b("RIFF", 0, 0, 0, 0, "WAVE")), false);
  assert.equal(bytesMatchType("image/jpeg", b(0x89, "PNG")), false);
});

test("unknown or empty never passes", () => {
  assert.equal(bytesMatchType("text/html", b("<html>")), false);
  assert.equal(bytesMatchType("image/png", new Uint8Array()), false);
});
