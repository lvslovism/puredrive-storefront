/**
 * JSON serialisation for embedding inside an inline <script> element.
 *
 * An HTML parser ends a <script> block at the first literal `</script`
 * sequence, regardless of JS/JSON string quoting. Any merchant-controlled
 * field that reaches JSON.stringify (storefront_config.contact.legal_entity /
 * tax_id, article titles, product descriptions) could therefore close the
 * block early and start executing attacker markup.
 *
 * Escaping `<` is semantics-preserving: `<` is a valid escape in both
 * JSON and JS string literals and parses back to "<", so JSON.parse and the
 * JS parser still yield the original string.
 *
 * U+2028 / U+2029 are legal inside a JSON string but are line terminators in
 * older JS grammars, which breaks an inline script; they are escaped too.
 * Both are referenced via String.fromCharCode so this file stays pure ASCII —
 * a literal U+2028 in source is invisible and easily lost in an edit.
 *
 * Mirrors escapeJsonForScript() in the Astrapath storefront package.
 */
const U2028 = String.fromCharCode(0x2028);
const U2029 = String.fromCharCode(0x2029);

export function safeJson(value: unknown): string {
  return (JSON.stringify(value) ?? "null")
    .replace(/</g, "\\u003c")
    .split(U2028)
    .join("\\u2028")
    .split(U2029)
    .join("\\u2029");
}
