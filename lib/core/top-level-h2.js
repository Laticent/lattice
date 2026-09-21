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
 *     committed corpus: 0 of 184 `examples/*.md` at 4999ea3 were affected, so
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
 * FIVE files still hand-roll the naive regex — 15 occurrences, counted with
 * `grep -rn '<h2[^>]*>' lib/ --include=*.js`:
 *
 *     lib/core/carousel.js                              8
 *     lib/core/split-envelope.js                        3
 *     lib/core/split-panels.js                          2
 *     lib/core/premise.js                               1
 *     lib/components/chart/_chart-family/chart-family.js 1
 *
 * An earlier version of this line said "three sites" and named the three
 * smallest, omitting the largest cluster entirely. They are pre-existing and off
 * the path of the change that moved this, so they are not swept in here (HARD
 * RULE #18's off-path rule) — but "tracked" was also wrong: nothing in the
 * backlog or the decision notes records them, and this comment is the only
 * record. Re-derive the table with the grep above; it moves as the tree does.
 *
 * String-level, deliberately: the engine path rewrites rendered HTML as a string
 * and has no DOM. A DOM caller wants `:scope > h2` and needs none of this.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT MODEL ───────────────────────────────────
 *
 * Checked against jsdom — the same parser the runtime arm reads through. The
 * shapes that a randomized run surfaced are pinned one by one in
 * `test/unit/core/top-level-h2.test.js`, deliberately as a FIXED corpus rather
 * than a seed: an earlier revision quoted a randomized figure here with no
 * committed generator, which made the claim unfalsifiable, and a checker built
 * its own generator and got a different number. A corpus names the rule that
 * broke; a seed names nothing.
 *
 * Two classes are knowingly out of scope, and both are recorded rather than
 * chased:
 *
 *   · AN UNCLOSED FORMATTING ELEMENT spanning a block's end tag —
 *     `<div><em></div><h2>`. A real parser keeps `<em>` on its list of active
 *     formatting elements and RECONSTRUCTS it afterwards, so the heading lands
 *     inside a second `<em>` and is not a direct child. That is the adoption
 *     agency algorithm; modelling it means writing a parser.
 *   · `<select>` and `<object>`, which have insertion modes of their own.
 *
 * Neither is reachable from markdown-it's output — it closes every inline
 * element it opens and emits neither element — so both need hand-written raw
 * HTML that is already broken.
 *
 * NO RANDOMIZED FIGURE IS QUOTED HERE, deliberately. Earlier revisions carried
 * two ("30,000 documents, 3 divergences"; "17 in a 40,000-case differential")
 * with no committed generator, and a checker who built its own generator got
 * neither number — which is the whole problem with a figure whose atom set lives
 * only in a transcript. What IS re-derivable is committed: the fixed corpus in
 * `test/unit/core/top-level-h2.test.js`, every shape checked against jsdom on
 * each run. Add a shape there when you find one; do not add a number here.
 *
 * The failure to watch for is a heading this reader calls top-level and the DOM
 * arm does not, or the reverse.
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

// STICKY, and matched against the source in place. The non-sticky form needed a
// `src.slice(lt, lt + 64)` at every `<` in the document just to anchor it — one
// allocation per candidate tag on a path every render walks.
// WORTH ~3%, NOT A HOT-PATH WIN, and the number is here because the shape of the
// change invites the larger claim. Measured over 4.8 MB of rendered decks,
// isolating only this line: 40.9 vs 42.4 ms/pass, a 3.3% gain, with an identical
// token stream. Against the ~23 ms the tokenizer walk ADDS to `splitSections`
// this returns about 1.5 ms of it.
const TAG_START = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)/y;

/**
 * The HTML spec's "special" category, as far as this walk models it — NOT a
 * complete one, and not a claim about what the tree emits. It decides whether an
 * end tag is HONORED or
 * IGNORED, which is not a detail: `<span><div></span>` keeps the `<div>` open,
 * because the parser walks up from the current node, hits a special element
 * before it finds the `<span>`, and drops the end tag as a parse error. A stack
 * that popped anyway reported everything after it as a direct child. The shape
 * is pinned against jsdom in the corpus test; no randomized count is quoted,
 * for the reason the module header gives.
 */
