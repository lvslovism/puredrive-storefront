/**
 * The ground table, and the one claim it is not allowed to be wrong about.
 *
 * ## Why the CSS is pinned as a literal
 *
 * `src/lib/ground.ts` used to hold the `[data-ground]` bindings as a typed-out
 * string. They are now COMPILED from `src/lib/grounds.mjs`, and the argument
 * for doing that was: "the default table produces exactly what was typed, so
 * every storefront takes this change and renders byte-for-byte what it rendered
 * before."
 *
 * That is a claim about generated CSS inlined into the `<head>` of every page
 * of every shop. An unchecked claim of that shape is how a whole palette moves
 * by one character — the page still renders, nothing throws, and the only
 * symptom is that some colour now resolves somewhere it did not before.
 *
 * So the expected output is written out below as a literal, in full, and
 * compared exactly. Re-deriving it from the same table this file is testing
 * would prove nothing except that the compiler is deterministic.
 *
 * If this test fails because a role binding genuinely changed: every shop's
 * rendered DOM changes with it. That is a re-sync, not a rebuild.
 *
 * ## Why it does not import src/lib/ground.ts
 *
 * That module reaches `brand/identity` without a file extension, which is the
 * house style across `src/` and which plain Node cannot resolve. So this file
 * calls the same compiler on the same inputs, read through
 * `scripts/brand-facts.mjs` instead of through Vite. The remaining gap — that
 * `ground.ts` could wire the compiler up differently — is closed by building
 * the storefronts and diffing the rendered HTML, which is what the round that
 * introduced this table did for all seven.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { colourTokens, groundPolarity, groundOverrides } from '../scripts/brand-facts.mjs';
import {
  MAX_GROUNDS,
  assertGroundsCover,
  groundRolesCss,
  normalizeFill,
  normalizeFills,
  resolveGrounds,
  tokenValue,
} from '../src/lib/grounds.mjs';

/** What `src/lib/ground.ts` shipped as a string literal before the table. */
const SHIPPED = `:root,
[data-ground="light"] {
  --ground-ink-strong: var(--color-ink);
  --ground-ink: var(--text-primary);
  --ground-ink-soft: var(--text-secondary);
  --ground-ink-muted: var(--text-muted);
  --ground-rule: var(--color-border);
  --ground-accent: var(--color-cta);
}

[data-ground="dark"] {
  --ground-ink-strong: var(--color-on-dark-strong);
  --ground-ink: var(--color-on-dark-ink);
  --ground-ink-soft: var(--color-on-dark-soft);
  --ground-ink-muted: var(--color-on-dark-muted);
  --ground-rule: var(--color-on-dark-rule);
  --ground-accent: var(--color-on-dark-accent);
}`;

const BLOCKS = {
  header: 'light',
  trust: 'light',
  catalogue: 'light',
  catalogueCard: 'light',
  scenes: 'light',
  sceneCard: 'light',
};

/** A palette holding every background the default table places, and nothing else. */
const COLOUR = {
  ink: '#111111',
  text: '#333333',
  muted: '#555555',
  surface: '#ffffff',
  soft: '#f5f5f5',
  mist: '#ebebeb',
  border: '#dddddd',
  cta: '#111111',
  'cta-text': '#ffffff',
  'on-dark': '#ffffff',
  'product-bg': '#f5f5f5',
  'login-bg': '#f5f5f5',
  'contact-bg': '#2e2e2e',
  'contact-text': '#ffffff',
  'footer-bg': '#1a1a1a',
  'footer-text': '#c4c4c4',
  'footer-heading': '#ffffff',
  'footer-rule': '#3a3a3a',
  'header-bg': '#ffffff',
  'trust-bg': '#f5f5f5',
  'catalogue-bg': '#ffffff',
  'catalogue-card-bg': '#ffffff',
  'scenes-bg': '#ebebeb',
  'scene-card-bg': '#ffffff',
  'on-dark-strong': '#ffffff',
  'on-dark-ink': '#c4c4c4',
  'on-dark-soft': '#c4c4c4',
  'on-dark-muted': '#c4c4c4',
  'on-dark-rule': '#3a3a3a',
  'on-dark-accent': '#ffffff',
};

const shopTable = () =>
  resolveGrounds({
    blocks: Object.fromEntries(groundPolarity),
    overrides: groundOverrides,
    colour: colourTokens,
  });

describe('the compiled bindings are the ones that shipped', () => {
  test('THIS shop emits the exact string src/lib/ground.ts used to hold', () => {
    assert.equal(groundRolesCss(shopTable()), SHIPPED);
  });

  test('a default table with no blocks turned over emits the same string', () => {
    assert.equal(groundRolesCss(resolveGrounds({ blocks: BLOCKS, colour: COLOUR })), SHIPPED);
  });

  test('audit-only grounds emit nothing — footer and contact are measured, not painted', () => {
    const table = resolveGrounds({ blocks: BLOCKS, colour: COLOUR });
    assert.equal(table.footer.selector, null);
    assert.equal(table.contact.selector, null);
    const css = groundRolesCss(table);
    assert.ok(!css.includes('footer'));
    assert.ok(!css.includes('contact'));
  });

  test('turning a block over changes no binding — only which ground it names', () => {
    const dark = resolveGrounds({ blocks: { ...BLOCKS, header: 'dark' }, colour: COLOUR });
    assert.equal(groundRolesCss(dark), SHIPPED);
    assert.ok(dark.dark.on.includes('color.header-bg'));
    assert.ok(!dark.light.on.includes('color.header-bg'));
  });
});

