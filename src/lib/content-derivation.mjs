// Content derivation — FAQ payment/shipping copy and the footer payment badges
// are PROJECTED from the merchant's server config, never hand-listed in content.
//
// 鐵律: 內容不得自帶第二份清單. The "which payment /
// shipping methods do you offer" answer and the footer 金流 mark derive from the
// same merchant bundle the checkout page renders from (payment_config /
// shipping_config / storefront_config). A merchant toggles a switch in the CMS
// and the copy follows on the next build — there is no second list to drift.
//
// The bug this prevents is not hypothetical: a hand-written FAQ that says
// 宅配到府 while every home-delivery method is disabled in config reads as true,
// survives review, and is wrong. Deriving it removes the class, not the instance.

/**
 * @typedef {{ allowed_methods?: string[] }} PaymentConfig
 * @typedef {{ label?: string, enabled?: boolean, fee?: number }} ShippingMethod
 * @typedef {{ methods?: Record<string, ShippingMethod> }} ShippingConfig
 * @typedef {{ alt?: string, src?: string }} PaymentBadge
 * @typedef {{ phone?: string, tax_id?: string, address?: string, legal_entity?: string, service_hours?: string }} ContactConfig
 * @typedef {{ footer?: { payment_logos?: PaymentBadge[] }, contact?: ContactConfig }} StorefrontConfig
 */

// FAQ payment labels. Same keys as checkout-payments.PAY_LABEL, but the FAQ spells
// out the processor for credit (信用卡（綠界）) per the spec's label map — the
// checkout radio uses the bare 信用卡 because its context already reads as ECPay.
export const FAQ_PAY_LABEL = /** @type {Record<string, string>} */ ({
  cod: "貨到付款",
  credit: "信用卡（綠界）",
  atm: "ATM 轉帳",
  cvs: "超商代碼繳費",
});

/** Join with 、 and a final 與 (Traditional Chinese enumeration). */
function zhList(items) {
  if (items.length <= 1) return items.join("");
  return items.slice(0, -1).join("、") + "與" + items[items.length - 1];
}

/**
 * What an empty config MEANS, which depends on the shape of the shop.
 *
 * For a shop that sells, nothing to derive from is a fault: the alternative is
 * a frozen payment list outliving the real one, which is the failure these
 * derives exist to prevent. So it throws, and that is unchanged.
 *
 * For a SHOWCASE shop it is the ordinary case and can never be anything else. A
 * salon or a studio books and enquires; it has no payment methods and no
 * shipping methods, and it never will. The question the template ships —
 * 「提供哪些付款方式？」— is one such a shop was never going to answer, so the
 * honest result is that the question REMOVES ITSELF rather than that the build
 * stops.
 *
 * Returning null rather than substitute prose is deliberate. What a showcase
 * shop says instead is its own copy, in its own words, through its own channel;
 * a template that guessed would put a sentence nobody wrote onto a page nobody
 * reviewed. Dropping the question says only what is true.
 *
 * This was hit by four storefronts before it was fixed, and each one paid for
 * it as a build failure and then "solved" it by emptying `faq.items` — which
 * also removes the questions a showcase shop legitimately wants, and reads in
 * the diff like a content decision rather than like the same defect a fourth
 * time.
 *
 * @param {{ sells?: boolean } | undefined} options
 * @returns {boolean} true when an empty config is a fault worth stopping for
 */
function emptyIsAFault(options) {
  return options?.sells !== false;
}

/**
 * FAQ「提供哪些付款方式？」answer, derived from payment_config.allowed_methods.
 * COD is listed first to mirror the checkout page's default order. Throws
 * (fail-visible at build) rather than shipping a stale/empty list — unless the
 * caller says this shop does not sell, in which case the question drops. See
 * `emptyIsAFault`.
 * @param {PaymentConfig | null | undefined} paymentCfg
 * @param {{ sells?: boolean }} [options]
 * @returns {string | null}
 */
