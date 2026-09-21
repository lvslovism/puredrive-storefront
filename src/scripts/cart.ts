// Phase 2 guest cart client. Runs in the browser; talks to the commerce-workers
// storefront API. All HTTP goes through authedFetch (auth.ts), which injects
// x-api-key: {pk} and — once a member token exists — Authorization: Bearer.
//
// Auth model (verified against the live API):
//   - guest identity = session_id (we generate + persist it)
//   - member identity = Bearer JWT (authedFetch adds it automatically)
//   - session_id is sent in the JSON BODY for POST/PATCH/DELETE
//   - session_id is sent as a QUERY PARAM for GET
// All money fields come straight from the API response; the front end never
// computes subtotals / discounts / shipping / totals.

import { formatMoney, storageKey } from "../../brand/identity";
import { authedFetch as api, cfg, getSessionId, isLoggedIn, startLogin } from "./auth";
import {
  demoAddItem,
  demoClearCart,
  demoGetCart,
  demoRemoveItem,
  demoUpdateItem,
  isDemoMode,
  type DemoSeed,
} from "./demo-cart";
import { showToast } from "./toast";
import { track } from "../lib/track";

type Json = any;

const LS_CART = storageKey("cart_id");

const fmt = formatMoney;

/**
 * Is there a merchant behind this storefront?
 *
 * brand/commerce.ts → demo.enabled only ever short-circuited the BUILD. The
 * browser kept posting to the live API with the inert demo key and kept being
 * refused, so the first click on a fresh clone failed. Every mutation below
 * now checks this first and routes to the local cart instead.
 */
const demoMode = (): boolean => isDemoMode(cfg());

// --- identity / persistence --------------------------------------------------

function getCartId(): string | null {
  return localStorage.getItem(LS_CART);
}

// line_id → product/variant ids for remove_from_cart beacons. Refreshed from
// every cart payload we see; removal always follows a cart fetch on /cart, so
// the row being removed is in here by the time removeItem runs.
const lineIndex = new Map<string, { product_id?: string; variant_id?: string }>();

function indexCartLines(cart: Json) {
  for (const it of cart?.items || []) {
    lineIndex.set(it.line_id, { product_id: it.product_id, variant_id: it.variant_id });
  }
}

function clearCartId() {
  localStorage.removeItem(LS_CART);
}

/**
 * Cart mutations run one at a time.
 *
 * Memoising cart creation fixed the two-carts bug and exposed the one behind
 * it: every add that arrived while the cart was being created was parked on the
 * same promise, so they all fired the instant it resolved. Three concurrent
 * `POST /cart/{id}/items` against one cart came back `items:1`, `items:1`,
 * `items:1` — the server read-modify-writes the line set, so simultaneous
 * inserts overwrite each other and lines are silently lost. (Observed in
 * production 2026-08-18; the backend race is real and is not ours to fix, but
 * the storefront must not be the thing that triggers it.)
 *
 * A queue is the honest fix from this side: the customer's clicks are
 * independent, the cart is not. Cost is latency on a burst — each add waits for
 * the one before it — which is invisible next to losing a line, because the
 * optimistic UI has already said 已加入購物車.
 */
let cartMutations: Promise<unknown> = Promise.resolve();

function serializeCartMutation<T>(operation: () => Promise<T>): Promise<T> {
  // Both arms run `operation`: a failed predecessor must not cancel the queue.
  const run = cartMutations.then(operation, operation);
  cartMutations = run.catch(() => undefined);
  return run;
}

/**
 * The in-flight cart creation, shared by every caller that arrives while it is
 * still running.
 *
 * Without it, two adds fired before the first POST /cart resolves BOTH see an
 * empty localStorage and BOTH create a cart. The second write wins, the first
 * cart is orphaned, and the line that went into it is gone — while the button
 * that added it still says 已加入購物車. On a product detail page that took a
 * double-click to hit; on a landing page with five buttons side by side it is
 * what happens when someone simply adds two things quickly.
 *
 * Same shape as the merchant bootstrap memo in src/lib/commerce.ts.
 */
let cartCreation: Promise<string> | null = null;

async function createCart(): Promise<string> {
  const r = await api("/v1/storefront/cart", {
    method: "POST",
    body: { session_id: getSessionId() },
  });
  if (!r.ok || !r.data) throw new Error("cart create failed");
  localStorage.setItem(LS_CART, r.data.id);
  return r.data.id as string;
}

