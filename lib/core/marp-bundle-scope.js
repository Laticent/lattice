/**
 * lib/core/marp-bundle-scope.js — Export to Marp numbers the slides Lattice numbers.
 *
 * In Lattice page numbers are on by default, a `paginate` slide comment does nothing, and a slide or its component's
 * manifest opts out by class (lib/core/pagination.js, the owner's rulings of 2026-10-20). Marp numbers nothing by
 * default and obeys the comments. The bundle is rendered by Marp, so this says what Lattice means in Marp's own
 * directives. The slide-only `header:` / `footer:` rewrite is a separate step each producer runs
 * (lib/core/marp-slide-only.mjs); this file touches only page numbers.
 *
 * The comments are the ones the engine reads as directives: a comment that opens its line (after at most three
 * spaces and any container prefix, `> `, `- `, `1. `), outside fenced code, naming a known key. A directive quoted in
 * a code block or written mid-sentence is left as written. The walk is its own, like bg-image.js's, because the
 * playground engine bundle carries this file and may not reach the lint core's boundary parser
 * (tools/build-playground.js, the `lint-entry` rule), which `scanMetaSource` uses.
 */
const { readDirectiveComment } = require('./comment-directive');
const { DIRECTIVE_VOCAB } = require('./meta-keys.js');
const { paginateOn, slidePaginates } = require('./pagination.js');
const { applyComponentChrome } = require('./component-chrome.js');
const { switchOn } = require('./switches');

