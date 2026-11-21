/**
 * lib/core/resolve-narration.mjs
 *
 * Deck front-matter → narration reference data, parsed ONCE and shared (HARD RULE #1)
 * by both narration producers: the CLI/export caption sidecar (lattice.js,
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
 * The `terms:` block (2026-11-16) merges those two: one map of what a term means (`expansion`), how it is
 * said (`pronounce`) and what it is (`definition`). `termEntries` / `termsSpokenMap` read all three keys
 * as one registry; `acronyms:` and `lexicon:` remain as aliases.
 *
 * A slide's `<!-- @say{…} -->` (highest precedence) is recognized by the producers, not here —
 * this file only owns the front-matter blocks. The front-matter `say:` map was removed on
 * 2026-11-20 (engineering/decisions/2026-11-20-four-notes.md N6); a slide's say line lives on
 * the slide. Pure + dependency-free
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

/**
 * A value with its YAML comment cut off, as YAML reads it: a `#` after whitespace, outside quotes,
 * starts a comment (`Yearn: yurn # the protocol` says "yurn"). A quote opens a string only at the
 * START of a scalar (the value's start, or after `{`, `,` or `:` in a flow map), so the apostrophe in
 * `Derby's place` is a letter, and a `#` with no space before it (`C#`) is part of the word.
 */
function withoutComment(s) {
  let quote = '';
  let prev = ''; // the last non-space character outside a string
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (quote === '"' && c === '\\') i++; // `\"` and `\\` inside a double-quoted string are escapes, not its end
      else if (c === quote) quote = '';
      continue;
    }
    if ((c === '"' || c === "'") && (prev === '' || prev === '{' || prev === ',' || prev === ':')) {
      quote = c;
      continue;
    }
    if (c === '#' && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i).trimEnd();
    if (!/\s/.test(c)) prev = c;
  }
  return s;
}

/** Strip one layer of matching straight quotes; trim. A DOUBLE-quoted value also decodes the
 *  escapes the Studio writer emits (`\"`→`"`, `\\`→`\`, via front-matter.ts `quoteIfNeeded`), so a
 *  UI-written value containing a quote/backslash round-trips losslessly; single quotes don't escape. */
