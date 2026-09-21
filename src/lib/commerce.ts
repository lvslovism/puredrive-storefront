// Build-time commerce client for the Astrapath commerce-workers storefront API.
//
// Read-only catalogue, resolved at build (SSG). Merchant identity is resolved
// dynamically from the site domain via /v1/storefront/merchant-by-domain — this
// module never hardcodes a merchant, a key or an origin; all four bindings come
// from brand/commerce.ts. The pk_live returned by that endpoint is the only key
// used for product calls; prices come straight from the API and are never
// computed on the front end.
//
// Demo mode (brand/commerce.ts → demo.enabled) short-circuits every fetch and
// serves the fixtures declared there instead, so a freshly cloned template
// builds offline against no merchant at all.

import { commerce as brandCommerce } from "../../brand/commerce";
import { hasThumbnail, withThumbnail } from "./product-image";

const API_BASE: string = import.meta.env.PUBLIC_API_BASE ?? brandCommerce.apiBase;
const SITE_DOMAIN: string = import.meta.env.PUBLIC_SITE_DOMAIN ?? brandCommerce.siteDomain;
// Canonical public origin — the domain used for canonical URLs, OG tags and
// JSON-LD. Distinct from SITE_DOMAIN, which is only the host the storefront API
// knows this deployment by.
const SITE_ORIGIN: string = brandCommerce.siteOrigin;
const DEMO = brandCommerce.demo;

// --- Missing artwork ----------------------------------------------------------
//
// A product with no thumbnail reached the page as `null`, which Astro drops —
// so the card rendered an <img> with no src and the build stayed green. Every
// product now passes through withThumbnail(); the ones that had nothing are
// collected here and reported ONCE per build.
//
// Warn, don't throw. A catalogue still waiting on photography is a shop
// mid-setup; the merchant's legal entity missing is a different class of
// problem and still fails the build.
const missingThumbnails = new Set<string>();
let thumbnailReportPrinted = false;

function resolveThumbnails<T extends { handle: string; thumbnail?: string | null }>(
  products: T[],
): T[] {
  const resolved = products.map((product) => {
    if (!hasThumbnail(product)) missingThumbnails.add(product.handle);
    return withThumbnail(product);
  });
  reportMissingThumbnails();
  return resolved;
}

// Printed after the product LIST resolves, which is the one place the whole
// catalogue is in hand — so the warning names every offender at once instead of
// dripping one line per page.
function reportMissingThumbnails() {
  if (thumbnailReportPrinted || missingThumbnails.size === 0) return;
  thumbnailReportPrinted = true;
  const handles = [...missingThumbnails].sort();
  console.warn(
    [
      `[thumbnails] ${handles.length} product(s) have no image; a placeholder is standing in:`,
      ...handles.map((handle) => `  - ${handle}`),
      "  Upload artwork in the merchant admin — brand/assets/products/placeholder-*.svg is a stand-in, not a design.",
    ].join("\n"),
  );
}

export interface ApiListProduct {
  id: string;
  handle: string;
  title: string;
  subtitle?: string;
  thumbnail: string;
  tags?: string[];
  is_featured?: boolean;
  min_price: number;
  max_price: number;
  currency: string;
  published_at?: string;
}

export interface CardProduct {
  slug: string;
  name: string;
  price: number;
  image: string;
  summary: string;
}

// --- Merchant bootstrap (single fetch per build, memoized) -------------------

let merchantPromise: Promise<any> | undefined;

