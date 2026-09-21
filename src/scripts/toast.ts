// Minimal transient toast. The storefront had no toast infra, so this is a
// single self-contained helper. Toasts appear pinned just below the sticky
// header, horizontally centred, as a fixed overlay (never reflows the page).
//
// Variants:
//   "default"/"error" — filled CTA pill, inverted text (add-to-cart failure path)
//   "success"         — hairline chip + ✓, muted text (add-to-cart success)
//
// showToast returns a handle with dismiss() so a caller can close one toast
// before showing another (e.g. close the optimistic success, then show the
// error if the server call later fails — the two never stack). Styles inject
// once on first call.

type ToastVariant = "default" | "success" | "error";

interface ToastOptions {
  variant?: ToastVariant;
  duration?: number;
}

export interface ToastHandle {
  dismiss: () => void;
}

let stylesInjected = false;

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement("style");
  style.textContent = `
    .sf-toast-host {
      position: fixed;
      top: var(--sf-toast-top, 82px);
      left: 50%;
      transform: translateX(-50%);
      z-index: 1000;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      width: max-content;
      max-width: min(90vw, 560px);
      pointer-events: none;
    }
    .sf-toast {
      background: var(--color-cta);
      color: var(--color-cta-text);
      font-size: var(--description-text-size);
      line-height: 1.5;
      padding: 12px 22px;
      border-radius: var(--radius-sm);
      text-align: center;
      word-break: break-word;
      opacity: 0;
    }
    .sf-toast--success {
      /* Hairline chip, not a fill: success already has a visible signal in the
         button state and the cart badge, so this one stays quiet next to the
         filled add-to-cart CTA it appears above. */
      background: transparent;
      border: 1px solid var(--color-border);
      color: var(--text-muted);
      padding: 10px 18px;
    }
    .sf-toast__check {
      margin-right: 6px;
    }
    .sf-toast.is-visible {
      opacity: 1;
    }
    @media (max-width: 980px) {
      /* Mobile: error banner pinned to the bottom edge instead of the
         header band — it can't crowd the header/CTA area there, and thumbs
         rest near the bottom so the eye is already close. top:auto wins over
         the --sf-toast-top var set by positionHost (same specificity, later
         rule), so desktop positioning code stays untouched. */
      .sf-toast-host {
        top: auto;
        bottom: calc(16px + env(safe-area-inset-bottom, 0px));
        width: calc(100vw - 32px);
        max-width: none;
      }
    }
  `;
  document.head.appendChild(style);
}

function getHost(): HTMLElement {
  let host = document.querySelector(".sf-toast-host") as HTMLElement | null;
  if (!host) {
    host = document.createElement("div");
    host.className = "sf-toast-host";
    document.body.appendChild(host);
  }
  return host;
}

// Centre the toast vertically in the band between the header bottom and the top
// of the page content (<main>), so the gap above and below the toast reads as
// equal. Measured from live geometry at show-time (no hardcoded px) so it stays
// proportional across desktop / mobile / zoom and the transparent-header
// variant. Clamped to just below the header when the content top is scrolled
// out of view (band collapses → sit under the header, never over it).
function positionHost(host: HTMLElement, toastHeight: number) {
  const header = document.querySelector("header");
  const headerBottom = header ? header.getBoundingClientRect().bottom : 82;
  // Measure the real visible content top. Prefer the gallery/image top, NOT the
  // .product-detail-page section box — the section starts right under the header
  // and its top padding is empty space, so measuring the section pins the toast
  // up against the header. The gallery column starts where the image actually
  // is, dropping the midpoint to a true centre. Fall back to the section, then
  // <main>, for non-PDP pages so it never breaks.
  const contentEl =
    document.querySelector(".gallery-column") ||
    document.querySelector(".product-detail-page") ||
    document.querySelector("main");
  const contentTop = contentEl
    ? contentEl.getBoundingClientRect().top
    : headerBottom + 24;
  const minTop = headerBottom + 8;
  let top = (headerBottom + contentTop) / 2 - toastHeight / 2;
  if (!(top > minTop)) top = minTop; // NaN-safe lower clamp
  host.style.setProperty("--sf-toast-top", `${Math.round(top)}px`);
}

export function showToast(message: string, opts: ToastOptions = {}): ToastHandle {
  const { variant = "default", duration = 3000 } = opts;

  // Mobile (≤980px, the header's desktop→mobile breakpoint) suppresses only the
  // SUCCESS toast — the optimistic button state + cart badge already convey
  // that result and the banner crowds the small viewport. Failures have no
  // other visible signal, so error/default toasts must still show; they render
  // as a bottom banner there (see the max-width media block in injectStyles).
  const isMobile = window.matchMedia("(max-width: 980px)").matches;
  if (isMobile && variant === "success") {
    return { dismiss: () => {} };
  }

  injectStyles();
  const host = getHost();

  const el = document.createElement("div");
  el.className =
    "sf-toast" + (variant === "success" ? " sf-toast--success" : "");
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");
  if (variant === "success") {
    // Leading check glyph (the existing ✓ used elsewhere) — decorative, so it's
    // aria-hidden and the status only announces the message text.
    const check = document.createElement("span");
    check.className = "sf-toast__check";
    check.setAttribute("aria-hidden", "true");
    check.textContent = "✓";
    el.appendChild(check);
    el.appendChild(document.createTextNode(message));
  } else {
    el.textContent = message;
  }
  host.appendChild(el);

  // Position now that the toast is laid out — needs its measured height to
  // centre it in the header→content band (desktop only; the mobile banner is
  // bottom-pinned by CSS).
  if (!isMobile) positionHost(host, el.offsetHeight);
  else void el.offsetHeight;
  el.classList.add("is-visible");

  let dismissed = false;
  const hideTimer = window.setTimeout(dismiss, duration);

  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    window.clearTimeout(hideTimer);
    el.classList.remove("is-visible");
    window.setTimeout(() => el.remove(), 300);
  }

  return { dismiss };
}