function unquote(s, { comments = true } = {}) {
  const t = (comments ? withoutComment(String(s ?? '')) : String(s ?? '')).trim();
  if (t.length >= 2 && t[0] === '"' && t.at(-1) === '"') return t.slice(1, -1).replace(/\\(["\\])/g, '$1');
  if (t.length >= 2 && t[0] === "'" && t.at(-1) === "'") return t.slice(1, -1);
  return t;
}

/**
 * The child lines of a top-level `key:` block — every subsequent line indented deeper
 * than the key line, stopping at the first line dedented back to the root. Returns []
 * when the key is absent or has no indented body.
 *
 * The header is matched ONLY at the front-matter ROOT indent (column 0). A same-named
 * key NESTED under another block — e.g. a `acronyms:` sub-key under `lexicon:` — is
 * indented, so it must NOT open a block of its own; otherwise its children would be
 * double-parsed (once as the parent's body, again as this key's block). Front-matter
 * registry keys are always top-level, so a root-only match loses nothing real.
 */
function blockLines(body, key) {
  const lines = body.split(/\r?\n/);
  const out = [];
  // The LAST root header of the key is the block (#3050, D1): a repeated key reads as its last line
  // everywhere, as js-yaml reads a repeated map key; `lint:deck` warns on the earlier ones
  // (`duplicate-key`). `key :` is the same key.
  // The LAST root line of the key, block header or not: when that line is a flow form (`acronyms: {…}`),
  // which this reader does not parse, the earlier block is dead and the read is empty, as it would be for
  // that line alone.
  const start = lines.findLastIndex((line) => {
    const m = line.match(/^([A-Za-z][\w-]*)[ \t]*:/); // root indent only — no leading space
    return m && m[1] === key;
  });
  if (start < 0 || !/:[ \t]*$/.test(withoutComment(lines[start]))) return out; // `terms: # note` is still a block header
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '') continue; // blank lines don't end a block
    if (line.trim().startsWith('#')) continue; // nor do comment lines, at any indent: YAML ignores them
    const indent = line.match(/^(\s*)/)[1].length;
    if (indent === 0) break; // dedent back to a root sibling → block over
    out.push({ indent, text: line.trim(), raw: line });
  }
  return out;
}

/** Split a flow-object body `a: x, b: "y, z"` on top-level commas (quote-aware). */
function splitFlowPairs(inner) {
  const parts = [];
  let buf = '';
  let quote = '';
  let depth = 0; // a nested `{…}` (a term's own fields inside `terms: {…}`) is one pair
  for (const ch of inner) {
    if (quote) {
      buf += ch;
      if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      buf += ch;
    } else if (ch === ',' && depth === 0) {
      parts.push(buf);
      buf = '';
    } else {
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      buf += ch;
    }
  }
  if (buf.trim()) parts.push(buf);
  return parts;
}

/** Parse `expansion: … , definition: …` (inline flow OR block child lines) → object. */
function parseEntryFields(pairs, unknown) {
  const obj = {};
  for (const p of pairs) {
    const kv = p.match(/^\s*([A-Za-z][\w-]*)\s*:\s*([\s\S]*)$/);
    if (!kv) {
      if (unknown && withoutComment(p).trim()) unknown.push(p.trim());
      continue;
    }
    const k = kv[1].toLowerCase();
    if (k === 'expansion' || k === 'definition' || k === 'pronounce') obj[k] = unquote(kv[2]);
    else if (unknown) unknown.push(kv[1]);
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

/** Parse ONE `key:` block of `"token": spoken` lines → Map<token, spoken>. A flat map; the token
 *  may be a glyph or a single bare word, or ANY quoted string (a multi-word phrase must be quoted —
 *  a bare key runs only up to the first space or colon); an empty value is KEPT (the "silence" form). */
function parseTokenMap(body, key) {
  const out = new Map();
  const lines = blockLines(body, key);
  if (!lines.length) return out;
  const entryIndent = Math.min(...lines.map((l) => l.indent));
  for (const line of lines) {
    if (line.indent !== entryIndent) continue; // flat map — ignore stray deeper lines
    // key: value — a quoted token (may contain spaces), or a bare run up to the first colon.
    const m = line.text.match(/^(?:"([^"]+)"|'([^']+)'|([^\s:]+))\s*:\s*([\s\S]*)$/u);
    if (!m) continue;
    const tok = m[1] ?? m[2] ?? m[3];
    if (!tok) continue;
    out.set(tok, unquote(m[4])); // empty value = silence (deliberate)
  }
  return out;
}

/**
 * Parse the deck's read-aloud LEXICON → Map<token, spoken>. The author's say-as overrides: a
 * TOKEN (a glyph like `→`, or a word/name like `Kubernetes`) → how to say it, or `""` to silence
 * it. Beats the built-in Speech Symbol Commons (cadenza/symbols.ts). Read from the `lexicon:` block:
 *
 *   lexicon:
 *     "→": leads to           # override the built-in "to"
 *     Kubernetes: koober-net-eez   # teach a word the voice mangles
 *     "🎯": ""                # silence a decorative glyph
 *
 * Later duplicate keys win (last-wins). A missing key is skipped; an empty VALUE is kept. (The key
 * shipped in #949 as `symbols:` and was renamed to `lexicon:` in #952 before any release — no alias
 * is carried; `lexicon:` is the sole key.)
 */
function parseLexicon(body) {
  return parseTokenMap(body, 'lexicon');
}

// A `terms:` key, as YAML reads a map key: a quoted string (a glyph, anything), or a PLAIN run that may
// hold spaces (`Oct. Tenth`) up to the colon that ends it. The colon must be followed by a space or the
// line's end. A key with a colon in it (`16:9`) must be quoted, as YAML needs it: unquoted, the reader
// cannot read it and `terms-entry-ignored` says so. A plain
// key never opens with a quote, a bracket or a `#` (a comment); a `- ` list item is turned away before
// this pattern runs. Group 4 (the value) is undefined when the line ends at the colon.
const TERM_KEY = /^(?:"([^"]+)"[ \t]*|'([^']+)'[ \t]*|([^\s"'{}[\]#,][^:]*)):(?:[ \t]([\s\S]*))?$/u;
const ENTRY_FIELDS = new Set(['expansion', 'pronounce', 'definition']);

/**
 * Parse the `terms:` block → Map<term, { expansion?, pronounce?, definition? }>
 * (engineering/decisions/2026-11-16-terms-registry.md §3). A PLAIN value is what the voice says, so it
 * lands in `pronounce`; an empty plain value (`"🎯": ""`) is kept and silences the token. The object
 * form (flow `{…}` or indented child lines) carries any of the three fields. The whole block may also be
 * one flow map (`terms: { Yearn: yurn }`). Later duplicate keys win.
 *
 * Every line the reader does NOT turn into an entry is pushed to `issues` (when given) with the reason,
 * so `lint:deck` reports exactly what this reader skipped rather than re-deriving it (HARD RULE #7).
 */
function parseTerms(body, issues) {
  const out = new Map();
  const note = (raw, problem, detail) => issues?.push({ raw: String(raw).trim(), problem, ...(detail ? { detail } : {}) });
  const entry = (raw, term, rest, childLines) => {
    let fields;
    const unknown = [];
    const value = withoutComment(rest).trim();
    if (value.startsWith('{')) fields = parseEntryFields(splitFlowPairs(value.replace(/^\{/, '').replace(/\}\s*$/, '')), unknown);
    else if (value) fields = { pronounce: unquote(value) }; // `""` / `''` unquote to '' — the silence form
    else fields = parseEntryFields(childLines ?? [], unknown);
    for (const u of unknown) note(raw, 'unknown-field', u);
    if (fields.expansion || fields.definition || fields.pronounce !== undefined) out.set(term, fields);
    else if (!unknown.length) note(raw, 'empty');
  };
  // `terms: { … }` on the header line itself.
  const rootLines = body.split(/\r?\n/);
  const root = rootLines.findLast((l) => /^terms[ \t]*:/.test(l));
  const inline = root ? withoutComment(root.replace(/^terms[ \t]*:/, '')).trim() : '';
  if (inline) {
    if (!inline.startsWith('{')) { note(root, 'not-a-map'); return out; }
    for (const pair of splitFlowPairs(inline.replace(/^\{/, '').replace(/\}\s*$/, ''))) {
      if (!pair.trim()) continue;
      const head = pair.trim().match(TERM_KEY);
      if (!head) { note(pair, 'unreadable'); continue; }
      entry(pair, head[1] ?? head[2] ?? head[3].trim(), head[4] ?? '');
    }
    return out;
  }
  const lines = blockLines(body, 'terms');
  if (!lines.length) return out;
  const entryIndent = Math.min(...lines.map((l) => l.indent));
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.text.startsWith('#')) { i++; continue; } // a comment line
    if (line.indent !== entryIndent) { note(line.text, 'stray'); i++; continue; }
    const listItem = line.text === '-' || line.text.startsWith('- ');
    const head = listItem ? null : line.text.match(TERM_KEY);
    if (!head) {
      note(line.text, listItem ? 'list-item' : 'unreadable');
      i++;
      while (i < lines.length && lines[i].indent > entryIndent) i++; // its children go with it
      continue;
    }
    const term = head[1] ?? head[2] ?? head[3].trim();
    const rest = head[4] ?? '';
    i++;
    const child = [];
    if (!withoutComment(rest).trim()) {
      while (i < lines.length && lines[i].indent > entryIndent) {
        if (!lines[i].text.startsWith('#')) child.push(lines[i].text);
        i++;
      }
    }
    // A child line under-indented to the entry level would read as a term named `pronounce` etc. A
    // QUOTED key is deliberate (the Studio writes a field-named term that way), so only a bare one skips.
    if (head[3] !== undefined && ENTRY_FIELDS.has(term)) { note(line.text, 'field-as-term'); continue; }
    entry(line.text, term, rest, child);
  }
  return out;
}

