/**
 * The DOM the client scripts reach for, declared.
 *
 * ## Why this exists now and did not before
 *
 * Until the lock split in two, every page a script touched was byte-for-byte
 * the template's, so "does /checkout still have `[data-confirm]`?" had a
 * trivial answer: yes, or `audit:template` would already have failed. The
 * question was not worth asking because nothing could make it interesting.
 *
 * Presentation files can now be unlocked (see `brand/unlock.ts`), and the first
 * thing a shop does with a page it has taken over is redraw it. Everything
 * `src/scripts/` binds to lives in that markup — 3,300 lines of cart, checkout
 * and member-area logic reaching into pages a designer is now free to rebuild.
 * A redraw that drops `[data-confirm]` does not fail a build, does not throw in
 * the console and does not look wrong. It produces a checkout whose pay button
 * is inert.
 *
 * That failure is unusually expensive here, for a reason worth writing down:
 * across the four storefronts with data in the merchant database there are 35
 * cart rows, 0 orders and 0 customers. The template's checkout and login have
 * never carried a single order end to end. There is no traffic that would
 * notice a broken one, no support queue, no revenue graph with a dip in it.
 * This declaration and the test that reads it are the whole of the alarm.
 *
 * ## What is declared, and what is not
 *
 * `CONTRACT` lists, per script and per page, the selectors that must be present
 * in the SERVER-RENDERED HTML — the ones a page author can delete. Each carries
 * the line in `src/scripts/` that reaches for it, so the claim is checkable
 * rather than asserted.
 *
 * `RUNTIME` lists the selectors a script only ever queries inside markup it
 * built itself. They are just as load-bearing and completely uninteresting to a
 * page author: no redraw can remove them, because they do not exist until the
 * script writes them. Asserting them against a built page would fail on the
 * template's own output.
 *
 * `OPTIONAL` is a hook the template deliberately does not render and the script
 * writes to only if it finds one. `DEAD` is a binding to markup that exists
 * nowhere at all. `TEMPLATED` is a selector built from a variable, listed with
 * the expansions it can take.
 *
 * Having somewhere to put the last three is the point of doing this by hand
 * rather than by grep. Two of them were found by the checking, not before it:
 * `[data-clear-cart]` binds a handler no page has ever rendered, and
 * `[data-promo-chip-amount]` is read on a page that removed the element on
 * purpose.
 *
 * Every selector-shaped literal in the four scripts must land in exactly one of
 * the five — `tests/dom-contract.test.mjs` re-extracts them and fails on any
 * that does not. So this list cannot quietly fall behind the code: adding a
 * selector to a script forces a decision about which kind it is, in review,
 * beside the line that added it.
 *
 * The extractor at the bottom is a scanner, and it was NOT trusted on its own.
 * Every entry below was read back against the component or route that renders
 * it and against the built HTML before it was written down. Three groups here
 * are conditional precisely because that pass found them absent from the
 * template's own default build.
 */

/** The scripts whose bindings are declared. Order is report order. */
export const SCRIPTS = ['cart', 'checkout', 'auth', 'account'];

/**
 * One group per script and page.
 *
 * The brief asked for one group per script; `cart.ts` gets four, because it
 * binds on four different pages and collapsing them would mean asserting the
 * product page's selectors against the cart page. `page` is the built path;
 * `gate` (optional) is a selector whose absence means the group does not apply
 * to this build.
 */
