# commerce-storefront-template

A brand-agnostic Astro storefront for the Astrapath commerce API. Static output,
Cloudflare Pages deployment, LINE login, cart, checkout and a member area.

Opening a new shop means editing `brand/`. `src/` never learns which shop it is
rendering — and that is checked on every `npm test`, not merely intended.

```
brand/          the fill-in layer: everything one shop does not share with another
  identity.ts     name, wordmark, contact, locale, storage namespace, design tokens
  copy.ts         page copy: navigation, home sections, about, contact, FAQ, 404
  legal.ts        the variables the privacy / terms pages interpolate
  commerce.ts     merchant binding, feature flags, and the offline demo catalogue
  assets/         imagery, mirrored into public/ at build time
src/            the storefront. Brand-free by construction.
scripts/        asset sync, the audits, deployment-file generation
tests/          node:test suites for the sanitiser, the toast and the payment list
```

## Template boundary

`src/` is shared with every other storefront in the family — **except the home
page, which belongs to the shop.**

The line runs between *nobody designs this* and *everybody designs this*.
Checkout, the member area, the cart, login and the legal pages are shared
because no one draws a comp for them: five shops running one checkout is five
shops getting the same bug fix, and the sameness costs nothing because none of
them wanted to be different. The home page is the opposite — every shop has a
comp, every comp differs, and differing is the whole job.

| | Files | Rule |
| --- | --- | --- |
| **Template-owned — core** | `src/scripts/`, `src/lib/`, `BaseLayout.astro`, `BeaconBoot.astro`, `scripts/`, `astro.config.ts`, `tsconfig.json`, `.gitignore`, `docs/PITFALLS.md` | Byte-identical, always. Enforced by `npm run audit:template` inside `npm test`. A shop cannot opt out. |
| **Template-owned — presentation** | `src/pages/`, `src/routes/`, `src/components/`, `src/styles/` | Byte-identical **unless** this shop names the file in `brand/unlock.ts`. A named file is reported every run and never enforced. |
| **Shop-owned** | `src/components/home/HomeLanding.astro`, `src/components/home/HomeMultipage.astro`, and all of `brand/` | Change freely. Never checked. |

The two template tiers split by **what a file does**, not by who owns it. Core
is money and membership: an edit there does not travel to the other storefronts,
and what breaks is an order rather than a layout. Presentation is everything a
comp can be drawn of, and a shop that has genuinely drawn its own says so in
`brand/unlock.ts` — one line per file, and checked rather than taken on trust: a
core path, or a path the lock does not have, fails the audit by name.

Unlocking a page means owning its **DOM** as well as its design.
`scripts/dom-contract.mjs` lists every selector the client scripts bind to, and
`tests/dom-contract.test.mjs` fails the build when a redrawn page has dropped
one. Redraw freely; keep the hooks.

The shop-owned list is deliberately short, because the coupling turned out to
be short. `HomeLanding.astro` imports exactly one component (`Button`) and four
`src/lib` modules; it defines every section, card and rule it draws in its own
file, and 69% of it is its own stylesheet. There is no shared "section head" or
"scene card" component — those classes exist nowhere but inside the two home
components. So unlocking two files buys essentially all of the design freedom,
and unlocking more would start splitting things shops genuinely do share.

A home page that wants a different **button** restyles the shared one from its
own scope — `.hero-copy :global(.button)`, a pattern both home components
already use. A home page that wants different **type or spacing** moves the
tokens in `brand/identity.ts`. Neither needs the template.

### The cost, and what is done about it

Unlocking means a fix made to the template's home components **no longer
reaches the shops**. That is the real risk of this line — not the divergence,
but a silent loss of propagation.

So the boundary ships with a report. `template.lock.json` records, for each
shop-owned file, the bytes that shop started from; from the template:

```bash
node scripts/template-report.mjs ../LEMONE ../Pawfect ../NORDIC ../SOMMEIL ../TRAILNEST
```

prints `in step`, `forked` (and the template has not moved, so there is nothing
to take), or **`NEEDS REVIEW`** — the template has moved since that shop forked,
so there may be a fix it is missing, with the diff command to look at it.

