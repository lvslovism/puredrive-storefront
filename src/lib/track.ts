// Behaviour beacon. Runs in the browser; fire-and-forget writes to the
// commerce-workers events ingest (POST /v1/events, batch of 1 per call).
//
// Identity mirrors the cart/auth layer on purpose: session_id reuses
// the session id from auth.ts (not a separate key) so behavior events join
// with guest carts/orders on the same sess_* value, and merchant_code +
// apiBase come from the window config global (domain bootstrap — nothing hardcoded).
// customer_id is never sent; the backend derives it from the Bearer JWT and
// drops any body-supplied value.
//
// Failure contract: track() never throws, never rejects, never logs — a dead
// ingest endpoint must be invisible to the page.
//
// Beacon flush（快訪掉事件修復）.
// E2E 實證：純 keepalive fetch 在「快逛快關」時仍會漏事件（load 時發出的 beacon
// 尚未送出就導航離開）。改為「確認式佇列 + 隱藏時 sendBeacon flush」：
//   1. track() 先把事件入 sessionStorage 佇列，再以 keepalive fetch 送出；HTTP 2xx
//      才把該事件出列（確認送達）。
//   2. visibilitychange→hidden / pagehide 時，把仍未確認的佇列事件用
//      navigator.sendBeacon 補送（unload 期最可靠的傳輸）。
//   3. 下次載入時 drain 上一趟殘留的未確認事件（中斷 flush 的保險）。
// sendBeacon 用 text/plain Blob：text/plain 是 CORS-safelisted content-type（免
// preflight），而 server 的 c.req.json() 不看 content-type 一律當 JSON 解析 —— 兩
// 者相加讓 sendBeacon 可行（舊註解以為必須 application/json 才棄用，實為誤解）。
// 取捨：確認式出列讓重送幾乎不重複；sendBeacon 無法帶 Authorization header，故補送
// 路徑會失去 customer_id（後端仍以 session_id 落庫 + 併訪客 session）— 送達 > 去重。

import { FLUSH_FLAG } from "../../brand/identity";
import { cfg, getSessionId, getToken } from "../scripts/auth";

export type BeaconEventType =
  | "product_view"
  | "add_to_cart"
  | "remove_from_cart"
  | "begin_checkout"
  | "search";

export interface BeaconPayload {
  product_id?: string;
  variant_id?: string;
  context?: Record<string, unknown>;
}

// First-touch UTM capture: whitelisted attribution params off the landing URL,
// stashed in sessionStorage under `ap_utm`. sessionStorage (not local) is
// deliberate — a fresh tab/session starts clean, matching first-touch-per-visit;
// within a session the FIRST ad-tagged URL wins and later navigations never
// overwrite it. Every beacon then folds the stored object into context.utm.
const SS_UTM = "ap_utm";
const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "fbclid",
  "gclid",
  "ttclid",
] as const;

// Read this page's URL for whitelisted params and, only if nothing is stored yet
// (first-touch), persist them. No-op when the URL carries none. Safe to call on
// every page load and before every beacon — idempotent after the first hit.
export function captureUtm(): void {
  try {
    if (sessionStorage.getItem(SS_UTM)) return; // first-touch already fixed for this session
    const params = new URLSearchParams(window.location.search);
    const utm: Record<string, string> = {};
    for (const k of UTM_KEYS) {
      const v = params.get(k);
      if (v) utm[k] = v.slice(0, 200); // client-side length guard (server truncates too)
    }
    if (Object.keys(utm).length > 0) {
      sessionStorage.setItem(SS_UTM, JSON.stringify(utm));
    }
  } catch {
    /* private-mode / storage-disabled — attribution is best-effort */
  }
}

