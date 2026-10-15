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

/** The fields. `format`, `width` and `dialect` are read here and acted on by the code-format plugin. */
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
    width: { type: 'number', named: true },
    dialect: { type: 'text', named: true },
  },
});

/** The bare word `format` (on) is the common case; `format=off` turns a deck default off. */
const BARE_FORMAT = /(^|[{,]\s*)format(\s*(?=[,}]))/g;

let slot = null;
const codeSlot = () => (slot ??= compileSlot(SPEC, 'code.record'));

/** A span's text is a code record when it is exactly `@code{…}`. */
const RECORD_RE = /^@code(\{[\s\S]*\})$/;

/**
 * Read a record body (`{…}`) into options. Never throws.
 * @returns {{ ok: true, value: object } | { ok: false, problems: string[] }}
 */
function readBody(body) {
  const text = String(body).replace(BARE_FORMAT, '$1format=on$2');
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
    if (whole(v.start) !== null) out.start = whole(v.start);
    else problems.push(`start=${said(v.start)} is not a whole line number`);
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
  if (v.width !== undefined) {
    const w = whole(v.width);
    if (w !== null && w >= 20 && w <= 200) out.width = w;
    else problems.push(`width=${said(v.width)} must be a whole number of columns from 20 to 200`);
  }
  if (typeof v.dialect === 'string' && v.dialect.trim()) out.dialect = v.dialect.trim().toLowerCase();
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

module.exports = { SPEC, RECORD_RE, readBody, recordBody, deckDefaults, merge };
