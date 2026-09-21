// Member area. Runs in the browser on /account: auth/me + me/orders, with
// me/orders/:id fetched lazily when a row is expanded. Every request carries the
// member Bearer; a 401 bounces to /login.
//
// All money values come straight from the API (integer TWD), never summed
// front-end. Visibility is driven by inline style.display (not the `hidden`
// attribute) because the account cards carry author `display` rules that would
// win over the UA `[hidden]{display:none}`.

import { formatMoney } from "../../brand/identity";
import { member } from "../../brand/copy";
import { authedFetch, isLoggedIn, clearToken, logout } from "./auth";

type Json = any;

const money = formatMoney;
function $(sel: string): HTMLElement | null {
  return document.querySelector(sel);
}
function show(el: HTMLElement | null) {
  if (el) el.style.display = "";
}
function hide(el: HTMLElement | null) {
  if (el) el.style.display = "none";
}

function fmtDay(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .format(d)
      .replace(/-/g, "/");
  } catch {
    return iso.slice(0, 10).replace(/-/g, "/");
  }
}

const STATUS_LABEL: Record<string, string> = {
  pending_payment: "待付款",
  confirmed: "已確認",
  paid: "已付款",
  processing: "處理中",
  shipped: "已出貨",
  completed: "已完成",
  cancelled: "已取消",
  refunded: "已退款",
};
const PAY_LABEL: Record<string, string> = {
  cod: "貨到付款",
  credit: "信用卡",
  atm: "ATM轉帳",
  cvs: "超商代碼",
};
const SHIP_LABEL: Record<string, string> = {
  cvs_fami: "全家超商取貨",
  cvs_hilife: "萊爾富超商取貨",
  cvs_unimart: "7-11超商取貨",
};
function shipLabel(m: string | null | undefined): string {
  if (!m) return "—";
  if (SHIP_LABEL[m]) return SHIP_LABEL[m];
  if (m.startsWith("home")) return "宅配";
  return m;
}
function payLabel(m: string | null | undefined): string {
  return (m && PAY_LABEL[m]) || m || "—";
}
function statusLabel(s: string | null | undefined): string {
  return (s && STATUS_LABEL[s]) || s || "—";
}

const SVG = {
  pencil:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 19.5h3.2L18.4 8.8a1.6 1.6 0 0 0 0-2.3l-.9-.9a1.6 1.6 0 0 0-2.3 0L4.5 16.3z"></path></svg>',
  trash:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.8 6.8h14.4"></path><path d="M9.4 6.8V5.2h5.2v1.6"></path><path d="M6.6 6.8 7.5 19a1 1 0 0 0 1 .9h7a1 1 0 0 0 1-.9l.9-12.2"></path></svg>',
};

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// Status filter pills → which order.status values fall under each pill.
// Mapping per production taxonomy (spec preflight): 待付款=pending_payment,
// 待出貨=confirmed, 已完成=shipped/completed, 全部=no filter (incl cancelled).
const STATUS_FILTERS: Record<string, ((s: string) => boolean) | null> = {
  all: null,
  pending_payment: (s) => s === "pending_payment",
  to_ship: (s) => s === "confirmed",
  done: (s) => s === "shipped" || s === "completed",
};

