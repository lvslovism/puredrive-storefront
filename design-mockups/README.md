# design-mockups

Reference artwork for whoever is building this storefront: the mockups,
screenshots and annotated crops a page is meant to end up looking like.

**Nothing here is read by the build.** `brand/assets/` is the asset layer — the
sync script mirrors it into `public/` and fails the build on a missing file.
This directory is documentation, and deleting all of it would not change a
single byte of `dist/`. Keep the two apart: an image the site actually serves
belongs in `brand/assets/`, not here.

## Naming

```
NN-page-name.png
```

- `NN` — two digits, the site's own reading order. `01` is the home page.
- `page-name` — semantic, lowercase, kebab-case, matching the route it shows
  wherever one exists (`/products/[handle]` → `product-detail`).
- A second `--state` segment separates variants of the same page.
- `.png`, `.jpg` or `.webp`.

```
01-home.png
02-product-list.png
03-product-detail.png
04-cart--empty.png
04-cart--filled.png
05-checkout.png
```

Not `mockup1.png`, `mockup2.png`, `final_v3_FINAL.png`. A filename is the only
label these files ever get; `mockup2` tells the next person nothing about which
page it is, and the numbers stop meaning anything the moment one is deleted.

## Why the images are gitignored

`.gitignore` excludes `*.png`, `*.jpg` and `*.webp` under this directory, so the
mockups stay local. They are large, they churn every review round, and a binary
that changes weekly is the fastest way to make a clone slow. Share them through
whatever the design tool already is; git keeps the convention, not the bytes.

`.gitkeep` and this README are not images, so they are not matched by those
patterns and do survive — the directory and its rules exist on a fresh clone
even though it arrives empty.

To commit one deliberately anyway: `git add -f design-mockups/01-home.png`.
