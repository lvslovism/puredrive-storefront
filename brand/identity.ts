/**
 * identity.ts — who this shop is, and what it looks like.
 *
 * `src/` reads every brand fact through this module. It carries no shop name,
 * no contact detail, no colour literal and no font family of its own — opening
 * a new storefront means editing `brand/` and nothing else. That property is
 * enforced, not assumed: `npm run audit:brand` fails the build on a brand
 * string in `src/`, and `npm run audit:color` fails it on a colour literal.
 *
 * The values shipped below are a neutral example. Replace them; do not treat
 * them as defaults worth keeping.
 */

export type ContactDetails = {
  /** Customer-service e-mail. The one contact field merchant config has no slot for. */
  email: string;
};

/**
 * The LINE official account. `id` is the handle shown in marketing copy;
 * `addFriendUrl` stays `'#'` until the real account exists, which keeps the CTA
 * inert rather than broken.
 */
export type LineChannel = {
  id: string;
  addFriendUrl: string;
};

/**
 * Social profile links, rendered in the footer in array order. An empty array
 * removes the whole row rather than leaving a gap.
 */
/** Where a social entry is allowed to appear. See `SocialLink.surfaces`. */
export type SocialSurface = 'rail' | 'footer';

export type SocialLink = {
  label: string;
  href: string;
  /** Public URL of the glyph, mirrored out of `brand/assets/`. */
  icon: string;
  /**
   * Which surfaces render this entry. Absent means BOTH, which is what every
   * entry meant before this field existed.
   *
   * The two surfaces genuinely want different lists. The rail is a persistent
   * one-tap contact affordance where a single entry is fine; the footer row is
   * a channel list, where a single entry reads as an oversight rather than as a
   * choice. Two shops here had all four accounts null, and adding the one real
   * LINE account to bring the rail back also put a lone circle under a footer
   * column drawn for four — with nothing in `brand/` able to say otherwise,
   * because both components mapped this array directly and both are locked.
   */
  surfaces?: SocialSurface[];
  /**
   * `false` keeps this entry OUT of the Organization JSON-LD `sameAs`, while
   * still rendering it everywhere it is meant to appear. Absent means "include
   * it if it is an absolute http(s) URL", which is the rule that shipped.
   *
   * `sameAs` asserts "another profile page of THIS organisation". A LINE
   * add-friend deep link is not one, and several shops in a family sharing one
   * official account would be telling a crawler that several organisations are
   * one entity. Until this field existed the only lever was the SHAPE of the
   * href — a protocol-relative `//line.me/…` navigates identically and misses
   * the `^https?://` filter — so a correct result rested entirely on that regex
   * never widening. Nothing would have caught it if it had: no audit, no test,
   * no build failure. Say it here instead, where saying it is the mechanism.
   */
  sameAs?: boolean;
};

/** Where the PDP thumbnails sit. See `Identity.productGallery`. */
export type ProductGalleryLayout = 'below' | 'side';

export type TokenGroup = Record<string, string>;

/**
 * Design tokens. This is the ONLY place a colour or a font family is declared.
 * `tokensCss()` compiles them into the `:root` block BaseLayout inlines, so a
 * stylesheet anywhere in `src/` can only reach a colour through `var(--...)`.
 *
 * Key -> CSS custom property:
 *   color.*  -> --color-<key>   (`header-bg` -> `--color-header-bg`)
 *   text.*   -> --text-<key>    (text COLOURS, not sizes; sizes live in tokens.css)
 *   font.*   -> --font-<key>
 *   ui.*     -> --<key>         (bare: the greys the cart / member panels share)
 */
export type Tokens = {
  color: TokenGroup;
  text: TokenGroup;
  font: TokenGroup;
  ui: TokenGroup;
};

/**
 * Which GROUND a block stands on — which is to say, which ink set resolves on
 * top of its background.
 *
 * This is the half of a ground that a colour value cannot carry. `#14251e` is
 * a dark green whether or not anything says so; what the stylesheet needs to
 * know is which ink set to resolve on top of it, and no amount of looking at
 * the background token answers that in CSS.
 *
 * `'light'` and `'dark'` are the two the template declares in
 * `src/lib/grounds.mjs`. A shop may declare more under `grounds` below and name
 * one here; the union stays open for exactly that, and closed enough that a
 * typo still autocompletes to the two that always exist.
 */
export type GroundName = 'light' | 'dark' | (string & {});

