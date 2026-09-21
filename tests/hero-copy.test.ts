/**
 * The hero-block guard has to FAIL. A validator nothing can trip is the same
 * defect one layer up from the one it was written for.
 *
 * The defect: `homeLanding.hero` shipped without its required `tone`. The type
 * says the field is required, but nothing type-checks — `npm run build` is
 * `astro build`, and `astro check` is not in the pipeline — so `undefined` went
 * straight into a template literal and the landing preset built a green
 * `class="home-hero home-hero--undefined"`. A class no rule matches, a page
 * that renders, and a hero quietly missing the legibility scrim its tone was
 * there to select.
 *
 * `assertHeroCopy` turns that into a build failure. What it CANNOT do is look
 * at a preset nobody selected, which is where the defect actually was — so
 * src/pages/index.astro runs it over every preset brand/copy.ts ships, on every
 * build. (That check lives in the module graph rather than here because
 * `brand/` is TypeScript importing extensionless paths, which plain Node
 * cannot resolve; Vite can, and the build is Vite.)
 *
 * This file covers the other half: that the guard fires, and says which field
 * and which preset.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  assertHeroCopy,
  heroCopyGround,
  heroMobileCopyGround,
  HERO_TONES,
  COPY_GROUNDS,
} from '../src/lib/hero-copy.ts';

/** A complete block, so each case below differs from it in exactly one way. */
const COMPLETE = {
  tone: 'light',
  eyebrow: 'EXAMPLE',
  title: '標題',
  description: '描述',
  ctaLabel: '立即選購',
  ctaHref: '/products',
  image: '/assets/home/hero.svg',
  mobileImage: '/assets/home/hero-mobile.svg',
  imageAlt: '首頁主視覺',
};

describe('the hero block is verified where it is rendered', () => {
  test('a complete block passes, with and without the optional panel', () => {
    assert.doesNotThrow(() => assertHeroCopy(COMPLETE, 'homeLanding'));
    for (const tone of HERO_TONES) {
      assert.doesNotThrow(() => assertHeroCopy({ ...COMPLETE, tone }, 'homeLanding'));
    }
    for (const copyGround of COPY_GROUNDS) {
      assert.doesNotThrow(() => assertHeroCopy({ ...COMPLETE, copyGround }, 'homeLanding'));
    }
  });

  test('a missing tone throws, naming the preset and the field', () => {
    const { tone, ...toneless } = COMPLETE;
    assert.throws(() => assertHeroCopy(toneless, 'homeLanding'), /homeLanding\.hero\.tone/);
  });

  test('a tone outside the two the stylesheet knows throws', () => {
    assert.throws(() => assertHeroCopy({ ...COMPLETE, tone: 'muted' }, 'x'), /tone/);
  });

  test('a blank required field is as broken as a missing one', () => {
    assert.throws(() => assertHeroCopy({ ...COMPLETE, imageAlt: '   ' }, 'x'), /imageAlt/);
    const { ctaLabel, ...unlabelled } = COMPLETE;
    assert.throws(() => assertHeroCopy(unlabelled, 'x'), /ctaLabel/);
  });

  /**
   * The one field that is allowed to be empty, and the reason it is: a comp
   * with no line above the headline is an editorial choice, and forcing a word
   * into it would be the guard inventing content. The KEY still has to exist —
   * "chose not to have one" and "forgot" look identical in a rendered page.
   */
  test('an empty eyebrow is a choice; a missing eyebrow key is not', () => {
    assert.doesNotThrow(() => assertHeroCopy({ ...COMPLETE, eyebrow: '' }, 'x'));
    const { eyebrow, ...noKey } = COMPLETE;
    assert.throws(() => assertHeroCopy(noKey, 'x'), /no eyebrow key/);
  });

  test('copyGround is one of the three or absent — a near-miss is a typo, not a ground', () => {
    assert.throws(() => assertHeroCopy({ ...COMPLETE, copyGround: 'panels' }, 'x'), /copyGround/);
    assert.throws(() => assertHeroCopy({ ...COMPLETE, copyGround: true }, 'x'), /copyGround/);
  });

  /**
   * Absent has to keep meaning what the two tones meant on their own, or every
   * brand file that predates the field renders something it did not ask for.
   */
  test('an absent copyGround falls back to what the tone always meant', () => {
    assert.equal(heroCopyGround({ tone: 'light' }), 'scrim');
    assert.equal(heroCopyGround({ tone: 'dark' }), 'none');
    assert.equal(heroCopyGround({ tone: 'light', copyGround: 'none' }), 'none');
    assert.equal(heroCopyGround({ tone: 'dark', copyGround: 'panel' }), 'panel');
  });

  /**
   * The phone's ground INHERITS the desktop answer when unset. It does not
   * default to 'none'.
   *
   * This is the whole safety property of adding the field: every shop that
   * existed before it keeps rendering what it rendered, on both breakpoints.
   * Defaulting to 'none' would have stripped the scrim off every phone hero in
   * the family — the one surface where the measurements say a ground is most
   * often needed — and it would have done it silently, on shops that never
   * touched a line.
   *
   * The third case is a live shop's exact shape: `copyGround: 'none'` with no
   * mobile override, measured at 0.00% under AA on both crops. It must resolve
   * to 'none' on the phone, or that shop's hero gains a wash it measured its
   * way out of.
   */
  test('an absent mobileCopyGround inherits, and never silently means none', () => {
    assert.equal(heroMobileCopyGround({ tone: 'light' }), 'scrim');
    assert.equal(heroMobileCopyGround({ tone: 'dark' }), 'none');
    assert.equal(heroMobileCopyGround({ tone: 'light', copyGround: 'none' }), 'none');
    assert.equal(heroMobileCopyGround({ tone: 'light', copyGround: 'scrim' }), 'scrim');
    assert.equal(heroMobileCopyGround({ tone: 'light', copyGround: 'panel' }), 'panel');
  });

  test('a mobileCopyGround that is set overrides the desktop answer, both ways', () => {
    assert.equal(heroMobileCopyGround({ tone: 'light', mobileCopyGround: 'panel' }), 'panel');
    assert.equal(
      heroMobileCopyGround({ tone: 'light', copyGround: 'none', mobileCopyGround: 'panel' }),
      'panel',
    );
    assert.equal(
      heroMobileCopyGround({ tone: 'light', copyGround: 'panel', mobileCopyGround: 'none' }),
      'none',
    );
    // …and setting it leaves the desktop answer alone, which is the point.
    assert.equal(
      heroCopyGround({ tone: 'light', copyGround: 'none', mobileCopyGround: 'panel' }),
      'none',
    );
  });

  test('a mobileCopyGround outside the three throws, naming that field', () => {
    assert.throws(
      () => assertHeroCopy({ ...COMPLETE, mobileCopyGround: 'panels' }, 'x'),
      /mobileCopyGround/,
    );
    assert.doesNotThrow(() => assertHeroCopy({ ...COMPLETE, mobileCopyGround: 'panel' }, 'x'));
  });

  test('a hero that is not an object throws rather than reading undefined', () => {
    assert.throws(() => assertHeroCopy(undefined, 'x'), /not an object/);
    assert.throws(() => assertHeroCopy(null, 'x'), /null/);
  });
});
