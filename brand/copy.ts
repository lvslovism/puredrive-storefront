/**
 * copy.ts — every reader-facing string that is specific to THIS shop.
 *
 * The boundary: a string lives here when a different storefront would have to
 * change it. Generic commerce chrome that every shop shares — 小計, 數量,
 * 加入購物車, 結帳 — stays in the component that renders it. Moving those here
 * would turn `brand/` into a second copy of the markup without making anything
 * more portable.
 *
 * The home page ships as two PRESETS — `homeMultipage` and `homeLanding` —
 * and `home` selects one. See the block above them for which is which.
 */
import { identity } from './identity';

export type NavItem = { label: string; href: string };
/**
 * A nav entry that also carries a glyph. `icon` is a public asset URL and is
 * OPTIONAL: a shop that has not drawn its own gets a neutral one from the
 * component, rather than an empty box where a picture should be.
 */
export type IconLink = NavItem & { icon?: string };
export type FooterGroup = { title: string; links: NavItem[] };
/**
 * `icon` is OPTIONAL, and its absence is the normal case.
 *
 * It was required, so the template had to ship a glyph for every list that
 * wanted one — and a shop with no marks of its own pointed every entry at the
 * same file. That file drew a numeral, so three assurances rendered “1 1 1” and
 * five steps rendered “1” beside the numbers 1 to 5. A stand-in that MAKES A
 * CLAIM is worse than a missing one: nothing looks broken, it just lies.
 *
 * So no icon is the default, and every render site checks before drawing.
 */
export type IconItem = { title: string; text: string; icon?: string };
export type ImageItem = { title: string; text: string; image: string };

/**
 * Header + mobile-drawer navigation, in render order.
 *
 * EMPTY THIS for a one-page shop. There is nothing to navigate to when the
 * catalogue, the FAQ and the contact details are all further down the same
 * document, so the header drops its centre column and its drawer with it and
 * keeps only the cart / member / call-to-action cluster.
 */
export const navigation: NavItem[] = [];

/**
 * The header controls that sit opposite the wordmark, in every shape of shop.
 *
 * `ctaLabel: ''` removes the button — a shop whose header should carry nothing
 * but the cart and the member link says so here rather than in the component.
 * `ctaHref` runs through the same route filter as every other link, so a CTA
 * pointing at a page this build did not produce disappears instead of 404ing.
 */
export const header = {
  cart: '購物車',
  member: '會員',
  ctaLabel: '立即選購',
  ctaHref: '/#catalogue',
  /**
   * SHOWCASE ONLY (`flags.commerce: false`). The single button that replaces
   * the whole cart / member / call-to-action cluster.
   *
   * It is here rather than in the component for the same reason `ctaLabel` is:
   * a shop that would rather say 私訊詢價 than 加 LINE 詢問 is making a copy
   * decision, and copy decisions live in brand/. A transacting shop never
   * renders it and can leave it as shipped.
   */
  inquiryLabel: '立即詢問'
};

/** Footer link columns. The company block is appended by the component. */
/*
 * The comp draws 購物專區 and 顧客服務 columns. Their entries — 全部商品,
 * 熱銷推薦, 配送政策, 購物說明 … — would point at pages this one-page showcase
 * never builds, so they are not here: the first column walks the home page
 * instead, and the second carries the three documents that DO exist. With the
 * brand column and the derived 聯絡資訊 block that keeps the template's four
 * columns, and every link in them resolves.
 */
export const footerGroups: FooterGroup[] = [
  {
    title: '快速連結',
    links: [
      { label: '精選商品', href: '/#catalogue' },
      { label: '生活態度', href: '/#scenes' },
      { label: '常見問題', href: '/#faq' },
      { label: '聯絡我們', href: '/#contact' }
    ]
  },
  {
    title: '購物資訊',
    links: [
      { label: '使用條款', href: '/terms' },
      { label: '隱私權政策', href: '/privacy' },
      { label: '退換貨政策', href: '/returns-policy' }
    ]
  }
];

/** The row beside the copyright, in the bar under the footer columns. */
export const footerLegalLinks: NavItem[] = [
  { label: '隱私權政策', href: '/privacy' },
  { label: '使用條款', href: '/terms' },
  { label: '退換貨政策', href: '/returns-policy' }
];


/**
 * Home page presets.
 *
 * A home page is the one page whose SHAPE is a business decision, not a layout
 * decision: a shop that uses it as a front door to other pages and a shop that
 * sells straight off it do not want the same blocks in a different order, they
 * want different blocks. So the template ships two, and `home` below picks one.
 *
 *   multipage  hero → features → featured products → highlights → band → steps
 *              Every block ends in a link somewhere else. Nothing is bought.
 *
 *   landing    hero → catalogue → story → trust → FAQ teaser → CTA
 *              The catalogue block adds to the cart in place, so this preset is
 *              a whole shop on one URL.
 *
 * `preset` is the discriminator src/pages/index.astro switches on, and it is
 * what makes the two type-safe to hold in one file: filling in `homeLanding`
 * cannot accidentally satisfy the multipage renderer. Fill in the one you use
 * and leave the other as shipped — it costs nothing until it is selected.
 */
export type CtaLink = { label: string; href: string };