/**
 * What the `terms:` reader SKIPPED, line by line, and why — the source `lint:deck` reports from, so the
 * warning and the reader can never disagree. Each issue is `{ raw, problem, detail? }`: `problem` is one
 * of `unknown-field` (detail: the field name), `empty`, `list-item`, `unreadable`, `stray`,
 * `field-as-term` or `not-a-map`.
 */
export function termsIssues(md) {
  const issues = [];
  parseTerms(frontMatterBody(md), issues);
  return issues;
}

/**
 * The deck's whole TERM registry: `terms:` plus the two keys it absorbs, as one Map<term,
 * { expansion?, pronounce?, definition?, from }>. `acronyms:` reads with its plain value as the
 * `expansion`; `lexicon:` reads with its plain value as the `pronounce`. On a clash `terms:` wins,
 * then `acronyms:`, then `lexicon:` (the precedence Cadenza already used): `acronyms:` replaces a
 * `lexicon:` entry whole, and a `terms:` entry overrides only the fields it sets. `from` names the key an
 * entry came from, so lint and the Studio can offer to move it.
 */
export function termEntries(md) {
  const { acronyms, lexicon, terms } = parseNarrationFrontMatter(md);
  const out = new Map();
  for (const [term, spoken] of lexicon) out.set(term, { pronounce: spoken, from: 'lexicon' });
  // An acronyms: entry REPLACES a lexicon one whole: it always beat it, and keeping the lexicon's
  // spoken form beside the expansion would make the lexicon win now.
  for (const [term, entry] of acronyms) out.set(term, { ...entry, from: 'acronyms' });
  // A terms: entry is merged FIELD BY FIELD over whatever the older keys said, so `terms: CRO: {
  // definition: … }` beside `acronyms: CRO: …` adds the definition and keeps the expansion it is spoken by.
  for (const [term, entry] of terms) {
    const prev = out.get(term);
    const { from: _from, ...kept } = prev ?? {};
    out.set(term, { ...kept, ...entry, from: 'terms' });
  }
  return out;
}