/**
 * Block elements whose START tag implicitly closes an open `<p>`.
 *
 * A browser closes the paragraph when the `<ul>` opens, making the list a direct
 * child; a walk that keeps the `<p>` open reads it as nested, and that is an
 * engine-vs-runtime split — `topic-track` derives a track on one arm and honors
 * an authored override on the other, for the same slide.
 *
 * AN EARLIER VERSION OF THIS COMMENT SAID markdown-it emits the shape. It does
 * not — `md.render('A claim:\n- one')` closes the paragraph before the list, with
 * or without a blank line, and a scan of every rendered deck in the tree found 0
 * sections carrying a block element inside an open `<p>`. The rule is still right
 * (it is what a parser does, and author raw HTML reaches it); the justification
 * was invented, which is worse than a missing one because it reads as measured.
 */
const P_CLOSING_TAGS = new Set([
  'address', 'article', 'aside', 'blockquote', 'center', 'details', 'dd', 'div',
  'dl', 'dt', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2',
  'h3', 'h4', 'h5', 'h6', 'header', 'hgroup', 'li', 'main', 'nav', 'ol', 'p',
  'pre', 'section', 'summary', 'table', 'ul',
]);

/**
 * Table-structure tags. A browser IGNORES these start tags outside a table —
 * "in body" treats a stray `<caption>` or `<tr>` as a parse error and drops it.
 * Opening one anyway buried everything after it a level deep.
 */
const TABLE_ONLY_TAGS = new Set([
  'caption', 'col', 'colgroup', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr',
]);

/**
 * Where the search for an open `<p>` stops. The spec closes a paragraph when
 * one is in BUTTON SCOPE, not merely when it is the current node — so
 * `<p><em><ul>` closes the paragraph and the list IS a direct child, which a
 * top-of-stack test misses.
 */
/**
 * Tags a SIBLING start tag implicitly closes. `<li>a<li>b` is two items, not
 * one — the second `<li>` ends the first, and `</li>` is optional in HTML.
 *
 * THE HEADING ROWS ARE LOAD-BEARING; THE REST ARE THE MODEL. Measured against
 * jsdom with the whole map emptied, `<h3>a<h2>Real</h2>` is the shape that
 * breaks: a browser's second heading start tag closes the first, so `Real` is a
 * direct child, and a walk that keeps the `<h3>` open reports no top-level
 * heading at all — which is `masthead.transform.js`'s whole band, gone. The
 * `li` / `dt` / `dd` / `td` / `th` / `tr` / `option` rows change no answer any
 * caller asks today (an explicit `</ul>`, `</dl>` or `</table>` pops the stack
 * to its match anyway, so the implied closes never decide anything).
 *
 * They stay because `walkTopLevel` is a PARSER MODEL, not a list of the
 * questions currently asked of it: it walks whatever tag a caller names, and a
 * stack that mis-nests `<li>a<li>b` answers wrongly the first time someone walks
 * one. That was not hypothetical — the reader that did walk `<li>` elements (the
 * authored-track marker, removed when the override became `<!-- _track: … -->`)
 * read that shape as ONE item "ab" while the DOM arm saw two.
 */
const HEADINGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

const CLOSED_BY_SIBLING = new Map([
  ['li', ['li']],
  // A heading start tag closes an open heading — `<h2>Outer<h2>Inner</h2>` is two
  // siblings, not a nest, and `</h3>` closes an open `<h2>`.
  ...HEADINGS.map((h) => [h, HEADINGS]),
  ['dt', ['dt', 'dd']],
  ['dd', ['dt', 'dd']],
  ['td', ['td', 'th']],
  ['th', ['td', 'th']],
  ['tr', ['tr']],
  ['option', ['option']],
]);

const BUTTON_SCOPE_BARRIERS = new Set([
  'applet', 'caption', 'html', 'table', 'td', 'th', 'marquee', 'object',
  'template', 'button',
]);

