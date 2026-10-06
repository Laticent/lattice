/**
 * Curated SHAPE-GLYPH table — the one source of truth behind HARD RULE #29.
 *
 * A "shape glyph" is a Unicode character that is doing the job of a DRAWING:
 * a check, a cross, an arrow, a chevron, a disc, a caret, a warning triangle.
 * Lattice already draws every one of those as an SVG mask token (`--mark-*`,
 * `--shape-*`) precisely so the shape is IDENTICAL on every machine. A typed
 * glyph throws that away, because the glyph is not ours to draw:
 *
 *   · the deck's own type family almost never carries it (Inter, Source Serif,
 *     Helvetica, Arial and most UI faces have no U+2713), so the renderer falls
 *     back to whatever font on THAT machine does — a different weight, a
 *     different baseline, a different optical size than the type beside it;
 *   · on a machine with a color-emoji font ahead in the fallback chain the
 *     same character arrives as a color emoji (and Marp Core rewrites emoji to
 *     `<img class="emoji">` — see engineering/gotchas.md), so it stops taking
 *     the element's color at all and blows a palette-blind layout open;
 *   · on a machine with neither it renders as .notdef — a hollow box.
 *
 * The same character therefore renders three different ways across the three
 * surfaces one deck reaches (the CLI's headless Chromium, a shared `.html`
 * export opened on someone else's laptop, PowerPoint on Windows). That is the
 * whole reason the mask tokens exist.
 *
 * TWO AUDIENCES, ONE TABLE (HARD RULE #1 — one kernel, never a second copy):
 *   · `engine`  — our own CSS/JS. A glyph here is a DEFECT: we own the
 *                 stylesheet, so we use the token. Gated.
 *   · `author`  — a deck someone wrote. A glyph here is COACHED, never blocked.
 *                 Authors may write whatever they like; the lint rule tells
 *                 them what it will look like on another machine and names the
 *                 modifier that does it properly. Warn, never error.
 *
 * Consumers:
 *   · tools/check-ownership.js `checkTypedGlyphs` — the exceed-only ratchet.
 *   · lib/authoring/lint-core.js `findTypedShapeGlyphs` — the coaching rule
 *     (CLI `lint:deck`, `validate()`, and the browser Playground alike).
 *
 * SCOPE — rendered surfaces only. A `*.docs.md` is prose ABOUT a component and
 * is never projected, so it is deliberately out of scope; so is a decision
 * record, which is an archive of what we thought on a date.
 */

/**
 * Characters that LOOK non-ASCII but are TEXT, not drawings. Listed
 * deliberately so a future reader can see they were considered and excluded,
 * rather than wonder whether the table simply missed them.
 *
 * The discriminator is: would a typographer set this in the running face? An
 * em dash, a curly quote and a multiplication sign are glyphs every text font
 * carries and every text font draws in its own voice ON PURPOSE — that is
 * typography, and it is exactly what the engine's own `content:'\201C'` sites
 * are doing. A check mark is not typography; it is an icon someone typed.
 */
