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

const FENCE = /^[ \t]{0,3}(`{3,}|~{3,})/;
// The line's container prefix (blockquote markers, a list bullet or number), then the comment.
const LEAD = /^((?:[ ]{0,3}(?:>[ \t]?|[-*+][ \t]+|\d{1,9}[.)][ \t]+))*[ ]{0,3})(<!--.*?-->)/;

const FRONT = /^(---[ \t]*)(\r\n|\r|\n)([\s\S]*?)(\r\n|\r|\n)(---[ \t]*)(\r\n|\r|\n|$)/;
const SLIDE_SEPARATOR = /^---[ \t]*$/;
const COMMENT_AT = /^[ \t]*(<!--[\s\S]*?-->)/;
const unquote = (v) => String(v ?? '').trim().replace(/^(['"])(.*)\1$/, '$2').trim();

/**
 * The whole deck as Marp should read it, for page numbers:
 *   · a `paginate:` or `_paginate:` comment is dropped: Lattice ignores it, Marp would obey it;
 *   · front matter says `paginate: true` or `false` in the one spelling Marp reads (Lattice numbers by default and
 *     Marp does not; `paginate: no` is off in Lattice and a string Marp ignores), and a deck with no front matter
 *     gets a block saying `true`;
 *   · each slide whose number differs from the deck's gets Marp's own `<!-- _paginate: … -->` as its first line. The
 *     slide's classes are read as the engine reads them (its last `_class:`, else the running plain `class:`, else
 *     front matter's `class:`) and judged by the engine's own rule (lib/core/pagination.js).
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
  if (pagination && !fm && /^-{3}/.test(src)) pagination = false;
  if (pagination) {
    if (fm) {
      const lines = fm[3].split(/\r\n|\r|\n/);
      const at = lines.findIndex((l) => /^paginate[ \t]*:/.test(l));
      const cls = lines.find((l) => /^class[ \t]*:/.test(l));
      if (cls) deckClass = unquote(cls.replace(/^class[ \t]*:/, '').replace(/[ \t]+#.*$/, ''));
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
  const insertBefore = new Map(); // part index → the `_paginate` line to put above it
  let fence = null;
  let running = '';
  let spot = null;
  let slideStart = startPart;
  const endSlide = () => {
    if (!pagination) return;
    const value = spot ?? (running || deckClass);
    const on = slidePaginates(unquote(value).split(/\s+/).filter(Boolean), deckOn);
    if (on !== deckOn) insertBefore.set(slideStart, `<!-- _paginate: ${on} -->`);
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
    const m = LEAD.exec(line);
    if (!m) continue;
    // CLASSES are read as the engine reads them: ONE directive per line, from the first comment to the line's end.
    // Markdown makes the line one HTML block and the engine's reader takes the block whole, so a second comment on the
    // line is part of the first one's value (`<!-- _class: a --> <!-- _class: b -->` is a class whose value runs on),
    // and a comment followed by text is no directive at all. Reading each comment in turn made the bundle number
    // slides the engine does not, and the reverse.
    const rest = line.slice(m[1].length);
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
    if ((out + tail).trim() === '' && m[1].trim() === '') {
      parts[i] = null; // the line held only retired comments: drop it and its break
      if (i + 1 < parts.length) parts[i + 1] = null;
    } else {
      parts[i] = m[1] + out + tail;
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

module.exports = { withMarpScope };