async function ensureCart(): Promise<string> {
  // Demo mode has no cart to create; the local store is always there.
  if (demoMode()) return "demo-cart";
  const existing = getCartId();
  if (existing) return existing;
  if (!cartCreation) {
    // Cleared either way: on success the id is in storage so the next caller
    // short-circuits above, and on failure a retry must not be pinned to the
    // rejected promise.
    cartCreation = createCart().finally(() => {
      cartCreation = null;
    });
  }
  return cartCreation;
}

// --- operations --------------------------------------------------------------

export async function getCart(): Promise<Json | null> {
  if (demoMode()) {
    const cart = demoGetCart();
    indexCartLines(cart);
    return cart;
  }
  const id = getCartId();
  if (!id) return null;
  const r = await api(`/v1/storefront/cart/${id}?session_id=${encodeURIComponent(getSessionId())}`);
  if (!r.ok) {
    if (r.status === 403 || r.status === 404 || r.status === 410) clearCartId();
    return null;
  }
  indexCartLines(r.data);
  return r.data;
}

/**
 * `seed` is only read in demo mode, where there is no API to supply the title
 * and price the local cart has to display. Live, the server owns every field
 * and the argument is ignored.
 */
export async function addItem(variantId: string, qty: number, seed?: DemoSeed) {
  if (demoMode()) {
    return demoAddItem(
      seed ?? { variant_id: variantId, product_title: "商品", unit_price: 0 },
      qty
    );
  }
  return serializeCartMutation(async () => {
    const id = await ensureCart();
    return api(`/v1/storefront/cart/${id}/items`, {
      method: "POST",
      body: { variant_id: variantId, quantity: qty, session_id: getSessionId() },
    });
  });
}

async function updateItem(lineId: string, qty: number) {
  if (demoMode()) return demoUpdateItem(lineId, qty);
  return serializeCartMutation(async () => {
    const id = getCartId();
    if (!id) return null;
    return api(`/v1/storefront/cart/${id}/items/${lineId}`, {
      method: "PATCH",
      body: { quantity: qty, session_id: getSessionId() },
    });
  });
}

async function removeItem(lineId: string) {
  // Covers all removal paths (remove button, qty dec to zero, 清空購物車).
  track("remove_from_cart", lineIndex.get(lineId) || {});
  // Ahead of the cart-id guard, unlike the live path: demo mode never creates a
  // server cart, so there is no id in storage and the guard would refuse every
  // removal — leaving rows that cannot be deleted and a badge that never falls.
  if (demoMode()) return demoRemoveItem(lineId);
  return serializeCartMutation(async () => {
    const id = getCartId();
    if (!id) return null;
    return api(`/v1/storefront/cart/${id}/items/${lineId}`, {
      method: "DELETE",
      body: { session_id: getSessionId() },
    });
  });
}

// 清空購物車. There's no bulk-clear endpoint, so delete every line with the same
// DELETE the per-row remove uses (no new mutation/fetch logic introduced).
// Returns the cart as the LAST delete left it (each DELETE responds with the
// recalculated cart), so the caller can redraw without a follow-up GET. null
// when there was nothing to clear or a delete failed — caller falls back to a
// fetch so the page never renders from a half-cleared guess.
async function clearCart(): Promise<Json | null> {
  if (demoMode()) return demoClearCart();
  const cart = await getCart();
  let last: Json | null = null;
  for (const it of cart?.items || []) {
    const r = await removeItem(it.line_id);
    if (!r || !r.ok || !r.data) return null;
    last = r.data;
  }
  return last;
}

// Promotion capability is wired (verified) but the /cart layout has no promo
// input field, so no UI is bound to these in Phase 2.
export async function applyPromotion(code: string) {
  const id = await ensureCart();
  return api(`/v1/storefront/cart/${id}/promotion`, {
    method: "POST",
    body: { code, session_id: getSessionId() },
  });
}

export async function removePromotion() {
  const id = getCartId();
  if (!id) return null;
  return api(`/v1/storefront/cart/${id}/promotion`, {
    method: "DELETE",
    body: { session_id: getSessionId() },
  });
}

// --- shared helpers ----------------------------------------------------------

function totalQty(cart: Json): number {
  return (cart?.items || []).reduce((s: number, i: Json) => s + (i.quantity || 0), 0);
}

function setBadge(n: number) {
  document.querySelectorAll("[data-cart-count]").forEach((el) => {
    (el as HTMLElement).textContent = String(n);
  });
  document.querySelectorAll("[data-cart-title-count]").forEach((el) => {
    (el as HTMLElement).textContent = String(n);
  });
}

