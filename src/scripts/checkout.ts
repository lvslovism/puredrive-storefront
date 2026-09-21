// Phase 3a checkout client. Runs in the browser on /checkout and
// /checkout/complete. All money values are authoritative from the API
// (init/confirm recalc server-side, 鐵律 #1). The order summary shows a
// front-end *mirror* of the backend shipping rule so the numbers match what
// the user will be charged — but the backend stays the source of truth:
// confirm sends expected_grand_total from the live init response, and an
// AMOUNT_MISMATCH re-syncs the display instead of forcing the order through.
//
// Flow: forced login → claim guest cart → fill form → single "確認下單" button
// runs /checkout/init (server recalc + amounts) → /checkout/confirm
// (expected_grand_total). COD → /checkout/complete directly; credit/atm/cvs →
// backend returns an auto-submit ECPay form (next_action.ecpay_redirect) and
// the browser POSTs to ECPay's cashier / 取號 page.

import {
  authedFetch,
  merchantFetch,
  getSessionId,
  isLoggedIn,
  startLogin,
  claimGuestCartIfNeeded,
  cfg,
} from "./auth";
import { applyPromotion, removePromotion } from "./cart";
import { formatMoney, storageKey } from "../../brand/identity";
import { showToast } from "./toast";
import { getUtm } from "../lib/track";
import { sanitizeUtmForOrder } from "../lib/utm-order.mjs";

type Json = any;

const LS_CART = storageKey("cart_id");

// Deterministic ECPay C2C subtype per shipping method (matches backend
// cvs/config). Drives both the CVS map LogisticsSubType and the cvs_store
// payload sent to checkout/init.
const CVS_SUBTYPE: Record<string, string> = {
  cvs_unimart: "UNIMARTC2C",
  cvs_fami: "FAMIC2C",
  cvs_hilife: "HILIFEC2C",
};

// Store picked via the ECPay map. Module-scoped so buildInitBody() can read it
// when assembling the cvs_store payload. Cleared whenever the shipping method
// changes (a UNIMART pick is invalid for a FAMI shipment).
type CvsStore = {
  cvs_type: string;
  store_id: string;
  store_name: string;
  store_address: string;
};
let selectedStore: CvsStore | null = null;

const fmt = formatMoney;
function cartId(): string | null {
  return localStorage.getItem(LS_CART);
}
/**
 * Home delivery is every method the merchant names `home_*` — the suffix is the
 * merchant's own (home_tcat, home_custom_…), so the prefix is the only part that
 * survives a merchant adding another courier. Shared by the field toggle and by
 * the payload builder so the visible form and the posted body cannot disagree.
 */
function isHomeShippingMethod(method: string | null | undefined): boolean {
  return !!method && method.startsWith("home_");
}

function $(sel: string): HTMLElement | null {
  return document.querySelector(sel);
}
function show(el: HTMLElement | null) {
  if (el) el.removeAttribute("hidden");
}
function hide(el: HTMLElement | null) {
  if (el) el.setAttribute("hidden", "");
}

async function loadCart(): Promise<Json | null> {
  const id = cartId();
  if (!id) return null;
  const r = await authedFetch(
    `/v1/storefront/cart/${id}?session_id=${encodeURIComponent(getSessionId())}`
  );
  return r.ok ? r.data : null;
}

// Order-summary quantity stepper mutation. Reuses the existing cart line PATCH
// (same endpoint /cart already uses); the server recalculates and returns the
// whole cart, which we redraw from (鐵律 #1 — the front end never re-computes a
// line or a total). Dec stops at 1 — removal goes through the per-row 移除
// button (deleteLine) instead.
async function patchLineQty(lineId: string, qty: number): Promise<Json | null> {
  const id = cartId();
  if (!id) return null;
  return authedFetch(`/v1/storefront/cart/${id}/items/${lineId}`, {
    method: "PATCH",
    body: { quantity: qty, session_id: getSessionId() },
  });
}

// Order-summary line removal. Same
// DELETE the /cart page rows use; the server returns the recalced whole cart
// and we redraw from it — removing the last line lands on the empty state,
// never a zero-total checkout form.
async function deleteLine(lineId: string): Promise<Json | null> {
  const id = cartId();
  if (!id) return null;
  return authedFetch(`/v1/storefront/cart/${id}/items/${lineId}`, {
    method: "DELETE",
    body: { session_id: getSessionId() },
  });
}

// Show a variant only when it carries real spec info — single-variant products
// snapshot a placeholder title ("Default" / 預設) that would be noise here.
function variantLabel(v?: string | null): string {
  const t = (v ?? "").trim();
  if (!t || /^(default|default title|預設)$/i.test(t)) return "";
  return t;
}

// No-thumbnail fallback — the droplet used on the /cart rows, kept in sync.
const THUMB_FALLBACK_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.7s6.5 6.4 6.5 11.3a6.5 6.5 0 0 1-13 0C5.5 9.1 12 2.7 12 2.7z"></path></svg>';

// Trash glyph for the per-row 移除 button (D1). aria-hidden — the button
// itself carries the accessible name.
const TRASH_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M3 6h18"></path><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>';

// ── checkout page ───────────────────────────────────────────────────────────