/**
 * Retained name, widened meaning.
 *
 * It said "polarity" when the answer could only be one of two. It is now a
 * block-to-GROUND map, and the two default ground names happen to be the two
 * old polarity values — so every storefront's existing declaration means
 * exactly what it meant before. Renaming the key would have been a seven-shop
 * edit that changed no behaviour, which is a worse trade than a name carrying
 * one revision of history in a comment.
 *
 * The names match the ground tokens in `tokens.color` — `catalogue` pairs with
 * `--color-catalogue-bg` — and `audit:color` walks the pairing: each background
 * is checked against the inks of the ground it was placed on, and ONLY those.
 * That is what makes a dark header expressible. It used to be checked against
 * the six pale-ground body inks, which is why it could never be dark.
 *
 * Setting a dark background here without saying `dark` is caught, not ignored:
 * the pale inks fail against it and the build stops.
 */
export type GroundPolarities = {
  header: GroundName;
  trust: GroundName;
  catalogue: GroundName;
  catalogueCard: GroundName;
  scenes: GroundName;
  sceneCard: GroundName;
};

/**
 * A per-shop ground: a background, and the tokens that stand on it.
 *
 * Every field names TOKENS, never values — `'color.footer-text'`, not
 * `'#c4c4c4'`. That is deliberate and it is the only reason this is allowed to
 * exist at all: a literal here would be a colour declared outside
 * `tokens.color`, which `audit:color` bans, and it would be a value no
 * contrast pass measures. A reference is the opposite of an escape hatch — it
 * points at a token the audit ALREADY reads, and adds a ground that token now
 * gets measured against. Declaring a ground widens the table.
 *
 * A field REPLACES the default rather than merging into it. A ground that
 * declared `ink` and silently got two more appended is a ground whose audit
 * nobody can predict by reading it.
 *
 *   on        background tokens this ink set is painted on
 *   ink       every token that SETS TYPE here — each must clear 4.5:1 on each
 *   rule      the hairline drawn here — 1.1:1, a vanishing check
 *   quiet     this ground's hairline may be quieter than that floor
 *   fill      non-text fills painted here, mapped to the label each carries;
 *             the fill clears 3:1 on the ground, the label 4.5:1 on the fill
 *   price     the price role, when a shop sets prices apart from its body ink
 *   selector  the CSS selector that binds `--ground-*` here, or null for a
 *             ground that is measured but not painted through roles
 *   css       role -> token for that binding
 *
 * See `src/lib/grounds.mjs` for the defaults and for what each floor is asking.
 */
export type GroundOverride = {
  on?: string[];
  ink?: string[];
  rule?: string | null;
  quiet?: boolean;
  fill?: Record<string, string>;
  price?: string | null;
  selector?: string | null;
  css?: Record<string, string> | null;
};

export type Identity = {
  /** Full shop name. Used in <title>, meta and anywhere prose names the shop. */
  name: string;
  /** Wordmark in the header and footer. Often the same as `name`. */
  logoText: string;
  /**
   * The line under the wordmark — the category or descriptor a shop sets in
   * small letterspaced caps. Empty string renders nothing.
   */
  logoSubtext: string;
  tagline: string;
  /** Default <meta name="description">. */
  description: string;
  /** Footer blurb under the wordmark. */
  footerBlurb: string;
  /** Footer copyright line. `{year}` is substituted at build time. */
  copyright: string;

  /** BCP-47 tag. Drives every `toLocaleString` in the site. */
  locale: string;
  /** <html lang> value, and the og:locale that goes with it. */
  htmlLang: string;
  ogLocale: string;
  currency: string;
  /** Printed before an amount, e.g. `NT$ 1,280`. */
  currencyPrefix: string;
  /** ISO 3166-1 alpha-2, for JSON-LD areaServed. */
  country: string;
  /** Dialling prefix for the E.164 telephone in Organization JSON-LD. */
  phoneCountryCode: string;

  /**
   * Prefix for every localStorage key the storefront writes (`<ns>_cart_id`),
   * and the base of the `window` config global. Two storefronts served from one
   * host would otherwise share a cart.
   *
   * Make it distinctive — the shop's slug, not a category word. It is one of the
   * needles `npm run audit:brand` greps `src/` for, and a namespace like
   * "storefront" or "shop" matches half the API paths in the codebase.
   */
  storageNamespace: string;

  contact: ContactDetails;
  line: LineChannel;
  social: SocialLink[];

  /** Paths are public URLs, produced by mirroring `brand/assets/` into `public/`. */
  assets: {
    favicon: string;
    faviconType: string;
    logo: string;
    /**
     * The LINE official account's QR code. Empty string means the shop has not
     * been given one yet, and the contact strip drops that column rather than
     * showing a square that scans to nothing.
     */
    lineQr: string;
    /** Footer payment marks. An empty array renders no payment block. */
    paymentBadges: { alt: string; src: string }[];
  };

  /** Webfont stylesheet <link>s. Empty array = system fonts only. */
  fontStylesheets: string[];

  tokens: Tokens;
  /** Which ground each block stands on. See `GroundPolarities`. */
  groundPolarity: GroundPolarities;
  /**
   * Where the product page's thumbnails sit. Absent means `'below'`, the row
   * under the lead image that every storefront on this template ships.
   *
   * `'side'` puts them in a column to the left of the lead, about a fifth of its
   * width, on wide screens only — narrow screens are the row in both settings.
   *
   * It lives HERE, beside `groundPolarity`, because it is the same kind of fact:
   * a per-block presentation decision that is not a colour and not a string.
   * `commerce.ts` flags decide which ROUTES get built, which this is not, and
   * `copy.ts` is words.
   */
  productGallery?: ProductGalleryLayout;
  /**
   * Grounds this shop declares or redefines, on top of the template's four.
   *
   * OPTIONAL, and absent is the common case — the default table already covers
   * a pale page, a dark band, a footer and a contact strip. Declare one to move
   * a ground's inks (a pale footer sets `footer.ink` to a dark pair) or to add
   * a fifth kind of block. The ceiling is four; see `MAX_GROUNDS`.
   */
  grounds?: Record<string, GroundOverride>;
};

