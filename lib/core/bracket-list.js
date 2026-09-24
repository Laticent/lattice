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
 * A HAND-WRITTEN SCAN, NOT A REGEX, and that is the point rather than a
 * preference. `label-set.js` shipped a regex whose ambiguous `\s*` against a
 * lazy `[^,{}]*?` backtracked super-linearly — 3000 spaces took 10.9s — and it
 * became reachable the moment the deck linter began parsing every lone code
 * span, because lint-core is bundled for the browser and the Studio lints
 * UNTRUSTED markdown on the main thread (HARD RULE #22). A single left-to-right
 * pass that never revisits a character cannot have that failure mode at all.
 * Linear is a property of the shape here, not a number someone measured once.
 *
 * Pure: strings in, plain data out. No DOM, no markdown-it, no fs (HARD RULE #1).
 */

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
 * ONE PASS, and that is a measured shape rather than a slogan. The first cut
 * split into members, then split each member into parts, then tidied each part
 * — three full scans of the same characters, each about 5ns/char on this box.
 * The scan below walks the source once and records each part as a pair of
 * INDICES, so a character is read once and a string is allocated only for a
 * part that survives. Nothing here backtracks, so the super-linear blowup that
 * bit `label-set.js` (3000 characters, 10.9s) is not expressible.
 *
 * Returns `null` when `text` is not a bracketed list at all — the caller's
 * signal to leave the span alone. That pass-through is load-bearing, not
 * defensive: every chart scans code spans that are ordinary eyebrows, and a
 * non-list has to survive untouched.
 *
 * An empty PART inside a braced member is dropped: `{Effort, , 5}` keeps two
 * parts, and a reader tells domain from threshold by shape
 * (lib/core/axis-member.js). An empty top-level MEMBER holds its place as `[]`,
 * because position is the authority: `[, Reach]` names the second axis only,
 * where dropping the blank would have moved `Reach` onto the first. Trailing
 * blanks hold no position and are trimmed. A list with nothing in it returns
 * `null`, for the same reason `label-set.js` refuses `[{}]` — far likelier a
 * mistake than a request.
 *
 * ARITY IS THE CALLER'S, NOT THE GRAMMAR'S. `maxParts` caps how many parts a
 * braced member splits into; once the cap is reached the remaining commas are
 * ORDINARY TEXT. An axis wants three (`{Effort, 0..10, 5}`), a label set wants
 * two, because a label is prose and `{1, Good, better, best}` must keep its
 * commas.
 *
 * NO PRODUCTION CALLER PASSES IT YET, and saying so is the point. A label set
 * is still read by `parseInlineSet`, which is battle-tested, browser-bundled
 * and what `lint:deck` validates against — swapping it out is a change to that
 * gate, not a rider on an axis feature. So there are still TWO readers today.
 * What the cap buys is that converging them needs no second grammar: a test
 * pins that at `maxParts: 2` this scanner reproduces `parseInlineSet`
 * member-for-member on the real shipped strings. That is a demonstrated
 * migration path, not a migration that happened.
 *
 * @param {string} text  the inline-code span's text, without its backticks
 * @param {{maxParts?: number}} [opts]  cap on parts per braced member
 * @returns {Array<string[]>|null}
 */
function parseBracketList(text, opts) {
  const maxParts = opts && opts.maxParts > 0 ? opts.maxParts : 0;
  const src = typeof text === 'string' ? text : String(text ?? '');
  // Bounds of the bracketed region, found without allocating a trimmed copy.
  let lo = 0;
  let hi = src.length;
  while (lo < hi && isWs(src.charCodeAt(lo))) lo++;
  while (hi > lo && isWs(src.charCodeAt(hi - 1))) hi--;
  if (hi - lo < 2 || src.charCodeAt(lo) !== 91 /* [ */ || src.charCodeAt(hi - 1) !== 93 /* ] */) {
    return null;
  }

  const members = [];
  let parts = [];
  let depth = 0;
  let quote = 0;
  // Trimmed bounds of the part being read; -1 when none is open.
  let ps = -1;
  let pe = -1;
  let pendingWs = false;
  let messy = false; // an internal run or a quote — only then is tidy needed

  const flushPart = () => {
    if (ps >= 0) {
      const raw = src.slice(ps, pe);
      const val = messy ? unquote(raw) : raw;
      if (val) parts.push(val);
    }
    ps = -1;
    pe = -1;
    pendingWs = false;
    messy = false;
  };
  // An EMPTY TOP-LEVEL MEMBER HOLDS ITS PLACE. Position is the authority, so
  // `[, Reach]` names the SECOND axis and leaves the first unnamed. Dropping the
  // blank re-slotted `Reach` onto the first axis, silently. A placeholder is
  // an empty parts array; blanks at the END carry no position and are trimmed.
  let pending = 0;
  let closed = false; // the last structure was a `}` — the next top-level comma is just its separator
  const flushMember = () => {
    closed = false;
    flushPart();
    if (parts.length) {
      for (; pending > 0; pending--) members.push([]);
      members.push(parts);
    } else {
      pending++;
    }
    parts = [];
  };

  for (let i = lo + 1; i < hi - 1; i++) {
    const c = src.charCodeAt(i);

    if (quote) {
      // Inside quotes nothing is structural — that is what quoting BUYS, and it
      // is why `["Cost, excluding tax", "Value"]` is two axes and not three.
      if (c === quote) quote = 0;
      pe = i + 1;
      continue;
    }
    // A QUOTE OPENS ONLY WHERE A PART STARTS — the same rule as `{` below.
    // Anywhere else it is ordinary text. Opening it mid-word made
    // `[Customer's spend, Churn rate]` ONE axis: the apostrophe started a quote
    // that ran to the end, swallowing the comma, and the second axis vanished.
    // Straight apostrophes survive inside code spans (no typographer there), so
    // an ordinary English name hit this.
    if ((c === 34 /* " */ || c === 39 /* ' */) && ps < 0) {
      quote = c;
      messy = true;
      if (ps < 0) ps = i;
      pe = i + 1;
      pendingWs = false;
      continue;
    }
    // A `{` OPENS A MEMBER ONLY WHERE A MEMBER CAN START — nothing read yet in
    // this one. Anywhere else it is ordinary text, so `[a{b, c}]` keeps its
    // brace in the part rather than silently becoming a two-part member, and a
    // NESTED `{` cannot smuggle a fourth part past a cap of three.
    if (c === 123 /* { */) {
      if (depth === 0 && ps < 0 && parts.length === 0) { depth++; continue; }
    } else if (c === 125 /* } */) {
      // `}` CLOSES THE MEMBER, not just the part. Without that, `[{a,b}{c,d}]`
      // merged two braced groups into one four-part member, which is a typo
      // read as data.
      if (depth > 0) { depth--; flushMember(); closed = true; continue; }
    }
    if (c === 123 || c === 125) {
      // Fall through as literal content.
      if (pendingWs) { messy = true; pendingWs = false; }
      if (ps < 0) ps = i;
      pe = i + 1;
      continue;
    }
    if (c === 44 /* , */) {
      if (depth > 0) {
        // At the cap the comma stops being structural and becomes content, so
        // a prose label keeps the commas the author typed.
        if (maxParts && parts.length >= maxParts - 1) {
          if (pendingWs) { messy = true; pendingWs = false; }
          if (ps < 0) ps = i;
          pe = i + 1;
        } else {
          flushPart();
        }
      } else if (closed && ps < 0 && parts.length === 0) {
        // The comma after `}` separates members the brace already closed —
        // it is not an empty member of its own.
        closed = false;
      } else {
        flushMember();
      }
      continue;
    }
    if (isWs(c)) {
      if (ps >= 0) pendingWs = true;
      continue;
    }
    if (pendingWs) { messy = true; pendingWs = false; }
    if (ps < 0) ps = i;
    pe = i + 1;
  }
  flushMember();

  return members.length ? members : null;
}

module.exports = { parseBracketList, unquote, tidy };
