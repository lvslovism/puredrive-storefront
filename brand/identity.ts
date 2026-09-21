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
  name: 'Example Store',
  logoText: 'EXAMPLE STORE',
  logoSubtext: 'ONLINE STORE',
  tagline: '一個等待填入的商店',
  description:
    'Example Store 是 commerce-storefront-template 的中性預設內容，請於 brand/ 填入實際品牌資料。',
  footerBlurb: '這段文字來自 brand/identity.ts，替換成你的品牌敘述。',
  copyright: 'Copyright © {year} Example Store. All rights reserved.',

  locale: 'zh-Hant-TW',
  htmlLang: 'zh-Hant',
  ogLocale: 'zh_TW',
  currency: 'TWD',
  currencyPrefix: 'NT$',
  country: 'TW',
  phoneCountryCode: '+886',

  storageNamespace: 'example-store',

  contact: {
    email: 'service@example.com'
  },

  line: {
    id: '@example',
    addFriendUrl: '#'
  },

  /**
   * Placeholder links. Dropping an entry removes that button from the footer
   * without leaving a gap; emptying the array removes the row.
   */
  social: [
    { label: 'LINE', href: '#', icon: '/assets/social/line.svg' },
    { label: 'Instagram', href: '#', icon: '/assets/social/instagram.svg' },
    { label: 'Facebook', href: '#', icon: '/assets/social/facebook.svg' }
  ],

  assets: {
    favicon: '/assets/favicon.svg',
    faviconType: 'image/svg+xml',
    logo: '/assets/logo.svg',
    lineQr: '',
    paymentBadges: []
  },

  fontStylesheets: [],

  tokens: {
    /**
     * Neutral greyscale plus one accent. The template ships no brand colour on
     * purpose — a palette that looks unfinished is a palette nobody forgets to
     * replace.
     */
    color: {
      ink: '#1a1a1a',
      text: '#444444',
      muted: '#666666',
      surface: '#ffffff',
      soft: '#f5f5f5',
      mist: '#ebebeb',
      'header-bg': '#ffffff',
      border: '#dddddd',
      cta: '#1a1a1a',
      'cta-text': '#ffffff',
      /* There is no `accent` token, and its absence is the correction.
       *
       * One shipped for as long as this template has existed, was declared by
       * every storefront extracted from it, and was read by NOTHING — zero
       * `var(--color-accent)` in `src/`, and no contrast pass ever measured it.
       * A colour that is declared, inlined into every page's `:root`, and never
       * painted is worse than a missing one: it reads as the shop's accent, so
       * the next person to want an accent edits it and nothing changes.
       *
       * The accent this palette actually paints is `cta`, resolved per ground
       * as `--ground-accent`. It has two jobs — ink and fill — and
       * `src/lib/grounds.mjs` now checks it at both floors. */
      'on-dark': '#ffffff',
      /** Form and request errors. Functional, not decorative. */
      danger: '#b3261e',
      /** LINE's own brand green. Change only if the channel changes. */
      line: '#06c755',
      /**
       * The product detail page runs on ONE ground across its three stacked
       * sections, and it is the only page whose ground a shop routinely wants
       * to move on its own — a catalogue reads differently on warm paper than
       * the home page does. It shipped as --color-soft, which is also the hero
       * and trust-strip ground, so moving it moved those too.
       *
       * Starts at the value it used to inherit, so this is a knob rather than a
       * restyle.
       */
      'product-bg': '#f5f5f5',
      /**
       * The login screen's ground. One card on a field, and the field is the
       * only thing on it, so it is worth being able to set on its own — the
       * card carries a border, so the two are allowed to sit at the same
       * value. Starts at what it used to inherit from --color-soft.
       */
      'login-bg': '#f5f5f5',
      /**
       * The login card's edge. Its own value because it can end up doing a job
       * no other rule on the site does: when login-bg and surface are set to
       * the same colour, this line is the entire card. Starts at what it used
       * to inherit from --border-soft.
       */
      'login-border': '#cccccc',
      /**
       * The contact strip above the footer — its ground and its ink.
       *
       * Its own pair rather than a reuse of --cta-dark, which the footer
       * effectively duplicates: the two blocks touch, and when they carry the
       * same value the call to action dissolves into the footer. Kept apart by
       * the audit, not by convention.
       *
       * Nothing here has to be dark. A pale panel is a matter of setting a pale
       * ground and a dark ink; the block reads both from these two.
       */
      'contact-bg': '#2e2e2e',
      'contact-text': '#ffffff',
      /**
       * The footer runs DARK — its ground, its ink and its rules. They are
       * four tokens rather than an inversion of the page palette because a
       * shop that darkens its footer usually shifts its hue too, and an
       * inversion has nowhere to say so.
       */
      'footer-bg': '#1a1a1a',
      'footer-text': '#c4c4c4',
      'footer-heading': '#ffffff',
      'footer-rule': '#3a3a3a',

      /* ---- Grounds a block can run on -------------------------------------
       *
       * A block's ground is its own token, so it can move without dragging
       * every other block that happened to share one. `.catalogue` and
       * `.catalogue-card` in particular used to read the SAME token, which
       * made "a dark band holding pale cards" unsayable — any value moved
       * both, and the card survived as a 1px border. `.scenes` / `.scene-card`
       * were already separate; this is the inconsistency, not the design.
       *
       * Every value below is what the selector used to inherit, so declaring
       * them changes nothing until a shop moves one.
       */
      'catalogue-bg': '#ffffff',
      'catalogue-card-bg': '#ffffff',
      'scenes-bg': '#ebebeb',
      'scene-card-bg': '#ffffff',
      'trust-bg': '#f5f5f5',

      /* ---- The ink set for a DARK ground -----------------------------------
       *
       * The palette already had one of these: the footer's four tokens. What
       * it did not have was a way to use them anywhere else, so a second dark
       * block meant a second private set — and the shop that wanted four of
       * them (header, catalogue band, contact, footer) would be maintaining
       * sixteen tokens that all mean the same six things.
       *
       * These are that set, named for the JOB rather than the place, so any
       * block declaring `dark` in `groundPolarity` reads them. The four ink
       * levels mirror the light ones exactly — strong / body / soft / muted —
       * because a dark block needs the same distinctions a pale one does.
       *
       * They START AT THE FOOTER'S OWN VALUES, and that is not laziness — the
       * footer is the one dark block this palette already has, so its inks are
       * the only reversed values that have been looked at on a real ground and
       * checked by `audit:color`. Seeding from anywhere else would ship a dark
       * half nobody has ever seen against this shop's dark ground. The three
       * body levels therefore start equal, because the footer only ever drew
       * two: a shop that wants a hierarchy on its dark bands separates them
       * deliberately rather than inheriting a guess.
       *
       * Unused at these defaults — the template ships every block light.
       */
      'on-dark-strong': '#ffffff',
      'on-dark-ink': '#c4c4c4',
      'on-dark-soft': '#c4c4c4',
      'on-dark-muted': '#c4c4c4',
      'on-dark-rule': '#3a3a3a',
      /**
       * The accent AS IT APPEARS ON A DARK GROUND. Its own value because a
       * mid-toned brand colour cannot clear AA against both a pale ground and
       * a dark one — the intersection is empty, and every shop that tried
       * ended up darkening its brand colour a step to buy a compromise that
       * neither ground wanted. One name, two values, resolved by whichever
       * ground the block declared.
       */
      'on-dark-accent': '#ffffff'
    },

    /** Text colours. The typographic SCALE lives in src/styles/tokens.css. */
    text: {
      primary: '#1a1a1a',
      secondary: '#444444',
      muted: '#666666',
      faint: '#999999'
    },

    font: {
      body: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans TC", sans-serif',
      sans: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans TC", sans-serif',
      serif: 'Georgia, "Noto Serif TC", "Times New Roman", serif',
      'serif-display': 'Georgia, "Noto Serif TC", "Times New Roman", serif',
      'zh-sans': 'system-ui, -apple-system, "PingFang TC", "Microsoft JhengHei", sans-serif'
      /*
       * OPTIONAL: `hero` -> `--font-hero`, read by the hero title alone.
       *
       * Not declared here, and the absence IS the behaviour: the rule is
       * `var(--font-hero, var(--font-serif))`, so a shop that says nothing
       * keeps its hero on the same family as every other heading. Add the key
       * only to set that ONE heading apart — `--font-serif` still carries the
       * rest, so moving one no longer moves both.
       */
    },

    /**
     * Bare-named greys the cart / member panels share. They were a second,
     * subtree-scoped palette before the extraction; folding them into `:root`
     * removed the only place two colour systems could disagree.
     */
    ui: {
      'cta-dark': '#1a1a1a',
      border: '#dddddd',
      'border-soft': '#cccccc',
      divider: '#eeeeee',
      'thumb-bg': '#f2f2f2',
      'pill-bg': '#f0f0f0',
      /*
       * The scrim over a full-bleed hero photograph, top and bottom.
       * Read by `src/components/common/PageHero.astro` and by nothing else.
       *
       * In `ui` and not in `color`, deliberately. A `color.*-bg` is a GROUND —
       * a flat background whose inks `audit:color` measures for contrast, and
       * `assertGroundsCover` refuses one that belongs to no ground. A scrim is
       * neither: it is a translucent wash over a photograph nobody has chosen
       * yet, and there is no ratio to compute against an unknown image. Filing
       * it as a colour would mean inventing a ground for it to satisfy a
       * measurement that could not mean anything.
       *
       * Two stops rather than one because the load is at the foot: the hero
       * carries its title high and its breadcrumb low, and a flat wash strong
       * enough for the low end greys out the whole photograph.
       */
      'overlay-top': 'rgba(20, 20, 20, 0.25)',
      'overlay-bottom': 'rgba(20, 20, 20, 0.55)'
    }
  },

  /**
   * Every block ships on the pale ground, which is the shape the template has
   * always had: one pale page, one dark footer. Moving one to `dark` switches
   * the block's ink, its hairlines and its accent together — it does NOT set
   * the background, which stays the matching `--color-*-bg` token, because a
   * shop that darkens a band nearly always wants its own hue rather than a
   * generic near-black.
   *
   * The two halves are checked against each other. Darkening the background
   * and leaving the block on the pale ground fails `audit:color` on the spot,
   * rather than shipping a band whose type has gone invisible.
   */
  groundPolarity: {
    header: 'light',
    trust: 'light',
    catalogue: 'light',
    catalogueCard: 'light',
    scenes: 'light',
    sceneCard: 'light'
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
