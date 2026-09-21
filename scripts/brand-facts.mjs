/**
 * The handful of brand values the plain-Node scripts need.
 *
 * `brand/` is TypeScript and these scripts are .mjs, so the values are read as
 * text rather than imported. That keeps the audits runnable without a build
 * step — they have to work on a checkout that has not compiled anything yet.
 *
 * The TypeScript side (src/, tests/) imports `brand/` directly and must never
 * use this module: a second parser of the same file is a second thing to keep
 * in sync.
 *
 * ## Why this is a scanner and not a regex
 *
 * The previous version matched `export const identity[\s\S]*?\n  name: '…'` —
 * the FIRST two-space-indented `name:` anywhere after the declaration. That has
 * no closing boundary, so a renamed or removed field did not fail: the search
 * ran straight past the end of the object and happily matched a `name:` in some
 * later declaration. A brand audit whose needle is quietly the wrong string
 * still prints "verified" and still passes, which is the one failure mode an
 * anti-corrosion check must not have.
 *
 * So the object body is extracted by brace balancing, and keys are read at
 * depth 0 of THAT body only. Order does not matter, nesting does not leak, and
 * a missing key throws instead of matching something else.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

/**
 * The escape character, built at runtime so this file never contains a lone
 * literal backslash — the one token a heredoc, a shell or a JSON round-trip is
 * most likely to eat on the way in.
 */
const BACKSLASH = String.fromCharCode(92);

/**
 * Walk `source` from `start`, returning the index just past the matching close
 * of the bracket that opens at `start - 1`. Strings, template literals and both
 * comment styles are skipped so a brace inside them cannot unbalance the count.
 */
function findClose(source, start) {
  let depth = 1;
  let i = start;
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];

    if (c === '/' && next === '/') {
      i = source.indexOf('\n', i);
      if (i === -1) return -1;
      continue;
    }
    if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      if (end === -1) return -1;
      i = end + 2;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      i += 1;
      while (i < source.length && source[i] !== c) {
        if (source[i] === BACKSLASH) i += 1;
        i += 1;
      }
      i += 1;
      continue;
    }
    if (c === '{' || c === '[' || c === '(') depth += 1;
    else if (c === '}' || c === ']' || c === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
    i += 1;
  }
  return -1;
}

/**
 * The `{ … }` body of `export const <name> = { … }`, braces balanced.
 *
 * Located by plain string search rather than a constructed RegExp: the
 * declaration may or may not carry a type annotation, and an annotation is
 * allowed to contain braces of its own, so the object opener is the first
 * brace after the `=` — not the first brace after the name.
 */
function objectBody(source, declaration, file) {
  const marker = `export const ${declaration}`;
  const declared = source.indexOf(marker);
  if (declared === -1) {
    throw new Error(`brand-facts: no "${marker}" declaration in ${file}.`);
  }
  const assign = source.indexOf("=", declared + marker.length);
  const open = assign === -1 ? -1 : source.indexOf("{", assign);
  if (open === -1) {
    throw new Error(`brand-facts: "${marker}" in ${file} is not an object literal.`);
  }
  const close = findClose(source, open + 1);
  if (close === -1) {
    throw new Error(`brand-facts: unbalanced braces in "${declaration}" in ${file}.`);
  }
  return source.slice(open + 1, close);
}

/**
 * Every `key: 'value'` at depth 0 of an object body, as a Map. Nested objects
 * are skipped wholesale, so `demo.merchant.store_name` can never be mistaken
 * for a top-level `store_name`.
 */
