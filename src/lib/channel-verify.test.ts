import { test } from "node:test";
import assert from "node:assert/strict";
import { badgeFor, requestStillValid, VERIFIABLE_KEYS, verifiableLinks } from "./channel-verify.ts";

const YT = "https://youtube.com/@slowmoji";

test("only channel platforms can be verified, in a fixed order", () => {
  assert.deepEqual([...VERIFIABLE_KEYS], ["youtube", "twitch", "tiktok", "facebook", "kick", "instagram", "x"]);
  const links = verifiableLinks({
    website: "https://me.example",
    discord: "https://discord.gg/abc",
    tiktok: "https://tiktok.com/@slowmoji",
    youtube: YT,
  });
  assert.deepEqual(
    links.map((l) => l.key),
    ["youtube", "tiktok"],
  );
  assert.equal(links[0].url, YT);
  assert.equal(links[0].label, "YouTube");
});

test("a request stays valid only while the saved link is exactly the one asked for", () => {
  assert.equal(requestStillValid("youtube", YT, { youtube: YT }), true);
  assert.equal(requestStillValid("youtube", YT, { youtube: YT + "x" }), false);
  assert.equal(requestStillValid("youtube", YT, {}), false);
  assert.equal(requestStillValid("discord", "https://discord.gg/abc", { discord: "https://discord.gg/abc" }), false);
  assert.equal(requestStillValid(null, null, { youtube: YT }), false);
});

test("the badge shows only for a verified request that still matches", () => {
  const base = { channelVerifyKey: "youtube", channelVerifyUrl: YT };
  assert.equal(badgeFor({ ...base, channelVerifyStatus: null }, { youtube: YT }), null);
  assert.equal(badgeFor({ ...base, channelVerifyStatus: "PENDING" }, { youtube: YT }), null);
  assert.equal(badgeFor({ ...base, channelVerifyStatus: "REJECTED" }, { youtube: YT }), null);
  assert.equal(badgeFor({ ...base, channelVerifyStatus: "VERIFIED" }, { youtube: YT + "/" }), null);
  assert.deepEqual(badgeFor({ ...base, channelVerifyStatus: "VERIFIED" }, { youtube: YT }), {
    key: "youtube",
    url: YT,
    label: "YouTube",
  });
});