It reports rather than merges, and never fails a build. A shop's home page is
its own; the template's newer version is a suggestion, and the only honest
thing a tool can do with a suggestion is show it to someone. What this removes
is the *nobody knew* failure mode.

### Moving the line

**In one shop**, for one presentation file: add the path to `unlocked` in that
shop's `brand/unlock.ts`. Nothing else changes and no other storefront is
touched. The cost is the same one the report above exists for — the template's
later fixes to that file stop arriving — so `audit:template` prints the list on
every run.

**In the template**, for everybody: `UNLOCKED` in `scripts/template-lock.mjs`
hands a file to every shop outright; `CORE` and `PRESENTATION` in the same file
decide which tier a locked path is in. Then run `npm run template:lock` **in the
template** and sync the new `template.lock.json` to the shops — it and
`scripts/` travel together, and a lock without the matching scripts is rejected
rather than guessed at. Running the generator inside a storefront would re-bless
whatever that shop had changed; the lock records the origin URL it was generated
from, so one claiming to come from a storefront repo is visibly wrong in review.

## Quick start

```bash
npm install
npm run dev
```

The template ships with `demo.enabled: true` in `brand/commerce.ts`, so it builds
and runs offline against fixture products and articles. Nothing needs to exist on
the API side to see a working shop.

## Going live

1. **Bind the merchant.** In `brand/commerce.ts` set `merchantCode`, `apiBase`,
   `siteDomain` (the host the API resolves the merchant by — usually the
   `*.pages.dev` deploy host) and `siteOrigin` (the canonical public origin).
   Then set `demo.enabled: false`.

   The build resolves the merchant by domain and asserts the code it gets back
   equals `merchantCode`. Pointing a storefront at the wrong host fails the
   build instead of quietly serving another shop's catalogue.

2. **Fill in the brand.** `identity.ts` first (the wordmark, the palette, the
   storage namespace), then `copy.ts`, then `legal.ts`. Replace the placeholders
   in `brand/assets/` with real artwork — `brand/assets/manifest.json` lists
   every file the build requires and the size each one wants.

   **Every photograph the shop needs, in one list.** Source them in one pass.
   Nothing fails when a placeholder survives — the file exists, so the sync is
   satisfied and the build is green — which is how a shop ends up live with a
   grey box on it. `npm run assets:validate` prints the ones still standing in.

   | File | Size | Where it shows |
   | --- | --- | --- |
   | `home/hero.svg` | 1600x900 | The home hero, desktop. The LCP image. |
   | `home/hero-mobile.svg` | 780x1040 | The home hero, phone portrait crop. A different CROP, not a smaller copy — the desktop composition loses its subject at 3:4. |
   | `home/scene-01…03.svg` | 1400x1050 | The occasion cards. **Three** — the grid is three columns wide, so a fourth entry drops to a second row on its own. **One-page only.** |
   | `login/aside.svg` | 900x1200 | The panel beside the LINE button — portrait. Easy to forget: it is the only photograph on a page nobody designs, and every returning customer sees it. |
   | `products/placeholder-01…08.svg` | 1200x1200 | Only ever a stand-in for a product with no image in the merchant admin. Real product photography belongs in the catalogue, not here. |
   | `home/band.svg` | 1600x620 | The full-bleed band. **Multi-page only.** |
   | `home/highlight.svg` | 1400x1050 | The highlight cards. **Multi-page only.** |
   | `about/hero.svg`, `about/story.svg`, `about/value.svg`, `about/cta.svg` | see manifest | `/about`. **Only when `contentPages` is on.** |
   | `contact/card.svg` | see manifest | `/contact`. **Only when `contentPages` is on.** |
   | `blog/placeholder.svg` | 1200x800 | An article with no cover. **Only when `blog` is on.** |

   And the marks, which are drawn rather than shot: `logo.svg`, `favicon.svg`,
   `og.svg`. `og.svg` only reaches a page when the merchant record's
   `seo_defaults.og_image` points at it — set it there, or the OG card falls
   back to the logo.

   A one-page shop needs the first five rows and the marks. Everything below
   them belongs to a page its flags did not build; drop those entries from
   `manifest.json` rather than shipping placeholders for pages that do not
   exist.

