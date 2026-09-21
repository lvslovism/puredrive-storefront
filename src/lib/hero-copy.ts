/**
 * The hero block's contract, checked at the moment it is rendered.
 *
 * ## The failure this exists to make loud
 *
 * `HeroCopy.tone` is a required field of the type, and `homeLanding.hero`
 * shipped without it. TypeScript would have said so — but nothing type-checks:
 * `npm run build` is `astro build`, which compiles and never runs `astro
 * check`, and the tests only exercise `src/lib`. So the value arrived as
 * `undefined`, went straight into a template literal, and the landing preset
 * built a green `<section class="home-hero home-hero--undefined">`.
 *
 * That is the shape worth naming: a missing field that becomes a CLASS NAME
 * fails silently by construction. The class does not match any rule, so the
 * page renders — just without the legibility scrim the tone was there to
 * select. Nothing throws, nothing warns, and the only symptom is a hero whose
 * copy is harder to read than it should be.
 *
 * ## Two defences, because one of them cannot see far enough
 *
 * 1. This module. The renderer asks for the tone through `assertHeroCopy`,
 *    which throws — the same fail-visible doctrine `deriveLegalContact` follows
 *    for the company block. A missing field now fails the build instead of
 *    shipping a class nothing styles.
 *
 * 2. `tests/home-copy.test.ts`. This module only sees the preset a shop has
 *    SELECTED, and the defect was in the one it had not — `home` pointed at
 *    `homeMultipage`, so the broken `homeLanding` was never rendered and never
 *    would have thrown. The test walks every preset the template ships,
 *    selected or not, because switching preset is a one-line edit and must not
 *    also be a bug report.
 */

/** The two ways a hero photograph can run. See `HeroCopy.tone` in brand/copy.ts. */
export const HERO_TONES = ['light', 'dark'] as const;
export type HeroTone = (typeof HERO_TONES)[number];

/** What is put between the copy and the picture. See `HeroCopy.copyGround`. */
export const COPY_GROUNDS = ['scrim', 'panel', 'none'] as const;
export type CopyGround = (typeof COPY_GROUNDS)[number];

/** Which side of the hero the copy sits on. See `HeroCopy.align`. */
export const HERO_ALIGNS = ['left', 'right'] as const;
export type HeroAlign = (typeof HERO_ALIGNS)[number];

/**
 * The scrim, as three things that vary independently.
 *
 * It used to be one hard-coded gradient: a wash of `--color-surface` running
 * from the left, solid for its first quarter. That is one photograph's answer.
 * A hero whose subject sits on the left, or whose picture is dark enough that
 * a pale wash reads as damage rather than as a wash, has no way to say so —
 * and the copy has to go where the wash is, so the gradient was silently
 * deciding the layout too.
 *
 * Three fields rather than a list of named presets, because the combinations
 * are genuinely independent: any side, either tint, any depth. Naming the
 * eight of them would be naming the same three choices eight times.
 */
export const SCRIM_SIDES = ['left', 'right'] as const;
export type ScrimSide = (typeof SCRIM_SIDES)[number];

/**
 * Which token the wash is built from. `surface` is the page's own pale ground;
 * `dark` is the same near-black the copy panel uses, for a photograph that
 * needs its copy reversed out rather than darkened onto.
 */
export const SCRIM_TINTS = ['surface', 'dark'] as const;
export type ScrimTint = (typeof SCRIM_TINTS)[number];

/**
 * How far the wash carries and how solid it starts. `standard` is the shipped
 * gradient to the percentage point, so a hero that says nothing about depth
 * renders what it always did.
 */
export const SCRIM_DEPTHS = ['light', 'standard', 'heavy'] as const;
export type ScrimDepth = (typeof SCRIM_DEPTHS)[number];

export type HeroScrim = {
  from?: ScrimSide;
  tint?: ScrimTint;
  depth?: ScrimDepth;
};

/** Every scrim field, resolved. */
export type ResolvedScrim = {
  from: ScrimSide;
  tint: ScrimTint;
  depth: ScrimDepth;
};

/**
 * Fields with no sensible default. Each one is either read by the renderer or
 * printed on the page, and an empty string is as broken as a missing key —
 * `alt=""` on the LCP image and a button with no label are both defects that
 * build green.
 *
 * `eyebrow` is NOT one of them; see OPTIONAL_TEXT.
 */
const REQUIRED_TEXT = [
  'title',
  'description',
  'ctaLabel',
  'ctaHref',
  'image',
  'mobileImage',
  'imageAlt',
] as const;