async function fetchMerchant() {
  const url = `${API_BASE}/v1/storefront/merchant-by-domain?domain=${encodeURIComponent(SITE_DOMAIN)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`merchant-by-domain ${res.status} for domain ${SITE_DOMAIN}`);
  const json = await res.json();
  if (!json.ok) throw new Error(`merchant-by-domain error: ${JSON.stringify(json.error)}`);
  const data = json.data;
  // The domain owns the mapping, so a storefront pointed at the wrong host would
  // otherwise build somebody else's catalogue and look entirely healthy doing
  // it. brand/commerce.ts names the merchant it expects; disagreeing is fatal.
  if (data?.merchant_code !== brandCommerce.merchantCode) {
    throw new Error(
      `merchant mismatch: ${SITE_DOMAIN} resolves to "${data?.merchant_code}", ` +
        `but brand/commerce.ts declares "${brandCommerce.merchantCode}"`,
    );
  }
  return data;
}

export function getMerchant() {
  if (DEMO.enabled) return Promise.resolve(DEMO.merchant);
  if (!merchantPromise) merchantPromise = fetchMerchant();
  return merchantPromise;
}

// --- Authenticated storefront GET (x-api-key = pk_live from bootstrap) --------

async function apiGet(path: string) {
  const merchant = await getMerchant();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "x-api-key": merchant.storefront_public_key },
  });
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
  const json = await res.json();
  if (!json.ok) throw new Error(`GET ${path} error: ${JSON.stringify(json.error)}`);
  return json.data;
}

// --- Products (memoized per query during a build) ----------------------------

const productsCache = new Map<string, Promise<ApiListProduct[]>>();

export function getProducts(query = ""): Promise<ApiListProduct[]> {
  // `?sort=featured` is the only query worth honouring here; anything else gets
  // the whole list, same as the API's default.
  //
  // It SORTS. It does not filter, and this branch used to think it did —
  // `all.filter((p) => p.is_featured)`, which is a different catalogue, not a
  // different order. Measured against the live endpoint on a shop with eight
  // products, all of them featured: the plain list returns eight and
  // `?sort=featured` returns the same eight in a different order. A demo mode
  // that answers a query differently from the API it stands in for is worse
  // than one that ignores the query, because the difference only shows up on a
  // shop that has switched demo off — which is to say, in production.
  if (DEMO.enabled) {
    const all = resolveThumbnails(DEMO.products as ApiListProduct[]);
    if (!query.includes("featured")) return Promise.resolve(all);
    return Promise.resolve(
      [...all].sort((a, b) => Number(b.is_featured) - Number(a.is_featured)),
    );
  }
  if (!productsCache.has(query)) {
    productsCache.set(
      query,
      apiGet(`/v1/storefront/products${query}`).then(resolveThumbnails),
    );
  }
  return productsCache.get(query)!;
}

const productCache = new Map<string, Promise<any>>();

export function getProduct(handle: string): Promise<any> {
  if (DEMO.enabled) {
    const found = DEMO.products.find((p: any) => p.handle === handle);
    if (!found) return Promise.reject(new Error(`demo product not found: ${handle}`));
    return Promise.resolve(withThumbnail(found));
  }
  if (!productCache.has(handle)) {
    // The detail payload carries its own thumbnail, and the PDP gallery falls
    // back to it when media[] is empty — so it needs resolving too, not just
    // the list.
    productCache.set(
      handle,
      apiGet(`/v1/storefront/products/${handle}`).then(withThumbnail),
    );
  }
  return productCache.get(handle)!;
}

// --- Articles (blog, SSG at build time) ---------------------------------------

export interface ApiListArticle {
  id: string;
  slug: string;
  title: string;
  excerpt?: string | null;
  featured_image_url?: string | null;
  published_at?: string | null;
  author_name?: string | null;
  reading_time_minutes?: number | null;
  tags?: string[];
  view_count?: number;
}

export interface ApiArticleDetail extends ApiListArticle {
  content_md: string;
  updated_at?: string | null;
  seo_meta?: Record<string, unknown>;
}

const ARTICLES_PER_PAGE = 100;

let allArticlesPromise: Promise<ApiListArticle[]> | undefined;

async function fetchAllArticles(): Promise<ApiListArticle[]> {
  const all: ApiListArticle[] = [];
  for (let page = 1; ; page++) {
    const batch: ApiListArticle[] = await apiGet(
      `/v1/storefront/articles?page=${page}&per_page=${ARTICLES_PER_PAGE}`,
    );
    all.push(...batch);
    if (batch.length < ARTICLES_PER_PAGE) break;
  }
  return all;
}

export function getAllArticles(): Promise<ApiListArticle[]> {
  if (DEMO.enabled) return Promise.resolve(DEMO.articles as ApiListArticle[]);
  if (!allArticlesPromise) allArticlesPromise = fetchAllArticles();
  return allArticlesPromise;
}

export function getArticle(slug: string): Promise<ApiArticleDetail> {
  if (DEMO.enabled) {
    const found = DEMO.articles.find((a: any) => a.slug === slug);
    if (!found) return Promise.reject(new Error(`demo article not found: ${slug}`));
    return Promise.resolve(found as ApiArticleDetail);
  }
  return apiGet(`/v1/storefront/articles/${encodeURIComponent(slug)}`);
}

// Map an API list product onto the shape the card/grid components use. Price is
// the API min_price as-is.
export function toCard(p: ApiListProduct): CardProduct {
  return {
    slug: p.handle,
    name: p.title,
    price: p.min_price,
    image: p.thumbnail,
    summary: p.subtitle ?? "",
  };
}

// The browser needs the same answer this module gives the build: is there a
// merchant behind this storefront or not? BaseLayout forwards it through the
// window config global so src/scripts/ can short-circuit its own fetches
// without importing brand/commerce.ts — which would drag the whole demo
// catalogue into the client bundle.
const DEMO_MODE: boolean = DEMO.enabled;

export { API_BASE, SITE_DOMAIN, SITE_ORIGIN, DEMO_MODE };
