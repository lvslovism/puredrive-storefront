/**
 * unlock.ts — the presentation files THIS shop has taken over.
 *
 * The template locks two kinds of file under one word. `core` is the money and
 * membership half — the cart, the checkout, the member area, the modules they
 * call — and it is byte-for-byte in every storefront, permanently, because an
 * edit there does not travel and what breaks is an order rather than a layout.
 * `presentation` is everything a comp can be drawn of: pages, routes,
 * components, stylesheets.
 *
 * Presentation is still locked by default. A shop that says nothing here is
 * exactly where it was before this file existed, which is the point: the
 * template's own fixes keep arriving for every page nobody has redrawn.
 *
 * Naming a file below says: this shop has its own version of this page, drawn
 * from its own comp, and `audit:template` should stop asking whether it matches
 * the template. It does not stop reporting: `npm run audit:template` prints the
 * count every run, so a shop can see what it has taken on. What it has taken on
 * is real — the template's later fixes to that page stop arriving, and
 * `npm run template:report` in the template is what shows you which ones.
 *
 * Two rules, both enforced:
 *
 *   1. Only presentation files. A core path here fails the audit by name; it is
 *      not a permission this file can grant.
 *   2. Only files the lock actually has. A typo or a moved page fails here,
 *      loudly, instead of silently doing nothing until the next edit fails as
 *      drift for a reason that mentions none of this.
 *
 * Paths are repo-relative with forward slashes, exactly as they appear in
 * `template.lock.json` — e.g. 'src/routes/faq.astro'.
 *
 * ## Before you add a line
 *
 * A shop that unlocks a page owns its DOM as well as its design, and four of
 * these pages have scripts bound to theirs. `scripts/dom-contract.mjs` lists
 * every selector `cart.ts`, `checkout.ts` and `account.ts` reach for, and
 * `tests/dom-contract.test.mjs` fails the build when a redrawn page has dropped
 * one. Redraw freely; keep the hooks.
 */
export const unlocked: readonly string[] = [];
