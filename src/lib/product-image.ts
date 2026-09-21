// Product imagery, and what to render when the catalogue has none.
//
// `thumbnail` is the merchant's to fill, and an unfilled one used to reach the
// page as `null` — which Astro drops, leaving `<img>` with no `src` at all.
// Every card on the storefront rendered an empty box, and the build stayed
// green while it happened.
//
// So a missing thumbnail falls back to one of the neutral placeholders in
// brand/assets/products/. That is deliberately NOT silent: src/lib/commerce.ts
// warns once per build with the handles that fell back, because a placeholder
// is a stand-in for artwork somebody still owes, not a design decision. The
// alternative — failing the build the way a missing legal entity does — is
// wrong here: a shop with no photos yet is a shop mid-setup, while a shop with
// no registered company name is a legal problem.
//
// Nothing in this module imports anything. That keeps it testable under plain
// node:test, which cannot evaluate the `import.meta.env` in commerce.ts.

/** How many placeholder files brand/assets/products/ ships. */
export const PLACEHOLDER_COUNT = 8;

export interface ThumbnailBearing {
  handle: string;
  thumbnail?: string | null;
}

/** True when the catalogue actually supplied an image. */
export function hasThumbnail(product: ThumbnailBearing): boolean {
  return typeof product.thumbnail === "string" && product.thumbnail.trim() !== "";
}

/**
 * Which placeholder a product gets — derived from its handle, not its position
 * in the list. Position would reshuffle every card's image the moment a product
 * is added or unpublished; the handle keeps a given product on a given
 * placeholder for as long as it exists, so a rebuild is not a visual diff.
 */
export function placeholderThumbnail(handle: string): string {
  let hash = 0;
  for (let i = 0; i < handle.length; i += 1) {
    hash = (hash * 31 + handle.charCodeAt(i)) >>> 0;
  }
  const index = (hash % PLACEHOLDER_COUNT) + 1;
  return `/assets/products/placeholder-${String(index).padStart(2, "0")}.svg`;
}

/**
 * The product as the storefront will render it. Returns the SAME object when a
 * thumbnail is present, so the live path allocates nothing.
 */
export function withThumbnail<T extends ThumbnailBearing>(product: T): T {
  if (hasThumbnail(product)) return product;
  return { ...product, thumbnail: placeholderThumbnail(product.handle) };
}
