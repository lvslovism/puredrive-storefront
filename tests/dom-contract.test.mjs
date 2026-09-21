/**
 * The DOM contract, checked against the pages this repository actually builds.
 *
 * `scripts/dom-contract.mjs` says which selectors `src/scripts/` reaches for and
 * which pages have to carry them. This is the half that fails: it reads the
 * built HTML and asserts every declared hook is still in it.
 *
 * It matters because presentation files can be unlocked now. A shop that has
 * taken over `src/routes/checkout/index.astro` owns its markup as well as its
 * design, and a redraw that loses `[data-confirm]` produces a page that builds
 * green, renders correctly and cannot take an order. Nothing else in this
 * repository would notice.
 *
 * Two directions, and both are needed:
 *
 *   coverage   every selector-shaped literal in the four scripts is declared
 *              somewhere in dom-contract.mjs. Stops the declaration from
 *              quietly falling behind the code.
 *   presence   every declared server-rendered selector is in the built page.
 *              Stops the markup from quietly falling behind the declaration.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTRACT,
  DEAD,
  OPTIONAL,
  RUNTIME,
  SCRIPTS,
  TEMPLATED,
  declaredFor,
  extractAttributeReads,
  extractSelectors,
  selectorPresent,
} from '../scripts/dom-contract.mjs';

const root = process.cwd();
const dist = path.join(root, 'dist');

/**
 * The build, on demand.
 *
 * This test reads build OUTPUT, so it needs one. `npm test` runs the build
 * before it gets here; a developer running `node --test tests/` directly does
 * not, and a check that is red for that reason teaches people to ignore it.
 */
before(() => {
  if (existsSync(path.join(dist, 'index.html'))) return;
  execSync('npm run build', { cwd: root, stdio: 'inherit' });
});

/** Pages that were not in this build, reported once at the end. */
const skipped = [];
after(() => {
  if (skipped.length) {
    console.log(
      `dom-contract: ${skipped.length} group(s) not applicable to this build:\n  ` +
        skipped.join('\n  ')
    );
  }
});

/**
 * The built HTML for a declared page, or null when this build has no such page.
 *
 * A missing page is not a failure. `flags.commerce: false` removes the whole
 * checkout, `flags.cartPage: false` removes /cart, and a showcase storefront is
 * a supported shape rather than a broken one. What would be a failure is a page
 * that exists and has lost its hooks.
 */