function topLevelStrings(body) {
  const out = new Map();
  let i = 0;
  while (i < body.length) {
    const c = body[i];
    const next = body[i + 1];

    if (c === '/' && next === '/') {
      i = body.indexOf('\n', i);
      if (i === -1) break;
      continue;
    }
    if (c === '/' && next === '*') {
      const end = body.indexOf('*/', i + 2);
      if (end === -1) break;
      i = end + 2;
      continue;
    }
    if (c === '{' || c === '[' || c === '(') {
      const close = findClose(body, i + 1);
      if (close === -1) break;
      i = close + 1;
      continue;
    }
    // A depth-0 key: bare identifier or quoted, then `:`, then a quoted string.
    const key = /^(?:([A-Za-z_$][\w$]*)|'([^']*)'|"([^"]*)")\s*:\s*(?:'([^']*)'|"([^"]*)")/.exec(
      body.slice(i)
    );
    if (key && (i === 0 || /[\s,{]/.test(body[i - 1]))) {
      out.set(key[1] ?? key[2] ?? key[3], key[4] ?? key[5]);
      i += key[0].length;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      i += 1;
      while (i < body.length && body[i] !== c) {
        if (body[i] === BACKSLASH) i += 1;
        i += 1;
      }
      i += 1;
      continue;
    }
    i += 1;
  }
  return out;
}

const identityFile = path.join('brand', 'identity.ts');
const commerceFile = path.join('brand', 'commerce.ts');

const identityFields = topLevelStrings(
  objectBody(await readFile(path.join(root, identityFile), 'utf8'), 'identity', identityFile)
);
const commerceFields = topLevelStrings(
  objectBody(await readFile(path.join(root, commerceFile), 'utf8'), 'commerce', commerceFile)
);

/**
 * Read one fact, or fail.
 *
 * "Not found" and "found but useless" are the same failure here: a needle the
 * audit cannot grep for is a needle that never fails, and an audit that cannot
 * fail is worse than no audit because it reports success. Two characters is the
 * floor — `audit-brand.mjs` discards anything shorter, so accepting one here
 * would hand it a needle it silently drops.
 */
function fact(fields, key, file) {
  const value = fields.get(key);
  if (value === undefined) {
    throw new Error(
      `brand-facts: \`${key}\` is not a top-level string in ${file}. ` +
        `Found: ${[...fields.keys()].join(', ') || '(none)'}`
    );
  }
  if (value.trim().length < 2) {
    throw new Error(
      `brand-facts: \`${key}\` in ${file} is "${value}" — too short to audit against. ` +
        'Give it a real, distinctive value.'
    );
  }
  return value;
}

export const brandName = fact(identityFields, 'name', identityFile);
export const logoText = fact(identityFields, 'logoText', identityFile);
export const storageNamespace = fact(identityFields, 'storageNamespace', identityFile);
export const merchantCode = fact(commerceFields, 'merchantCode', commerceFile);

/**
 * Strings from the storefront this template was extracted from. They are not
 * read out of `brand/` — the point is that they can never come back, whatever
 * `brand/` currently says. A hit means a piece of the original shop survived
 * the extraction.
 */
export const extractionResidue = ['lovism', 'ryanbrand'];

/** Newline, built at runtime for the same reason BACKSLASH is. */
const NEWLINE = String.fromCharCode(10);

/**
 * The `{ … }` body of `key: { … }` at depth 0 of `body`, braces balanced.
 *
 * Same doctrine as the rest of this file: a scanner, not a constructed RegExp.
 * It steps over strings, comments and whole nested groups, so a `color:` inside
 * a comment — or inside some other object — cannot be mistaken for the one
 * asked for. Returns null when the key is not present at depth 0; the caller
 * decides whether absence is a failure.
 */
function nestedBody(body, key) {
  const forms = [key, "'" + key + "'", '"' + key + '"'];
  let i = 0;
  while (i < body.length) {
    const c = body[i];
    const next = body[i + 1];

    if (c === '/' && next === '/') {
      i = body.indexOf(NEWLINE, i);
      if (i === -1) return null;
      continue;
    }
    if (c === '/' && next === '*') {
      const end = body.indexOf('*/', i + 2);
      if (end === -1) return null;
      i = end + 2;
      continue;
    }

    if (i === 0 || body[i - 1] === ' ' || body[i - 1] === NEWLINE || body[i - 1] === ',' || body[i - 1] === '{') {
      for (const form of forms) {
        if (!body.startsWith(form, i)) continue;
        let j = i + form.length;
        while (j < body.length && (body[j] === ' ' || body[j] === NEWLINE)) j += 1;
        if (body[j] !== ':') continue;
        j += 1;
        while (j < body.length && (body[j] === ' ' || body[j] === NEWLINE)) j += 1;
        if (body[j] !== '{') continue;
        const close = findClose(body, j + 1);
        return close === -1 ? null : body.slice(j + 1, close);
      }
    }

    if (c === '{' || c === '[' || c === '(') {
      const close = findClose(body, i + 1);
      if (close === -1) return null;
      i = close + 1;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      i += 1;
      while (i < body.length && body[i] !== c) {
        if (body[i] === BACKSLASH) i += 1;
        i += 1;
      }
      i += 1;
      continue;
    }
    i += 1;
  }
  return null;
}

