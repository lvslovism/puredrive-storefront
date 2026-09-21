/**
 * Regression tests for the two add-to-cart defects the landing-page work
 * surfaced. Both were invisible in a green build and obvious the first time
 * anyone clicked.
 *
 *   1. ROLLBACK. The optimistic update was only undone for a REJECTED request
 *      (`{ok:false}`). addItem() can also THROW — ensureCart() raises whenever
 *      cart creation fails, which is what an unreachable or misconfigured API
 *      does — and the throw escaped the click handler. The badge kept a phantom
 *      unit forever, the success toast stayed up, and no failure was ever shown.
 *
 *   2. MULTIPLE CARDS. The wiring used `document.querySelector` — singular — for
 *      the button, the quantity stepper and the spec group. On a page with five
 *      purchasable cards, one worked and four were dead.
 *
 * Runner: node:test + a minimal DOM shim, the same zero-test-tooling stance as
 * security.test.ts and toast.test.ts — no jsdom. The shim implements only what
 * cart.ts and toast.ts touch; if either starts using more DOM API, extend it.
 *
 * Timers in the shim NEVER fire. That is load-bearing: the button also reverts
 * itself on a ~3s timer, so a revert observed in these tests can only have come
 * from the rollback path.
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { registerHooks } from 'node:module';

import { CONFIG_GLOBAL } from '../brand/identity.ts';

// src/ imports its neighbours without a file extension, which is what the
// bundler wants and what Node's ESM resolver refuses. The other suites dodge
// this by only importing leaf modules; cart.ts has four levels of them, so the
// extension is filled in at resolve time instead of being written into src/ to
// suit the test runner.
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith('.') && !/.[cm]?[jt]s$/.test(specifier)) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw error;
    }
  },
});

type El = any;

// --- selector engine ----------------------------------------------------------
// Supports exactly the three forms cart.ts and toast.ts use: `[attr]`, `.class`
// and a bare tag name.
function matches(el: El, selector: string): boolean {
  const sel = selector.trim();
  if (sel.startsWith('[')) {
    const body = sel.slice(1, -1);
    const eq = body.indexOf('=');
    if (eq === -1) return body in el.attributes;
    const name = body.slice(0, eq);
    const want = body.slice(eq + 1).replace(/^["']|["']$/g, '');
    return el.attributes[name] === want;
  }
  if (sel.startsWith('.')) return String(el.className).split(/\s+/).includes(sel.slice(1));
  return el.tagName === sel.toUpperCase();
}

function descendants(el: El, out: El[] = []): El[] {
  for (const child of el.children) {
    out.push(child);
    descendants(child, out);
  }
  return out;
}

function makeElement(tag: string): El {
  const el: El = {
    tagName: tag.toUpperCase(),
    children: [] as El[],
    parentNode: null as El,
    attributes: {} as Record<string, string>,
    dataset: {} as Record<string, string>,
    listeners: {} as Record<string, Function[]>,
    className: '',
    textContent: '',
    offsetHeight: 40,
    focused: false,
    style: {
      props: {} as Record<string, string>,
      setProperty(name: string, value: string) {
        this.props[name] = value;
      },
    },
    classList: {
      add(c: string) {
        el.className = (el.className + ' ' + c).trim();
      },
      remove(c: string) {
        el.className = el.className.split(/\s+/).filter((x: string) => x && x !== c).join(' ');
      },
      toggle(c: string, on: boolean) {
        if (on) el.classList.add(c);
        else el.classList.remove(c);
      },
      contains(c: string) {
        return el.className.split(/\s+/).includes(c);
      },
    },
    getAttribute: (name: string) => (name in el.attributes ? el.attributes[name] : null),
    setAttribute(name: string, value: string) {
      el.attributes[name] = String(value);
    },
    removeAttribute(name: string) {
      delete el.attributes[name];
    },
    appendChild(child: El) {
      child.parentNode = el;
      el.children.push(child);
      return child;
    },
    remove() {
      const parent = el.parentNode;
      if (parent) parent.children = parent.children.filter((c: El) => c !== el);
    },
    focus() {
      el.focused = true;
    },
    getBoundingClientRect: () => ({ top: 120, bottom: 82, left: 0, right: 0, width: 0, height: 82 }),
    addEventListener(type: string, fn: Function) {
      (el.listeners[type] ||= []).push(fn);
    },
    closest(selector: string) {
      let node: El = el;
      while (node) {
        if (matches(node, selector)) return node;
        node = node.parentNode;
      }
      return null;
    },
    querySelector: (selector: string) => descendants(el).find((n) => matches(n, selector)) ?? null,
    querySelectorAll: (selector: string) => descendants(el).filter((n) => matches(n, selector)),
  };
  return el;
}

/** Fire a click and wait for the (async) handlers it starts. */
async function click(el: El) {
  const event = { preventDefault() {}, target: el, currentTarget: el };
  await Promise.all((el.listeners.click || []).map((fn: Function) => fn(event)));
}

