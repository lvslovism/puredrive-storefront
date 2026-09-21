/**
 * Where the template ends and the shop begins.
 *
 * ## The rule this replaces
 *
 * "src/ is byte-identical to the template" was one rule covering two kinds of
 * file, and it is only true of one of them.
 *
 * Checkout, the member area, the cart, login and the legal pages are shared
 * because nobody draws a comp for them. Five shops running one checkout is five
 * shops getting the same bug fix, and the sameness costs nothing because none
 * of them wanted to be different.
 *
 * The home page is the opposite. Every shop has a comp for it, every comp is
 * different, and being different is the entire job. Locking it meant changing
 * one hero's alignment took an edit to the template, a sync across five
 * storefronts, and a verification pass on each — to land a change that, by
 * construction, only ever applied to one of them.
 *
 * So the line runs between "nobody designs this" and "everybody designs this".
 *
 * ## Where exactly
 *
 * UNLOCKED is deliberately tiny, because the coupling turned out to be tiny.
 * `HomeLanding.astro` imports exactly ONE component (`Button`) and four lib
 * modules, and defines every section, card and rule it draws in its own file —
 * 69% of it is its own stylesheet. There is no shared "section head" or "scene
 * card" component to agonise over: those classes exist nowhere but inside the
 * two home components. Unlocking two files therefore buys essentially all of
 * the design freedom, and unlocking anything more would start splitting things
 * that shops genuinely do share.
 *
 * What stays locked, and why it can:
 *
 *   Button.astro        twelve consumers, including cart and checkout. A home
 *                       page that wants a different button restyles it from its
 *                       own scope — `.hero-copy :global(.button)`, a pattern
 *                       the home components already use.
 *   ProductGrid / Card  /products, the PDP and 404 render these. HomeLanding
 *                       does not import them at all.
 *   global.css          the type scale, `.container`, `.section-title`. Shared
 *                       by every page; fragmenting it fragments the design
 *                       system rather than the home page. The intended lever is
 *                       `brand/identity.ts`, which is already per-shop.
 *   hero-copy.ts        the fail-visible contract. It exists because a missing
 *                       field once built green, and five private copies of a
 *                       safety net is five that can quietly weaken. A shop can
 *                       still add its own hero fields: the assert rejects
 *                       unknown keys inside `scrim`, not on `hero` itself.
 *   pages/index.astro   the preset switch, plus the check that validates BOTH
 *                       presets — including the one this shop has not selected.
 *                       Carries no design.
 *
 * `brand/` is not listed at all. It was never locked; it is the fill-in layer.
 */
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

/**
 * Site-owned. Byte-for-byte divergence here is the shop doing its job, not
 * drift, and the consistency check does not look at it.
 */
export const UNLOCKED = [
  'src/components/home/HomeLanding.astro',
  'src/components/home/HomeMultipage.astro',
];

/**
 * Template-owned, checked byte-for-byte.
 *
 * Directories are walked; files are taken as named. Everything under `src/`
 * except UNLOCKED, plus the root files every fork receives verbatim — all five
 * storefronts currently match the template on every one of them, which is the
 * evidence they belong on this side of the line rather than a hope.
 */
export const LOCKED_ROOTS = [
  'src',
  'scripts',
  'astro.config.ts',
  'tsconfig.json',
  '.gitignore',
  'docs/PITFALLS.md',
];