const SPECIAL_TAGS = new Set([
  ...P_CLOSING_TAGS,
  'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'caption', 'col', 'colgroup',
  // Not block containers, but scope barriers all the same — and this tree emits
  // the first two. Omitting them is what made `<button><div></button><h2>` read
  // one way here and another in a browser. (An earlier note put numbers on that
  // — "18 `<template>` sites, 13 `<button>`" — and neither reproduces: today
  // `grep -rho '<template' lib/ docs/src/` counts 49 and `'<button'` counts 395,
  // 16 of them under `lib/`. The counts move with the tree, so the grep is the
  // claim and the number is not.)
  'button', 'template', 'iframe', 'object', 'marquee', 'select', 'textarea',
  'svg', 'math',
]);

/**
 * Walk `src` left to right and yield everything a browser's tokenizer
 * distinguishes, in order.
 *
 * Yields `{ kind, start, end }` where `kind` is `'tag'` or `'inert'`, `start` is
 * the offset of `<` (or of the inert span), and `end` is one past its last
 * character. A `'tag'` also carries `{ name, isClose, selfClose }`, lowercased.
 *
 * INERT spans — comments, doctypes, and RAWTEXT content — are yielded rather
 * than silently swallowed, because two callers need to know where they are: the
 * depth walk must not count them, and `topic-track.js` must not read a
 * commented-out track as a real one. Having one scanner answer both is the
 * point (HARD RULE #1); the previous split — a tokenizer for depth and a raw
 * `String.includes` for the track — is what let a quoted `<ul class="tile-track">`
 * mean two different things on the two render paths.
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
      const stop = end < 0 ? n : end + 3;
      yield { kind: 'inert', start: lt, end: stop };
      i = stop;
      continue;
    }
    // Doctype, CDATA, processing instruction, bogus comment — none is an element.
    if (src.startsWith('<!', lt) || src.startsWith('<?', lt)) {
      const end = src.indexOf('>', lt + 2);
      const stop = end < 0 ? n : end + 1;
      yield { kind: 'inert', start: lt, end: stop };
      i = stop;
      continue;
    }

    TAG_START.lastIndex = lt;
    const head = TAG_START.exec(src);
    if (!head) { i = lt + 1; continue; }   // a bare `<` in prose is text
    const isClose = head[1] === '/';
    const name = head[2].toLowerCase();

    // Read to the tag's real `>`, stepping over quoted attribute values so a
    // `>` or a `<!--` INSIDE one cannot end the tag or start a comment.
    //
    // A QUOTE ONLY OPENS A VALUE AT VALUE-START — directly after `=`, whitespace
    // allowed. Anywhere else it is an ordinary character inside an UNQUOTED
    // value, which is what a browser does. Treating every quote as a delimiter
    // made an apostrophe in an unquoted value (`<div data-tip=it's>`) open a
    // value that never closed, so `j` ran to EOF, the scan yielded ONE tag
    // spanning the rest of the document and returned — every element after it
    // invisible. Through `splitSections` that stamped 0 of 3 slides on a deck
    // whose only sin was an apostrophe, and an unbalanced `"` (`<p title=5">`)
    // did the same.
    let j = lt + head[0].length;
    let quote = '';
    let prevSig = '';   // last non-space character seen outside a quoted value
    while (j < n) {
      const c = src[j];
      if (quote) {
        if (c === quote) { quote = ''; prevSig = c; }
        j += 1;
        continue;
      }
      if ((c === '"' || c === "'") && prevSig === '=') { quote = c; j += 1; continue; }
      if (c === '>') break;
      if (c !== ' ' && c !== '\t' && c !== '\n' && c !== '\r' && c !== '\f') prevSig = c;
      j += 1;
    }
    if (j >= n) {                           // unterminated tag: nothing follows it
      yield { kind: 'tag', name, isClose, selfClose: false, start: lt, end: n };
      return;
    }
    const selfClose = src[j - 1] === '/';
    yield { kind: 'tag', name, isClose, selfClose, start: lt, end: j + 1 };
    i = j + 1;

    // RAWTEXT content is text. Skip to the close tag so tag-LIKE text inside a
    // stylesheet or a script cannot move the depth count.
    if (!isClose && !selfClose && RAW_TEXT_TAGS.has(name)) {
      const close = new RegExp(`</${name}\\b`, 'i').exec(src.slice(i));
      // ONLY WHEN IT ACTUALLY CLOSES. A browser reads an unclosed `<style>` as
      // RAWTEXT all the way to EOF, and matching that here is catastrophic
      // rather than correct: one sentence of prose mentioning a `<style>` tag
      // turned the rest of the deck into text, and `splitSections` stamped 0 of
      // 3 slides. We are a document TOOL, not a browser — an author gets a deck
      // that still composes, not a silently empty render. The deliberate cost is
      // that tag-like text inside an UNCLOSED rawtext element is still read as
      // markup; a closed one, which is every real stylesheet and script the
      // engine emits, is skipped exactly as before.
      if (close) { const stop = i + close.index; if (stop > i) yield { kind: 'inert', start: i, end: stop }; i = stop; }
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
  for (const hit of walkTopLevel(src, want)) {
    const got = take(hit);
    if (got) return got;
  }
  return null;
}

/**
 * Every DIRECT-CHILD `<tag>` of `src`, in order, as `{ start, tagEnd }`.
 *
 * The depth bookkeeping is an open-element STACK, not a counter. A counter
 * treats any close tag as closing something, so an unmatched one —
 * `<div></aside><ul>` — walks the depth back to 0 and reports the `<ul>` as a
 * direct child, while a real parser ignores `</aside>` and leaves the list
 * inside the `<div>`.
 */
