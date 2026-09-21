// The offline cart demo mode uses instead of the commerce API.
//
// brand/commerce.ts → demo.enabled already short-circuits every BUILD-time
// fetch, so a freshly cloned template renders a real catalogue with no merchant
// behind it. It did nothing for the browser: the cart still POSTed to the live
// API with the inert demo publishable key, which answers 401
// INVALID_API_KEY_FORMAT. The optimistic UI would flip to 已加入購物車, the
// request would fail, and the badge was left permanently wrong — the first
// thing anyone clicks on a new storefront, broken by design.
//
// So demo mode gets a cart of its own. It lives in localStorage under the
// storefront's namespace, it answers in the SAME shape the API answers in
// (`{ok, status, data}` wrapping a cart with `items` and the four money
// fields), and cart.ts routes to it instead of authedFetch. The pages downstream
// cannot tell the difference, which is the point: /cart, the badge and the row
// controls are exercised for real rather than against a stub that only counts.
//
// What it deliberately does NOT model: shipping fees, promotions and tax. Those
// are the merchant's to compute and a plausible-looking local guess is worse
// than an obvious zero. `grand_total` is therefore `items_total`.
//
// Prices come off the add button's data attributes. That is safe here and only
// here: nothing in this file is ever sent anywhere, so a tampered DOM can only
// mislead the person tampering with it. In live mode the server owns every
// number and this module is never loaded.

import { storageKey } from "../../brand/identity";

type Json = any;

const LS_DEMO_CART = storageKey("demo_cart");

export interface DemoSeed {
  variant_id: string;
  product_id?: string;
  product_title: string;
  product_handle?: string;
  image_url?: string;
  unit_price: number;
}

interface DemoLine extends DemoSeed {
  line_id: string;
  quantity: number;
  line_subtotal: number;
}

/** API-shaped success envelope, so callers need no demo-specific branch. */
function ok(data: Json) {
  return { ok: true, status: 200, data, error: null };
}

function readLines(): DemoLine[] {
  try {
    const raw = localStorage.getItem(LS_DEMO_CART);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // A corrupt or hand-edited value must not wedge the cart forever.
    return [];
  }
}

function writeLines(lines: DemoLine[]): Json {
  try {
    localStorage.setItem(LS_DEMO_CART, JSON.stringify(lines));
  } catch {
    // Private-mode / quota. The in-memory result below is still correct for
    // this page view, which beats throwing out of a click handler.
  }
  return toCart(lines);
}

/** Project the stored lines into the cart shape the API returns. */
function toCart(lines: DemoLine[]): Json {
  const items_total = lines.reduce((sum, line) => sum + line.line_subtotal, 0);
  return {
    id: "demo-cart",
    items: lines,
    items_total,
    shipping_fee_total: 0,
    discount_total: 0,
    grand_total: items_total,
  };
}

export function demoGetCart(): Json {
  return toCart(readLines());
}

/**
 * Add, merging by variant — the same thing the API does, and the reason a
 * second click on one card increments a row instead of opening a second one.
 * Quantity is capped at the backend's 99 so the demo cannot reach a state the
 * live cart would refuse.
 */
export function demoAddItem(seed: DemoSeed, quantity: number) {
  const lines = readLines();
  const existing = lines.find((line) => line.variant_id === seed.variant_id);
  if (existing) {
    existing.quantity = Math.min(99, existing.quantity + quantity);
    existing.line_subtotal = existing.unit_price * existing.quantity;
  } else {
    const qty = Math.min(99, Math.max(1, quantity));
    lines.push({
      ...seed,
      line_id: `demo-line-${seed.variant_id}`,
      quantity: qty,
      line_subtotal: seed.unit_price * qty,
    });
  }
  return ok(writeLines(lines));
}

export function demoUpdateItem(lineId: string, quantity: number) {
  const lines = readLines();
  const line = lines.find((item) => item.line_id === lineId);
  if (!line) return ok(toCart(lines));
  line.quantity = Math.min(99, Math.max(1, quantity));
  line.line_subtotal = line.unit_price * line.quantity;
  return ok(writeLines(lines));
}

export function demoRemoveItem(lineId: string) {
  return ok(writeLines(readLines().filter((line) => line.line_id !== lineId)));
}

export function demoClearCart() {
  return writeLines([]);
}

/** True when this build is running against the demo catalogue. */
export function isDemoMode(config: { demo?: boolean }): boolean {
  return config.demo === true;
}
