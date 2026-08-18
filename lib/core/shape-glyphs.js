/**
 * lib/core/shape-glyphs.js — the curated list of characters that are SHAPES
 * pretending to be text, and what to use instead.
 *
 * WHY THIS EXISTS
 * ---------------
 * Lattice draws its chrome as SVG so a slide renders identically whatever font
 * the reader's machine resolves. A typed `✓` defeats that in one character: its
 * shape, weight, and vertical alignment come from whichever font happens to
 * cover U+2713, which differs across macOS, Windows, Linux and every PDF
 * viewer — and on a machine with no cover at all it renders as tofu.
 *
 * The failure was already in the tree, in the worst possible place: five sites
 * typed `content: "\2713"` — including `themes/a11y-base.css`, the accessibility
 * theme — re-implementing `--mark-check`, which has existed as a curated SVG
 * mask the whole time. Two spellings of one mark, one of them font-dependent.
 *
 * THE PREDICATE IS "SHAPE OR WORD", NOT "NON-ASCII"
 * -------------------------------------------------
 * This is a curated DENY list, not a ban on non-ASCII, and that distinction is
 * the difference between a rule people keep and a rule people switch off.
 *
 * An em-dash is punctuation. A curly quote is a quotation mark. `·` between two
 * words is a separator. `redline` literally renders `content: 'OLD — prior
 * text'` — that dash is part of a phrase. None of those are chrome, all of them
 * are legitimately text, and a general non-ASCII rule would fight typography
 * forever until someone disabled it.
 *
 * A chevron is not text. It is an icon wearing a character's clothes.
 *
 * So: every entry below is a character used as a MARK — something the reader
 * perceives as a drawn symbol rather than as language. Punctuation stays out,
 * permanently. If a candidate is arguable, leave it out; a smaller list that
 * survives is worth more than a complete one that gets bypassed.
 *
 * TWO CONSUMERS, DELIBERATELY DIFFERENT IN TONE
 * ---------------------------------------------
 *   · `tools/check-ownership.js` (`checkTypedGlyphs`) — polices OUR OWN
 *     surfaces (engine CSS, engine JS, the decks we ship) and FAILS the build.
 *     We hold ourselves to the contract absolutely.
 *   · `lib/authoring/lint-core.js` — sees a typed glyph in SOMEONE ELSE'S deck
 *     and COACHES: names what it will look like on another machine, points at
 *     the modifier that does it properly, offers the fix. It never blocks.
 *     An author may type whatever they like; flexibility is the necessary evil
 *     that keeps the engine worth writing for.
 *
 * Pure and dependency-free (HARD RULE #7's shape) so the browser lint, the CLI
 * and the build gate all read the same table and can never drift.
 */

/**
 * Every entry: the character, its Unicode name, and the CURATED REPLACEMENT.
 *
 * `token` is what CSS/JS should use. `authoring` is what a deck author should
 * type instead — often different, because an author writes markdown, not CSS.
 * A null `authoring` means "there is no deck-level equivalent"; the lint then
 * explains the risk without pretending there's a one-line fix.
 */
const SHAPE_GLYPHS = Object.freeze([
  // ── state marks — the set that already exists as curated SVG ──────────────
  { ch: '✓', name: 'CHECK MARK',              token: '--mark-check', authoring: '[x]' },
  { ch: '✔', name: 'HEAVY CHECK MARK',        token: '--mark-check-bold', authoring: '[x]' },
  { ch: '☑', name: 'BALLOT BOX WITH CHECK',   token: '--mark-check', authoring: '[x]' },
  { ch: '✗', name: 'BALLOT X',                token: '--mark-x', authoring: '[ ]' },
  { ch: '✘', name: 'HEAVY BALLOT X',          token: '--mark-x-bold', authoring: '[ ]' },
  { ch: '☒', name: 'BALLOT BOX WITH X',       token: '--mark-x', authoring: '[ ]' },
  { ch: '✕', name: 'MULTIPLICATION X',        token: '--mark-x', authoring: '[ ]' },
  { ch: '✖', name: 'HEAVY MULTIPLICATION X',  token: '--mark-x-bold', authoring: '[ ]' },

  // ── directional chrome ────────────────────────────────────────────────────
  { ch: '→', name: 'RIGHTWARDS ARROW',        token: '--icon-arrow-right', authoring: null },
  { ch: '←', name: 'LEFTWARDS ARROW',         token: '--icon-arrow-left', authoring: null },
  { ch: '↑', name: 'UPWARDS ARROW',           token: '--icon-arrow-up', authoring: null },
  { ch: '↓', name: 'DOWNWARDS ARROW',         token: '--icon-arrow-down', authoring: null },
  { ch: '➔', name: 'HEAVY WIDE-HEADED ARROW', token: '--icon-arrow-right', authoring: null },
  { ch: '⇒', name: 'RIGHTWARDS DOUBLE ARROW', token: '--icon-arrow-right', authoring: null },
  { ch: '↻', name: 'CLOCKWISE OPEN CIRCLE ARROW', token: '--icon-replay', authoring: null },
  { ch: '↺', name: 'ANTICLOCKWISE OPEN CIRCLE ARROW', token: '--icon-replay', authoring: null },

  // ── chevrons ──────────────────────────────────────────────────────────────
  { ch: '›', name: 'SINGLE RIGHT ANGLE QUOTE', token: '--icon-chevron-right', authoring: null },
  { ch: '‹', name: 'SINGLE LEFT ANGLE QUOTE',  token: '--icon-chevron-left', authoring: null },
  { ch: '❯', name: 'HEAVY RIGHT ANGLE QUOTE',  token: '--icon-chevron-right', authoring: null },
  { ch: '❮', name: 'HEAVY LEFT ANGLE QUOTE',   token: '--icon-chevron-left', authoring: null },
  { ch: '⌄', name: 'DOWN ARROWHEAD',           token: '--icon-chevron-down', authoring: null },

  // ── media / player controls ───────────────────────────────────────────────
  { ch: '▶', name: 'BLACK RIGHT-POINTING TRIANGLE', token: '--icon-play', authoring: null },
  { ch: '◀', name: 'BLACK LEFT-POINTING TRIANGLE',  token: '--icon-play', authoring: null },
  { ch: '▸', name: 'BLACK RIGHT-POINTING SMALL TRIANGLE', token: '--icon-play', authoring: null },
  { ch: '▼', name: 'BLACK DOWN-POINTING TRIANGLE',  token: '--icon-chevron-down', authoring: null },
  { ch: '⏸', name: 'DOUBLE VERTICAL BAR',           token: '--icon-pause', authoring: null },

  // ── emphasis marks ────────────────────────────────────────────────────────
  { ch: '✦', name: 'BLACK FOUR-POINTED STAR', token: '--icon-spark', authoring: null },
  { ch: '✧', name: 'WHITE FOUR-POINTED STAR', token: '--icon-spark-open', authoring: null },
  { ch: '★', name: 'BLACK STAR',              token: '--icon-star', authoring: null },
  { ch: '☆', name: 'WHITE STAR',              token: '--icon-star-open', authoring: null },
  { ch: '◆', name: 'BLACK DIAMOND',           token: '--icon-diamond', authoring: null },
  { ch: '●', name: 'BLACK CIRCLE',            token: '--icon-disc', authoring: null },
  { ch: '⚠', name: 'WARNING SIGN',            token: '--icon-warning', authoring: null },
]);

