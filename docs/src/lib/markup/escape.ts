/**
 * escape.ts — author text made safe to place in HTML. Two flavors, because markup has two places text lands:
 *
 *   escapeHtml(s)   element text: `&`, `<` and `>` become entities
 *   escapeAttr(s)   a double-quoted attribute value: the same three, and `"`
 *
 * One pass over the string with one regular expression; the result equals the chained `.replace` calls it
 * replaces (`&` is handled in the same pass, so an entity is never escaped twice).
 */
const TEXT = /[&<>]/g;
const ATTR = /[&<>"]/g;
const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const entity = (ch: string): string => ENTITIES[ch];

export function escapeHtml(s: unknown): string {
  return String(s).replace(TEXT, entity);
}

export function escapeAttr(s: unknown): string {
  return String(s).replace(ATTR, entity);
}