export type HeroCopy = {
  /**
   * Which way the hero IMAGE runs, so the copy on top of it can be legible.
   *
   * 'light' — a pale image; the copy is ink and a scrim keeps it readable.
   * 'dark'  — a dark, side-lit photograph; the copy is white and NO scrim is
   *           applied, because a picture chosen for its dark side does not need
   *           rescuing and a wash would only flatten it.
   *
   * This is a fact about the artwork, not a style preference, which is why it
   * sits beside the image path rather than in a stylesheet.
   */
  tone: 'light' | 'dark';
  /**
   * What goes BETWEEN the copy and the photograph — if anything.
   *
   * `tone` says which way the picture runs and therefore what colour the copy
   * is. This says what, if anything, is put underneath it, and the two are
   * genuinely separate questions: a pale photograph can be pale in a way that
   * carries dark copy perfectly well.
   *
   *   'scrim' — the gradient wash. Cheap, keeps the picture, and is enough when
   *             the copy area is merely marginal.
   *   'panel' — a block of --cta-dark behind the copy, light copy on top. Costs
   *             a quarter of the image and buys the only guarantee available:
   *             a DECLARED pair (--color-on-dark on --cta-dark) that
   *             `npm run audit:color` already checks, so legibility stops
   *             depending on which picture is behind it.
   *   'none'  — the photograph, plain. Only honest once the copy area has been
   *             MEASURED, because contrast over a photograph is a distribution,
   *             not a number: an image can average beautifully and still leave a
   *             few per cent of the copy area under AA — and that few per cent
   *             lands on the thin strokes of a display face, where the
   *             percentage understates badly what an eye actually sees.
   *
   * Default when unset: 'scrim' for a light image, 'none' for a dark one, which
   * is what the two tones have always meant on their own.
   *
   * MEASURE BEFORE CHOOSING. docs/PITFALLS.md #7 gives the method, including
   * the part people get wrong — working out where the copy actually lands
   * before sampling a single pixel.
   *
   * The multipage hero has never carried a scrim and still does not; it honours
   * 'panel' and otherwise leaves the photograph alone.
   */
  copyGround?: 'scrim' | 'panel' | 'none';
  /**
   * The same question again, for the phone — because it is a different picture.
   *
   * `<picture>` swaps in `mobileImage` on a narrow screen, and a portrait crop
   * of the same scene is a different photograph as far as the copy is
   * concerned: it lands on different pixels. Measured on the shops in this
   * family, the landscape crop cleared AA over its whole copy area while the
   * portrait crop of the SAME hero left 22% and 41% of it under AA. A single
   * field would have made those shops choose between a phone that reads and a
   * desktop hero carrying a panel it does not need.
   *
   * Applies at 760px and below; `copyGround` applies above it.
   *
   * UNSET INHERITS `copyGround`. It does not mean 'none' — a shop that chose a
   * scrim chose it for the hero, and quietly dropping it on phones would be the
   * opposite of what it asked for. Set this only when the phone has been
   * MEASURED and disagrees with the desktop.
   */
  mobileCopyGround?: 'scrim' | 'panel' | 'none';
  /**
   * Which side of the hero the copy sits on. Absent is 'left', which is where
   * every hero sat before this field existed.
   *
   * It pairs with `scrim.from`, and pairing them is the point: the wash exists
   * to make the copy legible, so copy on the right over a wash entering from
   * the left is a hero with a pale quarter nobody is standing in. Nothing
   * enforces the pairing — a photograph may well carry one side on its own —
   * but they are the two halves of one decision.
   */
  align?: 'left' | 'right';
  /**
   * The legibility wash, as three independent choices. Absent — or any field
   * of it absent — is the gradient this template always drew: entering from
   * the left, built from the page's own pale ground, solid for its first
   * quarter.
   *
   * WHETHER there is a wash at all is still `copyGround`. This only describes
   * the one that gets drawn.
   */
  scrim?: {
    /** Which side the opaque end sits on. Default 'left'. */
    from?: 'left' | 'right';
    /** 'surface' is the pale page ground; 'dark' is the panel's near-black. */
    tint?: 'surface' | 'dark';
    /** How far it carries. 'standard' is the shipped gradient exactly. */
    depth?: 'light' | 'standard' | 'heavy';
  };
  title: string;
  /**
   * A handwritten line set on the far side of the hero from the copy, in
   * `--font-script` and the accent colour. OPTIONAL — absent or empty renders
   * nothing. Only HomeLanding reads it.
   *
   * ⚠️ The script face is loaded with Google Fonts' `text=` subset, so it
   * carries ONLY the glyphs of the lines written in this file. Change the
   * words and change `text=` in `identity.fontStylesheets` in the same edit.
   */
  script?: string;
  /**
   * The small letterspaced line in the copy block, between the lead and the
   * button. OPTIONAL — absent or empty renders nothing. Only HomeLanding
   * reads it.
   */
  tagline?: string;
  /**
   * Small letterspaced caps in the photograph's lower-right corner, one line
   * per `\n`. OPTIONAL — absent or empty renders nothing. Wide screens only.
   * It stands on the photograph, so it is MEASURED like the copy.
   */
  corner?: string;
  /**
   * The small line above the headline. Empty string renders nothing — a comp
   * with no eyebrow is a choice, not an omission, and the hero drops the
   * element rather than leaving a blank line where it would have been. The KEY
   * still has to be present, so "chose not to" stays distinguishable from
   * "forgot".
   */
  eyebrow: string;
  /** `\n` renders as a line break — the block is `white-space: pre-line`. */
  description: string;
  ctaLabel: string;
  ctaHref: string;
  image: string;
  mobileImage: string;
  imageAlt: string;
};

