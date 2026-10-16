/**
 * lib/plugins/code/shared/record-edit.js — the `@code{…}` record's WRITER: change some fields of a
 * record and only their words (engineering/decisions/2026-10-15-code-plugin.md §11). The Studio's
 * Compose record editor writes through it, via lib/authoring/inline-editors.js.
 *
 * Its own module so the linter, which only reads records (record.js), does not carry it: the Studio's
 * lint bundle has a size ceiling (docs/route-budget.json lintCoreGz).
 */

const { SPEC, readBody, recordBody } = require('./record.js');
const { parse: segnoParse } = require('@laticent/segno/read');

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

/**
 * The record (`@code{…}`, or '' for none) with some fields changed, and ONLY those words changed:
 * every other byte the author wrote stays, so an editor's write round-trips and a diff shows the
 * one word. `edit` maps a field to its new value; `null`, `false` or `''` removes it. Returns the new
 * record text, '' when no field is left (the record line goes), or null when the edit cannot be made
 * safely: the record does not parse, a field is written twice, a field is unknown, or the result
 * does not read back as asked. Never a guess. The Studio's Compose record editor writes through this
 * (docs/src/components/studio/code-record-editor.tsx, via lib/authoring/inline-editors.js).
 */
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

module.exports = { editRecord, fieldProblem };