/**
 * Fields that must be PRESENT and a string, and are allowed to be empty.
 *
 * `eyebrow` is a real editorial choice, not an oversight: plenty of comps put
 * nothing above the headline, and the renderers drop the element when it is
 * blank rather than shipping an empty <p> — the same rule `identity.logoSubtext`
 * follows. Holding it to the same standard as the title would force every such
 * shop to invent a word it did not want.
 *
 * A MISSING key is still a failure. "Deliberately empty" and "forgotten" look
 * identical in a rendered page and different in a source file, and this is the
 * file that can tell them apart.
 */
const OPTIONAL_TEXT = ['eyebrow'] as const;

/**
 * Verify a hero block, or throw naming the preset it came from.
 *
 * `where` is the caller's own name for the copy it was handed ("homeLanding"),
 * so the message points at the object to fix rather than at this file.
 */
export function assertHeroCopy(hero: unknown, where: string): void {
  if (typeof hero !== 'object' || hero === null) {
    throw new Error(`hero-copy: ${where}.hero is ${hero === null ? 'null' : typeof hero}, not an object.`);
  }
  const block = hero as Record<string, unknown>;

  const tone = block.tone;
  if (typeof tone !== 'string' || !HERO_TONES.includes(tone as HeroTone)) {
    throw new Error(
      `hero-copy: ${where}.hero.tone is ${JSON.stringify(tone)} — it has to be ` +
        `${HERO_TONES.map((value) => `'${value}'`).join(' or ')}. ` +
        'It says which way the PHOTOGRAPH runs, so the copy on top of it can be legible; ' +
        'without it the hero renders a class no stylesheet matches and quietly loses its scrim.'
    );
  }

  const missing = REQUIRED_TEXT.filter(
    (key) => typeof block[key] !== 'string' || (block[key] as string).trim() === ''
  );
  if (missing.length > 0) {
    throw new Error(
      `hero-copy: ${where}.hero is missing ${missing.join(', ')}. ` +
        'Every one of them is either read by the renderer or printed on the page, ' +
        'so a blank is a defect that would otherwise build green.'
    );
  }

  const absent = OPTIONAL_TEXT.filter((key) => typeof block[key] !== 'string');
  if (absent.length > 0) {
    throw new Error(
      `hero-copy: ${where}.hero has no ${absent.join(', ')} key. ` +
        'It may be an empty string — the renderer drops the element rather than ' +
        'printing a blank one — but it has to be there, so that "we chose not to ' +
        'have one" and "we forgot" stay distinguishable.'
    );
  }

  if (block.align !== undefined && !HERO_ALIGNS.includes(block.align as HeroAlign)) {
    throw new Error(
      `hero-copy: ${where}.hero.align is ${JSON.stringify(block.align)} — ` +
        `it has to be ${HERO_ALIGNS.map((value) => `'${value}'`).join(' or ')}, or absent. ` +
        'Absent means left, which is where every hero sat before the field existed. ' +
        'Like tone, this becomes a class name, so a typo would render a hero no rule matches.'
    );
  }

  if (block.scrim !== undefined) {
    if (typeof block.scrim !== 'object' || block.scrim === null || Array.isArray(block.scrim)) {
      throw new Error(
        `hero-copy: ${where}.hero.scrim is ${JSON.stringify(block.scrim)} — ` +
          'it has to be an object with any of from / tint / depth, or absent.'
      );
    }
    const scrim = block.scrim as Record<string, unknown>;
    const fields: [string, readonly string[]][] = [
      ['from', SCRIM_SIDES],
      ['tint', SCRIM_TINTS],
      ['depth', SCRIM_DEPTHS],
    ];
    for (const [key, allowed] of fields) {
      if (scrim[key] !== undefined && !allowed.includes(scrim[key] as string)) {
        throw new Error(
          `hero-copy: ${where}.hero.scrim.${key} is ${JSON.stringify(scrim[key])} — ` +
            `it has to be ${allowed.map((value) => `'${value}'`).join(', ')}, or absent. ` +
            'Each one becomes a class name; a typo renders a hero no rule matches, ' +
            'which is the silent failure this module exists to prevent.'
        );
      }
    }
    const unknown = Object.keys(scrim).filter((key) => !fields.some(([name]) => name === key));
    if (unknown.length > 0) {
      throw new Error(
        `hero-copy: ${where}.hero.scrim has unknown key(s) ${unknown.join(', ')}. ` +
          'The scrim is from / tint / depth and nothing else — a misspelt key would ' +
          'otherwise be accepted and ignored, which looks exactly like a value that did not work.'
      );
    }
  }

  for (const key of ['copyGround', 'mobileCopyGround'] as const) {
    if (block[key] !== undefined && !COPY_GROUNDS.includes(block[key] as CopyGround)) {
      throw new Error(
        `hero-copy: ${where}.hero.${key} is ${JSON.stringify(block[key])} — ` +
          `it has to be ${COPY_GROUNDS.map((value) => `'${value}'`).join(', ')}, or absent. ` +
          (key === 'copyGround'
            ? 'Absent means the tone decides: a scrim under a light image, nothing under a dark one.'
            : 'Absent means the phone gets whatever copyGround says.')
      );
    }
  }
}