export type HomeMultipageCopy = {
  preset: 'multipage';
  metaTitle: string;
  metaDescription: string;
  hero: HeroCopy;
  /** Icon strip directly under the hero. Six entries fill the desktop row. */
  features: IconItem[];
  /** The featured-products band. Products come from the commerce API. */
  featured: { title: string; linkLabel: string; linkHref: string };
  /** Copy column plus a four-up image grid. */
  highlights: {
    eyebrow: string;
    title: string;
    lead: string;
    ctaLabel: string;
    ctaHref: string;
    items: ImageItem[];
  };
  /** Full-bleed image band with the copy floated over it. */
  band: {
    eyebrow: string;
    title: string;
    lead: string;
    ctaLabel: string;
    ctaHref: string;
    image: string;
    imageAlt: string;
  };
  /** Numbered steps. Five entries fill the desktop row. */
  steps: {
    eyebrow: string;
    title: string;
    items: { step: string; title: string; text: string; icon?: string }[];
  };
};

export type HomeLandingCopy = {
  preset: 'landing';
  metaTitle: string;
  metaDescription: string;
  hero: HeroCopy;
  /**
   * The assurance strip under the hero — the "why buy here" row. Five entries
   * fill the desktop row; emptying the array removes the strip.
   */
  trust: { items: IconItem[] };
  /**
   * The product block. Products themselves come from the commerce API.
   *
   * `linkLabel` / `linkHref` are the "view all" beside the heading, and they
   * are OPTIONAL: a one-page shop's catalogue block already shows everything
   * there is, so it has nowhere to send anyone. Omitting the label removes the
   * link rather than rendering an empty anchor.
   */
  catalogue: {
    eyebrow: string;
    title: string;
    lead: string;
    linkLabel?: string;
    linkHref?: string;
  };
  /**
   * Occasion cards — the "what is this for" band. Emptying the array removes it.
   *
   * FOUR, in this shop. The template's grid is three columns; this shop's
   * HomeLanding runs four at desktop, two from 1024px down and one from 560px
   * down, so four entries fill one desktop row and two tablet rows exactly.
   * A fifth would drop to a row on its own and read as a mistake.
   */
  scenes: {
    /** `\n` renders as a line break. */
    title: string;
    /** The small letterspaced line above the title. OPTIONAL. */
    eyebrow?: string;
    /** The line under the title. OPTIONAL. */
    lead?: string;
    items: (ImageItem & { imageAlt?: string })[];
  };

  /**
   * The FAQ disclosure block. The questions are NOT authored here — the page
   * reads `faq.items` further down and resolves the payment and shipping
   * answers from merchant config, exactly as the standalone /faq page does.
   * One source, one answer.
   *
   * `eyebrow` and `lead` empty render nothing. `aside` is the small label in
   * the right margin and `script` the handwritten line under it; both are
   * decoration on a wide screen only, and both are OPTIONAL. `script` shares
   * the hero's `text=` font subset — see `HeroCopy.script`.
   */
  faq: { eyebrow: string; title: string; lead: string; aside?: string; script?: string };
  /**
   * The contact strip above the footer. The phone, e-mail and service hours it
   * shows are NOT authored here: they derive from the merchant record, same as
   * the footer and the legal pages, so the three cannot disagree.
   */
  lineCta: {
    /** The letterspaced line above the title. OPTIONAL; empty renders nothing. */
    eyebrow?: string;
    /** `{channel}` is replaced with `identity.line.id`. */
    title: string;
    /** Two short lines under the title. More render; they just get long. */
    lines: string[];
    buttonLabel: string;
    /** Under the QR code. Only rendered when identity.assets.lineQr is set. */
    qrCaption: string;
  };
};

export type HomeCopy = HomeMultipageCopy | HomeLandingCopy;

/**
 * The multipage preset: a fixed sequence of six blocks, each entry below
 * filling one of them. This is not a section registry — emptying an entry's
 * `items` array collapses that block rather than rendering a heading with
 * nothing under it.
 */
