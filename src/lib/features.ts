// Feature flags, and the one rule that keeps navigation honest.
//
// Turning a feature off is a BUILD-TIME decision: astro.config.ts only injects
// the blog and referral routes when their flag is on, so a disabled feature
// produces no HTML at all — not a page that 404s on click, and not a page that
// ships and hopes nobody finds it.
//
// The other half of that is links. A route that was never built must not be
// linked to, and the link lists live in brand/copy.ts where a flag has no
// business appearing. So the filtering happens here instead, by route prefix:
// every surface that renders a link list runs it through `visibleLinks` first.

import { commerce } from "../../brand/commerce";

/**
 * The flags this build actually runs on — brand/commerce.ts, with two
 * resolutions applied that the raw object cannot express.
 *
 * 1. `commerce` DEFAULTS TO ON when absent. Every other flag reads a missing
 *    key as off, because absent there means "this shop never asked for it".
 *    Absent `commerce` means the shop predates the flag, and every shop that
 *    predates it sells — reading it as false would silently strip the cart,
 *    the checkout and the member area out of storefronts already in production.
 *
 * 2. `cartPage` is ANDed with `commerce`. A /cart page whose only exit is a
 *    /checkout that was never built is a dead end with a button on it, so the
 *    incoherent combination resolves rather than shipping. Nothing else is
 *    derived: a showcase still has a blog, still has an /about, and still has
 *    product detail pages.
 */
export const flags = {
  ...commerce.flags,
  commerce: commerce.flags.commerce ?? true,
  cartPage: (commerce.flags.commerce ?? true) && commerce.flags.cartPage,
};

/**
 * Route prefixes that only exist when their flag is on.
 *
 * `exact` matters for /products: the catalogue INDEX is a content page, but
 * /products/<handle> is not — a one-page shop still has product detail pages,
 * and prefix-matching would hide every link to them.
 */
const GATED_PREFIXES: Array<{ prefix: string; enabled: boolean; exact?: boolean }> = [
  { prefix: "/blog", enabled: flags.blog },
  { prefix: "/r", enabled: flags.affiliate },
  { prefix: "/products", enabled: flags.contentPages, exact: true },
  { prefix: "/about", enabled: flags.contentPages },
  { prefix: "/faq", enabled: flags.contentPages },
  { prefix: "/contact", enabled: flags.contentPages },
  { prefix: "/cart", enabled: flags.cartPage },
  /* The transactional surfaces. `/checkout` is deliberately NOT exact — it has
     to take `/checkout/complete` with it — and `/auth` covers the OAuth
     callback, which is a route the customer never types but LINE does. */
  { prefix: "/checkout", enabled: flags.commerce },
  { prefix: "/login", enabled: flags.commerce },
  { prefix: "/account", enabled: flags.commerce },
  { prefix: "/auth", enabled: flags.commerce },
];

/**
 * True when a link points at a route this build actually produced.
 *
 * In-page links are always visible: a one-page shop replaces /faq with an
 * anchor on its home page, and "/#faq" must survive the filter that removed
 * "/faq". The fragment is what makes them different, so it is checked first.
 */
export function isVisibleHref(href: string): boolean {
  if (href.startsWith("#") || href.includes("/#")) return true;
  for (const { prefix, enabled, exact } of GATED_PREFIXES) {
    if (enabled) continue;
    if (href === prefix) return false;
    if (!exact && href.startsWith(`${prefix}/`)) return false;
  }
  return true;
}

/**
 * Which flag removed a route, for the build-time notice below. First match
 * wins, the same order `isVisibleHref` walks.
 */
function gateFor(href: string): string | null {
  for (const { prefix, enabled, exact } of GATED_PREFIXES) {
    if (enabled) continue;
    if (href === prefix) return prefix;
    if (!exact && href.startsWith(`${prefix}/`)) return prefix;
  }
  return null;
}

/**
 * Rewrites already reported. Module-level, so a route rewritten on forty pages
 * is one line in the build log rather than forty.
 */
const announced = new Set<string>();

/**
 * A single href, or the fallback when this build did not produce its route.
 *
 * `visibleLinks` removes an entry from a LIST; a lone call-to-action has
 * nothing to be removed from, so it degrades to the home page instead of
 * pointing at a page that was never built. Used by the buttons that mean
 * "keep shopping", whose target is a shop-shape decision.
 *
 * ## Why it says so out loud
 *
 * The rewrite is right and it is also invisible, which is a bad combination.
 * A shop whose `notFound.secondaryCtaHref` points at `/products` while
 * `contentPages` is off ships a 404 page with two buttons side by side that go
 * to the same place — nothing throws, nothing is logged, and the page looks
 * deliberate. Several storefronts in this family are in exactly that state, and
 * every one of them passes all four audits.
 *
 * A silent correct-in-isolation rewrite is harder to find than an error, so this
 * prints one line per distinct rewrite naming the flag responsible. It does NOT
 * change what is rendered: which button a shop wants on its 404 is a shop
 * decision, and a build script is not the place to make it. The notice is the
 * whole fix — it turns "why do both buttons go home" into something a build log
 * already answered.
 */
export function safeHref(href: string, fallback = "/"): string {
  if (isVisibleHref(href)) return href;
  if (!announced.has(href)) {
    announced.add(href);
    const gate = gateFor(href);
    console.warn(
      `safeHref: "${href}" is not a route this build produced` +
        (gate ? ` — ${gate} is off in brand/commerce.ts` : "") +
        `, so it renders as "${fallback}". Anything else already pointing at "${fallback}" ` +
        `beside it now goes to the same place; if that is not what the page wants, ` +
        `point brand/copy.ts at a route this shop builds.`,
    );
  }
  return fallback;
}
/** Drop the entries of a link list whose routes this build did not produce. */
export function visibleLinks<T extends { href: string }>(links: T[]): T[] {
  return links.filter((link) => isVisibleHref(link.href));
}

/**
 * The social entries one surface renders.
 *
 * `identity.social` used to be mapped DIRECTLY by both `SocialRail.astro` and
 * `Footer.astro`, with no per-surface control: an entry was in both places or
 * in neither, and both files are template-owned, so no shop could separate
 * them. That is the coupling this exists to break — and it lives here, beside
 * `visibleLinks`, because it is the same question one layer over: which of the
 * things `brand/` declared does THIS surface actually show.
 *
 * An entry that says nothing appears on every surface, so a shop that has never
 * heard of the field renders exactly what it rendered before.
 */
export function socialFor<T extends { surfaces?: readonly string[] }>(
  surface: string,
  links: readonly T[],
): T[] {
  return links.filter((link) => link.surfaces === undefined || link.surfaces.includes(surface));
}
