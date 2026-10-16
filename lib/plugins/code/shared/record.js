/**
 * lib/plugins/code/shared/record.js — the `@code{…}` record: what an author writes in an inline code
 * span directly above a fence to configure that fence, and the deck's `code:` default
 * (engineering/decisions/2026-10-15-code-plugin.md §7).
 *
 *   `@code{title=load.ts, numbers, focus=3-5}`
 *   ```ts
 *   …
 *   ```
 *
 * The record is a Segno record (the inline notation every `@kind{…}` uses), read by one slot, so the
 * renderer and the linter read it the same way (HARD RULE #1, #7). Line targets (`focus=`, `mark=`)
 * use the `_focus: line` grammar, `3-5 9`, through the same parser (lib/core/collections.js
 * `parseIndexList`), so a range means the same in a directive and in a record.
 *
 * Pure and light: Segno's reader and two core kernels. The linter bundles it.
 */

const { compileSlot } = require('../../../core/segno-spec.js');
const { parseIndexList } = require('../../../core/collections.js');
const { topLevelFrontMatterValue } = require('../../../core/front-matter-key.js');
const { parse: segnoParse } = require('@laticent/segno/read');

/** `indent=` values: spaces per level, or a tab (drawn four columns wide). */
const INDENTS = Object.freeze(['2', '4', 'tab']);

/** How many columns a tab takes, on the panel and in the line-width count: the indent, or 4 for `tab`. */
const tabColumns = (indent) => (indent === '2' ? 2 : 4);

/** The fields. `format`, `width`, `dialect`, `indent` and `quotes` are read here and acted on by the
 *  formatter (`lattice fmt` and the Studio's Format command; lib/authoring/code-format/). `indent` also
 *  sets how wide the render draws a tab (code.styles.css `data-indent`). `copy` puts the copy buttons
 *  on a block in a browser (lib/core/code-copy.mjs). */
const SPEC = Object.freeze({
  label: 'code options',
  params: {
    title: { type: 'text', named: true },
    numbers: { type: 'flag', word: 'numbers' },
    start: { type: 'number', named: true },
    focus: { type: 'text', named: true },
    mark: { type: 'text', named: true },
    diff: { type: 'flag', word: 'diff' },
    wrap: { type: 'flag', word: 'wrap' },
    format: { type: 'oneOf', values: ['on', 'off'], named: true },
    copy: { type: 'oneOf', values: ['on', 'off'], named: true },
    width: { type: 'number', named: true },
    dialect: { type: 'text', named: true },
    indent: { type: 'oneOf', values: INDENTS, named: true },
    quotes: { type: 'oneOf', values: ['single', 'double'], named: true },
  },
});

/** The bare words `format` and `copy` (on) are the common case; `=off` turns a deck default off. */
const BARE_SWITCH = /(^|[{,]\s*)(format|copy)(\s*(?=[,}]))/g;

let slot = null;
const codeSlot = () => (slot ??= compileSlot(SPEC, 'code.record'));

/** A span's text is a code record when it is exactly `@code{…}`. */
const RECORD_RE = /^@code(\{[\s\S]*\})$/;

/** The highest first line number `start=` takes: six digits, the widest number column drawn. */
const MAX_START = 999999;

/**
 * Read a record body (`{…}`) into options. Never throws.
 * @returns {{ ok: true, value: object } | { ok: false, problems: string[] }}
 */