export function initCheckoutPage() {
  const root = $("[data-checkout-page]") as HTMLElement | null;
  if (!root) return;

  const loadingEl = $("[data-checkout-loading]");
  const formEl = $("[data-checkout-form]");
  const emptyEl = $("[data-checkout-empty]");
  const gateEl = $("[data-checkout-gate]");
  const errEl = $("[data-checkout-error]");

  // Mutually-exclusive page states. HTML ships in "loading" with empty/form/gate
  // carrying inline `display:none`, so nothing paints before JS runs (the
  // `hidden` attribute loses to the author `display:grid` rules — inline wins).
  // We hide all, then clear the active one back to its CSS value.
  const setView = (view: "loading" | "form" | "empty" | "gate") => {
    if (loadingEl) loadingEl.style.display = view === "loading" ? "" : "none";
    if (formEl) formEl.style.display = view === "form" ? "" : "none";
    if (emptyEl) emptyEl.style.display = view === "empty" ? "" : "none";
    if (gateEl) gateEl.style.display = view === "gate" ? "" : "none";
  };

  // Login wall (會員必登). Guests are NOT auto-redirected — they see a
  // prompt card with a LINE button and choose to log in; login returns here with
  // the member Bearer, the page reloads, and the form shows.
  if (!isLoggedIn()) {
    setView("gate");
    $("[data-checkout-login]")?.addEventListener("click", () => startLogin("/checkout"));
    return;
  }

  const setError = (msg: string) => {
    if (errEl) {
      errEl.textContent = msg || "";
      msg ? show(errEl) : hide(errEl);
    }
  };

  // --- front-end mirror of the backend shipping rule (cart-totals.ts) ---
  // subtotal/discount come from the cart; shipping + grand are derived with the
  // same rule the server uses, so the summary matches the order before submit:
  //   shipping = items_total >= free_threshold ? 0 : selected_method.fee
  //   grand    = items_total + shipping - discount - credits
  // discounts[]/promotion_code ride the cart response so the summary knows the
  // applied coupon without any local money math (promo-checkout-v1). discounts
  // carries the coupon TYPE — free_shipping is detected by its presence, never
  // by subtracting an amount (see renderMirror).
  let cartTotals: {
    items_total: number;
    discount_total: number;
    discounts: Json[];
    promotion_code: string | null;
  } = { items_total: 0, discount_total: 0, discounts: [], promotion_code: null };

  // Single source for pulling summary totals off any cart payload (initial load,
  // stepper redraw, promo apply/remove) — keeps the four fields in lockstep.
  const setCartTotals = (cart: Json) => {
    cartTotals = {
      items_total: cart.items_total ?? 0,
      discount_total: cart.discount_total ?? 0,
      discounts: cart.discounts ?? [],
      promotion_code: cart.promotion_code ?? null,
    };
  };

  const freeThresholdAttr = formEl?.getAttribute("data-free-threshold");
  const freeThreshold =
    freeThresholdAttr && freeThresholdAttr !== "" ? Number(freeThresholdAttr) : 0;

  const selectedShippingFee = (): number => {
    const checked = document.querySelector(
      'input[name="shipping"]:checked'
    ) as HTMLInputElement | null;
    const fee = checked?.getAttribute("data-fee");
    return fee != null && fee !== "" ? Number(fee) : 0;
  };

  const renderMirror = () => {
    const subtotal = cartTotals.items_total || 0;
    const discount = cartTotals.discount_total || 0;
    const fee = selectedShippingFee();
    // A free_shipping coupon fully waives the selected method's fee. The trigger
    // is the coupon's EXISTENCE, not an amount: promotions_value_chk forces
    // free_shipping ⇒ value=0 and the RPC sets v_shipping_disc := p_shipping_fee
    // (the whole current fee), and no partial-shipping coupon type exists — so a
    // method switch never needs a server recompute to stay correct.
    const hasFreeShipping = (cartTotals.discounts ?? []).some(
      (d: Json) => d?.type === "free_shipping"
    );
    const shipping = hasFreeShipping
      ? 0
      : freeThreshold > 0 && subtotal >= freeThreshold
        ? 0
        : fee;
    const grand = Math.max(0, subtotal + shipping - discount);
    setAmounts({
      items_total: subtotal,
      shipping_fee_total: shipping,
      discount_total: discount,
      grand_total: grand,
      promotion_code: cartTotals.promotion_code,
    });
  };

  // --- load cart + render summary baseline ---
  (async () => {
    // Pin "loading" before any await — never trust the DOM's prior inline state
    // (client-nav / bfcache / re-init could leave empty visible from a previous
    // render). empty-state is forbidden until the cart fetch below resolves.
    setView("loading");
    await claimGuestCartIfNeeded();
    const cart = await loadCart();
    if (!cart || !(cart.items || []).length) {
      setView("empty"); // only now is empty-state allowed to show
      return;
    }
    renderItems(cart);
    setCartTotals(cart);
    renderMirror();
    renderPromoState(cart); // reflect a coupon already on the cart as a chip
    setView("form");
  })();

  // --- order-summary quantity stepper + per-row remove -------------------------
  // +/− → existing cart line PATCH; 移除 → existing cart line DELETE (D1,
  // from the summary). Either way the server recalculates
  // and returns the whole cart, which we redraw from. The front end never sums
  // a line or a total; the free-shipping crossing follows the server's
  // items_total via renderMirror (same rule the backend applies). All controls
  // in the row disable while a request is in flight (防連點/race); a failure
  // re-enables per current qty and toasts — nothing was changed client-side,
  // so there is no ghost state to roll back. Removing the last line switches
  // to the empty state (never a zero-total checkout form).
  const summaryList = $("[data-summary-list]");
  let stepBusy = false;

  const redrawFromCart = (cart: Json) => {
    renderItems(cart);
    setCartTotals(cart);
    renderMirror();
  };

  summaryList?.addEventListener("click", async (e) => {
    const target = e.target as HTMLElement;
    const btn = target.closest(
      "[data-step], [data-remove]"
    ) as HTMLButtonElement | null;
    if (!btn || btn.disabled || stepBusy) return;
    const row = btn.closest("[data-line-id]") as HTMLElement | null;
    const lineId = row?.getAttribute("data-line-id");
    if (!row || !lineId) return;

    const controls = Array.from(
      row.querySelectorAll("[data-step], [data-remove]")
    ) as HTMLButtonElement[];
    // Failure path: re-enable each control according to the (unchanged) qty —
    // a blanket enable would wrongly light dec at qty 1 / inc at 99.
    const restoreControls = () => {
      const qty = parseInt(row.querySelector("[data-qty]")?.textContent || "1", 10) || 1;
      controls.forEach((b) => {
        if (b.hasAttribute("data-remove")) b.disabled = false;
        else if (b.getAttribute("data-step") === "dec") b.disabled = qty <= 1;
        else b.disabled = qty >= 99;
      });
    };

    const isRemove = btn.hasAttribute("data-remove");
    if (!isRemove) {
      const cur = parseInt(row.querySelector("[data-qty]")?.textContent || "1", 10) || 1;
      const next = btn.getAttribute("data-step") === "inc" ? cur + 1 : cur - 1;
      if (next < 1 || next > 99) return; // 下限 1、上限 99（backend cap）

      stepBusy = true;
      controls.forEach((b) => (b.disabled = true));
      const r = await patchLineQty(lineId, next);
      stepBusy = false;

      if (r && r.ok && r.data) {
        redrawFromCart(r.data);
      } else {
        restoreControls();
        showToast("數量更新失敗，請再試一次", { variant: "error" });
      }
      return;
    }

    // 移除 path
    stepBusy = true;
    controls.forEach((b) => (b.disabled = true));
    const r = await deleteLine(lineId);
    stepBusy = false;

    if (r && r.ok && r.data) {
      if (!(r.data.items || []).length) {
        // Last line removed — leave the checkout form entirely.
        setView("empty");
        return;
      }
      redrawFromCart(r.data);
    } else {
      restoreControls();
      showToast("移除商品失敗，請再試一次", { variant: "error" });
    }
  });

  // --- promo code (promo-checkout-v1) -----------------------------------------
  // Reuses cart.ts applyPromotion/removePromotion (POST|DELETE /cart/:id/
  // promotion). The server returns the whole recalculated cart; we redraw from
  // it and never compute the discount locally. Two visual states: an input row
  // (default, expanded) and a single-line chip once a code is applied.
  const promoInputRow = $("[data-promo-input-row]");
  const promoInput = $("[data-promo-input]") as HTMLInputElement | null;
  const promoApplyBtn = $("[data-promo-apply]") as HTMLButtonElement | null;
  const promoChip = $("[data-promo-chip]");
  const promoChipCode = $("[data-promo-chip-code]");
  const promoChipAmount = $("[data-promo-chip-amount]");
  const promoRemoveBtn = $("[data-promo-remove]") as HTMLButtonElement | null;
  const promoError = $("[data-promo-error]");
  let promoBusy = false;

  // Unified status line under the promo field (feedback-v1): one element, colour
  // switched by class — muted for the 已套用 confirmation, red for a failure
  // (server error_message verbatim). Never toggles display: the row reserves a
  // line via min-height in CSS, so showing/clearing the text never shifts the
  // summary. kind "" clears both text and colour.
  const setPromoStatus = (msg: string, kind: "success" | "error" | "") => {
    if (!promoError) return;
    promoError.textContent = msg || "";
    promoError.classList.toggle("is-success", kind === "success");
    promoError.classList.toggle("is-error", kind === "error");
  };

  const renderPromoState = (cart: Json) => {
    const code = cart?.promotion_code || null;
    const applied = !!code;
    if (promoInputRow) promoInputRow.style.display = applied ? "none" : "";
    if (promoChip) promoChip.style.display = applied ? "flex" : "none";
    if (applied) {
      if (promoChipCode) promoChipCode.textContent = code;
      // Chip 折抵: the discounted amount when there is one, else 免運 for a
      // free_shipping coupon (whose discount_total is 0 by constraint).
      const dt = cart.discount_total || 0;
      const freeShip = (cart.discounts ?? []).some(
        (d: Json) => d?.type === "free_shipping"
      );
      if (promoChipAmount)
        promoChipAmount.textContent = dt > 0 ? `− ${fmt(dt)}` : freeShip ? "免運" : "";
    } else if (promoInput) {
      promoInput.value = "";
    }
  };

  const applyPromoCode = async () => {
    if (promoBusy) return;
    // Case-sensitive by decision: a code configured upper-case must be typed
    // upper-case; lower-case should fail. So trim only — no case folding. A
    // lower-case entry then fails the upper-case-only pre-check below.
    const code = (promoInput?.value || "").trim();
    if (!code) {
      setPromoStatus("請輸入折扣碼", "error");
      return;
    }
    // Front-end format pre-check mirroring the DB constraint
    // promotions_code_format_chk (^[A-Z0-9]{4,20}$). Without it a malformed code
    // (e.g. "123") is rejected by the schema layer with a generic "輸入驗證失敗"
    // before it reaches the promotion logic — meaningless to the customer, and a
    // wasted round-trip. Only well-formed codes hit the API, whose per-reason
    // error_message (不存在 / 已過期 / 已停用 / 未達門檻 / 已使用過) we surface
    // verbatim below.
    if (!/^[A-Z0-9]{4,20}$/.test(code)) {
      setPromoStatus("查無此優惠代碼，請重新輸入", "error");
      return;
    }
    promoBusy = true;
    if (promoApplyBtn) promoApplyBtn.disabled = true;
    setPromoStatus("", "");
    const r = await applyPromotion(code);
    promoBusy = false;
    if (promoApplyBtn) promoApplyBtn.disabled = false;
    if (r && r.ok && r.data) {
      redrawFromCart(r.data);
      renderPromoState(r.data);
      // Fixed front-end confirmation (muted); the discounted amount itself is
      // shown on the 折扣 row above.
      setPromoStatus("已成功套用優惠代碼", "success");
    } else {
      // The RPC already returns a 正體中文 message keyed to the actual reason
      // (不存在 / 已過期 / 已停用 / 未達門檻 / 已使用過 …) — surface it verbatim in
      // red. No front-end i18n map, no hard-coded reason (that would mask the
      // real one). Input keeps its value so it can be corrected.
      setPromoStatus(
        r?.error?.message || r?.error?.error_message || "折扣碼無法使用，請確認後再試。",
        "error"
      );
    }
  };

  const removePromoCode = async () => {
    if (promoBusy) return;
    promoBusy = true;
    if (promoRemoveBtn) promoRemoveBtn.disabled = true;
    setPromoStatus("", "");
    const r = await removePromotion();
    promoBusy = false;
    if (promoRemoveBtn) promoRemoveBtn.disabled = false;
    if (r && r.ok && r.data) {
      redrawFromCart(r.data);
      renderPromoState(r.data);
      // 移除成功 → status stays cleared (set to "" above).
    } else {
      setPromoStatus("移除折扣碼失敗，請再試一次", "error");
    }
  };

  promoApplyBtn?.addEventListener("click", applyPromoCode);
  promoRemoveBtn?.addEventListener("click", removePromoCode);
  promoInput?.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Enter") {
      e.preventDefault();
      applyPromoCode();
    }
  });

  // --- ECPay CVS store picker --------------------------------------------------
  const cvsBox = $("[data-cvs-box]");
  const homeBox = $("[data-home-box]");
  const cvsErr = $("[data-cvs-error]");
  const cvsSelected = $("[data-cvs-selected]");
  const pickBtn = $("[data-cvs-pick]") as HTMLButtonElement | null;

  const selectedShippingMethod = (): string | null =>
    (document.querySelector('input[name="shipping"]:checked') as HTMLInputElement | null)
      ?.value ?? null;
  const cvsTypeFor = (method: string | null): string | null =>
    method && method.startsWith("cvs_") ? CVS_SUBTYPE[method] ?? null : null;
  const isHomeMethod = isHomeShippingMethod;

  const setCvsError = (msg: string) => {
    if (cvsErr) {
      cvsErr.textContent = msg || "";
      msg ? show(cvsErr) : hide(cvsErr);
    }
  };

  // NB: toggle visibility via inline `style.display`, NOT the `hidden` attribute.
  // Both .cvs-box and .cvs-selected carry author `display` rules (grid), which
  // win over the UA `[hidden]{display:none}`, so `hidden` would be a no-op here
  // (same trap setView() works around for the form/empty states).
  const renderStore = () => {
    const nameEl = $("[data-cvs-store-name]");
    const metaEl = $("[data-cvs-store-meta]");
    if (selectedStore) {
      if (nameEl) nameEl.textContent = selectedStore.store_name || "已選門市";
      if (metaEl)
        metaEl.textContent = `店號 ${selectedStore.store_id}　${selectedStore.store_address}`;
      if (cvsSelected) cvsSelected.style.display = "";
      if (pickBtn) pickBtn.textContent = "重新選擇門市";
    } else {
      if (cvsSelected) cvsSelected.style.display = "none";
      if (pickBtn) pickBtn.textContent = "選擇門市";
    }
  };

  // One handler owns both conditional boxes: the CVS picker and the home
  // address fields are alternates, so toggling them apart is how they stay
  // mutually exclusive. A method that is neither (should not exist) shows
  // neither, which fails closed at /checkout/init rather than posting a half
  // form.
  const syncShippingUi = () => {
    const method = selectedShippingMethod();
    const cvsType = cvsTypeFor(method);
    if (cvsBox) cvsBox.style.display = cvsType ? "" : "none";
    if (pickBtn) pickBtn.disabled = !cvsType;
    if (homeBox) homeBox.style.display = isHomeMethod(method) ? "" : "none";
  };

  const apiOrigin = (cfg().apiBase || "").replace(/\/$/, "");
  let cancelWatch: (() => void) | null = null;

  // POLLING-ONLY. The backend callback writes the chosen store to
  // cvs_selections server-side regardless of whether its own postMessage /
  // window.close could run — and in this cross-domain redirect chain
  // window.opener is frequently null, so the callback's postMessage + self-close
  // are unreliable. So we drive it from the opener: poll cvs-selection every ~1s,
  // render the row, and close the popup ourselves (the opener can always close a
  // popup it opened). postMessage is kept only as an optional fast path.
  //
  // We deliberately NEVER read popup.closed for abandonment. A COOP
  // browsing-context-group swap during the ECPay redirect chain nulls
  // window.opener and drops the parent's popup handle, so popup.closed keeps
  // returning true even while the window is open — that is exactly what produced
  // the old false "you closed the picker" errors. Manual close and COOP-drop are
  // indistinguishable (both look closed), so we ignore the signal entirely: a
  // still-open window just keeps polling; a genuinely closed one keeps polling
  // harmlessly until the 5-min backstop. The only success path is a `selected`
  // row; the only message shown is the neutral backstop timeout.
  const watchPicker = (popup: Window, tradeNo: string, cvsType: string) => {
    let done = false;
    let poll = 0 as any; // handle of the single in-flight poll timer
    let timeout = 0 as any; // 5-min backstop

    const POLL_MS = 1000;

    // R9: idempotent + re-entrant. Safe to call any number of times; tears down
    // the message listener + both timers and releases the cancelWatch slot.
    const stop = () => {
      done = true;
      window.removeEventListener("message", onMsg);
      clearTimeout(poll);
      clearTimeout(timeout);
      if (cancelWatch === stop) cancelWatch = null;
    };
    const closePopup = () => {
      try {
        if (popup && !popup.closed) popup.close();
      } catch {
        /* opener may not be allowed to close after manual interaction */
      }
    };
    const succeed = (store: CvsStore) => {
      if (done) return;
      stop();
      closePopup();
      selectedStore = store;
      renderStore();
      setCvsError("");
    };
    // message fast-path (origin + tradeNo checked) — same succeed().
    const onMsg = (e: MessageEvent) => {
      if (apiOrigin && e.origin !== apiOrigin) return; // anti-spoof
      const d: any = e.data;
      if (!d || d.type !== "CVS_STORE_SELECTED") return;
      if (d.tradeNo && d.tradeNo !== tradeNo) return;
      succeed({
        cvs_type: cvsType,
        store_id: String(d.storeId || ""),
        store_name: String(d.storeName || ""),
        store_address: String(d.storeAddress || ""),
      });
    };
    window.addEventListener("message", onMsg);

    // R2: the ONLY success path — a `selected` row with a store_id.
    const selectedFromRow = (q: any) =>
      q.ok && q.data?.status === "selected" && q.data?.store_id;

    // R2: single in-flight timer, recursive setTimeout, no overlap. Each tick
    // only checks for a selected row; nothing else can end the poll except
    // success (succeed) or the backstop.
    const tick = async () => {
      if (done) return;
      const q = await merchantFetch(
        `/logistics/cvs-selection/${encodeURIComponent(tradeNo)}`
      );
      if (done) return;
      if (selectedFromRow(q)) {
        succeed({
          cvs_type: cvsType,
          store_id: String(q.data.store_id),
          store_name: String(q.data.store_name || ""),
          store_address: String(q.data.store_address || ""),
        });
        return;
      }
      poll = setTimeout(tick, POLL_MS);
    };
    poll = setTimeout(tick, POLL_MS);

    // The ONLY path that ever surfaces a message. Neutral wording — we
    // cannot tell "closed without picking" from "COOP dropped the handle", so
    // we never blame the user for closing the window.
    timeout = setTimeout(() => {
      if (done) return;
      stop();
      closePopup();
      setCvsError("尚未收到門市資訊，請重新選擇。");
    }, 5 * 60 * 1000);

    cancelWatch = stop;
  };

  // window.open MUST run synchronously in the click handler or the popup is
  // blocked; form_html is written in once the POST resolves.
  const openPicker = async () => {
    // R7: unconditionally tear down the previous round FIRST — its poll+timeout
    // timers, message listener, and any residual error/notice text — before any
    // new window/init. cancelWatch === the prior watch's idempotent stop().
    if (cancelWatch) cancelWatch();
    setCvsError("");
    const cvsType = cvsTypeFor(selectedShippingMethod());
    if (!cvsType) {
      setCvsError("請先選擇超商取貨方式。");
      return;
    }
    const popup = window.open("", "cvsMap", "width=980,height=720,menubar=no,toolbar=no");
    if (!popup) {
      setCvsError("請允許彈出視窗才能選擇門市。");
      return;
    }
    // R8: this round has actually started — drop any previously carried-back
    // store card now. A store only reappears once THIS round polls a selected
    // row (succeed → renderStore), never from stale state.
    selectedStore = null;
    renderStore();
    try {
      popup.document.write(
        "<p style='font-family:sans-serif;padding:40px;text-align:center'>正在開啟超商選店地圖…</p>"
      );
    } catch {
      /* about:blank write can race; ignore */
    }
    const payment = (
      document.querySelector('input[name="payment"]:checked') as HTMLInputElement | null
    )?.value;
    const r = await merchantFetch("/logistics/cvs-map", {
      method: "POST",
      body: { cvs_type: cvsType, is_collection: payment === "cod" },
    });
    if (!r.ok || !r.data?.form_html) {
      try {
        popup.close();
      } catch {}
      setCvsError(
        `選店服務暫時無法使用${r.error?.code ? `（${r.error.code}）` : ""}，請稍後再試。`
      );
      return;
    }
    try {
      popup.document.open();
      popup.document.write(r.data.form_html);
      popup.document.close();
    } catch {
      setCvsError("無法載入選店地圖，請稍後再試。");
      return;
    }
    watchPicker(popup, r.data.trade_no, cvsType);
  };

  pickBtn?.addEventListener("click", openPicker);

  // --- invoice selector visibility ---
  const invoiceType = $("[data-invoice-type]") as HTMLSelectElement | null;
  invoiceType?.addEventListener("change", () => updateInvoiceFields(invoiceType.value));
  if (invoiceType) updateInvoiceFields(invoiceType.value);

  // Shipping method change → re-mirror, and (a CVS store is method-specific) drop
  // any prior selection and refresh the picker UI to force a re-pick.
  document.querySelectorAll('input[name="shipping"]').forEach((el) => {
    el.addEventListener("change", () => {
      if (cancelWatch) cancelWatch(); // abort an in-flight pick for the old method
      selectedStore = null;
      setCvsError("");
      renderStore();
      syncShippingUi();
      renderMirror();
    });
  });
  syncShippingUi();
  renderStore();

  // --- single button: init → confirm in one sequence ---
  $("[data-confirm]")?.addEventListener("click", async (e) => {
    e.preventDefault();
    setError("");
    const btn = e.currentTarget as HTMLButtonElement;

    // Validate everything up front so we never fire init on a bad form.
    const built = buildInitBody();
    if (!built.ok) {
      setError(built.message!);
      return;
    }
    const invoice = buildInvoiceInfo();
    if (!invoice.ok) {
      setError(invoice.message!);
      return;
    }

    const label = btn.textContent;
    let navigating = false;
    btn.disabled = true;
    btn.textContent = "處理中…";
    try {
      // step 1 — init: server recalculates and returns the authoritative amounts.
      const initRes = await authedFetch("/v1/storefront/checkout/init", {
        method: "POST",
        body: built.body,
      });
      if (!initRes.ok) {
        setError(humanizeError(initRes));
        return;
      }
      // Sync the summary to the exact backend numbers before submitting.
      setAmounts(initRes.data.amounts);
      const expected = initRes.data.amounts.grand_total;

      // step 2 — confirm: carries expected_grand_total; backend re-checks it.
      // The session's first-touch UTM
      // rides the order-creating request — attached only when one exists, so
      // no-ad traffic keeps the exact pre-UTM payload shape.
      const utmData = sanitizeUtmForOrder(getUtm());
      // The referral visitor token written by the /r/<code> landing page
      // token（localStorage, 32-hex）跟單 — server 端自己驗窗/自推/開關，
      // 前端只透傳。utm_data 同款「歸因永不擋單」姿勢。
      let affToken: string | null = null;
      try {
        const raw = localStorage.getItem(storageKey("affiliate_visitor"));
        if (raw && /^[0-9a-f]{32}$/.test(raw)) affToken = raw;
      } catch {
        /* storage 拒絕（隱私模式）→ 無歸因 */
      }
      const confirmBody: Record<string, unknown> = {
        cart_id: cartId(),
        session_id: getSessionId(),
        expected_grand_total: expected,
        invoice_info: invoice.value,
        ...(utmData ? { utm_data: utmData } : {}),
        ...(affToken ? { aff_token: affToken } : {}),
      };
      let r = await authedFetch("/v1/storefront/checkout/confirm", {
        method: "POST",
        body: confirmBody,
      });
      if (!r.ok && (utmData || affToken) && r.error?.code === "VALIDATION_ERROR") {
        // 相容退路：confirm 的 schema 在對應寫入端（utm_data / referral
        // aff_token）部署前是 strict、不認識歸因欄位 — 歸因永遠不准擋單，
        // 剝掉後原樣重送一次。寫入端上線後這條路自然歸零；留著作為永久防線
        // （歸因欄位 vs 結帳成功，永遠犧牲前者）。
        const { utm_data: _dropped, aff_token: _dropped2, ...withoutAttribution } = confirmBody;
        r = await authedFetch("/v1/storefront/checkout/confirm", {
          method: "POST",
          body: withoutAttribution,
        });
      }
      if (!r.ok) {
        if (r.error?.code === "AMOUNT_MISMATCH") {
          // Never force it through (鐵律 #1). Re-sync the display from a fresh
          // init and ask the user to confirm the updated number.
          const re = await authedFetch("/v1/storefront/checkout/init", {
            method: "POST",
            body: built.body,
          });
          if (re.ok) setAmounts(re.data.amounts);
          setError("金額有更新，請再確認後送出。");
          return;
        }
        setError(humanizeError(r));
        return;
      }
      const next = r.data.next_action;
      if (next?.type === "complete") {
        const order = r.data.order;
        const token = r.data.order_token;
        localStorage.removeItem(LS_CART); // cart is now completed
        navigating = true;
        const url =
          `/checkout/complete?order_id=${encodeURIComponent(order.id)}` +
          (token ? `&order_token=${encodeURIComponent(token)}` : "");
        window.location.href = url;
        return;
      }
      // ATM / CVS — the backend returns an auto-submit ECPay form. Render it so
      // the browser POSTs to ECPay's 取號 page; ECPay later redirects the
      // customer back to /checkout/complete (with an order_token) via the
      // worker's /payment/return bridge.
      if (next?.type === "ecpay_redirect" && typeof next.html === "string") {
        navigating = true;
        localStorage.removeItem(LS_CART); // cart is now an order
        document.open();
        document.write(next.html);
        document.close();
        return;
      }
      setError("付款啟動失敗，請稍後再試或改用貨到付款。");
    } finally {
      // Leave the button disabled while the browser navigates to /complete.
      if (!navigating) {
        btn.disabled = false;
        btn.textContent = label;
      }
    }
  });
}

