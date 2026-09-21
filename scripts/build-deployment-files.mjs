/**
 * Generate the Cloudflare Pages deployment files into dist/.
 *
 * `_headers`, `_redirects` and `robots.txt` all quote things only `brand/`
 * knows — the canonical origin, and which optional features exist. Keeping them
 * as static files in public/ means every new storefront starts by hand-editing
 * three files that look like boilerplate, and forgetting one is silent: a
 * robots.txt pointing at the previous shop's sitemap is still a valid file.
 *
 * So they are generated. Editing the copies in dist/ edits a build artefact.
 *
 * Legacy URL migrations (301s from a previous platform) belong in
 * `EXTRA_REDIRECTS` below — they are per-shop history, not template content.
 * Cloudflare silently stops applying rules somewhere past ~330, and the tail is
 * where the oldest URLs live, so keep the list short and put the precise rules
 * before the wildcards: first match wins.
 */
import { access, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fontStylesheets, storageNamespace } from './brand-facts.mjs';
// demo-noindex: the ONE declaration of "this site is not to be indexed", shared
// with BaseLayout's <meta name="robots">. See src/lib/noindex.mjs for why all
// four consumers read one constant instead of each spelling the string out.
import {
  SITE_NOINDEX,
  NOINDEX_DIRECTIVE,
  NOINDEX_ROBOTS_TXT,
  TRANSACTION_NOINDEX_PATHS,
} from '../src/lib/noindex.mjs';

const root = process.cwd();
const distDir = path.join(root, 'dist');

// brand/ is TypeScript and this script is plain Node, so the two values it needs
// are read as text rather than imported. See scripts/brand-facts.mjs for why.
const commerceSource = await readFile(path.join(root, 'brand', 'commerce.ts'), 'utf8');

function field(name) {
  const match = commerceSource.match(new RegExp(`\\n  ${name}: '([^']*)'`));
  if (!match) throw new Error(`Could not read \`${name}\` from brand/commerce.ts.`);
  return match[1];
}

/** Like `field`, but absent is an answer rather than an error. */
function optionalField(name) {
  const match = commerceSource.match(new RegExp(`\\n  ${name}: '([^']*)'`));
  return match ? match[1] : undefined;
}

function flag(name) {
  const match = commerceSource.match(new RegExp(`\\n    ${name}: (true|false)`));
  if (!match) throw new Error(`Could not read flag \`${name}\` from brand/commerce.ts.`);
  return match[1] === 'true';
}

const siteOrigin = field('siteOrigin');
const affiliate = flag('affiliate');

/**
 * WHICH of the two Cloudflare hosts this shop deploys to.
 *
 * This used to be nobody's decision, because the same `dist/` was believed to
 * serve both. It does not. The two 404 lines at the end of `_redirects` are
 * REQUIRED by Pages, which serves the custom page from them, and REJECTED by
 * Workers, which fails the whole deploy:
 *
 *   Invalid _redirects configuration:
 *   Line N: Valid status codes are 200, 301, 302, 303, 307, or 308. Got 404.
 *   [code: 100324]
 *
 * The assets upload succeeds first and the script upload then fails, so no
 * Worker is created at all. One file cannot satisfy both hosts, so the shop has
 * to say which one it is for — and it says it HERE rather than in an
 * environment variable or an npm script, because it is a standing fact about
 * this storefront, not a property of the machine that happens to be building
 * it. It is reviewable in a diff, it survives CI, and it cannot be forgotten at
 * the moment of deploying.
 *
 * ABSENT MEANS PAGES. Every shop in this family predates the field and every
 * one of them is on Pages; reading the absence as anything else would strip the
 * custom 404 out of all of them on the next build. A value that is neither
 * throws rather than falling back — a typo silently meaning 'pages' is exactly
 * the class of failure this whole file is written to avoid.
 *
 * See docs/PITFALLS.md #3.
 */
