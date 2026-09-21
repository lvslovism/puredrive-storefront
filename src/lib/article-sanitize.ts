/**
 * Allow-list sanitiser for CMS article HTML (spec sec-fix-b1 / P1).
 *
 * Articles are authored as Markdown with raw HTML mixed in (tables, lists),
 * and the commerce-workers API deliberately returns content_md unsanitised —
 * see routes/v1/storefront/articles.ts D-B36.4.9, which assigns sanitisation
 * to the renderer. This module is that renderer-side control.
 *
 * WHY THIS SANITISES THE RENDERED STRING RATHER THAN USING rehypePlugins
 * ---------------------------------------------------------------------
 * Astro's createMarkdownProcessor registers user `rehypePlugins` BEFORE it
 * registers rehype-raw (@astrojs/markdown-remark 7.2.0, dist/index.js: the
 * `for (const [plugin] of loadedRehypePlugins)` loop precedes
 * `parser.use(rehypeRaw)`). At that point raw HTML is still unparsed `raw`
 * nodes, which hast-util-sanitize drops wholesale — measured: passing
 * rehypeSanitize via rehypePlugins removed <table>/<tr>/<td>/<caption>
 * entirely from a real article. Sanitising the finished HTML re-parses it
 * into real elements, so the allow-list is applied to the same tree the
 * browser would build. See the spec hand-off for the recorded outputs.
 *
 * Schema: hast-util-sanitize's GitHub defaultSchema, plus `caption`.
 * defaultSchema.tagNames does NOT contain `caption` (verified at runtime),
 * and real CMS content ships <table><caption><b>…</b></caption>, so
 * without this single addition the table would silently lose its heading.
 * clobberPrefix is left at its default ("user-content-"): no article uses
 * href="#", id= or name= (0/115 in production), so prefixing costs nothing
 * and keeps the DOM-clobbering guard intact.
 */
import { unified } from "unified";
import rehypeParse from "rehype-parse";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";

export const articleSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "caption"],
};

const processor = unified()
  .use(rehypeParse, { fragment: true })
  .use(rehypeSanitize, articleSchema)
  .use(rehypeStringify);

/** Strip script/event-handler/javascript: markup from rendered article HTML. */
export async function sanitizeArticleHtml(html: string): Promise<string> {
  if (!html) return "";
  return String(await processor.process(html));
}