export const CONTRACT = [
  {
    script: 'cart',
    page: '/',
    what: 'the header badge, on every page BaseLayout renders',
    selectors: [{ sel: '[data-cart-count]', at: 'cart.ts:244,253' }],
  },

  {
    script: 'cart',
    page: '/products/*/',
    what: 'the add-to-cart control and the payload it carries',
    /* The payload attributes are why this group is more than the six obvious
       hooks. `data-unit-price` and its siblings are read straight off the button
       (cart.ts:496-500) and posted as the cart line; a redraw that keeps
       `[data-add-to-cart]` and drops `data-product-handle` produces a cart whose
       rows link nowhere, and one that drops `data-unit-price` produces lines
       priced at zero. Nothing else checks them. */
    selectors: [
      { sel: '[data-add-to-cart]', at: 'cart.ts:299' },
      { sel: '[data-cart-scope]', at: 'cart.ts:310' },
      { sel: '[data-qty-value]', at: 'cart.ts:313' },
      { sel: '[data-qty-dec]', at: 'cart.ts:318' },
      { sel: '[data-qty-inc]', at: 'cart.ts:319' },
      { sel: '[data-variant-option]', at: 'cart.ts:323' },
      { sel: '[data-buy-now]', at: 'cart.ts:325' },
      { sel: '[data-variant-price]', at: 'cart.ts:349' },
      { sel: '[data-variant-id]', at: 'cart.ts:339,357' },
      { sel: '[data-price]', at: 'cart.ts:352' },
      { sel: '[data-product-id]', at: 'cart.ts:419,496' },
      { sel: '[data-product-title]', at: 'cart.ts:417,497' },
      { sel: '[data-product-handle]', at: 'cart.ts:498' },
      { sel: '[data-product-image]', at: 'cart.ts:499' },
      { sel: '[data-unit-price]', at: 'cart.ts:500' },
    ],
  },

  {
    script: 'cart',
    page: '/cart/',
    what: 'the cart page: view states, the row template, the order summary',
    gate: '[data-cart-page]',
    /* Gated because a one-page shop runs `flags.cartPage: false` and has no
       /cart route at all. The gate is the page's own root: present means this
       build has a cart page, and then all of it has to be there. */
    selectors: [
      { sel: '[data-cart-page]', at: 'cart.ts:764' },
      { sel: '[data-cart-title-count]', at: 'cart.ts:247' },
      { sel: '[data-cart-loading]', at: 'cart.ts:766' },
      { sel: '[data-cart-empty]', at: 'cart.ts:767' },
      { sel: '[data-cart-grid]', at: 'cart.ts:768' },
      { sel: '[data-cart-list]', at: 'cart.ts:769' },
      { sel: '#cart-row-tpl', at: 'cart.ts:770' },
      { sel: '[data-cart-row]', at: 'cart.ts:861' },
      { sel: '[data-action]', at: 'cart.ts:859,873' },
      { sel: '[data-field="image"]', at: 'cart.ts:806' },
      { sel: '[data-field="name"]', at: 'cart.ts:826' },
      { sel: '[data-field="quantity"]', at: 'cart.ts:827,867' },
      { sel: '[data-field="unit_price"]', at: 'cart.ts:828' },
      { sel: '[data-field="line_subtotal"]', at: 'cart.ts:829' },
      { sel: '[data-field="product_link"]', at: 'cart.ts:823' },
      { sel: '[data-cart-summary]', at: 'cart.ts:724' },
      { sel: '[data-field="items_total"]', at: 'cart.ts:730' },
      { sel: '[data-field="shipping"]', at: 'cart.ts:731' },
      { sel: '[data-field="discount"]', at: 'cart.ts:732' },
      { sel: '[data-field="grand"]', at: 'cart.ts:733' },
      { sel: '[data-summary-list]', at: 'cart.ts:735' },
      { sel: '[data-summary-line]', at: 'cart.ts:736' },
      { sel: '[data-field="line-name"]', at: 'cart.ts:741' },
      { sel: '[data-field="line-subtotal"]', at: 'cart.ts:742' },
      { sel: '[data-cart-summary] a[href="/checkout"]', at: 'cart.ts:754' },
    ],
  },

  {
    script: 'cart',
    page: '/',
    what: 'the slide-out drawer, in shops that use it instead of a cart page',
    gate: '[data-cart-drawer]',
    /* BaseLayout renders the drawer only when `flags.commerce && !flags.cartPage`,
       and the template's own default has a cart page — so this group is skipped
       in the template's build and asserted in every shop that turns the drawer
       on. The gate is not a softening: without it the template could not be
       green, and a check that cannot be green in the repository that owns it
       gets switched off within a month. */
    selectors: [
      { sel: '[data-cart-drawer]', at: 'cart.ts:437,514' },
      { sel: '[data-cart-panel]', at: 'cart.ts:523' },
      { sel: '[data-cart-loading]', at: 'cart.ts:544' },
      { sel: '[data-cart-empty]', at: 'cart.ts:545' },
      { sel: '[data-cart-items]', at: 'cart.ts:546' },
      { sel: '[data-cart-foot]', at: 'cart.ts:547' },
      { sel: '[data-cart-error]', at: 'cart.ts:548' },
      { sel: '[data-cart-list]', at: 'cart.ts:596' },
      { sel: '#cart-drawer-row', at: 'cart.ts:597' },
      { sel: '[data-cart-row]', at: 'cart.ts:685' },
      { sel: '[data-action]', at: 'cart.ts:683,695' },
      { sel: '[data-cart-subtotal]', at: 'cart.ts:636' },
      { sel: '[data-cart-open]', at: 'cart.ts:662' },
      { sel: '[data-cart-close]', at: 'cart.ts:669' },
      { sel: '[data-cart-checkout]', at: 'cart.ts:718' },
      { sel: '[data-field="image"]', at: 'cart.ts:614' },
      { sel: '[data-field="name"]', at: 'cart.ts:630' },
      { sel: '[data-field="unit_price"]', at: 'cart.ts:631' },
      { sel: '[data-field="quantity"]', at: 'cart.ts:632' },
      { sel: '[data-field="line_subtotal"]', at: 'cart.ts:633' },
    ],
  },

  {
    script: 'checkout',
    page: '/checkout/',
    what: 'the checkout form: gate, shipping, payment, invoice, promo, confirm',
    gate: '[data-checkout-page]',
    selectors: [
      { sel: '[data-checkout-page]', at: 'checkout.ts:134' },
      { sel: '[data-checkout-loading]', at: 'checkout.ts:137' },
      { sel: '[data-checkout-form]', at: 'checkout.ts:138' },
      { sel: '[data-checkout-empty]', at: 'checkout.ts:139' },
      { sel: '[data-checkout-gate]', at: 'checkout.ts:140' },
      { sel: '[data-checkout-error]', at: 'checkout.ts:141' },
      { sel: '[data-checkout-login]', at: 'checkout.ts:159' },
      { sel: '[data-free-threshold]', at: 'checkout.ts:197' },
      { sel: 'input[name="shipping"]', at: 'checkout.ts:202,463,679,878' },
      { sel: '[data-fee]', at: 'checkout.ts:205' },
      { sel: 'input[name="payment"]', at: 'checkout.ts:644,882' },
      { sel: '[data-summary-list]', at: 'checkout.ts:265,1018' },
      { sel: '[data-promo-input-row]', at: 'checkout.ts:342' },
      { sel: '[data-promo-input]', at: 'checkout.ts:343' },
      { sel: '[data-promo-apply]', at: 'checkout.ts:344' },
      { sel: '[data-promo-chip]', at: 'checkout.ts:345' },
      { sel: '[data-promo-chip-code]', at: 'checkout.ts:346' },
      { sel: '[data-promo-remove]', at: 'checkout.ts:348' },
      { sel: '[data-promo-error]', at: 'checkout.ts:349' },
      { sel: '[data-cvs-box]', at: 'checkout.ts:456' },
      { sel: '[data-home-box]', at: 'checkout.ts:457' },
      { sel: '[data-cvs-error]', at: 'checkout.ts:458' },
      { sel: '[data-cvs-selected]', at: 'checkout.ts:459' },
      { sel: '[data-cvs-pick]', at: 'checkout.ts:460' },
      { sel: '[data-cvs-store-name]', at: 'checkout.ts:481' },
      { sel: '[data-cvs-store-meta]', at: 'checkout.ts:482' },
      { sel: '[data-invoice-type]', at: 'checkout.ts:673,921' },
      { sel: '[data-invoice-carrier]', at: 'checkout.ts:925,982' },
      { sel: '[data-invoice-carrier-label]', at: 'checkout.ts:983' },
      { sel: '[data-invoice-buyer-id]', at: 'checkout.ts:947,994' },
      { sel: '[data-invoice-buyer-name]', at: 'checkout.ts:948,995' },
      { sel: '[data-invoice-donation]', at: 'checkout.ts:955,996' },
      { sel: '[data-ci-name]', at: 'checkout.ts:868' },
      { sel: '[data-ci-phone]', at: 'checkout.ts:869' },
      { sel: '[data-ci-email]', at: 'checkout.ts:870' },
      { sel: '[data-invoice-field="member"]', at: 'checkout.ts:968' },
      { sel: '[data-invoice-field="carrier"]', at: 'checkout.ts:969' },
      { sel: '[data-invoice-field="company"]', at: 'checkout.ts:970' },
      { sel: '[data-invoice-field="donation"]', at: 'checkout.ts:971' },
      { sel: '[data-addr-city]', at: 'checkout.ts:838' },
      { sel: '[data-addr-district]', at: 'checkout.ts:839' },
      { sel: '[data-addr-line]', at: 'checkout.ts:840' },
      { sel: '[data-addr-postal]', at: 'checkout.ts:841' },
      { sel: '[data-field-items-total]', at: 'checkout.ts:1118' },
      { sel: '[data-field-shipping]', at: 'checkout.ts:1119' },
      { sel: '[data-field-grand]', at: 'checkout.ts:1120' },
      { sel: '[data-field-discount]', at: 'checkout.ts:1130' },
      { sel: '[data-discount-label]', at: 'checkout.ts:1131' },
      { sel: '[data-discount-row]', at: 'checkout.ts:1126' },
      { sel: '[data-confirm]', at: 'checkout.ts:693' },
    ],
  },

  {
    script: 'checkout',
    page: '/checkout/complete/',
    what: 'the order-confirmation page and its payment-instruction box',
    gate: '[data-complete-page]',
    selectors: [
      { sel: '[data-complete-page]', at: 'checkout.ts:1159' },
      { sel: '[data-complete-loading]', at: 'checkout.ts:1161' },
      { sel: '[data-complete-error]', at: 'checkout.ts:1162' },
      { sel: '[data-complete-content]', at: 'checkout.ts:1163' },
      { sel: '[data-o-state]', at: 'checkout.ts:1267' },
      { sel: '[data-o-cod-note]', at: 'checkout.ts:1269' },
      { sel: '[data-o-number]', at: 'checkout.ts:1271' },
      { sel: '[data-o-date]', at: 'checkout.ts:1272' },
      { sel: '[data-o-status]', at: 'checkout.ts:1273' },
      { sel: '[data-o-payment]', at: 'checkout.ts:1275' },
      { sel: '[data-o-pay-amount]', at: 'checkout.ts:1276' },
      { sel: '[data-o-pay-status]', at: 'checkout.ts:1278' },
      { sel: '[data-o-paid-at-row]', at: 'checkout.ts:1279' },
      { sel: '[data-o-paid-at]', at: 'checkout.ts:1280' },
      { sel: '[data-o-recipient]', at: 'checkout.ts:1286' },
      { sel: '[data-o-recipient-phone]', at: 'checkout.ts:1287' },
      { sel: '[data-o-shipping]', at: 'checkout.ts:1292' },
      { sel: '[data-o-address]', at: 'checkout.ts:1296' },
      { sel: '[data-o-items]', at: 'checkout.ts:1298' },
      { sel: '[data-o-items-total]', at: 'checkout.ts:1305' },
      { sel: '[data-o-shipping-fee]', at: 'checkout.ts:1306' },
      { sel: '[data-o-discount-row]', at: 'checkout.ts:1307' },
      { sel: '[data-o-discount]', at: 'checkout.ts:1308' },
      { sel: '[data-o-grand]', at: 'checkout.ts:1309' },
      { sel: '[data-o-payinfo]', at: 'checkout.ts:1366' },
      { sel: '[data-o-payinfo-rows]', at: 'checkout.ts:1368' },
      { sel: '[data-o-payinfo-title]', at: 'checkout.ts:1369' },
      { sel: '[data-o-payinfo-expire]', at: 'checkout.ts:1370' },
    ],
  },

  {
    script: 'auth',
    page: null,
    what: 'nothing - auth.ts touches no DOM',
    /* Not an omission and not a stub. auth.ts is tokens, session ids and fetch
       wrappers; the login and callback pages call into it, it never reaches back
       out. Declared empty so the coverage check has a group to fail into the day
       somebody gives it a button. */
    selectors: [],
  },

  {
    script: 'account',
    page: '/account/',
    what: 'the member area: orders, profile, referral card, address book',
    gate: '[data-account-page]',
    selectors: [
      { sel: '[data-account-page]', at: 'account.ts:104' },
      { sel: '[data-account-loading]', at: 'account.ts:113' },
      { sel: '[data-account-error]', at: 'account.ts:114' },
      { sel: '[data-account-content]', at: 'account.ts:115' },
      { sel: '[data-order-list]', at: 'account.ts:116' },
      { sel: '[data-orders-empty]', at: 'account.ts:117' },
      { sel: '[data-orders-count]', at: 'account.ts:118' },
      { sel: '[data-logout]', at: 'account.ts:139' },
      { sel: '[data-filter]', at: 'account.ts:181,184,186' },
      { sel: '[data-side-link]', at: 'account.ts:496,501,508' },
      { sel: '[data-referral-card]', at: 'account.ts:243' },
      { sel: '[data-ref-code]', at: 'account.ts:250' },
      { sel: '[data-ref-sub]', at: 'account.ts:252' },
      { sel: '[data-ref-orders]', at: 'account.ts:256' },
      { sel: '[data-ref-earned]', at: 'account.ts:258' },
      { sel: '[data-ref-pending]', at: 'account.ts:260' },
      { sel: '[data-ref-copy]', at: 'account.ts:266' },
      { sel: '[data-ref-line]', at: 'account.ts:278' },
      { sel: '[data-m-name]', at: 'account.ts:292' },
      { sel: '[data-m-avatar]', at: 'account.ts:298' },
      { sel: '[data-m-join]', at: 'account.ts:319' },
      { sel: '[data-m-greeting]', at: 'account.ts:327' },
      { sel: '[data-p-name]', at: 'account.ts:340' },
      { sel: '[data-p-email]', at: 'account.ts:341' },
      { sel: '[data-p-phone]', at: 'account.ts:342' },
      { sel: '[data-p-joined]', at: 'account.ts:343' },
      { sel: '[data-p-birth-row]', at: 'account.ts:344' },
      { sel: '[data-p-birth]', at: 'account.ts:346' },
      { sel: '#addresses', at: 'account.ts:552' },
      { sel: '[data-addr-list]', at: 'account.ts:555' },
      { sel: '[data-addr-empty]', at: 'account.ts:556' },
      { sel: '[data-addr-error]', at: 'account.ts:557' },
      { sel: '[data-addr-new]', at: 'account.ts:558' },
      { sel: '[data-addr-form]', at: 'account.ts:559' },
      { sel: '[data-af-error]', at: 'account.ts:560' },
      { sel: '[data-af-save]', at: 'account.ts:561' },
      { sel: '[data-af-cancel]', at: 'account.ts:655' },
      /* The one address form, reused for create and edit. `[data-addr-id]` is
         the hidden input that decides which of the two a submit is; a redraw
         that drops it turns every edit into a new address. */
      { sel: '[data-addr-id]', at: 'account.ts:565' },
      { sel: '[data-af-label]', at: 'account.ts:567' },
      { sel: '[data-af-recipient]', at: 'account.ts:568' },
      { sel: '[data-af-phone]', at: 'account.ts:569' },
      { sel: '[data-af-zip]', at: 'account.ts:570' },
      { sel: '[data-af-city]', at: 'account.ts:571' },
      { sel: '[data-af-district]', at: 'account.ts:572' },
      { sel: '[data-af-address]', at: 'account.ts:573' },
      { sel: '[data-af-default]', at: 'account.ts:574' },
    ],
  },
];