function readBody(body) {
  const text = String(body).replace(BARE_SWITCH, '$1$2=on$3');
  const r = codeSlot().read(text);
  if (!r.ok) return { ok: false, problems: (r.diagnostics || []).filter((d) => d.severity === 'error').map((d) => d.message) };
  const v = r.value;
  // Segno reads a number as `{ value, signed, unit }`; a column count or a line number is a bare whole number.
  const whole = (n) => (n && typeof n === 'object' && !n.unit && !n.signed && Number.isInteger(n.value) ? n.value : null);
  const said = (n) => (n && typeof n === 'object' ? `${n.signed && n.value >= 0 ? '+' : ''}${n.value}${n.unit || ''}` : String(n));
  const problems = [];
  const out = {};
  if (typeof v.title === 'string' && v.title.trim()) out.title = v.title.trim();
  if (v.numbers) out.numbers = true;
  if (v.start !== undefined) {
    const n = whole(v.start);
    // Six digits is the widest number column the panel draws (code.styles.css `data-digits`).
    if (n !== null && n >= 0 && n <= MAX_START) out.start = n;
    else problems.push(`start=${said(v.start)} is not a whole line number from 0 to ${MAX_START}`);
  }
  for (const key of ['focus', 'mark']) {
    if (v[key] === undefined) continue;
    const invalid = [];
    const lines = parseIndexList(v[key], invalid);
    if (invalid.length) problems.push(`${key}=${v[key]}: "${invalid.join('", "')}" is not a line or a range (write 3-5 9)`);
    if (lines.size) out[key] = lines;
  }
  if (v.diff) out.diff = true;
  if (v.wrap) out.wrap = true;
  if (v.format) out.format = v.format === 'on';
  if (v.copy) out.copy = v.copy === 'on';
  if (v.width !== undefined) {
    const w = whole(v.width);
    if (w !== null && w >= 20 && w <= 200) out.width = w;
    else problems.push(`width=${said(v.width)} must be a whole number of columns from 20 to 200`);
  }
  if (typeof v.dialect === 'string' && v.dialect.trim()) out.dialect = v.dialect.trim().toLowerCase();
  if (v.indent) out.indent = v.indent;
  if (v.quotes) out.quotes = v.quotes;
  return problems.length ? { ok: false, problems, value: out } : { ok: true, value: out };
}

/** A span's text (`@code{…}`) → its record body, or null when it is not a code record. */
function recordBody(text) {
  const m = typeof text === 'string' ? RECORD_RE.exec(text) : null;
  return m ? m[1] : null;
}

/**
 * The deck's `code:` default (`code: numbers, wrap`), read from the front matter BODY (no `---`),
 * as options; `{}` when there is none or it does not read.
 */
function deckDefaults(frontMatter) {
  const raw = topLevelFrontMatterValue(frontMatter, 'code');
  if (raw === null || !raw.trim()) return {};
  const r = readBody(`{${raw.trim().replace(/^\{|\}$/g, '')}}`);
  return r.value || {};
}

/** Options for one fence: the deck's defaults, then the block's own record over them. */
function merge(defaults, own) {
  return { ...defaults, ...own };
}