function getBadge(): number {
  const el = document.querySelector("[data-cart-count]");
  return parseInt(el?.textContent || "0", 10) || 0;
}

function showEl(el: HTMLElement | null) {
  if (el) el.style.display = "";
}

function hideEl(el: HTMLElement | null) {
  if (el) el.style.display = "none";
}

// --- public entry points -----------------------------------------------------

export async function initBadge() {
  try {
    const c = await getCart();
    setBadge(c ? totalQty(c) : 0);
  } catch {
    setBadge(0);
  }
}

/**
 * Bind every `[data-add-to-cart]` under `root`.
 *
 * This used to be `wireProductDetail()`, and it used `document.querySelector` —
 * SINGULAR — for the button, the quantity stepper and the spec group. That is
 * fine for a product detail page and silently wrong everywhere else: a landing
 * page with five purchasable cards got one working button and four dead ones,
 * so anyone building one had to reimplement the whole optimistic sequence by
 * hand. Now each button resolves its own controls from its own
 * `[data-cart-scope]` ancestor, and a page with one card behaves exactly as a
 * page with twenty.
 *
 * What a scope may contain, all optional:
 *   [data-qty-value] / [data-qty-dec] / [data-qty-inc]   quantity stepper
 *   [data-variant-option][data-variant-id]               spec picker
 *   [data-buy-now]                                       secondary CTA
 * A card with none of them adds one unit of the button's own
 * `data-variant-id`, which is why a product grid needs no extra markup.
 *
 * Idempotent: a button already bound is skipped, so calling this again after
 * injecting more cards binds only the new ones.
 */
export function wireAddToCartButtons(root: ParentNode = document): void {
  const buttons = Array.from(root.querySelectorAll("[data-add-to-cart]")) as HTMLElement[];
  for (const button of buttons) {
    if (button.getAttribute("data-cart-bound") === "true") continue;
    button.setAttribute("data-cart-bound", "true");
    wireAddButton(button);
  }
}

