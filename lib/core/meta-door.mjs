/**
 * lib/core/meta-door.mjs
 *
 * THE DOOR: the slide-metadata record (`<!-- {layout=cards, footer="Q3 review"} -->`, or the long form
 * `<!-- @meta{…} -->`) compiled to the engine's one internal comment, before anything else reads the source
 * (engineering/decisions/2026-10-17-meta-record.md §5.1, step 2).
 *
 *   compileMetaSource(source) → { source, diagnostics }
 *
 * Three things happen, in this order, and nothing else:
 *
 *   1. THE FORGERY GUARD. An authored comment whose text (after `<!--` and any whitespace) begins `lat-meta`,
 *      `lat-pane` or `lat-panes`, in any case, is blanked to `<!-- -->` (same line count). Those spellings are the
 *      engine's own; an author who writes one gets nothing, so no one can hand a reader a value the door did not
 *      check. A comment inside a fence or an inline code span is code, never read, and is left as written.
 *   2. THE RECORDS. Each record comment the engine would read as a block (top level, indented 0 to 3 spaces, one
 *      whole comment, §5.3) is read by `readRecord` and replaced IN PLACE, on the same lines, by ONE internal comment:
 *      `<!-- lat-meta: {"carry":false,"d":{"class":"cards","footer":"Q3 review"}} -->`. Same line count, so no
 *      `token.map` and no lint position moves. A record that does not read is replaced by an EMPTY internal comment
 *      and reported, never dropped silently and never left to fall through to the speaker note.
 *   3. Nothing more. The door does not merge, and it never needs to know where a slide begins: one internal comment
 *      per authored record, and `lattice_directives` merges them with spot, carry and last-wins exactly as it merges
 *      directive comments, because the token rule `expandMetaTokens` (lib/engine/slides.js) hands it one directive
 *      block per key.
 *
 * Records in a list item, a blockquote or another HTML block are not compiled (D1): they stay authored comments,
 * the notes extractor never reads a record-shaped comment as a speaker note, and the linter names the fix
 * (`meta-not-own-line`, `meta-in-html-block`).
 *
 * Pure and fs-free (HARD RULE #7). ESM, because the editor imports it as source.
 */

import { parse as segnoParse } from '@laticent/segno/read';
import { fenceRanges } from './fence-ranges.mjs';
import { decodeCommentText, encodeCommentText, expandInternal, NOTE_FIELDS, readInternal as readInternalRecord, SLIDE_KEYS, UNSAFE_CHARS, writeInternal } from './meta-internal.mjs';
import { CHANNEL_KEYS, FLAG_KEYS, GLOBAL_ONLY_KEYS, HOST_REGISTERS, MARKER_NAMES, REGISTERS, STRUCTURE_KEYS } from './meta-keys.mjs';
import { memoGet, memoSet } from './meta-memo.mjs';

export { decodeCommentText, encodeCommentText, expandInternal, INTERNAL_META_RE, internalEntries, readInternal, writeInternal } from './meta-internal.mjs';

// ── The vocabulary a record speaks ──────────────────────────────────────────

/** `focus-steps` → `focusSteps`: a record name is kebab-case (Segno folds names to lowercase), a directive key camel. */
export const camel = (s) => String(s).replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());

/** The typed class fields, composed onto the slide's class words in this order (§4.2). */
export { NOTE_FIELDS };

export const CLASS_FIELDS = Object.freeze(['layout', 'variant', 'universal', 'modifiers']);


/** Every register a plugin declares (`icon`, `spark`, …), by key: the record writes `icon=bare` as `icon-bare`. */
const PLUGIN_REGISTERS = new Map(REGISTERS.map((r) => [r.key, r]));

/** The host's registers (`finish`, `headline`, `rule`, …), by key: `{finish=ledger}` writes `finish finish-ledger`. */
export const HOST_RECORD_REGISTERS = new Map(HOST_REGISTERS.map((r) => [r.key, r.values]));

