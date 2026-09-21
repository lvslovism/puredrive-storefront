// Machine-readable list-page schema (ItemList JSON-LD) for /products/ and /blog/.
//
// Names / URLs / positions are ALL derived from the same arrays the cards render
// from (single source of truth) — never hardcoded — so the schema can never
// drift from the visible list. Absolute URLs are string-concatenated off
// SITE_ORIGIN (never new URL(..., Astro.site) — that trips the build OOM).

import { blog, products } from "../../brand/copy";
import { SITE_ORIGIN, type ApiListArticle, type CardProduct } from "./commerce";

// --- Blog pagination slice (shared with BlogOverview so render == schema) -----
//
// The blog list is NOT Astro paginate(): articles[0] is a repeated "Editor's
// Pick" featured card shown on every page, and the paginated grid starts at
// index 1. This helper is the single source for both the rendered grid and the
// ItemList, guaranteeing they stay identical.
export function blogPageSlice(
  articles: ApiListArticle[],
  currentPage: number,
  pageSize: number,
) {
  const featured = articles[0];
  const listStart = featured ? 1 + (currentPage - 1) * pageSize : (currentPage - 1) * pageSize;
  const visibleArticles = articles.slice(listStart, listStart + pageSize);
  return { featured, listStart, visibleArticles };
}

// Canonical path for a blog list page (mirrors BlogOverview's pageHref).
function blogPagePath(currentPage: number): string {
  return currentPage === 1 ? "/blog/" : `/blog/page/${currentPage}/`;
}

// --- ItemList builders --------------------------------------------------------

// /products/ — one ItemList over the whole (single-page) product grid.
export function buildProductsItemList(products: CardProduct[]) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": `${SITE_ORIGIN}/products/#itemlist`,
    url: `${SITE_ORIGIN}/products/`,
    name: products.itemListName,
    numberOfItems: products.length,
    itemListElement: products.map((product, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: product.name,
      url: `${SITE_ORIGIN}/products/${product.slug}`,
    })),
  };
}

// /blog/ (and every /blog/page/N/) — per-page ItemList over that page's grid.
// position is the cross-page absolute sequence (p1: 1..9, p2: 10..18, ...);
// numberOfItems is that page's visible count (last page may be short).
export function buildBlogItemList(
  articles: ApiListArticle[],
  currentPage: number,
  pageSize: number,
) {
  const { listStart, visibleArticles } = blogPageSlice(articles, currentPage, pageSize);
  const canonical = `${SITE_ORIGIN}${blogPagePath(currentPage)}`;
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": `${canonical}#itemlist`,
    url: canonical,
    name: blog.itemListName,
    numberOfItems: visibleArticles.length,
    itemListElement: visibleArticles.map((article, index) => ({
      "@type": "ListItem",
      position: listStart + index,
      name: article.title,
      url: `${SITE_ORIGIN}/blog/${article.slug}`,
    })),
  };
}