const DEPLOY_TARGETS = ['pages', 'workers'];
const deployTarget = optionalField('deployTarget') ?? 'pages';
// 自訂網域（選用）。只有 deployTarget: 'workers' 用得到 —— Pages 的自訂網域不從
// 這裡走，也不會由部署自動建 DNS（2026-09-14 實測：Pages 的 custom domain 建起來
// 後停在 "CNAME record not set"，要另外補 DNS 記錄）。
const customDomain = optionalField('customDomain');
if (!DEPLOY_TARGETS.includes(deployTarget)) {
  throw new Error(
    `build-deployment-files: brand/commerce.ts declares deployTarget ` +
      `'${deployTarget}' — it has to be ${DEPLOY_TARGETS.map((t) => `'${t}'`).join(' or ')}, ` +
      'or absent (which means pages). The two hosts need DIFFERENT _redirects: ' +
      'Pages serves its custom 404 from rules Workers rejects the deploy over.',
  );
}

/** Per-shop legacy 301s. Precise rules first; the template ships none. */
const EXTRA_REDIRECTS = [];

/* ────────────────────────────────────────────────────────────────────────────
 * Content-Security-Policy.
 *
 * There was none. Seven storefronts in this family were checked and every one
 * of them served zero CSP directives, so every one of them would execute any
 * script an injection managed to place.
 *
 * ## The two directives that are deliberately ABSENT
 *
 * `form-action` is not set, and that is not an oversight — setting it to
 * `'self'`, which is the obvious hardening and what most guides tell you to do,
 * BREAKS ATM AND CVS CHECKOUT ON EVERY SHOP.
 *
 * The payment handoff is not a redirect. `src/scripts/checkout.ts` receives an
 * auto-submit ECPay form from the backend and renders it with
 * `document.open(); document.write(next.html)`, and the store picker does the
 * same into a `window.open('', 'cvsMap')` popup. A document written that way
 * INHERITS this policy — `about:blank` and same-document writes both take the
 * creator's — so the form that posts the customer to ECPay is governed by the
 * header below. `form-action` has no fallback to `default-src`, so leaving it
 * out leaves form submission unrestricted, which is the only correct answer
 * here short of hard-coding gateway hostnames this file cannot know.
 *
 * `script-src-attr` is not set either, for the same reason one level down:
 * those ECPay interstitials submit themselves from an inline handler, and an
 * unset `script-src-attr` inherits `script-src`, which allows it.
 *
 * ## Why 'unsafe-inline' is here rather than hashes
 *
 * Every page carries four inline `<script>` blocks (the beacon bootstrap, the
 * window config, two JSON-LD data blocks) and two inline `<style>` blocks (the
 * palette, compiled from brand/identity.ts). Hashing them is possible and would
 * be stricter; it is also a hash list that has to be regenerated on every
 * content change, and a stale one fails CLOSED — a blank page rather than a
 * loud error. That trade is worth making deliberately, not as a side effect of
 * adding a header that did not exist yesterday.
 *
 * ## img-src is data, not configuration
 *
 * Product and article images come from the API at build time, so their host is
 * whatever the merchant uploaded to — `brand/` never mentions it. A policy
 * guessed from the template's own placeholder CDNs would silently blank the
 * catalogue of the first shop that used a different one. So the generated
 * policy is CHECKED against the artefact: `assertImagesCovered` walks the built
 * HTML and fails the build naming any image origin the policy would block.
 */
const apiOrigin = field('apiBase').replace(/\/+$/, '');

/**
 * Hosts the merchant's imagery is served from.
 *
 * OPTIONAL. Absent means the two stock-photo CDNs every storefront in this
 * family currently uses, which is a default that is allowed to be wrong exactly
 * because the artefact check below catches it — a shop on a different CDN fails
 * its next build with the host named, rather than deploying a blank catalogue.
 */
const DEFAULT_IMAGE_HOSTS = ['https://images.pexels.com', 'https://cdn.pixabay.com'];

function optionalList(name) {
  const at = commerceSource.search(new RegExp(`\\n  ${name}:\\s*\\[`));
  if (at === -1) return undefined;
  const open = commerceSource.indexOf('[', at);
  const close = commerceSource.indexOf(']', open);
  if (close === -1) return undefined;
  return [...commerceSource.slice(open + 1, close).matchAll(/'([^']*)'|"([^"]*)"/g)].map(
    (m) => m[1] ?? m[2],
  );
}

const imageHosts = optionalList('imageHosts') ?? DEFAULT_IMAGE_HOSTS;

/**
 * Font origins, derived rather than declared: a Google Fonts stylesheet lives
 * on `fonts.googleapis.com` and its FACES live on `fonts.gstatic.com`, and a
 * policy that names the first and forgets the second loads the stylesheet,
 * blocks every file it asks for, and silently falls back to system fonts.
 */