export const identity: Identity = {
  name: 'PUREDRIVE',
  logoText: 'PUREDRIVE',
  logoSubtext: 'DETAILING FOR A BETTER DRIVE',
  tagline: '不只潔淨，更是對駕馭的熱愛',
  description:
    '專業汽車美容用品：洗車精、鍍膜噴霧、擦車巾與內裝清潔，讓每一次出發都閃耀如新。',
  footerBlurb:
    '我們專注於汽車美容用品，致力提供專業、安全、有效的產品，陪伴每一位愛車人享受更美好的駕馭生活。',
  copyright: 'Copyright © {year} PUREDRIVE. All rights reserved.',

  locale: 'zh-Hant-TW',
  htmlLang: 'zh-Hant',
  ogLocale: 'zh_TW',
  currency: 'TWD',
  currencyPrefix: 'NT$',
  country: 'TW',
  phoneCountryCode: '+886',

  storageNamespace: 'puredrive',

  contact: {
    /* The comp prints service@puredrive.tw, a real, registrable domain this
       showcase does not own; `.example.com` is reserved and reaches nobody. */
    email: 'service@puredrive.example.com'
  },

  line: {
    id: '@060mzbbf',
    /* The percent-encoded form src/lib/line.ts produces for the hrefs it
       derives, so the strip's button and the product page's enquiry name the
       account the same way. */
    addFriendUrl: 'https://line.me/R/ti/p/%40060mzbbf'
  },

  /**
   * The rail and the footer row, in this order.
   *
   * `sameAs: false` on all three: these are the Astrapath Marketing accounts
   * every showcase in the family points at, not PUREDRIVE's own profiles.
   *
   * The comp's footer also draws a YouTube mark. There is no channel, so there
   * is no entry — a glyph that links nowhere is worse than an absent one.
   */
  social: [
    {
      label: 'LINE',
      href: 'https://line.me/R/ti/p/%40060mzbbf',
      icon: '/assets/social/line.svg',
      sameAs: false
    },
    {
      label: 'Instagram',
      href: 'https://www.instagram.com/astrapath_marketing/',
      icon: '/assets/social/instagram.svg',
      sameAs: false
    },
    {
      label: 'Facebook',
      href: 'https://www.facebook.com/people/%E9%96%8B%E5%9C%96%E6%99%BA%E8%83%BD%E5%B0%8E%E5%AE%A2%E7%B3%BB%E7%B5%B1/61570800717026/',
      icon: '/assets/social/facebook.svg',
      sameAs: false
    }
  ],

  assets: {
    favicon: '/assets/favicon.svg',
    faviconType: 'image/svg+xml',
    logo: '/assets/logo.svg',
    lineQr: '',
    paymentBadges: []
  },

  /* One stylesheet: the comp sets every heading in a heavy sans, not a serif,
     and has no handwritten line. */
  fontStylesheets: [
    'https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@500;700&display=swap'
  ],

  tokens: {
    /**
     * Sampled from design-mockups/01-home.png. The FIRST shop in this family
     * that ALTERNATES: pale header, trust strip, catalogue and FAQ; a dark
     * occasion band and a dark footer; a bright-blue LINE band between them.
     * `groundPolarity` puts the occasion band on the dark ground; the footer
     * is always its own ground.
     *
     * DELIBERATE DEPARTURES, all for AA.
     *   accent        #006afe (4.24 on the card) → #0066f6 (4.50 on the card,
     *                 4.87 on the page). Same hue, a step down.
     *   LINE band     #0077fd → #0071f1: white on the comp's blue is 4.15,
     *                 which the small subtitle fails; 4.53 here.
     *   LINE eyebrow  the comp's pale blue #86bffd is 2.35 on the band — no
     *                 blue that pale survives on blue. It is white.
     *   LINE button   white (#ffffff), not the page's #fcfdfd: the blue label
     *                 is 4.53 on white and 4.45 on the page colour.
     *   secondary     trust subtitles #75767e (4.10 on the card), eyebrow
     *                 #8c939a (2.82), leads #7c8083 (3.61), card subtitles
     *                 #8b8b94 (3.06) → one value, text.faint #6c6f76.
     *   mist          #eef1f4 → #f3f5f7: on the former both text.faint (4.44)
     *                 and the accent (4.38) fail, and both are audited inks.
     *
     * Not adjusted — the dark side clears everywhere: occasion eyebrow and
     * subtitles 5.3–5.9, footer headings 10.4, links 5.8, blurb 5.3.
     */
    color: {
      ink: '#141a21',
      text: '#3a4048',
      muted: '#5e5d64',
      surface: '#fcfdfd',
      soft: '#f2f4f6',
      mist: '#f3f5f7',
      'header-bg': '#ffffff',
      border: '#e1e6ea',
      cta: '#0066f6',
      'cta-text': '#ffffff',
      /* The header's 立即詢問, blue as drawn. Checked as a fill on the header
         ground. */
      'header-cta-bg': '#0066f6',
      'header-cta-ink': '#ffffff',
      'on-dark': '#ffffff',
      /** Form and request errors. Functional, not decorative. */
      danger: '#b3261e',
      /** LINE's own brand green. Change only if the channel changes. */
      line: '#06c755',
      'product-bg': '#fcfdfd',
      'login-bg': '#f2f4f6',
      'login-border': '#e1e6ea',
      /* The LINE band, bright blue, its own ground. 3.92:1 away from the
         footer below it, so the two read as two blocks. */
      'contact-bg': '#0071f1',
      'contact-text': '#ffffff',
      'contact-eyebrow': '#ffffff',
      /* The dark footer. */
      'footer-bg': '#11191e',
      'footer-text': '#8d9592',
      'footer-heading': '#c5c6c9',
      'footer-rule': '#2a3237',

      'catalogue-bg': '#fcfdfd',
      'catalogue-card-bg': '#f2f4f6',
      /* The occasion band is DARK, as drawn — the dark ground. */
      'scenes-bg': '#11181b',
      'scene-card-bg': '#11181b',
      'trust-bg': '#f8f9fa',
      /* The FAQ section's own pale ground, declared in `grounds.light.on`
         below so the questions are measured on it. */
      'faq-bg': '#f6f8f9',

      'on-dark-strong': '#ffffff',
      'on-dark-ink': '#dfe3e4',
      'on-dark-soft': '#c5c6c9',
      'on-dark-muted': '#8e9595',
      'on-dark-rule': '#2a3237',
      /** The accent on a dark ground. #0066f6 is 3.6:1 on the band; this is 6.9. */
      'on-dark-accent': '#5aa3ff'
    },

    /** Text colours. The typographic SCALE lives in src/styles/tokens.css. */
    text: {
      primary: '#141a21',
      secondary: '#3a4048',
      /** Prices, in the comp's deep navy. 18.2 on the page. */
      muted: '#000949',
      /** Darkened from the comp's 2.8–4.1:1 greys — see the departures above. */
      faint: '#6c6f76',
      /** FAQ questions, as drawn. 6.1 on the FAQ ground. */
      question: '#5e5d64'
    },

    /* Every family named first here is one `fontStylesheets` above actually
       loads, or one the device ships. `serif` and `serif-display` are what the
       template sets headings in, so here they name the SANS the comp draws. */
    font: {
      body: '"Noto Sans TC", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang TC", "Microsoft JhengHei", sans-serif',
      sans: '"Noto Sans TC", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang TC", "Microsoft JhengHei", sans-serif',
      serif: '"Noto Sans TC", system-ui, -apple-system, "Segoe UI", "PingFang TC", "Microsoft JhengHei", sans-serif',
      'serif-display': '"Noto Sans TC", system-ui, -apple-system, "Segoe UI", "PingFang TC", "Microsoft JhengHei", sans-serif',
      'zh-sans': '"Noto Sans TC", system-ui, -apple-system, "PingFang TC", "Microsoft JhengHei", sans-serif'
    },

    ui: {
      /* The near-black the 404, the member panel and the cart drawer paint —
         the occasion band's own value, so the dark ink set is measured on the
         ground it lands on. */
      'cta-dark': '#11181b',
      border: '#e1e6ea',
      'border-soft': '#d3d9df',
      divider: '#e8ecef',
      'thumb-bg': '#eef1f4',
      'pill-bg': '#f2f4f6',
      'overlay-top': 'rgba(17, 24, 27, 0.25)',
      'overlay-bottom': 'rgba(17, 24, 27, 0.55)'
    }
  },

  /**
   * The first alternation in the family: everything pale except the occasion
   * band and its cards, which stand on the dark ground.
   */
  groundPolarity: {
    header: 'light',
    trust: 'light',
    catalogue: 'light',
    catalogueCard: 'light',
    scenes: 'dark',
    sceneCard: 'dark'
  },

  grounds: {
    /* The template's pale-ground inks plus `text.faint` and `text.question`;
       the template's pale grounds plus `faq-bg`, and the pale blocks
       groundPolarity places here (replacing `on` drops the ones it would
       have added). A field REPLACES the default, so both are restated. */
    light: {
      on: [
        'color.surface',
        'color.soft',
        'color.mist',
        'color.product-bg',
        'color.login-bg',
        'color.faq-bg',
        'color.header-bg',
        'color.trust-bg',
        'color.catalogue-bg',
        'color.catalogue-card-bg'
      ],
      ink: [
        'color.ink',
        'color.text',
        'color.muted',
        'text.primary',
        'text.secondary',
        'text.muted',
        'text.faint',
        'text.question',
        'color.cta'
      ]
    },
    /* The LINE band carries two inks (title/subtitle and eyebrow, both white)
       and a WHITE button with blue lettering, declared as a fill so both
       halves are checked: 4.53 either way. */
    contact: {
      ink: ['color.contact-text', 'color.contact-eyebrow'],
      fill: { 'color.on-dark': 'color.contact-bg' }
    }
  }
};

