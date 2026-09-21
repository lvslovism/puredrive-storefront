/**
 * The ground table: every ground this palette paints, declared once.
 *
 * ## What this replaces, and why a fourth special case was inevitable
 *
 * The contrast pass used to carry five hand-maintained lists — `PAGE_GROUNDS`,
 * `BLOCK_GROUNDS`, `DARK_REFERENCE_GROUNDS`, `MARK_SITES`, `REVERSED` — plus a
 * two-valued `groundPolarity` enum. Between them they were describing FOUR
 * distinct ink sets:
 *
 *   the pale page       ink / text.* on surface, soft, mist, and the blocks
 *   the dark bands      on-dark-* wherever a block declares `dark`
 *   the footer          footer-heading / footer-text on footer-bg
 *   the contact strip   contact-text on contact-bg
 *
 * A two-valued enum expresses two of them. The other two had to be smuggled in
 * as entries in `REVERSED` and `DARK_REFERENCE_GROUNDS`, and every ground that
 * did not fit the enum arrived as a new special case: `contact-bg` got one,
 * `header-bg` got one, `footer-bg` was the third and was still wrong — it was
 * pinned to the reversed ink set BY NAME, so a shop wanting a pale footer had
 * to satisfy `on-dark-*` against a near-white ground and against `ui.cta-dark`
 * at the same time. Measured on one shop's palette: the reversed inks needed
 * L >= 0.2147 for the dark ground and L <= 0.1576 for the pale one. Sweeping
 * all 256 greys, the number of values satisfying both is ZERO. That requirement
 * was not strict, it was unsatisfiable.
 *
 * A fourth special case would have been followed by a fifth. So the enum stops
 * being the unit of description: a GROUND is the unit, and a ground carries
 * both halves — the backgrounds it is painted on AND the tokens that stand on
 * them.
 *
 * ## What a ground is
 *
 *   on      the background tokens this ink set is painted on
 *   ink     every token that SETS TYPE here — each must clear AA on each `on`
 *   rule    the hairline drawn here
 *   quiet   this ground's hairline may be quieter than the floor
 *   fill    non-text fills painted here, each mapped to the label it carries —
 *           a token reference for the ordinary case, or the long form when a
 *           floor is accepted rather than checked. See `normalizeFill`.
 *   price   the price role, when a shop sets prices apart from its body ink
 *
 * Every value is a TOKEN REFERENCE — `'color.footer-text'`, `'ui.cta-dark'` —
 * never a literal. That is what lets a per-shop override widen the audit rather
 * than escape it: an override names a token `tokens.color` already declares, so
 * the value is still covered by the literal ban AND now gets measured against a
 * ground it was never measured against before.
 *
 * ## The property that stops the sixth special case
 *
 * `assertGroundsCover` fails when a background token belongs to no ground. A
 * new `--color-*-bg` is then a BUILD FAILURE rather than a value nothing looks
 * at, which is the exact shape of the footer-bg miss.
 *
 * ## Why this file is .mjs and lives in src/lib
 *
 * Two readers with no build step in common: `src/lib/ground.ts` compiles the
 * table into the `[data-ground]` bindings BaseLayout inlines, and
 * `scripts/audit-color.mjs` walks it to compute contrast. A .ts module is
 * unreadable to the second; duplicating the table would put the audit and the
 * stylesheet on separate copies of one fact, which is the failure this file
 * exists to argue against. `src/lib/checkout-payments.mjs` and
 * `src/lib/utm-order.mjs` are here for the same reason.
 *
 * It holds no colour, so `audit:color` scans it and finds nothing.
 */

/** The roles a `[data-ground]` binding emits, in the order they are written. */
export const CSS_ROLES = ['ink-strong', 'ink', 'ink-soft', 'ink-muted', 'rule', 'accent'];

