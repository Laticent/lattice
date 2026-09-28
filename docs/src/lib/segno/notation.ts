/**
 * The inline notation — Segno's first grammar, written in its own vocabulary.
 *
 *   `{BETA, tag, c4}`           a record: a primary value, then words and name=value
 *   `[{Effort, 0..10}, Reach]`  a list; an empty element holds its place: `[, Reach]`
 *   `"Cost, excluding tax"`     quoted text: protects separators, forces the text type
 *   `after=Design`              a named item on its own (a trailing chart pill)
 *   `$4.2M`  `Q1..Q3`  `at-risk` a bare value; its type is the slot's to decide
 *   `\{BETA}`                   the leading backslash turns the whole span off
 *
 * Separators: `,` between items and `=` after a name — nothing else. `|` is reserved: it
 * is an error inside a record, so it can be given a meaning later without breaking a deck.
 * A `{` must be followed directly by a non-space (`{ ok, scene }` is code, not a record).
 *
 * The grammar below is compiled by grammar.ts, which proves it LL(1) — so every span is read
 * in one left-to-right pass, and a hostile span can only cost time in proportion to its
 * length. The proof runs when this module loads; a change that broke it would throw here.
 */

import { compile, type Grammar, MAX_DEPTH, type ParseError } from './grammar.js';
import { parse as parseGenerated } from './notation.generated.js';
import { notationSpec } from './notation-grammar.js';

let compiled: Grammar | null = null;
/** The closure-compiled notation grammar — the reference the generated parser must match. */
export function notationGrammar(): Grammar {
  if (!compiled) compiled = compile(notationSpec);
  return compiled;
}

// ── the tree a reader works with ────────────────────────────────────────────

export interface Scalar {
  readonly kind: 'scalar';
  /** The text, trimmed; for quoted text, unescaped. */
  readonly text: string;
  readonly quoted: boolean;
  readonly from: number;
  readonly to: number;
}
export interface RecordValue {
  readonly kind: 'record';
  readonly items: readonly Item[];
  readonly from: number;
  readonly to: number;
}
export interface ListValue {
  readonly kind: 'list';
  /** `null` is an empty element holding its place. */
  readonly items: readonly (Value | null)[];
  readonly from: number;
  readonly to: number;
}
export type Value = Scalar | RecordValue | ListValue;

export interface Item {
  /** The parameter name for `name=value`, else null. */
  readonly name: string | null;
  readonly value: Value;
  readonly from: number;
  readonly to: number;
}

export interface Diagnostic {
  readonly code: string;
  readonly severity: 'error' | 'warning';
  readonly message: string;
  /** UTF-16 range in the span's text. */
  readonly from: number;
  readonly to: number;
  /** A replacement that fixes it, when there is one. */
  readonly fix?: { readonly from: number; readonly to: number; readonly insert: string };
}

export type Parsed = { ok: true; item: Item } | { ok: false; diagnostic: Diagnostic };

const NAME = /^[A-Za-z][A-Za-z0-9-]*$/;


function unquote(s: string, from: number, to: number): string {
  let out = '';
  for (let i = from + 1; i < to - 1; i++) {
    const c = s[i];
    if (c === '\\' && (s[i + 1] === '"' || s[i + 1] === '\\')) { out += s[i + 1]; i++; continue; }
    out += c;
  }
  return out;
}

class ReadError extends Error {
  constructor(readonly diagnostic: Diagnostic) { super(diagnostic.message); }
}

// The reader walks the generated parser's flat tree (flat.ts): four integers per node — kind,
// from, to, next. Kind numbers are resolved to names once, from the tree's own table.
let K_BARE = -1, K_QUOTED = -1, K_RECORD = -1, K_LIST = -1, K_WORD = -1;
let kindsSeen: readonly string[] | null = null;
function bindKinds(kinds: readonly string[]) {
  if (kinds === kindsSeen) return;
  kindsSeen = kinds;
  K_BARE = kinds.indexOf('bare'); K_QUOTED = kinds.indexOf('quoted'); K_RECORD = kinds.indexOf('record');
  K_LIST = kinds.indexOf('list'); K_WORD = kinds.indexOf('word');
}