const NOT_SHAPES = Object.freeze([
  { glyph: '—', why: 'em dash — punctuation the text face draws' },
  { glyph: '–', why: 'en dash — punctuation (and the house range separator)' },
  { glyph: '·', why: 'middle dot — the house separator in eyebrows and footers' },
  { glyph: '×', why: 'multiplication sign — a MATH operator (`2×2`), not a cross mark' },
  { glyph: '÷', why: 'division sign — math' },
  { glyph: '±', why: 'plus-minus — math' },
  { glyph: '≈', why: 'almost equal — math' },
  { glyph: '≤', why: 'less-than-or-equal — math' },
  { glyph: '≥', why: 'greater-than-or-equal — math' },
  { glyph: '≠', why: 'not equal — math' },
  { glyph: '°', why: 'degree sign — a unit' },
  { glyph: '′', why: 'prime — a unit (minutes, feet)' },
  { glyph: '″', why: 'double prime — a unit (seconds, inches)' },
  { glyph: '…', why: 'ellipsis — punctuation' },
  { glyph: '“', why: 'left double quote — punctuation the display face draws (quote/split-panel)' },
  { glyph: '”', why: 'right double quote — punctuation' },
  { glyph: '‘', why: 'left single quote — punctuation' },
  { glyph: '’', why: 'right single quote / apostrophe — punctuation' },
  { glyph: '‹', why: 'single angle quote — punctuation (accent-finish reads it as one)' },
  { glyph: '›', why: 'single angle quote — punctuation, NOT the chevron icon (use --shape-chevron-right for chrome)' },
  { glyph: '«', why: 'double angle quote — punctuation' },
  { glyph: '»', why: 'double angle quote — punctuation' },
  { glyph: '§', why: 'section sign — legal citation, and every text face carries it' },
  { glyph: '¶', why: 'pilcrow — punctuation' },
  { glyph: '†', why: 'dagger — a footnote reference mark' },
  { glyph: '‡', why: 'double dagger — a footnote reference mark' },
  { glyph: '€', why: 'currency' },
  { glyph: '£', why: 'currency' },
  { glyph: '¥', why: 'currency' },
  { glyph: 'σ', why: 'Greek — text (statistics prose, math)' },
  { glyph: 'Δ', why: 'Greek — text (math, deltas)' },
]);

/**
 * The curated deny list. Each entry is a shape with a Lattice answer.
 *
 *   glyph      the character
 *   name       its Unicode name, so a reader can find it without a decoder
 *   role       what it is DOING on a slide — this is what picks the fix
 *   token      the engine-side token that draws it (null when the honest
 *              engine answer is "don't draw this at all")
 *   authorFix  the deck-authoring answer, in the author's vocabulary
 *   note       anything a reader would otherwise have to re-derive
 *
 * A glyph earns a row only when we can name what to do instead. A shape with
 * no answer is a shape we have no business flagging.
 */
