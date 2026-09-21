/**
 * Anti-corrosion check: no colour literal may appear in `src/`.
 *
 * Every colour the site paints is declared once, in `brand/identity.ts`, and
 * reaches the stylesheets as a `var(--…)`. Re-theming a storefront is then a
 * question of editing one object — not of grepping for the six greys somebody
 * typed straight into a component because they were "just a hover state".
 *
 * A single `#f8f7f7` in a page's scoped <style> is enough to make that false,
 * and it is invisible until a rebrand lands and one panel stays the old colour.
 * So it is checked.
 *
 * The one exception is a variable DEFINITION line in `src/styles/tokens.css` —
 * the file that exists to hold token declarations. Today it holds none (all
 * colours live in `brand/identity.ts` and are inlined by BaseLayout), and the
 * carve-out is here so moving a structural token back into the stylesheet does
 * not require editing the audit.
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const sourceDir = path.join(root, 'src');
const EXTENSIONS = new Set(['.astro', '.ts', '.tsx', '.js', '.mjs', '.css']);

const TOKENS_CSS = path.join(root, 'src', 'styles', 'tokens.css');

/**
 * `#abc` / `#aabbcc` / `#aabbccdd`, and the functional notations. The hex arm
 * requires a non-word character before the `#` so a URL fragment (`href="#"`,
 * `#faq-tab-0`) is not a colour — and rejects a following IDENTIFIER character,
 * not merely a following hex digit. A colour literal is always followed by `;`,
 * `)`, whitespace or the end of the line; a URL fragment is followed by more of
 * its own name. Without that, an href of "#addresses" reads as three hex digits
 * and an `r`, and the audit fails a page for a link.
 */