3. **Read the legal pages.** `src/pages/privacy.astro` and `terms.astro` carry
   clause TEXT, not just variables. A clause describes how a business actually
   operates, so read every one and have someone qualified check the result.

   **Rewrite them in `brand/legal.ts`**, under `legal.privacy.clauses` /
   `legal.terms.clauses` — not in `src/pages/`. Those two files are
   template-owned and byte-checked, so editing them turns `audit:template` red
   and the change reaches nobody else. Declaring `clauses` replaces the whole
   document for that page; declaring nothing keeps the template's, which is
   what a shop that trades the way the template assumes should do.

   This matters most for a shop that does **not** sell. A showcase storefront
   shipped `訂單與付款` / `配送` / `退換貨` clauses and a privacy policy
   claiming it collected 訂單資料, because rewriting them was not a thing it
   could legitimately do. `/returns-policy` is the worked example: its entire
   document already comes from `legal.returns`.

4. **Deploy.** Set `deployTarget` in `brand/commerce.ts` FIRST — it decides
   what the build writes, and the two hosts need different files. Then
   `npm run build` produces `dist/` with `_headers`, `_redirects` and
   `robots.txt` generated from `brand/`, plus `wrangler.jsonc` on Workers. See
   **Deploying** below.

## Deploying

Two Cloudflare targets, and they do **not** serve the same `dist/`. Set
`deployTarget` in `brand/commerce.ts` to `'pages'` or `'workers'` — absent
means pages — and `npm run build` writes the deployment files that host needs:

| `deployTarget` | the two 404 rules in `_redirects` | `wrangler.jsonc` |
| --- | --- | --- |
| `pages` (default) | written — Pages serves the custom 404 from them | not written; a stale one is deleted |
| `workers` | not written — Workers **rejects the whole deploy** over them | written, carrying `not_found_handling` |

That table is the whole reason the field exists: one file cannot satisfy both.
Read `docs/PITFALLS.md` #3 before assuming either host's behaviour carries to
the other — and note that getting the field wrong is loud on both sides, because
a pages build has rules `wrangler deploy` refuses and a workers build has no
config for it to read.

### Pages

```bash
npm run build        # with deployTarget: 'pages'
npx wrangler pages deploy dist --project-name=<shop>-storefront --branch=main
```

No config file: everything comes from the command line. The custom 404 page is
served by the two `404` rules at the end of `dist/_redirects` — which work, but
on **undocumented** behaviour. Cloudflare's own docs list 404 among the status
codes `_redirects` does not support.

### Workers

```bash
npm run build        # with deployTarget: 'workers'; also writes wrangler.jsonc
npx wrangler deploy
```

`wrangler.jsonc` is **generated** by `scripts/build-deployment-files.mjs` and
gitignored, like the rest of the deployment files. It is written only when
`deployTarget` is `'workers'`, so its presence is the shop saying which host it
is for. It carries three things:

| Key | Why |
| --- | --- |
| `name` | The Worker's identity in the account. Derived from `identity.storageNamespace` so it is unique per shop by construction — two shops sharing a name do not fail to deploy, they **overwrite each other**. |
| `assets.directory` | `./dist`. |
| `assets.not_found_handling` | `"404-page"`. **Not optional.** |

That last row is the one that bites: without `not_found_handling`, unknown URLs
on Workers return an **empty body** — no custom page, no redirect, nothing.

It is the only thing serving the custom 404 here, because the two `404` rules
Pages relies on are **not in this build's `_redirects` at all**. They cannot be:
Cloudflare refuses the entire upload over them (`code: 100324`), after the
assets have already uploaded and before any Worker is created. Adding them back
by hand to make the file "match" a Pages shop's breaks deployment outright.

An earlier version of this README said those rules were merely *ignored* here.
They are not, and `docs/PITFALLS.md` #3 records both the correction and how the
wrong conclusion was reached — it came from the platform's source and a local
run, neither of which sees the server-side validation that actually rejects it.

### Verifying either one