export function initAccountPage() {
  const root = $("[data-account-page]") as HTMLElement | null;
  if (!root) return;

  // Login wall — the member area is for members only.
  if (!isLoggedIn()) {
    window.location.replace("/login");
    return;
  }

  const loadingEl = $("[data-account-loading]");
  const errEl = $("[data-account-error]");
  const contentEl = $("[data-account-content]");
  const listEl = $("[data-order-list]");
  const emptyEl = $("[data-orders-empty]");
  const countEl = $("[data-orders-count]");

  const showError = (msg: string) => {
    hide(loadingEl);
    hide(contentEl);
    if (errEl) {
      errEl.textContent = msg;
      show(errEl);
    }
  };

  // A 401 anywhere means the token is gone/expired — reset and re-login.
  const bounceIfUnauthorized = (status: number): boolean => {
    if (status === 401) {
      clearToken();
      window.location.replace("/login");
      return true;
    }
    return false;
  };

  $("[data-logout]")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    btn.disabled = true;
    await logout();
    window.location.href = "/";
  });

  // Rendered rows kept with their status so pills filter client-side by toggling
  // display — the order-card component and its expand state are never rebuilt.
  const rows: { status: string; el: HTMLElement }[] = [];
  let activeFilter = "all";

  const applyFilter = () => {
    const pred = STATUS_FILTERS[activeFilter];
    let n = 0;
    let first = true;
    for (const r of rows) {
      const match = !pred || pred(r.status || "");
      r.el.style.display = match ? "" : "none";
      // Drop the top divider on the first *visible* row so no line sits directly
      // under the filter pills (stays correct as pills change what's shown).
      r.el.classList.toggle("is-first", match && first);
      if (match) {
        first = false;
        n++;
      }
    }
    if (countEl) countEl.textContent = `${n} 筆`;
    if (emptyEl) {
      if (rows.length === 0) {
        emptyEl.textContent = "目前還沒有訂單";
        show(emptyEl);
      } else if (n === 0) {
        emptyEl.textContent = "此分類目前沒有訂單";
        show(emptyEl);
      } else {
        hide(emptyEl);
      }
    }
  };

  for (const pill of Array.from(
    document.querySelectorAll("[data-filter]")
  ) as HTMLElement[]) {
    pill.addEventListener("click", () => {
      activeFilter = pill.getAttribute("data-filter") || "all";
      for (const p of Array.from(
        document.querySelectorAll("[data-filter]")
      ) as HTMLElement[])
        p.classList.toggle("is-active", p === pill);
      applyFilter();
    });
  }

  // Full order history — client-side filtering needs the complete set, so we
  // page through the existing API (per_page=50) rather than adding new paging UI.
  const loadAllOrders = async (): Promise<boolean> => {
    let p = 1;
    let totalPages = 1;
    do {
      const r = await authedFetch(
        `/v1/storefront/me/orders?page=${p}&per_page=50`
      );
      if (!r.ok) {
        if (bounceIfUnauthorized(r.status)) return false;
        throw new Error(r.error?.message || "orders fetch failed");
      }
      for (const o of (r.data?.orders ?? []) as Json[]) {
        const el = renderOrderRow(o, bounceIfUnauthorized);
        rows.push({ status: o.status || "", el });
        listEl?.appendChild(el);
      }
      const pg = r.data?.pagination ?? {};
      totalPages = pg.total_pages ?? 1;
      p += 1;
    } while (p <= totalPages && p <= 20); // hard cap: 20×50 = 1000 orders
    applyFilter();
    return true;
  };

  (async () => {
    try {
      const me = await authedFetch("/v1/storefront/auth/me");
      if (!me.ok) {
        if (bounceIfUnauthorized(me.status)) return;
        throw new Error(me.error?.message || "profile fetch failed");
      }
      renderProfile(me.data);
      if (!(await loadAllOrders())) return;
      hide(loadingEl);
      show(contentEl);
      initSideNav();
      // 收貨地址：best-effort、不阻塞主載入。位址簿掛了不該讓訂單也看不到。
      void initAddressBook(bounceIfUnauthorized);
      // 邀請好友卡：best-effort、不阻塞主載入。旗標關閉時卡片根本不存在，
      // 商家未啟用或請求失敗 → 整卡維持隱藏。
      void loadReferralCard();
    } catch {
      showError("無法載入會員資料，請稍後再試。");
    }
  })();
}

async function loadReferralCard() {
  const card = $("[data-referral-card]") as HTMLElement | null;
  if (!card) return;
  try {
    const r = await authedFetch("/v1/storefront/me/referral");
    if (!r.ok || !r.data?.enabled || !r.data?.code) return;
    const d = r.data;

    const codeEl = $("[data-ref-code]");
    if (codeEl) codeEl.textContent = d.code;
    const subEl = $("[data-ref-sub]");
    if (subEl) {
      subEl.textContent = `好友首購完成後，你得 ${d.referrer_points ?? 0} 點、好友得 ${d.referee_points ?? 0} 點`;
    }
    const ordersEl = $("[data-ref-orders]");
    if (ordersEl) ordersEl.textContent = String(d.stats?.referred_orders ?? 0);
    const earnedEl = $("[data-ref-earned]");
    if (earnedEl) earnedEl.textContent = String(d.stats?.points_earned ?? 0);
    const pendingEl = $("[data-ref-pending]");
    if (pendingEl) pendingEl.textContent = String(d.stats?.points_pending ?? 0);

    const shareUrl: string = d.share_url || `${location.origin}/r/${d.code}`;
    const shareText = member.referralShareText.replace("{url}", shareUrl);

    const copyBtn = $("[data-ref-copy]") as HTMLButtonElement | null;
    copyBtn?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(shareUrl);
        copyBtn.textContent = "已複製 ✓";
        setTimeout(() => (copyBtn.textContent = "複製連結"), 1600);
      } catch {
        // clipboard 被擋 — 退回 prompt 讓使用者手動複製
        window.prompt("複製你的邀請連結", shareUrl);
      }
    });

    const lineBtn = $("[data-ref-line]") as HTMLAnchorElement | null;
    if (lineBtn) {
      lineBtn.href = `https://line.me/R/share?text=${encodeURIComponent(shareText)}`;
    }

    card.style.display = "";
  } catch {
    /* 卡片維持隱藏 */
  }
}