const FONT_FILE_HOSTS = { 'https://fonts.googleapis.com': 'https://fonts.gstatic.com' };

const styleHosts = [...new Set(fontStylesheets.map((href) => new URL(href).origin))];
const fontHosts = [...new Set(styleHosts.map((origin) => FONT_FILE_HOSTS[origin]).filter(Boolean))];

const csp = [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  // Matches X-Frame-Options: SAMEORIGIN above, for browsers that read this instead.
  "frame-ancestors 'self'",
  `img-src 'self' data: ${[...imageHosts, apiOrigin].join(' ')}`,
  `connect-src 'self' ${apiOrigin}`,
  "script-src 'self' 'unsafe-inline'",
  `style-src 'self' 'unsafe-inline'${styleHosts.length ? ` ${styleHosts.join(' ')}` : ''}`,
  // The fallback made explicit: style attributes are inline styles too.
  "style-src-attr 'unsafe-inline'",
  `font-src 'self'${fontHosts.length ? ` ${fontHosts.join(' ')}` : ''}`,
].join('; ');

// demo-noindex: one line appended to the /* rule, or nothing at all. Built here
// rather than inline so the template literal below stays readable.
const siteNoindexHeader = SITE_NOINDEX ? `\n  X-Robots-Tag: ${NOINDEX_DIRECTIVE}` : '';

// The transaction-page rules, generated from the shared path list. When the whole
// site is already noindex each rule first unsets the inherited header so the
// value is not emitted twice (see the comment on the block below).
const transactionNoindexRules = TRANSACTION_NOINDEX_PATHS.map(
  (p) =>
    `${p}\n${SITE_NOINDEX ? '  ! X-Robots-Tag\n' : ''}  X-Robots-Tag: ${NOINDEX_DIRECTIVE}\n`,
).join('');

const headers = `# HTML (and anything not matched below): browsers must revalidate every time
# (max-age=0), but shared caches may hold a copy for 10 minutes (s-maxage=600).
# Static pages only change on deploy, so bounded edge staleness is safe — and the
# value is deliberately short because the platform's own cache layer is not fully
# under _headers control; a small s-maxage cannot stack into long staleness.
#
# HSTS: a conservative one-day max-age, with no includeSubDomains and no preload.
# HSTS cannot be quickly rolled back once browsers have seen it, so raise this
# only once you are certain every subdomain serves HTTPS.
/*
  Cache-Control: public, max-age=0, s-maxage=600, must-revalidate
  Strict-Transport-Security: max-age=86400
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: SAMEORIGIN
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Cross-Origin-Opener-Policy: same-origin-allow-popups
  Content-Security-Policy: ${csp}${siteNoindexHeader}

# Brand assets: cacheable, but NOT immutable.
#
# \`immutable\` is a promise that the bytes at this URL will never change, and
# these filenames cannot keep it. /_astro/* is content-addressed — Astro puts a
# hash of the contents in the name, so a changed file is a changed URL. brand/
# names are chosen by a person: hero.jpg stays hero.jpg when the photograph
# behind it is replaced, and scene-01.jpg stays scene-01.jpg when the scene is
# recut.
#
# Shipped as immutable with a one-year TTL, both halves of that failed in
# production. A replaced hero kept serving the old photograph from whichever
# edge held a copy. A DELETED file kept serving too — verified: an icon removed
# from brand/assets/ and absent from the deployment still answered 200 with
# CF-Cache-Status: HIT ninety minutes later. The deploy had landed; the edge had
# simply been told it never needed to ask again.
#
# An hour, revalidated by ETag afterwards. Long enough that a session pays the
# download once, short enough that replacing artwork is a deploy rather than a
# year. \`! Cache-Control\` still detaches the /* value first, for the merge
# reason described below.
/assets/*
  ! Cache-Control
  Cache-Control: public, max-age=3600, s-maxage=3600, must-revalidate

# Content-addressed build output. Here \`immutable\` is TRUE: a change to any of
# these files changes its hash, and therefore its URL, so nothing at this URL
# ever has to be reconsidered.
#
# \`! Cache-Control\` detaches the /* value first — without it the platform MERGES
# Cache-Control directives across matching rules (verified in production:
# must-revalidate leaks from /* into asset responses), so the /* s-maxage=600
# would cap the edge TTL. s-maxage is also set explicitly so the merge produces
# the right answer even where the detach is not honoured.
/_astro/*
  ! Cache-Control
  Cache-Control: public, max-age=31536000, s-maxage=31536000, immutable

# Transaction pages: hard noindex. A robots.txt Disallow blocks crawling, not
# indexing — a page linked from elsewhere can still be listed without it.
#
# These stay whether or not the whole site is noindex, because SITE_NOINDEX is
# what a real shop turns OFF — and when it does, these five surfaces must keep
# the directive they have always had.
#
# The \`! X-Robots-Tag\` is not decoration. Cloudflare merges every matching rule
# and JOINS same-named headers with a comma (same on Pages and on Workers static
# assets), so without the unset these pages would answer
#   X-Robots-Tag: noindex, nofollow, noindex, nofollow
# once /* carries the directive too. Same reason /_astro/* unsets Cache-Control
# a few rules above.
${transactionNoindexRules}`;

