/**
 * The three page primitives, rendered.
 *
 * `PageHero`, `Breadcrumb` and `TrustBand` ship UNWIRED: they are added without
 * touching a single existing page, and each storefront wires the ones it wants.
 * That is the right shape for the change and it leaves them with no build
 * output — nothing in `dist/` contains them, so nothing in this repository
 * would notice if one stopped compiling, lost its JSON-LD or started rendering
 * an empty band.
 *
 * So they get a build of their own: `tests/fixtures/primitives/pages/index.astro`
 * uses all three, `tests/fixtures/primitives.config.mjs` points `srcDir` at it,
 * and this file asserts against the HTML that comes out. One page, about a
 * second, into `.astro/` where it cannot be mistaken for the real build.
 *
 * What is asserted is what a page author can break: the optional props actually
 * being optional, the ground attribute reaching the markup (it is what decides
 * whether the type is visible on a dark hero), and the breadcrumb's two halves —
 * the visible trail and the BreadcrumbList — describing the same path. The
 * schema is the half nobody looks at, which is why it is the half that gets
 * checked.
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { registerHooks } from 'node:module';

// brand/ imports its neighbours without a file extension — what the bundler
// wants and what Node's ESM resolver refuses. Same shim, same reason, as
// tests/cart-add.test.ts.
registerHooks({
  resolve(specifier: string, context: unknown, nextResolve: any) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith('.') && !/.[cm]?[jt]s$/.test(specifier)) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw error;
    }
  },
});

const root = process.cwd();
const OUT = path.join(root, '.astro', 'primitives', 'index.html');
const COMPONENTS = ['PageHero.astro', 'Breadcrumb.astro', 'TrustBand.astro'];

let html = '';
/* Imported inside `before`, not at the top: a static import is evaluated before
   any of this module's body runs, which would be before `registerHooks` above
   has installed the extension fallback that `brand/copy.ts` needs to resolve
   `./identity`. */
let trust: { items: Array<{ title: string; body: string; icon?: string }> };

before(async () => {
  ({ trust } = await import('../brand/copy.ts'));

  /* The fixture's hero points at a real brand asset, and public/ is generated
     from brand/assets/ before every astro command. Running the sync here rather
     than assuming it means this suite works on a fresh clone. */
  execFileSync(process.execPath, ['scripts/sync-brand-assets.mjs'], { cwd: root, stdio: 'pipe' });
  execFileSync(
    process.execPath,
    ['node_modules/astro/bin/astro.mjs', 'build', '--config', 'tests/fixtures/primitives.config.mjs'],
    { cwd: root, stdio: 'pipe' },
  );
  html = readFileSync(OUT, 'utf8');
});

/** The markup of one `data-case` block from the fixture. */
function block(name: string): string {
  const open = html.indexOf(`data-case="${name}"`);
  assert.notEqual(open, -1, `fixture has no data-case="${name}"`);
  const next = html.indexOf('data-case="', open + 1);
  return html.slice(open, next === -1 ? html.indexOf('</main>') : next);
}

describe('page primitives: the files are where the spec puts them', () => {
  for (const file of COMPONENTS) {
    it(`src/components/common/${file} exists`, () => {
      assert.ok(existsSync(path.join(root, 'src', 'components', 'common', file)));
    });
  }
});

