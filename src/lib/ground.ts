/**
 * Grounds: the six colour roles a block needs, and the two ways to fill them.
 *
 * ## What this replaces
 *
 * The palette assumed one pale page plus one dark footer. The footer was the
 * only block modelled as a dark region with a full ink set of its own, so any
 * other section that wanted to go dark had to conscript the pale page's body
 * inks — the same tokens being used as dark ink elsewhere on the same page. A
 * dark header could not be expressed at all: the wordmark, the nav and the
 * cart read four tokens that are simultaneously the pale page's running text.
 *
 * Following the footer's example does not scale. Four dark blocks would mean
 * four private ink sets — sixteen tokens all meaning the same six things.
 *
 * ## The mechanism
 *
 * A block does not read `--color-ink` or `--text-muted` any more. It reads a
 * ROLE, and `[data-ground]` decides which set of values that role resolves to:
 *
 *   ink-strong  headings, wordmarks, product names
 *   ink         running text
 *   ink-soft    the level below that — prices, secondary links
 *   ink-muted   captions, subtitles
 *   rule        hairlines, borders, the lines flanking a section title
 *   accent      the brand colour AS IT APPEARS HERE: icons, small caps, marks
 *
 * Six roles because six is what the selectors already distinguish. The pale
 * column resolves to the exact token each consumer read before, which is why
 * introducing this moved nothing: the indirection is new, the values are not.
 *
 * Nesting is free, because custom properties inherit. A pale card inside a
 * dark band declares `light` on itself and its whole subtree re-resolves — no
 * descendant selectors, no specificity fight. That is "a dark catalogue band
 * holding pale cards" reduced to one attribute.
 *
 * ## The bindings are COMPILED now, not written out
 *
 * They used to be a string literal here, and the audit that checked them was
 * five hand-maintained lists in `scripts/audit-color.mjs`. Two copies of one
 * fact, kept in step by whoever remembered — which is how `footer-bg` ended up
 * pinned to an ink set it does not use, after `contact-bg` and `header-bg` had
 * each needed a hand-written exemption for the same reason.
 *
 * So both readers now walk ONE table, `src/lib/grounds.mjs`: this module
 * compiles it to CSS, and the audit walks it to compute contrast. The default
 * table compiles to the exact string that used to be typed here — pinned
 * byte-for-byte by `tests/grounds.test.mjs`, because "this refactor changed no
 * output" is a claim, and an unchecked claim about generated CSS is how a
 * storefront's whole palette moves by one character.
 *
 * ## Why this file is in src/ and not in brand/
 *
 * It carries no colour and no brand fact — only token NAMES and the rule that
 * maps roles to them. The values live in `brand/identity.ts`, per shop; the
 * mechanism is template code, and template code that lived in `brand/` would
 * have to be copied into every storefront and kept in step by hand.
 * `audit:color` still passes: there is no literal here to find.
 */
import { identity } from '../../brand/identity';
import type { GroundName, GroundPolarities } from '../../brand/identity';
import {
  assertGroundsCover,
  groundRolesCss as compileGroundRolesCss,
  resolveGrounds,
} from './grounds.mjs';

/**
 * This shop's ground table: the template's default four, with the six blocks
 * distributed onto them by `identity.groundPolarity`, and the shop's own
 * `identity.grounds` on top.
 *
 * Resolved at module load so a malformed declaration fails the build rather
 * than rendering a page whose roles resolve to nothing.
 */
export const grounds = resolveGrounds({
  blocks: identity.groundPolarity,
  overrides: identity.grounds ?? {},
  colour: identity.tokens.color,
});

/* Every declared background belongs to exactly one ground. Checked HERE as
   well as in the audit, because the audit is a separate command a build does
   not run: an unclassified ground token would otherwise reach a rendered page
   and only be caught by somebody remembering to run `npm test`. */
assertGroundsCover(grounds, identity.tokens.color);

/**
 * The role bindings, emitted once beside `:root` by BaseLayout.
 *
 * `:root` is included in the pale selector so that anything outside a block
 * that declares a ground still resolves — the page's own ground is pale, and a
 * role that resolved to nothing would render as an unstyled colour rather than
 * as a visible mistake.
 */
export const groundRolesCss = compileGroundRolesCss(grounds);

/**
 * `data-ground` for one block, ready to spread onto an element.
 *
 * Emitted ALWAYS, including for the pale ground. A block whose attribute
 * vanished at the default would re-resolve against whichever ancestor last set
 * one — which is exactly the bug this replaces: a pale card inside a dark band
 * inheriting the band's ink because nothing said otherwise.
 */
export function ground(block: keyof GroundPolarities): { 'data-ground': GroundName } {
  return { 'data-ground': identity.groundPolarity[block] };
}