function wireAddButton(addBtn: HTMLElement) {
  // No [data-cart-scope] ancestor means the page is the scope — the product
  // detail layout before it grew one, and any single-product page after.
  const scope = (addBtn.closest("[data-cart-scope]") as ParentNode | null) ?? document;

  // --- quantity (absent on a card: one unit per click) ------------------------
  const valEl = scope.querySelector("[data-qty-value]") as HTMLElement | null;
  const getQty = () => Math.max(1, parseInt(valEl?.textContent || "1", 10) || 1);
  const setQty = (n: number) => {
    if (valEl) valEl.textContent = String(Math.max(1, n));
  };
  scope.querySelector("[data-qty-dec]")?.addEventListener("click", () => setQty(getQty() - 1));
  scope.querySelector("[data-qty-inc]")?.addEventListener("click", () => setQty(getQty() + 1));

  // --- spec gate (absent on a card: the button carries its own variant) -------
  const optionButtons = Array.from(
    scope.querySelectorAll("[data-variant-option]")
  ) as HTMLButtonElement[];
  const buyBtn = scope.querySelector("[data-buy-now]") as HTMLElement | null;
  const actionButtons = [addBtn, buyBtn].filter(Boolean) as HTMLElement[];
  actionButtons.forEach((button) => {
    if (!button.dataset.originalHref) {
      button.dataset.originalHref = button.getAttribute("href") || "";
    }
  });
  const setActionsEnabled = (enabled: boolean) => {
    actionButtons.forEach((button) => {
      button.dataset.variantSelected = enabled ? "true" : "false";
      const originalHref = button.dataset.originalHref || "";
      if (originalHref) button.setAttribute("href", originalHref);
    });
  };
  const getSelectedVariantId = () => addBtn.getAttribute("data-variant-id") || "";

  // A scope with no spec picker is pre-selected by construction; only a real
  // picker gates the CTAs.
  setActionsEnabled(optionButtons.length === 0 && !!getSelectedVariantId());

  // A multi-variant panel opens on a price RANGE, because until a spec is
  // chosen there is no single price to show. Selecting one narrows it to that
  // variant's own price. Opt-in: a scope with no [data-variant-price] (or an
  // option with no data-price) is left alone.
  const priceEl = scope.querySelector("[data-variant-price]") as HTMLElement | null;
  const showVariantPrice = (button: HTMLButtonElement) => {
    if (!priceEl) return;
    const raw = Number(button.getAttribute("data-price"));
    if (Number.isFinite(raw) && raw > 0) priceEl.textContent = fmt(raw);
  };

  const selectVariant = (button: HTMLButtonElement) => {
    const selectedId = button.getAttribute("data-variant-id") || "";
    showVariantPrice(button);
    optionButtons.forEach((item) => {
      const isActive = item === button;
      // Selected-variant styling is a class, not inline colour: the palette
      // lives in brand/identity.ts and a literal here would be invisible to it.
      item.classList.toggle("is-active", isActive);
      item.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
    if (selectedId) {
      addBtn.setAttribute("data-variant-id", selectedId);
      setActionsEnabled(true);
    }
  };
  optionButtons.forEach((button) => {
    button.addEventListener("click", () => selectVariant(button));
  });

  // Single-variant products have exactly one spec option — auto-select it so the
  // add-to-cart / buy-now CTAs are immediately actionable (variant_id still rides
  // every payload). Multi-variant products keep the gate: no auto-select, the
  // customer must pick before either button does anything.
  if (optionButtons.length === 1) {
    selectVariant(optionButtons[0]);
  }

  buyBtn?.addEventListener("click", (e) => {
    if (!getSelectedVariantId()) {
      e.preventDefault();
      optionButtons[0]?.focus();
    }
  });

  const original = addBtn.textContent;
  const ADDED_TEXT = "已加入購物車 ✓";

  // Single resettable revert timer PER BUTTON — each click resets it so rapid
  // re-adds never stack, and a server failure can revert early without leaving a
  // stale timer behind. revert() is idempotent (safe to call once the timer
  // fired).
  let revertTimer = 0;
  const revert = () => {
    if (revertTimer) {
      clearTimeout(revertTimer);
      revertTimer = 0;
    }
    addBtn.textContent = original;
    addBtn.setAttribute("aria-disabled", "false");
  };

  addBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    const variantId = getSelectedVariantId();
    if (!variantId) {
      optionButtons[0]?.focus();
      return;
    }
    if (addBtn.getAttribute("aria-disabled") === "true") return;

    const qty = getQty();
    const productTitle = addBtn.getAttribute("data-product-title") || "商品";
    track("add_to_cart", {
      product_id: addBtn.getAttribute("data-product-id") || undefined,
      variant_id: variantId,
      context: { qty },
    });

    // Optimistic, all in the same click tick: flip the button to 已加入, disable
    // it (blocks double-add during the window), bump the badge, show the success
    // banner. Nothing waits on the ~2-3s server. The button auto-reverts ~3s
    // later so the customer can buy again.
    if (revertTimer) clearTimeout(revertTimer);
    addBtn.setAttribute("aria-disabled", "true");
    addBtn.textContent = ADDED_TEXT;
    const prevBadge = getBadge();
    setBadge(prevBadge + qty);
    // The drawer is the confirmation when there is one: it slides in showing
    // the line that was just added. Without a drawer (flags.cartPage on) the
    // banner is still the only signal, so it stays. Demo mode always keeps it —
    // it has a mode to announce, not just a result.
    const hasDrawer = !!document.querySelector("[data-cart-drawer]");
    // Same tick as the click — the panel must not wait on the network. It fills
    // in when the mutation answers.
    if (hasDrawer) openCartDrawerPending();
    const successToast =
      demoMode() || !hasDrawer
        ? showToast(
            demoMode()
              ? `${productTitle} 已加入購物車（示範模式）`
              : `${productTitle} 已加入購物車`,
            { variant: "success" },
          )
        : null;
    revertTimer = window.setTimeout(revert, 3000);

    // The rollback below only ever ran for a REJECTED request — `{ok:false}`.
    // addItem() can also THROW: ensureCart() raises when cart creation fails,
    // which is exactly what a misconfigured or unreachable API does. The
    // throw escaped this handler, so none of the optimistic state was undone:
    // the badge kept the phantom unit forever, the success toast stayed up, and
    // no failure was ever shown. Both failure shapes now land in one place.
    let added: Awaited<ReturnType<typeof addItem>> | null = null;
    try {
      added = await addItem(variantId, qty, demoSeed(addBtn, variantId, qty));
    } catch {
      added = null;
    }

    if (added && added.ok) {
      // Server is authoritative for the count — reconcile. Leave the button in
      // its 已加入 state until the revert timer fires.
      setBadge(totalQty(added.data));
      // Draw straight from the mutation response: it IS the recalculated cart,
      // so opening the drawer costs no extra round trip.
      void openCartDrawer(added.data);
    } else {
      // Roll back everything immediately — don't wait out the 3s: badge, the
      // success banner, and the button, then surface the failure.
      setBadge(prevBadge);
      successToast?.dismiss();
      revert();
      // The panel is already open and has nothing to show — say so in it, and
      // keep the toast, which is the signal that survives the panel being closed.
      if (hasDrawer) showCartDrawerError();
      showToast("加入購物車失敗，請再試一次", { variant: "error" });
    }
  });
}