export const homeMultipage: HomeMultipageCopy = {
  preset: 'multipage',
  metaTitle: '首頁',
  metaDescription: `${identity.name} 線上商店`,

  hero: {
    tone: 'light',
    eyebrow: 'EXAMPLE STORE',
    title: '這裡是首頁主標題',
    /** `\n` renders as a line break — the block is `white-space: pre-line`. */
    description: '這段副標來自 brand/copy.ts。\n替換成你要對客人說的第一句話。',
    ctaLabel: '立即選購',
    ctaHref: '/products',
    image: '/assets/home/hero.svg',
    mobileImage: '/assets/home/hero-mobile.svg',
    imageAlt: '首頁主視覺'
  },

  /** Icon strip directly under the hero. Six entries fill the desktop row. */
  features: [
    { title: '重點一', text: '一句話說明\n這項優勢' },
    { title: '重點二', text: '一句話說明\n這項優勢' },
    { title: '重點三', text: '一句話說明\n這項優勢' },
    { title: '重點四', text: '一句話說明\n這項優勢' },
    { title: '重點五', text: '一句話說明\n這項優勢' },
    { title: '重點六', text: '一句話說明\n這項優勢' }
  ] as IconItem[],

  /** The featured-products band. Products come from the commerce API. */
  featured: {
    title: '精選商品',
    linkLabel: '查看全部商品 →',
    linkHref: '/products'
  },

  /** Copy column plus a four-up image grid. */
  highlights: {
    eyebrow: 'HIGHLIGHTS',
    title: '產品特色',
    lead: '這段文字說明你的產品為什麼值得被選擇。',
    ctaLabel: '了解更多',
    ctaHref: '/about',
    items: [
      { title: '特色一', text: '簡短說明', image: '/assets/home/highlight.svg' },
      { title: '特色二', text: '簡短說明', image: '/assets/home/highlight.svg' },
      { title: '特色三', text: '簡短說明', image: '/assets/home/highlight.svg' },
      { title: '特色四', text: '簡短說明', image: '/assets/home/highlight.svg' }
    ] as ImageItem[]
  },

  /** Full-bleed image band with the copy floated over it. */
  band: {
    eyebrow: 'ABOUT',
    title: `關於 ${identity.name}`,
    lead: '兩到四行品牌敘述，說明你是誰、為誰而做。',
    ctaLabel: '了解更多品牌故事 →',
    ctaHref: '/about',
    image: '/assets/home/band.svg',
    imageAlt: '品牌形象'
  },

  /** Numbered steps. Five entries fill the desktop row. */
  steps: {
    eyebrow: 'HOW IT WORKS',
    title: '使用步驟',
    items: [
      { step: 'STEP 1', title: '步驟一', text: '一句話說明' },
      { step: 'STEP 2', title: '步驟二', text: '一句話說明' },
      { step: 'STEP 3', title: '步驟三', text: '一句話說明' },
      { step: 'STEP 4', title: '步驟四', text: '一句話說明' },
      { step: 'STEP 5', title: '步驟五', text: '一句話說明' }
    ]
  }
};

/**
 * The one-page preset, shipped as neutral placeholder copy. Selecting it is one
 * edit at the bottom of this block; filling it in is the same job as filling in
 * `homeMultipage`.
 *
 * The sequence it renders is fixed:
 *   hero → trust strip → catalogue → occasion cards → contact strip
 * Emptying `trust.items` or `scenes.items` removes that band rather than
 * leaving a heading with nothing under it.
 */
