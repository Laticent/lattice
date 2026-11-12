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
 * (`icon-bare` → `icon=bare`), and the edit's first new word fills a `layout` (then a `variant`) the same edit emptied,
 * so a layout or variant swap stays typed. The rest goes to `class`.
 * A key the slide does not set is added to the slide's record when it has one the engine reads, and otherwise
 * written as the directive comment the slide is in (`<!-- _footer: Q3 -->`): the form follows the slide until the cut
 * (step 6, the owner's D3), because Marp and VS Code read only comments.
 *
 * Pure, fs-free, ESM.
 */

import { CLASS_FIELDS, encodeCommentText, HOST_RECORD_REGISTERS, NOTE_FIELDS, readRecord, recordParts, recordTailBlocks } from './meta-door.mjs';
import { recordValue } from './meta-internal.mjs';
import { KNOWN_KEYS, kebab, REGISTERS } from './meta-keys.mjs';
import { memoGet, memoHolds, memoSet } from './meta-memo.mjs';
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
  // is a pure function of (slide text, key), so the rest are memo hits. Bounded; frozen (its spans too), so no caller can
  // poison it.
  // A slide too large to hold (a pasted data-URI photo) is read each time: building, hashing and copying a key of
  // megabytes cost more than the read, and holding it evicted every other slide's answer (lib/core/meta-memo.mjs).
  if (!memoHolds(text, FIELD_MEMO_CHARS)) return freezeAnswer(readMetaFieldUncached(text, key));
  const memoKey = `${key}\u0000${text}`;
  const hit = memoGet(FIELD_MEMO, memoKey);
  if (hit) return hit;
  const answer = freezeAnswer(readMetaFieldUncached(text, key));
  memoSet(FIELD_MEMO, memoKey, answer, FIELD_MEMO_CHARS);
  return answer;
}

function freezeAnswer(raw) {
  for (const span of [raw.valueSpan, raw.commentSpan]) if (span) Object.freeze(span);
  return Object.freeze(raw);
}

const FIELD_MEMO = new Map();
// Bounded by CHARACTERS, not entries: one slide can hold a pasted data-URI image.
const FIELD_MEMO_CHARS = 2_000_000;

function readMetaFieldUncached(text, key) {
  // A slide-metadata RECORD that sets this key (`<!-- {layout=cards} -->`, record note §4): its value is read, so the
  // editor shows what the engine applies, but it is not editable here. A structured edit of a record is step 3 of the
  // record note (`writeMeta` on records); until then a write would add a directive comment above the record, which the
  // record overrides (last wins), so the edit would silently do nothing.
  //
  // The answer is the scan's, which resolves as the engine does: a later directive comment beats an earlier record (last
  // wins), and a record inside a list item or blockquote applies nothing. Only a slide that holds a record pays for it.
  const lineRe = new RegExp(`(?:^|\\n)([ \\t]*)_?${key}\\s*:[ \\t]*([^\\n]*)`);
  const probe = new RegExp(`(?:^|\\n)\\s*_?${key}\\s*:`);
  // A record's own lines (a `note: |` block reading `class: …`) are never a directive comment (the red team on step 3).
  // A speaker note with a line that happens to start `focus:` is not a carrier: the engine reads no field there (the
  // checker on #3136). Only a comment whose first line is not a directive key can be a note, so only then is the slide
  // scanned.
  let carriers = commentBlocks(text).filter((c) => !isRecordBody(c.body) && probe.test(c.body));
  if (carriers.some((c) => directiveKey(c.body.trim().split('\n')[0]) === '')) {
    const readings = commentReadings(text);
    carriers = carriers.filter((c) => readings.get(lineAt(text, c.start))?.kind !== 'note');
  }
  // Only the records the ENGINE reads: a twin in a blockquote or a list item applies nothing, so an edit there would
  // change nothing on the slide (the red team, #3136).
  const live = liveRecordBlocks(text);
  if (live.length) {
    const scan = scanMetaSource(text).slides.at(-1);
    // A key set in two places (two records, or a record and a comment) is last-wins: clearing the winner would bring the
    // other back, so the editor leaves it to the markdown, as it does two `_class` comments (the red team, #3136).
    const setting = live.filter((b) => readRecord(b.body)?.d[key] !== undefined);
    if (setting.length + carriers.length > 1) return { value: scan?.resolved.get(key)?.value ?? '', present: true, editable: false, reason: 'duplicate' };
    const won = scan?.resolved.get(key);
    if (won?.record) {
      const c = live.findLast((b) => text.slice(b.start, b.end).trim() === won.text.trim());
      if (!c) return { value: won.value, present: true, editable: false, reason: 'record' };
      // Editable when the record reads back into parts; a record that does not read is the linter's (`meta-record`).
      if (!recordParts(c.body)) return { value: won.value, present: true, editable: false, reason: 'record', commentSpan: [c.start, c.end] };
      return { value: won.value, present: true, editable: true, record: true, commentSpan: [c.start, c.end] };
    }
  }
  if (!carriers.length) return { value: '', present: false, editable: true };
  // Read-only, but the value is the one the engine applies (last wins), so a reader such as Present's section rail still
  // sees the slide's class (the checker on #3136).
  if (carriers.length > 1) return { value: scanMetaSource(text).slides.at(-1)?.resolved.get(key)?.value ?? '', present: true, editable: false, reason: 'duplicate' };

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
    // THE FORM FOLLOWS THE SLIDE. A slide with no record keeps the directive comment it is written in: Marp and VS Code
    // read only comments, so the Studio does not put the record form into a deck that does not use it before the cut
    // (record note §9 step 6, the owner's D3). #3136, the inversion's first finding on #3133.
    const lead = `<!-- _${key}: ${value} -->`;
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
  return removeComment(text, cs, ce);
}