const SHAPE_GLYPHS = Object.freeze([
  // ── status marks — the single biggest class, and the one with the most
  // complete answer: the universal state-mark system paints all six
  // (lib/core/state-marks.js).
  {
    glyph: '✓', name: 'CHECK MARK', role: 'status',
    token: '--mark-check',
    authorFix: 'Write `[x]`; in a table cell, also add `state-cells` to the slide.',
    note: 'The `[x]`/`[-]`/`[!]`/`[?]`/`[ ]`/`[/]` set is documented in lib/base/base.docs.md and demoed in examples/state-marks.md.',
  },
  {
    glyph: '✔', name: 'HEAVY CHECK MARK', role: 'status',
    token: '--mark-check-bold',
    authorFix: 'Write `[x]` and add `checks-bold` to the slide for the heavier stroke.',
  },
  {
    glyph: '✅', name: 'WHITE HEAVY CHECK MARK', role: 'status',
    token: '--mark-check',
    authorFix: 'Write `[x]`; this emoji ignores the slide\'s colors.',
  },
  {
    glyph: '☑', name: 'BALLOT BOX WITH CHECK', role: 'status',
    token: '--mark-check',
    authorFix: 'Write `[x]`; the drawn disc is the box.',
  },
  {
    glyph: '✗', name: 'BALLOT X', role: 'status',
    token: '--mark-x',
    authorFix: 'Write `[!]` for no or not met; in a table cell, also add `state-cells`.',
  },
  {
    glyph: '✘', name: 'HEAVY BALLOT X', role: 'status',
    token: '--mark-x-bold',
    authorFix: 'Write `[!]` with `checks-bold` on the slide.',
  },
  {
    glyph: '✕', name: 'MULTIPLICATION X', role: 'status',
    token: '--mark-x',
    authorFix: 'Write `[!]`; for the math sign in `2 × 2`, use `×`.',
  },
  {
    glyph: '❌', name: 'CROSS MARK', role: 'status',
    token: '--mark-x',
    authorFix: 'Write `[!]`; this emoji ignores the slide\'s colors.',
  },
  {
    glyph: '☒', name: 'BALLOT BOX WITH X', role: 'status',
    token: '--mark-x',
    authorFix: 'Write `[!]`; the drawn disc is the box.',
  },
  {
    glyph: '✖', name: 'HEAVY MULTIPLICATION X', role: 'status',
    token: '--mark-x-bold',
    authorFix: 'Write `[!]` with `checks-bold` on the slide.',
  },
  {
    glyph: '☐', name: 'BALLOT BOX', role: 'status',
    token: null,
    authorFix: 'Write `[ ]` for not started.',
  },
  {
    glyph: '❓', name: 'BLACK QUESTION MARK ORNAMENT', role: 'status',
    token: '--mark-question',
    authorFix: 'Write `[?]` for unknown; this emoji ignores the slide\'s colors.',
  },
  {
    glyph: '❔', name: 'WHITE QUESTION MARK ORNAMENT', role: 'status',
    token: '--mark-question',
    authorFix: 'Write `[?]` for unknown.',
  },
  {
    glyph: '⛔', name: 'NO ENTRY', role: 'status',
    token: '--mark-slash',
    authorFix: 'Write `[/]` for out of scope or waived.',
  },

  // ── arrows
  {
    glyph: '→', name: 'RIGHTWARDS ARROW', role: 'arrow',
    token: '--shape-arrow-right',
    authorFix: 'Write a word: "to", "becomes", "leads to" or "then".',
    note: 'A `quadrant` axis eyebrow is the one place the arrow is REQUIRED — it is the ' +
      'component\'s axis delimiter, and it is out of scope for both the gate and the linter. ' +
      'Do NOT coach ASCII `->` there: the regex lists it, but the eyebrow arrives as escaped ' +
      'HTML, so `->` reaches the transform as `-&gt;` and the split never fires — measured on ' +
      'examples/stage-inset.md slide 3, where the whole string became one axis name, the ' +
      'second axis vanished, and the data points moved.',
  },
  {
    glyph: '←', name: 'LEFTWARDS ARROW', role: 'arrow',
    token: null,
    authorFix: 'Write a word ("back to", "from"), or let a `connect:` line draw it.',
  },
  {
    glyph: '↑', name: 'UPWARDS ARROW', role: 'arrow',
    token: '--shape-arrow-up',
    authorFix: 'Write the word ("up", "under"), or show a rising trend in a chart.',
  },
  {
    glyph: '↓', name: 'DOWNWARDS ARROW', role: 'arrow',
    token: '--shape-arrow-down',
    authorFix: 'Write the word ("down", "governs"), or show a falling trend in a chart.',
  },
  {
    glyph: '↔', name: 'LEFT RIGHT ARROW', role: 'arrow',
    token: null,
    authorFix: 'Write a word: "and", "against" or "either way".',
  },
  {
    glyph: '⇒', name: 'RIGHTWARDS DOUBLE ARROW', role: 'arrow',
    token: '--shape-arrow-right',
    authorFix: 'Write the word ("therefore", "so", "yields").',
  },
  {
    glyph: '⇐', name: 'LEFTWARDS DOUBLE ARROW', role: 'arrow',
    token: null, authorFix: 'Write the word ("because", "from").',
  },
  {
    glyph: '⇔', name: 'LEFT RIGHT DOUBLE ARROW', role: 'arrow',
    token: null, authorFix: 'Write the word ("if and only if", "either way").',
  },
  {
    glyph: '⇄', name: 'RIGHTWARDS ARROW OVER LEFTWARDS ARROW', role: 'arrow',
    token: null, authorFix: 'Write the word ("exchange", "round trip", "both ways").',
  },
  {
    glyph: '⇅', name: 'UPWARDS ARROW LEFTWARDS OF DOWNWARDS ARROW', role: 'arrow',
    token: null, authorFix: 'Write the word ("up and down", "in and out").',
  },
  {
    glyph: '➡', name: 'BLACK RIGHTWARDS ARROW', role: 'arrow',
    token: '--shape-arrow-right',
    authorFix: 'Write the word; this arrow often shows as a color emoji.',
  },
  {
    glyph: '⬅', name: 'LEFTWARDS BLACK ARROW', role: 'arrow',
    token: null, authorFix: 'Write the word; this arrow often shows as a color emoji.',
  },
  {
    glyph: '⬆', name: 'UPWARDS BLACK ARROW', role: 'arrow',
    token: '--shape-arrow-up', authorFix: 'Write the word; this arrow often shows as a color emoji.',
  },
  {
    glyph: '⬇', name: 'DOWNWARDS BLACK ARROW', role: 'arrow',
    token: '--shape-arrow-down', authorFix: 'Write the word; this arrow often shows as a color emoji.',
  },
  {
    glyph: '➜', name: 'HEAVY ROUND-TIPPED RIGHTWARDS ARROW', role: 'arrow',
    token: '--shape-arrow-right',
    authorFix: 'Write the word: "leads to" or "then".',
  },
  {
    glyph: '➔', name: 'HEAVY WIDE-HEADED RIGHTWARDS ARROW', role: 'arrow',
    token: '--shape-arrow-right',
    authorFix: 'Write the word: "leads to" or "then".',
  },
  {
    glyph: '➤', name: 'BLACK RIGHTWARDS ARROWHEAD', role: 'arrow',
    token: '--shape-arrow-right',
    authorFix: 'Write the word: "leads to" or "then".',
  },
  {
    glyph: '↗', name: 'NORTH EAST ARROW', role: 'arrow',
    token: null,
    authorFix: 'Show a trend with data: `quadrant trail`, `progress`, or a `stats` delta.',
  },
  {
    glyph: '↻', name: 'CLOCKWISE OPEN CIRCLE ARROW', role: 'arrow',
    token: '--shape-refresh',
    authorFix: 'On a `cycle` slide the engine already draws the return arc; in prose, write "back to".',
  },
  {
    glyph: '↺', name: 'ANTICLOCKWISE OPEN CIRCLE ARROW', role: 'arrow',
    token: '--shape-refresh',
    authorFix: 'On a `state-chart` the engine draws the self-transition; in prose, write "repeats".',
  },
  {
    glyph: '↵', name: 'DOWNWARDS ARROW WITH CORNER LEFTWARDS', role: 'arrow',
    token: null, authorFix: 'Write "Enter" / "Return" — a key name is text.',
  },

  // ── chevrons and carets — pure chrome, never content
  {
    glyph: '❯', name: 'HEAVY RIGHT-POINTING ANGLE QUOTATION MARK ORNAMENT', role: 'chevron',
    token: '--shape-chevron-right',
    authorFix: 'Let the layout draw it; `compare-prose` and `statute-stack` draw their own step chevron.',
  },
  {
    glyph: '❮', name: 'HEAVY LEFT-POINTING ANGLE QUOTATION MARK ORNAMENT', role: 'chevron',
    token: null, authorFix: 'Let the layout draw its own chrome.',
  },
  {
    glyph: '⌄', name: 'DOWN ARROWHEAD', role: 'chevron',
    token: '--shape-chevron-down', authorFix: 'Let the layout draw its own chrome.',
  },
  {
    glyph: '⌃', name: 'UP ARROWHEAD', role: 'chevron',
    token: null, authorFix: 'Let the layout draw its own chrome.',
  },

  // ── solid triangles — direction chrome and media controls
  {
    glyph: '▶', name: 'BLACK RIGHT-POINTING TRIANGLE', role: 'control',
    token: '--shape-triangle-right',
    authorFix: 'Let the component draw it: `scene` draws play controls, and charts draw axis arrows.',
  },
  {
    glyph: '▸', name: 'BLACK RIGHT-POINTING SMALL TRIANGLE', role: 'control',
    token: '--shape-triangle-right', authorFix: 'Layout chrome — let the component draw it.',
  },
  {
    glyph: '►', name: 'BLACK RIGHT-POINTING POINTER', role: 'control',
    token: '--shape-triangle-right', authorFix: 'Layout chrome — let the component draw it.',
  },
  {
    glyph: '◀', name: 'BLACK LEFT-POINTING TRIANGLE', role: 'control',
    token: null, authorFix: 'Layout chrome — let the component draw it.',
  },
  {
    glyph: '◄', name: 'BLACK LEFT-POINTING POINTER', role: 'control',
    token: null, authorFix: 'Layout chrome — let the component draw it.',
  },
  {
    glyph: '▼', name: 'BLACK DOWN-POINTING TRIANGLE', role: 'control',
    token: null, authorFix: 'Layout chrome — let the component draw it.',
  },
  {
    glyph: '▾', name: 'BLACK DOWN-POINTING SMALL TRIANGLE', role: 'control',
    token: null, authorFix: 'Layout chrome — let the component draw it.',
  },
  {
    glyph: '▲', name: 'BLACK UP-POINTING TRIANGLE', role: 'control',
    token: null, authorFix: 'Layout chrome — let the component draw it.',
  },
  {
    glyph: '⏸', name: 'DOUBLE VERTICAL BAR', role: 'control',
    token: '--shape-pause', authorFix: 'A transport control is `scene` chrome the engine draws.',
  },
  {
    glyph: '⏭', name: 'BLACK RIGHT-POINTING DOUBLE TRIANGLE WITH VERTICAL BAR', role: 'control',
    token: null, authorFix: 'A transport control is chrome the engine draws.',
  },
  {
    glyph: '⏳', name: 'HOURGLASS WITH FLOWING SAND', role: 'control',
    token: null,
    authorFix: 'Say what is pending in words, or write `[-]`, `[?]` or `[ ]`.',
  },
  {
    glyph: '☰', name: 'TRIGRAM FOR HEAVEN', role: 'control',
    token: null, authorFix: 'A menu affordance is UI chrome, not deck content.',
  },
  {
    glyph: '⛶', name: 'SQUARE FOUR CORNERS', role: 'control',
    token: null, authorFix: 'A fullscreen affordance is UI chrome, not deck content.',
  },

  // ── discs, rings and geometry — bullets and swatches
  {
    glyph: '●', name: 'BLACK CIRCLE', role: 'bullet',
    token: null,
    authorFix: 'Use a `-` list for a bullet, or a state marker such as `[x]` for a status dot.',
  },
  {
    glyph: '○', name: 'WHITE CIRCLE', role: 'bullet',
    token: null,
    authorFix: 'Write `[ ]` for an open, hollow ring.',
  },
  {
    glyph: '◐', name: 'CIRCLE WITH LEFT HALF BLACK', role: 'status',
    token: '--mark-dash', authorFix: 'Write `[-]` — partial / qualified, drawn as the dash disc.',
  },
  {
    glyph: '◔', name: 'CIRCLE WITH UPPER RIGHT QUADRANT BLACK', role: 'status',
    token: '--mark-dash', authorFix: 'Write `[-]` — the engine has one partial mark, not a fill ramp.',
  },
  {
    glyph: '◎', name: 'BULLSEYE', role: 'bullet',
    token: null, authorFix: 'Write `[ ]` for a hollow state, or use a plain `-` bullet.',
  },
  {
    glyph: '◉', name: 'FISHEYE', role: 'bullet',
    token: null, authorFix: 'Write `[x]` for a filled state, or use a plain `-` bullet.',
  },
  {
    glyph: '◆', name: 'BLACK DIAMOND', role: 'status',
    token: null,
    authorFix: 'Write the status word (`decision`, `pilot`); the chart draws the diamond.',
  },
  {
    glyph: '◇', name: 'WHITE DIAMOND', role: 'status',
    token: null, authorFix: 'Write the status word and let the component draw the marker.',
  },
  {
    glyph: '■', name: 'BLACK SQUARE', role: 'bullet',
    token: null,
    authorFix: 'Use a `-` bullet; a chart draws its own legend swatches.',
  },
  {
    glyph: '□', name: 'WHITE SQUARE', role: 'bullet',
    token: null, authorFix: 'Use a `-` bullet; a chart draws its own legend swatches.',
  },
  {
    glyph: '▪', name: 'BLACK SMALL SQUARE', role: 'bullet',
    token: null, authorFix: 'Use a plain `-` bullet.',
  },
  {
    glyph: '▫', name: 'WHITE SMALL SQUARE', role: 'bullet',
    token: null, authorFix: 'Use a plain `-` bullet.',
  },
  {
    glyph: '◦', name: 'WHITE BULLET', role: 'bullet',
    token: null, authorFix: 'Use a nested `-` bullet — the engine styles the second level.',
  },
  {
    glyph: '•', name: 'BULLET', role: 'bullet',
    token: null,
    authorFix: 'Use a `-` list; the engine styles the marker.',
    note: 'The one shape here that every text face DOES carry, so it will not box or ' +
      'emoji — it is on the list because `◦` is, and because a typed bullet defeats the ' +
      'list styling rather than the font stack.',
  },

  // ── ornaments
  {
    glyph: '✦', name: 'BLACK FOUR POINTED STAR', role: 'ornament',
    token: '--shape-spark',
    authorFix: 'Write the note as an italic paragraph (`_…_`) under the list; the layout adds the spark.',
  },
  {
    glyph: '✧', name: 'WHITE FOUR POINTED STAR', role: 'ornament',
    token: '--shape-spark-open',
    authorFix: 'Mark the option `preferred` on `verdict-grid` or `split-compare`; the layout draws the star.',
  },
  {
    glyph: '✶', name: 'SIX POINTED BLACK STAR', role: 'ornament',
    token: '--shape-spark', authorFix: 'Let the layout draw its own ornament.',
  },
  {
    glyph: '★', name: 'BLACK STAR', role: 'ornament',
    token: null,
    authorFix: 'Put a rating in a `stats` or `progress` value.',
  },
  {
    glyph: '☆', name: 'WHITE STAR', role: 'ornament',
    token: null, authorFix: 'Put a rating in a chart value.',
  },
  {
    glyph: '⭐', name: 'WHITE MEDIUM STAR', role: 'ornament',
    token: null, authorFix: 'Put a rating in a chart value; this emoji ignores the slide\'s colors.',
  },
  {
    glyph: '✨', name: 'SPARKLES', role: 'ornament',
    token: '--shape-spark', authorFix: 'Say what is new in words.',
  },
  {
    glyph: '❦', name: 'FLORAL HEART', role: 'ornament',
    token: null, authorFix: 'A divider ornament is `divider` chrome the layout draws.',
  },

  // ── alarms and affordances
  {
    glyph: '⚠', name: 'WARNING SIGN', role: 'status',
    token: '--shape-warning',
    authorFix: 'Add `note-warn` to the slide; the engine draws the warning triangle.',
  },
  {
    glyph: '⚡', name: 'HIGH VOLTAGE SIGN', role: 'ornament',
    token: null,
    authorFix: 'Say what is fast or urgent in words, such as "fast path".',
  },
  {
    glyph: '⚙', name: 'GEAR', role: 'control',
    token: null, authorFix: 'A settings affordance is UI chrome, not deck content.',
  },
  {
    glyph: '✎', name: 'LOWER RIGHT PENCIL', role: 'control',
    token: null, authorFix: 'An edit affordance is UI chrome, not deck content.',
  },
  {
    glyph: '✏', name: 'PENCIL', role: 'control',
    token: null, authorFix: 'An edit affordance is UI chrome, not deck content.',
  },
  {
    glyph: '⌘', name: 'PLACE OF INTEREST SIGN', role: 'control',
    token: null,
    authorFix: 'Write `Cmd` or `Ctrl`; this symbol shows as a box off Apple machines.',
  },
]);