/** Body text, and anything else somebody reads. */
export const AA = 4.5;
/** A fill is a graphical object: WCAG's non-text floor. */
export const FILL_MIN = 3;
/** A hairline's floor is a VANISHING check, not a legibility one. See `quiet`. */
export const RULE_MIN = 1.1;
/** Two adjacent full-width blocks below this read as a single slab. */
export const ADJACENT_MIN = 1.2;

/**
 * At most four ink sets per shop.
 *
 * Not a technical limit — a limit on the table this produces. Four is what the
 * palette already needed; a fifth is the signal that a block wants its own
 * private ink set, which is the sixteen-tokens-for-six-jobs shape the ground
 * mechanism exists to prevent.
 */
export const MAX_GROUNDS = 4;

/** Page grounds: painted by every route, never turned over by a block. */
const PAGE_BACKGROUNDS = [
  'color.surface',
  'color.soft',
  'color.mist',
  'color.product-bg',
  'color.login-bg',
];

/**
 * The six blocks that own a ground, and the background token each one paints.
 * `identity.groundPolarity` says WHICH ground each of them stands on.
 */
export const BLOCK_BACKGROUNDS = {
  header: 'color.header-bg',
  trust: 'color.trust-bg',
  catalogue: 'color.catalogue-bg',
  catalogueCard: 'color.catalogue-card-bg',
  scenes: 'color.scenes-bg',
  sceneCard: 'color.scene-card-bg',
};

/**
 * Backgrounds that are neither a block's nor a page's, and the ground each one
 * belongs to. Listed rather than derived from the `-bg` suffix because
 * `ui.cta-dark` has no suffix, and because `color.cta` carries one job that is
 * not a ground at all — it is a FILL, checked against whatever it stands on.
 */
const FIXED_BACKGROUNDS = {
  'ui.cta-dark': 'dark',
  'color.footer-bg': 'footer',
  'color.contact-bg': 'contact',
};

const FIELDS = ['on', 'ink', 'rule', 'quiet', 'fill', 'price', 'selector', 'css'];

/**
 * What a fill's two floors may say.
 *
 * `checked` is the default and the only value a shop ever has to type — a fill
 * declared as a plain string means both floors are checked, which is what every
 * declaration meant before this field existed.
 */
export const FILL_FLOORS = ['checked', 'accepted'];

/** The fields of a fill declared in its long form. */
const FILL_FIELDS = ['label', 'groundFloor', 'labelFloor', 'why'];

/**
 * The default table. A shop that declares nothing gets exactly this, and
 * exactly this compiles to the two `[data-ground]` rules that shipped before
 * the table existed — which is what lets every storefront take this change and
 * render byte-for-byte what it rendered before. `tests/grounds.test.mjs` pins
 * that string, so the property is checked rather than believed.
 */
