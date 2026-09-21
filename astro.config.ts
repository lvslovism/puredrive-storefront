import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { commerce } from "./brand/commerce";
// The RESOLVED flags, not brand/commerce.ts's raw object: `commerce` defaults
// to on when absent and `cartPage` is ANDed with it. Injecting routes off the
// raw object would disagree with the link filtering that reads the resolved
// one, and the two disagreeing is exactly the built-but-unlinked page this
// mechanism exists to prevent.
import { flags } from "./src/lib/features";

/**
 * Optional routes, grouped by the flag that owns them.
 *
 * Turning a feature off has to mean the pages are never BUILT — not that they
 * ship and go unlinked. An unlinked page is still crawlable, still indexable,
 * and still a live surface talking to an API the shop may not have enabled.
 *
 * Astro has no "conditional page" for a static file under src/pages/, so these
 * live under src/routes/ (which Astro ignores) and are injected below only when
 * their flag is on. The matching link filtering happens in src/lib/features.ts.
 */
const OPTIONAL_ROUTES: Array<{
  flag: keyof typeof flags;
  routes: Array<{ pattern: string; entrypoint: string }>;
}> = [
  {
    flag: "blog",
    routes: [
      { pattern: "/blog", entrypoint: "./src/routes/blog/index.astro" },
      { pattern: "/blog/page/[page]", entrypoint: "./src/routes/blog/page/[page].astro" },
      { pattern: "/blog/[slug]", entrypoint: "./src/routes/blog/[slug].astro" },
    ],
  },
  {
    flag: "contentPages",
    routes: [
      { pattern: "/products", entrypoint: "./src/routes/products/index.astro" },
      { pattern: "/about", entrypoint: "./src/routes/about.astro" },
      { pattern: "/faq", entrypoint: "./src/routes/faq.astro" },
      { pattern: "/contact", entrypoint: "./src/routes/contact.astro" },
    ],
  },
  {
    flag: "cartPage",
    routes: [{ pattern: "/cart", entrypoint: "./src/routes/cart.astro" }],
  },
  {
    /* A showcase storefront: catalogue and prices, nothing to buy. These five
       are every surface that would otherwise take a customer into a purchase
       — or into the LINE login that guards one — and they are not built at
       all rather than shipped unlinked. */
    flag: "commerce",
    routes: [
      { pattern: "/checkout", entrypoint: "./src/routes/checkout/index.astro" },
      { pattern: "/checkout/complete", entrypoint: "./src/routes/checkout/complete.astro" },
      { pattern: "/login", entrypoint: "./src/routes/login.astro" },
      { pattern: "/account", entrypoint: "./src/routes/account/index.astro" },
      { pattern: "/auth/callback", entrypoint: "./src/routes/auth/callback.astro" },
    ],
  },
  {
    flag: "affiliate",
    // `/r/<code>` is served by rewriting every /r/* onto this one static page
    // (see scripts/build-deployment-files.mjs); the code is parsed client-side.
    routes: [{ pattern: "/r", entrypoint: "./src/routes/r/index.astro" }],
  },
];

function featureRoutes() {
  return {
    name: "storefront-feature-routes",
    hooks: {
      "astro:config:setup": ({ injectRoute, logger }: any) => {
        for (const group of OPTIONAL_ROUTES) {
          if (!flags[group.flag]) {
            logger.info(`feature "${group.flag}" is off — ${group.routes.length} route(s) not built`);
            continue;
          }
          group.routes.forEach(injectRoute);
        }
      },
    },
  };
}

export default defineConfig({
  site: commerce.siteOrigin,
  integrations: [
    featureRoutes(),
    sitemap({
      // Utility and transactional routes stay out of the sitemap. Kept in step
      // with the Disallow list in the generated robots.txt.
      filter: (page) =>
        !page.includes("/login") &&
        !page.includes("/cart") &&
        !page.includes("/checkout") &&
        !page.includes("/account") &&
        !page.includes("/order") &&
        !page.includes("/auth") &&
        !page.includes("/r/"),
    }),
  ],
});