function renderProfile(m: Json) {
  // Plain display_name, no greeting suffix.
  const name = m?.display_name || m?.first_name || "會員";
  const nameEl = $("[data-m-name]");
  if (nameEl) nameEl.textContent = name;

  // Avatar: LINE profile photo when present, else the name initial. Text initial
  // (Array.from → safe for CJK/surrogates) is the fallback for non-LINE members
  // (no avatar_url) and for any image that fails to load.
  const avatarEl = $("[data-m-avatar]");
  if (avatarEl) {
    const initial = Array.from(name)[0] || "會";
    const url = typeof m?.avatar_url === "string" ? m.avatar_url.trim() : "";
    if (url) {
      const img = document.createElement("img");
      img.src = url;
      img.alt = "";
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer"; // LINE CDN images
      img.onerror = () => {
        avatarEl.textContent = initial;
      };
      avatarEl.textContent = "";
      avatarEl.appendChild(img);
    } else {
      avatarEl.textContent = initial;
    }
  }

  // 加入年份 from created_at; fall back to plain「會員」when absent.
  const joinEl = $("[data-m-join]");
  if (joinEl) {
    const created = m?.created_at;
    const d = created ? new Date(created) : null;
    joinEl.textContent =
      d && !isNaN(d.getTime()) ? `${d.getFullYear()} 加入` : "會員";
  }

  const greetEl = $("[data-m-greeting]");
  if (greetEl) greetEl.textContent = member.accountWelcome.greeting.replace("{name}", name);

  // 個人資料 — read-only. `PATCH /me` cannot touch the e-mail or the phone, so
  // there is no 編輯 affordance to go with these; see the page's header comment.
  // A field the API left empty shows a dash rather than nothing, except the
  // birthday, whose whole row goes when it is unset — an empty 生日 invites a
  // member to look for the editor that is not there.
  const dash = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : "—");
  const setText = (sel: string, v: string) => {
    const e = $(sel);
    if (e) e.textContent = v;
  };
  setText("[data-p-name]", name);
  setText("[data-p-email]", dash(m?.email));
  setText("[data-p-phone]", dash(m?.phone));
  setText("[data-p-joined]", fmtDay(m?.created_at) || "—");
  const birthRow = $("[data-p-birth-row]");
  if (m?.birth_date) {
    setText("[data-p-birth]", fmtDay(m.birth_date) || String(m.birth_date));
    show(birthRow);
  } else {
    hide(birthRow);
  }
}

/**
 * One order, as a table row plus the panel it opens.
 *
 * Row and panel live in ONE container, because the status pills filter by
 * hiding that container — two sibling elements per order would need the filter
 * to know about both, and it would eventually be told about only one.
 */