export const homeLanding: HomeLandingCopy = {
  preset: 'landing',
  metaTitle: '不只潔淨，更是對駕馭的熱愛',
  metaDescription:
    '專業汽車美容用品：洗車精、鍍膜噴霧、擦車巾與內裝清潔，讓每一次出發都閃耀如新。',

  /*
   * A DARK photograph under white copy, as drawn — the first in this family.
   *
   * MEASURED per glyph, per docs/PITFALLS.md #7: each character's own rect,
   * with `.hero-copy > *` hidden (the corner caps: ink made transparent),
   * against white. 2026-09-29, the FULL-BLEED hero (the viewport less the
   * header) on hero-v2 1920x1200 / hero-mobile-v2 900x1400:
   *
   *   dark scrim 'standard' ← shipped (it was 'heavy'; the taller hero no
   *              longer needs it): solid to 26%, gone by 68%.
   *              1920: title 5.38, lead 8.90, tagline 13.41.
   *              1440: title 6.07, lead 11.57, tagline 17.77.
   *              1280/1100: title 15.13/15.18, lead 12.83/9.47.
   *              820: title 6.83, lead 5.29, tagline 14.09.
   *              844x390 and 844x500 (natural height): title 7.62,
   *              lead 5.66, tagline 14.93. 0 glyphs under 4.5 anywhere.
   *   Phones: the copy sits at the top of the portrait crop and the wash runs
   *              down, solid to 320px and gone by 440px (HomeLanding): 390,
   *              360, 375, 414 and 320 wide, 0 glyphs under, min 17.94. The
   *              button is what sets the 320px: shorter, its fill meets the
   *              ceiling lights (3.01 at 360x740 with 400px).
   *   The corner caps (CLEANER CARS / HAPPIER JOURNEYS) still sit on the
   *   car's dark rear: 0 / 26, min 20.62.
   *   The bright-blue button: its fill against the photograph min 3.21
   *   (360x740), 3.25 (1920), otherwise 3.39 or more; its label 4.96.
   *
   * A conclusion about THESE words on THESE crops. Change either, measure again.
   */
  hero: {
    tone: 'dark',
    copyGround: 'scrim',
    mobileCopyGround: 'scrim',
    align: 'left',
    scrim: { from: 'left', tint: 'dark', depth: 'standard' },
    eyebrow: '',
    title: '不只潔淨\n更是對駕馭的熱愛',
    /** `\n` renders as a line break — the block is `white-space: pre-line`. */
    description: '專業汽車美容用品，讓每一次出發都閃耀如新',
    tagline: '清潔 ｜ 保護 ｜ 維護 ｜ 享受駕馭',
    corner: 'CLEANER CARS\nHAPPIER JOURNEYS',
    ctaLabel: '立即詢問 →',
    ctaHref: 'https://line.me/R/ti/p/%40060mzbbf',
    image: '/assets/home/hero-v2.jpg',
    mobileImage: '/assets/home/hero-mobile-v2.jpg',
    imageAlt: '昏暗車庫裡，以高壓水柱沖洗銀色轎車的剪影'
  },

  /* Six, as drawn. HomeLanding derives the column count from the entries. */
  trust: {
    items: [
      { icon: '/assets/home/trust/quality.svg', title: '專業級品質', text: '嚴選高效配方' },
      { icon: '/assets/home/trust/protect.svg', title: '全方位防護', text: '從清潔到保護' },
      { icon: '/assets/home/trust/gentle.svg', title: '安全不傷車漆', text: '溫和有效配方' },
      { icon: '/assets/home/trust/star.svg', title: '玩家一致推薦', text: '眾多車主好評' },
      { icon: '/assets/home/trust/shipping.svg', title: '快速出貨', text: '台灣本島快速配送' },
      { icon: '/assets/home/trust/advice.svg', title: '專業諮詢', text: '提供適用建議' }
    ] as IconItem[]
  },

  catalogue: {
    eyebrow: 'OUR PRODUCTS',
    title: '精選商品',
    lead: '專業源自細節・打造更完美的駕馭體驗'
  },

  /*
   * Four, as drawn, on the DARK band — the wash, the cabin, the coating, and
   * the road the clean car is for.
   */
  scenes: {
    eyebrow: 'MORE THAN CLEAN',
    title: '不只是清潔・更是一種生活態度',
    lead: '從日常維護到深度養護，陪伴你享受每一段駕馭旅程',
    items: [
      {
        title: '外觀洗淨',
        text: '徹底清潔・閃耀如新',
        image: '/assets/home/scene-01-v1.jpg',
        imageAlt: '覆滿洗車泡沫的車頭大燈特寫'
      },
      {
        title: '內裝護理',
        text: '細節清潔・舒適升級',
        image: '/assets/home/scene-02-v1.jpg',
        imageAlt: '以超細纖維布擦拭方向盤的車內護理'
      },
      {
        title: '鍍膜維護',
        text: '持久保護・光澤如鏡',
        image: '/assets/home/scene-03-v1.jpg',
        imageAlt: '深色烤漆上的撥水水珠特寫'
      },
      {
        title: '週末車旅',
        text: '乾淨的車・更精彩的旅程',
        image: '/assets/home/scene-04-v1.jpg',
        imageAlt: '從車窗望出的海岸公路與遠方海面'
      }
    ]
  },

  /* The Q1–Q5 prefixes are drawn by HomeLanding's CSS counter, not typed into
     the questions, so the standalone /faq data stays clean. */
  faq: {
    eyebrow: 'FREQUENTLY ASKED QUESTIONS',
    title: '常見問題',
    lead: '有其他問題？歡迎點擊下方按鈕與我們聯繫'
  },

  lineCta: {
    eyebrow: 'READY FOR A CLEANER RIDE?',
    title: '讓愛車展現最佳狀態',
    lines: ['專業汽車美容用品，從這裡開始'],
    /* The arrow is drawn by HomeLanding's own SVG, so it is not typed here. */
    buttonLabel: '立即詢問',
    qrCaption: '掃描加入 LINE 好友'
  }
};

/**
 * The preset this shop uses. Swap to `homeLanding` for a one-page shop; nothing
 * else changes — src/pages/index.astro renders whichever `preset` says.
 */
export const home: HomeCopy = homeLanding;

/**
 * Every preset the template ships, selected or not.
 *
 * Exported so src/pages/index.astro can VALIDATE all of them on every build,
 * not just the one it renders. A defect in the preset a shop has not selected
 * is invisible until somebody swaps a single line and ships it, and that is not
 * hypothetical: `homeLanding.hero` was missing its required `tone` and built
 * green for exactly as long as nobody selected it.
 *
 * Add a preset above, add it here. A preset absent from this list is a preset
 * nothing checks.
 */
export const homePresets: HomeCopy[] = [homeMultipage, homeLanding];

/**
 * The assurances, as a band any page can stand on.
 *
 * `homeMultipage.trust` is the home page's own strip and stays where it is: it
 * belongs to a preset, is ordered against the blocks around it, and a shop that
 * swaps presets swaps it too. This one is page-level — the same promises under
 * a product list, at the foot of the FAQ, below a contact form — so it is
 * declared once at the top level rather than copied into each page's block.
 *
 * `body` rather than the `text` that `IconItem` carries, and that is not an
 * inconsistency worth tidying away: they are read by different components, and
 * folding them onto one type would mean the home strip and this band could
 * never take different fields without a migration through every storefront.
 *
 * `icon` is a NAME, not a path. `TrustBand.astro` draws single-path line marks
 * inline, because a mark on a dark band has to take its colour from the ground
 * it lands on — `stroke: currentColor` — and an <img> cannot inherit ink. The
 * component ships shield / delivery / payment / support. `icon` may be left out
 * entirely, and then the band draws no mark rather than a stand-in that means
 * something else: a placeholder that MAKES A CLAIM is worse than a missing one,
 * as the numeral glyph in `IconItem` above records.
 *
 * Empty the array to remove the band from wherever it is used.
 */
