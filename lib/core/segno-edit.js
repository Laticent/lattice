/**
 * SEGNO RECORD WRITER — change ONE word of an inline record, from the slot's own schema.
 *
 * The Studio's point-and-click editors (docs/src/components/studio, Compose) show an inline object's
 * controls and write what the author picks back into the span (`!{Ada Okafor, hair=coily}`). A writer
 * per notation (`editPill`, `editSpark`) is the careful form and stays where it is. This is the other
 * half: ONE writer that any record slot gets for free, driven by the slot spec the reader already
 * compiles (lib/core/segno-spec.js), so a new kind, including an installed plugin's, can be edited
 * with no new parsing code (engineering/decisions/2026-10-21-compose-point-and-click.md §4).
 *
 * THE PROMISE, as for `editPill`: only the words the author changed are replaced, added or removed.
 * Every other byte keeps its spelling, order and case. The write is READ BACK through the slot, and a
 * result that does not read as the old span plus exactly the requested change returns null: a null is
 * "I would rather not touch it", never a guess.
 *
 * HOW. The slot's `read` lists each word it understood with its parameter, its canonical value and
 * its offsets (`spellings`). Those offsets find a word to replace or delete without knowing the
 * vocabulary, which is the part a per-notation writer has to re-derive. A positional value (the
 * name, the label) has no spelling when it is plain text, so it is found as the Nth unnamed item.
 * Segno's parse tree gives the item bounds for a delete and the place to append. Pure: no DOM, no fs.
 *
 * `edit` maps a parameter to its new value. `null` (or `false` for a flag) removes the word and an
 * absent key leaves it alone. Values: `text` a string, `number` a number or numeral string,
 * `oneOf` one of its words, `indexed` `c3` or 3, `flag` a boolean. `list`, `range` and `record`
 * parameters are not written here (a panel for one has its own writer).
 */

const { parse } = require('@laticent/segno/read');

/** A control character or a Unicode line separator (a tab and a line break are handled before this is asked). */
const isControl = (c) => {
  const n = c.charCodeAt(0);
  return (n < 0x20 && n !== 0x09 && n !== 0x0a && n !== 0x0d) || n === 0x7f || n === 0x2028 || n === 0x2029;
};