/**
 * The line demo mode stores when there is no server to store it.
 *
 * Read off the button because demo mode has nowhere else to get it: the API
 * that would normally own price and title is the thing that is not there. It is
 * never sent anywhere — see src/scripts/demo-cart.ts.
 */
function demoSeed(addBtn: HTMLElement, variantId: string, _qty: number): DemoSeed {
  return {
    variant_id: variantId,
    product_id: addBtn.getAttribute("data-product-id") || undefined,
    product_title: addBtn.getAttribute("data-product-title") || "商品",
    product_handle: addBtn.getAttribute("data-product-handle") || undefined,
    image_url: addBtn.getAttribute("data-product-image") || undefined,
    unit_price: Number(addBtn.getAttribute("data-unit-price") || 0) || 0,
  };
}

// --- cart drawer --------------------------------------------------------------
//
// The cart as a panel over the page instead of a route. Same mutations as
// everything else — getCart / updateItem / removeItem — so the in-flight
// cart-creation memo and the mutation queue apply here unchanged; the drawer has
// no cart code of its own to get out of step.

let drawerPainted = false;

function drawerRoot(): HTMLElement | null {
  return document.querySelector("[data-cart-drawer]") as HTMLElement | null;
}

/** Open the drawer and refresh it from the server. */
export async function openCartDrawer(cart?: Json): Promise<void> {
  const root = drawerRoot();
  if (!root) return;
  root.hidden = false;
  document.documentElement.style.overflow = "hidden";
  (root.querySelector("[data-cart-panel]") as HTMLElement | null)?.focus?.();
  // A caller holding a fresh cart (the add-to-cart response) hands it over; the
  // header icon has nothing, so it fetches.
  if (cart) {
    drawerPainted = true;
    drawDrawer(cart);
    return;
  }
  await paintDrawer();
}

export function closeCartDrawer(): void {
  const root = drawerRoot();
  if (!root) return;
  root.hidden = true;
  document.documentElement.style.overflow = "";
}

type DrawerView = "loading" | "empty" | "items" | "error";

function setDrawerView(root: HTMLElement, view: DrawerView) {
  const loading = root.querySelector("[data-cart-loading]") as HTMLElement | null;
  const empty = root.querySelector("[data-cart-empty]") as HTMLElement | null;
  const items = root.querySelector("[data-cart-items]") as HTMLElement | null;
  const foot = root.querySelector("[data-cart-foot]") as HTMLElement | null;
  const error = root.querySelector("[data-cart-error]") as HTMLElement | null;
  if (loading) loading.hidden = view !== "loading";
  if (empty) empty.hidden = view !== "empty";
  if (items) items.hidden = view !== "items";
  if (foot) foot.hidden = view !== "items";
  if (error) error.hidden = view !== "error";
}

/** Dim the list while a mutation it is showing the result of is still out. */
function setDrawerBusy(busy: boolean) {
  const items = drawerRoot()?.querySelector("[data-cart-items]") as HTMLElement | null;
  if (items) items.setAttribute("aria-busy", busy ? "true" : "false");
}

/**
 * Open the panel NOW, before the request that will fill it has even been sent.
 *
 * The first add on a visit costs two round trips — create the cart, then add the
 * line — so waiting for the response put 2-3 seconds between the click and the
 * panel. The customer had already been told 已加入購物車 by the button; the cart
 * appearing later read as a second, slower system.
 *
 * A panel with nothing in it yet is only honest if it says so, hence the loading
 * state on a first open and the dimmed list on a subsequent one.
 */
export function openCartDrawerPending(): void {
  const root = drawerRoot();
  if (!root) return;
  root.hidden = false;
  document.documentElement.style.overflow = "hidden";
  if (drawerPainted) setDrawerBusy(true);
  else setDrawerView(root, "loading");
}