export type TrustItem = { title: string; body: string; icon?: string };

export const trust: { items: TrustItem[] } = {
  items: [
    { icon: 'shield', title: '安全不傷車漆', body: '溫和有效配方，從清潔到保護。' },
    { icon: 'delivery', title: '快速出貨', body: '台灣本島快速配送。' },
    { icon: 'support', title: '專業諮詢', body: '依車況與用途提供適用建議。' }
  ]
};

export const about = {
  metaTitle: `關於 ${identity.name}`,
  hero: {
    eyebrow: 'ABOUT',
    title: `關於 ${identity.name}`,
    description: '一段品牌介紹，說明你的來歷、堅持與想解決的問題。',
    ctaLabel: '前往商品',
    ctaHref: '/products',
    image: '/assets/about/hero.svg',
    imageAlt: '品牌形象'
  },
  story: {
    eyebrow: 'ORIGIN',
    title: '品牌故事',
    paragraphs: [
      '第一段故事文字。說明品牌怎麼開始的。',
      '第二段故事文字。說明你想帶給客人什麼。'
    ],
    image: '/assets/about/story.svg',
    imageAlt: '品牌故事'
  },
  values: {
    title: '我們在乎的事',
    lead: '一段說明，鋪陳下面這幾個價值主張。',
    items: [
      { title: '價值一', text: '簡短說明', image: '/assets/about/value.svg' },
      { title: '價值二', text: '簡短說明', image: '/assets/about/value.svg' },
      { title: '價值三', text: '簡短說明', image: '/assets/about/value.svg' },
      { title: '價值四', text: '簡短說明', image: '/assets/about/value.svg' },
      { title: '價值五', text: '簡短說明', image: '/assets/about/value.svg' }
    ] as ImageItem[]
  },
  cta: {
    title: '一句話收尾，邀請客人往下一步走',
    text: '補一句說明，降低點擊的猶豫。',
    image: '/assets/about/cta.svg',
    primary: { label: '前往商品', href: '/products' },
    secondary: { label: '閱讀專欄', href: '/blog' }
  }
};

export const products = {
  metaTitle: '全部商品',
  metaDescription: `${identity.name} 全系列商品`,
  hero: {
    eyebrow: 'ALL PRODUCTS',
    title: '全部商品',
    lead: '一句話說明這個系列涵蓋什麼。'
  },
  /** Names the ItemList JSON-LD emits for the grid. */
  itemListName: '全部商品'
};

/**
 * Product detail page copy.
 *
 * The assurance items and the two policy tabs are SHOP-level facts, not
 * per-product ones, so they live here rather than in the catalogue: a merchant
 * that changes its 鑑賞期 changes it once. The 商品說明 tab is the product's own
 * description from the commerce API and is NOT templated — renaming the tab
 * here does not change where its content comes from.
 */
export const productDetail = {
  /**
   * SHOWCASE ONLY (`flags.commerce: false`). The one button that replaces
   * 加入購物車 and 立即購買, and what it types into LINE on the customer's
   * behalf.
   *
   * `{product}` is substituted with the product's name — and with the chosen
   * spec appended, when the customer has picked one — so the merchant receives
   * "我想詢問：天絲萊賽爾四件組 雙人加大" rather than a bare 你好. The customer
   * can still edit it before sending; LINE opens the chat with the text in the
   * composer, it does not send anything.
   */
  inquiryLabel: '立即詢問',
  /*
   * EMPTY on purpose, so every enquiry opens the plain add-friend link
   * (`line.me/R/ti/p/…`) with nothing pre-typed — src/lib/line.ts falls back to
   * it when the message is empty.
   *
   * The pre-filled form (`oaMessage`) was measured on 2026-09-21 and fails hard
   * on desktop: line.me redirects a desktop browser straight to LINE's own
   * homepage (www.line.me/en/), with no account and no message. `ti/p` serves
   * the "Add LINE friend" page with the QR on desktop. Phones handed
   * `oaMessage` over to the app with the text intact, but a helper cannot tell
   * the two apart per device, so the one link that works everywhere wins.
   * The cost: 客服 can no longer tell from the first message which product,
   * or which shop, a chat came from.
   */
  inquiryMessage: '',

  assurances: [
    { title: '安全不傷車漆', text: '溫和有效配方' },
    { title: '七日鑑賞期', text: '商品到貨日起算 7 天' },
    { title: 'LINE 諮詢', text: '車況與用品搭配一對一回覆' }
  ] as IconItem[],

  /** Tab labels, in render order. The first tab is the API description. */
  tabs: {
    description: '商品說明',
    ingredients: '使用與保養',
    ordering: '詢問須知'
  },

  /** Shown when a product carries no description of its own. */
  descriptionFallback: '本商品尚未提供詳細說明，如需了解更多請聯繫客服。',

  /** Second tab. Replace with the facts your category actually needs. */
  ingredients: [
    '請於陰涼處、車身表面降溫後使用，避免在烈日下施作，以免藥劑快速乾燥留下水痕。',
    '使用前請先於不顯眼處小面積測試；擦車巾與手套請分開清洗，勿使用柔軟精。',
    '本頁內容為範例文案，實際規格以商品包裝標示為準。'
  ],

  /** Third tab. Ordering / shipping expectations, not the checkout's own rules. */
  ordering: [
    '本站為展示範例站，不提供線上結帳；點選「立即詢問」即可透過 LINE 與我們聯繫。',
    '詢問時請告知商品與規格，我們會回覆供貨與出貨時程。',
    '本頁內容為範例文案，商品與價格僅供版面示意。'
  ],

  relatedTitle: '您可能也喜歡'
};