/**
 * ────────────────────────────────────────────────────────────────────────────
 * The two TIERS, and what the line between them is for.
 *
 * One lock over seventy-five files said one thing — "the template owns this" —
 * and it was true of all of them and useful for about half.
 * `src/scripts/checkout.ts` is shared because five shops running one checkout
 * is five shops getting one bug fix. `src/routes/faq.astro` was shared because
 * nobody had drawn a comp for it, which stops being true the day somebody does.
 *
 * Both were the same rule, so a shop with a comp for its FAQ page had exactly
 * one move available: leave the template. That is the wrong price for a page of
 * headings, and it is the price every paying shop was quoted.
 *
 * So each locked file now carries a tier:
 *
 *   core          money and membership. The cart, the checkout, the member
 *                 area, the API clients, the layout that boots them, and the
 *                 scripts that audit all of it. Enforced byte-for-byte, always.
 *                 A shop cannot declare its way out, because the failure here
 *                 is not a page that looks wrong — it is an order that never
 *                 arrives, in a shop nobody is watching.
 *   presentation  pages, routes, components, stylesheets. Still locked BY
 *                 DEFAULT: a shop that says nothing is exactly where it was
 *                 before this existed. A shop that has drawn its own version
 *                 names the file in `brand/unlock.ts`, and that one file stops
 *                 being enforced for it.
 *
 * The split is by WHAT A FILE DOES, not by who owns it. Every file below is
 * still the template's — `presentation` says what a shop may take over, not
 * what it already has.
 *
 * This is a different axis from UNLOCKED above, and the two do not overlap.
 * UNLOCKED is a file the template has already handed over to every shop, in
 * the template's own source. A tier is what the LOCK says about a file the
 * template still ships, and `brand/unlock.ts` is one shop's answer to it.
 */
export const CORE_TIER = 'core';
export const PRESENTATION_TIER = 'presentation';

/**
 * Core, as exact paths and directory prefixes (a trailing `/` is a directory).
 *
 * `src/components/common/BeaconBoot.astro` is the one component in here, and it
 * is not a component in any useful sense: it boots the analytics beacon and
 * draws nothing. It sits under `src/components/` because that is where it was
 * put, not because a designer will ever open it.
 */
export const CORE = [
  'src/scripts/',
  'src/lib/',
  'src/layouts/BaseLayout.astro',
  'src/components/common/BeaconBoot.astro',
  'scripts/',
  'astro.config.ts',
  'tsconfig.json',
  '.gitignore',
  'docs/PITFALLS.md',
];

/**
 * Presentation. Everything a comp can be drawn of.
 *
 * `src/styles/` is here and it is the one entry the split had to decide rather
 * than read off the brief. It carries the type scale and `.container` — shared
 * by every page, including the checkout — so unlocking it is not free. But it
 * carries no money and no membership: the worst a shop can do to itself with it
 * is a layout that looks wrong, which is visible, in a shop that is looking.
 * `audit:color` still refuses colour literals in it either way.
 */
export const PRESENTATION = [
  'src/pages/',
  'src/routes/',
  'src/components/',
  'src/styles/',
];

const under = (rel, entry) => (entry.endsWith('/') ? rel.startsWith(entry) : rel === entry);

/**
 * Which tier a locked path is in. CORE is consulted first, so an exact core
 * file beats the presentation directory it happens to live in.
 *
 * An unclassified path THROWS rather than defaulting. A default would have to
 * pick one, and both are wrong: defaulting to core makes a new page
 * un-customisable and nobody finds out until a shop asks; defaulting to
 * presentation makes the next `src/lib/` sibling unlockable and nobody finds
 * out at all. `assertGroundsCover` in the colour audit refuses a background
 * that belongs to no ground for the same reason — a classification nobody made
 * is not a classification.
 */
export function tierOf(rel) {
  if (CORE.some((entry) => under(rel, entry))) return CORE_TIER;
  if (PRESENTATION.some((entry) => under(rel, entry))) return PRESENTATION_TIER;
  throw new Error(
    `template-lock: "${rel}" is locked but belongs to no tier. Add it to CORE in ` +
      'scripts/template-lock.mjs if it carries money or membership logic, or to ' +
      'PRESENTATION if it is a page, a component or a stylesheet — and say which in ' +
      'the commit. A locked file with no tier is a file nobody has decided a shop ' +
      'may customise, which is not the same as one nobody may.'
  );
}

/**
 * The `locked` map, read and checked.
 *
 * Entries are `{ hash, tier }`. The old shape was a bare hash string, and it is
 * rejected LOUDLY rather than assumed into a tier: a lock that predates the
 * split came from a sync that copied the lock without the scripts (or the other
 * way round), and either guess about the missing tier is wrong for half the
 * files. Re-copying `template.lock.json` from the template is the fix and it is
 * one command; silently treating seventy-five files as core would instead tell
 * a paying shop its own pages are untouchable.
 */