const referralRule = affiliate
  ? `# Referral landing. This is a static site, so there is no dynamic route for the
# code: every /r/<code> is REWRITTEN (200, not 301) onto the one built page, and
# the client reads the code back off location.pathname. Must come before the /*
# 404 catch-all.
/r/*   /r/   200

`
  : '';

/**
 * The 404 tail, which is the one part of this file the two hosts disagree about.
 *
 * Pages SERVES the custom page from these two rules. It does so on undocumented
 * behaviour — Cloudflare's own docs list 404 among the status codes _redirects
 * does not support — but it does it, and without them a Pages shop falls back
 * to Cloudflare's own 404 instead of its own.
 *
 * Workers REJECTS THE DEPLOY over them. Not "ignores": the upload is refused
 * with code 100324 naming these exact lines, and no Worker is created. So on
 * that host they are not written at all, and the custom page comes from
 * assets.not_found_handling in wrangler.jsonc instead.
 */
const notFoundRules =
  deployTarget === 'pages'
    ? `# 404 handling (must stay last). THIS SHOP DEPLOYS TO PAGES.
#
# Load-bearing here, and relied on rather than guaranteed: Cloudflare's own docs
# list 404 among the status codes _redirects does NOT support, yet Pages honours
# it and serves the custom page. Delete these and /404.html stops being reached.
#
# They are also why this file cannot be handed to Workers as it stands — that
# host refuses the deploy over them. A shop that moves sets deployTarget in
# brand/commerce.ts and rebuilds; see docs/PITFALLS.md #3.
/404  /404.html  404
/*    /404.html  404
`
    : `# 404 handling is NOT in this file, and the absence is the point.
#
# THIS SHOP DEPLOYS TO WORKERS, where a 404 status in _redirects is not ignored
# but FATAL: the platform refuses the whole upload with
#
#   Invalid _redirects configuration:
#   Line N: Valid status codes are 200, 301, 302, 303, 307, or 308. Got 404.
#   [code: 100324]
#
# and no Worker is created. The assets upload succeeds first, so the failure
# arrives after several seconds of apparent progress.
#
# What serves the custom page here is assets.not_found_handling: "404-page" in
# wrangler.jsonc, which this build also writes. That is not a fallback for these
# lines — it is the mechanism, and it is verified working.
#
# Do NOT add them back to make this file "match" a Pages shop's. Flip
# deployTarget in brand/commerce.ts instead, which moves both halves together.
# See docs/PITFALLS.md #3.
`;

const redirects = `# Redirect rules. First match wins, so precise rules come before wildcards.
${EXTRA_REDIRECTS.length ? EXTRA_REDIRECTS.join('\n') + '\n\n' : ''}${referralRule}${notFoundRules}`;

// demo-noindex: an unindexed site answers ONE group with a blanket Disallow and
// no Sitemap (a sitemap advertising a site that asks not to be crawled is a
// contradictory signal). A real shop flips SITE_NOINDEX off and gets the
// per-path list below back. See src/lib/noindex.mjs for the trade-off this
// choice accepts.
const robots = SITE_NOINDEX
  ? NOINDEX_ROBOTS_TXT
  : `# Search and AI crawlers welcome. Utility pages are excluded from indexing —
# the list mirrors the sitemap filter in astro.config.ts.

User-agent: *
Allow: /
Disallow: /cart
Disallow: /checkout
Disallow: /account
Disallow: /login
Disallow: /auth

Sitemap: ${siteOrigin}/sitemap-index.xml
`;

