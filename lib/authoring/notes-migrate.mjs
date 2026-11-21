/**
 * lib/authoring/notes-migrate.mjs
 *
 * THE NOTES MIGRATION: every note a deck wrote the old way, rewritten as one of the four notes
 * (engineering/decisions/2026-11-20-four-notes.md), so the deck shows, speaks and exports what it did before:
 *
 *   <!-- say: … -->                          →  <!-- @say{…} -->
 *   <!-- caption: … --> (retired 2026-09-28)  →  <!-- @note{caption: …} -->   (it was the speaker note since)
 *   <!-- describe: … --> (any case)          →  <!-- @alt{…} -->
 *   <!-- reader: … -->                       →  <!-- @handout{…} -->
 *   <!-- note: … --> (the Studio's form)     →  <!-- @note{…} -->
 *   <!-- a plain comment -->                 →  <!-- @note{a plain comment} -->   (it WAS the speaker note)
 *   a record's note=/say=/describe=/reader=  →  the record without it, then the note's own comment
 *   front-matter `say:` map entry N          →  <!-- @say{…} --> at the end of slide N, unless the slide has its own
 *
 * What it never touches: a directive, a record's other fields, a tooling pragma or marker, a comment already written
 * `@name{…}`, and anything in a code fence or an inline code span (a deck documenting the old syntax keeps it).
 *
 * Pure and fs-free (HARD RULE #7), so the linter's fix (`plain-comment-notes`) and the Studio run it as the CLI does.
 * The CLI is lib/cli/migrate-notes.mjs.
 */

import { RETIRED_NOTE_FIELDS, recordParts, recordTailBlocks } from '../core/meta-door.mjs';
import { encodeCommentText } from '../core/meta-internal.mjs';
import { noteShape, writeNote } from '../core/note-grammar.mjs';
import { frontMatterBlockOf, slideBoundaries } from '../core/slide-boundaries.mjs';

import notesCore from './notes-core.js';

// The old keys, each with its note. `describe:` and `caption:` were read in any case; the rest lowercase only.
const OLD_KEY = /^(say|reader|note)\s*:\s*([\s\S]*)$/;
const OLD_KEY_ANY_CASE = /^(describe|caption)\s*:\s*([\s\S]*)$/i;
// `caption:` was retired on 2026-09-28, after which the engine read it as a plain comment, which was then the speaker
// note. So it migrates to `@note`, what it was: making it `@say` would publish a line the author may have kept private.
const NOTE_FOR_KEY = { say: 'say', caption: 'note', describe: 'alt', reader: 'handout', note: 'note' };

/** Does a converted note read like the author's own rather than a presenter note: a TODO-style tag, or a
 *  commented-out draft (a heading, a list or a fence on a line of its own)? */