function renderOrderRow(
  o: Json,
  bounceIfUnauthorized: (status: number) => boolean
): HTMLElement {
  const row = el("div", "o-row");
  row.setAttribute("role", "row");

  const main = el("div", "o-main");
  main.appendChild(el("span", "o-num", o.order_number || o.display_id || "—"));
  main.appendChild(el("span", "o-date", fmtDay(o.created_at) || "—"));
  main.appendChild(el("span", "o-amt", money(o.grand_total)));
  main.appendChild(el("span", "o-status", statusLabel(o.status)));

  const toggle = el("button", "o-toggle", "查看明細") as HTMLButtonElement;
  toggle.type = "button";
  toggle.setAttribute("aria-expanded", "false");
  main.appendChild(toggle);
  row.appendChild(main);

  const detail = el("div", "o-detail");
  detail.style.display = "none";
  row.appendChild(detail);

  let loaded = false;
  toggle.addEventListener("click", async () => {
    const isOpen = detail.style.display !== "none";
    if (isOpen) {
      detail.style.display = "none";
      row.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
      toggle.textContent = "查看明細";
      return;
    }
    detail.style.display = "";
    row.classList.add("is-open");
    toggle.setAttribute("aria-expanded", "true");
    toggle.textContent = "收合明細";
    if (!loaded) {
      detail.innerHTML = "";
      detail.appendChild(el("p", "detail-loading", "明細載入中…"));
      const r = await authedFetch(`/v1/storefront/me/orders/${encodeURIComponent(o.id)}`);
      detail.innerHTML = "";
      if (!r.ok) {
        if (bounceIfUnauthorized(r.status)) return;
        detail.appendChild(el("p", "detail-error", "無法載入訂單明細。"));
        return;
      }
      renderOrderDetail(detail, r.data);
      loaded = true;
    }
  });

  return row;
}

function detailRow(label: string, value: string, valueCls = "v"): HTMLElement {
  const r = el("div", "detail-row");
  r.appendChild(el("span", "k", label));
  r.appendChild(el("span", valueCls, value));
  return r;
}

function renderOrderDetail(host: HTMLElement, data: Json) {
  const order = data?.order ?? {};
  const items: Json[] = data?.items ?? [];

  const list = el("div", "detail-items");
  for (const it of items) {
    const variant = it.variant_title ? `（${it.variant_title}）` : "";
    const sub =
      it.line_subtotal != null
        ? it.line_subtotal
        : it.subtotal != null
          ? it.subtotal
          : (it.unit_price ?? 0) * (it.quantity ?? 1);
    list.appendChild(detailRow(`${it.title}${variant} ×${it.quantity ?? 1}`, money(sub)));
  }
  host.appendChild(list);

  const breakdown = el("div", "detail-items");
  breakdown.appendChild(detailRow("商品小計", money(order.items_total)));
  breakdown.appendChild(detailRow("運費", money(order.shipping_fee_total)));
  if (order.discount_total)
    breakdown.appendChild(detailRow("折扣", `- ${money(order.discount_total)}`));
  if (order.credits_used)
    breakdown.appendChild(detailRow("折抵", `- ${money(order.credits_used)}`));
  host.appendChild(breakdown);

  host.appendChild(el("div", "detail-sep"));

  const grand = el("div", "detail-grand");
  grand.appendChild(el("span", "k", "合計"));
  grand.appendChild(el("span", "v", money(order.grand_total)));
  host.appendChild(grand);

  // ATM/CVS 取號 info (populated once ECPay returns 虛擬帳號 / 繳費代碼). Shown
  // for pending/authorized online payments so the member can pay later.
  const payInfo = ((data?.payments ?? []) as Json[])
    .map((p) => p?.payment_info as Json)
    .find((pi) => pi && (pi.virtual_account || pi.payment_no));
  if (payInfo) {
    host.appendChild(el("div", "detail-sep"));
    const box = el("div", "detail-payinfo");
    box.appendChild(
      el("span", "payinfo-title", payInfo.kind === "atm" ? "ATM 轉帳繳費資訊" : "超商代碼繳費資訊")
    );
    if (payInfo.kind === "atm") {
      if (payInfo.bank_code) box.appendChild(detailRow("銀行代碼", payInfo.bank_code));
      if (payInfo.virtual_account) box.appendChild(detailRow("虛擬帳號", payInfo.virtual_account));
    } else if (payInfo.payment_no) {
      box.appendChild(detailRow("繳費代碼", payInfo.payment_no));
    }
    if (payInfo.expire_date) box.appendChild(detailRow("繳費期限", payInfo.expire_date));
    box.appendChild(el("span", "payinfo-hold", "已為您保留訂單，完成繳費後將自動入帳。"));
    host.appendChild(box);
  }

  const meta = el("div", "detail-meta");
  meta.appendChild(
    el(
      "span",
      undefined,
      `${statusLabel(order.status)} · ${payLabel(order.payment_method)} · ${shipLabel(order.shipping_method)}`
    )
  );
  meta.appendChild(el("span", undefined, `下單時間 ${fmtDay(order.created_at)}`));
  host.appendChild(meta);
}