/**
 * DELIBERATELY ABSENT, and this list is as load-bearing as the one above —
 * it is the record of where the boundary was drawn, so nobody re-litigates it
 * every time the gate fires.
 *
 *   —  EM DASH        punctuation. `redline` renders `'OLD — prior text'`.
 *   –  EN DASH        punctuation (ranges).
 *   ·  MIDDLE DOT     a separator between words; `list.principles` uses it as
 *                     a bullet, which is arguable — but it is one character of
 *                     punctuation-weight ink, not an icon, and banning it would
 *                     drag every `A · B` label into scope.
 *   “ ” ‘ ’           quotation marks. `quote` and `citation-card` render them
 *                     AS quotation marks. That is their job.
 *   …  ELLIPSIS       punctuation.
 *   ×  MULTIPLICATION SIGN  a mathematical operator; `svg-label` measures it as
 *                     text. `✕` (MULTIPLICATION X) is the icon-shaped sibling
 *                     and IS listed.
 *   ─ │ ┌ ╱           box drawing. Used only in source-comment section
 *                     dividers, which no reader ever sees.
 *   &nbsp;            spacing, not a shape.
 */
const NOT_SHAPES = Object.freeze(['—', '–', '·', '“', '”', '‘', '’', '…', '×', ' ']);

/** Fast lookup: char → entry. */
const SHAPE_BY_CHAR = Object.freeze(new Map(SHAPE_GLYPHS.map((g) => [g.ch, g])));

/**
 * A global regex matching any listed shape.
 *
 * Built fresh on each call rather than shared: a `g`-flagged RegExp carries
 * mutable `lastIndex`, so one shared instance makes `.test()` alternate between
 * true and false on identical input — a bug that would make the gate miss every
 * other occurrence and look like flakiness.
 */
function shapeGlyphRe() {
  return new RegExp(`[${SHAPE_GLYPHS.map((g) => g.ch).join('')}]`, 'gu');
}

/**
 * Find every shape glyph in a string.
 * @returns {Array<{ch:string, index:number, name:string, token:string, authoring:string|null}>}
 */
function findShapeGlyphs(text) {
  const out = [];
  if (!text) return out;
  const re = shapeGlyphRe();
  let m;
  while ((m = re.exec(text)) !== null) {
    const g = SHAPE_BY_CHAR.get(m[0]);
    if (g) out.push({ ...g, index: m.index });
  }
  return out;
}

/**
 * The coaching sentence for one glyph — shared so the CLI, the browser lint and
 * the build gate say the same thing, and so the wording is edited in one place.
 *
 * @param {object} g       an entry from `findShapeGlyphs`
 * @param {'author'|'engine'} audience
 */
function shapeGlyphAdvice(g, audience = 'author') {
  const what = `\`${g.ch}\` (${g.name}) is a font character, so its shape and weight change with the reader's fonts — and it renders as tofu where nothing covers it.`;
  if (audience === 'engine') {
    return `${what} Use \`var(${g.token})\` instead — a curated SVG that renders identically everywhere.`;
  }
  return g.authoring
    ? `${what} Type \`${g.authoring}\` instead and the engine draws its own mark.`
    : `${what} There is no deck-level equivalent yet — if you need this shape, ask for a modifier rather than typing the character.`;
}

module.exports = {
  SHAPE_GLYPHS,
  SHAPE_BY_CHAR,
  NOT_SHAPES,
  shapeGlyphRe,
  findShapeGlyphs,
  shapeGlyphAdvice,
};