function looksPrivate(text) {
  const t = String(text);
  return /^(?:TODO|FIXME|XXX|HACK|NB)\b/i.test(t) || /^(?:#{1,6} |[-*] |\d+\. |```)/m.test(t);
}

/** The note an OLD comment body was, as `{name, text}`, or null when the old engine did not read it as a note. */
function oldNote(body) {
  const t = String(body).trim();
  // Anything already written `@name{…}` is the new grammar, a near miss included (`@Say{…}`, an unclosed brace):
  // lint names a near miss, and wrapping it in `@note{…}` would silently make it a speaker note.
  if (!t || noteShape(t)) return null;
  const key = OLD_KEY.exec(t) || OLD_KEY_ANY_CASE.exec(t);
  // A `caption:` keeps its whole text, key included, because that is the speaker note the engine showed.
  if (key) return { name: NOTE_FOR_KEY[key[1].toLowerCase()], text: key[1].toLowerCase() === 'caption' ? t : key[2].trim() };
  // Before 2026-11-20 every comment the engine did not consume was the speaker note: exactly the comments
  // `--strip-notes` now treats as private (not a directive, a record, a pragma or a marker).
  return notesCore.isPrivateComment(body) ? { name: 'note', text: t } : null;
}

/**
 * A record body without its retired note fields, and those notes in order: `{body, notes}`, or null when it holds none.
 * The record keeps every other field as the author wrote it; a record left with nothing is `{}`'s caller's to drop.
 */
function splitRecord(body) {
  const parts = recordParts(body);
  if (!parts) return null;
  const notes = [];
  const items = [];
  for (const it of parts.items) {
    if (it.name !== null && Object.hasOwn(RETIRED_NOTE_FIELDS, it.name)) notes.push({ name: RETIRED_NOTE_FIELDS[it.name], text: String(it.value ?? '').trim() });
    else items.push(it.text);
  }
  const { lines, blocks } = recordTailBlocks(parts.tail);
  const drop = new Set();
  for (const b of blocks) {
    if (!Object.hasOwn(RETIRED_NOTE_FIELDS, b.key)) continue;
    for (let i = b.from; i < b.to; i++) drop.add(i);
    const head = lines[b.from].replace(/^[a-z][a-z0-9-]*[ \t]*:[ \t]?/, '');
    const text = head.trim() === '|' ? lines.slice(b.from + 1, b.to).map((l) => l.replace(/^ {2}/, '')).join('\n').trim() : head.trim();
    notes.push({ name: RETIRED_NOTE_FIELDS[b.key], text });
  }
  if (!notes.length) return null;
  const tail = lines.filter((_, i) => !drop.has(i)).join('\n').trimEnd();
  const empty = !items.length && !tail.trim();
  return { body: empty ? null : `${parts.lead}{${items.join(', ')}}${tail}`, notes };
}

/** A flat `say:` front-matter map, slide number → text (the parser the engine used until 2026-11-20). A `captions:` map
 *  is not moved: the engine has ignored it since 2026-09-28, so moving it would start speaking lines that are silent
 *  today. It stays as written, and lint reports it. */
function sayMap(frontMatter) {
  const lines = frontMatter.split('\n');
  const out = new Map();
  let at = -1;
  for (let i = 0; i < lines.length; i++) if (/^say[ \t]*:[ \t]*$/.test(lines[i])) at = i;
  if (at < 0) return out;
  for (let i = at + 1; i < lines.length && /^[ \t]+\S/.test(lines[i]); i++) {
    const m = /^[ \t]+(\d+)[ \t]*:(.*)$/.exec(lines[i]);
    if (!m) continue;
    let text = m[2].trim();
    if (/^[|>][+-]?\d*$/.test(text) || !text) continue;
    // Unquoted as the engine's reader did (lib/core/resolve-narration.mjs `unquote` until 2026-11-20): a double-quoted
    // value decodes `\"` and `\\`, a single-quoted one is taken as written.
    if (text.length >= 2 && text[0] === '"' && text[text.length - 1] === '"') text = text.slice(1, -1).replace(/\\(["\\])/g, '$1');
    else if (text.length >= 2 && text[0] === "'" && text[text.length - 1] === "'") text = text.slice(1, -1);
    out.set(Number(m[1]), text);
  }
  return out;
}

/** Each slide of `source` with only the last of the `@say` comments in `made`, when it holds more than one. */
function oneSayPerSlide(source, made, kept) {
  if (made.size < 2) return source;
  const fm = frontMatterBlockOf(source) || '';
  const body = source.slice(fm.length);
  const lines = body.split('\n');
  const { lines: cuts, leadingEmpty } = slideBoundaries(body);
  const bounds = [-1, ...cuts, lines.length];
  const out = [];
  let slide = leadingEmpty ? 0 : 1;
  for (let k = 0; k + 1 < bounds.length; k++) {
    const from = bounds[k] + 1;
    const to = bounds[k + 1];
    let text = lines.slice(from, to).join('\n');
    let says = 0;
    notesCore.rewriteComments(text, (body) => {
      if (made.has(`<!--${body}-->`)) says++;
      return false;
    });
    if (says > 1) {
      let seen = 0;
      text = notesCore.rewriteComments(text, (body) => made.has(`<!--${body}-->`) && ++seen < says);
      kept.push({ slide, why: `${says} say lines; the engine spoke only the last, so the others were removed` });
    }
    out.push(text);
    if (k + 1 < bounds.length - 1) out.push(lines[to]);
    if (!(k === 0 && leadingEmpty)) slide++;
  }
  return fm + out.join('\n');
}

/** The front matter without its top-level `say:` block (a `captions:` block is kept: see `sayMap`). */
function withoutSayMap(frontMatter) {
  const lines = frontMatter.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^say[ \t]*:[ \t]*$/.test(lines[i])) {
      while (i + 1 < lines.length && /^[ \t]+\S/.test(lines[i + 1])) i++;
      continue;
    }
    out.push(lines[i]);
  }
  const fm = out.join('\n');
  // A front matter that held only the map is gone with it: an empty `---`/`---` pair reads as two slide breaks.
  return /^\uFEFF?---[ \t]*\n---[ \t]*\n?$/.test(fm) ? '' : fm;
}

/**
 * Rewrite every old-form note in `source` as one of the four notes.
 * @param {string} source  LF source
 * @returns {{source: string, converted: number, moved: number, kept: Array<{slide: number, why: string}>, review: string[]}}
 *   `converted`: comments and record fields rewritten; `moved`: front-matter `say:` entries placed on their slide;
 *   `kept`: say lines left out (a map entry, or an earlier say line on a slide that held several), with why;
 *   `review`: the first line of each converted note that reads like a TODO or a commented-out draft.
 */
export function migrateNotesSource(source) {
  const src = String(source ?? '');
  let converted = 0;
  // Converted plain comments that read like the author's own (a TODO, a FIXME, a commented-out draft): output-preserving
  // still makes them speaker notes, which is what they were, but each is named so the author can decide (the inversion
  // on PR 3351: a migrated TODO otherwise looks deliberate).
  const review = [];
  // Every `@say` comment this run writes from an old form, so step 1b can tell them from a slide's own new ones.
  const madeSay = new Set();
  const note = (name, text) => {
    const c = writeNote(name, text);
    if (name === 'say') madeSay.add(c);
    return c;
  };
  // 1. Comments and records, in place. A record that held notes becomes the record (when anything is left) and then
  //    each note's own comment on the lines after it.
  let out = notesCore.rewriteComments(src, (body) => {
    const rec = splitRecord(body);
    if (rec) {
      converted += rec.notes.length;
      const comments = rec.notes.filter((n) => n.text).map((n) => note(n.name, n.text));
      const lead = rec.body === null ? [] : [`<!--${encodeCommentText(rec.body)}${rec.body.includes('\n') ? '\n' : ' '}-->`];
      return [...lead, ...comments].join('\n') || true;
    }
    const n = oldNote(body);
    if (!n) return false;
    converted++;
    if (n.name === 'note' && looksPrivate(n.text)) review.push(n.text.split('\n')[0].slice(0, 80));
    return n.text ? note(n.name, notesCore.decodeNoteText(n.text)) : true;
  });
  const kept = [];
  // 1b. ONE say line per slide, as the engine spoke it. Before 2026-11-20 a slide's say lines did not add up: the LAST
  //     one replaced the slide's narration. Several `@say` now join, so a slide that held more than one old say line
  //     keeps only its last, and the run says which slide lost the others.
  out = oneSayPerSlide(out, madeSay, kept);
  // 2. The front-matter `say:` map: each entry onto its slide, unless the slide already speaks a line of its own (which
  //    won before), then the map out of the front matter.
  const fm = frontMatterBlockOf(out);
  const map = fm ? sayMap(fm) : new Map();
  let moved = 0;
  if (map.size) {
    const body = out.slice(fm.length);
    const lines = body.split('\n');
    const { lines: cuts, leadingEmpty } = slideBoundaries(body);
    const bounds = [-1, ...cuts, lines.length];
    const slides = [];
    for (let k = 0; k + 1 < bounds.length; k++) slides.push([bounds[k] + 1, bounds[k + 1]]);
    if (leadingEmpty) slides.shift();
    const inserts = [];
    for (const [n, text] of map) {
      const range = slides[n - 1];
      if (!range) {
        kept.push({ slide: n, why: `the deck has ${slides.length} slides` });
        continue;
      }
      const slideText = lines.slice(range[0], range[1]).join('\n');
      if (/<!--\s*@say\{/.test(slideText)) {
        kept.push({ slide: n, why: 'the slide speaks its own line, which won over the map' });
        continue;
      }
      let at = range[1];
      while (at > range[0] && !lines[at - 1].trim()) at--;
      inserts.push([at, writeNote('say', text)]);
      moved++;
    }
    for (const [at, line] of inserts.sort((a, b) => b[0] - a[0])) lines.splice(at, 0, '', line);
    const rest = withoutSayMap(fm);
    out = rest + (rest ? lines.join('\n') : lines.join('\n').replace(/^\n+/, ''));
  }
  return { source: out, converted, moved, kept, review };
}