describe('a background nobody classified is a build failure', () => {
  test('an unplaced --color-*-bg throws instead of going unmeasured', () => {
    const table = resolveGrounds({ blocks: BLOCKS, colour: COLOUR });
    assert.throws(
      () => assertGroundsCover(table, { ...COLOUR, 'ribbon-bg': '#123456' }),
      /color\.ribbon-bg.*belongs to no ground/s,
    );
  });

  test('a background declared as a fill is accounted for without being a ground', () => {
    const colour = { ...COLOUR, 'header-cta-bg': '#111111', 'header-cta-ink': '#ffffff' };
    const table = resolveGrounds({ blocks: BLOCKS, colour });
    assert.doesNotThrow(() => assertGroundsCover(table, colour));
    assert.equal(table.light.fill['color.header-cta-bg'], 'color.header-cta-ink');
  });

  test('the header button follows its header onto a dark ground', () => {
    const colour = { ...COLOUR, 'header-cta-bg': '#111111', 'header-cta-ink': '#ffffff' };
    const table = resolveGrounds({ blocks: { ...BLOCKS, header: 'dark' }, colour });
    assert.equal(table.dark.fill['color.header-cta-bg'], 'color.header-cta-ink');
    assert.equal(table.light.fill['color.header-cta-bg'], undefined);
  });

  test('one half of the header button pair without the other throws', () => {
    assert.throws(
      () => resolveGrounds({ blocks: BLOCKS, colour: { ...COLOUR, 'header-cta-bg': '#111111' } }),
      /declared together or not at all/,
    );
  });

  test('two grounds claiming one background throws', () => {
    const table = resolveGrounds({ blocks: BLOCKS, colour: COLOUR });
    table.contact.on.push('color.footer-bg');
    assert.throws(() => assertGroundsCover(table, COLOUR), /painted by two grounds/);
  });
});

describe('a per-shop override widens the audit rather than escaping it', () => {
  test('a ground can be moved onto its own inks — the pale footer that was unsayable', () => {
    const colour = { ...COLOUR, 'footer-bg': '#f5f1ed', 'footer-text': '#2e2a26' };
    const table = resolveGrounds({
      blocks: BLOCKS,
      colour,
      overrides: { footer: { ink: ['color.footer-text'] } },
    });
    assert.deepEqual(table.footer.ink, ['color.footer-text']);
    /* The reversed inks are no longer pinned to it, which is the entire point:
       under the old list they had to clear on this ground AND on ui.cta-dark,
       and no value satisfies both. */
    assert.ok(!table.footer.ink.includes('color.on-dark-ink'));
    assert.equal(tokenValue('color.footer-text', { color: colour }), '#2e2a26');
  });

  test('an override names TOKENS, and a reference to nothing throws at the reference', () => {
    assert.throws(() => tokenValue('color.nope', { color: COLOUR }), /is not declared/);
    assert.throws(() => tokenValue('paint.ink', { color: COLOUR }), /names no token group/);
  });

  test('a misspelt field is a failure, not a value that silently did nothing', () => {
    assert.throws(
      () => resolveGrounds({ blocks: BLOCKS, colour: COLOUR, overrides: { light: { inks: [] } } }),
      /unknown field\(s\) inks/,
    );
  });

  test('a block pointed at a ground nobody declared names the ones that exist', () => {
    assert.throws(
      () => resolveGrounds({ blocks: { ...BLOCKS, trust: 'sepia' }, colour: COLOUR }),
      /is "sepia", which is not a declared ground.*light, dark, footer, contact/s,
    );
  });

  test('a missing block is a failure rather than a silent default', () => {
    const missing = { ...BLOCKS };
    delete missing.trust;
    assert.throws(
      () => resolveGrounds({ blocks: missing, colour: COLOUR }),
      /groundPolarity\.trust.*is not declared/s,
    );
  });

  test('the ceiling holds — a fifth ink set has to be argued for', () => {
    assert.equal(MAX_GROUNDS, 4);
    assert.throws(
      () =>
        resolveGrounds({
          blocks: BLOCKS,
          colour: COLOUR,
          overrides: { ribbon: { on: [], ink: [] } },
        }),
      /5 grounds declared.*ceiling is 4/s,
    );
  });
});

describe('the accent is two jobs, and they have different floors', () => {
  test('it is an ink on the pale ground — 17px numerals are type, not marks', () => {
    assert.ok(resolveGrounds({ blocks: BLOCKS, colour: COLOUR }).light.ink.includes('color.cta'));
  });

  test('it is also a fill, carrying its own label', () => {
    assert.equal(
      resolveGrounds({ blocks: BLOCKS, colour: COLOUR }).light.fill['color.cta'],
      'color.cta-text',
    );
  });

  test('the price role ships absent, so nothing changes until a shop declares one', () => {
    const table = resolveGrounds({ blocks: BLOCKS, colour: COLOUR });
    for (const name of Object.keys(table)) assert.equal(table[name].price, null);
  });
});

