/**
 * top-level-h2 — find a section's OWN title `<h2>`, never one nested inside its
 * content.
 *
 * ── WHY THIS IS A KERNEL AND NOT A REGEX ────────────────────────────────────
 *
 * The obvious `html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)` is DEPTH-BLIND: it
 * returns the first `<h2>` in the string, wherever it sits. A `<h2>` buried
 * inside a component's own card or panel (a QR card's `.qr-head > h2`, emitted
 * when a canvas component rebuilds its section before the masthead kernel runs)
 * is that component's in-card title, NOT the slide's title. The naive form lifts
 * it — the exact bug the wifi migration hit, recorded at the masthead kernel's
 * call site and pinned by `test/integration/parity/wifi-overflow-preserved.test.js`.
 *
 * This scan tracks element depth and only matches at depth 0, so it answers the
 * question every caller actually has: *what is THIS section's heading?*
 *
 * ── WHY A TOKENIZER AND NOT A MASK ──────────────────────────────────────────
 *
 * An earlier revision reached the same place by BLANKING the inert spans first
 * — a chain of `.replace()` calls over comments, then `<script>`, then
 * `<style>` — and walking the blanked copy. Three things went wrong with that
 * shape, and all three are the same mistake: a regex cannot tell where a real
 * parser is.
 *
 *   · The comment pass ran FIRST and fell back to end-of-string, so a `<!--`
 *     that a browser reads as ordinary TEXT — inside `<style>` RAWTEXT, or
 *     inside an attribute value such as `data-tip="type <!-- to open a note"` —
 *     blanked everything after it. `findTopLevelH2` then returned null and
 *     `masthead.transform.js` gates its whole band on that, so the band
 *     silently vanished from any deck carrying either shape. Measured on the
 *     committed corpus: 0 of 182 `examples/*.md` were affected, so nothing
 *     shipped wrong — but `examples/finish-backdrops.md` and
 *     `finish-override.md` already carry inline `<style>`, so it was one
 *     comment character away.
 *   · The same blanking split the engine from the runtime, whose DOM arm reads
 *     `:scope > h2` off a real parse and never saw any of it (HARD RULE #1).
 *   · The mask could not see attribute quoting at all, so `<div title="a > b">`
 *     ended the tag early and desynchronized the depth count.
 *
 * So the walk now tokenizes: one left-to-right pass that skips comments only
 * where a comment can START, skips RAWTEXT element content, and reads a tag to
 * its real end by honoring quoted attribute values. Offsets are into the
 * ORIGINAL string — there is no second copy to keep in register.
 *
 * ── SHARED, NOT COPIED (HARD RULE #1, HARD RULE #15) ────────────────────────
 *
 * It lived inside `lib/forms/cell/masthead/masthead.transform.js` while it had
 * one caller. `lib/transformers/topic-track.js` is the second, so it moves here
 * rather than being cloned — a second copy is how the depth-blind form would
 * come back. The masthead's OTHER two scans now come through here too: leaving
 * `findTopLevelEyebrow` on its own hand-rolled walk while the title scan moved
 * made the two disagree about depth inside a comment, and the band then
 * rendered with its title and its eyebrow stranded below the hairline — a
 * state neither the old engine nor the runtime ever produced.
 *
 * Three sites in the tree still hand-roll the naive regex (`lib/core/premise.js`,
 * `lib/core/split-envelope.js`, `lib/core/split-panels.js` x2); they are
 * pre-existing and off the path of the change that moved this, so they are
 * tracked rather than swept in (HARD RULE #18's off-path rule).
 *
 * String-level, deliberately: the engine path rewrites rendered HTML as a string
 * and has no DOM. A DOM caller wants `:scope > h2` and needs none of this.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT MODEL ───────────────────────────────────
 *
 * Differentially checked against jsdom — the same parser the runtime arm reads
 * through — over 60,000 random documents built from comments, RAWTEXT, quoted
 * attributes holding `>` and `<!--`, unmatched end tags, and mixed block and
 * inline nesting: 0 divergences on `hasTopLevelTag(_, 'ul')`, 3 on
 * `readTopLevelH2Text`.
 *
 * All three are one shape: an unclosed FORMATTING element spanning a block's
 * end tag, `<div><em></div><h2>`. A real parser keeps `<em>` on its list of
 * active formatting elements and RECONSTRUCTS it after the `</div>`, so the
 * heading lands inside a second `<em>` and is not a direct child. That is the
 * adoption agency algorithm, and no stack walk approximates it — modelling it
 * means writing a parser.
 *
 * Not chased, because markdown-it closes every inline element it opens and the
 * shape needs hand-written raw HTML that is already broken. It is recorded here
 * rather than left to be rediscovered as a mystery: the failure is a heading
 * this reader calls top-level and the DOM arm does not.
 */