// ── side navigation ──────────────────────────────────────────────────────────
// The four sections are all on this page, so the sidebar scrolls rather than
// routes. The marker follows the section actually in view — clicking sets it
// too, but a reader who scrolls past a section without clicking should still
// see where they are.
function initSideNav() {
  const links = Array.from(
    document.querySelectorAll("[data-side-link]")
  ) as HTMLElement[];
  if (!links.length) return;

  const mark = (id: string) => {
    for (const l of links) l.classList.toggle("is-active", l.dataset.sideLink === id);
  };
  for (const l of links) {
    l.addEventListener("click", () => mark(l.dataset.sideLink || ""));
  }

  const sections = links
    .map((l) => document.getElementById(l.dataset.sideLink || ""))
    .filter(Boolean) as HTMLElement[];
  if (!sections.length || typeof IntersectionObserver === "undefined") return;

  const seen = new Map<string, number>();
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) seen.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0);
      let best = "";
      let bestRatio = 0;
      for (const [id, ratio] of seen) {
        if (ratio > bestRatio) {
          bestRatio = ratio;
          best = id;
        }
      }
      if (best) mark(best);
    },
    { rootMargin: "-96px 0px -55% 0px", threshold: [0, 0.25, 0.5, 1] }
  );
  for (const s of sections) io.observe(s);
}

// ── 收貨地址 ─────────────────────────────────────────────────────────────────
// Backed by /v1/storefront/me/addresses, which has list, create, update and
// delete — so this card does all four rather than displaying a frozen copy.
// The API caps a member at 5; the 新增地址 button goes away at the cap instead
// of letting the request come back rejected.

type AddressRow = {
  id: string;
  label: string | null;
  recipient_name: string;
  phone: string;
  city: string | null;
  district: string | null;
  zip_code: string | null;
  address: string;
  is_default: boolean;
};

const ADDR_PATH = "/v1/storefront/me/addresses";