/**
 * The fill's two floors, which were one field.
 *
 * The property that matters most here is the FIRST test: a fill declared as a
 * plain string has to keep meaning exactly what it meant, or every shop's
 * existing declaration changes behaviour on sync.
 */
describe('a fill asks two questions, and a shop may answer them separately', () => {
  test('the string form is both floors checked — every existing declaration is unmoved', () => {
    assert.deepEqual(normalizeFill('color.cta', 'color.cta-text', 'light'), {
      fill: 'color.cta',
      label: 'color.cta-text',
      groundFloor: 'checked',
      labelFloor: 'checked',
      why: null,
    });
  });

  test('a floor may be accepted while the other stays checked', () => {
    const spec = normalizeFill(
      'color.cta',
      { label: 'color.cta-text', groundFloor: 'accepted', why: 'the comp specifies it' },
      'light',
    );
    assert.equal(spec.groundFloor, 'accepted');
    assert.equal(spec.labelFloor, 'checked');
    assert.equal(spec.why, 'the comp specifies it');
  });

  test('an accepted floor without a reason throws — silence is what this replaced', () => {
    assert.throws(
      () => normalizeFill('color.cta', { label: 'color.cta-text', groundFloor: 'accepted' }, 'light'),
      /gives no `why`/,
    );
    assert.throws(
      () =>
        normalizeFill(
          'color.cta',
          { label: 'color.cta-text', labelFloor: 'accepted', why: '   ' },
          'light',
        ),
      /gives no `why`/,
    );
  });

  test('a fill that carries no writing says so, and is not an accepted label', () => {
    const spec = normalizeFill('color.cta', { label: null }, 'light');
    assert.equal(spec.label, null);
    assert.throws(
      () => normalizeFill('color.cta', { label: null, labelFloor: 'accepted', why: 'x' }, 'light'),
      /nothing to accept/,
    );
  });

  test('a misspelt field or an unknown floor throws rather than being ignored', () => {
    assert.throws(
      () => normalizeFill('color.cta', { label: 'color.cta-text', groundfloor: 'accepted' }, 'light'),
      /unknown field\(s\) groundfloor/,
    );
    assert.throws(
      () => normalizeFill('color.cta', { label: 'color.cta-text', groundFloor: 'waived' }, 'light'),
      /has to be 'checked' or 'accepted'/,
    );
    assert.throws(() => normalizeFill('color.cta', 42, 'light'), /A fill is either/);
  });

  test('the header button no longer overwrites what the shop declared about it', () => {
    const colour = { ...COLOUR, 'header-cta-bg': '#111111', 'header-cta-ink': '#ffffff' };
    const table = resolveGrounds({
      blocks: BLOCKS,
      colour,
      overrides: {
        light: {
          fill: {
            'color.header-cta-bg': {
              label: 'color.header-cta-ink',
              groundFloor: 'accepted',
              why: 'measured and decided',
            },
          },
        },
      },
    });
    /* It used to be spread over unconditionally, so this pair was the one fill
       in the table a shop could say nothing about. */
    assert.equal(table.light.fill['color.header-cta-bg'].groundFloor, 'accepted');
    const [spec] = normalizeFills(table.light, 'light');
    assert.equal(spec.fill, 'color.header-cta-bg');
    assert.equal(spec.labelFloor, 'checked');
  });

  test('an unreadable fill fails while the table is built, not in one of its two readers', () => {
    assert.throws(
      () =>
        resolveGrounds({
          blocks: BLOCKS,
          colour: COLOUR,
          overrides: { light: { fill: { 'color.cta': { label: 'color.cta-text', why: 5 } } } },
        }),
      /declares `why: 5`/,
    );
  });
});

describe('this shop is on the table, not beside it', () => {
  test('every background it declares belongs to exactly one ground', () => {
    assert.doesNotThrow(() => assertGroundsCover(shopTable(), colourTokens));
  });

  /*
   * ONE assertion, and it used to be two.
   *
   * The second one read `assert.ok(shopTable().light.ink.includes('color.cta'))`
   * — a claim about THIS SHOP's resolved table. `identity.grounds` exists
   * precisely so a shop can declare which tokens its grounds paint, and a shop
   * that paints the accent nowhere as type on a pale ground says so by dropping
   * it from `light.ink`. That is a true statement about that shop, and it
   * failed this test.
   *
   * The invariant worth pinning is that the TEMPLATE ships the accent as an
   * ink, and the sibling test in the previous suite already pins it against the
   * DEFAULT table. Whether a given shop keeps it there is that shop's
   * declaration, not this file's business.
   */
  test('there is no --color-accent: the accent this palette paints is cta', () => {
    assert.equal(colourTokens.get('accent'), undefined);
  });
});
