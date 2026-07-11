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
 * is the dedicated, bespoke parser for the NESTED narration keys — the same move
 * `resolve-color-mode.js` / `parseFinishOverride` made for their non-flat keys:
 *
 *   acronyms:                       # Layer 2 — token → spoken form (author beats built-in)
 *     CRO: chief revenue officer               # string  → { expansion }
 *     ARR: { expansion: annual recurring revenue, definition: "Revenue that recurs." }
 *     EBITDA:                                   # block object (comma-safe definitions)
 *       expansion: ee bit dah
 *       definition: "Earnings before interest, taxes, depreciation, and amortization."
 *
 * The sibling `captions:` key (Layer 1 — a slide's read-as text, keyed by author slide
 * NUMBER) is parsed here too:
 *
 *   captions:                       # Layer 1 — slide number → the exact text that slide reads
 *     3: FY26 revenue grew forty percent.
 *     5: "Net dollar retention held at one twenty."   # quote only to protect a leading/trailing space
 *
 * A slide-level `<!-- caption: … -->` comment (highest precedence) is recognized by the
 * producers, not here — this file only owns the front-matter blocks. Pure + dependency-free
 * (bundles to the browser, unit-testable in isolation). Returns plain Maps; cadenza never
 * parses YAML — it receives ready data.
 */

/** Extract the raw front-matter block body (between the leading `---` fences), or ''.
 *  Tolerates trailing spaces/tabs after either fence, matching the lenient parsers the
 *  rest of the app uses (front-matter.ts / directives.js) — else a deck that renders
 *  fine everywhere would have its registry SILENTLY dropped. */
function frontMatterBody(md) {
  if (!md || typeof md !== 'string') return '';
  const m = md.match(/^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/);
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
    // A child of a block object that got under-indented to the entry level would be
    // pulled up and parsed as a bogus term literally named `expansion`/`definition`
    // (author-error garbage-in). Skip those reserved names as standalone terms.
    if (term === 'expansion' || term === 'definition') { i++; continue; }
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

/**
 * Parse the `captions:` block → Map<number, string> keyed by author slide NUMBER (1-based,
 * the number the author sees). Value is the exact text that slide reads; quotes are optional
 * (strip one layer, to protect a deliberate leading/trailing space). A non-integer key or an
 * empty value is skipped. Later duplicate keys win (last-wins). Slide numbers are kept
 * as-authored — the consumer maps number→array-index (Present maps through the ORIGINAL slide
 * index so an authored number survives a filtered lens; see PresentOverlay).
 */
function parseCaptions(body) {
  const out = new Map();
  const lines = blockLines(body, 'captions');
  if (!lines.length) return out;
  const entryIndent = Math.min(...lines.map((l) => l.indent));
  for (const line of lines) {
    if (line.indent !== entryIndent) continue; // ignore stray deeper lines (captions are flat)
    const m = line.text.match(/^(\d+)\s*:\s*([\s\S]*)$/);
    if (!m) continue;
    const text = unquote(m[2]);
    // A lone YAML block/folded scalar indicator (`>`, `|`, `>-`, `|+`, `>2` …) is NOT a caption —
    // its body is on deeper-indented continuation lines this flat parser doesn't read. Skip it
    // rather than narrate the stray glyph (the house has no multi-line front-matter values).
    if (!text || /^[|>][+-]?\d*$/.test(text)) continue;
    out.set(Number(m[1]), text);
  }
  return out;
}

/**
 * Parse a deck source's narration front-matter. Returns the acronym registry Map (Layer 2)
 * and the front-matter captions Map (Layer 1, slide-number keyed) — both empty when their key
 * is absent. The single entry point both producers call, so they can't drift (#904).
 */
export function parseNarrationFrontMatter(md) {
  const body = frontMatterBody(md);
  return { acronyms: parseAcronyms(body), captions: parseCaptions(body) };
}

/**
 * The cadenza-ready acronym map: term → spoken EXPANSION (the definition is dropped —
 * narration speaks the expansion; the definition is for a future glossary). Both
 * producers call this so the term→expansion projection lives once.
 */
export function acronymSpokenMap(md) {
  const out = new Map();
  for (const [term, entry] of parseNarrationFrontMatter(md).acronyms) out.set(term, entry.expansion);
  return out;
}

/**
 * The front-matter captions map: slide NUMBER (1-based) → the text that slide reads. A thin
 * projection of `parseNarrationFrontMatter().captions` so a consumer (the Present memo, the
 * export sidecar) has a single call, symmetric with `acronymSpokenMap`.
 */
export function frontMatterCaptions(md) {
  return parseNarrationFrontMatter(md).captions;
}

export default { parseNarrationFrontMatter, acronymSpokenMap, frontMatterCaptions };