/**
 * What the voice says for each term: `pronounce`, else `expansion` (an empty `pronounce` silences).
 * The ONE map every narration producer hands Cadenza as `terms` (HARD RULE #1).
 */
export function termsSpokenMap(md) {
  const out = new Map();
  for (const [term, entry] of termEntries(md)) {
    const spoken = entry.pronounce ?? entry.expansion;
    if (spoken !== undefined) out.set(term, spoken);
  }
  return out;
}

/**
 * Parse a deck source's narration front-matter. Returns the acronym registry Map (Layer 2), the
 * read-aloud lexicon (say-as overrides) and the term registry — each empty when its key is absent. The single entry point both producers call, so
 * they can't drift (#904).
 */
export function parseNarrationFrontMatter(md) {
  const body = frontMatterBody(md);
  return { acronyms: parseAcronyms(body), lexicon: parseLexicon(body), terms: parseTerms(body) };
}

/** The cadenza-ready lexicon: token → spoken form (author beats the built-in commons). Symmetric
 *  with `acronymSpokenMap`, so both producers thread overrides through one call. */
export function lexiconMap(md) {
  return parseNarrationFrontMatter(md).lexicon;
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

/** The FULL acronym registry: term → { expansion, definition? } — the definition KEPT (unlike
 *  `acronymSpokenMap`), for the Studio Acronyms editor which round-trips both fields. */
export function acronymEntries(md) {
  return parseNarrationFrontMatter(md).acronyms;
}

/**
 * The deck's narration language — the value of the Marp `lang:` front-matter directive
 * (lib/engine/directives.js recognizes it; it also sets the document language for a11y),
 * lowercased, or null when absent. The locale GUARD (#919): both narration producers pass this
 * to Cadenza's `buildTrack`, which bypasses the English lexicon + number/period expansion for
 * a non-English deck (see `isEnglishLang` in cadenza's normalize) so narration doesn't inject
 * English words into a non-English deck's captions. Extracted here (once, HARD RULE #1) so the
 * export sidecar and Present read the SAME key identically. A flat scalar read — matches the
 * house "no multi-line front-matter values" rule the say/acronym parsers assume.
 */
export function frontMatterLang(md) {
  const body = frontMatterBody(md);
  const m = [...body.matchAll(/^lang[ \t]*:[ \t]*(.+?)[ \t]*$/gm)].pop(); // the last repeat wins (#3050, D1)
  const v = m ? unquote(m[1]) : '';
  return v ? v.toLowerCase() : null;
}

export default { parseNarrationFrontMatter, acronymSpokenMap, termEntries, termsSpokenMap, termsIssues, frontMatterLang };
