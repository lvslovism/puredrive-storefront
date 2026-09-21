// Minimal, dependency-free Markdown → safe HTML for product descriptions.
//
// The commerce API returns admin-authored Markdown (## headings, paragraphs,
// occasional - bullet lists and **bold**). We deliberately avoid pulling in a
// full Markdown engine (spec: 不引入新依賴) — this covers exactly the subset the
// CMS emits. Input is HTML-escaped BEFORE any tag is added, so even though the
// copy is first-party it can never inject markup.

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Inline emphasis on already-escaped text. `*`/`_` survive escapeHtml untouched.
function inline(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
}

export function productDescriptionToHtml(md: string | null | undefined): string {
  if (md == null) return "";
  const text = String(md).replace(/\r\n/g, "\n").trim();
  if (!text) return "";

  const out: string[] = [];
  let list: string[] = [];
  const flushList = () => {
    if (list.length) {
      out.push("<ul>" + list.map((li) => `<li>${inline(escapeHtml(li))}</li>`).join("") + "</ul>");
      list = [];
    }
  };

  for (const rawBlock of text.split(/\n{2,}/)) {
    const block = rawBlock.trim();
    if (!block) continue;
    const lines = block.split("\n");

    // Bullet list block (every line a "- " / "* " item).
    if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
      for (const l of lines) list.push(l.replace(/^\s*[-*]\s+/, "").trim());
      continue;
    }
    flushList();

    // Single-line heading (# … ######), clamped to h2/h3 to fit the page scale.
    const heading = lines.length === 1 ? block.match(/^(#{1,6})\s+(.*)$/) : null;
    if (heading) {
      const level = Math.min(Math.max(heading[1].length, 2), 3);
      out.push(`<h${level}>${inline(escapeHtml(heading[2].trim()))}</h${level}>`);
      continue;
    }

    // Paragraph — preserve single newlines as <br />.
    const paragraph = lines.map((l) => inline(escapeHtml(l.trim()))).join("<br />");
    out.push(`<p>${paragraph}</p>`);
  }
  flushList();

  return out.join("");
}