/** The add failed and the panel is standing there empty — say so inside it. */
export function showCartDrawerError(): void {
  const root = drawerRoot();
  if (!root || root.hidden) return;
  setDrawerBusy(false);
  // A panel that already has the cart in it keeps showing the cart: the line
  // that failed simply is not there, and the toast says why.
  if (!drawerPainted) setDrawerView(root, "error");
}

/** Draw the whole panel from ONE cart payload, exactly as /cart used to. */
function drawDrawer(cart: Json | null) {
  const root = drawerRoot();
  if (!root) return;
  const list = root.querySelector("[data-cart-list]") as HTMLElement | null;
  const tpl = document.querySelector("#cart-drawer-row") as HTMLTemplateElement | null;
  const items = cart?.items || [];

  setBadge(cart ? totalQty(cart) : 0);
  if (cart) indexCartLines(cart);
  setDrawerBusy(false);

  if (!list || !tpl || items.length === 0) {
    if (list) list.innerHTML = "";
    setDrawerView(root, "empty");
    return;
  }

  list.innerHTML = "";
  for (const it of items) {
    const node = tpl.content.firstElementChild!.cloneNode(true) as HTMLElement;
    node.setAttribute("data-line-id", it.line_id);
    const img = node.querySelector('[data-field="image"]') as HTMLImageElement | null;
    if (img) {
      // image_url is snapshotted onto the line at add-time by the backend, so it
      // rides the cart payload — no per-item product fetch.
      if (it.image_url) {
        img.src = it.image_url;
        img.alt = it.product_title;
      } else {
        img.remove();
      }
    }
    const set = (sel: string, text: string) => {
      const el = node.querySelector(sel);
      if (el) el.textContent = text;
    };
    set('[data-field="name"]', it.product_title);
    set('[data-field="unit_price"]', fmt(it.unit_price));
    set('[data-field="quantity"]', String(it.quantity));
    set('[data-field="line_subtotal"]', fmt(it.line_subtotal));
    list.appendChild(node);
  }

  const subtotal = root.querySelector("[data-cart-subtotal]");
  if (subtotal) subtotal.textContent = fmt(cart.items_total);
  setDrawerView(root, "items");
}

async function paintDrawer(): Promise<void> {
  const root = drawerRoot();
  if (!root) return;
  // Pin "loading" before the await — an empty panel must never flash while the
  // fetch is still out.
  if (!drawerPainted) setDrawerView(root, "loading");
  drawerPainted = true;
  drawDrawer(await getCart());
}

/**
 * Bind the drawer once per page. Safe to call on every route: the panel is
 * rendered by BaseLayout, so it is always there.
 */
export function initCartDrawer(): void {
  const root = drawerRoot();
  if (!root || root.getAttribute("data-cart-bound") === "true") return;
  root.setAttribute("data-cart-bound", "true");

  // Anything that opens the cart says so with [data-cart-open] — the header
  // icon, the mobile header, checkout's 返回購物車. One attribute, one binding.
  document.querySelectorAll("[data-cart-open]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      void openCartDrawer();
    });
  });

  root.querySelectorAll("[data-cart-close]").forEach((el) => {
    el.addEventListener("click", () => closeCartDrawer());
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !root.hidden) closeCartDrawer();
  });

  // Row controls. ONE request per click, every control in the row disabled
  // while it is out, and the PATCH/DELETE response IS the recalculated cart —
  // so the panel redraws from it without a follow-up GET.
  let rowBusy = false;
  const list = root.querySelector("[data-cart-list]") as HTMLElement | null;
  list?.addEventListener("click", async (e) => {
    const btn = (e.target as HTMLElement).closest("[data-action]") as HTMLButtonElement | null;
    if (!btn || btn.disabled || rowBusy) return;
    const row = btn.closest("[data-cart-row]") as HTMLElement | null;
    const lineId = row?.getAttribute("data-line-id") || "";
    if (!row || !lineId) return;

    const action = btn.getAttribute("data-action");
    const current = parseInt(row.querySelector('[data-field="quantity"]')?.textContent || "1", 10) || 1;
    if (action === "inc" && current >= 99) return; // backend max quantity
    // dec at 1 removes the line, matching what /cart did.
    const isRemove = action === "remove" || (action === "dec" && current <= 1);

    const controls = Array.from(row.querySelectorAll("[data-action]")) as HTMLButtonElement[];
    rowBusy = true;
    controls.forEach((b) => (b.disabled = true));
    const r = isRemove
      ? await removeItem(lineId)
      : await updateItem(lineId, action === "inc" ? current + 1 : current - 1);
    rowBusy = false;

    if (r && r.ok && r.data) {
      drawDrawer(r.data); // rows are rebuilt from the template → controls re-enabled
      return;
    }
    controls.forEach((b) => (b.disabled = false));
    showToast(isRemove ? "移除商品失敗，請再試一次" : "數量更新失敗，請再試一次", {
      variant: "error",
    });
  });

  // Straight to /checkout. The login wall lives ON that page — it renders the
  // member gate for guests and the form for members — so kicking off LINE login
  // from here would put the same decision in two places, and a drawer button
  // that silently does nothing when the channel is misconfigured is worse than
  // one that lands on a page which can explain itself.
  root.querySelector("[data-cart-checkout]")?.addEventListener("click", () => {
    window.location.href = "/checkout";
  });
}