const identityBody = objectBody(
  await readFile(path.join(root, identityFile), 'utf8'),
  'identity',
  identityFile
);

/**
 * One group of `identity.tokens` as a Map of token name to declared value.
 *
 * The colour audit's first two passes only ask whether a literal escaped into
 * `src/` or into a mark. Neither can see whether the palette that replaced
 * those literals is legible, and a palette is exactly where legibility is
 * decided — so the third pass reads the VALUES, and needs them here.
 */
function tokenGroup(group) {
  const tokens = nestedBody(identityBody, 'tokens');
  if (!tokens) {
    throw new Error('brand-facts: no `tokens` object in ' + identityFile + '.');
  }
  const body = nestedBody(tokens, group);
  if (!body) {
    throw new Error('brand-facts: no `tokens.' + group + '` object in ' + identityFile + '.');
  }
  const found = topLevelStrings(body);
  if (found.size === 0) {
    throw new Error(
      'brand-facts: `tokens.' + group + '` in ' + identityFile + ' declared no values. ' +
        'An empty group means the scanner found the wrong object, not that the shop has no colours.'
    );
  }
  return found;
}

export const colourTokens = tokenGroup('color');
export const textTokens = tokenGroup('text');
export const uiTokens = tokenGroup('ui');

/**
 * `identity.groundPolarity` — which GROUND each block stands on.
 *
 * The contrast pass cannot check a ground without it. A background is only half
 * of what makes a block legible; the other half is which ink set resolves on
 * top, and that is a declaration, not something a colour value implies. The
 * pass pairs the two and checks each background against ITS OWN ground's inks —
 * which is the whole reason a dark header became expressible. Checked against
 * all six pale-ground body inks, as it used to be, no dark value could pass.
 *
 * Absence is a failure rather than a default: silently assuming the pale ground
 * would reinstate exactly the assumption being removed.
 *
 * The VALUE is no longer checked here. It used to have to be "light" or "dark",
 * which was correct while those were the only two ink sets that could exist;
 * a shop may now declare its own under `identity.grounds`, and this file has no
 * way to know what it called them. `resolveGrounds` does the checking, against
 * the resolved table, and names the declared grounds in the message — a better
 * error than the one this could produce.
 */
export const groundPolarity = (() => {
  const body = nestedBody(identityBody, 'groundPolarity');
  if (!body) {
    throw new Error(
      'brand-facts: no `groundPolarity` object in ' + identityFile + '. ' +
        'Every block that owns a ground has to say which ground it stands on — ' +
        'the contrast pass checks each background against the inks of its own ground.'
    );
  }
  const found = topLevelStrings(body);
  if (found.size === 0) {
    throw new Error(
      'brand-facts: `groundPolarity` in ' + identityFile + ' declared no blocks.'
    );
  }
  return found;
})();

/**
 * The `[ … ]` or `{ … }` body of `key: [ … ]` at depth 0 of `body`, or null.
 *
 * `nestedBody` above only finds objects. A ground declares `on: [...]` and
 * `ink: [...]`, so the same scanner needs to accept either opener — and it has
 * to be the same scanner rather than a regex, for the reason at the top of this
 * file: a needle with no closing boundary matches the wrong thing silently.
 */