Check on the production hostname, not the deployment URL, and bypass the cache
— `_headers` gives HTML `s-maxage=600`, so the edge will keep serving the
previous deploy for up to ten minutes and make a broken deploy look fine (or a
fixed one look broken):

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  "https://<shop>.example/?cb=$RANDOM" -H "Cache-Control: no-cache"

# 404 must be the custom page, not merely the right status — a blank body
# returns 404 too.
curl -s "https://<shop>.example/definitely-not-a-page?cb=$RANDOM" \
  -H "Cache-Control: no-cache" | grep -c "找不到頁面"
```

Company facts the merchant record already owns — legal entity, tax id, phone,
address, service hours, payment methods, shipping methods — are **not** in
`brand/`. They derive from `storefront_config` at build time, so the footer, the
contact page, the FAQ and the legal pages cannot disagree with each other or
with checkout.

## Feature flags

`brand/commerce.ts → flags`:

| Flag | Off means |
| --- | --- |
| `blog` | `/blog`, `/blog/[slug]` and `/blog/page/[page]` are never built, and every link to them disappears |
| `affiliate` | `/r/<code>` is never built, the member-area invite card is not rendered, and the `/r/*` rewrite is left out of `_redirects` |
| `contentPages` | `/products` (the catalogue index), `/about`, `/faq` and `/contact` are never built, and every link to them disappears |
| `cartPage` | `/cart` is never built; the cart becomes a DRAWER instead |
| `commerce` | the shop SHOWCASES instead of selling — see below |

### `commerce: false` — a showcase storefront

The catalogue, the product pages and the prices are all still there. What goes
is every surface that would take a customer into a purchase:

- `/checkout`, `/checkout/complete`, `/login`, `/account` and `/auth/callback`
  are never built. `/cart` goes with them — `cartPage` is ANDed with this flag,
  because a cart page whose only exit was never built is a dead end.
- The header drops the cart, the member link and the buy call-to-action, and
  carries one button instead: **加 LINE 詢問**.
- The footer's 會員服務 column empties through the ordinary link filter and
  disappears.
- The product page's 加入購物車 / 立即購買 pair becomes one **立即詢問** button
  that opens a LINE chat with the product — and the chosen spec — already typed.
  The quantity stepper goes with them: it fed the cart and nothing else.
- The cart drawer is not mounted, and the cart bundle is not shipped.
- Prices STAY. A showcase that hides them makes the customer ask what things
  cost, which is a different and worse decision than not selling online.

The enquiry buttons resolve their destination from `identity.line.id`. Leave it
empty and they fall back to the in-page LINE strip (`/#contact`, the `landing`
preset's contact block); with neither, they are not rendered at all, because a
button that goes nowhere is worse than a missing one.

**Absent means ON.** This is the one flag whose missing key reads as `true`.
Every flag above it defaults off, because absent there means "never asked for
it"; every storefront built before this flag existed was a transacting shop, and
reading the absence as `false` would strip the cart out of all of them.

## Two shapes of shop

The flags above are not five independent switches — two of them pair with the
home preset in `brand/copy.ts` to give a shop one of two coherent shapes.

| | multi-page | one-page |
| --- | --- | --- |
| `home` preset | `homeMultipage` | `homeLanding` |
| `contentPages` | `true` | `false` |
| `cartPage` | `true` | `false` |
| `navigation` | the page list | `[]` |
| `header.ctaHref` | `/products` | an in-page anchor |
| catalogue | `/products` | the `catalogue` block |
| FAQ | `/faq` | the `faq` block |
| contact | `/contact` | the `lineCta` strip |
| cart | `/cart` | the drawer |

The template ships **multi-page**, because that is the shape that degrades
better: every surface is a URL somebody can link to.

Going one-page is five edits, and nothing is lost on the way:

1. `brand/copy.ts` — `home = homeLanding`
2. `brand/commerce.ts` — `contentPages: false`
3. `brand/commerce.ts` — `cartPage: false`
4. `brand/copy.ts` — `navigation: []`
5. `brand/copy.ts` — `header.ctaHref` to an in-page anchor, e.g. `/#catalogue`

The last two are the header. Emptying `navigation` removes the centre nav and
the drawer that carries it on a phone; what is left is the cart, the member
link and the one call to action. Leaving `ctaHref` pointing at `/products` is
not a broken link — `isVisibleHref` filters it, so the button silently
DISAPPEARS instead, which is the harder symptom to read. Repoint it.

### No step rail on a one-page shop

Checkout comps almost always draw a three-step rail across the top — cart,
details, confirm. `src/routes/checkout/index.astro` does not build one, and that
is deliberate rather than unfinished.

A rail is a map of where you have been and where you are going, so every step
has to be somewhere you can BE. On the one-page shape two of the three are not:
the cart is a drawer over whatever page you were reading, and the order is
placed from the checkout screen itself, with no separate confirmation step
before it. Drawing them anyway gives the customer a position indicator that
cannot move and cannot be clicked — decoration that makes a claim about the
flow, and the claim is false.

A shop running `cartPage: true` does have a `/cart` URL, and a rail there would
be honest. It is still not built: one checkout page serves both shapes, and the
half of the rail that would be real is the half nobody needs.

What survives the move is where the content comes from. The FAQ block still
projects its payment and shipping answers from merchant config, exactly as
`/faq` did; the contact strip still derives the phone and hours from the
merchant record, exactly as the footer does. What changes is where they are
rendered, not where they come from.

What you must NOT do is mix them. `homeLanding` with `contentPages: true`
ships the catalogue twice — once as a home-page block and once as a page — and
those two will drift. The build does not stop you; nothing can tell the
difference between "deliberate" and "half-migrated" from the outside.

Old URLs are your problem, not the flag's. Turning `contentPages` off does not
redirect `/about`; add the rules to `EXTRA_REDIRECTS` in
`scripts/build-deployment-files.mjs`, and read pitfall #3 in `docs/PITFALLS.md`
first — Cloudflare's trailing-slash normalisation means the obvious rule does
not fire.

Both are **build-time**: `astro.config.ts` injects the routes from `src/routes/`
only when the flag is on, and `src/lib/features.ts` filters the link lists to
match. An unlinked page that still ships is still crawlable and still talking to
an API the shop may not have enabled, so "off" has to mean "not built".

## The two audits

`npm test` runs both before the unit tests, so a regression fails the same
command CI already runs.

- **`npm run audit:brand`** — greps `src/` for the shop's name, wordmark, storage
  namespace and merchant code (read out of `brand/`), plus the strings belonging
  to the storefront this template was extracted from. Matching folds case *and*
  diacritics, because that is exactly where brand residue hides: `'ÉLANE'
  .toLowerCase()` does not contain the ASCII `elane` that shows up in storage
  keys and e-mail addresses.

- **`npm run audit:color`** — greps `src/` for hex, `rgb()` and `hsl()` literals.
  Every colour is declared once in `brand/identity.ts` and reaches the
  stylesheets as a `var(--…)`, which BaseLayout inlines as a `:root` block. One
  `#f8f7f7` typed straight into a component is invisible until a rebrand lands
  and one panel stays the old colour.

Pick a `storageNamespace` that is distinctive — a shop's slug, not a category
word. It is one of the needles the brand audit greps for, so `storefront` or
`shop` would match half the API paths in the codebase.

## Design posture

The template ships **no** shadows, gradients, hover lifts or scroll-reveal, and
a neutral greyscale palette with square corners. That is deliberate: decoration
is the part of a design that carries a brand's personality, and shipping someone
else's personality as a default is how a template ends up looking like the shop
it came from. What survives is structure — grids, spacing, a type scale, and the
states a control needs to be usable (focus rings, the current nav item, the
selected variant, open/closed on a disclosure).

## Environment overrides

`PUBLIC_API_BASE` and `PUBLIC_SITE_DOMAIN` override `brand/commerce.ts` at build
time — useful for pointing a preview deploy at staging without editing the brand
layer. See `.env.example`.

## Assets

`brand/assets/` is the source; `public/` is generated and gitignored. The sync
runs before `dev`, `build` and `preview`, so all three see the same files, and it
fails the build when a file declared in `manifest.json` is missing rather than
shipping a page with a broken image.
