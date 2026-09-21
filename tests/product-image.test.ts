/**
 * Regression test for the empty-<img> defect.
 *
 * A product whose `thumbnail` the merchant has not filled in arrived as `null`.
 * Astro drops null attributes, so the card rendered `<img>` with no `src` — an
 * empty box on every product surface — and the build stayed green throughout.
 *
 * The contract this locks down: a missing thumbnail resolves to a placeholder
 * that ACTUALLY EXISTS in brand/assets/products/, the same one every time, and
 * a real thumbnail is passed through untouched.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import path from 'node:path';

import {
  PLACEHOLDER_COUNT,
  hasThumbnail,
  placeholderThumbnail,
  withThumbnail,
} from '../src/lib/product-image.ts';

describe('missing product thumbnails fall back to a real placeholder', () => {
  test('null/blank falls back, real URLs pass through, and the file is on disk', () => {
    const shipped = new Set(
      readdirSync(path.join(process.cwd(), 'brand', 'assets', 'products')).filter((name) =>
        name.startsWith('placeholder-'),
      ),
    );

    // The module's count must not drift from what brand/assets actually ships —
    // otherwise the fallback points at a 404 and we are back to a broken image.
    assert.equal(
      shipped.size,
      PLACEHOLDER_COUNT,
      `PLACEHOLDER_COUNT says ${PLACEHOLDER_COUNT}, brand/assets/products ships ${shipped.size}`,
    );

    // Every failure shape the API can produce for "no image".
    for (const empty of [null, undefined, '', '   ']) {
      const product = { handle: 'citrus-hand-wash', thumbnail: empty as any };
      assert.equal(hasThumbnail(product), false);
      const resolved = withThumbnail(product);
      assert.ok(
        typeof resolved.thumbnail === 'string' && resolved.thumbnail.length > 0,
        'a missing thumbnail must never reach the page as null — that is the empty <img>',
      );
      assert.ok(
        shipped.has(path.basename(resolved.thumbnail)),
        `${resolved.thumbnail} is not a file brand/assets/products actually ships`,
      );
    }

    // Stable: keyed on the handle, so a rebuild — or a sibling product being
    // unpublished — does not reshuffle which placeholder a card shows.
    assert.equal(placeholderThumbnail('citrus-hand-wash'), placeholderThumbnail('citrus-hand-wash'));
    assert.notEqual(placeholderThumbnail('a'), placeholderThumbnail('a-different-handle-entirely'));

    // A product that HAS artwork is returned unchanged, same object identity.
    const real = { handle: 'lemon-soap-trio', thumbnail: 'https://cdn.example.com/soap.webp' };
    assert.equal(hasThumbnail(real), true);
    assert.equal(withThumbnail(real), real);
  });
});
