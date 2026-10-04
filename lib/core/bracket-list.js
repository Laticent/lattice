/**
 * bracket-list.js — the ONE tokenizer for a bracketed list an author typed.
 *
 *   `[Effort, Reach]`                      two members, one part each
 *   `[{Effort, 0..10}, {Reach, 0..100}]`   two members, two parts each
 *   `[{[x], Enacted}, {[-], In committee}]` two members, two parts each
 *
 * WHAT THIS MODULE DOES NOT DECIDE: what the parts MEAN. `{Effort, 0..10}` and
 * `{[x], Enacted}` are the same shape and this scanner reports them the same
 * way. An axis and a label set are told apart by WHERE the span sits — above
 * the chart body or below it — not by out-guessing the grammar. That is the
 * whole reason one tokenizer can serve both: position carries the authority,
 * so the parser never has to.
 *
 * READ BY SEGNO, NOT A REGEX, and that is the point rather than a preference.
 * `label-set.js` shipped a regex whose ambiguous `\s*` against a lazy `[^,{}]*?`
 * backtracked super-linearly — 3000 spaces took 10.9s — and it became reachable the
 * moment the deck linter began parsing every lone code span, because lint-core is
 * bundled for the browser and the Studio lints UNTRUSTED markdown on the main thread
 * (HARD RULE #22). This file then held a hand-written single-pass scan; since Segno
 * phase 2 the list is read by Segno, whose compiler refuses any grammar that is not
 * LL(1) over characters — so linear is a property of the engine, not of review.
 *
 * Pure: strings in, plain data out. No DOM, no markdown-it, no fs (HARD RULE #1).
 */

const { parse: segnoParse } = require('@laticent/segno');

/**
 * Collapse whitespace the way a rendered label would read it.
 *
 * Hand-rolled rather than `.replace(/\s+/g, ' ').trim()`, and measured rather
 * than assumed: this runs on EVERY part of EVERY candidate span on both render
 * paths and in the browser linter, so it is the hot path of the hot path. The
 * scan below returns the input UNCHANGED when there is nothing to collapse —
 * which is the overwhelmingly common case, and which allocates nothing at all.
 */
function tidy(s) {
  const src = typeof s === 'string' ? s : String(s ?? '');
  const n = src.length;
  let a = 0;
  let b = n;
  while (a < b && isWs(src.charCodeAt(a))) a++;
  while (b > a && isWs(src.charCodeAt(b - 1))) b--;
  // One pass to find the first character that needs normalizing. When none
  // does — the normal case — we slice at most once and never build a buffer.
  for (let i = a; i < b; i++) {
    const c = src.charCodeAt(i);
    if (!isWs(c)) continue;
    // A lone PLAIN SPACE between two non-spaces is already normal. Anything
    // else — a tab, a newline, an NBSP, or a run of two or more — has to be
    // rebuilt. Keying the rebuild on a run of two was the bug: `a\tb` holds a
    // single tab, so it never entered the slow path and came back with the tab
    // intact while the regex this replaces returned `a b`. 50,955 divergences
    // across 300k fuzzed inputs. The two normalizations MUST agree, because the
    // same author string is read by this scanner in one slot and by
    // `parseInlineSet`'s regex `tidy` in the other.
    if (c === 32 && i + 1 < b && !isWs(src.charCodeAt(i + 1))) continue;
    // Rebuild from HERE — the start of the offending run, not from the second
    // character of it, which would keep its first space and collapse
    // `Wide   reach` to `Wide  reach`.
    let out = src.slice(a, i);
    let ws = true;
    for (let j = i; j < b; j++) {
      const d = src.charCodeAt(j);
      if (isWs(d)) { ws = true; continue; }
      if (ws) { out += ' '; ws = false; }
      out += src[j];
    }
    return out;
  }
  return a === 0 && b === n ? src : src.slice(a, b);
}

/**
 * Every code point `/\s/` matches, and it has to be EVERY one.
 *
 * The first cut listed seven — space, tab, the four line breaks, NBSP — and
 * diverged from `.replace(/\s+/g, ' ')` on the other nine: U+1680, the U+2000
 * en/em quad family, U+2028/U+2029, U+202F narrow NBSP, U+205F, U+3000
 * ideographic space and U+FEFF. None is exotic in authored prose: U+2003 comes
 * from a Word or Notion paste, U+202F from macOS and French typography, U+3000
 * from any CJK keyboard.
 *
 * That divergence was not cosmetic. On a matrix-grid the AXIS slot is read by
 * this scanner and the KEY slot by `parseInlineSet`'s regex `tidy`, so one
 * typed string normalized two different ways depending on which side of the
 * table it sat — `Enacted\u3000law` kept its space as an axis and lost it as a
 * key. The two normalizations must agree; this is what makes that true rather
 * than merely asserted, and a fuzz arm pins it over the whole set.
 */