const COLOUR = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-zA-Z_-])|\b(?:rgba?|hsla?)\s*\(/g;

/** A CSS custom-property declaration: `  --color-ink: #1a1a1a;` */
const TOKEN_DEFINITION = /^\s*--[\w-]+\s*:/;

async function walk(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, out);
    else if (EXTENSIONS.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

const hits = [];
let scanned = 0;

for (const file of await walk(sourceDir)) {
  scanned += 1;
  const isTokensCss = file === TOKENS_CSS;
  const lines = (await readFile(file, 'utf8')).split(/\r?\n/);
  lines.forEach((line, index) => {
    if (isTokensCss && TOKEN_DEFINITION.test(line)) return;
    const found = line.match(COLOUR);
    if (found) {
      hits.push(
        `${path.relative(root, file)}:${index + 1}  ${found.join(' ')}  ${line.trim().slice(0, 100)}`
      );
    }
  });
}

if (hits.length) {
  throw new Error(
    `${hits.length} colour literal(s) found in src/. Declare them in brand/identity.ts and use var(--…):\n  ${hits.join('\n  ')}`
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Second pass: the SVGs under brand/assets/.
 *
 * `src/` being literal-free is not enough. A mark drawn with the palette's gold
 * typed into its `stroke` looks right on the shop it was drawn for and keeps
 * that gold through every rebrand afterwards — the exact failure this audit
 * exists to prevent, one directory over. It went unnoticed once already,
 * because nothing was looking.
 *
 * DEFAULT-DENY, and deliberately not a hex grep: every paint attribute must
 * name `currentColor`, `none`, `inherit`, `transparent`, a `var(--…)` or a
 * gradient reference. `fill="white"` is a baked colour too, and a regex hunting
 * for `#` would wave it through.
 *
 * An SVG that is a PICTURE — a placeholder standing in for photography — is
 * exempt, but only by being declared in `manifest.json → colourLiterals`. A new
 * glyph is checked by default; skipping the check costs a line somebody has to
 * write and a reviewer can see.
 */
const assetsDir = path.join(root, 'brand', 'assets');
const MANIFEST = path.join(assetsDir, 'manifest.json');

/** Values a paint attribute may carry without naming a colour of its own. */
const PAINT_OK = /^(none|currentColor|inherit|transparent|var\(|url\(#)/i;
const PAINT_ATTR = /\b(fill|stroke|stop-color|flood-color|lighting-color)\s*=\s*"([^"]*)"/gi;

async function walkSvg(dir, out = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out; // no brand/assets — nothing to check
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walkSvg(full, out);
    else if (path.extname(entry.name) === '.svg') out.push(full);
  }
  return out;
}

const manifest = await readFile(MANIFEST, 'utf8')
  .then(JSON.parse)
  .catch(() => ({}));
/** Every list under `colourLiterals`, flattened. The buckets are for readers. */
const exempt = new Set(
  Object.entries(manifest.colourLiterals ?? {})
    .filter(([key]) => !key.startsWith('$'))
    .flatMap(([, list]) => (Array.isArray(list) ? list : []))
);

const svgHits = [];
let svgScanned = 0;

for (const file of await walkSvg(assetsDir)) {
  const rel = path.relative(assetsDir, file).split(path.sep).join('/');
  if (exempt.has(rel)) continue;
  svgScanned += 1;
  const lines = (await readFile(file, 'utf8')).split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const [, attr, value] of line.matchAll(PAINT_ATTR)) {
      if (!PAINT_OK.test(value.trim())) {
        svgHits.push(`brand/assets/${rel}:${index + 1}  ${attr}="${value}"`);
      }
    }
  });
}

if (svgHits.length) {
  throw new Error(
    `${svgHits.length} baked colour(s) found in brand/assets SVGs. Use currentColor (and paint it ` +
      `with a token at the render site), or declare the file under ` +
      `manifest.json → colourLiterals if it is a picture rather than a mark:\n  ${svgHits.join('\n  ')}`
  );
}

console.log(
  `Colour isolation verified: ${scanned} source file(s) + ${svgScanned} brand SVG(s) scanned, ` +
    `no colour literals. (${exempt.size} SVG(s) declared exempt.)`
);

/* ────────────────────────────────────────────────────────────────────────────
 * Third pass: does the palette that replaced the literals actually READ?
 *
 * The two passes above only prove that no colour was typed where it does not
 * belong. Neither can tell whether the palette in brand/identity.ts is legible,
 * and legibility is decided nowhere else — `src/` names tokens, so a shop that
 * picks a pale grey for body text gets pale grey body text on every page and
 * nothing objects.
 *
 * It went unnoticed twice. The template's own default shipped a caption colour
 * that missed AA on two of its three page grounds, and shipped a contact strip
 * whose ground was the SAME VALUE as the footer's, so the call to action and
 * the footer rendered as one slab.
 *
 * So: WCAG 2.1 contrast, computed from the declared values.
 *
 * ## This pass used to be five hand-maintained lists. It is now one table.
 *
 * `PAGE_GROUNDS`, `BLOCK_GROUNDS`, `DARK_REFERENCE_GROUNDS`, `MARK_SITES` and
 * `REVERSED` were five ways of saying "this background, against these inks",
 * and which list a background landed in was a decision somebody made once, by
 * hand, and nothing rechecked. Three of them needed a written exemption for a
 * ground that did not fit — `contact-bg`, then `header-bg`, then `footer-bg`,
 * and the third one was still wrong: it pinned the footer to the reversed ink
 * set BY NAME, so a pale footer had to satisfy `on-dark-*` against a near-white
 * ground and against `ui.cta-dark` simultaneously. Swept across all 256 greys
 * on a real shop's palette, the number of values satisfying both is zero.
 *
 * The lists are gone. `src/lib/grounds.mjs` declares every ground once —
 * background, inks, hairline, fills — and this pass walks it. Two properties
 * come out of that which no amount of maintaining five lists would have given:
 *
 *   1. `src/lib/ground.ts` compiles the SAME table into the `[data-ground]`
 *      bindings. The stylesheet and the audit cannot disagree about which inks
 *      stand on which ground, because there is one answer.
 *
 *   2. `assertGroundsCover` fails on a background that belongs to no ground.
 *      A sixth `--color-*-bg` is a build failure rather than a value nobody
 *      measures — which is what `footer-bg` was, for three revisions.
 *
 * `text.faint` is deliberately NOT audited. It paints placeholders and inactive
 * affordances, which WCAG treats separately, and holding it to 4.5 would force
 * it to the same value as `text.muted` — collapsing a type scale to satisfy a
 * check that was never about it. It is absent from every ground's `ink` list,
 * and that absence is the declaration.
 */
import { colourTokens, textTokens, uiTokens, groundPolarity, groundOverrides } from './brand-facts.mjs';
import {
  AA,
  ADJACENT_MIN,
  FILL_MIN,
  RULE_MIN,
  assertGroundsCover,
  normalizeFills,
  resolveGrounds,
  tokenValue,
} from '../src/lib/grounds.mjs';

function channels(value) {
  const raw = value.trim().replace('#', '');
  const full = raw.length === 3 ? [...raw].map((c) => c + c).join('') : raw;
  if (full.length !== 6 || Number.isNaN(Number.parseInt(full, 16))) {
    throw new Error(
      `audit-color: token value "${value}" is not a #rgb or #rrggbb literal. ` +
        'The contrast pass reads the declared values, so every colour token has to be one.'
    );
  }
  return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16));
}