/**
 * Selectors a script only ever queries inside markup it wrote itself.
 *
 * Nothing a page author can do reaches these, which is exactly why they are
 * listed rather than dropped: "not in the contract" and "nobody has looked at
 * this one" have to be different states, or the coverage check below degenerates
 * into a list of everything.
 */
export const RUNTIME = {
  cart: [
    {
      sel: '[data-cart-bound]',
      at: 'cart.ts:301,657',
      why: 'written by the script to mark a node it has already wired',
    },
    {
      sel: '[data-line-id]',
      at: 'cart.ts:613,686,805,862',
      why: 'set on each cloned row from the cart payload',
    },
  ],
  checkout: [
    {
      sel: '[data-line-id]',
      at: 'checkout.ts:280,1027',
      why: 'set on each summary row renderSummary() builds with createElement',
    },
    {
      sel: '[data-step]',
      at: 'checkout.ts:276,285,293,301',
      why: 'the stepper buttons renderSummary() creates',
    },
    {
      sel: '[data-remove]',
      at: 'checkout.ts:276,285,292,298',
      why: 'the remove button renderSummary() creates',
    },
    {
      sel: '[data-qty]',
      at: 'checkout.ts:290,300',
      why: 'the quantity readout inside a runtime-built summary row',
    },
  ],
  auth: [],
  account: [],
};