// --- form builders -----------------------------------------------------------

/**
 * 宅配收件地址 (spec-checkout-home-address-v1).
 *
 * `recipient_name` and `phone` are NOT their own inputs — they are the contact
 * section's name and phone, which every order needs regardless of shipping
 * method. Two sets of recipient fields is two things to keep in step and one
 * more way for a parcel to carry a different name than the order.
 *
 * ⚠️ The詳細地址 input is `name="address_line1"` (an autofill hint, matching
 * `autocomplete="address-line1"`) but the API field is `address_line`. They are
 * deliberately different and must not be "tidied up" into agreement: the first
 * is what the browser reads, the second is what the backend accepts.
 */
function buildShippingAddress(
  recipientName: string,
  phone: string,
): { ok: boolean; address?: Json; message?: string } {
  const field = (selector: string): string =>
    (($(selector) as HTMLInputElement | null)?.value ?? "").trim();

  const city = field("[data-addr-city]");
  const district = field("[data-addr-district]");
  const addressLine = field("[data-addr-line]");
  const postalCode = field("[data-addr-postal]");

  // Recipient name/phone are already validated by the contact section; re-check
  // rather than assume, because this function decides what gets shipped where.
  if (!recipientName || recipientName.length > 50)
    return { ok: false, message: "請填寫收件人姓名。" };
  if (!phone) return { ok: false, message: "請填寫收件人手機號碼。" };
  if (!city) return { ok: false, message: "請填寫收件地址的縣市。" };
  if (!district) return { ok: false, message: "請填寫收件地址的鄉鎮市區。" };
  if (!addressLine) return { ok: false, message: "請填寫詳細地址。" };
  if (!/^\d{3,6}$/.test(postalCode))
    return { ok: false, message: "請填寫正確的郵遞區號（3-6 碼數字）。" };

  return {
    ok: true,
    address: {
      recipient_name: recipientName,
      phone,
      city,
      district,
      address_line: addressLine,
      postal_code: postalCode,
    },
  };
}