/** Elements with no closing tag — they must not open a depth level. */
const VOID_TAGS = new Set([
  'br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col',
  'embed', 'source', 'track', 'wbr',
]);

/**
 * Elements whose CONTENT is text, not markup. A `</style` ends the element and
 * nothing before it is parsed as a tag — the RAWTEXT hazard HARD RULE #22
 * documents one level up, here in its reading form rather than its writing one.
 */
const RAW_TEXT_TAGS = new Set(['script', 'style', 'textarea']);

const TAG_START = /^<(\/?)([a-zA-Z][a-zA-Z0-9-]*)/;

/**
 * The HTML spec's "special" category, trimmed to what markdown and component
 * output can actually emit. It decides whether an end tag is HONORED or
 * IGNORED, which is not a detail: `<span><div></span>` keeps the `<div>` open,
 * because the parser walks up from the current node, hits a special element
 * before it finds the `<span>`, and drops the end tag as a parse error. A stack
 * that popped anyway reported everything after it as a direct child. Measured
 * against jsdom: that one shape was every divergence in a 40,000-case
 * differential, 17 of them.
 */
const SPECIAL_TAGS = new Set([
  'address', 'article', 'aside', 'blockquote', 'center', 'details', 'dd', 'div',
  'dl', 'dt', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2',
  'h3', 'h4', 'h5', 'h6', 'header', 'hgroup', 'li', 'main', 'nav', 'ol', 'p',
  'pre', 'section', 'summary', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead',
  'tr', 'ul',
]);

/**
 * Walk `src` left to right and yield every ELEMENT tag a browser would parse,
 * in order.
 *
 * Yields `{ name, isClose, selfClose, start, end }` where `name` is lowercased,
 * `start` is the offset of `<`, and `end` is one past `>`. Text, comments,
 * doctypes, and RAWTEXT content are skipped rather than yielded — they are not
 * markup, and counting them is what broke the mask form.
 */
function* scanTags(src) {
  const n = src.length;
  let i = 0;
  while (i < n) {
    const lt = src.indexOf('<', i);
    if (lt < 0) return;

    // A comment, but ONLY here — at a position where markup can begin. The
    // same four characters inside an attribute value or inside RAWTEXT never
    // reach this branch, because those spans are consumed below.
    if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt + 4);
      i = end < 0 ? n : end + 3;
      continue;
    }
    // Doctype, CDATA, processing instruction, bogus comment — none is an element.
    if (src.startsWith('<!', lt) || src.startsWith('<?', lt)) {
      const end = src.indexOf('>', lt + 2);
      i = end < 0 ? n : end + 1;
      continue;
    }

    const head = TAG_START.exec(src.slice(lt, lt + 64));
    if (!head) { i = lt + 1; continue; }   // a bare `<` in prose is text
    const isClose = head[1] === '/';
    const name = head[2].toLowerCase();

    // Read to the tag's real `>`, stepping over quoted attribute values so a
    // `>` or a `<!--` INSIDE one cannot end the tag or start a comment.
    let j = lt + head[0].length;
    let quote = '';
    while (j < n) {
      const c = src[j];
      if (quote) { if (c === quote) quote = ''; j += 1; continue; }
      if (c === '"' || c === "'") { quote = c; j += 1; continue; }
      if (c === '>') break;
      j += 1;
    }
    if (j >= n) {                           // unterminated tag: nothing follows it
      yield { name, isClose, selfClose: false, start: lt, end: n };
      return;
    }
    const selfClose = src[j - 1] === '/';
    yield { name, isClose, selfClose, start: lt, end: j + 1 };
    i = j + 1;

    // RAWTEXT content is text. Skip to the close tag so tag-LIKE text inside a
    // stylesheet or a script cannot move the depth count.
    if (!isClose && !selfClose && RAW_TEXT_TAGS.has(name)) {
      const close = new RegExp(`</${name}\\b`, 'i').exec(src.slice(i));
      i = close ? i + close.index : n;
    }
  }
}

/**
 * Find the first DIRECT-CHILD `<tag>` of `scope`.
 *
 * The same depth walk `findTopLevelH2` needs, exposed because "is there a
 * top-level `<ul>` here?" is the same question about a different tag — and
 * answering it with a bare `/<ul[\s>]/` is the depth-blind mistake one level
 * down: a list inside a blockquote or a card is not the section's own list.
 *
 * `accept` is called with `{ start, tagEnd }` and decides: a truthy return is
 * the result, `null` means "not this one, keep walking". Without it a caller
 * that rejects a hit loses the ones after it. Default: report the offsets.
 *
 * @returns whatever `accept` returned, or `{ start, tagEnd }` by default, or `null`.
 */
