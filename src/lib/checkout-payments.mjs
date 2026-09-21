// Checkout payment-method derivation — the single source of truth for which
// payment options the checkout page renders.
//
// 鐵律: the list comes SOLELY from the merchant's server-side
// payment_config.allowed_methods. There is NO hardcoded allow/deny gate — every
// method the merchant config permits is offered and enabled.
//
// A front-end whitelist is the failure mode worth naming: a merchant enables
// credit in the back office, the storefront keeps rendering COD-only because a
// constant here never learned about it, and nothing anywhere reports an error.
// The gate is the bug, so there is no gate.

/**
 * @typedef {{ allowed_methods?: string[] }} PaymentConfig
 * @typedef {{ key: string, label: string, enabled: boolean }} PaymentMethod
 */

/** Display labels for the methods the platform settles. */
export const PAY_LABEL = /** @type {Record<string, string>} */ ({
  cod: "貨到付款",
  credit: "信用卡",
  atm: "ATM 轉帳",
  cvs: "超商代碼繳費",
});

// Client-side submit guard mirror (checkout.ts also enforces): methods the
// storefront + backend can actually drive end-to-end today. Kept only as a
// defensive assertion, NOT as the render gate — the render list is config.
export const SUPPORTED_PAYMENT_METHODS = ["cod", "credit", "atm", "cvs"];

/**
 * Derive the ordered checkout payment options from merchant config.
 * COD is placed first so it stays the default selection. Every allow-listed
 * method is enabled. Throws (fail-visible) when config is missing/empty rather
 * than silently degrading to a COD-only checkout.
 * @param {PaymentConfig | null | undefined} paymentCfg
 * @returns {PaymentMethod[]}
 */
export function derivePaymentMethods(paymentCfg) {
  const allowed = paymentCfg?.allowed_methods;
  if (!Array.isArray(allowed) || allowed.length === 0) {
    throw new Error(
      "checkout: merchant payment_config.allowed_methods is missing or empty — " +
        "refusing to render a COD-only checkout",
    );
  }
  const ordered = ["cod", ...allowed.filter((m) => m !== "cod")].filter((m) =>
    allowed.includes(m),
  );
  return ordered.map((key) => ({
    key,
    label: PAY_LABEL[key] ?? key,
    enabled: true,
  }));
}