function defaultGrounds() {
  return {
    light: {
      on: [...PAGE_BACKGROUNDS],
      /**
       * SEVEN tokens for four levels, and the duplication is real rather than
       * sloppy: `--color-ink` and `--text-primary` are both the strongest ink
       * and both are read from `src/` (98 and 9 sites), so both have to clear.
       *
       * `color.cta` is here because the accent SETS TYPE on a pale ground —
       * `.trust-num` is 17px copy painted `var(--ground-accent)`. It used to be
       * checked at the 3:1 non-text floor, which is the wrong question about a
       * numeral somebody reads, and the wrong floor by more than a point on
       * three shops. See `fill` for the other half of the same token's job.
       */
      ink: [
        'color.ink',
        'color.text',
        'color.muted',
        'text.primary',
        'text.secondary',
        'text.muted',
        'color.cta',
      ],
      rule: 'color.border',
      /**
       * How quiet a hairline may be on a PALE ground is the shop's decision:
       * one storefront here ships card borders at 1.01:1 against the band
       * behind them, with the cards told apart by their own background and the
       * border a whisper on top. That is a look, not a defect. The floor exists
       * for the OTHER failure — a rule picked for a pale ground landing on a
       * dark one and resolving to roughly that ground's own value, where the
       * line was asked for and is not there.
       */
      quiet: true,
      /**
       * The primary button. Its fill has to read AS a button against whatever
       * it stands on (3:1), and its label has to read on the fill (4.5:1).
       * The second half was already checked; the first half was checked on no
       * ground at all — only the optional header button's fill was.
       *
       * Declared as a string, which is the short form for "check both". A shop
       * that has measured one of the two and decided about it says so in the
       * long form rather than emptying the map; see `normalizeFill`.
       */
      fill: { 'color.cta': 'color.cta-text' },
      price: null,
      selector: ':root,\n[data-ground="light"]',
      css: {
        'ink-strong': 'color.ink',
        ink: 'text.primary',
        'ink-soft': 'text.secondary',
        'ink-muted': 'text.muted',
        rule: 'color.border',
        accent: 'color.cta',
      },
    },

    dark: {
      /**
       * `ui.cta-dark` is a ground the template paints on four pages — the 404,
       * the member panel, the order result and the cart drawer — so the dark
       * ink set is measured against a real background even in a shop that
       * turns no block over. It is NOT a "reference ground" invented to give
       * the reversed palette somewhere to be checked; that framing is what put
       * `footer-bg` in the same list and made a pale footer unsayable.
       */
      on: ['ui.cta-dark'],
      /**
       * `color.on-dark` is an ink on a dark ground that does NOT arrive through
       * the `--ground-*` bindings — the 404 and the member panel paint
       * `var(--color-on-dark)` directly. It was carried as a one-off entry in
       * `REVERSED`; it is an ink on this ground, so it is declared as one.
       *
       * `color.footer-text` WAS HERE TOO, and its removal is the second half of
       * the fix the `footer` ground below was written for.
       *
       * It was here because the hero copy panel's eyebrow painted
       * `var(--color-footer-text)` — not because the footer ink belongs on a
       * near-black wash, but because for a long time it was the only muted ink
       * any palette declared for a dark ground. That stand-in made one token an
       * ink on two grounds at once, and the two pull in opposite directions: a
       * cream footer needs it around L <= 0.18, this wash needs it around
       * L >= 0.30. Empty intersection — the same unsatisfiable shape `footer-bg`
       * had, one token over, and it meant giving the footer its own ground fixed
       * the BACKGROUND while leaving the INK unsayable.
       *
       * The home components now point that eyebrow at `color.on-dark-muted`,
       * which is the ink this palette declares for exactly that job and is
       * already checked against this ground two lines up. So nothing left the
       * audit; a role moved to the token that owns it.
       *
       * ⚠️ A shop whose own home component still paints `--color-footer-text`
       * on a dark ground is no longer having that pair measured. The two are
       * one change: move the rule, then take this.
       */
      ink: [
        'color.on-dark-strong',
        'color.on-dark-ink',
        'color.on-dark-soft',
        'color.on-dark-muted',
        'color.on-dark-accent',
        'color.on-dark',
      ],
      rule: 'color.on-dark-rule',
      quiet: false,
      fill: {},
      price: null,
      selector: '[data-ground="dark"]',
      css: {
        'ink-strong': 'color.on-dark-strong',
        ink: 'color.on-dark-ink',
        'ink-soft': 'color.on-dark-soft',
        'ink-muted': 'color.on-dark-muted',
        rule: 'color.on-dark-rule',
        accent: 'color.on-dark-accent',
      },
    },

    /**
     * The footer, as a ground of its own rather than as the dark ground's
     * second background.
     *
     * This is the fix the whole file was written for. Its inks are
     * `footer-heading` / `footer-text`, declared next to `footer-bg` and checked
     * against it and nothing else — so a shop that wants a pale footer sets
     * three tokens and the audit follows it there. Under the old list the
     * footer was pinned to `on-dark-*`, which were simultaneously pinned to
     * `ui.cta-dark`, and no value could satisfy both.
     *
     * AUDIT-ONLY: `selector` is null because nothing in `src/` declares
     * `data-ground` on the footer — `Footer.astro` reads `--color-footer-*`
     * directly. The ground exists to be MEASURED. Rewiring the footer to read
     * roles changes shared CSS, and belongs to the round where the shops
     * re-sync rather than to the round that makes the measurement possible.
     */
    footer: {
      on: ['color.footer-bg'],
      ink: ['color.footer-text', 'color.footer-heading'],
      rule: 'color.footer-rule',
      quiet: false,
      fill: {},
      price: null,
      selector: null,
      css: null,
    },

    /**
     * The contact strip. One ink, because one ink is what the block paints.
     *
     * Nothing here has to be dark, and that was already true — three shops in
     * this family ship a pale panel. What is new is that saying so is a ground
     * rather than an exemption written into the audit's comments.
     */
    contact: {
      on: ['color.contact-bg'],
      ink: ['color.contact-text'],
      rule: null,
      quiet: false,
      fill: {},
      price: null,
      selector: null,
      css: null,
    },
  };
}