function isWs(c) {
  return (
    c === 32 || // space
    (c >= 9 && c <= 13) || // tab, LF, VT, FF, CR
    c === 0xa0 || // NBSP
    c === 0x1680 || // ogham space mark
    (c >= 0x2000 && c <= 0x200a) || // en quad … hair space
    c === 0x2028 || // line separator
    c === 0x2029 || // paragraph separator
    c === 0x202f || // narrow NBSP
    c === 0x205f || // medium mathematical space
    c === 0x3000 || // ideographic space
    c === 0xfeff // BOM / zero-width NBSP
  );
}

/**
 * Strip ONE balanced pair of surrounding quotes, single or double.
 *
 * Quotes are optional and they are NOT decoration: inside them a comma is
 * literal text. `["Cost, excluding tax", "Value"]` is TWO axes, and without
 * this rule it would be three. The alternative — banning commas in a name —
 * fails the first author who measures cost excluding tax.
 */
function unquote(s) {
  const t = tidy(s);
  if (t.length < 2) return t;
  const q = t.charCodeAt(0);
  if ((q === 34 || q === 39) && t.charCodeAt(t.length - 1) === q) return tidy(t.slice(1, -1));
  return t;
}

/**
 * Parse a bracketed list into members, each member a list of PARTS.
 *
 * A bare member is one part (`Effort` -> `['Effort']`); a braced member is its
 * comma-separated parts (`{Effort, 0..10}` -> `['Effort', '0..10']`).
 *
 * READ BY SEGNO (Segno phase 2, engineering/decisions/2026-09-28-segno-unified-
 * inline-notation.md). The span is Segno's list shape — `[a, {b, c}, , "d, e"]` —
 * so the reading is Segno's: one left-to-right LL(1) pass, linear on any input by
 * construction (the property the hand-written scan here used to guarantee by
 * review). The rules an author meets are the notation's, the same as every other
 * directive's: double quotes protect a comma and must close, an apostrophe is never
 * special (`[Customer's spend, Churn]` is two members), a `{` must be followed
 * directly by its first part, and an empty member holds its place (`[, Reach]` names
 * the SECOND axis). A span the notation cannot read is not a list: null.
 *
 * A PART IS THE TEXT THE AUTHOR TYPED for it, tidied — not a typed value. `{Effort,
 * 0..10}` gives `'0..10'`, `{[x], Enacted}` gives `'[x]'`, and `{Timeline, …,
 * today=Q3}` gives `'today=Q3'`. What a part MEANS stays its caller's (axis-member.js,
 * label-set.js): position carries the authority, so this module never has to guess.
 * Quoted text is the one exception — it is unquoted, which is what quoting is for.
 *
 * ARITY IS THE CALLER'S, NOT THE GRAMMAR'S. `maxParts` caps how many parts a braced
 * member keeps; the parts past the cap are joined back into the last one with `, `,
 * so a label set (`maxParts: 2`) reads `{1, Good, better, best}` as `['1', 'Good,
 * better, best']` — prose keeps its commas.
 *
 * @param {string} text  the inline-code span's text, without its backticks
 * @param {{maxParts?: number}} [opts]  cap on parts per braced member
 * @returns {Array<string[]>|null}
 */
function parseBracketList(text, opts) {
  const maxParts = opts && opts.maxParts > 0 ? opts.maxParts : 0;
  const src = (typeof text === 'string' ? text : String(text ?? '')).trim();
  // O(1) reject before Segno is asked anything: almost no span is a bracketed list.
  if (src.length < 2 || src.charCodeAt(0) !== 91 /* [ */ || src.charCodeAt(src.length - 1) !== 93 /* ] */) return null;
  const p = segnoParse(src);
  if (!p.ok || p.item.name !== null || p.item.tag || p.item.value.kind !== 'list') return null;
  const members = [];
  let pending = 0;
  for (const el of p.item.value.items) {
    let parts;
    if (el === null) parts = [];
    else if (el.kind === 'record') parts = el.items.map((it) => tidy(partText(src, it))).filter(Boolean);
    else parts = [tidy(el.kind === 'scalar' && el.quoted ? el.text : src.slice(el.from, el.to).trim())].filter(Boolean);
    if (maxParts && parts.length > maxParts) parts = [...parts.slice(0, maxParts - 1), parts.slice(maxParts - 1).join(', ')];
    // An EMPTY MEMBER HOLDS ITS PLACE; blanks at the END carry no position and are trimmed.
    if (!parts.length) { pending++; continue; }
    for (; pending > 0; pending--) members.push([]);
    members.push(parts);
  }
  return members.length ? members : null;
}

/** One record item as the text the author typed: quoted text unquoted, anything else raw. */
function partText(src, it) {
  const v = it.value;
  if (it.name === null && v.kind === 'scalar' && v.quoted) return v.text;
  return src.slice(it.from, it.to).trim();
}

module.exports = { parseBracketList, unquote, tidy };