/**
 * Bindings to markup that exists nowhere.
 *
 * Found by reading the extraction back against the routes, which is the pass
 * the header note insists on. Kept rather than deleted: removing the handler is
 * a change to core cart code and belongs in its own commit with its own
 * reasoning, and until then a reader of this list should know the line is there
 * and does nothing.
 */
export const DEAD = [
  {
    script: 'cart',
    sel: '[data-clear-cart]',
    at: 'cart.ts:893',
    why: 'no route or component in this repository renders it; the handler never binds',
  },
];

/**
 * Hooks the template DELIBERATELY does not render, and the script writes to
 * only if it finds them.
 *
 * This category was not planned. It came out of running the presence check for
 * the first time: `[data-promo-chip-amount]` is read at checkout.ts:347 and the
 * checkout page does not render it, on purpose — the discount is already shown
 * on the summary's discount row, so the chip was slimmed to the code alone and
 * the write was left guarded. The markup says so, in a comment, at
 * `src/routes/checkout/index.astro:231`.
 *
 * It is a real state and it needs a name, but it is also the obvious place to
 * dump a hook to make this test green. So an entry must name the GUARD — the
 * expression in the script that tolerates the absence — and
 * `tests/dom-contract.test.mjs` checks that the guard is really there. A hook
 * with no guard in the source cannot be filed here, whatever anybody writes in
 * `why`.
 */