/**
 * What sits between the copy and the photograph, with the tone's own answer as
 * the default.
 *
 * The default is what the two tones have always meant on their own, so a brand
 * file that says nothing renders exactly what it rendered before this field
 * existed. Saying 'none' out loud is a different statement from saying nothing:
 * it is a claim that the copy area was measured, which is why it is a value a
 * shop has to type rather than a state it can fall into.
 */
export function heroCopyGround(hero: { tone: HeroTone; copyGround?: CopyGround }): CopyGround {
  return hero.copyGround ?? (hero.tone === 'light' ? 'scrim' : 'none');
}

/**
 * The ground under the copy on a phone, which is allowed to be a different
 * answer from the desktop one.
 *
 * A phone shows a DIFFERENT PHOTOGRAPH — `<picture>` swaps in
 * `hero.mobileImage` — and a portrait crop of the same scene is not the same
 * scene, because the copy lands on different pixels of it. So the measurement
 * can come out differently, and it does: two shops in this family measured
 * 0.00% of the copy area under AA on the landscape crop and 22% and 41% on the
 * portrait one. One value for both would have forced a panel onto a desktop
 * hero that does not need one, in order to fix a phone that does.
 *
 * ## Unset INHERITS the desktop answer. It does not mean 'none'.
 *
 * The alternative — treat an unset mobile ground as "no ground" — would have
 * silently stripped the scrim from every existing shop's phone hero, which is
 * the one place the measurements say a ground is most often needed. Inheriting
 * means adding this field changed nothing anywhere until somebody set it, which
 * is the only safe default for a field that arrives after the shops do.
 *
 * The switch is at 760px, matching the hero's own layout breakpoint rather than
 * the 720px at which `<picture>` changes image. Between 721px and 760px a hero
 * therefore shows the LANDSCAPE image under the phone's ground. That seam is
 * harmless in the direction shops actually use — a panel is a declared pair, so
 * it is safe over any photograph — but a shop setting `mobileCopyGround: 'none'`
 * against a `copyGround: 'panel'` would leave those 40px unprotected. Measure
 * that band too, or keep the two answers in that order.
 */
export function heroMobileCopyGround(hero: {
  tone: HeroTone;
  copyGround?: CopyGround;
  mobileCopyGround?: CopyGround;
}): CopyGround {
  return hero.mobileCopyGround ?? heroCopyGround(hero);
}

/**
 * Which side the hero copy sits on. Absent is `left` — where every hero sat
 * before the field existed, so adding it moved nothing.
 */
export function heroAlign(hero: { align?: HeroAlign }): HeroAlign {
  return hero.align ?? 'left';
}

/**
 * The scrim's three fields, each falling back to what the hard-coded gradient
 * used to do.
 *
 * The defaults are not neutral choices — they are the old rule, restated as
 * data. `left` + `surface` + `standard` compiles to the same
 * `linear-gradient(100deg, --color-surface 0%, --color-surface 26%,
 * transparent 68%)` that shipped, which is what lets every existing shop take
 * this change and render byte-for-byte what it rendered before.
 *
 * Note this resolves the scrim's SHAPE only. Whether a scrim is drawn at all
 * is still `copyGround` / `mobileCopyGround` — and in particular `'none'`
 * stays a separate statement rather than becoming a fourth depth. "The
 * photograph carries the copy, I measured it" is a claim about the picture;
 * depth is a property of a wash that exists. Folding the two together would
 * let a shop reach 'none' by turning a dial down, which is precisely the
 * accident that measurement claim is meant to be immune to.
 */
export function heroScrim(hero: { scrim?: HeroScrim }): ResolvedScrim {
  return {
    from: hero.scrim?.from ?? 'left',
    tint: hero.scrim?.tint ?? 'surface',
    depth: hero.scrim?.depth ?? 'standard',
  };
}