// Exported for the checkout client (utm-order.mjs sanitizes this into the
// order-contract shape before it rides the confirm request).
export function getUtm(): Record<string, string> | null {
  try {
    const raw = sessionStorage.getItem(SS_UTM);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// ── §A 確認式未送達佇列（sessionStorage）──────────────────────────────────
// 每筆 = { id, body }，body 為完整 POST JSON 字串。佇列上限避免異常膨脹。
const SS_QUEUE = "ap_evq";
const QUEUE_MAX = 30;

interface QueuedEvent {
  id: string;
  body: string;
}

function newId(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  // 非密碼學用途，只需低碰撞的關聯鍵；退化路徑。
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

function loadQueue(): QueuedEvent[] {
  try {
    const raw = sessionStorage.getItem(SS_QUEUE);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedEvent[]) : [];
  } catch {
    return [];
  }
}

function saveQueue(q: QueuedEvent[]): void {
  try {
    sessionStorage.setItem(SS_QUEUE, JSON.stringify(q.slice(-QUEUE_MAX)));
  } catch {
    /* storage disabled — degrade to no-persistence (immediate send still runs) */
  }
}

function enqueue(e: QueuedEvent): void {
  const q = loadQueue();
  q.push(e);
  saveQueue(q);
}

function dequeue(id: string): void {
  const q = loadQueue();
  const next = q.filter((e) => e.id !== id);
  if (next.length !== q.length) saveQueue(next);
}

function ingestUrl(): string | null {
  try {
    const { apiBase, merchantCode, demo } = cfg();
    // No merchant behind a demo build, so there is nothing to ingest into.
    if (!apiBase || !merchantCode || demo) return null;
    return `${apiBase}/v1/events`;
  } catch {
    return null;
  }
}

// keepalive fetch 送出單筆；HTTP 2xx 才出列（確認送達）。附 Authorization 讓後端
// 能推導 customer_id。永不 throw / reject。
function sendKeepalive(e: QueuedEvent): void {
  const url = ingestUrl();
  if (!url) return;
  try {
    const headers: Record<string, string> = { "content-type": "application/json" };
    const token = getToken();
    if (token) headers["authorization"] = `Bearer ${token}`;
    fetch(url, { method: "POST", keepalive: true, headers, body: e.body })
      .then((r) => {
        if (r.ok) dequeue(e.id);
      })
      .catch(() => {});
  } catch {
    /* fire-and-forget */
  }
}

// 隱藏 / 卸載時把未確認的佇列事件用 sendBeacon 補送（unload 期最可靠）。text/plain
// Blob 免 CORS preflight；送出後樂觀清空佇列（beacon 由瀏覽器保證投遞）。
function flushBeacon(): void {
  try {
    const q = loadQueue();
    if (q.length === 0) return;
    const url = ingestUrl();
    if (!url || typeof navigator === "undefined" || !navigator.sendBeacon) return;
    let allSent = true;
    for (const e of q) {
      const blob = new Blob([e.body], { type: "text/plain" });
      const ok = navigator.sendBeacon(url, blob);
      if (!ok) allSent = false; // queue full / disabled — 留在佇列等下次
    }
    if (allSent) saveQueue([]);
  } catch {
    /* best-effort */
  }
}

let flushRegistered = false;

// 掛 visibilitychange(hidden) + pagehide flush，並 drain 上一趟殘留的未確認事件。
// 冪等：多次呼叫只註冊一次。BaseLayout 每頁載入呼叫。
//
// Fast-visit fix：flush 綁定改由 <BeaconBoot /> 的 inline 腳本擁有（parse 期即
// 註冊，快訪也在）。這裡見 window[FLUSH_FLAG] 就跳過重複註冊，避免 hidden 時雙重
// flush（同一筆 ap_evq 被 sendBeacon 兩次）。
// drain-on-load 仍留在這裡：以 keepalive 重送上一趟殘留佇列，可帶 Authorization →
// 保住 customer_id（inline flush 的 sendBeacon 帶不了 auth）。
export function initBeaconFlush(): void {
  try {
    if (!flushRegistered && !(window as any)[FLUSH_FLAG]) {
      flushRegistered = true;
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") flushBeacon();
      });
      // pagehide 覆蓋 bfcache / 直接關閉；比 unload 更可靠且不阻擋 bfcache。
      window.addEventListener("pagehide", flushBeacon);
    }
    // 上一趟中斷殘留的未確認事件 → 以 keepalive 重送（可帶 auth，成功即出列）。
    // 與 flush 註冊分離：即使 inline 已綁 flush，這條 auth 重送仍要跑。
    for (const e of loadQueue()) sendKeepalive(e);
  } catch {
    /* fire-and-forget */
  }
}

export function track(eventType: BeaconEventType, payload: BeaconPayload = {}): void {
  try {
    const { apiBase, merchantCode, demo } = cfg();
    if (!apiBase || !merchantCode) return;
    // Demo builds have no merchant, so every beacon is refused by the API.
    // Failures here are silent by design, which made them worse than useless:
    // a console full of rejected posts on a storefront that has not been
    // bound yet. Nothing is measuring a demo anyway.
    if (demo) return;
    // Ensure first-touch is captured even on pages that fire a beacon before the
    // BaseLayout capture runs; no-op once the session already has one.
    captureUtm();
    const { context: rawContext, ...rest } = payload;
    const utm = getUtm();
    // Only attach context when there's something to carry — no-ad traffic keeps
    // the pre-UTM payload shape (no context key), zero regression.
    const context = utm ? { ...(rawContext || {}), utm } : rawContext;
    const body = JSON.stringify({
      merchant_code: merchantCode,
      events: [
        {
          event_type: eventType,
          session_id: getSessionId(),
          ...rest,
          ...(context ? { context } : {}),
        },
      ],
    });
    // 先入未確認佇列，再立即以 keepalive 送出；2xx 出列。快訪未送完 → 由
    // visibilitychange/pagehide 的 sendBeacon flush 補送。
    const queued: QueuedEvent = { id: newId(), body };
    enqueue(queued);
    sendKeepalive(queued);
  } catch {
    /* fire-and-forget — beacons must never affect the page */
  }
}
