// Phase 4 storefront auth + shared HTTP layer. Runs in the browser.
//
// Auth guard (verified against the live API): once a member token exists, every
// cart/* and checkout/* call MUST carry Authorization: Bearer — a member cart
// (carts.customer_id set) returns 403 CART_ACCESS_DENIED without it. So all
// cart/checkout traffic goes through authedFetch(), which injects:
//   - x-api-key: {pk}          (always; pk_live is publishable)
//   - Authorization: Bearer    (only when a token is in localStorage)
//
// Identity:
//   - guest  → session_id (sess_<uuid>) in the JSON body / ?session_id= query
//   - member → Bearer JWT (sub === cart.customer_id); session_id ignored server-side
//
// pk + apiBase + merchantCode are injected by BaseLayout into the window config
// global. Nothing here is hardcoded — both come from the merchant bootstrap.
//
// Every storage key is namespaced through storageKey() so two storefronts served
// from one host never share a cart, a token or a session.

import { storageKey, CONFIG_GLOBAL } from "../../brand/identity";

type Json = any;

const LS_SESSION = storageKey("session_id");
const LS_CART = storageKey("cart_id");
const LS_TOKEN = storageKey("token");
const LS_REDIRECT = storageKey("post_login_redirect");
const LS_STATE = storageKey("oauth_state");
const LS_NONCE = storageKey("oauth_nonce");

export function cfg(): {
  apiBase?: string;
  pk?: string;
  merchantCode?: string;
  /** brand/commerce.ts → demo.enabled, forwarded by BaseLayout. */
  demo?: boolean;
} {
  return (window as any)[CONFIG_GLOBAL] || {};
}

// --- identity / token persistence -------------------------------------------

export function getSessionId(): string {
  let s = localStorage.getItem(LS_SESSION);
  if (!s) {
    const c: any = (window as any).crypto;
    const rnd =
      c && c.randomUUID
        ? c.randomUUID().replace(/-/g, "")
        : Math.random().toString(36).slice(2) + Date.now().toString(36);
    s = `sess_${rnd}`;
    localStorage.setItem(LS_SESSION, s);
  }
  return s;
}

export function getToken(): string | null {
  return localStorage.getItem(LS_TOKEN);
}

export function setToken(t: string) {
  localStorage.setItem(LS_TOKEN, t);
}

export function clearToken() {
  localStorage.removeItem(LS_TOKEN);
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

// --- shared authenticated fetch ---------------------------------------------

export async function authedFetch(
  path: string,
  init: { method?: string; body?: Json } = {}
): Promise<{ ok: boolean; status: number; data: Json; error: Json }> {
  const { apiBase, pk } = cfg();
  const headers: Record<string, string> = { "x-api-key": pk || "" };
  const token = getToken();
  if (token) headers["authorization"] = `Bearer ${token}`;
  const opts: RequestInit = { method: init.method || "GET", headers };
  if (init.body) {
    headers["content-type"] = "application/json";
    opts.body = JSON.stringify(init.body);
  }
  try {
    const res = await fetch(`${apiBase}${path}`, opts);
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok && json.ok, status: res.status, data: json.data, error: json.error };
  } catch (e) {
    return { ok: false, status: 0, data: null, error: { message: String(e) } };
  }
}

// Logistics endpoints (e.g. POST /logistics/cvs-map) live OUTSIDE /v1/storefront
// and go through the backend's merchantAuth middleware, which wants
// `X-Merchant-Code` (NOT x-api-key) plus the member Bearer (it verifies the same
// JWT, reads sub→customerId, and rejects if the token's merchant_code ≠ header).
// Kept separate from authedFetch on purpose — different header contract.
export async function merchantFetch(
  path: string,
  init: { method?: string; body?: Json } = {}
): Promise<{ ok: boolean; status: number; data: Json; error: Json }> {
  const { apiBase, merchantCode } = cfg();
  const headers: Record<string, string> = { "x-merchant-code": merchantCode || "" };
  const token = getToken();
  if (token) headers["authorization"] = `Bearer ${token}`;
  const opts: RequestInit = { method: init.method || "GET", headers };
  if (init.body) {
    headers["content-type"] = "application/json";
    opts.body = JSON.stringify(init.body);
  }
  try {
    const res = await fetch(`${apiBase}${path}`, opts);
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok && json.ok, status: res.status, data: json.data, error: json.error };
  } catch (e) {
    return { ok: false, status: 0, data: null, error: { message: String(e) } };
  }
}

