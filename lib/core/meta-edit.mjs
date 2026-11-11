/**
 * lib/core/meta-edit.mjs
 *
 * The STRUCTURED EDIT of a slide's comment directives: read one key's span, set or clear it
 * surgically. The Studio's "This slide" drawer is the user. It is the write half of
 * lib/core/meta-record.mjs (design note 2026-10-17-meta-record.md §5.2) in its own module so the
 * linter, which only reads, does not ship it: the lint core is a route-budget metric.
 *
 * It also holds `classifyComment`, which the linter does not call: the notes extractor takes it at step 2.
 *
 * RECORDS (step 3 of the record note). A slide whose value comes from a record (`<!-- {layout=cards, footer=Q3} -->`)
 * is edited IN the record: the field is set, replaced or removed and every other item is written back exactly as the
 * author wrote it. A `class` edit keeps the record's typed fields where it can: a word the edit removes leaves the
 * field that wrote it (`layout`, `variant`, a register), a host register word the edit adds is written as its field
 * (`head-left` → `headline=left`, `finish-ledger` → `finish=ledger`), a plugin register word joins its register
 * (`icon-bare` → `icon=bare`), and a new layout word fills the `layout` the edit emptied. The rest goes to `class`.
 * A key the slide does not set is added to the slide's record when it has one the engine reads, and otherwise
 * written as a new record (`<!-- {footer=Q3} -->`): the form the cut (step 6) leaves standing.
 *
 * Pure, fs-free, ESM.
 */

import { CLASS_FIELDS, encodeCommentText, HOST_RECORD_REGISTERS, NOTE_FIELDS, readRecord, recordParts, recordTailBlocks } from './meta-door.mjs';
import { KNOWN_KEYS, kebab, REGISTERS } from './meta-keys.mjs';
import { recordValue } from './meta-migrate.mjs';
import { commentBlocks, directiveKey, isRecordBody, readMarker, readMeta } from './meta-record.mjs';
import { scanMetaSource } from './meta-scan.mjs';

/**
 * Locate and parse a slide's directive for `key` (the first comment carrying it).
 *
 * @param {string} chunk  one slide's source
 * @param {string} key
 * @returns {{value: string, present: boolean, editable: boolean, reason?: 'array-form'|'duplicate'|'record',
 *   record?: boolean, valueSpan?: [number, number], commentSpan?: [number, number], soleDirective?: boolean}}
 *   `record`: the value comes from a record, edited in it; `reason: 'record'`: from a record that does not read.
 */
export function readMetaField(chunk, key) {
  const text = String(chunk ?? '');
  // The Studio asks this for every slide on every keystroke, and only the slide being typed in has changed: an answer
  // is a pure function of (slide text, key), so the rest are memo hits. Bounded; frozen, so no caller can poison it.
  const memoKey = `${key}\u0000${text}`;
  const hit = FIELD_MEMO.get(memoKey);
  if (hit) return hit;
  const answer = Object.freeze(readMetaFieldUncached(text, key));
  if (FIELD_MEMO.size >= FIELD_MEMO_MAX) FIELD_MEMO.delete(FIELD_MEMO.keys().next().value);
  FIELD_MEMO.set(memoKey, answer);
  return answer;
}

const FIELD_MEMO = new Map();
const FIELD_MEMO_MAX = 512;

