/**
 * The core / presentation split, and the one thing it must never allow.
 *
 * The lock used to say one word about seventy-five files. It now says two, and
 * the whole value of the second is that `core` cannot be talked out of. A shop
 * declaring `src/scripts/checkout.ts` in `brand/unlock.ts` must fail, by name,
 * every time — not be quietly ignored, and certainly not honoured.
 *
 * These are unit tests over `scripts/template-lock.mjs` rather than runs of the
 * audit, because the audit needs a repository and the decision does not. What
 * the audit adds on top is throwing on the errors this returns, which is one
 * line and is exercised by the template's own `npm run audit:template` on every
 * build.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  CORE,
  CORE_TIER,
  LOCK_FILE,
  PRESENTATION,
  PRESENTATION_TIER,
  classifyUnlocks,
  lockEntries,
  tierOf,
} from '../scripts/template-lock.mjs';
import { unlockedPaths } from '../scripts/brand-facts.mjs';

const root = process.cwd();
const lock = JSON.parse(await readFile(path.join(root, LOCK_FILE), 'utf8'));

describe('tierOf: which half of the lock a file is in', () => {
  it('puts money and membership in core', () => {
    for (const rel of [
      'src/scripts/checkout.ts',
      'src/scripts/cart.ts',
      'src/lib/commerce.ts',
      'src/layouts/BaseLayout.astro',
      'scripts/audit-template.mjs',
      'astro.config.ts',
      'tsconfig.json',
      '.gitignore',
      'docs/PITFALLS.md',
    ]) {
      assert.equal(tierOf(rel), CORE_TIER, rel);
    }
  });

  it('puts pages, routes, components and styles in presentation', () => {
    for (const rel of [
      'src/pages/index.astro',
      'src/routes/checkout/index.astro',
      'src/routes/faq.astro',
      'src/components/common/Header.astro',
      'src/components/cart/CartDrawer.astro',
      'src/components/common/PageHero.astro',
      'src/styles/global.css',
    ]) {
      assert.equal(tierOf(rel), PRESENTATION_TIER, rel);
    }
  });

  it('keeps BeaconBoot in core even though it sits among the components', () => {
    /* An exact core path beats the presentation directory it lives in. If CORE
       stopped being consulted first this would silently become unlockable, and
       the file that boots the analytics beacon would be a shop's to delete. */
    assert.equal(tierOf('src/components/common/BeaconBoot.astro'), CORE_TIER);
    assert.equal(tierOf('src/components/common/Footer.astro'), PRESENTATION_TIER);
  });

  it('refuses to guess at a path in neither list', () => {
    assert.throws(() => tierOf('src/utils/whatever.ts'), /belongs to no tier/);
  });

  it('has no path that both lists claim', () => {
    /* Order makes CORE win, which is the safe direction — but a genuine overlap
       is somebody having classified one thing twice, and the next reader would
       have to know about the ordering to predict the answer. */
    const overlap = PRESENTATION.filter((entry) => CORE.includes(entry));
    assert.deepEqual(overlap, []);
  });
});

describe('the lock this template ships', () => {
  it('gives every locked file a tier', () => {
    const entries = lockEntries(lock);
    assert.ok(entries.size > 0);
    for (const [rel, entry] of entries) {
      assert.ok(
        entry.tier === CORE_TIER || entry.tier === PRESENTATION_TIER,
        `${rel} has tier ${entry.tier}`
      );
      assert.equal(entry.tier, tierOf(rel), `${rel} is filed against its own rule`);
    }
  });

  it('locks the three page primitives as presentation', () => {
    const entries = lockEntries(lock);
    for (const file of ['PageHero', 'Breadcrumb', 'TrustBand']) {
      const rel = `src/components/common/${file}.astro`;
      const entry = entries.get(rel);
      assert.ok(entry, `${rel} is not in ${LOCK_FILE}`);
      assert.equal(entry.tier, PRESENTATION_TIER, rel);
    }
  });

  it('rejects a lock from before the split instead of guessing', () => {
    assert.throws(
      () => lockEntries({ locked: { 'src/lib/commerce.ts': 'deadbeefdeadbeef' } }),
      /predates the core\/presentation split/
    );
  });

  it('rejects a tier that is neither', () => {
    assert.throws(
      () => lockEntries({ locked: { 'src/routes/faq.astro': { hash: 'abc', tier: 'shop' } } }),
      /has to be/
    );
  });
});

describe('brand/unlock.ts: what a shop may and may not declare', () => {
  const entries = lockEntries(lock);

  it('is empty in the template itself', () => {
    /* The template has taken nothing over from itself, and a non-empty list
       here would travel into every fork as a default. */
    assert.deepEqual([...unlockedPaths], []);
  });

  it('lets a shop unlock a presentation file', () => {
    const { unlocked, errors } = classifyUnlocks(['src/routes/checkout/index.astro'], entries);
    assert.deepEqual(errors, []);
    assert.ok(unlocked.has('src/routes/checkout/index.astro'));
  });

  it('refuses a core file, and says that it is core', () => {
    const { unlocked, errors } = classifyUnlocks(['src/scripts/checkout.ts'], entries);
    assert.equal(unlocked.size, 0);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /CORE/);
    assert.match(errors[0], /src\/scripts\/checkout\.ts/);
  });

  it('refuses a path the lock does not have, rather than doing nothing', () => {
    /* A typo that silently did nothing is the worst outcome available: the shop
       believes the page is its own until an edit to it fails as drift, with a
       message that mentions none of this. */
    const { errors } = classifyUnlocks(['src/routes/fqa.astro'], entries);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /not a file this template locks/);
  });

  it('honours the good lines in a list that also has a bad one', () => {
    /* The audit throws on any error, so nothing is honoured in practice — but
       the classification has to be per-line, or the error message can only ever
       name the first thing wrong. */
    const { unlocked, errors } = classifyUnlocks(
      ['src/routes/faq.astro', 'src/lib/commerce.ts'],
      entries
    );
    assert.deepEqual([...unlocked], ['src/routes/faq.astro']);
    assert.equal(errors.length, 1);
  });

  it('ignores blank lines and a leading ./', () => {
    const { unlocked, errors } = classifyUnlocks(['', '  ', './src/routes/faq.astro'], entries);
    assert.deepEqual(errors, []);
    assert.deepEqual([...unlocked], ['src/routes/faq.astro']);
  });
});