const BY_GLYPH = new Map(SHAPE_GLYPHS.map((e) => [e.glyph, e]));

// The character class, built once from the table so a new row is automatically
// matched. Characters are escaped as `\uXXXX` so the source of the regex stays
// ASCII and cannot itself be mangled by a re-encode.
const CLASS_SOURCE = SHAPE_GLYPHS
  .map((e) => [...e.glyph].map((c) => `\\u{${c.codePointAt(0).toString(16)}}`).join(''))
  .join('');

/**
 * A FRESH regex on every call, on purpose.
 *
 * A `/g` regex carries mutable `lastIndex`, so a single shared instance
 * alternates true/false across successive `.test()` calls and silently drops
 * every other match. Two consumers scan with this (the gate over the whole
 * repo, the linter per slide) and both would be wrong in a way that looks like
 * an off-by-one in the count rather than a bug in the regex. Do NOT hoist this
 * to a module constant.
 */
function shapeGlyphRe() {
  return new RegExp(`[${CLASS_SOURCE}]`, 'gu');
}

/**
 * Every shape glyph in `text`, with enough position for a message.
 * @param {string} text
 * @returns {Array<{glyph: string, index: number, line: number, column: number, entry: object}>}
 */
function findShapeGlyphs(text) {
  const src = String(text || '');
  const re = shapeGlyphRe();
  const out = [];
  // Line starts, so a hit's line/column is a lookup rather than a re-scan.
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === '\n') starts.push(i + 1);
  let m;
  while ((m = re.exec(src)) !== null) {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= m.index) lo = mid;
      else hi = mid - 1;
    }
    out.push({
      glyph: m[0],
      index: m.index,
      line: lo + 1,
      column: m.index - starts[lo] + 1,
      entry: BY_GLYPH.get(m[0]) || null,
    });
  }
  return out;
}