function populateSummary(cart: Json) {
  const root = document.querySelector("[data-cart-summary]");
  if (!root) return;
  const setF = (f: string, txt: string) => {
    const el = root.querySelector(`[data-field="${f}"]`);
    if (el) el.textContent = txt;
  };
  setF("items_total", fmt(cart.items_total));
  setF("shipping", fmt(cart.shipping_fee_total));
  setF("discount", `- ${fmt(cart.discount_total)}`);
  setF("grand", fmt(cart.grand_total));

  const list = root.querySelector("[data-summary-list]");
  const tpl = root.querySelector("[data-summary-line]") as HTMLTemplateElement | null;
  if (list && tpl) {
    list.innerHTML = "";
    for (const it of cart.items || []) {
      const node = tpl.content.firstElementChild!.cloneNode(true) as HTMLElement;
      const name = node.querySelector('[data-field="line-name"]');
      const sub = node.querySelector('[data-field="line-subtotal"]');
      if (name) name.textContent = `${it.product_title} x ${it.quantity}`;
      if (sub) sub.textContent = fmt(it.line_subtotal);
      list.appendChild(node);
    }
  }
}

// Login wall: browsing and adding to cart are free; only the
// "前往結帳" CTA. Logged in → /checkout; otherwise kick off LINE login and come
// back to /checkout. The CTA is the OrderSummary anchor to /checkout.
function wireCheckoutGate(root: HTMLElement) {
  const btn = root.querySelector('[data-cart-summary] a[href="/checkout"]') as HTMLElement | null;
  if (!btn) return;
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    if (isLoggedIn()) window.location.href = "/checkout";
    else startLogin("/checkout");
  });
}