/**
 * `text` without the comment at [cs, ce). The blank line after it goes too, but only when the comment opens the text or
 * follows a blank line: a comment right under a paragraph keeps the gap, so the next paragraph never joins it.
 */
function removeComment(text, cs, ce) {
  let end = ce;
  const before = text.slice(0, cs);
  const opensBlock = !before.trim() || /\n[ \t]*\n[ \t]*$/.test(before);
  if (!opensBlock) {
    // Under a paragraph: the comment's own line goes (the newline before it), the gap after it stays.
    const trail = text.slice(ce).match(/^[ \t]*/)[0].length;
    return before.replace(/\r?\n[ \t]*$/, '') + text.slice(ce + trail);
  }
  const gap = text.slice(ce).match(/^[ \t]*\r?\n(?:[ \t]*\r?\n)?/);
  if (gap) end += gap[0].length;
  return (before + text.slice(end)).replace(/^\n+/, '');
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
 * folded into another block) that sets this slide alone (no `carry`, no pane marker), or null.
 */
function readRecordOf(text) {
  for (const b of liveRecordBlocks(text)) {
    if (!recordParts(b.body)) continue;
    // Never a `carry` record (its fields run on to every later slide) or a pane marker (it travels with its pane, and
    // Compose rewrites it): a one-slide key joins a record that sets this slide alone.
    const rec = readRecord(b.body);
    if (!rec?.ok || rec.carry || Object.hasOwn(rec.d, 'pane') || Object.hasOwn(rec.d, 'panes')) continue;
    return [b.start, b.end];
  }
  return null;
}

/**
 * The record comment blocks of `text` the engine reads, in order. Lines are counted in ONE forward pass: a count per
 * record (`text.slice(0, start).split`) was quadratic, 9 s on a 16k-record slide the drawer reads every keystroke (the
 * red team, #3136).
 */
function liveRecordBlocks(text) {
  const blocks = commentBlocks(text).filter((b) => isRecordBody(b.body));
  if (!blocks.length) return [];
  const read = readLines(text);
  const out = [];
  let line = 1;
  let pos = 0;
  for (const b of blocks) {
    for (let i = text.indexOf('\n', pos); i !== -1 && i < b.start; i = text.indexOf('\n', i + 1)) line++;
    pos = b.start;
    if (read.has(line)) out.push(b);
  }
  return out;
}

/**
 * How the engine reads each comment of `text`, by the 1-based line it starts on:
 *   · `directive` / `record`: the engine applies it, and it sits at the top level on its own line;
 *   · `nested`: a directive comment in a quote or a list item, which the engine applies too, but in place (a record
 *     there applies nothing, so it is absent);
 *   · `note`: a speaker note;
 *   · absent: the engine never applies it (fenced or indented code, folded into an HTML block).
 * Compose hoists only `directive` and `record`, and never past an applied comment that stays and sets the same field;
 * the drawer does not count a `note` as a field's carrier (the checkers on #3136).
 * `keys` are the fields it sets (a directive comment's first key, which is all the engine reads; every field of a record).
 * @param {string} text  one slide's source
 * @returns {Map<number, { kind: 'directive' | 'record' | 'nested' | 'note', keys: Set<string> }>}
 */
export function commentReadings(text) {
  const out = new Map();
  for (const slide of scanMetaSource(String(text ?? '')).slides) {
    for (const c of slide.comments) {
      const record = c.record || c.kind === 'record';
      if (c.kind === 'note') out.set(c.line, { kind: 'note', keys: new Set() });
      else if ((c.kind === 'directive' || c.kind === 'record') && !c.folded && !c.bareOpener && (!record || (!c.prefixed && !c.nested))) {
        const kind = c.prefixed || c.nested ? 'nested' : record ? 'record' : 'directive';
        const entry = out.get(c.line) ?? { kind, keys: new Set() };
        if (c.key) entry.keys.add(c.key);
        out.set(c.line, entry);
      }
    }
  }
  return out;
}

