/**
 * NAMED SPAN — is a code span's text one whole `@kind{…}` call? The one answer both sides of an installed plugin's
 * inline kind use: the door, which claims the span and hands it to the plugin (lib/packages/code-door-fence.mjs
 * `inlineSpans`), and the Studio's Compose, which opens a panel on it and writes it back
 * (docs/src/lib/compose/inline-objects.ts `pluginKind`). One rule, so Compose never offers to edit a span the door
 * would not draw, and never writes one it would refuse (HARD RULE #1).
 *
 * Design: engineering/decisions/2026-10-14-plugin-inline-door.md §4.1 (the grammar), §4.4 (the door), §4.5 (Compose).
 * Pure and dependency-free, so the docs bundle imports it directly and the CLI loads it through the door.
 */

/** `@`, a kind name (the manifest's propertyNames pattern), and a record opening directly after it. */
export const NAMED_SPAN_RE = /^@([a-z][a-z0-9-]*)\{[\s\S]*\}$/;

/**
 * Does the `{` that opens the record (at `from`) close at the span's LAST character? Quoted text is skipped, so
 * `@k{"a}"}` is one record and `@k{a} and {b}` is prose about a kind, not a call (the checker, 2026-10-14).
 * @param {string} text
 * @param {number} from
 */
export function recordIsWhole(text, from) {
  let depth = 0;
  let quoted = false;
  for (let i = from; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '\\') i++;
      else if (c === '"') quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i === text.length - 1;
  }
  return false;
}

/**
 * The kind and the record of a whole named call, or null when `text` is not one. `record` keeps its braces
 * (`{Launch, hot}`), as the door hands it to the plugin.
 * @param {string} text
 * @returns {{ kind: string, record: string } | null}
 */
export function namedCall(text) {
  const m = typeof text === 'string' ? NAMED_SPAN_RE.exec(text) : null;
  if (!m || !recordIsWhole(text, m[1].length + 1)) return null;
  return { kind: m[1], record: text.slice(m[1].length + 1) };
}