const FENCE = /^[ \t]{0,3}(`{3,}|~{3,})/;
// A line terminator `.` does not cross: where a comment that opens a line must close on it.
const LINE_BREAK = /[\n\r\u2028\u2029]/;

/**
 * Where a line's directive comment starts, after its container prefix (blockquote markers, a list bullet or number,
 * each after at most three spaces), or -1 when the prefix is not followed by a comment that closes on the line.
 *
 * A READER, NOT A REGEX, because the regex it replaced was exponential (HARD RULE #32,
 * followups.d/3045-p2-regex-recheck-gate.md). `^((?:[ ]{0,3}(?:>[ \t]?|[-*+][ \t]+|\d{1,9}[.)][ \t]+))*[ ]{0,3})(<!--.*?-->)`
 * could give each blank after a marker to the marker or to the next round's indent, so a line of markers with no closed
 * comment tried exponentially many splits before failing: `> ` took 38 ms at 24 levels, and a bullet followed by four
 * spaces (`-    `) took 11 s at 16 and never finished at 20. Taking every blank greedily is never worse
 * here, because the next round only skips up to three more spaces, so one left-to-right walk answers the same.
 * test/unit/core/marp-bundle-scope-lead.test.js holds it to the old pattern by a seeded fuzz.
 */
function commentLeadEnd(line) {
  const at = (k) => line.charCodeAt(k);
  const blank = (c) => c === 32 || c === 9;
  let i = 0;
  for (;;) {
    let j = i;
    while (j - i < 3 && at(j) === 32) j++;
    const c = at(j);
    if (c === 62) { // `>`, then one optional blank
      i = j + 1;
      if (blank(at(i))) i++;
      continue;
    }
    let k = j;
    if (c === 45 || c === 42 || c === 43) k = j + 1; // `-` `*` `+`
    else while (k - j < 10 && at(k) >= 48 && at(k) <= 57) k++;
    const digits = k - j;
    if (digits >= 1 && digits <= 9 && c >= 48 && c <= 57) {
      if (at(k) !== 46 && at(k) !== 41) return commentAt(line, j); // `.` `)`
      k++;
    }
    if (k > j && digits <= 9 && blank(at(k))) {
      while (blank(at(k))) k++;
      i = k;
      continue;
    }
    return commentAt(line, j);
  }
}

/** `j` when a comment opens at `j` and closes before the line ends (`<!--.*?-->`), else -1. */
function commentAt(line, j) {
  if (!line.startsWith('<!--', j)) return -1;
  const close = line.indexOf('-->', j + 4);
  if (close < 0) return -1;
  const brk = line.slice(j + 4, close).search(LINE_BREAK);
  return brk < 0 ? j : -1;
}

const FRONT = /^(---[ \t]*)(\r\n|\r|\n)([\s\S]*?)(\r\n|\r|\n)(---[ \t]*)(\r\n|\r|\n|$)/;
const SLIDE_SEPARATOR = /^---[ \t]*$/;
const COMMENT_AT = /^[ \t]*(<!--[\s\S]*?-->)/;
// One pair of matching quotes around a one-line value comes off. Written out, not `/^(['"])(.*)\1$/`, whose
// back-reference the regex census cannot certify; the lead test holds it to that pattern by a seeded fuzz.
function unquote(v) {
  const t = String(v ?? '').trim();
  const q = t[0];
  if (t.length < 2 || (q !== '"' && q !== "'") || t[t.length - 1] !== q) return t;
  const inner = t.slice(1, -1);
  return LINE_BREAK.test(inner) ? t : inner.trim();
}

/**
 * The whole deck as Marp should read it, for page numbers:
 *   · a `paginate:` or `_paginate:` comment is dropped: Lattice ignores it, Marp would obey it;
 *   · front matter says `paginate: true` or `false` in the one spelling Marp reads (Lattice numbers by default and
 *     Marp does not; `paginate: no` is off in Lattice and a string Marp ignores), and a deck with no front matter
 *     gets a block saying `true`;
 *   · each slide whose number differs from the deck's gets Marp's own `<!-- _paginate: … -->` as its first line. The
 *     slide's classes are read as the engine reads them (front matter's `class:` on every slide, plus its last
 *     `_class:`, else the running plain `class:`) and judged by the engine's own rule (lib/core/pagination.js).
 * A leading BOM is kept and stepped over, as the engine steps over it. A deck whose first line opens with a fence
 * Lattice does not read as front matter (`----`, `---x`) gets no pagination edits: Marp may read that block as front
 * matter, and a block written above it would move where Marp's front matter ends, which the author-markup refusal
 * reasons about (test/unit/plugins/author-markup.test.js).
 */
function withMarpScope(deck, { pagination = true } = {}) {
  const original = String(deck ?? '');
  const bom = original.startsWith('﻿') ? '﻿' : '';
  let src = original.slice(bom.length);
  const eol = (/\r\n|\r|\n/.exec(src) || ['\n'])[0];
  let deckOn = true;
  let deckClass = '';
  let fm = FRONT.exec(src);
  // A first line Lattice does not read as front matter: no edits at all (see the doc comment).
  const headerEdits = !(!fm && /^-{3}/.test(src));
  let deckHeader = false;
  if (fm) {
    const lines = fm[3].split(/\r\n|\r|\n/);
    const cls = lines.findLast((l) => /^class[ \t]*:/.test(l));
    if (cls) deckClass = unquote(cls.replace(/^class[ \t]*:/, '').replace(/[ \t]+#.*$/, ''));
    const head = lines.findLast((l) => /^header[ \t]*:/.test(l));
    deckHeader = !!head && unquote(head.replace(/^header[ \t]*:/, '').replace(/[ \t]+#.*$/, '')) !== '';
  }
  if (pagination && !fm && /^-{3}/.test(src)) pagination = false;
  if (pagination) {
    if (fm) {
      const lines = fm[3].split(/\r\n|\r|\n/);
      // The LAST line of a repeated key is the deck's, as the engine and js-yaml read it (#3050, D1).
      const at = lines.findLastIndex((l) => /^paginate[ \t]*:/.test(l));
      if (at >= 0) {
        deckOn = paginateOn(lines[at].replace(/^paginate[ \t]*:/, ''));
        lines[at] = `paginate: ${deckOn}`;
      } else {
        lines.push('paginate: true');
      }
      src = fm[1] + fm[2] + lines.join(fm[4]) + fm[4] + fm[5] + fm[6] + src.slice(fm[0].length);
    } else {
      src = `---${eol}paginate: true${eol}---${eol}${eol}${src}`;
    }
    fm = FRONT.exec(src);
  }

  const parts = src.split(/(\r\n|\r|\n)/); // text, break, text, break, …
  // The front matter's lines are not slide content: skip its text parts (two parts per line).
  const startPart = fm ? (fm[0].split(/\r\n|\r|\n/).length - (fm[6] ? 1 : 0)) * 2 : 0;
  const insertBefore = new Map(); // part index → the `_header` / `_paginate` lines to put above it
  const add = (at, line) => insertBefore.set(at, insertBefore.has(at) ? `${insertBefore.get(at)}${eol}${line}` : line);
  let fence = null;
  let running = '';
  let spot = null;
  let slideStart = startPart;
  const endSlide = () => {
    // THE HEADER, the same way: a component whose manifest drops the running header (`title`,
    // lib/core/component-chrome.js) gets Marp's own `<!-- _header: '' -->`, unless the slide brings it
    // back with `with-header`. The engine and the bundle's runtime stamp `no-header`, but a host that
    // runs no script (VS Code's default preview) reads only the directive
    // (engineering/decisions/2026-11-08-anchor-chrome.md). Only where the deck HAS a header to drop.
    if (headerEdits && deckHeader) {
      const own = spot ?? running;
      const tokens = [deckClass, own].flatMap((v) => unquote(v || '').split(/\s+/)).filter(Boolean);
      const stamped = applyComponentChrome(tokens);
      // Only the component's default: a deck-wide `class: no-header` already reaches Marp as a class.
      if (stamped !== tokens && !switchOn('header', stamped)) add(slideStart, "<!-- _header: '' -->");
    }
    if (!pagination) {
      spot = null;
      return;
    }
    // The deck's `class:` reaches every slide and a slide's own class ADDS to it, as the engine renders it
    // (engineering/decisions/2026-11-03-marp-bundle-live-front-matter.md): `class: no-pagination` in front matter
    // turns a `_class: content` slide's number off too, and that slide's `with-pagination` turns it back on.
    const own = spot ?? running;
    const tokens = [deckClass, own].flatMap((v) => unquote(v || '').split(/\s+/)).filter(Boolean);
    const on = slidePaginates(tokens, deckOn);
    if (on !== deckOn) add(slideStart, `<!-- _paginate: ${on} -->`);
    spot = null;
  };
  for (let i = startPart; i < parts.length; i += 2) {
    const line = parts[i];
    const f = FENCE.exec(line);
    if (fence) {
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length && /^[ \t]{0,3}[`~]+[ \t]*$/.test(line)) fence = null;
      continue;
    }
    if (f) {
      fence = f[1];
      continue;
    }
    if (SLIDE_SEPARATOR.test(line)) {
      endSlide();
      slideStart = i + 2;
      continue;
    }
    const leadEnd = commentLeadEnd(line);
    if (leadEnd < 0) continue;
    // CLASSES are read as the engine reads them: ONE directive per line, from the first comment to the line's end.
    // Markdown makes the line one HTML block and the engine's reader takes the block whole, so a second comment on the
    // line is part of the first one's value (`<!-- _class: a --> <!-- _class: b -->` is a class whose value runs on),
    // and a comment followed by text is no directive at all. Reading each comment in turn made the bundle number
    // slides the engine does not, and the reverse.
    const rest = line.slice(leadEnd);
    const d = readDirectiveComment(rest.trim(), DIRECTIVE_VOCAB);
    if (d && d.key === 'class') {
      if (d.spot) spot = d.value;
      else running = d.value;
    }
    if (!pagination) continue;
    // PAGINATE comments go wherever one opens the line, each on its own: Marp obeys one even where the engine reads
    // none, and the engine ignores them all, so dropping one never changes what Lattice renders.
    let tail = rest;
    let out = '';
    let dropped = false;
    for (let c = COMMENT_AT.exec(tail); c; c = COMMENT_AT.exec(tail)) {
      const lead = tail.slice(0, c.index + c[0].length - c[1].length);
      const own = readDirectiveComment(c[1], DIRECTIVE_VOCAB);
      tail = tail.slice(c.index + c[0].length);
      if (own && own.key === 'paginate') {
        dropped = true;
        continue;
      }
      out += lead + c[1];
    }
    if (!dropped) continue;
    if ((out + tail).trim() === '' && line.slice(0, leadEnd).trim() === '') {
      parts[i] = null; // the line held only retired comments: drop it and its break
      if (i + 1 < parts.length) parts[i + 1] = null;
    } else {
      parts[i] = line.slice(0, leadEnd) + out + tail;
    }
  }
  endSlide();
  for (const [at, text] of insertBefore) {
    if (at >= parts.length) parts.push(eol, text);
    else parts[at] = `${text}${eol}${parts[at] ?? ''}`;
  }
  const result = bom + parts.filter((p) => p !== null).join('');
  return result === original ? original : result;
}

module.exports = { withMarpScope, __commentLeadEndForTest: commentLeadEnd, __unquoteForTest: unquote };
