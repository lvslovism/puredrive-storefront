/**
 * How `audit:brand` decides a line contains a brand string.
 *
 * The audit's needle test was a plain case-folded substring match, which is
 * right for the needles it was written against — `thesix`, `lovism`, single
 * tokens nobody types by accident — and wrong the moment a shop is called
 * something that is also ordinary English. A storefront named THE SIX failed
 * this audit on six lines of the template's own prose ("the six colour roles a
 * block needs", "the sixth special case", "the sixteen-tokens-for-six-jobs").
 * Every hit was a comment, none was residue, and the shop had no way to pass
 * short of renaming itself.
 *
 * The fix is word-boundary matching FOR NEEDLES CONTAINING WHITESPACE only.
 * The single-token case deliberately keeps the substring test, and this file
 * pins that asymmetry, because the obvious "just use \b everywhere" is a
 * regression: `_` is a word character, so `\bthesix\b` does not match
 * `thesix_session_id`, and storage keys are exactly where brand residue hides.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matches, hitsIn, SHOP, RESIDUE } from '../scripts/audit-brand.mjs';

test('a multi-word needle does not match a longer word that starts with it', () => {
  // The six real false positives that made the audit unpassable for THE SIX.
  assert.equal(matches('the six', ' * ## The property that stops the sixth special case'), false);
  assert.equal(matches('the six', ' * private ink set, which is the sixteen-tokens-for-six-jobs shape'), false);
  assert.equal(matches('THE SIX', 'the sixth'), false);
  assert.equal(matches('THE SIX', 'the sixteen'), false);
  assert.equal(matches('THE SIX', 'the sixty-fourth'), false);
});

test('a multi-word needle still matches where it is genuinely present', () => {
  assert.equal(matches('the six', 'THE SIX storefront'), true, 'case folds');
  assert.equal(matches('the six', 'the six.'), true, 'sentence-final full stop is a boundary');
  assert.equal(matches('the six', '(the six)'), true, 'brackets are boundaries');
  assert.equal(matches('THE SIX', 'welcome to the six'), true, 'end of line is a boundary');
  assert.equal(matches('THE SIX', 'the six'), true, 'the whole line');
  assert.equal(matches('THE SIX', '"description": "the six — tactical gear"'), true);
});

test('a whitespace-free needle keeps substring matching, so storage keys still fail', () => {
  // The regression a uniform \b would have introduced. `_` is a word character,
  // so \bthesix\b does NOT match any of these.
  assert.equal(matches('thesix', 'thesix_session_id'), true);
  assert.equal(matches('thesix', 'const LS_CART = "thesix_cart_id";'), true);
  assert.equal(matches('thesix', 'window.__thesixBeacon'), true);
  assert.equal(matches('thesix', '__THESIX__'), true);
  assert.equal(matches('lovism', '"name": "lovism-new-website"'), true);
  assert.equal(matches('example-store', 'example-store-storefront'), true);
});

test('diacritic folding is unchanged', () => {
  assert.equal(matches('ÉLANE', 'elane_cart_id'), true);
  assert.equal(matches('elane', 'ÉLANE'), true);
});

test('regex metacharacters in a needle are matched literally, not as syntax', () => {
  // A shop called "100% Liberty" must not compile to a broken or greedy pattern.
  assert.equal(matches('100% liberty', 'the 100% liberty pro 3'), true);
  assert.equal(matches('a.b c', 'a.b c'), true);
  assert.equal(matches('a.b c', 'axb c'), false, 'the dot is literal');
});

/**
 * Which FILES a needle is looked for in.
 *
 * Word boundaries fixed 'the sixth' and 'the sixteen' but not the four template
 * lines that contain the phrase "the six" outright — "the six colour roles a
 * block needs", "The six blocks that own a ground". Those live in locked files,
 * which the shop cannot edit, so scope is the only thing that can resolve them:
 * a locked file is byte-for-byte the template's, and the template has never
 * heard of this shop.
 */
const LOCKED = new Set(['src/lib/ground.ts', 'src/lib/grounds.mjs', '.gitignore']);
const shopNeedle = (value) => ({ value, scope: SHOP });
const residueNeedle = (value) => ({ value, scope: RESIDUE });

test('a shop needle is not looked for inside a locked template file', () => {
  const six = shopNeedle('THE SIX');
  // The four that word boundaries could not reach.
  assert.equal(hitsIn(six, ' * Grounds: the six colour roles a block needs, and the two ways to fill them.', 'src/lib/ground.ts', LOCKED), false);
  assert.equal(hitsIn(six, " * This shop's ground table: the template's default four, with the six blocks", 'src/lib/ground.ts', LOCKED), false);
  assert.equal(hitsIn(six, ' * The six blocks that own a ground, and the background token each one paints.', 'src/lib/grounds.mjs', LOCKED), false);
  assert.equal(hitsIn(six, ' * through roles. Only the six CSS_ROLES are emitted', 'src/lib/grounds.mjs', LOCKED), false);
});

test('a shop needle IS looked for in a file the shop owns', () => {
  const six = shopNeedle('THE SIX');
  assert.equal(hitsIn(six, 'const title = "THE SIX";', 'src/components/home/HomeLanding.astro', LOCKED), true);
  assert.equal(hitsIn(six, '"name": "the six storefront"', 'package.json', LOCKED), true);
});

test('an extraction-residue needle is still looked for inside locked files', () => {
  const lovism = residueNeedle('lovism');
  assert.equal(hitsIn(lovism, ' * carried "name": "lovism-new-website" through every fork', 'src/lib/ground.ts', LOCKED), true);
  assert.equal(hitsIn(lovism, 'const KEY = "lovism_cart_id";', 'src/lib/grounds.mjs', LOCKED), true);
  assert.equal(hitsIn(lovism, '"name": "lovism-new-website"', 'package-lock.json', LOCKED), true);
});

test('with no lock available, nothing is narrowed', () => {
  // A missing or unreadable lock must not silently shrink the audit.
  assert.equal(hitsIn(shopNeedle('THE SIX'), 'the six blocks', 'src/lib/ground.ts', null), true);
});