function readValue(s: string, b: Int32Array, at: number): Value {
  const kind = b[at];
  const from = b[at + 1];
  const to = b[at + 2];
  const next = b[at + 3];
  if (kind === K_BARE) {
    // A bare run never STARTS with a space (the grammar forbids it), so only its end is
    // trimmed — in place, with no [from, to] pair allocated on the hot path.
    let end = to;
    while (end > from && (s.charCodeAt(end - 1) === 32 || s.charCodeAt(end - 1) === 9)) end--;
    return { kind: 'scalar', text: s.slice(from, end), quoted: false, from, to: end };
  }
  if (kind === K_QUOTED) return { kind: 'scalar', text: unquote(s, from, to), quoted: true, from, to };
  if (kind === K_RECORD) {
    const items: Item[] = [];
    for (let k = at + 4; k < next; k = b[k + 3]) items.push(readItem(s, b, k));
    return { kind: 'record', items, from, to };
  }
  if (kind === K_LIST) {
    // An element's position is the count of commas before it, so an empty element (two
    // commas with nothing between them, or a leading comma) holds its place: `[, Reach]`
    // names the SECOND axis. Trailing empties carry no position and are dropped.
    const items: (Value | null)[] = [];
    let prevEnd = from + 1;
    let first = true;
    for (let k = at + 4; k < next; k = b[k + 3]) {
      let commas = 0;
      for (let c = prevEnd; c < b[k + 1]; c++) if (s.charCodeAt(c) === 44) commas++;
      for (let h = first ? commas : commas - 1; h > 0; h--) items.push(null);
      items.push(itemAsValue(s, b, k));
      prevEnd = b[k + 2];
      first = false;
    }
    return { kind: 'list', items, from, to };
  }
  throw new Error(`segno: unexpected node kind ${kind}`);
}

function itemAsValue(s: string, b: Int32Array, at: number): Value {
  const it = readItem(s, b, at);
  if (it.name !== null) {
    throw new ReadError({ code: 'named-in-list', severity: 'error', message: `"${it.name}=" names a parameter, but a list holds values`, from: it.from, to: it.to });
  }
  return it.value;
}

function readItem(s: string, b: Int32Array, at: number): Item {
  if (b[at] !== K_WORD) {
    const value = readValue(s, b, at);
    return { name: null, value, from: value.from, to: value.to };
  }
  const head = at + 4;
  const nameValue = readValue(s, b, head) as Scalar;
  const tail = b[head + 3];
  if (tail >= b[at + 3]) return { name: null, value: nameValue, from: nameValue.from, to: nameValue.to };
  if (!NAME.test(nameValue.text)) {
    const end = b[tail + 2];
    throw new ReadError({
      code: 'bad-name', severity: 'error',
      message: `"${nameValue.text}" is not a parameter name — to use "=" in a value, quote it`,
      from: nameValue.from, to: end,
      fix: { from: nameValue.from, to: end, insert: quote(s.slice(nameValue.from, end).trim()) },
    });
  }
  const value = readValue(s, b, tail);
  return { name: nameValue.text.toLowerCase(), value, from: nameValue.from, to: value.to };
}

/** `text` as a quoted value that reads back as exactly `text`: only `"` and `\` are escaped. */
const quote = (text: string) => `"${text.replace(/["\\]/g, '\\$&')}"`;

/**
 * Where a quote is left open, scanning as the grammar does: a backslash escapes only INSIDE
 * quotes, so `"x\\"` is closed and a `\` outside quotes is an ordinary character. -1 when
 * every quote closes.
 */
function openQuote(s: string): number {
  let open = -1;
  for (let k = 0; k < s.length; k++) {
    if (open < 0) { if (s[k] === '"') open = k; }
    else if (s[k] === '\\') k++;
    else if (s[k] === '"') open = -1;
  }
  return open;
}