function nestedGroup(body, key, opener) {
  const forms = [key, "'" + key + "'", '"' + key + '"'];
  let i = 0;
  while (i < body.length) {
    const c = body[i];
    const next = body[i + 1];

    if (c === '/' && next === '/') {
      i = body.indexOf(NEWLINE, i);
      if (i === -1) return null;
      continue;
    }
    if (c === '/' && next === '*') {
      const end = body.indexOf('*/', i + 2);
      if (end === -1) return null;
      i = end + 2;
      continue;
    }

    if (i === 0 || body[i - 1] === ' ' || body[i - 1] === NEWLINE || body[i - 1] === ',' || body[i - 1] === '{') {
      for (const form of forms) {
        if (!body.startsWith(form, i)) continue;
        let j = i + form.length;
        while (j < body.length && (body[j] === ' ' || body[j] === NEWLINE)) j += 1;
        if (body[j] !== ':') continue;
        j += 1;
        while (j < body.length && (body[j] === ' ' || body[j] === NEWLINE)) j += 1;
        if (body[j] !== opener) continue;
        const close = findClose(body, j + 1);
        return close === -1 ? null : body.slice(j + 1, close);
      }
    }

    if (c === '{' || c === '[' || c === '(') {
      const close = findClose(body, i + 1);
      if (close === -1) return null;
      i = close + 1;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      i += 1;
      while (i < body.length && body[i] !== c) {
        if (body[i] === BACKSLASH) i += 1;
        i += 1;
      }
      i += 1;
      continue;
    }
    i += 1;
  }
  return null;
}

/** Every quoted string at depth 0 of an array body, in order. */
function stringList(body) {
  const out = [];
  let i = 0;
  while (i < body.length) {
    const c = body[i];
    const next = body[i + 1];

    if (c === '/' && next === '/') {
      i = body.indexOf(NEWLINE, i);
      if (i === -1) break;
      continue;
    }
    if (c === '/' && next === '*') {
      const end = body.indexOf('*/', i + 2);
      if (end === -1) break;
      i = end + 2;
      continue;
    }
    if (c === '{' || c === '[' || c === '(') {
      const close = findClose(body, i + 1);
      if (close === -1) break;
      i = close + 1;
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      let value = '';
      while (j < body.length && body[j] !== c) {
        if (body[j] === BACKSLASH) j += 1;
        value += body[j];
        j += 1;
      }
      out.push(value);
      i = j + 1;
      continue;
    }
    i += 1;
  }
  return out;
}

/** `key: true` / `key: false` / `key: null` at depth 0, or undefined. */
function keyword(body, key) {
  const match = new RegExp('(?:^|[\\s,{])' + key + '\\s*:\\s*(true|false|null)\\b').exec(body);
  return match ? match[1] : undefined;
}

/**
 * A ground's `fill` map, where a value is EITHER a token reference or the long
 * form object `{ label, groundFloor, labelFloor, why }`.
 *
 * ## Why this is not `topLevelStrings`
 *
 * It was, and that is the bug this function exists to remove. `topLevelStrings`
 * steps over a `{ … }` value wholesale — correct for the job it was written for
 * (a nested object must not leak keys into its parent) and exactly wrong here:
 * a fill declared in the long form would be **dropped without a word**, and the
 * audit would then measure the ground with one fewer fill in it than the shop
 * declared. Silently checking less than you were asked to is the failure this
 * whole module's scanner doctrine exists to prevent, so an entry this cannot
 * read throws rather than being skipped.
 *
 * Only the SHAPE is read here. Which values are legal, and that an accepted
 * floor carries a reason, is `normalizeFill` in src/lib/grounds.mjs — one
 * answer, read by the stylesheet and the audit alike.
 */