export const OPTIONAL = [
  {
    script: 'checkout',
    sel: '[data-promo-chip-amount]',
    at: 'checkout.ts:347',
    guard: 'if (promoChipAmount)',
    why: 'chip-slim-v1: the promo chip carries the code only, the amount shows on the discount row',
  },
];

/**
 * Selectors a script BUILDS, so the extractor can only ever see the shape.
 *
 * Listing the expansions is the whole value: the four field names below are
 * ordinary markup hooks on the cart page, and reading `[data-field="${f}"]` in
 * cart.ts tells a page author nothing about which four they must keep. They are
 * declared individually in the `/cart/` group above and asserted there; this
 * entry exists so the coverage check can account for the shape itself, and so
 * the link between the two is written down rather than inferred.
 */
export const TEMPLATED = [
  {
    script: 'cart',
    sel: '[data-field="${f}"]',
    at: 'cart.ts:727',
    expands: [
      '[data-field="items_total"]',
      '[data-field="shipping"]',
      '[data-field="discount"]',
      '[data-field="grand"]',
    ],
    why: 'populateSummary() interpolates the four order-summary field names (cart.ts:730-733)',
  },
];

/* ────────────────────────────────────────────────────────────────────────── */

const QUOTES = new Set(["'", '"', '`']);
const BACKSLASH = String.fromCharCode(92);
const NEWLINE = String.fromCharCode(10);