/** `color.footer-bg` -> `--color-footer-bg`. Mirrors PREFIXES in identity.ts. */
const PREFIXES = { color: '--color-', text: '--text-', font: '--font-', ui: '--' };

export function cssVar(ref) {
  const dot = ref.indexOf('.');
  const prefix = dot === -1 ? undefined : PREFIXES[ref.slice(0, dot)];
  if (!prefix) {
    throw new Error(
      `grounds: "${ref}" does not name a token group. A reference is ` +
        `${Object.keys(PREFIXES).join(' / ')} followed by a dot and the token name.`,
    );
  }
  return `${prefix}${ref.slice(dot + 1)}`;
}

/** One token out of a group, whether the group arrived as a Map or an object. */
function readToken(bag, name) {
  return bag instanceof Map ? bag.get(name) : bag[name];
}

/** The declared value behind a token reference, or throw naming it. */
export function tokenValue(ref, tokens) {
  const dot = ref.indexOf('.');
  const group = dot === -1 ? '' : ref.slice(0, dot);
  const name = ref.slice(dot + 1);
  const bag = tokens[group];
  if (!bag) {
    throw new Error(
      `grounds: "${ref}" names no token group in brand/identity.ts. ` +
        `Groups are ${Object.keys(PREFIXES).join(', ')}.`,
    );
  }
  const value = bag instanceof Map ? bag.get(name) : bag[name];
  if (value === undefined) {
    throw new Error(
      `grounds: "${ref}" is not declared in brand/identity.ts. A ground names the ` +
        'tokens it paints with, so a renamed token has to fail here rather than drop a ' +
        'ground quietly out of the audit.',
    );
  }
  return value;
}

/**
 * One fill entry, resolved into the two INDEPENDENT questions it has always
 * been asking.
 *
 * ## Why this is two questions and was one field
 *
 * `fill: { 'color.cta': 'color.cta-text' }` drives:
 *
 *   fill vs ground   `color.cta` against every background on the ground, at
 *                    FILL_MIN — "does this read AS a control against what it
 *                    sits on".
 *   label on fill    `color.cta-text` against `color.cta`, at AA — "is the
 *                    writing on it readable".
 *
 * Different properties, different remedies, and until this function the map
 * offered no way to separate them. A shop that had measured and accepted one
 * had to accept the other too, because the only lever was `identity.grounds`
 * REPLACING the field — and `fill: {}` silences the whole entry, including the
 * half that passes. That is not an exemption, it is a blindfold.
 *
 * ## The three states, and the one that had to be built
 *
 *   declared as a string   both floors checked                (unchanged)
 *   groundFloor/labelFloor accepted, with a reason, and PRINTED
 *   absent                 neither floor exists
 *
 * The middle row covers two cases with one mechanism: a shortfall somebody
 * measured and decided about, and a fill that stands on no ground at all — a
 * button on a PHOTOGRAPH. The second used to be expressible only by leaving the
 * fill out of the table, which also stopped anything checking its label.
 *
 * ## Two properties this insists on
 *
 * 1. **`why` is REQUIRED whenever a floor is accepted**, and the audit PRINTS
 *    the accepted line. An exemption that is silent becomes invisible, and
 *    invisible is precisely how the five hand-maintained ground lists this
 *    file replaced went wrong. The numbers belong in `brand/` next to the
 *    value; this only proves somebody wrote a sentence rather than reaching for
 *    a blanket empty map.
 * 2. **An unreadable entry throws.** A fill this cannot parse is not skipped —
 *    skipping is how a declaration becomes a value nobody measures.
 */