/** A register value's class words: one per axis it names, `on`/`off` spelled `with-<key>`/`no-<key>`. */
function registerClasses(reg, value) {
  const out = [];
  const unknown = [];
  for (const word of String(value).trim().toLowerCase().split(/[\s,]+/).filter(Boolean)) {
    const axis = reg.axes.find((a) => a.names.includes(word));
    if (!axis) unknown.push(word);
    else out.push(word === 'on' ? `with-${reg.key}` : word === 'off' ? `no-${reg.key}` : `${reg.key}-${word}`);
  }
  return { out, unknown };
}


// ── Reading one record ──────────────────────────────────────────────────────

/** Is this comment BODY (the text between `<!--` and `-->`) record-shaped: `{` or `@meta{` on the opener line? */
export function isRecordOpener(body) {
  const first = String(body ?? '').split('\n', 1)[0].trimStart();
  return first.startsWith('{') || first.startsWith('@meta{');
}

/**
 * Where the record's braces close: the index just past its `}`, or -1 when they never do inside `body`. A `"` opens
 * a string that `\` escapes inside and a raw newline may not cross; `{` `[` and `}` `]` nest outside strings.
 * Bounded by `body`, which ends at the comment's first `-->`, so an odd quote can never run past the comment (§4.1).
 */
function recordEnd(body, from) {
  let depth = 0;
  let quoted = false;
  for (let i = from; i < body.length; i++) {
    const c = body[i];
    if (quoted) {
      if (c === '\\') i++;
      else if (c === '"') quoted = false;
      else if (c === '\n') return { end: -1, code: 'meta-newline-in-quote' };
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') {
      depth--;
      if (depth === 0) return { end: i + 1, code: null };
      if (depth < 0) return { end: -1, code: 'unterminated-record' };
    }
  }
  return { end: -1, code: 'unterminated-record' };
}

/** The record's wrapped lines joined into one: a newline outside quotes (with the next line's indent) is one space. */
function joinWrapped(text) {
  let out = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      out += c;
      if (c === '\\' && i + 1 < text.length) out += text[++i];
      else if (c === '"') quoted = false;
      continue;
    }
    if (c === '"') quoted = true;
    if (c === '\n') {
      while (i + 1 < text.length && (text[i + 1] === ' ' || text[i + 1] === '\t')) i++;
      out += ' ';
      continue;
    }
    out += c;
  }
  return out;
}

const BLOCK_LINE = /^([a-z][a-z0-9-]*)[ \t]*:[ \t]?(.*)$/;

/**
 * The `key: value` and `key: |` lines after the record (D2). A `|` value is the indented lines below it, dedented
 * by the first one's indent, blank lines kept inside and trimmed at the end. A quoted value is a JSON string.
 */
function readBlockLines(text, diagnostics) {
  const out = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const m = BLOCK_LINE.exec(line);
    if (!m) {
      diagnostics.push({ code: 'meta-block-line', message: `a line after the record is not \`key: value\` or \`key: |\`: ${JSON.stringify(line.trim().slice(0, 60))}` });
      continue;
    }
    const [, key, rest] = m;
    const raw = rest.trim();
    if (raw === '|') {
      const body = [];
      let indent = -1;
      while (i + 1 < lines.length && (!lines[i + 1].trim() || /^[ \t]/.test(lines[i + 1]))) {
        const next = lines[++i];
        if (indent < 0 && next.trim()) indent = next.length - next.trimStart().length;
        body.push(next);
      }
      while (body.length && !body[body.length - 1].trim()) body.pop();
      out.push({ key, value: body.map((l) => l.slice(Math.max(0, Math.min(indent, l.length - l.trimStart().length)))).join('\n') });
      continue;
    }
    if (raw.startsWith('"')) {
      try {
        out.push({ key, value: String(JSON.parse(raw)) });
      } catch {
        diagnostics.push({ code: 'meta-block-line', message: `\`${key}:\` holds a quoted value that does not close` });
      }
      continue;
    }
    out.push({ key, value: raw });
  }
  return out;
}

/**
 * Read one record comment's BODY (the text between `<!--` and `-->`, already cut at the comment's first `-->`).
 *
 * @param {string} body
 * @returns {null | {ok: boolean, carry: boolean, d: Record<string,string>, notes: Record<string,string[]>,
 *   markers: string[], diagnostics: Array<{code: string, message: string}>}}
 *   null when the body is not record-shaped; `ok: false` when it is but does not read (nothing is applied).
 */