/** WCAG relative luminance. */
function luminance(value) {
  const [r, g, b] = channels(value).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const tokens = { color: colourTokens, text: textTokens, ui: uiTokens };
const value = (ref) => tokenValue(ref, tokens);

/**
 * The resolved table for this shop, and the guarantee that it covers every
 * background the palette declares.
 *
 * `resolveGrounds` throws on a block pointed at a ground that does not exist,
 * on an override naming a field that is not a ground's, and on more grounds
 * than the ceiling. `assertGroundsCover` throws on a background nobody placed.
 * All four are failures the old five lists could only express as silence.
 */
const grounds = resolveGrounds({
  blocks: Object.fromEntries(groundPolarity),
  overrides: groundOverrides,
  colour: colourTokens,
});
assertGroundsCover(grounds, colourTokens);

const contrastHits = [];
let pairsChecked = 0;

/**
 * Floors a shop declared ACCEPTED rather than checked.
 *
 * These are not failures and they are not silence either. The pair is still
 * measured — the numbers below are real — and the shop's own sentence travels
 * with them, so a reader of this output learns that a decision was taken and
 * what it was. An exemption nobody can see is how the five hand-maintained
 * ground lists this pass replaced went wrong; `fill: {}` was the same shape one
 * layer up.
 */
const acceptedFloors = [];
let pairsAccepted = 0;

function range(ratios) {
  const low = Math.min(...ratios);
  const high = Math.max(...ratios);
  return low.toFixed(2) === high.toFixed(2)
    ? `${low.toFixed(2)}:1`
    : `${low.toFixed(2)}–${high.toFixed(2)}:1`;
}

function check(fg, fgRef, bg, bgRef, floor, why) {
  pairsChecked += 1;
  const ratio = contrast(fg, bg);
  if (ratio < floor) {
    contrastHits.push(
      `${fgRef} (${fg}) on ${bgRef} (${bg}) — ${ratio.toFixed(2)}:1, needs ${floor}:1  [${why}]`
    );
  }
}

for (const [name, ground] of Object.entries(grounds)) {
  /* The fills of this ground, each resolved into its two independent floors.
     A fill declared as a plain string comes back as both-checked, which is what
     it has always meant. */
  const fills = normalizeFills(ground, name);

  for (const background of ground.on) {
    const bg = value(background);

    /* Ink: everything that SETS TYPE on this ground. One floor, because the
       template sets no minimum type size — a token may end up under 24px
       anywhere, and the AA-large allowance would be a promise about font sizes
       this file cannot keep. That is not hypothetical: the accent was checked
       at the 3:1 non-text floor until this rewrite, and it paints `.trust-num`,
       which is 17px. */
    for (const ref of ground.ink) {
      check(value(ref), ref, bg, background, AA, `ink on the ${name} ground`);
    }

    /* The hairline. A VANISHING check, not a legibility one: below this the
       line is not quiet, it is absent. `quiet` grounds opt out, because how
       quiet a rule may be on a pale ground is the shop's decision — one
       storefront here ships card borders at 1.01:1 on purpose. */
    if (ground.rule && !ground.quiet) {
      check(value(ground.rule), ground.rule, bg, background, RULE_MIN, `the ${name} hairline`);
    }

    /* A fill is a graphical object: it has to read AS a shape against the
       ground it stands on. Its LABEL is checked once, below, against the fill
       rather than against the ground — two questions with two remedies, which
       is why each has its own floor a shop can accept independently. */
    for (const spec of fills) {
      if (spec.groundFloor !== 'checked') continue;
      check(value(spec.fill), spec.fill, bg, background, FILL_MIN, `a fill on the ${name} ground`);
    }

    /* The price role. Absent on every ground the template ships, and the
       absence is the behaviour: `.catalogue-price` reads
       `var(--text-price, var(--ground-ink-soft))`, so a shop that declares
       nothing keeps its prices on the body ink. Declaring one puts a value
       under this floor BEFORE anything paints with it. */
    if (ground.price) {
      check(value(ground.price), ground.price, bg, background, AA, `the price on the ${name} ground`);
    }
  }

  for (const spec of fills) {
    /* An accepted ground floor is still MEASURED — withholding the numbers
       would make the exemption exactly as unreadable as the silence it
       replaces. What the shop's sentence is for is the part the numbers cannot
       say: whether the shortfall was judged acceptable, or whether this fill
       does not stand on these backgrounds at all (a button on a photograph). */
    if (spec.groundFloor === 'accepted' && ground.on.length > 0) {
      /* The PAIR COUNT is printed, not just the token. One line per fill reads;
         one line per pair is the "number that goes up" this table was built to
         stop being. But the count has to be visible, because it is what a
         reviewer compares against the failures this used to produce. */
      pairsAccepted += ground.on.length;
      acceptedFloors.push(
        `${spec.fill} (${value(spec.fill)}) — ${ground.on.length} pair(s) vs the ${name} ` +
          `ground's background(s), ` +
          `${range(ground.on.map((bg) => contrast(value(spec.fill), value(bg))))}, ` +
          `floor ${FILL_MIN}:1\n      why: ${spec.why}`
      );
    }

    if (spec.label === null) continue;

    if (spec.labelFloor === 'accepted') {
      pairsAccepted += 1;
      acceptedFloors.push(
        `${spec.label} (${value(spec.label)}) on ${spec.fill} (${value(spec.fill)}) — ` +
          `${contrast(value(spec.label), value(spec.fill)).toFixed(2)}:1, floor ${AA}:1` +
          `\n      why: ${spec.why}`
      );
      continue;
    }

    check(value(spec.label), spec.label, value(spec.fill), spec.fill, AA, `the label on ${spec.fill}`);
  }
}

/**
 * Blocks that sit directly against each other in the document.
 *
 * Not a ground question and deliberately kept as its own list: it asks whether
 * two BACKGROUNDS are distinguishable, which no ink set has an opinion about.
 * Adjacency is the whole reason the contact strip needed its own ground in the
 * first place; a ratio of 1 is two blocks that look like one.
 */
const ADJACENT = [
  ['color.contact-bg', 'color.footer-bg', 'the contact strip sits on top of the footer'],
];

for (const [aRef, bRef, why] of ADJACENT) {
  pairsChecked += 1;
  const ratio = contrast(value(aRef), value(bRef));
  if (ratio < ADJACENT_MIN) {
    contrastHits.push(
      `${aRef} (${value(aRef)}) and ${bRef} (${value(bRef)}) are not visibly apart — ` +
        `${ratio.toFixed(3)}:1, needs ${ADJACENT_MIN}:1  [${why}]`
    );
  }
}

/* PRINTED BEFORE THE THROW, deliberately. An accepted floor is a decision this
   shop took, and a decision that only shows up on the runs that happen to pass
   is one nobody reads on the runs that matter. */
if (acceptedFloors.length > 0) {
  console.log(
    `${acceptedFloors.length} floor(s) accepted rather than checked, covering ${pairsAccepted} ` +
      `token pair(s) — measured, decided, recorded:\n    ` + acceptedFloors.join('\n    ')
  );
}

if (contrastHits.length) {
  throw new Error(
    `${contrastHits.length} palette contrast failure(s) in brand/identity.ts:\n  ` +
      contrastHits.join('\n  ')
  );
}

const groundNames = Object.keys(grounds);
console.log(
  `Palette contrast verified: ${pairsChecked} token pair(s) across ${groundNames.length} ` +
    `ground(s) (${groundNames.join(', ')}), all clear.`
);
