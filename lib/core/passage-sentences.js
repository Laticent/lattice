/**
 * lib/core/passage-sentences.js — where a quoted passage may break across pages.
 *
 * A split quote continues on the next page at a SENTENCE break, never mid-sentence (owner,
 * 2026-11-06, engineering/decisions/2026-10-28-fit-everywhere-model.md §20). Two callers must agree
 * on exactly where those breaks are:
 *   - the measured split reads each sentence's height in the rendered page (lib/core/fit-measure.js
 *     `measureFit`, which runs in a browser and receives `sentenceStarts` as source), and
 *   - the `passage` strategy rebuilds the pages from the slide's HTML (lib/core/carousel.js).
 * Both count the same text: the passage's text content, entities decoded, whitespace kept. So the
 * rule is ONE function over plain text (`sentenceStarts`), and `splitHtmlAtText` maps text offsets
 * back into the HTML.
 *
 * `sentenceStarts` is pure and self-contained (no closure over module scope), so `.toString()` can
 * carry it into the page, the lib/core/card-tag-equalize.js pattern (HARD RULE #1).
 */

/**
 * The text offsets where a new sentence begins, after the first. A sentence ends at `.`, `!` or `?`
 * (and any closing quote or bracket after it), followed by whitespace and a capital, a digit, `§`,
 * or an opening quote or bracket. A period after an abbreviation (`Cal.`, `U.S.C.`, `e.g.`, a single
 * initial) ends nothing: legal citations are full of them.
 */
