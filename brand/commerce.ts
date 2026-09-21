/**
 * commerce.ts — which shop this storefront is bound to, and what it switches on.
 *
 * The catalogue itself is never in `brand/`: products, articles, prices,
 * payment and shipping methods all come from the commerce API at build time.
 * What lives here is the *binding* — which merchant, which API, which canonical
 * origin — plus the feature flags that decide which routes get built at all.
 *
 * ## Demo mode
 *
 * A freshly cloned template has no merchant to talk to, so `demo.enabled`
 * starts `true` and `src/lib/commerce.ts` serves the fixtures below instead of
 * fetching. That keeps `npm run build` green offline and makes the first render
 * of a new shop a real page rather than a stack trace. Point `siteDomain` at a
 * registered domain and set `demo.enabled: false` to go live.
 */

export type Flags = {
  /** `/blog`, `/blog/[slug]` and `/blog/page/[page]`, plus their nav entries. */
  blog: boolean;
  /** The `/r/<code>` referral landing page and the member-area invite card. */
  affiliate: boolean;
  /**
   * The standalone content pages a MULTI-page shop needs: `/products` (the
   * catalogue index), `/about`, `/faq` and `/contact`.
   *
   * A one-page shop carries all of them on the home page instead — the
   * catalogue, the FAQ and the contact strip are blocks there — so shipping the
   * pages too would give each of those surfaces a second, drifting copy. Pair
   * `contentPages: false` with the `landing` home preset in brand/copy.ts.
   */
  contentPages: boolean;
  /**
   * The standalone `/cart` page.
   *
   * On means the classic flow: the header icon links to a full cart page. Off
   * means the cart is a DRAWER — BaseLayout renders it, the header icon opens
   * it, and adding to cart slides it in. Both are complete; they are not a
   * migration path from one to the other.
   *
   * Independent of `contentPages` on purpose: a multi-page shop may still
   * prefer the drawer, and nothing about the catalogue index decides how the
   * cart is presented.
   */
  cartPage: boolean;
  /**
   * Whether this storefront TRANSACTS.
   *
   * On is the shop every other flag assumes: a cart, a checkout, a member area
   * and the LINE login that guards them. Off is a SHOWCASE — the catalogue, the
   * prices and the product pages are all still there, but there is nothing to
   * put in a basket. `/checkout`, `/checkout/complete`, `/login`, `/account`
   * and `/auth/callback` are never built, the header carries one "ask us on
   * LINE" button instead of the cart / member / buy cluster, and the product
   * page's two CTAs collapse into a single enquiry that opens a LINE chat with
   * the product's name already typed.
   *
   * Prices stay visible. A showcase that hides them makes the customer ask what
   * things cost, which is a different — and worse — decision than not selling
   * online.
   *
   * ABSENT MEANS ON. Every flag above reads a missing key as OFF, because a
   * missing key there means "built before the feature existed and never asked
   * for it". This one is the opposite: every storefront built before it existed
   * WAS a transacting shop, and reading the absence as `false` would silently
   * strip the cart out of all of them. src/lib/features.ts does the defaulting.
   */
  commerce: boolean;
};