// --- environment --------------------------------------------------------------

interface CartCall {
  path: string;
  method: string;
  body: any;
}

let doc: El;
let calls: CartCall[];
/** Peak number of cart requests in flight simultaneously. */
let peakInFlight: number;
let inFlight: number;
/** Queue of replies for /cart and /cart/*, consumed in order. */
let replies: Array<{ status: number; json: any }>;

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
  };
}

function installEnv(config: Record<string, unknown>) {
  doc = makeElement('document');
  doc.head = doc.appendChild(makeElement('head'));
  doc.body = doc.appendChild(makeElement('body'));
  doc.createElement = (tag: string) => makeElement(tag);
  doc.createTextNode = (text: string) => ({ textContent: text, children: [], attributes: {} });

  calls = [];
  replies = [];
  inFlight = 0;
  peakInFlight = 0;

  (globalThis as any).document = doc;
  (globalThis as any).localStorage = memoryStorage();
  (globalThis as any).sessionStorage = memoryStorage();
  (globalThis as any).location = { search: '', href: 'https://example.test/' };
  // Node defines `navigator` as a getter-only global, so plain assignment
  // throws. track.ts only ever asks it for sendBeacon.
  Object.defineProperty(globalThis, 'navigator', {
    value: { sendBeacon: () => true },
    configurable: true,
    writable: true,
  });
  (globalThis as any).window = {
    // Never fires. A revert seen in a test therefore came from the rollback.
    setTimeout: () => 1,
    clearTimeout: () => {},
    matchMedia: () => ({ matches: false }), // desktop: every toast renders
    crypto: { randomUUID: () => '0000-1111-2222-3333' },
    localStorage: (globalThis as any).localStorage,
    [CONFIG_GLOBAL]: config,
  };
  (globalThis as any).clearTimeout = () => {};

  (globalThis as any).fetch = async (url: string, init: any = {}) => {
    const path = String(url);
    // Beacons are another module's contract; they must not colour these results.
    if (path.includes('/v1/events')) return { ok: true, status: 200, json: async () => ({ ok: true }) };
    calls.push({
      path,
      method: init.method || 'GET',
      body: init.body ? JSON.parse(init.body) : null,
    });
    const reply = replies.shift() ?? { status: 200, json: { ok: true, data: {} } };
    // Yield to the microtask queue so genuinely-parallel callers overlap here.
    inFlight += 1;
    peakInFlight = Math.max(peakInFlight, inFlight);
    await Promise.resolve();
    await Promise.resolve();
    inFlight -= 1;
    return { ok: reply.status >= 200 && reply.status < 300, status: reply.status, json: async () => reply.json };
  };
}

/** A cart payload shaped as the API shapes it. */
function cartWith(lines: Array<{ variant_id: string; quantity: number }>) {
  return {
    id: 'cart_1',
    items: lines.map((line, i) => ({
      line_id: `line_${i}`,
      variant_id: line.variant_id,
      quantity: line.quantity,
      product_title: line.variant_id,
      unit_price: 100,
      line_subtotal: 100 * line.quantity,
    })),
    items_total: 0,
    shipping_fee_total: 0,
    discount_total: 0,
    grand_total: 0,
  };
}

// --- fixtures -----------------------------------------------------------------

/** One product card: its own [data-cart-scope], no stepper, no spec picker. */
function makeCard(variantId: string, title: string) {
  const card = makeElement('article');
  card.setAttribute('data-cart-scope', '');
  const button = makeElement('button');
  button.setAttribute('data-add-to-cart', '');
  button.setAttribute('data-variant-id', variantId);
  button.setAttribute('data-product-id', `product_${variantId}`);
  button.setAttribute('data-product-title', title);
  button.textContent = '加入購物車';
  card.appendChild(button);
  return { card, button };
}

/** The header badge every add-to-cart path writes through. */
function makeBadge() {
  const badge = makeElement('span');
  badge.setAttribute('data-cart-count', '');
  badge.textContent = '0';
  return badge;
}

function toastTexts(): string[] {
  return descendants(doc)
    .filter((el) => String(el.className).split(/\s+/).includes('sf-toast'))
    .map((el) => (el.textContent || el.children.map((c: El) => c.textContent).join('')) as string);
}