/**
 * Every string literal in `source`, with its line number, comments skipped.
 *
 * A scanner and not a regex, for the reason `scripts/brand-facts.mjs` gives at
 * length: a regex over source has no idea it is inside a comment, and these four
 * scripts are heavily commented in exactly the vocabulary it would be hunting.
 */
export function stringLiterals(source) {
  const out = [];
  let i = 0;
  let line = 1;
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];

    if (c === NEWLINE) {
      line += 1;
      i += 1;
      continue;
    }
    if (c === '/' && next === '/') {
      const end = source.indexOf(NEWLINE, i);
      if (end === -1) break;
      i = end;
      continue;
    }
    if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      if (end === -1) break;
      for (let j = i; j < end; j += 1) if (source[j] === NEWLINE) line += 1;
      i = end + 2;
      continue;
    }
    if (QUOTES.has(c)) {
      const startLine = line;
      let value = '';
      i += 1;
      while (i < source.length && source[i] !== c) {
        if (source[i] === BACKSLASH) {
          value += source[i + 1] ?? '';
          i += 2;
          continue;
        }
        if (source[i] === NEWLINE) line += 1;
        value += source[i];
        i += 1;
      }
      i += 1;
      out.push({ value, line: startLine, template: c === '`' });
      continue;
    }
    i += 1;
  }
  return out;
}

