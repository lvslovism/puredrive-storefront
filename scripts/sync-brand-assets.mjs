/**
 * Mirror brand/assets/ into public/assets/, then verify the manifest.
 *
 * Runs from `predev` / `prebuild` / `prepreview`, so dev, build and preview all
 * see the same files. That is deliberate: a sync wired only into `build` is a
 * sync that goes stale the moment someone runs `dev`.
 *
 * public/assets/ is generated output and gitignored. brand/assets/ is the
 * source. Editing the copy under public/ is editing a build artefact.
 *
 * A declared file that does not exist fails here rather than shipping a page
 * with a broken image — the pages resolve asset paths as plain public URLs, so
 * a missing file is invisible to the build and obvious only to the visitor.
 */
import { cp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const source = path.join(root, 'brand', 'assets');
const target = path.join(root, 'public', 'assets');
const manifestPath = path.join(source, 'manifest.json');

if (!existsSync(manifestPath)) {
  throw new Error('Missing brand/assets/manifest.json — the asset layer is not filled in.');
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const declared = manifest.required ?? [];

const missing = declared.filter((relativePath) => !existsSync(path.join(source, relativePath)));
if (missing.length) {
  throw new Error(
    `brand/assets is missing ${missing.length} declared file(s):\n  ${missing.join('\n  ')}\n` +
      'Add the files, or drop them from brand/assets/manifest.json if this shop does not use them.'
  );
}

// Present is not the same as FILLED IN. Every stand-in this template ships
// carries a `template-placeholder` marker in its first line, and a shop that
// replaces the file replaces the marker with it. Without this the only thing
// standing between a launch and a grey box on the login page was somebody
// remembering that the login aside reads an image at all.
//
// A warning rather than an error: a fresh clone is SUPPOSED to build — that is
// how the template renders a working shop before a merchant exists. What must
// not happen quietly is a real deploy still carrying one.
const byDesign = new Set(manifest.placeholdersByDesign?.files ?? []);
const stillPlaceholder = [];
for (const relativePath of declared) {
  if (byDesign.has(relativePath)) continue;
  const full = path.join(source, relativePath);
  if (path.extname(full) !== '.svg') continue;
  const head = (await readFile(full, 'utf8')).slice(0, 400);
  if (head.includes('template-placeholder')) stillPlaceholder.push(relativePath);
}
if (stillPlaceholder.length) {
  console.warn(
    [
      `[assets] ${stillPlaceholder.length} declared file(s) are still the template's placeholder artwork:`,
      ...stillPlaceholder.map((relativePath) => `  - ${relativePath}`),
      '  Replace them in brand/assets/ before this build goes anywhere public.',
    ].join('\n')
  );
}

// `--check` verifies without touching public/ — that is `npm run assets:validate`.
if (process.argv.includes('--check')) {
  console.log(`Brand assets validated: ${declared.length} declared file(s) present.`);
  process.exit(0);
}

// A full replace, not a merge: a file deleted from brand/assets/ must disappear
// from the built site too, or a removed product keeps serving its old photo.
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });

const entries = await readdir(source, { withFileTypes: true });
let copied = 0;

for (const entry of entries) {
  if (entry.name === 'manifest.json') continue;
  await cp(path.join(source, entry.name), path.join(target, entry.name), {
    recursive: true,
    force: true
  });
  copied += 1;
}

console.log(
  `Brand assets synced: ${copied} top-level entr(ies), ${declared.length} declared file(s) verified.`
);