export function normalizeFill(fillRef, entry, groundName) {
  const where = `grounds: \`${groundName}.fill['${fillRef}']\``;

  if (typeof entry === 'string') {
    return { fill: fillRef, label: entry, groundFloor: 'checked', labelFloor: 'checked', why: null };
  }

  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new Error(
      `${where} is ${JSON.stringify(entry)}. A fill is either the token reference of the ` +
        'label it carries, or an object with ' + FILL_FIELDS.join(' / ') + '. Anything else ' +
        'would have to be ignored, and an ignored fill is a colour nothing measures.',
    );
  }

  const unknown = Object.keys(entry).filter((key) => !FILL_FIELDS.includes(key));
  if (unknown.length > 0) {
    throw new Error(
      `${where} has unknown field(s) ${unknown.join(', ')}. A fill is ` +
        `${FILL_FIELDS.join(' / ')} and nothing else — a misspelt field would otherwise be ` +
        'accepted and ignored, which looks exactly like a value that did not work.',
    );
  }

  const label = entry.label ?? null;
  if (label !== null && typeof label !== 'string') {
    throw new Error(
      `${where} declares \`label: ${JSON.stringify(entry.label)}\`. It is the token reference ` +
        'of the writing on this fill, or null for a fill that carries none.',
    );
  }

  const floors = {};
  for (const key of ['groundFloor', 'labelFloor']) {
    const value = entry[key] ?? 'checked';
    if (!FILL_FLOORS.includes(value)) {
      throw new Error(
        `${where} declares \`${key}: ${JSON.stringify(entry[key])}\` — it has to be ` +
          `${FILL_FLOORS.map((v) => `'${v}'`).join(' or ')}, or absent. Absent means ` +
          "'checked', which is what a fill declared as a plain string has always meant.",
      );
    }
    floors[key] = value;
  }

  if (floors.labelFloor === 'accepted' && label === null) {
    throw new Error(
      `${where} accepts its label floor and declares no label. There is nothing to accept: ` +
        'say `label: null` on its own for a fill that carries no writing.',
    );
  }

  if (entry.why !== undefined && typeof entry.why !== 'string') {
    throw new Error(
      `${where} declares \`why: ${JSON.stringify(entry.why)}\`. It is free text — a sentence ` +
        'for the next reader. Accepting anything else here would mean a written reason could ' +
        'be dropped for having the wrong type, which is the same silence this field replaced.',
    );
  }

  const accepted = Object.keys(floors).filter((key) => floors[key] === 'accepted');
  const why = typeof entry.why === 'string' ? entry.why.trim() : '';
  if (accepted.length > 0 && why === '') {
    throw new Error(
      `${where} accepts ${accepted.join(' and ')} and gives no \`why\`. An accepted floor is a ` +
        'measurement somebody took and a decision somebody made, and the next reader gets ' +
        'neither from the word "accepted". Write the sentence — free text, and the numbers ' +
        'belong in brand/ next to the value.',
    );
  }

  return { fill: fillRef, label, groundFloor: floors.groundFloor, labelFloor: floors.labelFloor, why: why || null };
}

/** Every fill on one ground, normalized. The order the shop declared them in. */
export function normalizeFills(ground, groundName) {
  return Object.entries(ground.fill ?? {}).map(([ref, entry]) =>
    normalizeFill(ref, entry, groundName),
  );
}