/** Does this literal look like something handed to querySelector? */
export function looksLikeSelector(value) {
  const v = value.trim();
  if (!v) return false;
  if (v.startsWith('[') || v.startsWith('#')) return true;
  return /^[a-z][\w-]*\[/.test(v);
}

/**
 * Every selector-shaped literal in one script, normalised.
 *
 * A comma-separated list is split: `"[data-step], [data-remove]"` is two
 * bindings and a page author can drop either one. A template literal keeps its
 * placeholder and is reported as it stands; the only ones in these four scripts
 * are `[data-field="${f}"]`, whose expansions are declared by hand above.
 */
export function extractSelectors(source) {
  const out = [];
  for (const literal of stringLiterals(source)) {
    if (!looksLikeSelector(literal.value)) continue;
    for (const part of literal.value.split(',')) {
      const sel = stripPseudo(part);
      if (sel) out.push({ sel, line: literal.line, template: literal.template });
    }
  }
  return out;
}

/**
 * Pseudo-classes off, everywhere the same way.
 *
 * `input[name="shipping"]` and `input[name="shipping"]:checked` are one hook and
 * one declaration. The state half is about which radio a reader picked, which is
 * not a fact about the markup and not something a redraw can take away.
 */
export function stripPseudo(selector) {
  return selector.replace(/:{1,2}[\w-]+(\([^)]*\))?/g, '').trim();
}

/**
 * Attribute reads — `getAttribute("data-fee")` — as the selector they imply.
 *
 * Reads only. `setAttribute` is the script WRITING a hook onto a node it has
 * built, which is a fact about the script and not a requirement on any page.
 */
