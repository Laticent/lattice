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
 * A key the slide does not set is added to the slide's record when it has one the engine reads, and otherwise written as
 * a new record, `<!-- @meta{footer=Q3} -->`. A value an old directive comment holds (`<!-- _footer: Q3 -->`) moves into
 * the record when it is edited: into the slide's record if it has one, else into a record that takes the comment's place,
 * so the slide renders byte for byte as before; a running global (`<!-- backgroundColor: x -->`) becomes a `carry` record.
 * Every write is `@meta`, the one spelling Lattice writes (the owner, 2026-11-22, record note §15); the old "form follows
 * the slide" rule (#3136) is retired with it.
 *
 * Pure, fs-free, ESM.
 */

import { metaComment } from './meta-comment.mjs';
import { CLASS_FIELDS, encodeCommentText, HOST_RECORD_REGISTERS, readRecord, recordParts, recordTailBlocks } from './meta-door.mjs';
import { recordValue } from './meta-internal.mjs';
import { FLAG_KEYS, KNOWN_KEYS, kebab, REGISTERS, SLIDE_ONLY_KEYS } from './meta-keys.mjs';
import { memoGet, memoSet } from './meta-memo.mjs';
import { commentBlocks, directiveKey, isRecordBody, readMarker, readMeta } from './meta-record.mjs';
import { scanMetaSource } from './meta-scan.mjs';
import { readNote } from './note-grammar.mjs';

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
  const memoKey = `${key}\u0000${text}`;
  const hit = memoGet(FIELD_MEMO, memoKey, FIELD_MEMO_CHARS);
  if (hit) return hit;
  const raw = readMetaFieldUncached(text, key);
  for (const span of [raw.valueSpan, raw.commentSpan]) if (span) Object.freeze(span);
  const answer = Object.freeze(raw);
  memoSet(FIELD_MEMO, memoKey, answer, FIELD_MEMO_CHARS);
  return answer;
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
    carriers = carriers.filter((c) => readings.get(lineAt(text, c.start))?.kind !== 'comment');
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
 *   · present in a record → edited in the record, every other item kept as written;
 *   · empty value + sole-directive comment → remove the whole comment (and one blank-line gap);
 *   · empty value + compound comment → drop just that key's line;
 *   · absent + non-empty → joins the slide's record, else prepends `<!-- @meta{key=value} -->` as the chunk's first line;
 *   · present in an old directive comment → the value moves into a record (see the module header);
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
    return addToRecord(text, key, value, false);
  }
  // THE SETTING MOVES INTO THE RECORD. The value sits in an old directive comment (`<!-- _footer: Q3 -->`): it leaves
  // that comment (the comment goes when it held nothing else) and is written as a record field, so the Studio never
  // writes the old form (the owner, 2026-11-22: "we only support @meta"). A running global (`<!-- footer: Q3 -->`, no
  // `_`) keeps running: it becomes a `carry` record, so later slides render as they did.
  const [cs, ce] = dir.commentSpan;
  const carry = isRunning(text.slice(cs + 4, ce - 3), key);
  if (!value) return clearCommentKey(text, cs, ce, key);
  if (!carry && readRecordOf(text)) return addToRecord(clearCommentKey(text, cs, ce, key), key, value, false);
  // No record to join: the record takes the comment's place, so the engine meets the setting where it met it before
  // and writes the slide's attributes in the same order (byte-identical HTML).
  const record = metaComment([[key, flagValue(key, value)]], { carry });
  if (dir.soleDirective) return text.slice(0, cs) + record + text.slice(ce);
  const rest = clearCommentKey(text.slice(cs, ce), 0, ce - cs, key);
  return `${text.slice(0, cs)}${record}\n${rest}${text.slice(ce)}`;
}

/** Does this directive comment's `key` line run on to later slides (`footer:`, not `_footer:`)? */
function isRunning(inner, key) {
  const line = inner.split('\n').find((l) => new RegExp(`^\\s*_?${key}\\s*(?::|$)`).test(l));
  return !!line && !/^\s*_/.test(line) && !SLIDE_ONLY_KEYS.has(key);
}

/** `text` with `key`'s line dropped from the directive comment at [cs, ce); the comment goes when nothing is left. */
function clearCommentKey(text, cs, ce, key) {
  const inner = text.slice(cs + 4, ce - 3);
  const own = new RegExp(`^_?${key}\\s*(?::|$)`);
  const kept = inner.split('\n').map((l) => l.trim()).filter((l) => l && !own.test(l));
  if (kept.length) return `${text.slice(0, cs)}<!-- ${kept.join('\n')} -->${text.slice(ce)}`;
  return removeComment(text, cs, ce);
}

/**
 * `text` with `key = value` written as a record field: into the slide's own record when it has one the engine reads
 * (never a `carry` record or a pane marker), else as a new `<!-- @meta{…} -->` on the slide's first line. A `carry`
 * value always gets a record of its own, so it never spreads a one-slide field.
 */