export const contact = {
  metaTitle: '聯絡我們',
  metaDescription: `${identity.name} 聯絡資訊與服務`,
  hero: {
    eyebrow: 'CONTACT',
    title: '聯絡我們',
    lead: '感謝您的關注與支持，我們很樂意為您提供協助。'
  },
  methodsHeading: {
    title: '我們很樂意為您服務',
    lead: '無論您有任何疑問或需求，我們都會盡快回覆。'
  },
  methods: [
    {
      title: '客服支援',
      text: '商品、配送或售後相關疑問，我們會提供清楚的協助。',
      action: '聯絡客服支援',
      href: '#',
      image: '/assets/contact/card.svg'
    },
    {
      title: '合作諮詢',
      text: '若您有通路或異業合作需求，歡迎與我們聯繫。',
      action: '聯絡合作窗口',
      href: '#',
      image: '/assets/contact/card.svg'
    },
    {
      title: '訂單協助',
      text: '訂單查詢、修改或購買流程說明，我們會即時協助。',
      action: '取得訂單協助',
      href: '#',
      image: '/assets/contact/card.svg'
    }
  ]
};

/**
 * FAQ entries. `derive: 'payment' | 'shipping'` replaces the answer with one
 * projected from merchant config at build time — leave those answers empty so
 * no second, drifting list exists.
 */
export type FaqItem = {
  category: string;
  question: string;
  answer: string;
  derive?: 'payment' | 'shipping';
};

export const faq = {
  metaTitle: '常見問題',
  metaDescription: '購物、配送、付款與商品使用的常見問題整理。',
  hero: {
    eyebrow: 'FAQ',
    title: '常見問題',
    lead: '整理最常被問到的問題；若仍有疑問，歡迎直接與我們聯絡。'
  },
  ctaCopy: '找不到您的問題？',
  ctaLabel: '聯絡我們',
  ctaHref: '/#contact',
  /*
   * Five questions, all authored, in the comp's order. The payment and shipping DERIVED answers are
   * not asked here: this merchant sells nothing online and declares no payment
   * or shipping methods, so both derives return null and would drop their
   * question anyway (HomeLanding's DERIVE_ANSWER). 訂單多久會出貨 is a lead-time
   * question, not the list of carriers the shipping derive projects.
   */
  items: [
    {
      category: '商品問題',
      question: '這些產品是否適用於所有車款？',
      answer: '適用於一般轎車、休旅車與機車的烤漆、玻璃與內裝。消光漆、改色膜或特殊材質請先於不顯眼處小面積測試，或透過 LINE 詢問適用性。'
    },
    {
      category: '商品問題',
      question: '鍍膜噴霧可以維持多久？',
      answer: '依使用環境與洗車頻率不同，一般約可維持 1–2 個月；搭配中性洗車精定期清潔，可延長撥水與光澤效果。'
    },
    {
      category: '訂購與出貨',
      question: '下單後多久會出貨？',
      answer: '本站不提供線上結帳。透過 LINE 詢問確認品項與規格後，現貨商品一般於 1–2 個工作天內出貨；缺貨品項會另行告知時程。'
    },
    {
      category: '商品問題',
      question: '產品是否安全？會不會傷車漆或內裝？',
      answer: '洗車精為中性配方，依標示稀釋與使用不會傷害車漆與鍍膜。請避免在烈日或高溫車身上施作，並依各產品說明使用。'
    },
    {
      category: '售後服務',
      question: '如果不確定該買哪個產品，可以怎麼選擇？',
      answer: '點選「立即詢問」透過 LINE 告訴我們車款、車色與想解決的問題，我們會建議適合的用品組合；第一次入門也可以直接選擇頂級護理套組。'
    }
  ] as FaqItem[]
};

export const notFound = {
  metaDescription: `${identity.name} 找不到頁面`,
  eyebrow: '404',
  title: '找不到頁面',
  /** Renders `white-space: pre-line`, so a line break here is a line break. */
  lead: `你開啟的頁面不存在或已被移動。
下面是幾個還在的入口。`,
  /** The hero runs dark over this image, so pick one that can carry white type. */
  heroImage: '/assets/home/hero-v1.jpg',
  heroImageAlt: '找不到頁面',
  ctaLabel: '回到首頁',
  secondaryCtaLabel: '瀏覽商品',
  secondaryCtaHref: '/#catalogue',
  /** The recommendation row. Products come from the commerce API. */
  recommendTitle: '為你推薦',
  quickLinksTitle: '快速連結',
  /**
   * Every entry runs through `visibleLinks`, so an entry whose route this build
   * did not produce removes itself. `icon` is optional — see IconLink.
   */
  quickLinks: [
    { label: '回到首頁', href: '/' },
    { label: '精選商品', href: '/#catalogue' },
    { label: '常見問題', href: '/#faq' },
    { label: '聯絡我們', href: '/#contact' }
  ] as IconLink[]
};