export function extractAttributeReads(source) {
  const out = [];
  const re = /\b(?:get|has)Attribute\(\s*['"](data-[\w-]+)['"]/g;
  let match;
  while ((match = re.exec(source)) !== null) {
    out.push({
      sel: `[${match[1]}]`,
      line: source.slice(0, match.index).split(NEWLINE).length,
    });
  }
  return out;
}

/** Everything declared for one script, in any of the three categories. */
export function declaredFor(script) {
  const out = new Set();
  for (const group of CONTRACT) {
    if (group.script !== script) continue;
    for (const entry of group.selectors) {
      out.add(entry.sel);
      /* A descendant selector accounts for its own parts too: the extractor sees
         `[data-cart-summary] a[href="/checkout"]` as one string, and a reader
         looking up `[data-cart-summary]` should find it either way. */
      for (const part of entry.sel.split(/\s+/)) out.add(part);
    }
  }
  for (const entry of RUNTIME[script] ?? []) out.add(entry.sel);
  for (const entry of DEAD) if (entry.script === script) out.add(entry.sel);
  for (const entry of OPTIONAL) if (entry.script === script) out.add(entry.sel);
  for (const entry of TEMPLATED) if (entry.script === script) out.add(entry.sel);
  return out;
}

/* ────────────────────────────────────────────────────────────────────────── */

const escapeRe = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * One simple selector as a regex over raw HTML.
 *
 * Every condition is a lookahead inside the SAME tag, so `input[name="shipping"]`
 * asks for one `<input>` carrying that name rather than for an input somewhere
 * and the word "shipping" somewhere else.
 *
 * A bare attribute has to be followed by a delimiter: `data-qty` must not be
 * satisfied by `data-qty-value`, which is a different hook on a different
 * element, and the product page carries both.
 */
function simpleSelectorRegex(simple) {
  const tagMatch = /^[a-zA-Z][\w-]*/.exec(simple);
  const tag = tagMatch ? escapeRe(tagMatch[0]) : '[a-zA-Z][\\w-]*';
  let rest = simple.slice(tagMatch ? tagMatch[0].length : 0);

  const conditions = [];
  const attr = (name, value) =>
    value === undefined
      ? `\\s${escapeRe(name)}(?=[\\s=>/])`
      : `\\s${escapeRe(name)}\\s*=\\s*"${escapeRe(value)}"`;

  rest = rest.replace(/#([\w-]+)/g, (_, id) => {
    conditions.push(attr('id', id));
    return '';
  });
  rest = rest.replace(/\[([\w-]+)(?:\s*=\s*"([^"]*)"|\s*=\s*'([^']*)')?\]/g, (_, name, dq, sq) => {
    conditions.push(attr(name, dq ?? sq));
    return '';
  });
  /* Pseudo-classes describe STATE, not markup: `:checked` is a radio the reader
     picked and `:not(:disabled)` is one the script has not switched off. A page
     that renders the element satisfies the contract either way. */
  rest = rest.replace(/:{1,2}[\w-]+(\([^)]*\))?/g, '');

  if (rest.trim()) return null; // a shape this checker cannot honestly test
  const lookaheads = conditions.map((c) => `(?=[^>]*${c})`).join('');
  return new RegExp(`<${tag}\\b${lookaheads}`, 'i');
}

/**
 * Is `selector` present in this page's HTML?
 *
 * A descendant combinator is checked as "every part appears", not as a real
 * ancestor walk — this reads text, not a DOM. That is enough for the job: the
 * failure being guarded against is a hook DELETED in a redraw, and a deleted
 * hook is absent under either reading.
 */
export function selectorPresent(html, selector) {
  return selector
    .split(/\s+/)
    .filter(Boolean)
    .every((simple) => {
      const re = simpleSelectorRegex(simple);
      if (re === null) {
        throw new Error(
          `dom-contract: "${simple}" is not a selector this checker can test. ` +
            'Keep declared selectors to tags, ids, attributes and pseudo-classes.'
        );
      }
      return re.test(html);
    });
}