function sentenceStarts(text) {
  const ABBREV = new Set(['inc', 'corp', 'co', 'ltd', 'llc', 'no', 'nos', 'mr', 'mrs', 'ms', 'dr', 'st', 'jr', 'sr', 'vs', 'v', 'cf', 'al', 'art', 'arts', 'cal', 'civ', 'gen', 'rev', 'stat', 'supp', 'dept', 'govt', 'sec', 'secs', 'reg', 'regs', 'ch', 'para', 'pt', 'fig', 'vol', 'ed', 'eds', 'approx', 'est', 'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec']);
  const out = [];
  const re = /[.!?]["'”’)\]]*(\s+)(?=["'“‘([]?[A-Z0-9§])/g; // regex-ok: recheck cannot model the look-ahead; it reads at most two characters, and every other piece is a single class run that ends at the first non-member
  let m = re.exec(text);
  while (m) {
    let stop = false;
    if (text[m.index] === '.') {
      // The word before the stop, read back to the last blank (a backward loop: `\S+$` is quadratic).
      let from = m.index;
      while (from > 0 && !/\s/.test(text[from - 1])) from -= 1;
      const word = text.slice(from, m.index).replace(/^["'“‘([]+/, '');
      // An initial (`J.`), a dotted abbreviation (`U.S.C`, `e.g`), or a listed short form.
      stop = /^[A-Za-z]$/.test(word) || word.includes('.') || ABBREV.has(word.toLowerCase());
    }
    if (!stop) out.push(m.index + m[0].length);
    m = re.exec(text);
  }
  return out;
}

const VOID = new Set(['br', 'img', 'wbr', 'hr', 'input', 'meta', 'link', 'source', 'col', 'area', 'embed', 'track']);
const ENTITY_RE = /^&(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/i;

// The names markdown-it and authors actually write; the browser reads entity names case-sensitively.
const NAMED = {
  quot: '"', amp: '&', lt: '<', gt: '>', apos: "'", nbsp: '\u00a0', ldquo: '\u201c', rdquo: '\u201d',
  lsquo: '\u2018', rsquo: '\u2019', mdash: '\u2014', ndash: '\u2013', hellip: '\u2026', sect: '\u00a7', para: '\u00b6', copy: '\u00a9',
};
/** One entity as the browser decodes it (an unknown name stays as written, as an HTML parser keeps it). */
function decodeEntity(ent) {
  const body = ent.slice(1, -1);
  if (body[0] === '#') {
    const n = body[1] === 'x' || body[1] === 'X' ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
    return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ent;
  }
  return Object.hasOwn(NAMED, body) ? NAMED[body] : ent;
}

/** The text content of an HTML fragment as the browser reads it: tags dropped, entities decoded. */
function textOf(html) {
  // The text runs between tags, read rather than tags deleted: the result only counts characters.
  const runs = (html.match(/<[^<>]*>|<|[^<]+/g) || []).filter((t) => t[0] !== '<');
  return runs.join('').replace(/&(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/gi, decodeEntity);
}

/**
 * Cut an HTML fragment at text offsets (as `textOf` counts them). Each piece is well formed: an
 * element the cut falls inside is closed at the end of one piece and opened again, with its own
 * attributes, at the start of the next, so a sentence that sits in a `<p>` or an `<ins>` keeps it on
 * both pages. Elements left empty by a cut are dropped. Returns `cuts.length + 1` pieces.
 */
function splitHtmlAtText(html, cuts) {
  const want = [...new Set(cuts)].filter((n) => n > 0).sort((a, b) => a - b);
  const pieces = [];
  let cur = '';
  const stack = [];
  let pos = 0;
  let next = 0;
  const cut = () => {
    for (let i = stack.length - 1; i >= 0; i--) cur += `</${stack[i].name}>`;
    pieces.push(cur);
    cur = stack.map((t) => t.open).join('');
    next += 1;
  };
  for (const tok of html.match(/<[^<>]*>|<|[^<]+/g) || []) {
    if (tok[0] === '<') {
      const close = tok.match(/^<\/([a-z][\w-]*)/i);
      const open = tok.match(/^<([a-z][\w-]*)/i);
      if (close) {
        const name = close[1].toLowerCase();
        const at = stack.map((t) => t.name).lastIndexOf(name);
        if (at >= 0) stack.splice(at);
      } else if (open && !VOID.has(open[1].toLowerCase()) && !/\/>$/.test(tok)) {
        stack.push({ name: open[1].toLowerCase(), open: tok });
      }
      cur += tok;
      continue;
    }
    // A text run: copy it character by character (an entity is one character), cutting where asked.
    let i = 0;
    while (i < tok.length) {
      while (next < want.length && want[next] === pos) cut();
      // An entity is as many characters as it decodes to (an astral one is two, as in the DOM).
      const ent = tok[i] === '&' ? tok.slice(i).match(ENTITY_RE) : null;
      const step = ent ? ent[0].length : 1;
      const width = ent ? decodeEntity(ent[0]).length : 1;
      // A cut that falls inside a decoded entity's width lands after it.
      cur += tok.slice(i, i + step);
      i += step;
      pos += width;
      while (next < want.length && want[next] < pos) cut();
    }
  }
  while (next < want.length) cut();
  pieces.push(cur);
  // A cut at a block boundary leaves `<p></p>` (or `<p>\n</p>`) behind; drop what holds no text.
  // An open tag followed only by blanks and a close tag of the same name (compared in code: a back-reference is unmodelable).
  const empty = /<([a-z][\w-]*)(?:\s[^<>]*)?>(\s*)<\/([a-z][\w-]*)>/gi;
  return pieces.map((p) => {
    let s = p;
    let prev;
    do { prev = s; s = s.replace(empty, (m, a, _ws, b) => (a.toLowerCase() === b.toLowerCase() ? '' : m)); } while (s !== prev);
    return s;
  });
}

/**
 * The text offsets where a CLAUSE begins inside a sentence, for `redline` only (owner, 2026-11-13,
 * fit-everywhere-model.md §23): a statute's one sentence can run longer than a phone page, so a
 * redline may also break after a semicolon, or after a comma when the next word is `and`, `or` or
 * `but`, never anywhere else inside a clause. The offset is where the next clause's first word
 * starts. A plain scan, not a pattern: it reads each comma's next word and stops. Self-contained,
 * so it travels into the page beside `sentenceStarts` (lib/core/fit-measure.js).
 */
function clauseStarts(text) {
  const out = [];
  const space = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\u00a0';
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c !== ';' && c !== ',') continue;
    let j = i + 1;
    if (j >= text.length || !space(text[j])) continue;
    while (j < text.length && space(text[j])) j += 1;
    if (j >= text.length) continue;
    if (c === ',') {
      let k = j;
      while (k < text.length && text[k] >= 'a' && text[k] <= 'z') k += 1;
      const word = text.slice(j, k);
      if ((word !== 'and' && word !== 'or' && word !== 'but') || !(k < text.length && space(text[k]))) continue;
    }
    out.push(j);
  }
  return out;
}

/**
 * The sentence starts a passage may break at: `sentenceStarts`, less those that would split an
 * edit. A redline marks its change as `<del>` (or `<s>`) and `<ins>`. A break may not fall inside
 * one kind of edit (deleted text on both sides, or inserted text on both sides), nor between a
 * deletion and the insertion that replaces it: either would put half of what the layout exists to
 * show on another page. A whole inserted or deleted sentence may still begin or end a page.
 * `marks` runs parallel to `text`: `d` inside a deletion, `i` inside an insertion, `0` outside.
 * Self-contained, so it travels into the page beside `sentenceStarts` (lib/core/fit-measure.js).
 */
function passageBreaks(text, marks, starts) {
  return starts.filter((at) => {
    let i = at - 1;
    while (i >= 0 && /\s/.test(text[i])) i -= 1;
    const before = i >= 0 ? marks[i] : '0';
    const after = marks[at] || '0';
    if (before !== '0' && before === after) return false;
    return !(before === 'd' && after === 'i');
  });
}

/** `marks` for `passageBreaks`, read from HTML: one mark per character of `textOf(html)`. */
function editMarks(html) {
  const open = [];
  let out = '';
  for (const tok of html.match(/<[^<>]*>|<|[^<]+/g) || []) {
    if (tok[0] === '<') {
      const m = tok.match(/^<(\/?)(del|ins|s)\b/i);
      if (m && m[1]) open.pop();
      else if (m) open.push(m[2].toLowerCase() === 'ins' ? 'i' : 'd');
      continue;
    }
    const n = tok.replace(/&(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/gi, decodeEntity).length;
    out += (open.length ? open[open.length - 1] : '0').repeat(n);
  }
  return out;
}

/** The sentence starts, and for a redline (`clauses`) the clause starts too, in order, each once. */
function passageStarts(text, clauses = false) {
  const starts = sentenceStarts(text);
  return clauses ? [...new Set([...starts, ...clauseStarts(text)])].sort((a, b) => a - b) : starts;
}

/**
 * Where a passage in HTML breaks, as text offsets: the shared rule, kept off its edits. `clauses`
 * (a redline) adds the clause breaks.
 */
function passageCuts(html, { clauses = false } = {}) {
  const text = textOf(html);
  return passageBreaks(text, editMarks(html), passageStarts(text, clauses));
}

module.exports = { sentenceStarts, clauseStarts, passageStarts, passageBreaks, editMarks, passageCuts, PASSAGE_BREAKS_SRC: passageBreaks.toString(), textOf, decodeEntity, splitHtmlAtText, SENTENCE_STARTS_SRC: sentenceStarts.toString(), CLAUSE_STARTS_SRC: clauseStarts.toString() };