// cart.ts module state is per-import; import once, reinstall the environment
// between tests.
installEnv({ apiBase: 'https://api.test', pk: 'pk_test', merchantCode: 'test-merchant' });
const { wireAddToCartButtons, addItem, applyPromotion } = await import('../src/scripts/cart.ts');

beforeEach(() => {
  installEnv({ apiBase: 'https://api.test', pk: 'pk_test', merchantCode: 'test-merchant' });
});

/** Toasts still on screen — dismiss() removes `is-visible` before the fade. */
function liveToastTexts(): string[] {
  return descendants(doc)
    .filter((el) => String(el.className).split(/\s+/).includes('sf-toast'))
    .filter((el) => el.classList.contains('is-visible'))
    .map((el) => (el.textContent || el.children.map((c: El) => c.textContent).join('')) as string);
}

// --- 1. rollback --------------------------------------------------------------

describe('a failed add rolls the optimistic update back', () => {
  test('a THROWN cart-create failure restores the badge, the button and surfaces the error', async () => {
    const badge = makeBadge();
    doc.body.appendChild(badge);
    const { card, button } = makeCard('variant_a', '示範商品');
    doc.body.appendChild(card);

    // POST /cart is refused, which is what an inert key or an unreachable API
    // does. authedFetch returns {ok:false}; ensureCart turns that into a THROW,
    // and the throw — not a falsy return — is what used to escape the handler.
    replies.push({ status: 401, json: { ok: false, error: { code: 'INVALID_API_KEY_FORMAT' } } });

    wireAddToCartButtons(doc);
    await click(button);

    assert.equal(badge.textContent, '0', 'badge must not keep the phantom unit');
    assert.equal(
      button.textContent,
      '加入購物車',
      'button must revert on the failure, not wait out the 3s timer'
    );
    assert.equal(button.getAttribute('aria-disabled'), 'false', 'button must be usable again');
    assert.ok(
      liveToastTexts().some((text) => text.includes('失敗')),
      'the failure must be surfaced to the customer'
    );
    assert.ok(
      !liveToastTexts().some((text) => text.includes('已加入')),
      'the optimistic success toast must be dismissed, not left standing next to the error'
    );
    assert.equal(calls.length, 1, 'no line is posted when the cart could not be created');
    assert.match(calls[0].path, /\/v1\/storefront\/cart$/);
  });

  test('a REJECTED line POST rolls back the same way', async () => {
    const badge = makeBadge();
    doc.body.appendChild(badge);
    const { card, button } = makeCard('variant_a', '示範商品');
    doc.body.appendChild(card);

    replies.push({ status: 200, json: { ok: true, data: { id: 'cart_1' } } });
    replies.push({ status: 409, json: { ok: false, error: { code: 'OUT_OF_STOCK' } } });

    wireAddToCartButtons(doc);
    await click(button);

    assert.equal(badge.textContent, '0');
    assert.equal(button.textContent, '加入購物車');
    assert.equal(button.getAttribute('aria-disabled'), 'false');
    assert.ok(liveToastTexts().some((text) => text.includes('失敗')));
  });
});

// --- 2. more than one card ----------------------------------------------------