function fillMap(body, groundName, file) {
  const out = {};
  let i = 0;

  while (i < body.length) {
    const c = body[i];
    const next = body[i + 1];

    if (c === '/' && next === '/') {
      i = body.indexOf(NEWLINE, i);
      if (i === -1) break;
      continue;
    }
    if (c === '/' && next === '*') {
      const end = body.indexOf('*/', i + 2);
      if (end === -1) break;
      i = end + 2;
      continue;
    }

    const key =
      i === 0 || c === ' ' || c === NEWLINE || c === ',' || c === '{'
        ? /^[\s,{]?(?:([A-Za-z_$][\w$]*)|'([^']*)'|"([^"]*)")\s*:\s*/.exec(body.slice(i))
        : null;

    if (key) {
      const name = key[1] ?? key[2] ?? key[3];
      let j = i + key[0].length;
      const opener = body[j];

      if (opener === "'" || opener === '"') {
        let k = j + 1;
        let value = '';
        while (k < body.length && body[k] !== opener) {
          if (body[k] === BACKSLASH) k += 1;
          value += body[k];
          k += 1;
        }
        out[name] = value;
        i = k + 1;
        continue;
      }

      if (opener === '{') {
        const close = findClose(body, j + 1);
        if (close === -1) {
          throw new Error(
            'brand-facts: `identity.grounds.' + groundName + '.fill[' + name + ']` in ' + file +
              ' has unbalanced braces.'
          );
        }
        const inner = body.slice(j + 1, close);
        const strings = topLevelStrings(inner);
        const entry = {};
        for (const field of ['label', 'groundFloor', 'labelFloor', 'why']) {
          if (strings.has(field)) entry[field] = strings.get(field);
          else if (
            new RegExp('(?:^|[\\s,{])(?:' + field + "|'" + field + "'|\"" + field + '")\\s*:').test(inner)
          ) {
            /* The key is written and did not come back as a string. `label:
               null` is the one legitimate way that happens; anything else is a
               value this scanner cannot read — a template literal, a
               concatenation, a reference — and reading it as ABSENT would turn
               a declared reason into a missing one. */
            if (field === 'label' && keyword(inner, 'label') === 'null') entry.label = null;
            else {
              throw new Error(
                'brand-facts: `identity.grounds.' + groundName + '.fill[' + name + '].' + field +
                  '` in ' + file + ' is not a plain quoted string. This file reads brand/ as ' +
                  'TEXT, so a template literal or an expression here cannot be resolved — and ' +
                  'reading it as absent would silently drop the declaration. Write it as a ' +
                  "single-quoted string."
              );
            }
          }
        }
        out[name] = entry;
        i = close + 1;
        continue;
      }

      throw new Error(
        'brand-facts: `identity.grounds.' + groundName + '.fill[' + name + ']` in ' + file +
          ' is neither a quoted token reference nor an object. A fill is the label it ' +
          'carries, or { label, groundFloor, labelFloor, why } — see normalizeFill in ' +
          'src/lib/grounds.mjs.'
      );
    }

    if (c === '{' || c === '[' || c === '(') {
      const close = findClose(body, i + 1);
      if (close === -1) break;
      i = close + 1;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      i += 1;
      while (i < body.length && body[i] !== c) {
        if (body[i] === BACKSLASH) i += 1;
        i += 1;
      }
      i += 1;
      continue;
    }
    i += 1;
  }

  return out;
}

/**
 * `identity.grounds` — the per-shop ground declarations, as plain objects.
 *
 * Absent is the common case and is not a failure: the template's own four
 * grounds cover a pale page, a dark band, a footer and a contact strip, and a
 * storefront that wants nothing else declares nothing.
 *
 * Every value read here is a TOKEN REFERENCE, never a colour. That is what
 * makes a per-shop override an EXTENSION of the audit rather than a hole in it:
 * the value it points at is already declared in `tokens.color`, already covered
 * by the literal ban, and now measured against a ground it was not measured
 * against before. A literal in this object would be a colour declared outside
 * `tokens`, which is the thing the first pass of `audit:color` exists to stop —
 * so `resolveGrounds` resolves every reference through `tokens` and throws on
 * anything it cannot find there.
 */
