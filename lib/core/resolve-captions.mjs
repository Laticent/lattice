/**
 * lib/core/resolve-captions.mjs
 *
 * Deck front-matter → narration reference data, parsed ONCE and shared (HARD RULE #1)
 * by both narration producers: the CLI/export caption sidecar (lattice-emulator.js,
 * via dynamic import) and the live Studio Present read-aloud (docs, direct import).
 * One source ⇒ the two producers can never drift (the divergence #904 fixed).
 *
 * The house has no YAML dependency and its other front-matter parsers are FLAT
 * `key: value` readers (lib/engine/directives.js) that cannot see a nested block. This
 * is the dedicated, bespoke parser for the two NESTED narration keys — the same move
 * `resolve-color-mode.js` / `parseFinishOverride` made for their non-flat keys:
 *
 *   acronyms:                       # Layer 2 — token → spoken form (author beats built-in)
 *     CRO: chief revenue officer               # string  → { expansion }
 *     ARR: { expansion: annual recurring revenue, definition: "Revenue that recurs." }
 *     EBITDA:                                   # block object (comma-safe definitions)
 *       expansion: ee bit dah
 *       definition: "Earnings before interest, taxes, depreciation, and amortization."
 *   captions:                       # Layer 1 — a slide's read-as text, 1-based slide number
 *     1: "Welcome. Today we cover three things."
 *     4: "This is the ask."
 *
 * Pure + dependency-free (bundles to the browser, unit-testable in isolation). Returns
 * plain Maps; cadenza never parses YAML — it receives ready data.
 */

/** Extract the raw front-matter block body (between the leading `---` fences), or ''. */
function frontMatterBody(md) {
  if (!md || typeof md !== 'string') return '';
  const m = md.match(/^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  return m ? m[1] : '';
}

/** Strip one layer of matching straight quotes; trim. */
function unquote(s) {
  const t = String(s ?? '').trim();
  if (t.length >= 2 && ((t[0] === '"' && t.at(-1) === '"') || (t[0] === "'" && t.at(-1) === "'"))) {
    return t.slice(1, -1);
  }
  return t;
}

/**
 * The child lines of a top-level `key:` block — every subsequent line indented deeper
 * than the key line, stopping at the first line dedented back to (or past) the key.
 * Returns [] when the key is absent or has no indented body.
 */
function blockLines(body, key) {
  const lines = body.split(/\r?\n/);
  const out = [];
  let baseIndent = -1;
  for (const line of lines) {
    if (baseIndent < 0) {
      const m = line.match(/^(\s*)([A-Za-z][\w-]*):\s*$/);
      if (m && m[2] === key) baseIndent = m[1].length;
      continue;
    }
    if (line.trim() === '') continue; // blank lines don't end a block
    const indent = line.match(/^(\s*)/)[1].length;
    if (indent <= baseIndent) break; // dedent → block over
    out.push({ indent, text: line.trim(), raw: line });
  }
  return out;
}

/** Split a flow-object body `a: x, b: "y, z"` on top-level commas (quote-aware). */
function splitFlowPairs(inner) {
  const parts = [];
  let buf = '';
  let quote = '';
  for (const ch of inner) {
    if (quote) {
      buf += ch;
      if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      buf += ch;
    } else if (ch === ',') {
      parts.push(buf);
      buf = '';
    } else {
      buf += ch;
    }
  }
  if (buf.trim()) parts.push(buf);
  return parts;
}

/** Parse `expansion: … , definition: …` (inline flow OR block child lines) → object. */
function parseEntryFields(pairs) {
  const obj = {};
  for (const p of pairs) {
    const kv = p.match(/^\s*([A-Za-z][\w-]*)\s*:\s*([\s\S]*)$/);
    if (!kv) continue;
    const k = kv[1].toLowerCase();
    if (k === 'expansion' || k === 'definition') obj[k] = unquote(kv[2]);
  }
  return obj;
}

/**
 * Parse the `acronyms:` block → Map<term, { expansion, definition? }>. Skips an entry
 * with no non-empty expansion (validation surfaces that elsewhere). Digit-leading terms
 * (`5G`, `3PL`) are allowed. Later duplicate terms win (last-wins).
 */
function parseAcronyms(body) {
  const out = new Map();
  const lines = blockLines(body, 'acronyms');
  if (!lines.length) return out;
  const entryIndent = Math.min(...lines.map((l) => l.indent));
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // An entry header: `TERM:` optionally followed by a value on the same line.
    const head = line.text.match(/^([A-Za-z0-9][\w.&/-]*)\s*:\s*([\s\S]*)$/);
    if (line.indent !== entryIndent || !head) { i++; continue; }
    const term = head[1];
    const rest = head[2].trim();
    let fields;
    if (rest.startsWith('{')) {
      // inline flow object
      const inner = rest.replace(/^\{/, '').replace(/\}\s*$/, '');
      fields = parseEntryFields(splitFlowPairs(inner));
      i++;
    } else if (rest) {
      // string shorthand = expansion
      fields = { expansion: unquote(rest) };
      i++;
    } else {
      // block object — consume deeper child lines
      const child = [];
      i++;
      while (i < lines.length && lines[i].indent > entryIndent) {
        child.push(lines[i].text);
        i++;
      }
      fields = parseEntryFields(child);
    }
    if (fields.expansion) {
      const entry = { expansion: fields.expansion };
      if (fields.definition) entry.definition = fields.definition;
      out.set(term, entry);
    }
  }
  return out;
}

/** Parse the `captions:` block → Map<slideNumber (1-based int), text>. */
function parseCaptions(body) {
  const out = new Map();
  for (const line of blockLines(body, 'captions')) {
    const m = line.text.match(/^(\d+)\s*:\s*([\s\S]+)$/);
    if (!m) continue;
    const n = Number(m[1]);
    const text = unquote(m[2]);
    if (Number.isInteger(n) && n > 0 && text) out.set(n, text);
  }
  return out;
}

/**
 * Parse a deck source's narration front-matter into ready Maps. Always returns both
 * Maps (empty when the key is absent). The single entry point both producers call.
 */
export function parseNarrationFrontMatter(md) {
  const body = frontMatterBody(md);
  return { acronyms: parseAcronyms(body), captions: parseCaptions(body) };
}

export default { parseNarrationFrontMatter };