describe('PageHero', () => {
  it('renders the cover geometry, the scrim and a priority image', () => {
    const hero = block('hero-full');
    assert.match(hero, /class="page-hero page-hero--cover hero-cover"/);
    assert.match(hero, /class="hero-cover__scrim"[^>]*aria-hidden="true"/);
    assert.match(hero, /class="hero-cover__image"[^>]*fetchpriority="high"/);
    /* Never lazy: a hero is the LCP element of the page it opens, and lazy on
       the LCP element is the one loading attribute that makes a page slower. */
    assert.doesNotMatch(hero, /class="hero-cover__image"[^>]*loading="lazy"/);
  });

  it('puts `tone` on the ground attribute, which is what reverses the ink', () => {
    assert.match(block('hero-full'), /data-ground="dark"/);
    assert.match(block('hero-minimal'), /data-ground="light"/);
  });

  it('renders title, eyebrow, lead and trail when given them', () => {
    const hero = block('hero-full');
    assert.match(hero, /<p class="eyebrow"[^>]*>ABOUT<\/p>/);
    assert.match(hero, /<h1 class="page-title"[^>]*>關於我們<\/h1>/);
    assert.match(hero, /<p class="lead"[^>]*>一段副標/);
    assert.match(hero, /class="breadcrumb"/);
  });

  it('omits every optional part when it is not given one', () => {
    /* The failure this guards is a component that renders an empty <p> or a
       stray separator for a prop nobody passed — invisible in a screenshot of
       the full case, and a hole in the vertical rhythm of every page using the
       short one. */
    const hero = block('hero-minimal');
    assert.match(hero, /<h1 class="page-title"[^>]*>常見問題<\/h1>/);
    assert.doesNotMatch(hero, /class="eyebrow"/);
    assert.doesNotMatch(hero, /class="lead"/);
    assert.doesNotMatch(hero, /class="breadcrumb"/);
  });
});

describe('Breadcrumb', () => {
  it('links every crumb but the last, and marks the last as current', () => {
    const nav = block('breadcrumb-standalone');
    assert.match(nav, /<a href="\/"[^>]*>首頁<\/a>/);
    assert.match(nav, /<a href="\/products"[^>]*>全部商品<\/a>/);
    assert.match(nav, /<span aria-current="page"[^>]*>常見問題<\/span>/);
    /* The current page is not a link to itself. */
    assert.doesNotMatch(nav, /<a href="\/faq"/);
  });

  it('emits a BreadcrumbList describing the same trail', () => {
    const nav = block('breadcrumb-standalone');
    const script = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(nav);
    assert.ok(script, 'no JSON-LD beside the trail');
    const data = JSON.parse(script[1]);

    assert.equal(data['@type'], 'BreadcrumbList');
    assert.deepEqual(
      data.itemListElement.map((item: any) => [item.position, item.name]),
      [
        [1, '首頁'],
        [2, '全部商品'],
        [3, '常見問題'],
      ],
    );
    /* Absolute urls, and the last crumb keeps its own: BreadcrumbList describes
       the path TO a page, so the path ends at that page. */
    for (const item of data.itemListElement) {
      assert.match(item.item, /^https:\/\/example\.com\//);
    }
  });
});

describe('TrustBand', () => {
  it('renders one item per entry in brand/copy.ts', () => {
    const band = block('trust-light');
    const items = band.match(/class="trust-band__item"/g) ?? [];
    assert.equal(items.length, trust.items.length);
    for (const item of trust.items) {
      assert.ok(band.includes(item.title), `missing title: ${item.title}`);
      assert.ok(band.includes(item.body), `missing body: ${item.body}`);
    }
  });

  it('draws its marks inline, painted by currentColor', () => {
    const band = block('trust-light');
    const withIcon = trust.items.filter((item) => item.icon).length;
    assert.equal((band.match(/class="trust-band__icon"/g) ?? []).length, withIcon);
    /* Inline <svg>, never <img>: the mark takes its colour from the ground it
       lands on, and an <img> cannot inherit ink. */
    assert.doesNotMatch(band, /trust-band__icon[^>]*<img/);
    assert.match(band, /<svg class="trust-band__icon"/);
  });

  it('carries its ground, and its heading only when asked for one', () => {
    assert.match(block('trust-light'), /data-ground="light"/);
    assert.match(block('trust-light'), /class="section-title trust-band__title"[^>]*>我們的承諾</);
    const dark = block('trust-dark');
    assert.match(dark, /data-ground="dark"/);
    assert.doesNotMatch(dark, /trust-band__title/);
  });
});
