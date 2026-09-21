// checkout 建單 payload 的 utm_data。
//
// Sanitizes the first-touch UTM object captured by track.ts (sessionStorage
// `ap_utm`) into the order-contract shape before it rides the checkout
// confirm request:
//   - whitelist of 7 keys — note `ttclid` IS captured for behavior beacons but
//     is NOT part of the order contract, so it is dropped here;
//   - values must be non-empty strings, truncated to 256 chars;
//   - serialized total capped at 2 KB (later whitelist keys dropped first —
//     whitelist order doubles as significance order);
//   - returns null when nothing survives, so the caller omits the field
//     entirely and no-ad traffic keeps a byte-identical payload.
// The server re-sanitizes with the same rules; this keeps requests
// honest and inside the contract even if storage was tampered with.
// Plain .mjs so `node --test` imports it without a TS toolchain (same pattern
// as checkout-payments.mjs).

export const ORDER_UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "fbclid",
  "gclid",
];

const VALUE_MAX = 256;
const TOTAL_MAX = 2048;

export function sanitizeUtmForOrder(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out = {};
  for (const k of ORDER_UTM_KEYS) {
    const v = raw[k];
    if (typeof v === "string" && v.length > 0) out[k] = v.slice(0, VALUE_MAX);
  }
  let keys = Object.keys(out);
  if (keys.length === 0) return null;
  while (keys.length > 0 && JSON.stringify(out).length > TOTAL_MAX) {
    delete out[keys[keys.length - 1]];
    keys = Object.keys(out);
  }
  return keys.length > 0 ? out : null;
}