export const commerce = {
  /**
   * The merchant this storefront sells for. The build resolves the merchant by
   * DOMAIN (the API owns the mapping), then asserts the code it got back equals
   * this one — so a storefront pointed at the wrong domain fails the build
   * instead of quietly serving somebody else's catalogue.
   */
  merchantCode: 'puredrive',

  /** Commerce API origin. No trailing slash. */
  apiBase: 'https://commerce-workers.ryan-319.workers.dev',

  /**
   * The host the API knows this storefront by — usually the deploy host
   * (`<project>.pages.dev`), not the vanity domain. Used only to resolve the
   * merchant bundle.
   */
  siteDomain: 'puredrive.astrapath-marketing.com',

  /**
   * Canonical public origin: canonical URLs, og:url, JSON-LD @id. No trailing
   * slash. Distinct from `siteDomain` — the vanity domain is what the world
   * links to.
   */
  siteOrigin: 'https://puredrive.astrapath-marketing.com',

  /**
   * Which of the two Cloudflare hosts this shop deploys to: `pages` or
   * `workers`. Absent means pages.
   *
   * Not a preference, and not a property of the build machine — the two hosts
   * need DIFFERENT deployment files, so this decides what `npm run build`
   * writes. Pages serves its custom 404 page from two rules in `_redirects`;
   * Workers refuses the entire deploy over those same two rules (code 100324,
   * no Worker created) and serves its custom page from `wrangler.jsonc` —
   * which is written only when this says workers.
   *
   * So moving host is this one line plus a rebuild, and getting it wrong is
   * loud on both sides: a pages build handed to `wrangler deploy` is rejected,
   * and a workers build has no wrangler.jsonc for it to read.
   *
   * See README → Deploying and docs/PITFALLS.md #3.
   */
  deployTarget: 'workers',

  /**
   * 這家店的自訂網域（bare host，無 scheme、無尾斜線）。**選用；不設就不輸出。**
   *
   * 設了之後，build 會在 wrangler.jsonc 寫出
   * `routes: [{ pattern, custom_domain: true }]`，`wrangler deploy` 會連 zone
   * 裡的 DNS 記錄一起建（2026-09-15 以 b1-probe-w 實測確認，憑證沿用 zone 既有
   * 的 Universal SSL，不需等待簽發）。**僅對 deployTarget: 'workers' 有效** ——
   * Pages 的自訂網域不讀這支檔，且不會自動建 DNS，要另外處理。
   *
   * ⚠️ 與 siteDomain / siteOrigin 刻意分開，不要合併：
   *   siteDomain   API 認得這個部署的 host（merchant-by-domain 的查詢鍵）
   *   siteOrigin   對外的正規網址（canonical / og:url / JSON-LD）
   *   customDomain 這個 worker 要接管哪個 hostname
   * 遷移時三者會短暫不一致 —— 先綁網域、確認活著，再翻 siteDomain 與
   * siteOrigin。合併成一個欄位就強迫三件事同一刻發生，沒有中間可退的狀態。
   *
   * ⚠️ 解除綁定不能只刪這一行。移除後 redeploy **不會**解除既有的 custom
   *    domain，`wrangler triggers deploy` 也不會（兩者皆已實測）。唯一途徑是
   *    API `DELETE /accounts/{id}/workers/domains/{domain_id}`。
   */
  customDomain: 'puredrive.astrapath-marketing.com',

  flags: {
    blog: false,
    affiliate: false,
    contentPages: false,
    cartPage: false,
    commerce: false
  } as Flags,

  demo: {
    /** Set false once `siteDomain` resolves against a real merchant. */
    enabled: false,

    /**
     * Stand-in for the `merchant-by-domain` bundle. Shape matches the API
     * response exactly — the pages read it through the same accessors, so a
     * field missing here is a field that would be missing live.
     */
    merchant: {
      merchant_code: 'example-store',
      store_name: 'Example Store',
      /** Publishable key. The demo value is inert; nothing accepts it. */
      storefront_public_key: 'pk_demo_0000000000',
      default_currency: 'TWD',
      default_locale: 'zh-TW',
      storefront_config: {
        seo_defaults: {
          default_description: 'Example Store 線上商店',
          og_image: '/assets/og.svg'
        },
        /**
         * The company block the footer, contact page and legal pages all read.
         * Live, this comes from the merchant record — editing it there changes
         * every surface on the next build, with no second copy to drift.
         */
        contact: {
          legal_entity: '範例股份有限公司',
          tax_id: '00000000',
          phone: '02-0000-0000',
          address: '台北市中正區範例路 1 號',
          service_hours: '週一至週五 10:00 - 18:00'
        },
        footer: {
          payment_logos: [] as { alt: string; src: string }[]
        }
      },
      payment_config: {
        allowed_methods: ['cod', 'credit', 'atm', 'cvs']
      },
      shipping_config: {
        free_shipping_threshold: 1500,
        methods: {
          home_delivery: { label: '宅配到府', enabled: true, fee: 80 },
          cvs_pickup: { label: '超商取貨', enabled: true, fee: 60 }
        }
      }
    },

    /**
     * Three products, enough to exercise the grid, the featured band and the
     * detail page (including a multi-variant one). Images resolve to the
     * neutral placeholders in `brand/assets/`.
     */
    products: [
      {
        id: 'demo-product-1',
        handle: 'demo-product-one',
        title: '範例商品一',
        subtitle: '一句話的商品副標',
        thumbnail: '/assets/products/placeholder-01.svg',
        tags: ['範例'],
        is_featured: true,
        min_price: 680,
        max_price: 680,
        currency: 'TWD',
        published_at: '2026-01-01',
        variants: [{ id: 'demo-variant-1', title: 'Default', price: 680 }],
        media: [{ url: '/assets/products/placeholder-01.svg' }],
        description:
          '## 商品說明\n\n這段 Markdown 來自 brand/commerce.ts 的 demo 資料。上線後由商品後台提供。',
        seo: { title: '範例商品一', description: '一句話的商品副標' }
      },
      {
        id: 'demo-product-2',
        handle: 'demo-product-two',
        title: '範例商品二',
        subtitle: '兩種規格的示範商品',
        thumbnail: '/assets/products/placeholder-02.svg',
        tags: ['範例'],
        is_featured: true,
        min_price: 880,
        max_price: 1280,
        currency: 'TWD',
        published_at: '2026-01-01',
        variants: [
          { id: 'demo-variant-2a', title: '單入', price: 880 },
          { id: 'demo-variant-2b', title: '三入組', price: 1280 }
        ],
        media: [
          { url: '/assets/products/placeholder-02.svg' },
          { url: '/assets/products/placeholder-03.svg' }
        ],
        description: '',
        seo: { title: '範例商品二', description: '兩種規格的示範商品' }
      },
      {
        id: 'demo-product-3',
        handle: 'demo-product-three',
        title: '範例商品三',
        subtitle: '',
        thumbnail: '/assets/products/placeholder-03.svg',
        tags: [],
        is_featured: false,
        min_price: 420,
        max_price: 420,
        currency: 'TWD',
        published_at: '2026-01-01',
        variants: [{ id: 'demo-variant-3', title: 'Default', price: 420 }],
        media: [{ url: '/assets/products/placeholder-03.svg' }],
        description: '',
        seo: {}
      }
    ] as any[],

    /** Two articles: one becomes the featured card, one fills the grid. */
    articles: [
      {
        id: 'demo-article-1',
        slug: 'demo-article-one',
        title: '範例文章一',
        excerpt: '這是文章摘要，說明這篇在講什麼。',
        featured_image_url: '/assets/blog/placeholder.svg',
        published_at: '2026-01-02',
        author_name: '',
        reading_time_minutes: 4,
        tags: ['範例'],
        view_count: 0,
        content_md: '## 小標\n\n這段內容來自 brand/commerce.ts 的 demo 資料。上線後由文章後台提供。'
      },
      {
        id: 'demo-article-2',
        slug: 'demo-article-two',
        title: '範例文章二',
        excerpt: '第二篇範例文章的摘要。',
        featured_image_url: '/assets/blog/placeholder.svg',
        published_at: '2026-01-01',
        author_name: '',
        reading_time_minutes: 3,
        tags: ['範例'],
        view_count: 0,
        content_md: '## 小標\n\n第二篇範例內容。'
      }
    ] as any[]
  }
};