async function initAddressBook(bounceIfUnauthorized: (status: number) => boolean) {
  const card = $("#addresses");
  if (!card) return;

  const listEl = $("[data-addr-list]");
  const emptyEl = $("[data-addr-empty]");
  const errEl = $("[data-addr-error]");
  const newBtn = $("[data-addr-new]") as HTMLButtonElement | null;
  const form = $("[data-addr-form]") as HTMLFormElement | null;
  const formErr = $("[data-af-error]");
  const saveBtn = $("[data-af-save]") as HTMLButtonElement | null;
  if (!listEl || !form) return;

  const field = (sel: string) => $(sel) as HTMLInputElement | null;
  const idField = field("[data-addr-id]");
  const inputs = {
    label: field("[data-af-label]"),
    recipient_name: field("[data-af-recipient]"),
    phone: field("[data-af-phone]"),
    zip_code: field("[data-af-zip]"),
    city: field("[data-af-city]"),
    district: field("[data-af-district]"),
    address: field("[data-af-address]"),
    is_default: field("[data-af-default]"),
  };

  let max = 5;

  const setCardError = (msg: string) => {
    if (!errEl) return;
    errEl.textContent = msg;
    msg ? show(errEl) : hide(errEl);
  };
  const setFormError = (msg: string) => {
    if (!formErr) return;
    formErr.textContent = msg;
    msg ? show(formErr) : hide(formErr);
  };

  const closeForm = () => {
    hide(form);
    setFormError("");
    if (newBtn) newBtn.disabled = false;
  };

  const openForm = (row?: AddressRow) => {
    if (idField) idField.value = row?.id ?? "";
    if (inputs.label) inputs.label.value = row?.label ?? "";
    if (inputs.recipient_name) inputs.recipient_name.value = row?.recipient_name ?? "";
    if (inputs.phone) inputs.phone.value = row?.phone ?? "";
    if (inputs.zip_code) inputs.zip_code.value = row?.zip_code ?? "";
    if (inputs.city) inputs.city.value = row?.city ?? "";
    if (inputs.district) inputs.district.value = row?.district ?? "";
    if (inputs.address) inputs.address.value = row?.address ?? "";
    if (inputs.is_default) inputs.is_default.checked = Boolean(row?.is_default);
    setFormError("");
    show(form);
    if (newBtn) newBtn.disabled = true;
    inputs.recipient_name?.focus();
  };

  const render = (rows: AddressRow[]) => {
    listEl.innerHTML = "";
    for (const row of rows) listEl.appendChild(addressCard(row, openForm, remove));
    if (emptyEl) (rows.length ? hide : show)(emptyEl);
    // At the cap the button would only produce a rejected request.
    if (newBtn) {
      const full = rows.length >= max;
      newBtn.disabled = full;
      newBtn.title = full ? `最多只能建立 ${max} 個地址` : "";
    }
  };

  const load = async (): Promise<AddressRow[] | null> => {
    const r = await authedFetch(ADDR_PATH);
    if (!r.ok) {
      if (bounceIfUnauthorized(r.status)) return null;
      setCardError("無法載入收貨地址，請稍後再試。");
      return null;
    }
    setCardError("");
    max = Number(r.data?.max_count ?? 5) || 5;
    return (r.data?.addresses ?? []) as AddressRow[];
  };

  const refresh = async () => {
    const rows = await load();
    if (rows) render(rows);
  };

  async function remove(row: AddressRow) {
    if (!window.confirm(`確定要刪除「${row.label || row.recipient_name}」這筆地址嗎？`)) return;
    const r = await authedFetch(`${ADDR_PATH}/${encodeURIComponent(row.id)}`, {
      method: "DELETE",
    });
    if (!r.ok) {
      if (bounceIfUnauthorized(r.status)) return;
      setCardError(r.error?.message || "刪除失敗，請稍後再試。");
      return;
    }
    await refresh();
  }

  newBtn?.addEventListener("click", () => openForm());
  $("[data-af-cancel]")?.addEventListener("click", closeForm);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = idField?.value ?? "";
    const recipient = inputs.recipient_name?.value.trim() ?? "";
    const phone = (inputs.phone?.value ?? "").replace(/\D/g, "");
    const address = inputs.address?.value.trim() ?? "";
    if (!recipient) return setFormError("請填寫收件人姓名。");
    if (!/^09\d{8}$/.test(phone)) return setFormError("請填寫正確的台灣手機號碼（09XXXXXXXX）。");
    if (!address) return setFormError("請填寫地址。");

    // Optional fields are omitted rather than sent empty: the schema takes them
    // as absent, and "" is a value the member did not choose.
    const body: Record<string, unknown> = {
      recipient_name: recipient,
      phone,
      address,
      is_default: Boolean(inputs.is_default?.checked),
    };
    for (const key of ["label", "city", "district", "zip_code"] as const) {
      const v = inputs[key]?.value.trim();
      if (v) body[key] = v;
    }

    setFormError("");
    if (saveBtn) saveBtn.disabled = true;
    try {
      const r = await authedFetch(id ? `${ADDR_PATH}/${encodeURIComponent(id)}` : ADDR_PATH, {
        method: id ? "PATCH" : "POST",
        body,
      });
      if (!r.ok) {
        if (bounceIfUnauthorized(r.status)) return;
        setFormError(r.error?.message || "儲存失敗，請稍後再試。");
        return;
      }
      closeForm();
      await refresh();
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  });

  await refresh();
}

function addressCard(
  row: AddressRow,
  onEdit: (row: AddressRow) => void,
  onDelete: (row: AddressRow) => void
): HTMLElement {
  const card = el("div", "addr-card");

  const top = el("div", "addr-top");
  top.appendChild(el("span", "addr-label", row.label || "收貨地址"));
  if (row.is_default) top.appendChild(el("span", "addr-default", "預設地址"));

  const tools = el("div", "addr-tools");
  const edit = el("button", "addr-tool") as HTMLButtonElement;
  edit.type = "button";
  edit.setAttribute("aria-label", "編輯地址");
  edit.innerHTML = SVG.pencil;
  edit.addEventListener("click", () => onEdit(row));
  const del = el("button", "addr-tool") as HTMLButtonElement;
  del.type = "button";
  del.setAttribute("aria-label", "刪除地址");
  del.innerHTML = SVG.trash;
  del.addEventListener("click", () => onDelete(row));
  tools.appendChild(edit);
  tools.appendChild(del);
  top.appendChild(tools);
  card.appendChild(top);

  card.appendChild(el("p", "addr-line", row.recipient_name));
  card.appendChild(el("p", "addr-line", row.phone));
  const parts = [row.zip_code, row.city, row.district, row.address].filter(Boolean).join(" ");
  card.appendChild(el("p", "addr-line", parts));
  return card;
}
