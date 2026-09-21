/**
 * What has the template changed that a storefront has not taken?
 *
 *   node scripts/template-report.mjs ../LEMONE ../Pawfect ../NORDIC ...
 *
 * Run FROM THE TEMPLATE, which is the only place that has both sides.
 *
 * ## The cost this exists to pay
 *
 * Unlocking the home page buys a shop the right to change it without a
 * five-repo sync. The bill arrives later and in the other direction: a bug
 * fixed in the template's home components does not reach the shops any more,
 * and — worse — nothing says so. A silent loss of propagation is the real risk
 * of drawing this line, not the divergence itself.
 *
 * So the line is drawn WITH a report rather than without one. For every
 * shop-owned file this prints one of four states:
 *
 *   in step           the shop still has the template's current bytes
 *   forked            the shop changed it, and the template has not moved
 *                     since. Nothing to take.
 *   CAN TAKE CLEANLY  the template moved and the shop never edited this file,
 *                     so the newer version is a copy
 *   NEEDS REVIEW      both moved. Taking the template's version is a merge
 *
 * The last two are separated because they ask different questions. "Do we want
 * this fix?" is a decision; "how do we combine it with what we already did?" is
 * work. Reporting them as one state would hide which of the two a shop is in.
 *
 * It deliberately does not merge, and it deliberately does not fail. A shop's
 * home page is its own; the template's newer version is a suggestion, and the
 * only honest thing an automated tool can do with a suggestion is show it to
 * somebody. What it removes is the "nobody knew" failure mode.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { UNLOCKED, LOCK_FILE, hashFile } from './template-lock.mjs';

const root = process.cwd();
const sites = process.argv.slice(2);

if (sites.length === 0) {
  console.error('usage: node scripts/template-report.mjs <siteDir> [siteDir...]');
  process.exit(2);
}

/** The template's own current bytes for every shop-owned file. */
const current = {};
for (const rel of UNLOCKED) current[rel] = await hashFile(root, rel);

let needReview = 0;
let takeable = 0;

for (const site of sites) {
  const name = path.basename(path.resolve(site));
  let lock;
  try {
    lock = JSON.parse(await readFile(path.join(site, LOCK_FILE), 'utf8'));
  } catch {
    console.log(`\n${name}: no ${LOCK_FILE} — has not taken the boundary change yet.`);
    continue;
  }

  const at = (lock.template?.commit ?? '').slice(0, 7) || 'unknown';
  console.log(`\n${name}  (forked from ${at})`);

  for (const rel of UNLOCKED) {
    const baseline = lock.baseline?.[rel];
    let theirs;
    try {
      theirs = await hashFile(site, rel);
    } catch {
      console.log(`  ${rel}\n      absent in this shop`);
      continue;
    }

    const templateMoved = baseline !== undefined && current[rel] !== baseline;
    const shopChanged = baseline !== undefined && theirs !== baseline;

    const target = path.join(site, rel).split(path.sep).join('/');

    if (theirs === current[rel]) {
      console.log(`  ${rel}\n      in step with the template`);
    } else if (templateMoved && !shopChanged) {
      // The shop never touched this file, so the template's newer version can
      // simply be copied. Worth separating from the case below: this one is a
      // decision about whether to take a fix, not about how to merge it.
      takeable += 1;
      console.log(
        `  ${rel}\n      CAN TAKE CLEANLY — the template moved, this shop never edited it.\n` +
          `      copy: cp ${rel} ${target}`
      );
    } else if (templateMoved && shopChanged) {
      needReview += 1;
      console.log(
        `  ${rel}\n      NEEDS REVIEW — both moved. The template has a newer version and\n` +
          `      this shop has its own; taking it is a merge, not a copy.\n` +
          `      diff: git show HEAD:${rel} | diff - ${target}`
      );
    } else if (shopChanged) {
      console.log(`  ${rel}\n      forked; the template has not moved since. Nothing to take.`);
    } else {
      console.log(`  ${rel}\n      differs, but no baseline recorded — re-lock this shop.`);
    }
  }
}

console.log(
  `\n${takeable} file(s) can be taken cleanly, ${needReview} need review.` +
    (takeable + needReview
      ? '\nWhether the template\'s newer version is a fix worth taking is a judgement,\n' +
        'which is why this reports rather than merges.'
      : '')
);