const PREFIXES: Record<keyof Tokens, string> = {
  color: '--color-',
  text: '--text-',
  font: '--font-',
  ui: '--'
};

/**
 * The `:root` block. Inlined once per page by BaseLayout, which is why no
 * generated CSS file exists to go stale against this source.
 */
export function tokensCss(tokens: Tokens = identity.tokens): string {
  const lines = (Object.keys(PREFIXES) as (keyof Tokens)[]).flatMap((group) =>
    Object.entries(tokens[group]).map(
      ([key, value]) => `  ${PREFIXES[group]}${key}: ${value};`
    )
  );
  return `:root {\n${lines.join('\n')}\n}`;
}



/** `NT$ 1,280` — the one place an amount becomes a string. */
export function formatMoney(value: number): string {
  return `${identity.currencyPrefix} ${Number(value ?? 0).toLocaleString(identity.locale)}`;
}

/** localStorage key inside this storefront's namespace. */
export function storageKey(name: string): string {
  return `${identity.storageNamespace}_${name}`;
}

/**
 * The three `window` globals the storefront installs, namespaced so two shops
 * served from one host cannot read each other's config or double-flush each
 * other's beacon queue.
 *
 * The namespace is slugged first: it is allowed to contain hyphens, and these
 * end up in generated inline script as `window[NAME]` — bracket access would
 * cope, but a name that is also a valid identifier is one less thing to explain.
 */
const globalBase = identity.storageNamespace.replace(/[^A-Za-z0-9]+/g, '_');

export const CONFIG_GLOBAL = `__${globalBase.toUpperCase()}__`;
/** Immediate-send beacon, installed by BeaconBoot during HTML parse. */
export const BEACON_GLOBAL = `__${globalBase}Beacon`;
/** Set by BeaconBoot so the deferred module path skips re-binding the flush. */
export const FLUSH_FLAG = `__${globalBase}FlushBound`;

/** Public URL of a product image, for catalogues that store bare slugs. */
export function productImage(slug: string, extension = 'webp'): string {
  return `/assets/products/${slug}.${extension}`;
}

/** Footer copyright with `{year}` resolved. */
export function copyrightLine(year: number): string {
  return identity.copyright.replace('{year}', String(year));
}