function syntaxDiagnostic(s: string, e: ParseError): Diagnostic {
  const at = e.at;
  if (e.found === '|') {
    return { code: 'reserved-pipe', severity: 'error', message: '"|" is reserved — to use it in a value, quote the value', from: at, to: at + 1 };
  }
  const open = e.found === null ? openQuote(s) : -1;
  if (open >= 0) {
    return { code: 'unclosed-quote', severity: 'error', message: 'this quote is never closed', from: open, to: open + 1, fix: { from: s.length, to: s.length, insert: '"' } };
  }
  if (e.found === '=') {
    // `=` with no name before it: `{=>, Main path}`. Quote the item, up to the next separator.
    // A second `=` (`a=b=c`) is inside a value too: quote from where that value starts.
    let start = at;
    while (start > 0 && !',{}[]"|='.includes(s[start - 1])) start--;
    while (s[start] === ' ' || s[start] === '\t') start++;
    let end = at;
    while (end < s.length && !',{}[]"|'.includes(s[end])) end++;
    const body = s.slice(start, end).trimEnd();
    return {
      code: 'stray-equals', severity: 'error', message: '"=" names a parameter and needs a name before it — to use "=" in a value, quote the value',
      from: at, to: at + 1, fix: { from: start, to: start + body.length, insert: quote(body) },
    };
  }
  if ((e.found === ' ' || e.found === '\t') && s[at - 1] === '{') {
    let end = at;
    while (s[end] === ' ' || s[end] === '\t') end++;
    return { code: 'space-after-brace', severity: 'error', message: 'a record starts with "{" directly followed by its first value', from: at - 1, to: end, fix: { from: at, to: end, insert: '' } };
  }
  if (e.expected.startsWith('at most ')) {
    return { code: 'too-deep', severity: 'error', message: `a span nests at most ${MAX_DEPTH} levels of brackets`, from: at, to: Math.min(at + 1, s.length) };
  }
  if (e.found === null) {
    const closers = unclosed(s);
    if (closers) {
      const what = closers.length === 1 ? `this ${closers === '}' ? 'record' : 'list'} is` : `${closers.length} brackets are`;
      return { code: 'unclosed-bracket', severity: 'error', message: `${what} never closed`, from: s.length, to: s.length, fix: { from: s.length, to: s.length, insert: closers } };
    }
  }
  const found = e.found === null ? 'the end' : JSON.stringify(e.found);
  return { code: 'syntax', severity: 'error', message: `expected ${e.expected}, found ${found}`, from: at, to: Math.min(at + 1, s.length) };
}

/** The closers a span that ends early is missing, innermost first ('' when balanced or mismatched). */
function unclosed(s: string): string {
  const stack: string[] = [];
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (c === '"') { for (k++; k < s.length && s[k] !== '"'; k++) if (s[k] === '\\') k++; continue; }
    if (c === '{') stack.push('}');
    else if (c === '[') stack.push(']');
    else if (c === '}' || c === ']') { if (stack.pop() !== c) return ''; }
  }
  return stack.reverse().join('');
}

/** Parse one span's text (the content of the backticks) into an item. Never throws on input. */
export function parse(text: string): Parsed {
  const r = parseRaw(text);
  if (r.ok || !r.diagnostic.fix) return r;
  return { ok: false, diagnostic: progresses(text, r.diagnostic) ? r.diagnostic : withoutFix(r.diagnostic) };
}

function parseRaw(text: string): Parsed {
  const r = parseGenerated(text);
  if (!r.ok) return { ok: false, diagnostic: syntaxDiagnostic(text, r.error) };
  bindKinds(r.tree.kinds);
  try {
    return { ok: true, item: readItem(text, r.tree.buf, 0) };
  } catch (e) {
    if (e instanceof ReadError) return { ok: false, diagnostic: e.diagnostic };
    throw e;
  }
}

/**
 * Does applying `d`'s fix make progress? The fixed text must parse, or fail only PAST the edit
 * (an unclosed quote's fix may leave an unclosed brace, whose own fix comes next). A fix that
 * leaves the error where it was — `{a,` closed to `{a,}` — is worse than none: it is a button
 * that does nothing.
 */
function progresses(text: string, d: Diagnostic): boolean {
  const f = d.fix as NonNullable<Diagnostic['fix']>;
  const fixed = text.slice(0, f.from) + f.insert + text.slice(f.to);
  const r = parseRaw(fixed);
  return r.ok || r.diagnostic.from >= f.from + f.insert.length;
}

function withoutFix(d: Diagnostic): Diagnostic {
  const { fix: _fix, ...rest } = d;
  return rest;
}

/**
 * Is this span a directive at all, in PROSE (outside a slot a component declares)? Only a
 * record opens one there — `{` then a non-space, non-`}` — so the 95%+ of inline code that is
 * ordinary code is rejected on its first two characters and never reaches the parser.
 * `\` in front turns it off; the caller shows the rest literally.
 */
export function isDirective(text: string): 'directive' | 'escaped' | null {
  let i = 0;
  let escaped = false;
  if (text.charCodeAt(0) === 0x5c /* \ */) { escaped = true; i = 1; }
  if (text.charCodeAt(i) !== 0x7b /* { */) return null;
  const c = text.charCodeAt(i + 1);
  if (Number.isNaN(c) || c === 0x20 || c === 0x09 || c === 0x7d) return null;
  return escaped ? 'escaped' : 'directive';
}