export function lockEntries(lock, lockFile = LOCK_FILE) {
  const entries = new Map();
  for (const [rel, entry] of Object.entries(lock?.locked ?? {})) {
    if (typeof entry === 'string') {
      throw new Error(
        `${lockFile} predates the core/presentation split: "${rel}" is a bare hash with no ` +
          'tier. The lock and scripts/template-lock.mjs travel together — take both from ' +
          'the template at the same commit.'
      );
    }
    if (!entry || typeof entry.hash !== 'string' || !entry.hash) {
      throw new Error(`${lockFile}: "${rel}" has no hash.`);
    }
    if (entry.tier !== CORE_TIER && entry.tier !== PRESENTATION_TIER) {
      throw new Error(
        `${lockFile}: "${rel}" has tier "${entry.tier}" — it has to be ` +
          `"${CORE_TIER}" or "${PRESENTATION_TIER}".`
      );
    }
    entries.set(rel, { hash: entry.hash, tier: entry.tier });
  }
  return entries;
}

/**
 * What a shop's `brand/unlock.ts` actually buys it, and what it cannot.
 *
 * Returns the presentation files that stop being enforced, plus every reason a
 * declaration was refused. The caller throws on `errors`; keeping the decision
 * here rather than inside the audit is what lets `tests/template-tier.test.mjs`
 * ask "is a core file refusable?" without a repository to run against.
 *
 * A refusal is a hard failure, not a warning. A shop that has written a path
 * into `brand/unlock.ts` believes that file is now its own; if the declaration
 * did not take — a typo, a moved page, a core file — the next edit to it fails
 * `audit:template` with a drift message that says nothing about the line the
 * shop actually wrote.
 */
export function classifyUnlocks(declared, entries) {
  const errors = [];
  const unlocked = new Set();
  for (const raw of declared ?? []) {
    const rel = String(raw).trim().replace(/^\.\//, '');
    if (!rel) continue;
    const entry = entries.get(rel);
    if (!entry) {
      errors.push(
        `"${rel}" is not a file this template locks. Check the path (it is repo-relative, ` +
          'forward slashes), or drop the line — an unlocked file needs no declaration.'
      );
      continue;
    }
    if (entry.tier === CORE_TIER) {
      errors.push(
        `"${rel}" is CORE and cannot be unlocked. Core is the money and membership half — ` +
          'the cart, the checkout, the member area, the modules they call and the audits ' +
          'that check them. An edit there does not travel to the other storefronts, and ' +
          'what breaks is an order, not a layout. If the change is right, make it in the ' +
          'template.'
      );
      continue;
    }
    unlocked.add(rel);
  }
  return { unlocked, errors };
}

/** Generated per build; hashing them would compare artefacts, not sources. */
const IGNORED = new Set(['template.lock.json']);

const toPosix = (p) => p.split(path.sep).join('/');

async function walk(root, dir, out) {
  let entries;
  try {
    entries = await readdir(path.join(root, dir), { withFileTypes: true });
  } catch {
    return out; // a root the shop does not have; reported as missing later
  }
  for (const entry of entries) {
    const rel = toPosix(path.join(dir, entry.name));
    if (entry.isDirectory()) await walk(root, rel, out);
    else out.push(rel);
  }
  return out;
}

/** Every path the lock covers, in sorted order, relative to the repo root. */
export async function lockedFiles(root) {
  const unlocked = new Set(UNLOCKED);
  const found = [];
  for (const entry of LOCKED_ROOTS) {
    const full = path.join(root, entry);
    let isDir = false;
    try {
      const stat = await readdir(full);
      isDir = Array.isArray(stat);
    } catch {
      isDir = false;
    }
    if (isDir) await walk(root, entry, found);
    else found.push(toPosix(entry));
  }
  return found
    .filter((p) => !unlocked.has(p) && !IGNORED.has(path.basename(p)))
    .sort();
}

export async function hashFile(root, rel) {
  const body = await readFile(path.join(root, rel));
  return createHash('sha256').update(body).digest('hex').slice(0, 16);
}

export const LOCK_FILE = 'template.lock.json';