export const blog = {
  metaTitle: '專欄',
  metaDescription: `${identity.name} 專欄文章`,
  /** Small letterspaced line above the list and each article header. */
  eyebrow: `${identity.name} Journal`,
  /** Byline when the API returns no author. */
  authorFallback: `${identity.name} 編輯室`,
  /** Category chip when an article carries no tag. */
  categoryFallback: `${identity.name} Journal`,
  /** Names the ItemList JSON-LD emits, and the breadcrumb's second crumb. */
  itemListName: '專欄'
};

export const member = {
  loginMetaDescription: `${identity.name} 會員中心`,
  /** The last crumb on the login page. */
  breadcrumbLabel: '登入／註冊',
  loginTitle: '會員登入 / 註冊',
  loginLead: '使用 LINE 一鍵登入，首次登入將自動為您建立會員',
  loginButton: '使用 LINE 登入',
  /** What the shop does NOT take. Reassurance belongs beside the button. */
  loginPrivacy: '我們不會取得您的好友名單，也不會在 LINE 上公開任何資訊',
  /** Shown under the divider. The policy links are added by the page. */
  loginConsent: '繼續即表示您同意',
  /**
   * The panel beside the button. A login screen with nothing but a button on
   * it looks like an auth provider's page rather than this shop's, so the
   * second column carries the imagery and one line of the brand's own voice.
   */
  loginAside: {
    /* The login page's OWN image, not a borrowed home-page scene. It used to
       point at /assets/home/scene-01.svg, so a shop that replaced its home
       scenes shipped a placeholder on the one page every returning customer
       sees — and nothing said so, because the file it named still existed. */
    image: '/assets/login/aside.svg',
    imageAlt: '品牌情境圖',
    tagline: '這句 tagline 來自 brand/copy.ts，替換成你的品牌主張。'
  },
  accountMetaDescription: `${identity.name} 會員中心`,
  /** The dark band at the top of the member area. */
  accountHero: {
    title: '會員專區',
    lead: '這句話來自 brand/copy.ts，替換成你要對會員說的一句話。'
  },
  /** `{name}` is replaced with the member's display name. */
  accountWelcome: {
    greeting: '親愛的 {name}，歡迎回來！',
    lead: '感謝您一直以來的支持。'
  },
  /** `{url}` is replaced with the member's referral link. */
  referralShareText: `我在 ${identity.name} 挑了好東西，用我的邀請連結首購我們都能拿點數 👉 {url}`
};

export const cart = {
  metaDescription: `${identity.name} 購物車`,
  emptyEyebrow: 'Empty Cart',
  emptyTitle: '購物車是空的',
  emptyLead: '先去逛逛喜歡的商品，把它們加入購物車吧。',
  emptyCtaLabel: '繼續購物'
};

/**
 * Checkout and the order result.
 *
 * Field labels — 商品小計, 運費, 數量, 收件人資訊 — are NOT here: they are the
 * generic chrome every shop shares, and moving them would make brand/ a second
 * copy of the markup. What IS here is everything said in the shop's own voice:
 * the reassurance beside the pay button, and the three things it can tell a
 * customer once the order exists.
 */
export const checkout = {
  metaDescription: `${identity.name} 結帳`,
  completeMetaDescription: `${identity.name} 訂單完成`,
  gateTitle: '請先登入會員以完成結帳',
  memberGateLead: `${identity.name} 結帳採會員制，登入後即可填寫收件與付款資訊，並查詢訂單。`,
  /** Beside the pay button. Says what the shop does with a card number. */
  secureNote: {
    title: '交易安全加密處理',
    text: '您的付款資訊將受到最高等級的安全保護'
  },
  /**
   * The three outcomes /checkout/complete can be in. Which one shows is decided
   * by the ORDER (checkout.ts → deriveOrderState), never by this file — these
   * are only the words each outcome is announced in.
   */
  result: {
    paidTitle: '付款成功 / 訂單已成立',
    paidLead: '感謝您的訂購！我們已收到您的訂單，並將盡快為您處理。',
    pendingTitle: '付款待確認',
    pendingLead: '已為您保留訂單，完成繳費後系統會自動為您入帳。',
    failedTitle: '付款失敗',
    failedLead: '這筆訂單尚未完成付款。您可以重新下單，或與我們聯繫協助處理。',
    /** Shown on a placed COD order, where nothing was paid online. */
    codNote: '本筆為貨到付款，出貨後請於收件時將款項交給配送人員。'
  }
};

export const referral = {
  metaTitle: `歡迎來到 ${identity.name}`,
  metaDescription: '好友邀請連結',
  landingLine: `正在為您開啟 ${identity.name}…`
};

export const copy = {
  navigation,
  footerGroups,
  home,
  trust,
  about,
  products,
  contact,
  faq,
  notFound,
  blog,
  member,
  cart,
  checkout,
  referral
};