// --- LINE login --------------------------------------------------------------

function randomToken(): string {
  const c: any = (window as any).crypto;
  if (c && c.randomUUID) return c.randomUUID().replace(/-/g, "");
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Kick off LINE OAuth. Stashes state/nonce + the post-login return path, then
// 302s the browser to LINE. login-url is a public endpoint (no key, no token).
export async function startLogin(returnTo = "/") {
  const { apiBase, merchantCode } = cfg();
  const state = randomToken();
  const nonce = randomToken();
  localStorage.setItem(LS_STATE, state);
  localStorage.setItem(LS_NONCE, nonce);
  localStorage.setItem(LS_REDIRECT, returnTo);

  const url =
    `${apiBase}/v1/storefront/auth/line/login-url` +
    `?merchant_code=${encodeURIComponent(merchantCode || "")}` +
    `&state=${encodeURIComponent(state)}` +
    `&nonce=${encodeURIComponent(nonce)}`;
  try {
    const res = await fetch(url);
    const json = await res.json().catch(() => ({}));
    if (json.ok && json.data?.authorize_url) {
      window.location.href = json.data.authorize_url;
      return;
    }
  } catch {
    /* fall through */
  }
  alert("登入服務暫時無法使用，請稍後再試。");
}

// Run on /auth/callback. Verifies state, exchanges code → token, claims the
// guest cart, and returns where to send the user next.
export async function handleCallback(): Promise<{
  ok: boolean;
  redirect?: string;
  reason?: string;
  error?: Json;
}> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const state = params.get("state");
  const storedState = localStorage.getItem(LS_STATE);
  const nonce = localStorage.getItem(LS_NONCE);
  const redirect = localStorage.getItem(LS_REDIRECT) || "/";

  if (!code || !state || !storedState || state !== storedState) {
    return { ok: false, reason: "state_mismatch" };
  }

  const { apiBase, pk, merchantCode } = cfg();
  let json: Json = {};
  try {
    const res = await fetch(`${apiBase}/v1/storefront/auth/line/callback`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": pk || "" },
      body: JSON.stringify({ code, nonce, merchant_code: merchantCode }),
    });
    json = await res.json().catch(() => ({}));
  } catch (e) {
    return { ok: false, reason: "network", error: { message: String(e) } };
  }
  if (!json.ok || !json.data?.token) {
    return { ok: false, reason: "exchange_failed", error: json.error };
  }

  setToken(json.data.token);
  localStorage.removeItem(LS_STATE);
  localStorage.removeItem(LS_NONCE);
  localStorage.removeItem(LS_REDIRECT);

  await claimGuestCartIfNeeded();
  return { ok: true, redirect };
}

export async function logout() {
  try {
    await authedFetch("/v1/storefront/auth/logout", { method: "POST" });
  } catch {
    /* best-effort */
  }
  clearToken();
  // The cart we held is now a member cart (customer_id set); a logged-out guest
  // can't access it, so drop the pointer and let a fresh guest cart start.
  localStorage.removeItem(LS_CART);
}

// --- cart claim (guest cart → member) ----------------------------------------

// Idempotent: if the stored cart is already this member's, the backend returns
// success(merged:false). Safe to call on every login + before checkout.
export async function claimGuestCartIfNeeded() {
  if (!getToken()) return;
  const cartId = localStorage.getItem(LS_CART);
  const sessionId = localStorage.getItem(LS_SESSION);
  if (!cartId || !sessionId) return;

  const r = await authedFetch(`/v1/storefront/cart/${cartId}/claim`, {
    method: "POST",
    body: { session_id: sessionId },
  });
  if (r.ok && r.data?.cart?.id) {
    // Merge can keep a different surviving cart — always adopt the returned id.
    localStorage.setItem(LS_CART, r.data.cart.id);
  } else if (r.status === 404) {
    // Stale/expired guest cart that isn't ours — drop it so the next op creates
    // a fresh member cart. (Leave 409 CART_ALREADY_OWNED untouched.)
    localStorage.removeItem(LS_CART);
  }
}
