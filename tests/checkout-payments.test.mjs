// Regression guard: the checkout payment list must be derived, never gated.
// The checkout payment list MUST come from merchant config, never a hardcoded
// front-end whitelist — a stale whitelist is what silently hid credit/atm from
// 06-09 onward. Run: `node --test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  derivePaymentMethods,
  SUPPORTED_PAYMENT_METHODS,
} from "../src/lib/checkout-payments.mjs";

test("list is derived from config allowed_methods, not hardcoded", () => {
  const methods = derivePaymentMethods({
    allowed_methods: ["credit", "atm", "cvs", "cod"],
  });
  assert.deepEqual(
    methods.map((m) => m.key).sort(),
    ["atm", "cod", "credit", "cvs"],
    "every allow-listed method must appear",
  );
});

test("credit is ENABLED whenever the merchant allow-lists it (the P0 bug)", () => {
  const methods = derivePaymentMethods({ allowed_methods: ["cod", "credit"] });
  const credit = methods.find((m) => m.key === "credit");
  assert.ok(credit, "credit must be offered when allow-listed");
  assert.equal(credit.enabled, true, "an allow-listed method must be selectable");
});

test("credit is labelled 信用卡 (ECPay), never TapPay", () => {
  const [credit] = derivePaymentMethods({ allowed_methods: ["credit"] });
  assert.equal(credit.label, "信用卡");
});

test("COD is ordered first so it stays the default selection", () => {
  const methods = derivePaymentMethods({
    allowed_methods: ["credit", "atm", "cod"],
  });
  assert.equal(methods[0].key, "cod");
});

test("no hidden gate: config drives the list even if order varies", () => {
  const methods = derivePaymentMethods({ allowed_methods: ["atm", "cvs"] });
  // cod not allow-listed here → must NOT be injected.
  assert.equal(
    methods.some((m) => m.key === "cod"),
    false,
    "must not fabricate methods the merchant did not allow",
  );
  assert.deepEqual(methods.map((m) => m.key).sort(), ["atm", "cvs"]);
});

test("fail-visible: throws on missing/empty config instead of COD-only fallback", () => {
  assert.throws(() => derivePaymentMethods(null), /missing or empty/);
  assert.throws(() => derivePaymentMethods({}), /missing or empty/);
  assert.throws(
    () => derivePaymentMethods({ allowed_methods: [] }),
    /missing or empty/,
  );
});

test("all four live methods are in the client submit-guard mirror", () => {
  for (const m of ["cod", "credit", "atm", "cvs"]) {
    assert.ok(
      SUPPORTED_PAYMENT_METHODS.includes(m),
      `${m} must be submittable`,
    );
  }
});
