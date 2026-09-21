/**
 * Anti-corrosion check: no brand string may appear in `src/`.
 *
 * The fill layer only works if `src/` is genuinely ignorant of which shop it is
 * rendering. That property is easy to state, easy to believe, and easy to lose —
 * one hard-coded shop name in a page's meta description is invisible in a
 * screenshot and survives a fully green build. So it is checked, not assumed.
 *
 * Two families of needle, over two different sets of files:
 *
 *   1. Whatever `brand/` currently says the shop is called — its name, its
 *      wordmark, its storage namespace, its merchant code. These change per
 *      storefront, so they are read out of `brand/` rather than listed, and
 *      they are scanned over the files THIS SHOP OWNS. A locked file is
 *      byte-for-byte the template's (`audit:template` proves it), and the
 *      template has never heard of this shop, so a hit there is always a
 *      collision with the template's own prose rather than residue.
 *
 *   2. The strings belonging to the storefront this template was extracted
 *      from. Those never become legal again, whatever `brand/` says, and they
 *      are scanned over EVERYTHING — locked files included, because they are
 *      illegal in the template itself.
 *
 * A hit is a failure even when everything else is green.
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  brandName,
  logoText,
  storageNamespace,
  merchantCode,
  extractionResidue,
  unlockedPaths,
} from './brand-facts.mjs';
import { LOCK_FILE } from './template-lock.mjs';

const root = process.cwd();
const sourceDir = path.join(root, 'src');
const EXTENSIONS = new Set(['.astro', '.ts', '.tsx', '.js', '.mjs', '.css', '.json', '.md']);

function unique(values) {
  return [...new Set(values.filter((value) => value && value.trim().length > 1))];
}

/**
 * Matching folds case AND diacritics.
 *
 * Case alone is not enough: `'ÉLANE'.toLowerCase()` is `élane`, which does not
 * contain the ASCII `elane` that turns up in storage keys, event names and
 * e-mail addresses — the very places brand residue hides. Stripping combining
 * marks makes `elane` fail as loudly as `ÉLANE`.
 */
const fold = (value) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * How a needle is looked for, which depends on whether it contains a SPACE.
 *
 * A substring test was the whole of this for as long as the audit existed, and
 * it works for the needles it was written against — namespaces and codes, which
 * are single tokens nobody writes by accident. It breaks the moment a shop is
 * called something that is also ordinary English: a storefront named THE SIX
 * failed this audit on six lines of the TEMPLATE'S OWN prose, including
 * "the six colour roles a block needs" and "the sixth special case". Every hit
 * was a comment. None was residue. The audit was unpassable for that shop and
 * the only fix available to it would have been to change its name.
 *
 * So a needle containing whitespace is matched at WORD BOUNDARIES. That is
 * enough on its own: "the six" no longer matches "the sixth" or "the sixteen",
 * and still matches "THE SIX storefront", "the six." and "(the six)".
 *
 * A needle WITHOUT whitespace keeps the substring test, and that is not
 * laziness — \b would silently weaken it. `_` is a word character, so
 * `\bthesix\b` does not match `thesix_session_id` or `thesix_cart_id`, and
 * storage keys are named in the fold() note above as the very place residue
 * hides. Applying boundaries uniformly would have fixed a false positive by
 * introducing false negatives in the case the audit was built for.
 */
function needleTest(folded) {
  if (!/\s/.test(folded)) return (foldedLine) => foldedLine.includes(folded);
  const re = new RegExp(`\\b${escapeRegExp(folded)}\\b`, 'i');
  return (foldedLine) => re.test(foldedLine);
}

/** Exported for tests/audit-brand.test.mjs. Takes a RAW needle and raw line. */
export function matches(needle, line) {
  return needleTest(fold(needle))(fold(line));
}

/**
 * Two families of needle, and they are not scanned over the same files.
 *
 *   shop     What `brand/` currently says this shop is called. These are
 *            scanned over the files the SHOP can actually change.
 *   residue  The strings belonging to the storefront this template was
 *            extracted from. Scanned everywhere, locked files included — those
 *            are illegal in the template itself, so there is nowhere they are
 *            allowed to survive.
 *
 * The split exists because scanning a LOCKED file for a shop needle cannot
 * produce a true positive. `audit:template` proves those 75 files are
 * byte-for-byte the template's, and the template does not know this shop
 * exists — so a hit there is always the shop's name colliding with the
 * template's own prose. A storefront called THE SIX hit six lines of
 * `src/lib/ground.ts` and `src/lib/grounds.mjs` reading "the six colour roles a
 * block needs" and "The six blocks that own a ground". Word boundaries do not
 * help: those lines contain the phrase. The shop could not edit the files, and
 * had no way to pass short of renaming itself.
 *
 * This is not a hole. Drift in a locked file is exactly what `audit:template`
 * exists to catch, `npm test` runs both, and residue needles still sweep
 * everything — so the one thing that stops being checked is the one thing that
 * was provably impossible.
 */
export const SHOP = 'shop';
export const RESIDUE = 'residue';

/**
 * Locked paths, read from the lock the shop already carries — MINUS whatever it
 * has declared in `brand/unlock.ts`.
 *
 * The narrowing above rests on one fact: a locked file is byte-for-byte the
 * template's, so it cannot contain this shop's name. A file the shop has
 * unlocked is no longer that file. It is a page this shop has redrawn from its
 * own comp, and the first thing anybody types into a redrawn page is the shop's
 * name — which is precisely the residue this audit exists to find, in precisely
 * the file the narrowing would have skipped.
 *
 * So an unlocked file leaves the locked set here, and the shop needles sweep it
 * like any other file the shop owns. That direction is safe by construction:
 * the collision the narrowing was introduced for (a shop called THE SIX hitting
 * the template's own prose) can only happen in files the shop has NOT touched.
 */