/** A value written into a record: quoted when it holds a character the notation reserves. */
const NEEDS_QUOTES = /[,|=[\]{}"\\]|^\s|\s$/;
const valueText = (v) => {
  const t = String(v).replace(/[\r\n]+/g, ' ');
  return NEEDS_QUOTES.test(t) ? `"${t.replace(/(["\\])/g, '\\$1')}"` : t;
};

/** The word one field is written as, or null when the edit removes it. A value holding a backtick
 *  or a line break is `undefined`: the record lives in an inline code span, which neither survives. */
function wordFor(key, value) {
  const param = SPEC.params[key];
  if (value === null || value === undefined || value === '') return null;
  if (/[`\r\n]/.test(String(value))) return undefined;
  if (param.type === 'flag') return value ? key : null;
  // `format` and `copy`: the bare word is on; `=off` turns a deck default off for this block.
  if (key === 'format' || key === 'copy') return value === true || value === 'on' ? key : `${key}=off`;
  if (key === 'focus' || key === 'mark') {
    const lines = value instanceof Set || Array.isArray(value) ? [...value] : null;
    return `${key}=${valueText(lines ? lines.join(' ') : value)}`;
  }
  return `${key}=${valueText(value)}`;
}

/** Which field a record item is: its name, or the bare word it is (`numbers`, `format`). */
function fieldOf(item) {
  if (item.name) return String(item.name).toLowerCase();
  const word = item.value?.kind === 'scalar' && !item.value.quoted ? String(item.value.text).toLowerCase() : null;
  return word && SPEC.params[word] && (SPEC.params[word].type === 'flag' || word === 'format' || word === 'copy') ? word : null;
}

/**
 * The record (`@code{…}`, or '' for none) with some fields changed, and ONLY those words changed:
 * every other byte the author wrote stays, so an editor's write round-trips and a diff shows the
 * one word. `edit` maps a field to its new value; `null`, `false` or `''` removes it. Returns the new
 * record text, '' when no field is left (the record line goes), or null when the edit cannot be made
 * safely: the record does not parse, a field is written twice, a field is unknown, or the result
 * does not read back as asked. Never a guess. The Studio's Compose record editor writes through this
 * (docs/src/components/studio/code-record-editor.tsx, via lib/authoring/inline-editors.js).
 */
/**
 * Why one field's new value does not read (`focus=3-` is not a range, `width=10` is under 20), or
 * null when it does. The editor shows this rather than a generic refusal.
 */
function fieldProblem(key, value) {
  if (!SPEC.params[key]) return `${key} is not a field of the code record`;
  const word = wordFor(key, value);
  if (word === undefined) return 'a value cannot hold a backtick or a line break';
  if (word === null) return null;
  const r = readBody(`{${word}}`);
  return r.ok ? null : r.problems.join('; ');
}

function editRecord(text, edit) {
  const src = String(text ?? '').trim();
  const body = src ? recordBody(src) : '{}';
  if (body === null || !edit || typeof edit !== 'object') return null;
  let cur = body === '{}' ? '' : body;
  for (const [key, value] of Object.entries(edit)) {
    if (!SPEC.params[key]) return null;
    const word = wordFor(key, value);
    if (word === undefined) return null;
    if (!cur) {
      if (word !== null) cur = `{${word}}`;
      continue;
    }
    const p = segnoParse(cur);
    if (!p.ok || p.item.value.kind !== 'record') return null;
    const items = p.item.value.items;
    const at = items.map((it, i) => (fieldOf(it) === key ? i : -1)).filter((i) => i >= 0);
    if (at.length > 1) return null; // written twice: the author's record is already ambiguous
    if (at.length === 0) {
      if (word === null) continue;
      const last = items[items.length - 1];
      cur = `${cur.slice(0, last.to)}, ${word}${cur.slice(last.to)}`;
      continue;
    }
    const i = at[0];
    const it = items[i];
    if (word === null) {
      if (items.length === 1) { cur = ''; continue; }
      cur = i < items.length - 1 ? cur.slice(0, it.from) + cur.slice(items[i + 1].from) : cur.slice(0, items[i - 1].to) + cur.slice(it.to);
      continue;
    }
    if (cur.slice(it.from, it.to) === word) continue;
    // Same value, spelled the author's way (`format=on`, `focus=3-5  9`): leave their bytes.
    const was = readBody(`{${cur.slice(it.from, it.to)}}`);
    const now = readBody(`{${word}}`);
    if (was.ok && now.ok && same(was.value[key], now.value[key])) continue;
    cur = cur.slice(0, it.from) + word + cur.slice(it.to);
  }
  if (!cur) return '';
  const after = readBody(cur);
  if (!after.ok) return null;
  for (const [key, value] of Object.entries(edit)) {
    const word = wordFor(key, value);
    const want = word === null ? undefined : readBody(`{${word}}`).value?.[key];
    if (!same(after.value[key], want)) return null;
  }
  return `@code${cur}`;
}

/** Two read field values are the same (a Set of lines compares by its lines). */
function same(a, b) {
  if (a instanceof Set || b instanceof Set) {
    return a instanceof Set && b instanceof Set && a.size === b.size && [...a].every((n) => b.has(n));
  }
  return a === b;
}

module.exports = { SPEC, INDENTS, tabColumns, RECORD_RE, editRecord, fieldProblem, readBody, recordBody, deckDefaults, merge };