/** A value as it is written inside the braces: quoted when it holds a character the notation reserves. */
const NEEDS_QUOTES = /[,|=[\]{}"\\]|^\s|\s$/;
const quote = (t) => `"${t.replace(/(["\\])/g, '\\$1')}"`;

/** @typedef {{type: string, values?: string[], aliases?: Record<string,string[]>, prefix?: string, max?: number, word?: string, named?: boolean}} ParamSpec */

/** The compiled type of a param spec, `{type:'oneOf', ...}` for a bare string type too. */
function typeOf(p) {
  return typeof p === 'string' ? { type: p } : p;
}

/**
 * One value as the slot reads it back (`read(...).value[param]`), from the value an edit asked for, or
 * `undefined` when the edit's value is not one this type takes. The comparison after a write uses it.
 */
function expected(p, value) {
  switch (p.type) {
    case 'text': {
      const t = String(value).replace(/[\r\n]+/g, ' ').trim();
      // A NUL or another control character does not survive a reload (markdown-it replaces NUL), so the name would change on save.
      if (Array.from(t).some(isControl)) return undefined;
      return t === '' ? undefined : t;
    }
    case 'number': {
      const n = typeof value === 'number' ? value : Number(String(value).trim());
      return Number.isFinite(n) ? n : undefined;
    }
    case 'oneOf': {
      const w = String(value).trim().toLowerCase();
      if (p.values.includes(w)) return w;
      for (const [canon, alts] of Object.entries(p.aliases || {})) if (alts.includes(w)) return canon;
      return undefined;
    }
    case 'indexed': {
      const m = new RegExp(`^(?:${p.prefix})?(\\d+)$`, 'i').exec(String(value).trim());
      const n = m ? Number(m[1]) : NaN;
      return Number.isInteger(n) && n >= 1 && n <= p.max ? n : undefined;
    }
    case 'flag':
      return value === true ? true : undefined;
    default:
      return undefined;
  }
}

/** A value as the slot reads it, flattened: a number reads as `{value, signed, unit}`, the rest as themselves. */
const plain = (v) => (v && typeof v === 'object' && 'value' in v ? v.value : v);

/** How a value is spelled: the word itself, or `name=` first for a `named` parameter. */
function spell(name, p, value) {
  let body;
  switch (p.type) {
    case 'text': {
      const t = String(value).replace(/[\r\n]+/g, ' ').trim();
      body = NEEDS_QUOTES.test(t) ? quote(t) : t;
      break;
    }
    case 'indexed':
      body = `${p.prefix}${value}`;
      break;
    case 'flag':
      body = p.word;
      break;
    default:
      body = String(value);
  }
  return p.named ? `${name}=${body}` : body;
}

/** The record's items from a fresh parse, or null when the text is not one record. */
function itemsOf(text) {
  const p = parse(text);
  if (!p.ok || p.item.value.kind !== 'record') return null;
  return p.item.value.items;
}

/** The item that holds the offsets `[from, to)`, or null. */
function itemAt(items, from, to) {
  return items.find((it) => it.from <= from && to <= it.to) || null;
}

/** `text` without `item`, and the comma that separated it. Null when that would empty the braces. */
function without(text, items, item) {
  const i = items.indexOf(item);
  if (items.length === 1) return null;
  return i < items.length - 1 ? text.slice(0, item.from) + text.slice(items[i + 1].from) : text.slice(0, items[i - 1].to) + text.slice(item.to);
}

/** `text` with `word` added after the last item. */
function appended(text, items, word) {
  const last = items[items.length - 1];
  return `${text.slice(0, last.to)}, ${word}${text.slice(last.to)}`;
}

/** One parameter of one record, or null. The span is re-read here so the offsets are never stale. */
function editOne(text, slot, spec, name, value) {
  const r = slot.read(text);
  if (!r.ok) return null;
  const items = itemsOf(text);
  if (!items) return null;

  // A positional value (the name) is the Nth unnamed item, and is never removed: a record with no name is no record.
  const posAt = (spec.positional || []).findIndex((p) => p.name === name);
  if (posAt >= 0) {
    const p = typeOf(spec.positional[posAt].type);
    if (value === null || value === undefined) return null;
    const want = expected(p, value);
    if (want === undefined) return null;
    // The value may be written by name (`!{name=Ada}` reads as an avatar too): then only its value is replaced, and the `name=` stays.
    const byName = items.find((x) => x.name === name);
    if (byName) {
      if (plain(r.value[name]) === want) return text;
      return text.slice(0, byName.value.from) + spell(name, { ...p, named: false }, want) + text.slice(byName.value.to);
    }
    const it = items.filter((x) => x.name === null)[posAt];
    if (!it) return null;
    if (plain(r.value[name]) === want) return text; // already says it: leave its bytes
    return text.slice(0, it.from) + spell(name, { ...p, named: false }, want) + text.slice(it.to);
  }

  const p = spec.params?.[name] ? typeOf(spec.params[name]) : null;
  if (!p || !['text', 'number', 'oneOf', 'indexed', 'flag'].includes(p.type)) return null;
  const spellings = (r.spellings || []).filter((s) => s.param === name);
  if (spellings.length > 1) return null; // two words for one parameter: the span is already ambiguous
  const clearing = value === null || value === undefined || value === false;
  const want = clearing ? undefined : expected(p, value);
  if (!clearing && want === undefined) return null;

  if (!spellings.length) {
    // A text or number parameter has no spelling record: a named one is found by its name.
    if ((p.type === 'text' || p.type === 'number') && p.named) {
      const it = items.find((x) => x.name === name);
      if (it) {
        if (clearing) return without(text, items, it);
        if (plain(r.value[name]) === want) return text;
        const body = p.type === 'text' && NEEDS_QUOTES.test(want) ? quote(want) : String(want);
        return text.slice(0, it.value.from) + body + text.slice(it.value.to);
      }
    }
    if (clearing) return text;
    return appended(text, items, spell(name, p, p.type === 'flag' ? true : want));
  }
  const s = spellings[0];
  const it = itemAt(items, s.from, s.to);
  if (!it) return null;
  if (clearing) return without(text, items, it);
  if (plain(r.value[name]) === (p.type === 'flag' ? true : want)) return text; // already says it
  if (p.type === 'flag') return text;
  // Replace the word's value only: the author's `Hair=` casing and spacing before it stay theirs.
  const written = p.type === 'text' ? (NEEDS_QUOTES.test(want) ? quote(want) : want) : spell(name, { ...p, named: false }, want);
  return text.slice(0, it.value.from) + written + text.slice(it.value.to);
}

/**
 * The span with the changed words replaced, added or removed, or null (never a guess).
 * @param {string} text  the span, e.g. `!{Ada Okafor, hair=coily}`
 * @param {{read: Function}} slot  the compiled slot (`compileSlot(spec)`)
 * @param {{positional?: {name: string, type: any}[], params: Record<string, ParamSpec>}} spec
 * @param {Record<string, string|number|boolean|null>} edit
 * @returns {string|null}
 */
function editRecord(text, slot, spec, edit) {
  const before = slot.read(text);
  if (!before.ok || !edit || typeof edit !== 'object') return null;
  let cur = text;
  for (const [name, value] of Object.entries(edit)) {
    cur = editOne(cur, slot, spec, name, value);
    if (cur === null) return null;
  }
  const after = slot.read(cur);
  if (!after.ok) return null;
  // Read back: the old fields plus exactly the requested change, and nothing else.
  const want = { ...Object.fromEntries(Object.entries(before.value).map(([k, v]) => [k, plain(v)])) };
  for (const [name, value] of Object.entries(edit)) {
    const p = (spec.positional || []).find((x) => x.name === name);
    const ty = typeOf(p ? p.type : spec.params[name]);
    if (value === null || value === undefined || value === false) delete want[name];
    else want[name] = expected(ty, value);
  }
  const got = Object.fromEntries(Object.entries(after.value).map(([k, v]) => [k, plain(v)]));
  for (const k of new Set([...Object.keys(want), ...Object.keys(got)])) if (want[k] !== got[k]) return null;
  return cur;
}

module.exports = { editRecord };