export function initCartPage() {
  const root = document.querySelector("[data-cart-page]") as HTMLElement | null;
  if (!root) return;
  const loadingEl = root.querySelector("[data-cart-loading]") as HTMLElement;
  const emptyEl = root.querySelector("[data-cart-empty]") as HTMLElement;
  const gridEl = root.querySelector("[data-cart-grid]") as HTMLElement;
  const listEl = root.querySelector("[data-cart-list]") as HTMLElement;
  const rowTpl = document.querySelector("#cart-row-tpl") as HTMLTemplateElement;
  wireCheckoutGate(root);

  // Three mutually-exclusive page states driven by inline display, NOT the
  // `hidden` attribute: the scoped CSS sets `.empty-cart`/`.cart-grid { display:
  // grid }`, author rules that beat the UA `[hidden] { display: none }`, so the
  // attribute can't actually hide them — inline style wins. HTML ships in
  // "loading" with empty/items carrying inline `display:none`, so the empty
  // notice never paints before JS runs.
  const setView = (view: "loading" | "empty" | "items") => {
    (view === "loading" ? showEl : hideEl)(loadingEl);
    (view === "empty" ? showEl : hideEl)(emptyEl);
    (view === "items" ? showEl : hideEl)(gridEl);
  };

  // Draw the whole page from ONE cart payload. Every mutation endpoint returns
  // the recalculated cart, so this is fed straight from a PATCH/DELETE response
  // — the page never re-GETs the cart after a mutation.
  function paint(cart: Json | null) {
    const items = cart?.items || [];
    setBadge(cart ? totalQty(cart) : 0);
    // Keep the beacon line index in step with whatever payload we just drew —
    // mutations no longer route through getCart(), which used to be the only
    // place it was refreshed.
    if (cart) indexCartLines(cart);
    if (!cart || items.length === 0) {
      listEl.innerHTML = "";
      setView("empty"); // only now, after the fetch resolved, is empty allowed
      return;
    }
    setView("items");

    listEl.innerHTML = "";
    for (const it of items) {
      const node = rowTpl.content.firstElementChild!.cloneNode(true) as HTMLElement;
      node.setAttribute("data-line-id", it.line_id);
      const img = node.querySelector('[data-field="image"]') as HTMLImageElement | null;
      if (img) {
        // image_url is snapshotted onto the line at add-time by the backend, so
        // it rides the GET /cart response — no per-item product/image fetch.
        const src = it.image_url || "";
        if (src) {
          img.src = src;
          img.alt = it.product_title;
        } else {
          img.remove(); // legacy line w/o snapshot → droplet fallback, no break
        }
      }
      const set = (sel: string, txt: string) => {
        const el = node.querySelector(sel);
        if (el) el.textContent = txt;
      };
      const productHref = it.product_handle ? `/products/${it.product_handle}/` : "/products";
      node.querySelectorAll('[data-field="product_link"]').forEach((link) => {
        if (link instanceof HTMLAnchorElement) link.href = productHref;
      });
      set('[data-field="name"]', it.product_title);
      set('[data-field="quantity"]', String(it.quantity));
      set('[data-field="unit_price"]', fmt(it.unit_price));
      set('[data-field="line_subtotal"]', fmt(it.line_subtotal));
      listEl.appendChild(node);
    }
    populateSummary(cart);
  }

  async function render({ pin = false }: { pin?: boolean } = {}) {
    // On page entry, pin "loading" before any await — empty-state is forbidden
    // until the cart fetch below resolves.
    if (pin) setView("loading");
    paint(await getCart());
  }

  // Row quantity / removal. Ported from the checkout order summary
  // (checkout.ts §"order-summary quantity stepper + per-row remove"), which is
  // the reference implementation:
  //   - ONE request per click. The PATCH/DELETE response IS the recalculated
  //     cart, so we redraw from it; the follow-up GET this handler used to fire
  //     was re-fetching data it had just thrown away (~0.5s of dead wait).
  //   - Real `disabled` on every control in the row plus a busy flag.
  //     aria-disabled is advisory only — it never stopped a rapid 5-click burst
  //     from queueing 5 sequential mutations.
  //   - Failures toast instead of dying silently (the return values were not
  //     even being checked). Nothing is mutated client-side before the server
  //     answers, so a failure needs no rollback — just re-enable and tell the
  //     customer.
  let rowBusy = false;

  listEl.addEventListener("click", async (e) => {
    const target = e.target as HTMLElement;
    const btn = target.closest("[data-action]") as HTMLButtonElement | null;
    if (!btn || btn.disabled || rowBusy) return;
    const row = btn.closest("[data-cart-row]") as HTMLElement | null;
    const lineId = row?.getAttribute("data-line-id") || "";
    if (!row || !lineId) return;
    const action = btn.getAttribute("data-action");
    if (!action) return;

    const cur = parseInt(row.querySelector('[data-field="quantity"]')?.textContent || "1", 10) || 1;
    if (action === "inc" && cur >= 99) return; // backend max quantity
    // dec at qty 1 removes the line — existing /cart behaviour, kept as-is
    // (checkout instead floors dec at 1 and has a separate 移除 button).
    const isRemove = action === "remove" || (action === "dec" && cur <= 1);

    const controls = Array.from(row.querySelectorAll("[data-action]")) as HTMLButtonElement[];
    rowBusy = true;
    controls.forEach((b) => (b.disabled = true));
    const r = isRemove
      ? await removeItem(lineId)
      : await updateItem(lineId, action === "inc" ? cur + 1 : cur - 1);
    rowBusy = false;

    if (r && r.ok && r.data) {
      paint(r.data); // rows are rebuilt from the template → controls re-enabled
      return;
    }
    controls.forEach((b) => (b.disabled = false));
    showToast(isRemove ? "移除商品失敗，請再試一次" : "數量更新失敗，請再試一次", {
      variant: "error",
    });
  });

  // 清空購物車 — outline button in the items card header. Reuses clearCart (which
  // reuses the per-row remove); right column / checkout gate untouched.
  root.querySelector("[data-clear-cart]")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    btn.disabled = true;
    try {
      const cleared = await clearCart();
      if (cleared) paint(cleared);
      else await render(); // a delete failed mid-way — resync from the server
    } finally {
      btn.disabled = false;
    }
  });

  render({ pin: true });
}