function pageHtml(page) {
  if (page === '/products/*/') {
    const dir = path.join(dist, 'products');
    if (!existsSync(dir)) return null;
    /* Any product page. Handles come from the merchant API, so no fixed one
       exists to name — and every product page is rendered by the same route,
       so the first is as good a witness as the twentieth. */
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const file = path.join(dir, entry.name, 'index.html');
      if (existsSync(file)) return readFileSync(file, 'utf8');
    }
    return null;
  }
  const file = path.join(dist, page.replace(/^\//, '').split('/').filter(Boolean).join(path.sep), 'index.html');
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
}

describe('dom contract: the declaration covers the scripts', () => {
  for (const script of SCRIPTS) {
    it(`${script}.ts has no undeclared selector`, () => {
      const source = readFileSync(path.join(root, 'src', 'scripts', `${script}.ts`), 'utf8');
      const declared = declaredFor(script);
      const found = [...extractSelectors(source), ...extractAttributeReads(source)];
      const undeclared = [
        ...new Set(found.filter((f) => !declared.has(f.sel)).map((f) => `${f.sel} (line ${f.line})`)),
      ];
      assert.deepEqual(
        undeclared,
        [],
        `src/scripts/${script}.ts reaches for selectors that scripts/dom-contract.mjs does not ` +
          'declare. Add each to CONTRACT if a page renders it, to RUNTIME if the script builds ' +
          'the markup itself, or to DEAD if nothing renders it at all.'
      );
    });
  }

  it('every declared selector belongs to the script it is filed under', () => {
    /* The line numbers in `at:` are deliberately not asserted — they move when
       anybody adds a comment, and a test that fails on comments gets deleted.
       The SCRIPT is asserted, which is the half that carries meaning: a hook
       filed under checkout that only cart reaches for would send a page author
       to the wrong file. */
    const wrong = [];
    for (const script of SCRIPTS) {
      const source = readFileSync(path.join(root, 'src', 'scripts', `${script}.ts`), 'utf8');
      const reachable = new Set(
        [...extractSelectors(source), ...extractAttributeReads(source)].map((f) => f.sel)
      );
      const declared = [
        ...CONTRACT.filter((g) => g.script === script).flatMap((g) => g.selectors.map((s) => s.sel)),
        ...(RUNTIME[script] ?? []).map((e) => e.sel),
        ...DEAD.filter((e) => e.script === script).map((e) => e.sel),
        ...OPTIONAL.filter((e) => e.script === script).map((e) => e.sel),
        ...TEMPLATED.filter((e) => e.script === script).map((e) => e.sel),
      ];
      for (const sel of declared) {
        /* A templated selector's expansions are declared separately and are what
           the page is checked against; the shape itself is what the script
           contains. Either being reachable is enough. */
        const expansion = TEMPLATED.find((e) => e.expands?.includes(sel));
        if (reachable.has(sel)) continue;
        if (expansion && reachable.has(expansion.sel)) continue;
        wrong.push(`${script}: ${sel}`);
      }
    }
    assert.deepEqual(wrong, [], 'declared selectors no script actually reaches for');
  });

  it('every OPTIONAL hook names a guard that is really in the script', () => {
    /* OPTIONAL is the category with a pull towards it: filing a hook here makes
       the presence check stop asking about it. The toll is that the entry has to
       name the expression in the script that tolerates the absence, and the
       expression has to exist. A hook whose write is unguarded would throw on
       the page that dropped it, which is a different bug with a different fix. */
    for (const entry of OPTIONAL) {
      const source = readFileSync(
        path.join(root, 'src', 'scripts', `${entry.script}.ts`),
        'utf8'
      );
      assert.ok(
        source.includes(entry.guard),
        `${entry.sel} is declared OPTIONAL on the strength of "${entry.guard}" in ` +
          `${entry.script}.ts, and that guard is not there. Either the script no longer ` +
          'tolerates the missing element — in which case this belongs in CONTRACT and the ' +
          'page has to render it — or the guard was renamed and this entry is stale.'
      );
    }
  });

  it('the dead binding is still dead', () => {
    /* If somebody renders `[data-clear-cart]`, this fails and the entry moves
       out of DEAD and into the cart-page group. That is the right amount of
       friction for a hook that has never worked. */
    const html = pageHtml('/cart/');
    if (html === null) return;
    for (const entry of DEAD) {
      assert.equal(
        selectorPresent(html, entry.sel),
        false,
        `${entry.sel} is declared DEAD (${entry.at}) but /cart/ now renders it — move it into ` +
          'the contract group for that page.'
      );
    }
  });
});

describe('dom contract: the pages still carry the hooks', () => {
  for (const group of CONTRACT) {
    if (group.page === null || group.selectors.length === 0) continue;

    it(`${group.script} -> ${group.page}: ${group.what}`, () => {
      const html = pageHtml(group.page);
      if (html === null) {
        skipped.push(`${group.script} -> ${group.page} (no such page in this build)`);
        return;
      }
      if (group.gate && !selectorPresent(html, group.gate)) {
        skipped.push(`${group.script} -> ${group.page} (gate ${group.gate} absent)`);
        return;
      }

      const missing = group.selectors
        .filter((entry) => !selectorPresent(html, entry.sel))
        .map((entry) => `${entry.sel}  <- ${entry.at}`);

      assert.deepEqual(
        missing,
        [],
        `${group.page} has lost DOM hooks that src/scripts/${group.script}.ts binds to. ` +
          'The page renders and the build is green; the behaviour behind these is not. ' +
          'Keep the attributes and restyle around them, or take the binding out of the ' +
          'script in the template.'
      );
    });
  }
});