describe('every card on a page is wired, not just the first', () => {
  test('three cards each add their own variant', async () => {
    const badge = makeBadge();
    doc.body.appendChild(badge);

    const cards = [
      makeCard('variant_a', '商品一'),
      makeCard('variant_b', '商品二'),
      makeCard('variant_c', '商品三'),
    ];
    cards.forEach(({ card }) => doc.body.appendChild(card));

    // One cart creation, then one line POST per card.
    replies.push({ status: 200, json: { ok: true, data: { id: 'cart_1' } } });
    replies.push({
      status: 200,
      json: { ok: true, data: cartWith([{ variant_id: 'variant_a', quantity: 1 }]) },
    });
    replies.push({
      status: 200,
      json: {
        ok: true,
        data: cartWith([
          { variant_id: 'variant_a', quantity: 1 },
          { variant_id: 'variant_b', quantity: 1 },
        ]),
      },
    });
    replies.push({
      status: 200,
      json: {
        ok: true,
        data: cartWith([
          { variant_id: 'variant_a', quantity: 1 },
          { variant_id: 'variant_b', quantity: 1 },
          { variant_id: 'variant_c', quantity: 1 },
        ]),
      },
    });

    wireAddToCartButtons(doc);
    for (const { button } of cards) await click(button);

    // The singular-querySelector version bound only the first button, so cards
    // two and three had no listener at all: two calls instead of four, and two
    // buttons still reading 加入購物車.
    const lineCalls = calls.filter((call) => call.path.includes('/items'));
    assert.equal(lineCalls.length, 3, 'every card must reach the API');
    assert.deepEqual(
      lineCalls.map((call) => call.body.variant_id),
      ['variant_a', 'variant_b', 'variant_c'],
      'each card must post ITS OWN variant, not the first card\u2019s'
    );

    for (const { button } of cards) {
      assert.equal(button.textContent, '已加入購物車 ✓', 'every button must show its own result');
      assert.equal(button.getAttribute('aria-disabled'), 'true');
    }

    // The badge is reconciled from the server's recalculated cart, not counted
    // locally, so it lands on the last response's total.
    assert.equal(badge.textContent, '3');
    assert.equal(calls.filter((call) => call.path.endsWith('/cart')).length, 1, 'one cart, not three');
  });

  test('a second wiring pass does not double-bind an already bound button', async () => {
    doc.body.appendChild(makeBadge());
    const { card, button } = makeCard('variant_a', '商品一');
    doc.body.appendChild(card);

    replies.push({ status: 200, json: { ok: true, data: { id: 'cart_1' } } });
    replies.push({
      status: 200,
      json: { ok: true, data: cartWith([{ variant_id: 'variant_a', quantity: 1 }]) },
    });

    wireAddToCartButtons(doc);
    wireAddToCartButtons(doc);
    await click(button);

    assert.equal(
      calls.filter((call) => call.path.includes('/items')).length,
      1,
      'one click must post one line however many times the page was wired'
    );
  });
});

// --- 3. concurrent first add --------------------------------------------------

describe('two adds racing the first cart creation', () => {
  test('create ONE cart and keep BOTH lines', async () => {
    doc.body.appendChild(makeBadge());

    // One CREATE reply, then one per line. If the code creates a second cart it
    // will consume the line reply as its CREATE reply and the assertions below
    // fall apart in exactly the way production did.
    replies.push({ status: 200, json: { ok: true, data: { id: 'cart_1' } } });
    replies.push({
      status: 200,
      json: { ok: true, data: cartWith([{ variant_id: 'variant_a', quantity: 1 }]) },
    });
    replies.push({
      status: 200,
      json: {
        ok: true,
        data: cartWith([
          { variant_id: 'variant_a', quantity: 1 },
          { variant_id: 'variant_b', quantity: 1 },
        ]),
      },
    });

    // Fired in the same tick — neither has a cart id to find yet. This is the
    // customer adding two things quickly on a landing page, and it silently
    // dropped one line: two carts were created, the second write won, and the
    // line in the orphaned cart was gone while its button said 已加入購物車.
    await Promise.all([
      addItem('variant_a', 1),
      addItem('variant_b', 1),
    ]);

    const creates = calls.filter((call) => call.path.endsWith('/v1/storefront/cart'));
    const lines = calls.filter((call) => call.path.includes('/items'));

    assert.equal(creates.length, 1, 'a second cart is a lost line, not a retry');
    assert.equal(lines.length, 2, 'both adds must still reach the API');
    assert.equal(
      new Set(lines.map((call) => call.path)).size,
      1,
      'both lines must land in the SAME cart',
    );
    assert.deepEqual(
      lines.map((call) => call.body.variant_id).sort(),
      ['variant_a', 'variant_b'],
    );

    // One cart is necessary but not sufficient. Concurrent POSTs to the SAME
    // cart come back items:1, items:1 — the backend read-modify-writes the line
    // set, so simultaneous inserts overwrite each other. The storefront queues
    // its mutations so it never fires the burst that triggers it.
    assert.equal(peakInFlight, 1, 'cart mutations must not overlap on the wire');
  });

  test('a promotion racing the same first add still creates ONE cart', async () => {
    doc.body.appendChild(makeBadge());

    replies.push({ status: 200, json: { ok: true, data: { id: 'cart_1' } } });
    replies.push({
      status: 200,
      json: { ok: true, data: cartWith([{ variant_id: 'variant_a', quantity: 1 }]) },
    });
    replies.push({ status: 200, json: { ok: true, data: { id: 'cart_1', promotion: 'SAVE10' } } });

    // addItem is queued; applyPromotion is NOT — it calls ensureCart() directly.
    // So the queue alone cannot save this one: only memoising the in-flight
    // creation stops both from POSTing a cart of their own.
    await Promise.all([addItem('variant_a', 1), applyPromotion('SAVE10')]);

    assert.equal(
      calls.filter((call) => call.path.endsWith('/v1/storefront/cart')).length,
      1,
      'the second cart would orphan whichever line landed in the first',
    );
  });
});