function addToRecord(text, key, value, carry) {
  const home = carry ? null : readRecordOf(text);
  if (home) return rewriteRecord(text, home, key, value);
  const lead = metaComment([[key, flagValue(key, value)]], { carry });
  if (!lead) return text;
  return text.trim() ? `${lead}\n\n${text.replace(/^\n+/, '')}` : lead;
}

/** A bare flag key set to `true` is written bare (`build`); every other value as written. */
const flagValue = (key, value) => (FLAG_KEYS.has(key) && value === 'true' ? true : value);

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
 *   · `comment`: any other comment (one of the four notes, or the author's own);
 *   · absent: the engine never applies it (fenced or indented code, folded into an HTML block).
 * Compose hoists only `directive` and `record`, and never past an applied comment that stays and sets the same field;
 * the drawer does not count a `comment` as a field's carrier (the checkers on #3136).
 * `keys` are the fields it sets (a directive comment's first key, which is all the engine reads; every field of a record).
 * @param {string} text  one slide's source
 * @returns {Map<number, { kind: 'directive' | 'record' | 'nested' | 'comment', keys: Set<string> }>}
 */
export function commentReadings(text) {
  const out = new Map();
  for (const slide of scanMetaSource(String(text ?? '')).slides) {
    for (const c of slide.comments) {
      const record = c.record || c.kind === 'record';
      if (c.kind === 'comment') out.set(c.line, { kind: 'comment', keys: new Set() });
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
  // A raw line break would end the record's value (Segno reads one line), so it folds to a space (the red team on
  // step 3). Long text is a note's, and a note is its own comment.
  const value = String(rawValue).replace(/\r\n?/g, '\n').replace(/\n+/g, ' ').trim();
  const mine = (it) => it.name === name || (it.name === null && String(it.value ?? '').trim() === name);
  const { lines, blocks } = recordTailBlocks(parts.tail);
  const drop = new Set();
  for (const b of blocks) if (b.key === name) for (let i = b.from; i < b.to; i++) drop.add(i);
  const tail = lines.filter((_, i) => !drop.has(i)).join('\n');
  const items = [];
  let placed = false;
  for (const it of parts.items) {
    if (!mine(it)) items.push(it);
    else if (!placed && value) {
      items.push(newItem(key, value));
      placed = true;
    }
  }
  if (!placed && value) items.push(newItem(key, value));
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
 * kept as written); anything else (no comment, or an old `<!-- _pane: bar -->` marker) is replaced by the record
 * `<!-- @meta{pane=bar} -->`, the one spelling Lattice writes (the owner, 2026-11-22). Compose's pane writers use it.
 * @param {string} comment  `<!-- … -->`, or '' for none
 * @param {string} name  a record field name as written (`pane`, `panes`, `footer`)
 * @param {string} value
 * @returns {string}
 */
export function setCommentField(comment, name, value) {
  const text = String(comment ?? '').trim();
  const v = noCommentEnd(String(value ?? '').trim());
  if (text.startsWith('<!--') && text.endsWith('-->') && recordParts(text.slice(4, -3))) return rewriteRecord(text, [0, text.length], name, v);
  // A pane marker keeps its value whole (`pane=bar` or `panes="2 cols"`), as lib/core/meta-door.mjs `parsePaneMarker`
  // reads it; an empty value is written `pane=""`, the pane break with no class.
  if (name === 'pane' || name === 'panes') return `<!-- @meta{${name}=${recordValue(v)}} -->`;
  return metaComment([[name, v]]) || '';
}

/**
 * Classify a comment BODY (the text between `<!--` and `-->`).
 *   `directive`  an engine directive (`_class: …`, `footer: …`, a bare flag such as `_build`)
 *   `marker`     a registered marker (`stress-slide`)
 *   `record`     record-shaped (`{…}` / `@meta{…}`)
 *   `note`       one of the four notes (`@note{…}`, `@say{…}`, `@alt{…}`, `@handout{…}`), with its `name`
 *   `comment`    anything else: a plain comment the author keeps, or a tooling pragma the caller filters
 * @param {string} body
 * @returns {{kind: 'directive'|'marker'|'record'|'note'|'comment', key?: string, spot?: boolean, name?: string}}
 */
export function classifyComment(body) {
  const raw = `<!--${body}-->`;
  // A record first: the shared grammar reads one as a directive now, and a record is its own kind.
  if (isRecordBody(body)) return { kind: 'record' };
  const note = readNote(body);
  if (note) return { kind: 'note', name: note.name };
  const dir = readMeta(raw);
  if (dir) return { kind: 'directive', key: dir.key, spot: dir.spot };
  if (readMarker(raw)) return { kind: 'marker' };
  return { kind: 'comment' };
}

export default { classifyComment, readMetaField, setCommentField, writeMeta };
