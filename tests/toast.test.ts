/**
 * Regression tests for mobile-toast-v1: the ≤980px matchMedia branch in
 * src/scripts/toast.ts must suppress ONLY the success toast. Before this fix
 * it no-opped every variant, which made cart/checkout failures completely
 * silent on mobile (~70% of traffic).
 *
 * Runner: node:test + a minimal DOM shim (same zero-test-tooling stance as
 * security.test.ts — no jsdom). The shim implements just what toast.ts
 * touches; if toast.ts starts using more DOM API, extend the shim.
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// --- minimal DOM shim ---------------------------------------------------------

type Shimmed = Record<string, any>;

function makeElement(tag: string): Shimmed {
  const el: Shimmed = {
    tagName: tag.toUpperCase(),
    children: [] as Shimmed[],
    attributes: {} as Record<string, string>,
    className: '',
    textContent: '',
    offsetHeight: 40,
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
        el.className = el.className
          .split(/\s+/)
          .filter((x: string) => x && x !== c)
          .join(' ');
      },
      contains(c: string) {
        return el.className.split(/\s+/).includes(c);
      },
    },
    setAttribute(name: string, value: string) {
      el.attributes[name] = value;
    },
    appendChild(child: Shimmed) {
      el.children.push(child);
      return child;
    },
    remove() {
      /* not needed for assertions */
    },
    getBoundingClientRect() {
      return { top: 0, bottom: 82, left: 0, right: 0, width: 0, height: 82 };
    },
  };
  return el;
}

let mobileViewport = false;
let doc: Shimmed;

function installDom() {
  doc = {
    head: makeElement('head'),
    body: makeElement('body'),
    createElement: (tag: string) => makeElement(tag),
    createTextNode: (text: string) => ({ textContent: text }),
    querySelector: (sel: string) => {
      // toast.ts looks the host back up before creating a second one; a fresh
      // document per test means it is never found — good enough here.
      void sel;
      return null;
    },
  };
  (globalThis as any).document = doc;
  (globalThis as any).window = {
    matchMedia: (q: string) => ({ matches: mobileViewport && q.includes('980') }),
    setTimeout: () => 1, // timers never fire — tests only assert the show path
    clearTimeout: () => {},
  };
}

/** Toast elements appended to <body> via the host, flattened. */
function renderedToasts(): Shimmed[] {
  return doc.body.children.flatMap((host: Shimmed) =>
    host.children.filter((c: Shimmed) => String(c.className).includes('sf-toast')),
  );
}

// toast.ts module state (stylesInjected) is per-import; import once and reset
// the fake document between tests instead.
installDom();
const { showToast } = await import('../src/scripts/toast.ts');

beforeEach(() => {
  installDom();
});

// --- the actual behaviour matrix ---------------------------------------------

describe('showToast viewport × variant matrix', () => {
  test('desktop error toast renders (unchanged behaviour)', () => {
    mobileViewport = false;
    showToast('加入購物車失敗，請再試一次', { variant: 'error' });
    assert.equal(renderedToasts().length, 1);
  });

  test('desktop success toast renders (unchanged behaviour)', () => {
    mobileViewport = false;
    showToast('已加入購物車', { variant: 'success' });
    assert.equal(renderedToasts().length, 1);
  });

  test('mobile success toast stays suppressed (original ≤980px intent)', () => {
    mobileViewport = true;
    const handle = showToast('已加入購物車', { variant: 'success' });
    assert.equal(renderedToasts().length, 0);
    assert.equal(typeof handle.dismiss, 'function'); // callers still get a handle
  });

  test('mobile ERROR toast renders — the previously silent failure path', () => {
    mobileViewport = true;
    showToast('數量更新失敗，請再試一次', { variant: 'error' });
    assert.equal(renderedToasts().length, 1);
  });

  test('mobile default-variant toast renders (default is a failure path)', () => {
    mobileViewport = true;
    showToast('操作失敗', {});
    assert.equal(renderedToasts().length, 1);
  });

  test('mobile error path skips desktop band positioning', () => {
    mobileViewport = true;
    showToast('失敗', { variant: 'error' });
    const host = doc.body.children[0];
    // positionHost sets --sf-toast-top; on mobile the banner is
    // bottom-pinned by the media query and the var must stay unset.
    assert.equal(host.style.props['--sf-toast-top'], undefined);
  });
});