/**
 * The resolved table for one shop: the default grounds, the blocks distributed
 * onto them by `groundPolarity`, then the shop's own overrides on top.
 *
 * An override REPLACES a field rather than merging into it. A ground that
 * declared `ink: [...]` and got two more inks appended by accident is a ground
 * whose audit result nobody can predict from reading the declaration;
 * replacement means the file says what is checked.
 */
export function resolveGrounds({ blocks, overrides = {}, colour = {} }) {
  const grounds = defaultGrounds();

  for (const [background, name] of Object.entries(FIXED_BACKGROUNDS)) {
    if (!grounds[name].on.includes(background)) grounds[name].on.push(background);
  }

  for (const [block, background] of Object.entries(BLOCK_BACKGROUNDS)) {
    const name = blocks[block];
    if (name === undefined) {
      throw new Error(
        `grounds: \`groundPolarity.${block}\` is not declared in brand/identity.ts, ` +
          `but ${background} is a ground that block paints. A ground with no declared ` +
          'ink set cannot be checked — the declaration IS what says which inks to check.',
      );
    }
    if (!grounds[name]) {
      throw new Error(
        `grounds: \`groundPolarity.${block}\` is "${name}", which is not a declared ` +
          `ground. Declared: ${Object.keys(grounds).join(', ')}. Declare it under ` +
          '`identity.grounds` before pointing a block at it.',
      );
    }
    grounds[name].on.push(background);
  }

  for (const [name, patch] of Object.entries(overrides)) {
    const unknown = Object.keys(patch).filter((key) => !FIELDS.includes(key));
    if (unknown.length > 0) {
      throw new Error(
        `grounds: \`identity.grounds.${name}\` has unknown field(s) ${unknown.join(', ')}. ` +
          `A ground is ${FIELDS.join(' / ')} and nothing else — a misspelt field would ` +
          'otherwise be accepted and ignored, which looks exactly like a value that did not work.',
      );
    }
    const base = grounds[name] ?? {
      on: [],
      ink: [],
      rule: null,
      quiet: false,
      fill: {},
      price: null,
      selector: null,
      css: null,
    };
    grounds[name] = { ...base, ...patch };
  }

  /**
   * The header's own button pair, if the shop declared one.
   *
   * OPTIONAL, and absent it is not unchecked — `Header.astro` falls back to
   * `--cta-dark` / `--color-on-dark`, which are already an ink and a ground in
   * the table. So this exists for the shop that DID declare one, and it insists
   * on both halves: a ground without its ink is a button whose label has
   * vanished, and declaring only one is the likeliest way to get there.
   *
   * It is attached HERE rather than written into the default table because
   * which ground it stands on is not fixed — the button sits in the header, so
   * it is a fill on whichever ground `groundPolarity.header` names. Three
   * storefronts in this family run a dark header and would have had it checked
   * against the pale ground's floor.
   */
  const hasBg = readToken(colour, 'header-cta-bg') !== undefined;
  const hasInk = readToken(colour, 'header-cta-ink') !== undefined;
  if (hasBg !== hasInk) {
    throw new Error(
      'grounds: tokens.color.header-cta-bg and header-cta-ink are declared together or ' +
        'not at all. One without the other is a button that keeps the old ink on a new ground.',
    );
  }
  /*
   * The shop's own declaration WINS. It used to be spread over, which meant a
   * shop could never say anything about this pair: whatever it wrote here was
   * overwritten by the plain string a line later, so the header button's fill
   * was the one fill in the table with no shop-side lever at all. On a shop
   * whose header button is a designer-specified colour that is half its
   * standing contrast failures, and none of them were addressable.
   */
  if (hasBg) {
    const headerFill = grounds[blocks.header].fill ?? {};
    if (!Object.prototype.hasOwnProperty.call(headerFill, 'color.header-cta-bg')) {
      grounds[blocks.header].fill = {
        ...headerFill,
        'color.header-cta-bg': 'color.header-cta-ink',
      };
    }
  }

  /* Every fill is parsed HERE, so an unreadable declaration fails while the
     table is being built rather than in whichever of the two readers happens to
     look at it first. The result is discarded — `normalizeFills` is cheap and
     both readers call it again for the values. */
  for (const [name, ground] of Object.entries(grounds)) normalizeFills(ground, name);

  const names = Object.keys(grounds);
  if (names.length > MAX_GROUNDS) {
    throw new Error(
      `grounds: ${names.length} grounds declared (${names.join(', ')}), and the ceiling is ` +
        `${MAX_GROUNDS}. Each ground multiplies the contrast table by the number of ` +
        'backgrounds it paints; past four the table stops being something anyone reads and ' +
        'becomes a number that goes up. Fold two grounds together, or raise the ceiling ' +
        'deliberately and say why.',
    );
  }

  return grounds;
}