/* ────────────────────────────────────────────────────────────────────────────
 * wrangler.jsonc — Cloudflare WORKERS only.
 *
 * Pages needs no config: `wrangler pages deploy dist` takes everything from the
 * command line. Workers reads a file, and it has to sit at the project root
 * rather than in dist/, because `assets.directory` is resolved relative to the
 * config file.
 *
 * GENERATED rather than committed, for the same reason _redirects is: the one
 * field that varies is the one that must not be got wrong. `name` is the
 * Worker's IDENTITY inside the account — deploying two storefronts under one
 * name does not fail, it overwrites, and the shop that lost keeps serving the
 * other shop's pages until somebody notices. Deriving it from the storage
 * namespace, which is already required to be distinctive per shop and is
 * already audited for it, makes the collision unreachable instead of warning
 * about it in a comment.
 *
 * Root-level and gitignored, so it is a build artefact like the rest — and
 * written ONLY when this shop's deployTarget is 'workers', so the artefacts a
 * build leaves behind match what the shop said it is for. A Pages shop holding
 * a wrangler.jsonc is an invitation to run `wrangler deploy` against a
 * _redirects written for the other host, which is the failure this whole change
 * exists to remove; a stale one left by an earlier target is deleted rather
 * than left to be found.
 */
const workerName = `${storageNamespace}-storefront`;

/**
 * routes —— 自訂網域綁定，brand/commerce.ts 沒設 customDomain 就整段不輸出。
 *
 * `custom_domain: true` 這條路徑 `wrangler deploy` 會連 zone 裡的 DNS 記錄
 * 一起建，不需要任何 API token（2026-09-15 以 b1-probe-w 實測）。憑證沿用 zone
 * 既有的 Universal SSL，一級子網域即時可用，不必等簽發。
 *
 * ⚠️ 解除綁定沒有對稱的路徑。把 customDomain 拿掉後 redeploy **不會**解除既有
 *    綁定，`wrangler triggers deploy` 也不會 —— 兩者實測後 hostname 仍 200、
 *    DNS 記錄仍在。唯一有效的是 API
 *    `DELETE /accounts/{account_id}/workers/domains/{domain_id}`，而 domain_id
 *    要先用 `GET .../workers/domains?hostname=...` 查出來。綁定時就把它記下來，
 *    比事後翻省事。
 */
const routesBlock = customDomain
  ? `
  "routes": [
    { "pattern": ${JSON.stringify(customDomain)}, "custom_domain": true }
  ],
`
  : '';

const wrangler = `{
  // GENERATED by scripts/build-deployment-files.mjs — edit brand/, not this.
  //
  // Cloudflare WORKERS deployment: \`npm run build && npx wrangler deploy\`.
  // Pages does not read this file; see README → Deploying and PITFALLS #3 for
  // where the two hosts diverge.

  // Derived from identity.storageNamespace, so it is unique per shop by
  // construction. Two shops sharing a Worker name overwrite each other.
  "name": ${JSON.stringify(workerName)},

  // The build date the runtime API is pinned to, not a version to bump.
  "compatibility_date": "2026-08-20",

  // NOT optional, and not a default to rely on.
  //
  // wrangler turns workers.dev OFF for any deployment that declares routes
  // unless this says otherwise — and it does it with a WARNING, not an error.
  // Binding a custom domain therefore takes the shop off its *.workers.dev
  // address in the very deploy that puts it on the new one. Measured
  // 2026-09-15: the workers.dev URL answered 404 within seconds of the first
  // routes deploy, and came back only after this line was added.
  //
  // During a domain migration that old address is the only way back, so it is
  // declared explicitly and emitted for every shop, with or without a custom
  // domain today.
  "workers_dev": true,
${routesBlock}
  "assets": {
    "directory": "./dist",

    // NOT optional, however much it reads like a nicety.
    //
    // Without it, every Workers-hosted shop loses its custom 404 page and
    // unknown URLs return an empty body — not a redirect, not a message,
    // nothing.
    //
    // It is also the ONLY way to get one here, and this comment used to say
    // otherwise. It described the two 404 lines a _redirects file can carry as
    // being dropped SILENTLY by the Workers parser while the rest of the file
    // kept working — a plausible story, and wrong twice over. See PITFALLS #3.
    //
    // What actually happens is REJECTION, not a silent drop: Cloudflare's
    // server-side validation refuses the whole upload with code 100324 and no
    // Worker is created. The deploy fails; it does not half-succeed. Anyone
    // debugging a rejected deploy on the strength of the old comment went
    // looking for a dropped rule instead of at the upload response, which is
    // the exact wrong path the original investigation took.
    //
    // And on this host those lines are not written at all — build-deployment
    // -files.mjs omits them under deployTarget: 'workers', which is the only
    // build that produces this file. So the old comment set up its explanation
    // with a state of dist/_redirects that cannot exist beside it.
    "not_found_handling": "404-page"
  }
}
`;