export function derivePaymentFaqAnswer(paymentCfg, options) {
  const allowed = paymentCfg?.allowed_methods;
  if (!Array.isArray(allowed) || allowed.length === 0) {
    if (!emptyIsAFault(options)) return null;
    throw new Error(
      "faq: merchant payment_config.allowed_methods is missing or empty — " +
        "refusing to render a frozen payment list",
    );
  }
  const ordered = ["cod", ...allowed.filter((m) => m !== "cod")].filter((m) =>
    allowed.includes(m),
  );
  const labels = ordered.map((k) => FAQ_PAY_LABEL[k] ?? k);
  // The 綠界（ECPay）clause must only name methods actually offered, so it stays
  // truthful if a merchant disables one of the ECPay-processed methods.
  const ECPAY_SHORT = /** @type {Record<string, string>} */ ({
    credit: "信用卡",
    atm: "ATM",
    cvs: "超商代碼",
  });
  const ecpay = ordered.filter((k) => k in ECPAY_SHORT).map((k) => ECPAY_SHORT[k]);
  const ecpayClause = ecpay.length
    ? `；${ecpay.join("／")}由綠界（ECPay）金流處理`
    : "";
  return `提供${zhList(labels)}，皆可於結帳頁選擇${ecpayClause}。`;
}

/**
 * FAQ「提供哪些配送方式？」answer, derived from the enabled shipping_config.methods
 * (custom labels included, source order preserved). Throws when nothing is
 * enabled — unless the caller says this shop does not sell, in which case the
 * question drops. See `emptyIsAFault`.
 * @param {ShippingConfig | null | undefined} shippingCfg
 * @param {{ sells?: boolean }} [options]
 * @returns {string | null}
 */
export function deriveShippingFaqAnswer(shippingCfg, options) {
  const methods = shippingCfg?.methods ?? {};
  const enabled = Object.values(methods)
    .filter((m) => m?.enabled === true)
    .map((m) => m.label)
    .filter(Boolean);
  if (enabled.length === 0) {
    if (!emptyIsAFault(options)) return null;
    throw new Error(
      "faq: merchant shipping_config has no enabled methods — " +
        "refusing to render a frozen shipping list",
    );
  }
  return `目前提供${zhList(enabled)}，可於結帳時選擇；運費依所選方式於結帳頁自動試算。`;
}

/**
 * Legal-entity contact block (footer, contact page, terms/privacy bullets,
 * Organization JSON-LD), derived from storefront_config.contact. No static
 * fallback on purpose: a hardcoded company block outlives every change to the
 * real one, so a missing field must fail the build rather than silently freeze
 * a placeholder into the legal pages.
 * @param {StorefrontConfig | null | undefined} storefrontConfig
 * @returns {{ legalEntity: string, taxId: string, phone: string, address: string, serviceHours: string }}
 */
export function deriveLegalContact(storefrontConfig) {
  const contact = storefrontConfig?.contact ?? {};
  const missing = ["legal_entity", "tax_id", "phone", "address", "service_hours"].filter(
    (key) => typeof contact[key] !== "string" || contact[key].trim() === "",
  );
  if (missing.length > 0) {
    throw new Error(
      `legal-contact: merchant storefront_config.contact is missing ${missing.join(", ")} — ` +
        "refusing to render frozen company info",
    );
  }
  return {
    legalEntity: contact.legal_entity,
    taxId: contact.tax_id,
    phone: contact.phone,
    address: contact.address,
    serviceHours: contact.service_hours,
  };
}

/**
 * Footer 金流 badges, derived from storefront_config.footer.payment_logos.
 * Falls back to whatever brand/identity.ts declares — an empty array by default,
 * which renders no 金流 block at all. The processor a shop uses is a fact about
 * that shop, so the template ships no default mark of its own.
 * @param {StorefrontConfig | null | undefined} storefrontConfig
 * @param {PaymentBadge[]} fallback
 * @returns {PaymentBadge[]}
 */
export function deriveFooterPaymentBadges(storefrontConfig, fallback = []) {
  const badges = storefrontConfig?.footer?.payment_logos;
  if (Array.isArray(badges) && badges.length > 0) {
    const cleaned = badges
      .map((b) => ({ alt: b?.alt ?? "", src: b?.src }))
      .filter((b) => typeof b.src === "string" && b.src.length > 0);
    if (cleaned.length > 0) return cleaned;
  }
  return fallback;
}