async function lockedPaths() {
  try {
    const lock = JSON.parse(await readFile(path.join(root, LOCK_FILE), 'utf8'));
    const locked = new Set(Object.keys(lock.locked ?? {}));
    for (const rel of unlockedPaths) locked.delete(String(rel).trim().replace(/^\.\//, ''));
    return locked;
  } catch {
    // No lock, or an unreadable one: scan everything with every needle. A
    // missing lock must not silently narrow the audit.
    return null;
  }
}

const toPosix = (rel) => rel.split(path.sep).join('/');

/** Whether `needle` is looked for in `relPath`. Exported for the tests. */
export function scans(needle, relPath, locked) {
  if (needle.scope === RESIDUE) return true;
  if (!locked) return true;
  return !locked.has(toPosix(relPath));
}

/** The whole decision for one needle against one line of one file. */
export function hitsIn(needle, line, relPath, locked) {
  return scans(needle, relPath, locked) && matches(needle.value, line);
}

const build = (values, scope) =>
  unique(values).map((value) => {
    const folded = fold(value);
    return { value, folded, scope, test: needleTest(folded) };
  });

// Residue first, so that a shop which has NAMED ITSELF after the extraction
// source keeps the stricter scope: the dedupe below keeps the first occurrence,
// and residue is the one that must still sweep locked files.
const needles = [
  ...build(extractionResidue, RESIDUE),
  ...build([brandName, logoText, storageNamespace, merchantCode], SHOP)
].filter((needle, i, all) => all.findIndex((other) => other.folded === needle.folded) === i);

async function walk(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, out);
    else if (EXTENSIONS.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

/**
 * The repository ROOT, one level deep.
 *
 * `src/` was the whole of this audit for as long as the audit existed, and the
 * blind spot that left is not hypothetical: `package-lock.json` carried
 * `"name": "lovism-new-website"` — the shop this template was extracted from —
 * through every fork made since, green build after green build, because npm
 * writes that field from `package.json` and nobody re-ran `npm install` after
 * renaming the package.
 *
 * These files are not the fill layer, but they are copied into the next fork
 * VERBATIM, which puts them in the same class as `src/`: a shop name in one of
 * them is not a fact about this shop, it is residue waiting to be inherited.
 * `package.json`, `package-lock.json`, `README.md`, `wrangler.toml`,
 * `.env.example`, whatever a deploy target adds next — all of them.
 *
 * Root-level FILES only, so this never walks into `brand/` (which is supposed
 * to say the shop's name), `node_modules/` or `dist/`. No extension allowlist
 * either: an allowlist is a list somebody has to remember to extend the day a
 * new config file lands, which is exactly how the last blind spot opened.
 */
const BINARY = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.ico', '.woff', '.woff2', '.ttf', '.otf', '.pdf', '.zip']);

/**
 * A build artefact declares itself, in its first few lines.
 *
 * The audit's premise is that a root file gets copied into the next fork
 * VERBATIM, which is what makes a shop name in one of them residue. A file
 * regenerated from `brand/` on every build breaks that premise: its brand
 * strings are not inherited, they are re-derived, and the shop name being in
 * there is the mechanism working rather than failing. `wrangler.jsonc` is one
 * — the Worker name has to be unique per shop, so it is derived from the
 * storage namespace rather than typed.
 *
 * A MARKER rather than a filename list, deliberately, and for the same reason
 * there is no extension allowlist: a list is a thing somebody has to remember
 * to extend the day a new generated file lands, which is exactly how the last
 * blind spot opened. A generated file says it is generated; a residue file
 * would have to be edited to claim the same, which is a deliberate act and a
 * visible one in review.
 */
const GENERATED = /GENERATED by scripts\//;

async function rootFiles(out = []) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (BINARY.has(path.extname(entry.name).toLowerCase())) continue;
    const full = path.join(root, entry.name);
    const head = (await readFile(full, 'utf8').catch(() => '')).slice(0, 400);
    if (GENERATED.test(head)) continue;
    out.push(full);
  }
  return out;
}

async function audit() {
  const locked = await lockedPaths();
  const hits = [];
  for (const file of [...(await walk(sourceDir)), ...(await rootFiles())]) {
    const rel = path.relative(root, file);
    const applicable = needles.filter((needle) => scans(needle, rel, locked));
    if (!applicable.length) continue;
    const lines = (await readFile(file, 'utf8')).split(/\r?\n/);
    lines.forEach((line, index) => {
      const folded = fold(line);
      for (const needle of applicable) {
        if (needle.test(folded)) {
          hits.push(`${rel}:${index + 1}  ${needle.value}  ${line.trim().slice(0, 100)}`);
        }
      }
    });
  }

  if (hits.length) {
    throw new Error(
      `${hits.length} brand string(s) found in src/ or in a root config file. ` +
        `They belong in brand/:\n  ${hits.join('\n  ')}`
    );
  }

  const shopCount = needles.filter((n) => n.scope === SHOP).length;
  const residueCount = needles.length - shopCount;
  console.log(
    `Brand isolation verified: ${shopCount} shop string(s) checked against the files this ` +
      `shop owns, ${residueCount} extraction residue string(s) against everything ` +
      `including the ${locked ? locked.size : 0} locked file(s), none present. (${brandName})`
  );
}

/**
 * Run only when INVOKED, so the test file can import `matches` without the
 * import itself walking the repository and throwing. `npm run audit:brand` is
 * unchanged: it runs this file directly and gets the same scan and the same
 * exit behaviour it always had.
 */
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await audit();
}
