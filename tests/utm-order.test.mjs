// UTM sanitizer contract tests.
// The order contract: whitelist 7 keys, string values ≤256 chars, total ≤2KB,
// absent field when nothing survives. Run: `node --test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeUtmForOrder, ORDER_UTM_KEYS } from "../src/lib/utm-order.mjs";

test("whitelist keys pass through unchanged", () => {
  const input = {
    utm_source: "facebook",
    utm_medium: "cpc",
    utm_campaign: "summer_sale",
    fbclid: "abc123",
  };
  assert.deepEqual(sanitizeUtmForOrder(input), input);
});

test("ttclid (captured for beacons, outside the order contract) is dropped", () => {
  const out = sanitizeUtmForOrder({ utm_source: "tiktok", ttclid: "tt-xyz" });
  assert.deepEqual(out, { utm_source: "tiktok" });
});

test("unknown keys are stripped", () => {
  const out = sanitizeUtmForOrder({
    utm_campaign: "c1",
    evil_key: "x",
    __proto__x: "y",
  });
  assert.deepEqual(out, { utm_campaign: "c1" });
});

test("non-string and empty values are dropped", () => {
  const out = sanitizeUtmForOrder({
    utm_source: "",
    utm_medium: 42,
    utm_campaign: { nested: true },
    utm_term: null,
    gclid: "ok",
  });
  assert.deepEqual(out, { gclid: "ok" });
});

test("values are truncated to 256 chars", () => {
  const out = sanitizeUtmForOrder({ utm_content: "x".repeat(500) });
  assert.equal(out.utm_content.length, 256);
});

test("null/undefined/array/primitive input → null (field omitted)", () => {
  assert.equal(sanitizeUtmForOrder(null), null);
  assert.equal(sanitizeUtmForOrder(undefined), null);
  assert.equal(sanitizeUtmForOrder([]), null);
  assert.equal(sanitizeUtmForOrder("utm_source=x"), null);
});

test("object with nothing surviving → null (no-UTM path stays byte-identical)", () => {
  assert.equal(sanitizeUtmForOrder({}), null);
  assert.equal(sanitizeUtmForOrder({ ttclid: "only-non-contract" }), null);
});

test("plain 256-char values across all 7 keys stay under the 2KB cap intact", () => {
  const big = {};
  for (const k of ORDER_UTM_KEYS) big[k] = "v".repeat(256);
  const out = sanitizeUtmForOrder(big);
  assert.deepEqual(Object.keys(out), ORDER_UTM_KEYS, "nothing dropped");
  assert.ok(JSON.stringify(out).length <= 2048);
});

test("2KB total cap drops least-significant keys first, never the whole object", () => {
  // JSON escaping doubles each quote ("  → \") — the only way past VALUE_MAX
  // truncation to exceed the serialized cap.
  const big = {};
  for (const k of ORDER_UTM_KEYS) big[k] = '"'.repeat(256);
  const out = sanitizeUtmForOrder(big);
  assert.ok(out !== null, "must keep the significant head of the whitelist");
  assert.ok(
    JSON.stringify(out).length <= 2048,
    "serialized size must fit the contract cap",
  );
  assert.ok("utm_source" in out, "most-significant key survives");
  assert.ok(!("gclid" in out), "least-significant key dropped first");
});

test("whitelist is exactly the 7-key order contract", () => {
  assert.deepEqual(ORDER_UTM_KEYS, [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
    "fbclid",
    "gclid",
  ]);
});