export function readRecord(body) {
  if (!isRecordOpener(body)) return null;
  // Every reader of an authored deck (the linter's scan, the editor's class read, the door, plugin admission) reads
  // each record again on every keystroke, and a record is a pure function of its text: the rest are memo hits
  // (record note step 3's keystroke bench). Bounded, and frozen all the way down, so no caller can poison it.
  const key = String(body);
  // Least recently USED out (a deck larger than the memo, read in the same order on every keystroke, would otherwise
  // never hit), keys flat copies, bounded by characters (lib/core/meta-memo.mjs).
  const hit = memoGet(RECORD_MEMO, key);
  if (hit) return hit;
  const rec = deepFreeze(readRecordUncached(key));
  memoSet(RECORD_MEMO, key, rec, RECORD_MEMO_CHARS);
  return rec;
}

const RECORD_MEMO = new Map();
const RECORD_MEMO_CHARS = 1_000_000;
function deepFreeze(v) {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const x of Object.values(v)) deepFreeze(x);
  }
  return v;
}

function readRecordUncached(body) {
  const diagnostics = [];
  const fail = (code, message) => ({ ok: false, carry: false, d: {}, notes: {}, markers: [], diagnostics: [...diagnostics, { code, message }] });
  const text = decodeCommentText(String(body));
  if (/--!>/.test(String(body))) diagnostics.push({ code: 'meta-comment-unsafe', message: 'the comment holds `--!>`, which ends it in a browser; write `--!\\>`' });
  const open = text.indexOf('{');
  const { end, code } = recordEnd(text, open);
  if (end < 0) {
    return code === 'meta-newline-in-quote'
      ? fail(code, 'a quoted value runs onto a new line; keep a value on one line and put long text in a `key: |` block')
      : fail('unterminated-record', 'the record\u2019s braces do not close before the comment ends');
  }
  const recordText = joinWrapped(text.slice(open, end));
  // `{}` is an empty record (what a privacy strip leaves when it removes every inline field); Segno wants a value.
  const empty = /^\{\s*\}$/.test(recordText);
  const parsed = empty ? null : segnoParse(recordText);
  if (parsed && !parsed.ok) return fail('meta-record-syntax', `the record does not read: ${parsed.diagnostic?.message ?? 'syntax error'}`);
  if (parsed && (parsed.item.name !== null || parsed.item.value.kind !== 'record')) return fail('meta-record-syntax', 'the comment holds a value, not a record');

  const entries = [];
  for (const item of parsed ? parsed.item.value.items : []) {
    const v = item.value;
    if (v.kind !== 'scalar') {
      diagnostics.push({ code: 'meta-field-type', message: `\`${item.name ?? '?'}\` holds a ${v.kind}; a field holds one value` });
      continue;
    }
    entries.push({ name: item.name, value: v.text.replace(UNSAFE_CHARS, '') });
  }
  // A FIELD value may not hold a comment terminator (`-->`, `--!>`) once decoded: the engine re-wraps every field in a
  // comment (lib/core/meta-internal.mjs `expandInternal`), and a terminator there would end it early and put the rest
  // on the slide as markup. Notes may hold one; their channel re-escapes it. Dropped and reported (§7's
  // `meta-comment-unsafe`).
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e.name !== null && NOTE_FIELDS.includes(e.name)) continue;
    if (/--!?>/.test(e.value)) {
      diagnostics.push({ code: 'meta-comment-unsafe', message: `\`${e.name ?? e.value}\` holds \`-->\`, which would end the comment; only a note may (write it there, or drop the arrow)` });
      entries.splice(i, 1);
    }
  }
  for (const b of readBlockLines(text.slice(end), diagnostics)) entries.push({ name: b.key, value: b.value.replace(/\r/g, '').replace(UNSAFE_CHARS, '') });

  let carry = false;
  const d = {};
  const notes = {};
  const markers = [];
  const classWords = { typed: [], registers: [], class: [] };
  const typed = {};
  const hostSeen = new Set();
  // The class words land where the FIRST class-shaped field sits, so `{layout=cards, footer=Q3}` writes its
  // attributes in the order `<!-- _class: cards -->` then `<!-- _footer: Q3 -->` does: byte-identical output.
  const holdClassSlot = () => {
    if (!Object.hasOwn(d, 'class')) d.class = '';
  };
  for (const { name, value } of entries) {
    if (name !== null && (CLASS_FIELDS.includes(name) || name === 'class' || PLUGIN_REGISTERS.has(name) || HOST_RECORD_REGISTERS.has(name))) holdClassSlot();
    if (name === null) {
      // A bare word: the `carry` flag, a flag key (`{build}`), or a marker (`{stress-slide}`).
      const word = value.trim();
      if (word === 'carry') carry = true;
      else if (FLAG_KEYS.has(camel(word)) && SLIDE_KEYS.has(camel(word))) d[camel(word)] = '';
      else if (MARKER_NAMES.has(word)) markers.push(word);
      else diagnostics.push({ code: 'meta-unknown-key', message: `\`${word}\` is not a record field or flag` });
      continue;
    }
    if (NOTE_FIELDS.includes(name)) {
      (notes[name] ??= []).push(value);
      continue;
    }
    if (CLASS_FIELDS.includes(name)) {
      typed[name] = value;
      continue;
    }
    if (STRUCTURE_KEYS.has(name)) {
      d[name] = value.trim();
      continue;
    }
    const host = HOST_RECORD_REGISTERS.get(name);
    if (host) {
      // A register is one value on a slide: a second `headline=` would write both words, so it is reported.
      if (hostSeen.has(name)) diagnostics.push({ code: 'meta-repeated-key', message: `\`${name}\` is set twice; keep one` });
      hostSeen.add(name);
      const word = value.trim().toLowerCase();
      if (Object.hasOwn(host, word)) classWords.registers.push(...host[word].split(' '));
      else diagnostics.push({ code: 'meta-field-value', message: `\`${word}\` is not a \`${name}\` value; use one of ${Object.keys(host).join(', ')}` });
      continue;
    }
    const reg = PLUGIN_REGISTERS.get(name);
    if (reg) {
      const { out, unknown } = registerClasses(reg, value);
      classWords.registers.push(...out);
      for (const w of unknown) diagnostics.push({ code: 'meta-field-value', message: `\`${w}\` is not a word of the \`${name}\` register` });
      continue;
    }
    const key = camel(name);
    if (GLOBAL_ONLY_KEYS.has(key)) {
      diagnostics.push({ code: 'meta-deck-only', message: `\`${name}\` is set for the whole deck, in front matter; a slide record cannot set it` });
      continue;
    }
    if (key === 'class') {
      classWords.class.push(...value.trim().split(/\s+/).filter(Boolean));
      continue;
    }
    if (!SLIDE_KEYS.has(key) || name !== name.toLowerCase() || CHANNEL_KEYS.has(name)) {
      diagnostics.push({ code: 'meta-unknown-key', message: `\`${name}\` is not a record field` });
      continue;
    }
    if (Object.hasOwn(d, key)) diagnostics.push({ code: 'meta-repeated-key', message: `\`${name}\` is set twice; the last one wins` });
    d[key] = value.trim();
  }
  for (const f of CLASS_FIELDS) if (typed[f]) classWords.typed.push(...typed[f].trim().split(/\s+/).filter(Boolean));
  // Typed fields, then `class`, then registers: a register word is never the layout, and readers across the Studio and
  // the linter take the FIRST class word as the slide's component (the inversion on step 3).
  const words = [...new Set([...classWords.typed, ...classWords.class, ...classWords.registers])];
  if (words.length) d.class = words.join(' ');
  else delete d.class;
  return { ok: true, carry, d, notes, markers, diagnostics };
}

