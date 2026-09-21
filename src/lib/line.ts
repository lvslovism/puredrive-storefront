// Where an "ask us" button goes, and what it does when the shop has no LINE
// account yet.
//
// A showcase storefront (`flags.commerce: false`) replaces every purchase
// control with an enquiry, and every one of those enquiries lands here. Two
// destinations exist and the choice between them is not a preference:
//
//   The channel is set   → LINE itself. A bare enquiry opens the official
//                          account; a product enquiry opens a chat with the
//                          product's name ALREADY TYPED, because "我想詢問" with
//                          nothing after it makes the customer describe the
//                          thing they were just looking at.
//
//   The channel is empty → the LINE block further down the page, if this shop
//                          renders one. NOT a link to line.me with an empty
//                          handle, which resolves to LINE's own error page and
//                          looks exactly like a broken shop.
//
//   Neither              → `null`, and the caller renders nothing. A button
//                          that goes nowhere is worse than a missing button:
//                          the missing one is visibly absent, the dead one is
//                          only discovered by a customer who wanted to buy.

import { identity } from "../../brand/identity";
import { home } from "../../brand/copy";

/**
 * The official-account handle, normalised to carry its leading `@`.
 *
 * Empty means "this shop has no LINE account yet" — the same convention
 * `identity.assets.lineQr` uses for the QR code it has not been given. A handle
 * is deliberately NOT validated beyond being non-empty: LINE has changed what
 * it accepts before, and a regex here would start rejecting real accounts
 * without anyone noticing why.
 */
const handle = identity.line.id.trim();
const CHANNEL = handle ? (handle.startsWith("@") ? handle : `@${handle}`) : "";

/**
 * The in-page anchor the LINE contact strip renders on, or null when this
 * shop's home page has no such strip.
 *
 * Only the `landing` preset carries it (`<section class="line-strip"
 * id="contact">` in HomeLanding.astro); the multipage preset ends on its steps
 * band and has nowhere to scroll to. Rooted at `/` rather than a bare `#contact`
 * so the button works from a product page too — and `isVisibleHref` passes any
 * href containing `/#` untouched, so the route filter never strips it.
 */
const ANCHOR = home.preset === "landing" ? "/#contact" : null;

/** True when a LINE destination of some kind exists. */
export const hasLineDestination = Boolean(CHANNEL || ANCHOR);

/**
 * Where an enquiry button should point, or `null` when it should not render.
 *
 * `message`, when given and when a channel exists, is pre-filled into the chat
 * — `oaMessage` is LINE's own deep link for exactly that, and it degrades to
 * the plain add-friend link when there is nothing to say. The handle is
 * percent-encoded because `@` is not a legal character in a URL path segment,
 * however tolerant line.me happens to be about it today.
 */
export function lineEnquiryHref(message?: string): string | null {
  if (!CHANNEL) return ANCHOR;
  const id = encodeURIComponent(CHANNEL);
  if (!message) return `https://line.me/R/ti/p/${id}`;
  return `https://line.me/R/oaMessage/${id}/?${encodeURIComponent(message)}`;
}

/**
 * Fill a `{product}` slot in an enquiry template.
 *
 * The template is the shop's own voice and lives in brand/copy.ts; the product
 * name comes from the commerce API. Neither belongs in the component that
 * renders the button, which is why the joining happens here.
 */
export function enquiryMessage(template: string, product: string): string {
  return template.replace("{product}", product);
}
