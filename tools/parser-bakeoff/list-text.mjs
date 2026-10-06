/**
 * list-text — the corpus, fuzz and shared encoding for Segno phase 3's list-text grammar
 * (lib/core/list-text-grammar.js): the leading state marker in its four shapes, the bare marker
 * cell, the matrix-grid cell (and narration's own reading of it) and the `_track` directive.
 *
 * Both sides answer through `readers`, an object of one function per reader, each returning what
 * its caller used (tools/segno-legacy/list-text.js documents the shapes):
 *
 *   legacy    tools/segno-legacy/list-text.js — the regex readers, frozen before the swap
 *   shipped   `shippedReaders()` below — the kernels in lib/core, which walk the generated parser
 *
 * tools/parser-bakeoff/freeze-list-text.mjs freezes the legacy side; the unit test
 * (test/unit/tools/list-text-grammar.test.js) holds the shipped side to it.
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { deckFiles, testLiterals } from './corpus.mjs';

const require = createRequire(import.meta.url);

/** The readers, in the order every encoding lists them. */
// `spokenGrid` (narration's own matrix-grid reading) left when it folded into `grid`; `edit`,
// `editBare` and `unescape` are the Studio's Compose editor (lib/core/cell-marker-edit.mjs).
export const READERS = ['line', 'lead', 'cell', 'roadmap', 'bare', 'grid', 'track', 'unbracket', 'edit', 'editBare', 'unescape'];

/** One input read by every reader, as one array: what the freeze stores per input. */
export const encode = (readers, s) => READERS.map((k) => readers[k](s));

/** What every reader answers for an input it does not read: no marker, no cell, one plain label. */
export const quiet = (s) => {
  const label = s.replace(/\s+/g, ' ').trim();
  return [null, null, null, null, false, null, { labels: label ? [label] : [], current: -1 }, s, null, null, s];
};

/** Did any reader read something in input `s`, whose encoding is `out`? */
export const answered = (s, out) => JSON.stringify(out) !== JSON.stringify(quiet(s));

/** Inputs per fuzz digest. */
export const FROZEN_BLOCK = 100;

/** The shipped kernels, shaped as the legacy readers are. Async: the editor's readers are ESM. */
export async function shippedReaders() {
  const edit = await import('../../lib/core/cell-marker-edit.mjs');
  const marks = require('../../lib/core/leading-marker.js');
  const { parseCell } = require('../../lib/core/matrix-grid-cells.js');
  const { parseTrackSpec } = require('../../lib/core/track-spec.js');
  const pair = (r, b) => (r ? [r.marker, b(r)] : null);
  return {
    line: (s) => pair(marks.readLeadingMarker(s), (r) => r.rest),
    lead: (s) => pair(marks.leadingMarkerPrefix(s), (r) => r.length),
    cell: (s) => pair(marks.readMarkedCell(s), (r) => r.rest),
    roadmap: (s) => pair(marks.cellMarkerPrefix(s), (r) => r.tag + s.slice(r.length)),
    bare: (s) => marks.isMarkerCell(s),
    grid: (s) => parseCell(s),
    track: (s) => parseTrackSpec(s),
    unbracket: (s) => { const r = marks.leadingBracketPrefix(s); return r ? s.slice(r.length) : s; },
    edit: (s) => pair(edit.readEditMarker(s), (r) => r.length),
    editBare: (s) => edit.readEditMarker(s)?.marker ?? null,
    unescape: (s) => edit.unescapeLeadingMarker(s),
  };
}

// The tests that pin these readers by hand: their literals are inputs too.
const TESTS = [
  'test/unit/core/state-marks.test.js',
  'test/unit/core/track-spec.test.js',
  'test/unit/core/matrix-grid-cells.test.js',
  'test/unit/core/table-row-label.test.js',
  'test/unit/components/matrix-grid.test.js',
  'test/unit/components/lint-core.test.js',
  'docs/src/components/studio/table-commands.test.ts',
  'docs/src/lib/compose/deck-markdown.test.ts',
];

const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/;

/**
 * Every distinct string a list-text reader could be handed from the shipped decks and docs: the
 * text of each list item, each table cell (as written and trimmed), each `_track` value, each
 * line that starts with a bracket or a tag, and the literals of the tests that pin the readers.
 */
export function listTextCorpus() {
  const out = new Set();
  for (const f of deckFiles()) {
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      const item = LIST_ITEM.exec(line);
      if (item) out.add(item[1]);
      if (/^\s*\|/.test(line)) {
        for (const c of line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|')) { out.add(c); out.add(c.trim()); }
      }
      for (const m of line.matchAll(/_track:([^>]*?)-->/g)) { out.add(m[1]); out.add(m[1].trim()); }
      if (/^\s*[[<]/.test(line)) out.add(line);
    }
  }
  for (const s of testLiterals(TESTS)) out.add(s);
  // The Compose serializer escapes a leading marker's brackets (`\[x\] Owner`) before the editor
  // un-escapes them: every input that leads with a bracket, escaped that way, is an input too.
  for (const s of [...out]) if (/^\[[^\]]\]/.test(s)) out.add(`\\[${s[1]}\\]${s.slice(3)}`);
  return [...out];
}

/**
 * Seeded inputs over the characters the readers decide on: the brackets, every marker and `X`,
 * a tag's `<` `>`, the pipe, and whitespace of every kind JavaScript's `\s` and `.` treat
 * differently (a line break, a no-break space, U+2028, U+FEFF, a vertical tab). Short runs land
 * the decisions next to each other; a tail of long inputs crosses the matrix-grid gap's 8.
 */
export function listTextFuzz(count = 20_000, seed = 0x2545) {
  const ALPHA = ['[', ']', '[', ']', 'x', 'X', '-', '!', '?', ' ', ' ', '/', '<', '>', '|', '|',
    'a', 'b', '\t', '\n', '\r', ' ', ' ', '﻿', '\v', '　', '[x]', '[ ]', '[-] ', '<b>', ' | ',
    '\\', '\\[', '\\]', '\\[x\\]'];
  let st = seed;
  const rand = () => { st = (st * 1103515245 + 12345) & 0x7fffffff; return st / 0x7fffffff; };
  const out = [];
  for (let n = 0; n < count; n++) {
    let t = '';
    const len = Math.floor(rand() * 16);
    for (let k = 0; k < len; k++) t += ALPHA[Math.floor(rand() * ALPHA.length)];
    out.push(t);
  }
  // The matrix-grid gap is bounded at 8 spaces or tabs: every gap from 0 to 12 on each shape.
  for (let g = 0; g <= 12; g++) {
    for (const m of ['x', '-', ' ', '!']) out.push(`[${m}]${' '.repeat(g)}Label`, `[${m}]${'\t '.repeat(g >> 1)}${g & 1 ? ' ' : ''}x y`);
  }
  // The Compose editor's shapes, on every marker, `X` and a non-marker: the one space it replaces
  // (and the second it leaves), and the serializer's escape.
  for (const m of ['x', '-', '!', '?', ' ', '/', 'X', 'a']) {
    for (const gap of ['', ' ', '  ', '\t', '\n', '\u00a0']) out.push(`[${m}]${gap}Label`, `\\[${m}\\]${gap}Label`);
    out.push(`[${m}]`, `\\[${m}\\]`, `\\[${m}]`, `[${m}\\]`);
  }
  return out;
}
