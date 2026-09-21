/**
 * Security regression tests for spec sec-fix-b1.
 *
 * Runner: node:test via Node's native type stripping (Node >= 22.18) — no
 * vitest/jest dependency is added, matching the repo's zero-test-tooling state.
 *   npm test
 *
 * BOTH DIRECTIONS ARE LOAD-BEARING. The strip-assertions guard against XSS
 * regressions; the preserve-assertions guard against an over-tight allow-list
 * silently destroying customer article layout. The second failure mode is the
 * quiet one: production article ryanbrand/column-172973 renders
 * <table><caption><b>…</b></caption>, and hast-util-sanitize's defaultSchema
 * does NOT include `caption`, so dropping the schema extension would wreck that
 * table with no error anywhere.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { safeJson } from '../src/lib/safe-json.ts';
import { sanitizeArticleHtml } from '../src/lib/article-sanitize.ts';

const U2028 = String.fromCharCode(0x2028);
const U2029 = String.fromCharCode(0x2029);
// Built at runtime so this source file never contains a literal `</script`
// or a raw line separator (both are hostile to editors and bundlers).
const SCRIPT_CLOSE = '</' + 'script';
const BACKSLASH = String.fromCharCode(92);

describe('P4 — safeJson() script-breakout escaping', () => {
  const payload = SCRIPT_CLOSE + '><' + 'script>window.__X=1' + SCRIPT_CLOSE + '>';
  const obj = {
    '@context': 'https://schema.org',
    '@graph': [{ '@type': 'Organization', legalName: payload, taxID: '12345678' }],
  };

  test('emits no raw </script sequence', () => {
    const out = safeJson(obj);
    assert.ok(
      JSON.stringify(obj).includes(SCRIPT_CLOSE),
      'precondition: plain JSON.stringify must be vulnerable, else the test proves nothing',
    );
    assert.equal(out.includes(SCRIPT_CLOSE), false);
  });

  test('escapes < as the \\u003c sequence', () => {
    const out = safeJson(obj);
    assert.ok(out.includes(BACKSLASH + 'u003c'));
    assert.ok(out.includes(BACKSLASH + 'u003c/script'));
    assert.equal(out.includes('<'), false, 'no raw < may survive anywhere in the output');
  });

  test('is semantics-preserving: JSON.parse(output) deep-equals the input', () => {
    assert.deepStrictEqual(JSON.parse(safeJson(obj)), obj);
  });

  test('escapes U+2028 (JS line separator) without changing semantics', () => {
    const input = { note: 'a' + U2028 + 'b' };
    const out = safeJson(input);
    assert.ok(out.includes(BACKSLASH + 'u2028'), 'U+2028 must be emitted as an escape');
    assert.equal(out.includes(U2028), false, 'no raw U+2028 may survive');
    assert.deepStrictEqual(JSON.parse(out), input);
  });

  test('escapes U+2029 (JS paragraph separator) without changing semantics', () => {
    const input = { note: 'a' + U2029 + 'b' };
    const out = safeJson(input);
    assert.ok(out.includes(BACKSLASH + 'u2029'), 'U+2029 must be emitted as an escape');
    assert.equal(out.includes(U2029), false, 'no raw U+2029 may survive');
    assert.deepStrictEqual(JSON.parse(out), input);
  });
});

describe('P1 — sanitizeArticleHtml() strips dangerous markup', () => {
  test('removes <script> elements', async () => {
    const out = await sanitizeArticleHtml('<p>ok</p><' + 'script>window.__XSS=1</' + 'script>');
    assert.equal(/<script/i.test(out), false);
    assert.equal(out.includes('window.__XSS'), false, 'script body must not survive as text either');
    assert.ok(out.includes('<p>ok</p>'), 'surrounding content must be untouched');
  });

  test('removes onerror (and other inline event handler) attributes', async () => {
    const out = await sanitizeArticleHtml('<img src="x" onerror="window.__XSS=2">');
    assert.equal(/onerror/i.test(out), false);
    assert.ok(/<img/i.test(out), 'the img element itself is allowed and must remain');
  });

  test('removes javascript: hrefs', async () => {
    const out = await sanitizeArticleHtml('<a href="javascript:alert(1)">x</a>');
    assert.equal(/javascript:/i.test(out), false);
  });
});

describe('P1 — sanitizeArticleHtml() preserves real article layout (anti-regression)', () => {
  // Shape mirrors production article ryanbrand/column-172973.
  const REAL_TABLE =
    '<table><caption><b>晚安面膜與保濕面膜的適用膚質</b></caption>' +
    '<tr><th>面膜類型</th><th>適用膚質</th></tr>' +
    '<tr><td>晚安面膜</td><td><ul><li>乾性肌膚</li></ul></td></tr>' +
    '</table>';

  test('keeps table / caption / tr / th / td', async () => {
    const out = await sanitizeArticleHtml(REAL_TABLE);
    for (const tag of ['table', 'caption', 'tr', 'th', 'td']) {
      assert.ok(new RegExp('<' + tag + '[\\s>]', 'i').test(out), `<${tag}> must be preserved`);
    }
    assert.ok(out.includes('晚安面膜與保濕面膜的適用膚質'), 'caption text must survive');
  });

  test('keeps ul / li / strong / b', async () => {
    const out = await sanitizeArticleHtml(
      '<ul><li><strong>重點</strong></li><li><b>粗體</b></li></ul>',
    );
    for (const tag of ['ul', 'li', 'strong', 'b']) {
      assert.ok(new RegExp('<' + tag + '[\\s>]', 'i').test(out), `<${tag}> must be preserved`);
    }
  });

  test('keeps https anchors with their href intact', async () => {
    const out = await sanitizeArticleHtml('<a href="https://example.com">正常連結</a>');
    assert.ok(out.includes('href="https://example.com"'), 'safe href must not be stripped');
    assert.ok(out.includes('正常連結'));
  });

  test('keeps headings and paragraphs', async () => {
    const out = await sanitizeArticleHtml('<h2>標題</h2><h3>小標</h3><p>內文</p>');
    for (const tag of ['h2', 'h3', 'p']) {
      assert.ok(new RegExp('<' + tag + '[\\s>]', 'i').test(out), `<${tag}> must be preserved`);
    }
  });
});

describe('P1 — ordering guard: sanitize must run AFTER rehype-raw', () => {
  /**
   * The documented trap: Astro's createMarkdownProcessor registers user
   * rehypePlugins BEFORE rehype-raw, so wiring rehype-sanitize through that
   * option sanitises unparsed `raw` nodes and deletes every raw-HTML table.
   * This test drives the real pipeline end to end so that "fixing" it by
   * moving sanitisation into rehypePlugins fails loudly instead of silently
   * shipping blank tables.
   */
  test('markdown containing raw HTML keeps its table and loses its script', async () => {
    const { createMarkdownProcessor, markdownConfigDefaults } = await import(
      '@astrojs/markdown-remark'
    );
    const processor = await createMarkdownProcessor(markdownConfigDefaults);

    const md = [
      '## 標題',
      '',
      '<' + 'script>window.__XSS=1</' + 'script>',
      '',
      '<table><caption><b>表格標題</b></caption><tr><th>欄位</th></tr><tr><td>資料</td></tr></table>',
    ].join('\n');

    const rendered = (await processor.render(md)).code;
    assert.ok(/<script/i.test(rendered), 'precondition: Astro alone leaves the script in');

    const out = await sanitizeArticleHtml(rendered);
    assert.equal(/<script/i.test(out), false, 'script must be gone after sanitising');
    assert.ok(/<table/i.test(out), 'table must survive — if this fails, sanitize ran too early');
    assert.ok(/<caption/i.test(out), 'caption must survive');
    assert.ok(/<td[\s>]/i.test(out), 'td must survive');
  });
});