/**
 * Blank out FENCED code blocks, preserving line structure so a hit's line
 * number still points at the file on disk.
 *
 * A glyph inside a ``` fence is QUOTED material, not slide chrome: the deck is
 * showing terminal output, source, or a counter-example. Two shipped decks
 * quote the CLI's own overflow warning verbatim — "⚠ deck.md · slide 4 ·
 * capacity-overflow" — and the CLI really does print that (terminal text is
 * out of scope by design, since a console line is not a rendered surface).
 * Converting those would make the deck lie about what the tool prints.
 *
 * INLINE code spans stay in scope on purpose: a backticked eyebrow is set on
 * the slide, so both the coaching and the count should still see a glyph in it.
 * (No inline span is exempt any more. `quadrant`'s arrow eyebrow was, until its
 * axis moved onto the bracketed list — engineering/decisions/2026-09-22-chart-axis-grammar.md.)
 */
function stripFencedCode(text) {
  const lines = String(text || '').split('\n');
  let fence = null;
  return lines.map((line) => {
    const open = line.match(/^\s*(`{3,}|~{3,})/);
    if (fence) {
      // A closing fence carries no info string (CommonMark): ```` ```js ```` inside a
      // ```` ```markdown ```` sample is content, not the end of the sample.
      const closed = open && open[1][0] === fence[0] && open[1].length >= fence.length
        && !line.slice(line.indexOf(open[1]) + open[1].length).trim();
      const blanked = ' '.repeat(line.length);
      if (closed) fence = null;
      return blanked;
    }
    // A backtick fence's info string cannot hold a backtick, so ```` ```js — the `code` ```` is
    // prose that happens to start with three backticks, not an opener (CommonMark).
    const info = open ? line.slice(line.indexOf(open[1]) + open[1].length) : '';
    if (open && !(open[1][0] === '`' && info.includes('`'))) { fence = open[1]; return ' '.repeat(line.length); }
    return line;
  }).join('\n');
}


/**
 * Coaching copy for one glyph.
 *
 * @param {string} glyph
 * @param {'author'|'engine'} audience
 * @returns {string|null} null when the glyph is not on the deny list.
 */
function shapeGlyphAdvice(glyph, audience = 'author') {
  const entry = BY_GLYPH.get(glyph);
  if (!entry) return null;
  const cp = `U+${glyph.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
  if (audience === 'engine') {
    return entry.token
      ? `${glyph} (${cp}, ${entry.name}) is a typed glyph in engine CSS — paint ` +
        `var(${entry.token}) through a mask instead, so the shape is ours and the color ` +
        `stays the element's (HARD RULE #3).`
      : `${glyph} (${cp}, ${entry.name}) is a typed glyph in engine CSS and has no icon ` +
        `token, because the engine should not be drawing it at all. ${entry.authorFix}`;
  }
  // One short sentence per glyph: the lint message already states the risk once, so the
  // author-facing advice is only what to write instead.
  return `\`${glyph}\`: ${entry.authorFix}`;
}

module.exports = {
  SHAPE_GLYPHS,
  NOT_SHAPES,
  shapeGlyphRe,
  stripFencedCode,
  findShapeGlyphs,
  shapeGlyphAdvice,
};