/** The 1-based line `offset` sits on in `text`. */
function lineAt(text, offset) {
  let line = 1;
  for (let i = text.indexOf('\n'); i !== -1 && i < offset; i = text.indexOf('\n', i + 1)) line++;
  return line;
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
    const onOff = reg.axes.some((a) => a.names.includes('on') && a.names.includes('off'));
    if (onOff && word === `with-${reg.key}`) return { key: reg.key, word: 'on' };
    if (onOff && word === `no-${reg.key}`) return { key: reg.key, word: 'off' };
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
  let variantAt = -1;
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
    else if (it.name === 'variant' && variantAt < 0) variantAt = out.length;
  }
  let left = [...new Set(tokens)].filter((w) => !covered.has(w));
  // Host registers first, so `finish` (the finish's companion word) is covered by `finish-ledger` wherever it sits.
  for (const w of left) {
    const host = HOST_WORD.get(w);
    // The identifying word is enough (`finish-halo` names finish=halo; the drawer's finish picker writes no bare
    // `finish`, and the engine reads the two alike).
    if (!host) continue;
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
  // A new word fills the slot the edit emptied: the layout first, then the variant (a variant swap stays typed).
  if (left.length && layoutAt >= 0) {
    const w = left.shift();
    out.splice(layoutAt, 0, { name: 'layout', text: `layout=${recordValue(w)}`, value: w });
    if (variantAt >= layoutAt) variantAt++;
  }
  if (left.length && variantAt >= 0) {
    const w = left.shift();
    out.splice(variantAt, 0, { name: 'variant', text: `variant=${recordValue(w)}`, value: w });
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
function fieldEdit(parts, key, rawValue) {
  const name = kebab(key);
  // A raw line break would end the record's value (Segno reads one line): a note channel keeps it as a `key: |` block,
  // any other field folds it to a space (the red team on step 3).
  const lf = String(rawValue).replace(/\r\n?/g, '\n');
  const value = NOTE_FIELDS.includes(name) ? lf : lf.replace(/\n+/g, ' ').trim();
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
  if (!items.length && !tail.trim()) return removeComment(text, cs, ce);
  const close = /\s$/.test(tail) || tail.includes('\n') ? '' : ' ';
  const body = encodeCommentText(`${parts.lead}{${items.map((it) => it.text).join(', ')}}${tail}`);
  return `${text.slice(0, cs)}<!--${body}${close}-->${text.slice(ce)}`;
}

/**
 * ONE whole comment with record field `name` set to `value`: a record that reads is edited in place (its other fields
 * kept as written); anything else is replaced by the comment form of that field (`<!-- _pane: bar -->`), because the form
 * follows the slide until the cut. Compose's pane writers use it.
 * @param {string} comment  `<!-- … -->`, or '' for none
 * @param {string} name  a record field name as written (`pane`, `panes`, `footer`)
 * @param {string} value
 * @returns {string}
 */
export function setCommentField(comment, name, value) {
  const text = String(comment ?? '').trim();
  const v = noCommentEnd(String(value ?? '').trim());
  if (text.startsWith('<!--') && text.endsWith('-->') && recordParts(text.slice(4, -3))) return rewriteRecord(text, [0, text.length], name, v);
  // Not a record: the comment form, as the form follows the slide (`writeOne`). A pane marker is `_pane:`, a layout
  // `panes:` (the spellings lib/core/meta-door.mjs `parsePaneMarker` reads).
  if (name === 'pane') return `<!-- _pane: ${v} -->`;
  if (name === 'panes') return `<!-- panes: ${v} -->`;
  return `<!-- _${name.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase())}: ${v} -->`;
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
  const text = String(chunk ?? '');
  const spans = channelRecords(text, name);
  if (!spans.length) return null;
  return spans.flatMap(([a, b]) => readRecord(text.slice(a + 4, b - 3)).notes[name]).join('\n\n');
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
  let text = String(chunk ?? '');
  const spans = channelRecords(text, name);
  if (!spans.length) return null;
  // The value goes in the first record that carries the channel; the others lose it, so the slide keeps ONE value
  // (right to left, so the first span stays put).
  for (const span of spans.slice(1).reverse()) text = rewriteRecord(text, span, name, '');
  return rewriteRecord(text, spans[0], name, String(value ?? '').trim());
}

/** The spans of every record the engine reads that carries the note channel `name`, in order. */
function channelRecords(text, name) {
  if (!NOTE_FIELDS.includes(name) || !text.includes('<!--')) return [];
  const out = [];
  for (const b of liveRecordBlocks(text)) {
    if (!recordParts(b.body)) continue;
    if (readRecord(b.body)?.notes[name]?.length) out.push([b.start, b.end]);
  }
  return out;
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