function readMetaFieldUncached(text, key) {
  // A slide-metadata RECORD that sets this key (`<!-- {layout=cards} -->`, record note §4): its value is read, so the
  // editor shows what the engine applies, but it is not editable here. A structured edit of a record is step 3 of the
  // record note (`writeMeta` on records); until then a write would add a directive comment above the record, which the
  // record overrides (last wins), so the edit would silently do nothing.
  //
  // The answer is the scan's, which resolves as the engine does: a later directive comment beats an earlier record (last
  // wins), and a record inside a list item or blockquote applies nothing. Only a slide that holds a record pays for it.
  const records = commentBlocks(text).filter((c) => isRecordBody(c.body));
  if (records.length) {
    const won = scanMetaSource(text).slides.at(-1)?.resolved.get(key);
    if (won?.record) {
      const c = records.findLast((b) => text.slice(b.start, b.end).trim() === won.text.trim()) ?? records[records.length - 1];
      // Editable when the record reads back into parts; a record that does not read is the linter's (`meta-record`).
      if (!recordParts(c.body)) return { value: won.value, present: true, editable: false, reason: 'record', commentSpan: [c.start, c.end] };
      return { value: won.value, present: true, editable: true, record: true, commentSpan: [c.start, c.end] };
    }
  }
  const lineRe = new RegExp(`(?:^|\\n)([ \\t]*)_?${key}\\s*:[ \\t]*([^\\n]*)`);
  const probe = new RegExp(`(?:^|\\n)\\s*_?${key}\\s*:`);
  const carriers = commentBlocks(text).filter((c) => probe.test(c.body));
  if (!carriers.length) return { value: '', present: false, editable: true };
  if (carriers.length > 1) return { value: '', present: true, editable: false, reason: 'duplicate' };

  const c = carriers[0];
  // The `_key:` line within the comment body: the value runs to end-of-line. Other lines
  // (`_header: ""`) are left be.
  const line = c.body.match(lineRe);
  if (!line) return { value: '', present: false, editable: true };
  const rawValue = line[2];
  if (/^\[/.test(rawValue.trim())) return { value: '', present: true, editable: false, reason: 'array-form' };

  const matchStartInBody = (line.index ?? 0) + line[0].length - rawValue.length;
  const absValueStart = c.bodyStart + matchStartInBody;
  // Trim trailing whitespace from the value span so the ` -->` gap is never disturbed.
  const trimmed = rawValue.replace(/[ \t]+$/, '');
  const absValueEnd = absValueStart + trimmed.length;
  const other = c.body.split('\n').some((l) => l.trim() && !probe.test(`\n${l}`) && directiveKey(l) !== '');
  return {
    value: trimmed,
    present: true,
    editable: true,
    valueSpan: [absValueStart, absValueEnd],
    commentSpan: [c.start, c.end],
    soleDirective: !other,
  };
}

/** `value` with no comment terminator left in it (`-->`, `--!>`): a run of dashes right before `>` or `!>` becomes one
 * dash. One linear pass, no regex: a long run of dashes costs what its length costs. */
function noCommentEnd(value) {
  const out = [];
  for (const ch of String(value)) {
    if (ch === '>') {
      const bang = out.at(-1) === '!' ? out.pop() : '';
      let dashes = 0;
      while (out.at(-1) === '-') {
        out.pop();
        dashes++;
      }
      if (dashes) out.push('-');
      if (bang) out.push(bang);
    }
    out.push(ch);
  }
  return out.join('');
}

/**
 * Set (or clear, with an empty value) one spot directive of a slide, span-surgically:
 *   · present + editable → splice the value range, touching nothing else;
 *   · empty value + sole-directive comment → remove the whole comment (and one blank-line gap);
 *   · empty value + compound comment → drop just that key's line;
 *   · absent + non-empty → prepend `<!-- _key: value -->` as the chunk's first line;
 *   · not editable (a YAML array, a duplicate) → returned unchanged; the caller gates on
 *     `readMetaField(...).editable`.
 *
 * @param {string} chunk  one slide's source
 * @param {Record<string, string|null>} patch  key → value; null or '' clears
 * @returns {string}
 */
export function writeMeta(chunk, patch) {
  let text = String(chunk ?? '');
  for (const [key, want] of Object.entries(patch)) {
    if (!KNOWN_KEYS.has(key)) throw new Error(`writeMeta: "${key}" is not a slide-metadata key`);
    text = writeOne(text, key, want == null ? '' : String(want));
  }
  return text;
}

function writeOne(text, key, rawValue) {
  const dir = readMetaField(text, key);
  if (!dir.editable) return text;
  // Never close the comment early.
  const value = noCommentEnd(rawValue);
  if (dir.record) return rewriteRecord(text, dir.commentSpan, key, value);
  if (!dir.present) {
    if (!value) return text;
    const home = readRecordOf(text);
    if (home) return rewriteRecord(text, home, key, value);
    const lead = `<!-- {${newItem(key, value).text}} -->`;
    return text.trim() ? `${lead}\n\n${text.replace(/^\n+/, '')}` : lead;
  }
  if (value) {
    const [s, e] = dir.valueSpan;
    return text.slice(0, s) + value + text.slice(e);
  }
  // Clearing: rebuild the comment from its remaining lines; if none is left, remove the whole
  // comment and one trailing blank-line gap.
  const [cs, ce] = dir.commentSpan;
  const inner = text.slice(cs + 4, ce - 3);
  const own = new RegExp(`^_?${key}\\s*:`);
  const kept = inner.split('\n').map((l) => l.trim()).filter((l) => l && !own.test(l));
  if (kept.length) return `${text.slice(0, cs)}<!-- ${kept.join('\n')} -->${text.slice(ce)}`;
  let end = ce;
  const gap = text.slice(ce).match(/^[ \t]*\r?\n(?:[ \t]*\r?\n)?/);
  if (gap) end += gap[0].length;
  return (text.slice(0, cs) + text.slice(end)).replace(/^\n+/, '');
}

// ── Records ─────────────────────────────────────────────────────────────────

/** Every register a plugin declares, by key. */
const PLUGIN_RECORD_REGISTERS = new Map(REGISTERS.map((r) => [r.key, r]));

/** Does this record field write class words? */
const classShaped = (name) => CLASS_FIELDS.includes(name) || name === 'class' || HOST_RECORD_REGISTERS.has(name) || PLUGIN_RECORD_REGISTERS.has(name);

/** A new record item for `key` (a directive key, camelCase) set to `value`. */
function newItem(key, value) {
  const name = kebab(key);
  return { name, text: `${name}=${recordValue(value)}`, value };
}

/** The class words one record item writes, as the door reads them. */
function itemWords(item) {
  if (item.name === null || item.value === null) return [];
  return (readRecord(` {${item.text}} `)?.d.class ?? '').split(' ').filter(Boolean);
}

/**
 * The span of the record a new key joins: the slide's first record the engine reads (top level, its own line, not
 * folded into another block), or null.
 */
function readRecordOf(text) {
  const read = readLines(text);
  for (const b of commentBlocks(text)) {
    if (!isRecordBody(b.body) || !recordParts(b.body)) continue;
    if (read.has(text.slice(0, b.start).split('\n').length)) return [b.start, b.end];
  }
  return null;
}

/** The 1-based lines of the records the engine reads: top level, own line, not folded into another block. */
function readLines(text) {
  const read = new Set();
  for (const slide of scanMetaSource(text).slides) {
    for (const c of slide.comments) if ((c.kind === 'record' || c.record) && !c.prefixed && !c.nested && !c.folded && !c.bareOpener) read.add(c.line);
  }
  return read;
}

/** The host register value a class word names (`head-left` → headline=left; `finish-ledger` → finish=ledger). */
const HOST_WORD = new Map();
for (const [key, values] of HOST_RECORD_REGISTERS) {
  for (const [name, words] of Object.entries(values)) HOST_WORD.set(words.split(' ').at(-1), { key, name, words: words.split(' ') });
}

/** The plugin register and axis word a class word names (`icon-bare` → icon, bare; `no-icon` → icon, off). */
function pluginWord(word) {
  for (const reg of PLUGIN_RECORD_REGISTERS.values()) {
    if (word === `with-${reg.key}`) return { key: reg.key, word: 'on' };
    if (word === `no-${reg.key}`) return { key: reg.key, word: 'off' };
    if (word.startsWith(`${reg.key}-`)) {
      const w = word.slice(reg.key.length + 1);
      if (reg.axes.some((a) => a.names.includes(w))) return { key: reg.key, word: w };
    }
  }
  return null;
}

/** The record's items after a `class` edit to `tokens` (see the module header for which field each word lands in). */
function classItems(items, tokens) {
  const want = new Set(tokens);
  const covered = new Set();
  const out = [];
  let layoutAt = -1;
  for (const it of items) {
    if (it.name === null || it.value === null || !classShaped(it.name)) {
      out.push(it);
      continue;
    }
    const words = itemWords(it);
    if (words.length && words.every((w) => want.has(w))) {
      for (const w of words) covered.add(w);
      out.push(it);
      continue;
    }
    if (HOST_RECORD_REGISTERS.has(it.name)) continue;
    if (PLUGIN_RECORD_REGISTERS.has(it.name)) {
      const kept = it.value.trim().split(/[\s,]+/).filter((w) => {
        const cls = itemWords({ name: it.name, text: `${it.name}=${w}`, value: w });
        return cls.length && cls.every((c) => want.has(c));
      });
      for (const w of kept) for (const c of itemWords({ name: it.name, text: `${it.name}=${w}`, value: w })) covered.add(c);
      if (kept.length) out.push({ name: it.name, text: `${it.name}=${recordValue(kept.join(' '))}`, value: kept.join(' ') });
      continue;
    }
    const kept = words.filter((w) => want.has(w));
    for (const w of kept) covered.add(w);
    if (kept.length) out.push({ name: it.name, text: `${it.name}=${recordValue(kept.join(' '))}`, value: kept.join(' ') });
    else if (it.name === 'layout' && layoutAt < 0) layoutAt = out.length;
  }
  let left = [...new Set(tokens)].filter((w) => !covered.has(w));
  // Host registers first, so `finish` (the finish's companion word) is covered by `finish-ledger` wherever it sits.
  for (const w of left) {
    const host = HOST_WORD.get(w);
    if (!host || !host.words.every((x) => want.has(x))) continue;
    out.push({ name: host.key, text: `${host.key}=${host.name}`, value: host.name });
    for (const x of host.words) covered.add(x);
  }
  left = left.filter((w) => !covered.has(w));
  const plugin = new Map();
  for (const w of left) {
    const p = pluginWord(w);
    if (!p) continue;
    (plugin.get(p.key) ?? plugin.set(p.key, []).get(p.key)).push(p.word);
    covered.add(w);
  }
  for (const [key, words] of plugin) {
    const at = out.findIndex((it) => it.name === key);
    const value = [...(at >= 0 ? it2words(out[at]) : []), ...words].join(' ');
    const item = { name: key, text: `${key}=${recordValue(value)}`, value };
    if (at >= 0) out[at] = item;
    else out.push(item);
  }
  left = left.filter((w) => !covered.has(w));
  if (left.length && layoutAt >= 0) {
    const w = left.shift();
    out.splice(layoutAt, 0, { name: 'layout', text: `layout=${recordValue(w)}`, value: w });
  }
  if (left.length) {
    const at = out.findIndex((it) => it.name === 'class');
    const value = [...(at >= 0 ? it2words(out[at]) : []), ...left].join(' ');
    const item = { name: 'class', text: `class=${recordValue(value)}`, value };
    if (at >= 0) out[at] = item;
    else out.push(item);
  }
  return out;
}

const it2words = (it) => String(it.value ?? '').trim().split(/[\s,]+/).filter(Boolean);

/** The record's items and tail after setting (or, with '', clearing) one non-class field. */
function fieldEdit(parts, key, value) {
  const name = kebab(key);
  const mine = (it) => it.name === name || (it.name === null && String(it.value ?? '').trim() === name);
  const { lines, blocks } = recordTailBlocks(parts.tail);
  const drop = new Set();
  for (const b of blocks) if (b.key === name) for (let i = b.from; i < b.to; i++) drop.add(i);
  let tail = lines.filter((_, i) => !drop.has(i)).join('\n');
  const items = [];
  let placed = false;
  const block = NOTE_FIELDS.includes(name) && value.includes('\n');
  for (const it of parts.items) {
    if (!mine(it)) items.push(it);
    else if (!placed && value && !block) {
      items.push(newItem(key, value));
      placed = true;
    }
  }
  if (!placed && value && !block) items.push(newItem(key, value));
  if (block) {
    const body = value.split('\n').map((l) => (l.trim() ? `  ${l}` : '')).join('\n');
    tail = `${tail.trimEnd()}\n${name}: |\n${body}\n`;
  }
  return { items, tail };
}

/** `text` with the record at `span` set to `key: value` (cleared when `value` is ''); the record is removed when empty. */
function rewriteRecord(text, span, key, value) {
  const [cs, ce] = span;
  const parts = recordParts(text.slice(cs + 4, ce - 3));
  if (!parts) return text;
  let items;
  let tail = parts.tail;
  if (key === 'class') items = classItems(parts.items, value.split(/\s+/).filter(Boolean));
  else ({ items, tail } = fieldEdit(parts, key, value));
  if (!items.length && !recordTailBlocks(tail).blocks.length) {
    let end = ce;
    const gap = text.slice(ce).match(/^[ \t]*\r?\n(?:[ \t]*\r?\n)?/);
    if (gap) end += gap[0].length;
    return (text.slice(0, cs) + text.slice(end)).replace(/^\n+/, '');
  }
  const close = /\s$/.test(tail) || tail.includes('\n') ? '' : ' ';
  const body = encodeCommentText(`${parts.lead}{${items.map((it) => it.text).join(', ')}}${tail}`);
  return `${text.slice(0, cs)}<!--${body}${close}-->${text.slice(ce)}`;
}

/**
 * ONE whole comment with record field `name` set to `value`: a record that reads is edited in place (its other fields
 * kept as written), anything else is replaced by a new record holding only that field. Compose's pane writers use it,
 * so a pane picked in Compose is written in the record form (record note §5.4.1).
 * @param {string} comment  `<!-- … -->`, or '' for none
 * @param {string} name  a record field name as written (`pane`, `panes`, `footer`)
 * @param {string} value
 * @returns {string}
 */
export function setCommentField(comment, name, value) {
  const text = String(comment ?? '').trim();
  const v = noCommentEnd(String(value ?? '').trim());
  if (text.startsWith('<!--') && text.endsWith('-->') && recordParts(text.slice(4, -3))) return rewriteRecord(text, [0, text.length], name, v);
  return `<!-- {${name}=${recordValue(v)}} -->`;
}

/**
 * A note channel (`note`, `reader`, `say`, `describe`) the slide's records carry: its text, or null when no record the
 * engine reads carries it. The Studio's note editors read this first, so a record slide's note shows where it lives.
 * Several values (several `note` lines) are several paragraphs.
 * @param {string} chunk  one slide's source
 * @param {'note'|'reader'|'say'|'describe'} name
 * @returns {string | null}
 */
export function readRecordChannel(chunk, name) {
  const span = channelRecord(String(chunk ?? ''), name);
  if (!span) return null;
  return readRecord(String(chunk).slice(span[0] + 4, span[1] - 3)).notes[name].join('\n\n');
}

/**
 * Set (or clear, with '') a note channel IN the record that carries it. Null when no record the engine reads carries
 * the channel: the caller writes its comment form as before. A value with a line break becomes a `key: |` block.
 * @param {string} chunk
 * @param {'note'|'reader'|'say'|'describe'} name
 * @param {string} value
 * @returns {string | null}
 */
export function writeRecordChannel(chunk, name, value) {
  const text = String(chunk ?? '');
  const span = channelRecord(text, name);
  if (!span) return null;
  return rewriteRecord(text, span, name, String(value ?? '').trim());
}

/** The span of the first record the engine reads that carries the note channel `name`. */
function channelRecord(text, name) {
  if (!NOTE_FIELDS.includes(name) || !text.includes('<!--')) return null;
  const read = readLines(text);
  for (const b of commentBlocks(text)) {
    if (!isRecordBody(b.body) || !read.has(text.slice(0, b.start).split('\n').length) || !recordParts(b.body)) continue;
    if (readRecord(b.body)?.notes[name]?.length) return [b.start, b.end];
  }
  return null;
}

/**
 * Classify a comment BODY (the text between `<!--` and `-->`).
 *   `directive`  an engine directive (`_class: …`, `footer: …`, a bare flag such as `_build`)
 *   `marker`     a registered marker (`stress-slide`)
 *   `record`     record-shaped (`{…}` / `@meta{…}`)
 *   `note`       anything else: a speaker note, or a tooling pragma the caller filters
 * @param {string} body
 * @returns {{kind: 'directive'|'marker'|'record'|'note', key?: string, spot?: boolean}}
 */
export function classifyComment(body) {
  const raw = `<!--${body}-->`;
  // A record first: the shared grammar reads one as a directive now, and a record is its own kind.
  if (isRecordBody(body)) return { kind: 'record' };
  const dir = readMeta(raw);
  if (dir) return { kind: 'directive', key: dir.key, spot: dir.spot };
  if (readMarker(raw)) return { kind: 'marker' };
  return { kind: 'note' };
}

export default { classifyComment, readMetaField, readRecordChannel, setCommentField, writeMeta, writeRecordChannel };
