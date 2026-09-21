/**
 * Astro config for the page-primitives render fixture. Test use only.
 *
 * `srcDir` points at the fixture, so this build discovers exactly one page and
 * none of the storefront's own — which is why it is a second config rather than
 * a route injected into `astro.config.ts`. A test route in the real config
 * would be a page every shop inherits and one flag away from shipping; here
 * there is nothing to ship, because nothing but the test ever names this file.
 *
 * `outDir` is under `.astro/`, which is already ignored, so a test run leaves
 * `dist/` exactly as the real build left it — `tests/dom-contract.test.mjs`
 * reads that directory and must not find this build's output in it.
 *
 * Deliberately NOT extending the real config: the sitemap integration and the
 * feature-route injection are about which of the storefront's pages exist, and
 * this build has none of them. Everything the components actually depend on —
 * `brand/`, `src/lib/`, `public/assets/` — is reached by ordinary imports and
 * needs no configuration at all.
 */
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://example.com',
  srcDir: './tests/fixtures/primitives',
  outDir: './.astro/primitives',
  publicDir: './public',
});