/**
 * Every image the built pages actually reference is reachable under the policy
 * that is about to ship beside them.
 *
 * A CSP is the one header whose mistakes are invisible to the person who wrote
 * it: nothing local sets it, so the first time it is enforced is in production,
 * and what enforcement looks like is a picture that does not appear. There is
 * no error, no failed request the page can see, and no reason for anyone to
 * connect a blank catalogue to a header added three deploys ago.
 *
 * The images are DATA — they come from the API at build time, named by whatever
 * CDN the merchant uploaded to — so no amount of reading `brand/` proves the
 * policy covers them. The artefact does. This walks the HTML that was just
 * built, collects every external origin sitting in an image position, and fails
 * the build naming any the policy would block.
 *
 * Deliberately narrow: `src`, `srcset` and `content` (og:image / twitter:image)
 * on absolute URLs. A link to line.me is a navigation and no directive touches
 * it; widening this to every URL in the document would produce false failures
 * that teach people to add hosts to the policy to make a build go green.
 */
const IMAGE_URL = /(?:\bsrcset="([^"]*)"|\bsrc="(https?:\/\/[^"]*)"|<meta[^>]*\bproperty="og:image"[^>]*\bcontent="(https?:\/\/[^"]*)"|<meta[^>]*\bname="twitter:image"[^>]*\bcontent="(https?:\/\/[^"]*)")/g;

async function htmlFiles(dir, out = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await htmlFiles(full, out);
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

/**
 * Every SAME-ORIGIN file the built pages point at is actually in `dist/`.
 *
 * ## The gap this closes, and why it is exactly here
 *
 * Two checks in this repository look at images and neither can see this:
 *
 *   `npm run assets:validate` verifies the files `brand/assets/manifest.json`
 *   DECLARES are present. A path referenced from `brand/copy.ts` but never
 *   declared is not in its world at all.
 *
 *   The Content-Security-Policy pass below reads REMOTE origins, because a
 *   policy is what it is protecting. Its own regex only captures
 *   `src="https://…"`, so a same-origin path is not merely skipped — it is
 *   never matched.
 *
 * A dead `/assets/…` path falls precisely between them, and every audit stays
 * green while a live page ships a broken picture. That is not hypothetical: one
 * storefront's 404 hero — the one page a lost visitor sees — pointed at a
 * placeholder deleted during its image phase, and it was found by curling
 * production, not by any check. Deleting unused placeholders is the RIGHT thing
 * to do (the README says to), which is what makes this the wrong failure to
 * leave to somebody noticing.
 *
 * ## What it reads
 *
 * `src`, `href` and `srcset` on root-relative paths, plus `url(…)` inside an
 * inline style — the masked-glyph form the 404 quick links and the assurance
 * strip both use, where the file supplies the shape and a token supplies the
 * colour (PITFALLS #5). A reference with no file extension is a route, not a
 * file, and is left alone.
 *
 * It runs against the ARTEFACT rather than against `brand/`, for the same
 * reason the policy check does: what a page references is decided by config,
 * data and a build, and only one of those three can be read from a source file.
 */
const SAME_ORIGIN_ASSET =
  /(?:\bsrcset="([^"]*)"|\b(?:src|href)="(\/[^"]*)"|url\('(\/[^']*)'\)|url\("(\/[^"]*)"\))/g;

/** A reference that names a FILE: root-relative, with an extension. */
function assetPath(candidate) {
  if (!candidate || !candidate.startsWith('/')) return null;
  const bare = candidate.split('#')[0].split('?')[0];
  if (!/\.[a-z0-9]{2,5}$/i.test(bare)) return null;
  try {
    return decodeURI(bare);
  } catch {
    /* An undecodable reference is not a path this can clear, and passing it
       through as-is would be a check that quietly stopped checking. */
    return bare;
  }
}

const allowedImageOrigins = new Set([siteOrigin, apiOrigin, ...imageHosts]);
const blocked = new Map();
const deadAssets = new Map();
const assetSeen = new Map();

for (const file of await htmlFiles(distDir)) {
  const html = await readFile(file, 'utf8');
  for (const match of html.matchAll(IMAGE_URL)) {
    const candidates = match[1]
      ? match[1].split(',').map((part) => part.trim().split(/\s+/)[0])
      : [match[2] ?? match[3] ?? match[4]];
    for (const candidate of candidates) {
      if (!candidate || !/^https?:\/\//.test(candidate)) continue;
      const origin = new URL(candidate).origin;
      if (allowedImageOrigins.has(origin)) continue;
      if (!blocked.has(origin)) blocked.set(origin, path.relative(distDir, file));
    }
  }

  for (const match of html.matchAll(SAME_ORIGIN_ASSET)) {
    /* srcset is comma-separated with a descriptor after each URL, so it is the
       one form that cannot be read as a bare reference. */
    const candidates = match[1]
      ? match[1].split(',').map((part) => part.trim().split(/\s+/)[0])
      : [match[2] ?? match[3] ?? match[4]];
    for (const candidate of candidates) {
      const rel = assetPath(candidate);
      if (rel === null || assetSeen.has(rel)) continue;
      assetSeen.set(rel, true);
      try {
        await access(path.join(distDir, rel));
      } catch {
        deadAssets.set(rel, path.relative(distDir, file));
      }
    }
  }
}

if (deadAssets.size > 0) {
  throw new Error(
    `build-deployment-files: ${deadAssets.size} same-origin file(s) the built pages point at ` +
      `are not in dist/:\n` +
      [...deadAssets].map(([rel, where]) => `  ${rel}  (referenced by dist/${where})`).join('\n') +
      `\n\nEach one is a broken image, stylesheet or download on a page that otherwise ` +
      `builds green — assets:validate only checks what brand/assets/manifest.json declares, ` +
      `and the policy check below only reads remote origins. Point brand/ at a file that ` +
      `exists, or put the file back.\n\nNote what this canNOT see, because it reads the ` +
      `artefact: the home preset a shop is not using renders nothing, so its asset paths go ` +
      `unchecked here. Dead config today, a broken page the moment somebody flips \`home\`.`,
  );
}

if (blocked.size > 0) {
  throw new Error(
    `build-deployment-files: the Content-Security-Policy would block ${blocked.size} image ` +
      `origin(s) the built pages reference:\n` +
      [...blocked].map(([origin, where]) => `  ${origin}  (first seen in dist/${where})`).join('\n') +
      `\n\nAdd them to \`imageHosts\` in brand/commerce.ts. They are not guessable from ` +
      `brand/ — product and article images come from the API, so the host is the ` +
      `merchant's, not the template's. Shipping without this check means a blank ` +
      `catalogue in production and a green build here.`,
  );
}

await mkdir(distDir, { recursive: true });
await writeFile(path.join(distDir, '_headers'), headers, 'utf8');
await writeFile(path.join(distDir, '_redirects'), redirects, 'utf8');
await writeFile(path.join(distDir, 'robots.txt'), robots, 'utf8');

const wranglerPath = path.join(root, 'wrangler.jsonc');
if (deployTarget === 'workers') {
  await writeFile(wranglerPath, wrangler, 'utf8');
} else {
  // Nothing to do on a fresh clone; this clears one left by a previous target.
  await rm(wranglerPath, { force: true });
}

console.log(
  `Deployment files written for ${siteOrigin} ` +
    `(target: ${deployTarget}; affiliate: ${affiliate ? 'on' : 'off'}` +
    `${deployTarget === 'workers' ? `; worker: ${workerName}` : ''}).`
);