function* walkTopLevel(src, want) {
  const open = [];
  // `<template>` parses into a SEPARATE document fragment: nothing inside it is
  // ever a child of this section, and a `</section>` in there closes nothing out
  // here. So its content is skipped whole, and the element opens no level for
  // what follows it.
  let tmpl = 0;
  for (const t of scanTags(src)) {
    if (t.kind !== 'tag') continue;              // a comment or RAWTEXT body
    if (tmpl > 0) {
      if (t.name === 'template') tmpl += t.isClose ? -1 : 1;
      continue;
    }
    if (!t.isClose && t.name === 'template') { tmpl = 1; continue; }
    if (t.isClose) {
      const at = open.lastIndexOf(t.name);
      if (at === -1) continue;                   // never opened — the parser drops it
      // Which branch of the spec handles this end tag decides everything, and
      // getting it backwards flips the error rather than fixing it — the error
      // count roughly doubled, and in the opposite direction. A SPECIAL element's
      // own end tag is on the
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
    if (VOID_TAGS.has(t.name)) continue;
    // Dropped outside a table, exactly as a browser drops them.
    if (TABLE_ONLY_TAGS.has(t.name) && !open.includes('table')) continue;
    // `<div/>` does NOT close itself. XML self-closing syntax is honored only in
    // foreign content (SVG, MathML); in HTML the slash is ignored and the
    // element opens, so treating every `/>` as self-closing reported everything
    // after a `<div/>` as top-level.
    if (t.selfClose && (open.includes('svg') || open.includes('math'))) continue;
    // A sibling start tag closes the element it follows.
    const siblings = CLOSED_BY_SIBLING.get(t.name);
    if (siblings) {
      let at = -1;
      for (let i = open.length - 1; i >= 0; i -= 1) {
        if (siblings.includes(open[i])) { at = i; break; }
        if (SPECIAL_TAGS.has(open[i]) && !siblings.includes(open[i])) break;
      }
      if (at !== -1) open.length = at;
    }
    // A `<button>` start tag closes an already-open button before opening.
    if (t.name === 'button') {
      const at = open.lastIndexOf('button');
      if (at !== -1) open.length = at;
    }
    // A block element's start tag closes an open paragraph — searching down to
    // the nearest scope barrier, not just testing the current node.
    if (P_CLOSING_TAGS.has(t.name)) {
      for (let i = open.length - 1; i >= 0; i -= 1) {
        if (open[i] === 'p') { open.length = i; break; }
        if (BUTTON_SCOPE_BARRIERS.has(open[i])) break;
      }
    }
    if (open.length === 0 && t.name === want) yield { start: t.start, tagEnd: t.end };
    open.push(t.name);
  }
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
    if (t.kind === 'tag' && !t.isClose && t.name === want) return t.start;
  }
  return -1;
}