/**
 * Every background this palette declares belongs to exactly one ground, or the
 * build stops.
 *
 * THIS IS THE POINT OF THE FILE. `footer-bg` was checked against the wrong ink
 * set for as long as it was checked at all, and `contact-bg` and `header-bg`
 * each needed a hand-written exemption before it. What none of the three had
 * was anything that would have NOTICED a background nobody had classified — so
 * the next one after `footer-bg` would have gone unscanned in exactly the same
 * way, and the one after that.
 *
 * The convention is the `-bg` suffix. A token that ends in `-bg` and belongs to
 * no ground is either a ground somebody forgot to place or a fill somebody
 * named misleadingly, and both are worth stopping for. The unsuffixed page
 * grounds and `ui.cta-dark` are placed by name above, so they cannot go
 * missing either.
 */
export function assertGroundsCover(grounds, colourTokens) {
  const placed = new Map();
  for (const [name, ground] of Object.entries(grounds)) {
    for (const background of ground.on) {
      const already = placed.get(background);
      if (already) {
        throw new Error(
          `grounds: ${background} is painted by two grounds (${already} and ${name}). ` +
            'A background carries one ink set; two means the audit would pass it against ' +
            'inks the page never puts there.',
        );
      }
      placed.set(background, name);
    }
  }

  const isFill = new Set(
    Object.values(grounds).flatMap((ground) => Object.keys(ground.fill ?? {})),
  );

  const keys = colourTokens instanceof Map ? [...colourTokens.keys()] : Object.keys(colourTokens);
  const orphans = keys
    .filter((key) => key.endsWith('-bg'))
    .map((key) => `color.${key}`)
    .filter((ref) => !placed.has(ref) && !isFill.has(ref));

  if (orphans.length > 0) {
    throw new Error(
      `grounds: ${orphans.join(', ')} name a background that belongs to no ground. ` +
        "Add it to a ground's `on` (it carries an ink set) or declare it as a `fill` " +
        '(it carries only its own label). A background nobody classified is a background ' +
        'nobody measures, which is how a footer shipped against the wrong ink set.',
    );
  }

  return placed;
}

/**
 * The `[data-ground]` bindings, compiled from the table.
 *
 * Grounds with a null `selector` emit nothing: they are measured, not painted
 * through roles. Only the six CSS_ROLES are emitted — `fill` and `price` are
 * declarations the AUDIT reads, and a custom property nothing in `src/` reads
 * would be dead CSS shipped on every page of every storefront.
 */
export function groundRolesCss(grounds) {
  return Object.values(grounds)
    .filter((ground) => ground.selector && ground.css)
    .map((ground) => {
      const lines = CSS_ROLES.filter((role) => ground.css[role]).map(
        (role) => `  --ground-${role}: var(${cssVar(ground.css[role])});`,
      );
      return `${ground.selector} {\n${lines.join('\n')}\n}`;
    })
    .join('\n\n');
}