export const groundOverrides = (() => {
  const body = nestedBody(identityBody, 'grounds');
  if (!body) return {};

  const out = {};

  /* Candidate names come from a cheap scan, but each one is then CONFIRMED by
     asking `nestedGroup` for its object body — that scanner steps over strings,
     comments and nested groups, so a `light: {` inside a comment can suggest a
     ground here and cannot produce one. */
  const candidates = new Set();
  for (const match of body.matchAll(
    /(?:^|[\s,{])(?:([A-Za-z_$][\w$]*)|'([^']*)'|"([^"]*)")\s*:\s*\{/g
  )) {
    candidates.add(match[1] ?? match[2] ?? match[3]);
  }

  for (const name of candidates) {
    const groundBody = nestedGroup(body, name, '{');
    if (groundBody === null) continue;

    const ground = {};
    for (const key of ['on', 'ink']) {
      const list = nestedGroup(groundBody, key, '[');
      if (list !== null) ground[key] = stringList(list);
    }
    for (const key of ['rule', 'price', 'selector']) {
      const literal = keyword(groundBody, key);
      if (literal === 'null') ground[key] = null;
      else {
        const strings = topLevelStrings(groundBody);
        if (strings.has(key)) ground[key] = strings.get(key);
      }
    }
    const fill = nestedGroup(groundBody, 'fill', '{');
    if (fill !== null) ground.fill = fillMap(fill, name, identityFile);

    const css = nestedGroup(groundBody, 'css', '{');
    if (css !== null) ground.css = Object.fromEntries(topLevelStrings(css));
    const quiet = keyword(groundBody, 'quiet');
    if (quiet === 'true' || quiet === 'false') ground.quiet = quiet === 'true';

    if (Object.keys(ground).length === 0) {
      throw new Error(
        'brand-facts: `identity.grounds.' + name + '` in ' + identityFile + ' declared ' +
          'no fields. An empty ground is either a half-finished edit or a scanner that ' +
          'found the wrong object; neither should pass silently.'
      );
    }
    out[name] = ground;
  }

  return out;
})();

/**
 * `identity.fontStylesheets` — the webfont <link>s this shop loads.
 *
 * Read here because the Content-Security-Policy has to name the origins they
 * come from, and a stylesheet host is only half of it: a Google Fonts CSS file
 * references its font FILES on a second origin, so a policy that allows
 * `fonts.googleapis.com` and forgets `fonts.gstatic.com` loads the stylesheet,
 * blocks every face it asks for, and falls back to system fonts — silently, and
 * only in production, because nothing local sets the header.
 *
 * Empty array is the template's own answer and a perfectly good one.
 */
export const fontStylesheets = (() => {
  const list = nestedGroup(identityBody, 'fontStylesheets', '[');
  if (list === null) {
    throw new Error(
      'brand-facts: no `fontStylesheets` array in ' + identityFile + '. ' +
        'An empty array means system fonts; a missing key means the deployment ' +
        'headers cannot tell which font origins to allow.'
    );
  }
  return stringList(list);
})();

/**
 * `brand/unlock.ts` — the presentation files this shop has declared its own.
 *
 * A MISSING FILE IS NOT AN ERROR, and that is the one deliberate softness in
 * this module. Every other fact here fails loudly when absent, because absence
 * means an audit running with a needle it cannot find. This one has a correct
 * answer for absence: a storefront that predates the core/presentation split
 * has declared nothing, which is exactly what "no unlock file" means, and is
 * the behaviour every shop had before the split existed.
 *
 * A file that EXISTS and cannot be read is still a failure. "There is no
 * declaration" and "the declaration did not parse" are different facts, and
 * only the first one is safe to treat as an empty list.
 */
export const unlockFile = path.join('brand', 'unlock.ts');

export const unlockedPaths = await (async () => {
  let source;
  try {
    source = await readFile(path.join(root, unlockFile), 'utf8');
  } catch {
    return [];
  }

  const marker = 'export const unlocked';
  const declared = source.indexOf(marker);
  if (declared === -1) {
    throw new Error(
      `brand-facts: ${unlockFile} exists but has no "${marker}" declaration. ` +
        'An empty `export const unlocked: readonly string[] = []` is how a shop says ' +
        'it has taken nothing over; a file with no declaration at all is an edit ' +
        'half-made.'
    );
  }
  const assign = source.indexOf('=', declared + marker.length);
  const open = assign === -1 ? -1 : source.indexOf('[', assign);
  if (open === -1) {
    throw new Error(`brand-facts: "${marker}" in ${unlockFile} is not an array literal.`);
  }
  const close = findClose(source, open + 1);
  if (close === -1) {
    throw new Error(`brand-facts: unbalanced brackets in "unlocked" in ${unlockFile}.`);
  }
  return stringList(source.slice(open + 1, close));
})();