/**
 * Blank every inert span — comments, doctypes, RAWTEXT bodies — preserving
 * length, so offsets into the result still index the original string.
 *
 * For a caller that must ask a question this walk does not answer, and must not
 * be fooled by tag-LIKE text a browser never parses. `topic-track.js` uses it to
 * recognize its own emitted track without mistaking a quoted one for it.
 */
function maskInert(html) {
  const src = String(html ?? '');
  let out = '';
  let at = 0;
  for (const t of scanTags(src)) {
    if (t.kind !== 'inert') continue;
    out += src.slice(at, t.start) + ' '.repeat(t.end - t.start);
    at = t.end;
  }
  return out + src.slice(at);
}

/** Strip every tag from `html`, honoring quoted attribute values. */
function stripTags(html) {
  const src = String(html ?? '');
  let out = '';
  let at = 0;
  for (const t of scanTags(src)) {
    out += src.slice(at, t.start);
    at = t.end;
  }
  return out + src.slice(at);
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
 * 0 of 184 `examples/*.md` at 4999ea3 render differently either way, so the
 * corpus is indifferent and parity is free. The base is NAMED because the number
 * moves with it: an earlier revision said 182, a rebase added two decks, and the
 * figure stopped reproducing (HARD RULE #9).
 */
function findTopLevelH2(scope) {
  const src = String(scope ?? '');
  return findTopLevelTag(src, 'h2', ({ start, tagEnd }) => {
    // Find the close through the TOKENIZER, not `/<\/h2\s*>/`. A regex here
    // re-opens the hole this module exists to close: `<h2>A<!-- </h2> -->B</h2>`
    // ended the heading inside a comment (kernel "A", parser "AB"), and
    // `<h2><span title="</h2>">A</span></h2>` ended it inside an attribute value
    // (kernel "", parser "A").
    let depth = 0;
    let end = -1;
    for (const t of scanTags(src)) {
      if (t.kind !== 'tag' || t.start < tagEnd) continue;
      if (!HEADINGS.includes(t.name)) continue;
      if (t.isClose) {
        // ANY heading end tag closes an open heading, per the h1-h6 rule.
        if (depth === 0) { end = t.end; break; }
        depth -= 1;
      } else if (!t.selfClose) {
        // ...and any heading START tag closes it too, so this never nests.
        end = t.start;
        break;
      }
    }
    // UNCLOSED runs to the end of the scope, because that is what a parser does:
    // the heading swallows the rest of the section and the DOM mirror reads all
    // of it as the title's text. Returning null instead made the engine see no
    // heading at all where the runtime saw one, so a whole section's tracks came
    // out with one fewer column on one render path.
    return { start, text: src.slice(start, end === -1 ? src.length : end) };
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
  // `stripTags`, never `/<[^>]+>/g`: that form ends a tag at the first `>`,
  // including one inside a quoted attribute, so a heading carrying
  // `<span title="a > b">x</span>` leaked `b">x` into the text — and from there
  // into every sibling slide's track label.
  return stripTags(hit.text).replace(/\s+/g, ' ').trim();
}

module.exports = {
  VOID_TAGS,
  SPECIAL_TAGS,
  P_CLOSING_TAGS,
  TABLE_ONLY_TAGS,
  CLOSED_BY_SIBLING,
  maskInert,
  stripTags,
  walkTopLevel,
  RAW_TEXT_TAGS,
  scanTags,
  findTopLevelTag,
  findFirstTag,
  findTopLevelH2,
  hasTopLevelTag,
  readTopLevelH2Text,
};