function buildInitBody(): { ok: boolean; body?: Json; message?: string } {
  const name = (($("[data-ci-name]") as HTMLInputElement)?.value ?? "").trim();
  const phone = (($("[data-ci-phone]") as HTMLInputElement)?.value ?? "").trim();
  const email = (($("[data-ci-email]") as HTMLInputElement)?.value ?? "").trim();
  if (!name) return { ok: false, message: "請填寫收件人姓名。" };
  if (!/^09\d{8}$/.test(phone.replace(/\D/g, "")))
    return { ok: false, message: "請填寫正確的台灣手機號碼（09XXXXXXXX）。" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return { ok: false, message: "請填寫正確的 Email。" };

  const shipping = (
    document.querySelector('input[name="shipping"]:checked') as HTMLInputElement | null
  )?.value;
  if (!shipping) return { ok: false, message: "請選擇配送方式。" };

  const paymentInput = document.querySelector(
    'input[name="payment"]:checked:not(:disabled)'
  ) as HTMLInputElement | null;
  const payment = paymentInput?.value;
  if (!payment) return { ok: false, message: "請選擇付款方式。" };
  // COD (internal) + ECPay credit/atm/cvs are all wired end-to-end. credit runs
  // through the same ecpay_redirect path as atm/cvs (backend provider=ecpay).
  if (!["cod", "credit", "atm", "cvs"].includes(payment))
    return { ok: false, message: "請選擇有效的付款方式。" };

  const body: Json = {
    cart_id: cartId(),
    session_id: getSessionId(),
    shipping_method: shipping,
    customer_info: { name, phone: phone.replace(/\D/g, ""), email },
    payment_method: payment,
  };

  if (shipping.startsWith("cvs_")) {
    const expectedType = CVS_SUBTYPE[shipping] ?? "";
    if (!selectedStore || selectedStore.cvs_type !== expectedType)
      return { ok: false, message: "請先點「選擇門市」挑選取貨門市。" };
    body.cvs_store = {
      store_id: selectedStore.store_id,
      store_name: selectedStore.store_name,
      store_address: selectedStore.store_address,
      ...(expectedType ? { cvs_type: expectedType } : {}),
    };
  }
  if (isHomeShippingMethod(shipping)) {
    const address = buildShippingAddress(name, phone.replace(/[^0-9]/g, ""));
    if (!address.ok) return { ok: false, message: address.message };
    body.shipping_address = address.address;
  }

  return { ok: true, body };
}

function buildInvoiceInfo(): { ok: boolean; value?: Json; message?: string } {
  const type = ($("[data-invoice-type]") as HTMLSelectElement | null)?.value;
  if (!type) return { ok: true, value: null };

  if (type === "phone_barcode" || type === "citizen" || type === "member") {
    let num = (($("[data-invoice-carrier]") as HTMLInputElement)?.value ?? "").trim();
    if (type === "phone_barcode") {
      num = num.toUpperCase();
      if (!/^\/[A-Z0-9.+\-]{7}$/.test(num))
        return { ok: false, message: "手機條碼格式錯誤（例：/ABC1234，斜線後 7 碼）。" };
    } else if (type === "citizen") {
      num = num.toUpperCase();
      if (!/^[A-Z]{2}\d{14}$/.test(num))
        return { ok: false, message: "自然人憑證格式錯誤（2 碼英文 + 14 碼數字）。" };
    }
    // member: carrier_number optional (backend auto-fills from member profile).
    return {
      ok: true,
      value: {
        type: "personal",
        carrier_type: type,
        carrier_number: num || null,
      },
    };
  }

  if (type === "company") {
    const id = (($("[data-invoice-buyer-id]") as HTMLInputElement)?.value ?? "").trim();
    const name = (($("[data-invoice-buyer-name]") as HTMLInputElement)?.value ?? "").trim();
    if (!/^\d{8}$/.test(id)) return { ok: false, message: "統一編號需為 8 碼數字。" };
    if (!name) return { ok: false, message: "請填寫公司抬頭。" };
    return { ok: true, value: { type: "company", buyer_identifier: id, buyer_name: name } };
  }

  // donation
  const code = (($("[data-invoice-donation]") as HTMLInputElement)?.value ?? "").trim();
  if (!/^\d{3,7}$/.test(code)) return { ok: false, message: "愛心碼需為 3–7 碼數字。" };
  return { ok: true, value: { type: "donation", donation_code: code } };
}

// Show only the fields the chosen invoice type needs, and clear every other
// type's value so a prior 統編/條碼/愛心碼 can't linger in the DOM or ride the
// send payload (buildInvoiceInfo is already type-driven, this is the belt-and-
// braces the spec asks for). Toggled via inline display, NOT the [hidden]
// attribute — author `display:grid` on label/.field-grid beats [hidden].
//   member  (雲端預設) → note only, no input   phone_barcode/citizen → carrier
//   company → 統編 + 抬頭                        donation → 愛心碼
function updateInvoiceFields(type: string) {
  const memberNote = $('[data-invoice-field="member"]');
  const carrier = $('[data-invoice-field="carrier"]');
  const company = $('[data-invoice-field="company"]');
  const donation = $('[data-invoice-field="donation"]');
  const showCarrier = type === "phone_barcode" || type === "citizen";

  const toggle = (el: HTMLElement | null, on: boolean) => {
    if (el) el.style.display = on ? "" : "none";
  };
  toggle(memberNote, type === "member");
  toggle(carrier, showCarrier);
  toggle(company, type === "company");
  toggle(donation, type === "donation");

  const carrierInput = $("[data-invoice-carrier]") as HTMLInputElement | null;
  const carrierLabel = $("[data-invoice-carrier-label]");
  if (showCarrier) {
    if (carrierLabel)
      carrierLabel.textContent =
        type === "phone_barcode" ? "手機條碼（/ 開頭 8 碼）" : "自然人憑證號碼";
    if (carrierInput)
      carrierInput.placeholder =
        type === "phone_barcode" ? "/ABC1234" : "AB12345678901234";
  }

  // Clear the now-hidden fields' values (切換即清).
  const buyerId = $("[data-invoice-buyer-id]") as HTMLInputElement | null;
  const buyerName = $("[data-invoice-buyer-name]") as HTMLInputElement | null;
  const donationInput = $("[data-invoice-donation]") as HTMLInputElement | null;
  if (!showCarrier && carrierInput) carrierInput.value = "";
  if (type !== "company") {
    if (buyerId) buyerId.value = "";
    if (buyerName) buyerName.value = "";
  }
  if (type !== "donation") {
    if (donationInput) donationInput.value = "";
  } else if (donationInput && !donationInput.value) {
    donationInput.value = "025"; // restore the common default on re-entry
  }
}

// --- summary rendering -------------------------------------------------------

// Per-item summary row (spec checkout_summary_layout_0717):
//   [ 1:1 thumb ] [ name + spec (≤2 lines, truncated) ]
//                 [ row price      ] [ − qty + stepper ]
// All text/number values come straight from the (server-authoritative) cart
// line — never re-computed here. Built with DOM APIs + textContent so product
// titles / variant names can't inject markup.
function renderItems(cart: Json) {
  const list = $("[data-summary-list]");
  if (!list) return;
  list.innerHTML = "";
  for (const it of cart.items || []) {
    const qty = Number(it.quantity) || 1;

    const row = document.createElement("div");
    row.className = "summary-item";
    row.setAttribute("data-line-id", it.line_id);

    // 1 — square thumbnail (image_url is snapshotted onto the cart line at
    // add-time; null legacy lines fall back to the droplet placeholder).
    const thumb = document.createElement("div");
    thumb.className = "si-thumb";
    const src = it.image_url || "";
    if (src) {
      const img = document.createElement("img");
      img.src = src;
      img.alt = it.product_title || "";
      img.loading = "lazy";
      thumb.appendChild(img);
    } else {
      thumb.classList.add("is-empty");
      thumb.innerHTML = THUMB_FALLBACK_SVG;
    }

    const main = document.createElement("div");
    main.className = "si-main";

    // 2 — product name (+ spec when not the default variant).
    const name = document.createElement("p");
    name.className = "si-name";
    name.textContent = it.product_title || "";
    const variant = variantLabel(it.variant_title);
    if (variant) {
      const vspan = document.createElement("span");
      vspan.className = "si-variant";
      vspan.textContent = variant;
      name.appendChild(vspan);
    }

    // 3 / 4 — row price + quantity stepper.
    const line = document.createElement("div");
    line.className = "si-row";

    const price = document.createElement("strong");
    price.className = "si-price";
    price.textContent = fmt(it.line_subtotal);

    const stepper = document.createElement("div");
    stepper.className = "si-stepper";
    const dec = document.createElement("button");
    dec.type = "button";
    dec.className = "si-step";
    dec.setAttribute("data-step", "dec");
    dec.setAttribute("aria-label", "減少數量");
    dec.textContent = "−";
    dec.disabled = qty <= 1; // 下限 1 — removal goes through the 移除 button
    const qtyEl = document.createElement("span");
    qtyEl.className = "si-qty";
    qtyEl.setAttribute("data-qty", "");
    qtyEl.textContent = String(qty);
    const inc = document.createElement("button");
    inc.type = "button";
    inc.className = "si-step";
    inc.setAttribute("data-step", "inc");
    inc.setAttribute("aria-label", "增加數量");
    inc.textContent = "+";
    inc.disabled = qty >= 99; // backend max quantity
    stepper.append(dec, qtyEl, inc);

    // D1 — per-row removal affordance (works at any qty, incl. 1 where the
    // dec button is disabled). Native <button> → keyboard operable; the
    // accessible name carries the product so SR users know what goes.
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "si-remove";
    removeBtn.setAttribute("data-remove", "");
    removeBtn.setAttribute("aria-label", `移除 ${it.product_title || "商品"}`);
    removeBtn.title = "移除商品";
    removeBtn.innerHTML = TRASH_SVG;

    // Group stepper + remove so .si-row's space-between keeps price left /
    // controls right (three loose children would spread evenly instead).
    const controls = document.createElement("div");
    controls.className = "si-controls";
    controls.append(stepper, removeBtn);

    line.append(price, controls);
    main.append(name, line);
    row.append(thumb, main);
    list.appendChild(row);
  }
}

function setAmounts(a: Json) {
  const set = (sel: string, txt: string) => {
    const el = $(sel);
    if (el) el.textContent = txt;
  };
  set("[data-field-items-total]", fmt(a.items_total));
  set("[data-field-shipping]", fmt(a.shipping_fee_total));
  set("[data-field-grand]", fmt(a.grand_total));

  // Discount row renders only when a code actually reduces the item total
  // (never a "- 0" residue; a free_shipping coupon shows as 0 on
  // the 運費 row instead). Label carries the applied code when we have it:
  // e.g.「折扣 (WELCOME10)」.
  const discountRow = $("[data-discount-row]");
  const discount = a.discount_total || 0;
  if (discountRow) {
    if (discount > 0) {
      set("[data-field-discount]", `- ${fmt(discount)}`);
      set("[data-discount-label]", a.promotion_code ? `折扣 (${a.promotion_code})` : "折扣");
      discountRow.style.display = "";
    } else {
      discountRow.style.display = "none";
    }
  }
}

function humanizeError(r: { status: number; error: Json }): string {
  const code = r.error?.code;
  const map: Record<string, string> = {
    AMOUNT_MISMATCH: "金額有更新，請再確認後送出。",
    CART_EMPTY: "購物車是空的。",
    OUT_OF_STOCK: "部分商品庫存不足，請調整購物車。",
    CVS_STORE_REQUIRED: "請選擇取貨門市。",
    SHIPPING_METHOD_INVALID: "配送方式無效。",
    PAYMENT_METHOD_INVALID: "付款方式無效。",
    INVALID_CUSTOMER_INFO: "聯絡資訊格式有誤，請檢查。",
    INVALID_INVOICE_INFO: "發票資訊格式有誤，請檢查。",
    CART_ACCESS_DENIED: "購物車存取被拒，請重新登入。",
    CART_NOT_INITIALIZED: "請稍候再試。",
  };
  return map[code] || r.error?.message || "操作失敗，請稍後再試。";
}

// ── complete page ────────────────────────────────────────────────────────────

export function initCompletePage() {
  const root = $("[data-complete-page]") as HTMLElement | null;
  if (!root) return;
  const loadingEl = $("[data-complete-loading]");
  const errEl = $("[data-complete-error]");
  const contentEl = $("[data-complete-content]");

  const params = new URLSearchParams(window.location.search);
  const orderId = params.get("order_id");
  const orderToken = params.get("order_token");

  const showError = (msg: string) => {
    hide(loadingEl);
    if (errEl) {
      errEl.textContent = msg;
      show(errEl);
    }
  };

  if (!orderId) {
    showError("缺少訂單編號。");
    return;
  }

  (async () => {
    let path = `/v1/storefront/orders/${encodeURIComponent(orderId)}`;
    if (orderToken) path += `?order_token=${encodeURIComponent(orderToken)}`;
    const r = await authedFetch(path);
    if (!r.ok) {
      showError("無法載入訂單資訊，請稍後再試。");
      return;
    }
    renderOrder(r.data);
    hide(loadingEl);
    show(contentEl);
  })();
}

const STATUS_LABEL: Record<string, string> = {
  confirmed: "已確認",
  pending_payment: "待付款",
  paid: "已付款",
  processing: "處理中",
  shipped: "已出貨",
  completed: "已完成",
  cancelled: "已取消",
};
const PAY_LABEL: Record<string, string> = {
  cod: "貨到付款",
  credit: "信用卡",
  atm: "ATM 轉帳",
  cvs: "超商代碼繳費",
};

const PAY_STATUS_LABEL: Record<string, string> = {
  pending: "待付款",
  authorized: "已授權",
  captured: "付款成功",
  failed: "付款失敗",
  refunded: "已退款",
  partially_refunded: "部分退款",
};

type OrderState = "paid" | "pending" | "failed";

/**
 * Which of the three outcomes this order is in.
 *
 * Read off the ORDER, never inferred from the URL: the customer arrives here
 * through a gateway redirect that carries no result of its own, and the same
 * payment method reaches all three outcomes. Order-level `status` outranks the
 * payment row, because a cancelled order is not pending however its last
 * payment attempt ended.
 *
 * COD counts as `paid`: there is nothing to pay online, so the order being
 * placed IS the outcome. The wording is adjusted by the 貨到付款 note rather
 * than by inventing a fourth state.
 */
function deriveOrderState(o: Json): OrderState {
  const status = String(o.status ?? "");
  const payStatus = String(o.payment?.status ?? o.payment_status ?? "");

  if (status === "cancelled" || payStatus === "failed") return "failed";
  if (o.paid_at || payStatus === "captured" || payStatus === "authorized") return "paid";
  // No payment row at all — COD, which the backend does not route to a gateway.
  if (!o.payment || o.payment.method === "cod") return "paid";
  return "pending";
}

/** `2025 / 05 / 12　14:30`, in the shop's locale. Blank input stays a dash. */
function orderDate(iso: unknown): string {
  if (typeof iso !== "string" || !iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()} / ${pad(d.getMonth() + 1)} / ${pad(d.getDate())}　${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function renderOrder(o: Json) {
  const set = (sel: string, txt: string) => {
    const el = $(sel);
    if (el) el.textContent = txt;
  };
  const toggle = (sel: string, on: boolean) => {
    const el = $(sel) as HTMLElement | null;
    if (el) el.hidden = !on;
  };

  const state = deriveOrderState(o);
  const stateEl = $("[data-o-state]");
  if (stateEl) stateEl.className = `status is-${state}`;
  toggle("[data-o-cod-note]", state === "paid" && o.payment?.method === "cod");

  set("[data-o-number]", o.order_number ?? "—");
  set("[data-o-date]", orderDate(o.created_at));
  set("[data-o-status]", STATUS_LABEL[o.status] ?? o.status ?? "—");

  set("[data-o-payment]", PAY_LABEL[o.payment?.method] ?? o.payment?.method ?? "—");
  set("[data-o-pay-amount]", fmt(o.grand_total));
  const payStatus = String(o.payment?.status ?? o.payment_status ?? "");
  set("[data-o-pay-status]", PAY_STATUS_LABEL[payStatus] ?? (payStatus || "—"));
  toggle("[data-o-paid-at-row]", Boolean(o.paid_at));
  if (o.paid_at) set("[data-o-paid-at]", orderDate(o.paid_at));

  // Recipient and address come from the stored shipping_address; a CVS order
  // has a store instead, and its own contact rows would be blank.
  const addr = o.shipping?.address as Json;
  const store = o.shipping?.cvs_store as Json;
  set("[data-o-recipient]", addr?.recipient_name ?? store?.recipient_name ?? "—");
  set("[data-o-recipient-phone]", addr?.phone ?? store?.recipient_phone ?? "—");

  const shippingTxt = store?.store_name
    ? `${store.store_name}（${store.store_id}）${store.store_address ?? ""}`
    : o.shipping?.method ?? "—";
  set("[data-o-shipping]", shippingTxt);
  const addressTxt = addr
    ? `${addr.postal_code ?? ""} ${addr.city ?? ""}${addr.district ?? ""}${addr.address_line ?? ""}`.trim()
    : store?.store_address ?? "";
  set("[data-o-address]", addressTxt || "—");

  const list = $("[data-o-items]");
  if (list) {
    list.innerHTML = "";
    for (const it of o.items || []) {
      list.appendChild(orderItemRow(it));
    }
  }
  set("[data-o-items-total]", fmt(o.items_total));
  set("[data-o-shipping-fee]", fmt(o.shipping_fee_total));
  toggle("[data-o-discount-row]", Number(o.discount_total) > 0);
  set("[data-o-discount]", `- ${fmt(o.discount_total)}`);
  set("[data-o-grand]", fmt(o.grand_total));

  renderPaymentInfo(o.payment?.payment_info as Json);
}

/** One row of the order's item table: thumb + title, unit price, qty, subtotal. */
function orderItemRow(it: Json): HTMLElement {
  const row = document.createElement("div");
  row.className = "oi-row";

  const name = document.createElement("div");
  name.className = "oi-name";
  const thumb = document.createElement("span");
  thumb.className = "oi-thumb";
  if (it.image_url) {
    const img = document.createElement("img");
    img.src = String(it.image_url);
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    thumb.appendChild(img);
  }
  const title = document.createElement("span");
  title.className = "oi-title";
  title.textContent = String(it.title ?? "");
  if (it.variant_title) {
    const variant = document.createElement("span");
    variant.className = "oi-variant";
    variant.textContent = String(it.variant_title);
    title.appendChild(variant);
  }
  name.appendChild(thumb);
  name.appendChild(title);

  const price = document.createElement("span");
  price.className = "oi-price";
  price.textContent = fmt(it.unit_price);

  const qty = document.createElement("span");
  qty.className = "oi-qty";
  qty.textContent = String(it.quantity ?? "");

  const sub = document.createElement("span");
  sub.className = "oi-sub";
  sub.textContent = fmt(it.line_subtotal);

  row.appendChild(name);
  row.appendChild(price);
  row.appendChild(qty);
  row.appendChild(sub);
  return row;
}

// ATM/CVS 取號 panel. payment_info is populated by the backend once ECPay
// returns the 取號 result (虛擬帳號 for ATM / 繳費代碼 for CVS). Absent for COD
// or before 取號 completes → the panel stays hidden.
function renderPaymentInfo(info: Json) {
  const box = $("[data-o-payinfo]") as HTMLElement | null;
  if (!box) return;
  const rows = $("[data-o-payinfo-rows]");
  const title = $("[data-o-payinfo-title]");
  const expire = $("[data-o-payinfo-expire]");
  if (!info || !rows) {
    box.hidden = true;
    return;
  }
  const pairs: Array<[string, string]> =
    info.kind === "atm"
      ? [
          ["銀行代碼", info.bank_code ?? ""],
          ["虛擬帳號", info.virtual_account ?? ""],
        ]
      : info.kind === "cvs"
        ? [["繳費代碼", info.payment_no ?? ""]]
        : [];
  const filled = pairs.filter(([, v]) => v);
  if (!filled.length) {
    box.hidden = true;
    return;
  }
  if (title) title.textContent = info.kind === "atm" ? "ATM 轉帳繳費資訊" : "超商代碼繳費資訊";
  rows.innerHTML = "";
  for (const [label, value] of filled) {
    const row = document.createElement("div");
    row.className = "payinfo-row";
    const l = document.createElement("span");
    l.textContent = label;
    const v = document.createElement("strong");
    v.textContent = value;
    row.appendChild(l);
    row.appendChild(v);
    rows.appendChild(row);
  }
  if (expire) expire.textContent = info.expire_date || "—";
  box.hidden = false;
}
