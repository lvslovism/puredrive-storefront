/**
 * Anti-drift check: the shared half of this storefront still matches the
 * template it came from.
 *
 * This replaces "src/ is byte-identical to the template", which was one rule
 * covering two kinds of file and true of only one of them. Checkout and the
 * member area are shared because nobody designs them; the home page is the
 * shop's own because everybody designs it. See scripts/template-lock.mjs for
 * where the line runs and why.
 *
 * What a failure MEANS: shared code has been edited in one storefront. That is
 * worth failing a build over, because the edit does not travel — every other
 * shop keeps the old behaviour, and the next template sync either reverts the
 * change silently or collides with it. A fix that belongs in shared code
 * belongs in the template, and then in everybody.
 *
 * What is NOT a failure: the shop's own files having changed. They are listed
 * as `baseline`, printed for orientation, and never enforced. Diverging there
 * is the shop doing its job.
 *
 * ## The second thing that is not a failure
 *
 * Locked files come in two tiers now — see the block above `CORE` in
 * scripts/template-lock.mjs. `core` is enforced here exactly as everything was
 * before. `presentation` is enforced too, UNLESS this shop has named the file
 * in `brand/unlock.ts`, in which case it is reported and left alone.
 *
 * That is the same shape as `baseline`, one layer out: a file the shop has
 * taken responsibility for, said so about in a file a reviewer can read, and is
 * now on its own with. The declaration is checked — a core path or a path the
 * lock does not have fails, by name — because the failure mode of a
 * declaration that quietly did nothing is a shop that thinks a page is its own
 * until an edit to it fails as drift, with a message about none of this.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  UNLOCKED,
  LOCK_FILE,
  PRESENTATION_TIER,
  hashFile,
  lockEntries,
  classifyUnlocks,
} from './template-lock.mjs';
import { unlockFile, unlockedPaths } from './brand-facts.mjs';

const root = process.cwd();

let lock;
try {
  lock = JSON.parse(await readFile(path.join(root, LOCK_FILE), 'utf8'));
} catch {
  throw new Error(
    `audit-template: no ${LOCK_FILE} in this repository. It records which files are ` +
      'shared with the template and what they hashed to. Copy it from the template ' +
      '(it is generated there by scripts/write-template-lock.mjs) — without it, ' +
      'nothing is checking that the shared half of this storefront is still shared.'
  );
}

const entries = lockEntries(lock);

/* What this shop says it has taken over, and every reason a line could not be
   honoured. Refusals throw before a single hash is compared: a declaration that
   did not take is a wrong belief about which files are enforced, and continuing
   would enforce them without ever mentioning the lines that tried to say
   otherwise. */
const { unlocked, errors } = classifyUnlocks(unlockedPaths, entries);
if (errors.length > 0) {
  throw new Error(
    `${errors.length} declaration(s) in ${unlockFile} cannot be honoured:\n  ` +
      errors.join('\n  ')
  );
}

const drifted = [];
const missing = [];
const shopUnlocked = [];
let checked = 0;

for (const [rel, entry] of entries) {
  if (entry.tier === PRESENTATION_TIER && unlocked.has(rel)) {
    shopUnlocked.push(rel);
    continue;
  }
  let actual;
  try {
    actual = await hashFile(root, rel);
  } catch {
    missing.push(rel);
    continue;
  }
  checked += 1;
  if (actual !== entry.hash) drifted.push(rel);
}

if (missing.length > 0) {
  throw new Error(
    `${missing.length} template file(s) are missing from this storefront:\n  ` +
      missing.join('\n  ') +
      '\n\nThey are shared code. A deleted one is not a customisation — it is a page ' +
      'or a module the rest of the family still has.'
  );
}

if (drifted.length > 0) {
  /* The tier travels with the filename, because it decides what the reader is
     supposed to do next. Telling a shop to take its redrawn FAQ page back to
     the template is now wrong advice, and telling it to declare its checkout
     script in brand/unlock.ts is worse than wrong. */
  const presentation = drifted.filter((rel) => entries.get(rel).tier === PRESENTATION_TIER);
  throw new Error(
    `${drifted.length} shared file(s) have been edited in this storefront:\n  ` +
      drifted.map((rel) => `${rel}  [${entries.get(rel).tier}]`).join('\n  ') +
      '\n\nThese belong to the template, so an edit here does not travel: every other ' +
      'storefront keeps the old behaviour, and the next sync will either revert this ' +
      'silently or collide with it. Make the change in the template and take it back ' +
      'from there.' +
      (presentation.length
        ? `\n\n${presentation.length} of them are presentation — pages, components, styles. ` +
          `If this shop has genuinely drawn its own, name them in ${unlockFile} and they ` +
          'stop being enforced here. It is not free: the template\'s later fixes to those ' +
          'files stop arriving, and `npm run template:report` in the template is what ' +
          'shows you which ones.'
        : '')
  );
}

/* The shop's own files. Reported, never enforced. */
const customised = [];
for (const rel of UNLOCKED) {
  const was = lock.baseline?.[rel];
  if (!was) continue;
  let now;
  try {
    now = await hashFile(root, rel);
  } catch {
    continue;
  }
  if (now !== was) customised.push(rel);
}

const at = (lock.template?.commit ?? '').slice(0, 7) || 'unknown';
console.log(
  `Template boundary verified: ${checked} shared file(s) match the template at ${at}. ` +
    `${customised.length} of ${UNLOCKED.length} shop-owned file(s) customised` +
    (customised.length ? ` (${customised.map((p) => path.basename(p)).join(', ')})` : '') +
    '.'
);

/* Printed every run, whether it is zero or twenty. An unlock is a page the
   template has stopped fixing for this shop, and the only thing standing
   between that and "nobody knew" is a line of output nobody has to ask for. */
if (shopUnlocked.length > 0) {
  console.log(
    `${shopUnlocked.length} shop-unlocked file(s), declared in ${unlockFile} and not ` +
      `enforced here:\n  ${shopUnlocked.join('\n  ')}\n` +
      'The template no longer carries fixes into these. `npm run template:report` in the ' +
      'template says what it has that this shop has not.'
  );
}