/** Nothing to do: no record opener and no internal spelling anywhere. The cost of the door on every other deck. */
export const MAY_NEED_DOOR = /<!--\s*(?:\{|@meta\{|lat-)/i;

// ── Pane markers, in every spelling (§5.4.1) ────────────────────────────────

const PANE_COMMENT = /^<!--\s*(_?)(pane|panes)\s*:([^<>]*)-->$/;

/**
 * THE ONE READER of a pane marker or a pane layout comment, in each spelling an author or the door can write:
 * `<!-- _pane: bar no-title -->`, the `<!-- pane: bar -->` alias, `<!-- panes: 60/40 -->`, a record
 * (`<!-- {pane="bar no-title"} -->`, `<!-- @meta{panes="60/40 stack"} -->`, mixed with other fields or not) and the
 * door's internal comment. Every reader of authored pane markers calls this instead of keeping a regex (the Studio's
 * Present overlay, pane pages and probe, Compose, plugin admission, the slice check, the linter through pane-spec).
 *
 * @param {string} text  one whole comment, `<!--` to `-->`
 * @returns {null | {pane: null | {value: string, legacy: boolean}, panes: string | null, spelling: string}}
 *   `legacy` is the `pane:` alias (one component and at most `no-title`; lib/core/pane-spec.js `parseMarker`);
 *   `spelling` is `_pane`, `pane`, `panes`, `record` or `internal`. Null when the comment names neither.
 */
export function parsePaneMarker(text) {
  const t = String(text ?? '').trim();
  if (!t.startsWith('<!--') || !t.endsWith('-->')) return null;
  const m = PANE_COMMENT.exec(t);
  if (m) {
    if (m[2] === 'panes') return m[1] ? null : { pane: null, panes: m[3].trim(), spelling: 'panes' };
    return { pane: { value: m[3].trim(), legacy: !m[1] }, panes: null, spelling: m[1] ? '_pane' : 'pane' };
  }
  const inner = t.slice(4, -3);
  let d = null;
  let spelling = '';
  if (/^\s*lat-meta:/.test(inner)) {
    d = readInternalRecord(t)?.d ?? null;
    spelling = 'internal';
  } else if (isRecordOpener(inner)) {
    const rec = readRecord(inner);
    d = rec?.ok ? rec.d : null;
    spelling = 'record';
  }
  if (!d || (d.pane === undefined && d.panes === undefined)) return null;
  return { pane: d.pane === undefined ? null : { value: d.pane, legacy: false }, panes: d.panes ?? null, spelling };
}

/** Does this comment name a pane (not only a layout)? The cheap question the Studio's overlay asks per slide. */
export function hasPaneMarker(text) {
  return Boolean(parsePaneMarker(text)?.pane);
}

// ── Walking a deck's comments, linearly ──────────────────────────────────────

/**
 * Every closed `<!-- … -->` of `src`, in order, with what the door and the rewriters ask of each: is it in code (one of
 * `code`'s `[start, end)` ranges, sorted), is it inside an inline code span on its line (an odd number of backticks
 * before it), does it stand alone on its line (`lead`, the text before it, when it is the first comment of its line;
 * `tail`, the text after it to the line's end, only then), and its 1-based line.
 *
 * LINEAR, on purpose: a per-comment `lastIndexOf` to the line start, or a slice to the line end, is quadratic on one
 * long line holding thousands of comments (the red team measured 19.7 s for one 320 KB line, 2026-11-10). Here each
 * character is passed a bounded number of times: the line bounds move forward once per line, and the backtick count
 * runs forward with the comments.
 * @param {string} src
 * @param {Array<[number, number]>} code
 * @param {{ steps: number }} [work]  a test's counter of characters passed (HARD RULE #32); callers pass nothing
 * @returns {Generator<{at: number, close: number, end: number, body: string, inCode: boolean, inSpan: boolean,
 *   lead: string | null, tail: () => string, line: number}>}
 */
export function* commentSites(src, code, work) {
  let c = 0;
  let lineStart = 0;
  let lineEnd = -1;
  let lastEnd = -1;
  let ticks = 0;
  let tickPos = 0;
  let line = 1;
  let counted = 0;
  for (let at = src.indexOf('<!--'); at !== -1; ) {
    const close = src.indexOf('-->', at + 4);
    if (close === -1) return;
    const end = close + 3;
    while (c < code.length && code[c][1] <= at) c++;
    if (at > lineEnd) {
      lineStart = src.lastIndexOf('\n', at - 1) + 1;
      lineEnd = src.indexOf('\n', at);
      if (lineEnd === -1) lineEnd = src.length;
      if (work) work.steps += lineEnd - lineStart;
      ticks = 0;
      tickPos = Math.max(tickPos, lineStart);
    }
    if (work) work.steps += Math.max(0, at - tickPos);
    for (; tickPos < at; tickPos++) if (src.charCodeAt(tickPos) === 96) ticks++;
    for (let i = src.indexOf('\n', counted); i !== -1 && i < at; i = src.indexOf('\n', i + 1)) line++;
    counted = at;
    const first = lastEnd <= lineStart;
    const inCode = c < code.length && at >= code[c][0];
    yield {
      at,
      close,
      end,
      body: src.slice(at + 4, close),
      inCode,
      inSpan: ticks % 2 === 1,
      lead: first ? src.slice(lineStart, at) : null,
      tail: () => {
        const e = src.indexOf('\n', end);
        return src.slice(end, e === -1 ? src.length : e);
      },
      line,
    };
    // An opener inside code is no comment, so its `-->` search must not run past the code: `<!-- x` in a fence paired
    // with the next record's `-->` and swallowed the record (the checker on #3136). Resume at the code's end.
    // The same for an opener inside an inline code span (`` `<!--` ``): it is text, so the scan steps past it.
    const next = inCode ? Math.min(end, code[c][1]) : ticks % 2 === 1 ? at + 4 : end;
    lastEnd = next;
    at = src.indexOf('<!--', next);
  }
}

/** Does this site stand alone on its line, 0 to 3 spaces in (§5.3)? */
export function ownLineSite(site) {
  return site.lead !== null && /^ {0,3}$/.test(site.lead) && !site.tail().trim();
}

// ── A record's parts, for the structured edit (lib/core/meta-edit.mjs) ─────

/**
 * One record comment BODY taken apart for an edit: the text before the `{`, each item as the author wrote it, and the
 * `key: value` / `key: |` lines after the braces. Read from the text the author MEANT (the carrier escape decoded);
 * the caller writes it back with `encodeCommentText`. A wrapped record is joined, so an edited record is one line.
 * @param {string} body  the text between `<!--` and `-->`
 * @returns {null | {lead: string, items: Array<{name: string | null, text: string, value: string | null}>, tail: string}}
 *   null when the body is not a record or does not read; `value` is a scalar's text, null for a list or a record.
 */
export function recordParts(body) {
  if (!isRecordOpener(body)) return null;
  const text = decodeCommentText(String(body));
  const open = text.indexOf('{');
  const { end } = recordEnd(text, open);
  if (end < 0) return null;
  const recordText = joinWrapped(text.slice(open, end));
  const empty = /^\{\s*\}$/.test(recordText);
  const parsed = empty ? null : segnoParse(recordText);
  if (parsed && (!parsed.ok || parsed.item.name !== null || parsed.item.value.kind !== 'record')) return null;
  const items = (parsed ? parsed.item.value.items : []).map((it) => ({
    name: it.name,
    text: recordText.slice(it.from, it.to),
    value: it.value.kind === 'scalar' ? it.value.text : null,
  }));
  return { lead: text.slice(0, open), items, tail: text.slice(end) };
}

/** The `key: value` / `key: |` lines of a record's tail, each with the line range it spans. */
export function recordTailBlocks(tail) {
  const lines = String(tail).split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = BLOCK_LINE.exec(lines[i]);
    if (!m) continue;
    const from = i;
    if (m[2].trim() === '|') while (i + 1 < lines.length && (!lines[i + 1].trim() || /^[ \t]/.test(lines[i + 1]))) i++;
    out.push({ key: m[1], from, to: i + 1 });
  }
  return { lines, blocks: out };
}

// ── Removing fields from authored records (the privacy strips) ──────────────

/**
 * Remove the named fields (`note`, `say`) from every record comment in `source`, outside fences: an item inside the
 * braces (`note="…"`) and a `key: value` or `key: |` block after them. A record that loses a field is rewritten from
 * its parsed items (a value quoted only when it must be) and padded to its own line count; one that loses nothing is
 * left byte for byte. This is what `--strip-notes` and `--strip-say` run on the source an export carries, because a
 * record's note is not a comment of its own that the comment scrub could find (record note §10).
 * @param {string} source
 * @param {Iterable<string>} names  record field names, as written (`note`, `say`)
 * @returns {string}
 */
export function stripRecordFields(source, names) {
  const src = String(source ?? '');
  const drop = new Set(names);
  if (!drop.size || !MAY_NEED_DOOR.test(src)) return src;
  let out = '';
  let pos = 0;
  for (const site of commentSites(src, fenceRanges(src))) {
    // A record quoted in a fence or an inline code span is visible slide text, never a record: left as written.
    if (site.inCode || site.inSpan || !isRecordOpener(site.body)) continue;
    const next = withoutFields(site.body, drop);
    if (next === null) continue;
    const have = next.split('\n').length;
    out += `${src.slice(pos, site.at)}<!--${next}${'\n'.repeat(Math.max(0, site.body.split('\n').length - have))} -->`;
    pos = site.end;
  }
  return pos === 0 ? src : out + src.slice(pos);
}

/** One record body without the fields in `drop`, or null when it holds none of them (or does not read). */
function withoutFields(body, drop) {
  // Read the text the author MEANT (the carrier escape decoded), and write it back escaped, so `--\>` round-trips.
  const text = decodeCommentText(body);
  const open = text.indexOf('{');
  const { end } = recordEnd(text, open);
  if (end < 0) return null;
  const recordText = joinWrapped(text.slice(open, end));
  const empty = /^\{\s*\}$/.test(recordText);
  const parsed = empty ? null : segnoParse(recordText);
  if (parsed && (!parsed.ok || parsed.item.value.kind !== 'record')) return null;
  const items = parsed ? parsed.item.value.items : [];
  const tailLines = text.slice(end).split('\n');
  const keptTail = [];
  let dropped = false;
  for (let i = 0; i < tailLines.length; i++) {
    const m = BLOCK_LINE.exec(tailLines[i]);
    if (m && drop.has(m[1])) {
      dropped = true;
      if (m[2].trim() === '|') while (i + 1 < tailLines.length && (!tailLines[i + 1].trim() || /^[ \t]/.test(tailLines[i + 1]))) i++;
      continue;
    }
    keptTail.push(tailLines[i]);
  }
  const keptItems = items.filter((it) => !(it.name !== null && drop.has(it.name)));
  if (keptItems.length !== items.length) dropped = true;
  if (!dropped) return null;
  // A kept field is written back exactly as the author wrote it (Segno's span of it), never re-serialized: a value Segno
  // reads as a list or a record (`footer={a}`) would otherwise change meaning on the way through.
  const item = (it) => recordText.slice(it.from, it.to);
  // An empty record stays `{}`, which reads (the block lines after it still apply).
  const rest = keptTail.join('\n').trimEnd();
  return encodeCommentText(`${text.slice(0, open)}{${keptItems.map(item).join(', ')}}${rest}`);
}

// ── Records back to directive comments, for a renderer that reads only those (the Marp export) ─────────────

/**
 * Every own-line record comment of `source` (outside a fence) rewritten as the directive comments Marp reads: one
 * `<!-- _key: value -->` per field (`<!-- key: value -->` for a `carry` record), the pane structure, the markers, then
 * the notes as plain comments, the reader note last and labeled (`<!-- Reader: … -->`, §7). A record that does not read
 * is dropped, never left for Marp to show as a speaker note. A note's `-->` is written `-- >`, the bridge's form (§7).
 *
 * THE BRIDGE's first pass, which the two Marp producers run first (tools/export-marp.js, the Studio's deck-export.js), so
 * a record deck keeps its layouts and never leaks a record into Marp's notes (§7, step 4). The rest of the bridge is the
 * pass list both producers share (lib/export/marp-directives.mjs `MARP_PASSES`): the Lattice-only keys this writes
 * (`_focusSteps`, `_build`) go at `withMarpDirectivesOnly`, after the hide bake has read `_hide`.
 *
 * A record that loses a field on the way (a field value holding `-->`, which would end Marp's comment: §7's
 * `meta-comment-unsafe`) is never written truncated: the field is left out, and the reason goes into `report` with the
 * record's 1-based line, which the CLI export turns into an error and the Studio into a warning.
 * `legacy: true` writes the ENGINE's directive form instead of Marp's, for the byte-identity proof that a record deck
 * renders as its comment form does (test/integration/invariants/meta-record-identity.test.js): values unquoted (the
 * engine reads a quote as part of nothing YAML-ish), and a record holding a reader note, or a note that would read as a
 * directive, left as written, because the comment form has no spelling for either.
 * @param {string} source
 * @param {Array<{code: string, message: string, line: number}>} [report]  receives the records' diagnostics
 * @param {{legacy?: boolean}} [opts]
 * @returns {string}
 */
export function recordsToComments(source, report, { legacy = false } = {}) {
  const src = String(source ?? '');
  if (!MAY_NEED_DOOR.test(src)) return src;
  let out = '';
  let pos = 0;
  for (const site of commentSites(src, fenceRanges(src))) {
    if (site.inCode || !ownLineSite(site) || !isRecordOpener(site.body)) continue;
    const rec = readRecord(site.body);
    if (report) for (const d of rec.diagnostics) report.push({ ...d, line: site.line });
    const parts = rec.ok ? (expandInternal(writeInternal(rec)) ?? []) : [];
    // Left as written in the legacy form: a reader note and a directive-shaped note have no comment spelling, and a pane
    // record that also carries a note renders the carve's internal comments into the HTML (an invisible step-2
    // difference, followups.d/2772-p3-pane-record-note-internal-comments.md), so its comment form is not byte-identical.
    if (legacy && (parts.some((p) => /^<!-- reader: /.test(p.text) || (p.noteOnly && readDirectiveLike(/^<!-- lat-note: ([\s\S]*) -->$/.exec(p.text)?.[1] ?? ''))) || (rec.d.pane !== undefined && Object.keys(rec.notes).length))) continue;
    const marp = parts.map((p) => {
      const reader = /^<!-- reader: ([\s\S]*) -->$/.exec(p.text);
      const note = p.noteOnly ? /^<!-- lat-note: ([\s\S]*) -->$/.exec(p.text) : null;
      // A directive value is YAML to Marp: one that starts with a YAML indicator, holds `: ` or ` #`, or is empty is
      // written as a JSON string, which YAML reads back unchanged (§7).
      const dir = note || reader ? null : /^<!-- (_?[A-Za-z]\w*): (.*) -->$/.exec(p.text);
      const value = dir ? dir[2].replace(/^"(.*)"$/, '$1') : null;
      let text = p.text;
      if (reader) text = `<!-- Reader: ${reader[1]} -->`;
      // A note is a plain comment to Marp. One whose words read as a directive would be one there, so it says `Note:`.
      else if (note) text = readDirectiveLike(note[1]) ? `<!-- Note: ${note[1]} -->` : `<!-- ${note[1]} -->`;
      else if (!legacy && dir && (value === '' || /^[\s'"&*!|>%@`{[\]#,?-]|: | #|\s$/.test(value))) text = `<!-- ${dir[1]}: ${JSON.stringify(value)} -->`;
      // The engine's own escape (`--\>`) means nothing to Marp; its notes get the bridge's `-- >`.
      return text.replace(/--(!?)\\+>/g, '-- $1>');
    });
    out += src.slice(pos, site.at) + marp.join('\n');
    pos = site.end;
  }
  return pos === 0 ? src : out + src.slice(pos);
}

/** Would Marp read this note text as a directive (`_class: x`, `footer: y`) or a Lattice channel? */
function readDirectiveLike(text) {
  return /^\s*_?[A-Za-z][\w-]*\s*:/.test(text) || /^\s*(?:\{|@meta\{)/.test(text);
}