function findTopLevelTag(scope, tagName, accept) {
  const want = String(tagName).toLowerCase();
  const src = String(scope ?? '');
  const take = accept || ((hit) => hit);
  // A STACK of open element names, not a counter. A counter treats any close
  // tag as closing something, so an unmatched one — `<div></aside><ul>` — walks
  // the depth back to 0 and reports the `<ul>` as a direct child, while a real
  // parser ignores `</aside>` and leaves the list inside the `<div>`. The stack
  // pops only when the name is actually open, and pops through what a browser
  // would implicitly close (`<div><span></div>`).
  const open = [];
  for (const t of scanTags(src)) {
    if (t.isClose) {
      const at = open.lastIndexOf(t.name);
      if (at === -1) continue;                 // never opened — the parser drops it
      // Which branch of the spec handles this end tag decides everything, and
      // getting it backwards flips the error rather than fixing it (measured:
      // 17 divergences became 36). A SPECIAL element's own end tag is on the
      // explicit list — it pops to its match unconditionally, closing whatever
      // sits above, which is what `<blockquote><div></blockquote>` does. Every
      // other end tag falls to "any other end tag", which walks up from the
      // current node and STOPS at the first special element: `</span>` with a
      // `<div>` still open is a parse error and is dropped, so the div keeps
      // everything after it.
      let blocked = false;
      if (!SPECIAL_TAGS.has(t.name)) {
        for (let i = open.length - 1; i > at; i -= 1) {
          if (SPECIAL_TAGS.has(open[i])) { blocked = true; break; }
        }
      }
      if (!blocked) open.length = at;
      continue;
    }
    if (t.selfClose || VOID_TAGS.has(t.name)) continue;
    if (open.length === 0 && t.name === want) {
      const got = take({ start: t.start, tagEnd: t.end });
      if (got) return got;
    }
    open.push(t.name);
  }
  return null;
}

/**
 * The offset of the first `<tag>` at ANY depth, skipping inert spans.
 *
 * The depth-BLIND question, asked safely. `extractEyebrowP` needs it: it scopes
 * its search to the substring before the title, and a `<h2>` mentioned inside a
 * comment must not truncate that scope.
 *
 * @returns {number} the offset of `<`, or -1.
 */
function findFirstTag(scope, tagName) {
  const want = String(tagName).toLowerCase();
  for (const t of scanTags(String(scope ?? ''))) {
    if (!t.isClose && t.name === want) return t.start;
  }
  return -1;
}

/**
 * The first DIRECT-CHILD `<h2>` of `scope`.
 *
 * @param {string} scope  a section's inner HTML
 * @returns {{ start: number, text: string } | null}
 *   `start` is the offset of `<h2` within `scope`; `text` is the whole element
 *   including its tags. `null` when the section has no top-level `<h2>` — which
 *   is a real answer, not a failure: a slide may legitimately have none.
 *
 * CASE-INSENSITIVE, matching the DOM mirror's `:scope > h2`. An earlier
 * revision matched the tag name case-insensitively and then extracted with a
 * case-SENSITIVE regex, so a stray `<H2>` was reported as a hit and could not be
 * read back. That split the engine from the runtime twice over: the masthead
 * lifted a different heading, and `topic-track` dropped the slide's name from
 * every sibling's track while the runtime kept it. Measured before changing it:
 * 0 of 182 `examples/*.md` render differently either way, so the committed
 * corpus is indifferent and parity is free.
 */
function findTopLevelH2(scope) {
  const src = String(scope ?? '');
  return findTopLevelTag(src, 'h2', ({ start, tagEnd }) => {
    const close = /<\/h2\s*>/i.exec(src.slice(tagEnd));
    if (!close) return null;               // unclosed: not an element we can move
    return { start, text: src.slice(start, tagEnd + close.index + close[0].length) };
  });
}

/** Does `scope` have a direct-child `<tag>`? */
function hasTopLevelTag(scope, tagName) {
  return findTopLevelTag(scope, tagName) !== null;
}

/**
 * The TEXT of a section's own `<h2>`, tags stripped and whitespace collapsed —
 * what a caller wants when it needs the heading as a string rather than as
 * markup to move. Returns `''` when there is no top-level heading.
 *
 * Entities are left ENCODED. The one consumer today re-emits this into HTML, so
 * decoding here would double-encode on the way back out; a consumer that needs
 * plain text decodes at its own edge.
 */
function readTopLevelH2Text(scope) {
  const hit = findTopLevelH2(scope);
  if (!hit) return '';
  return hit.text
    .replace(/^<h2[^>]*>/i, '')
    .replace(/<\/h2\s*>$/i, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = {
  VOID_TAGS,
  SPECIAL_TAGS,
  RAW_TEXT_TAGS,
  scanTags,
  findTopLevelTag,
  findFirstTag,
  findTopLevelH2,
  hasTopLevelTag,
  readTopLevelH2Text,
};
