/**
 * lift-bracket-span.js — take the author's bracketed spans OUT of a section's
 * markdown-it HTML, and say which SLOT each one came from.
 *
 * POSITION IS THE AUTHORITY. A bracketed span above the chart body is the AXIS;
 * one below it is the LABEL SET. That is the whole discrimination, and it is
 * what lets `bracket-list.js` be one tokenizer for both — `{Effort, 0..10}` and
 * `{[x], Enacted}` are the same shape, so nothing in the grammar could tell
 * them apart and nothing should try.
 *
 * WHAT THIS REPLACES. Three self-identifying grammars, each deformed by the job
 * of announcing itself: `matrix-grid` and `scatter` count code spans in a
 * paragraph (two is an axis), `quadrant` looks for an arrow glyph, and
 * `lift-label-set.js` try-parses EVERY one-code paragraph in the section and
 * leans on a parse failure to let eyebrows through. Its header calls that last
 * one a hard-won trap, and it is: the scan has to be total because an eyebrow
 * sets in exactly the same shape.
 *
 * THE BRACKET STILL DECIDES WHETHER IT IS A CONSTRUCT AT ALL — position only
 * decides WHICH. A paragraph above the body that is not a bracketed list is an
 * ordinary eyebrow and survives untouched, which is the pass-through every
 * chart depends on.
 *
 * Pure: strings in, plain data out. No DOM, no markdown-it, no fs (HARD RULE #1).
 */

const { parseBracketList } = require('./bracket-list');
const { plainText } = require('./plain-text');
const { ESCAPED_ATTR } = require('./inline-code-directives');

/**
 * Where the chart's own body begins.
 *
 * THE CALLER DECLARES ITS BODY TAG, and that is a fix rather than a flourish.
 * The first cut took the earliest of `<ul`/`<ol`/`<table` for everyone, so a
 * framing bullet list above a GRID's axis line moved the boundary in front of
 * it: the axis landed in the below slot and was lost. A grid's body is its
 * table; an SVG chart's is its list. Only the component knows which.
 *
 * Read with `indexOf` rather than a regex because there is nothing to match:
 * the question is only "where does the body start".
 *
 * @param {string} html
 * @param {string[]} [tags]  body openers, earliest wins
 */
function bodyIndex(html, tags) {
  let at = -1;
  for (const tag of tags?.length ? tags : BODY_TAGS) {
    const i = html.indexOf(tag);
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  return at;
}

const BODY_TAGS = ['<ul', '<ol', '<table'];

/**
 * Lift the author's bracketed spans out of a section's HTML.
 *
 * Both slots are optional and independent: a chart may carry an axis, a label
 * set, both, or neither. The FIRST accepted list in each slot wins; a second is
 * left in place rather than silently merged, so an author who writes two sees
 * two (`#2272` made a duplicate key a warning for the same reason).
 *
 * A COMPONENT DECLARES WHICH SLOTS IT OWNS. `scatter` has an axis and no label
 * set, and its manifest declares a trailing-paragraph coda — so lifting the
 * below slot there would EAT a coda that happened to be bracketed. Both slots
 * default to on, because owning both is the normal case and forgetting a flag
 * should not silently disable a feature.
 *
 * A COMPONENT ALSO DECLARES ITS ACCEPTOR, and this one is a data-loss fix. The
 * lift used to cut any paragraph `parseBracketList` accepted, while `matrix-grid`
 * read the slot with `parseInlineSet` — a STRICTER grammar. Anything the first
 * accepted and the second rejected was removed from the html and then dropped
 * on the floor: a trailing caption `[Source: finance, FY26]` rendered before
 * this construct and vanished after it. A span is now cut ONLY by the acceptor
 * that will actually read it, so a paragraph the caller cannot use survives on
 * the slide. Nothing may be lifted and then discarded.
 *
 * @param {string} html  the section's html
 * @param {{above?: boolean, below?: boolean, bodyTags?: string[],
 *          acceptAbove?: (t: string) => unknown,
 *          acceptBelow?: (t: string) => unknown}} [opts]
 * @returns {{html: string, above: string|null, below: string|null}}
 *   html with the lifted paragraphs removed, and each slot's raw span text —
 *   the CALLER parses, because arity differs by slot.
 */
function liftBracketSpans(html, opts) {
  const o = opts || {};
  const wantAbove = o.above !== false;
  const wantBelow = o.below !== false;
  const acceptAbove = o.acceptAbove || parseBracketList;
  const acceptBelow = o.acceptBelow || parseBracketList;
  const src = String(html ?? '');
  const boundary = bodyIndex(src, o.bodyTags);
  // No body means no chart, so there is no slot to be in and nothing to lift.
  if (boundary < 0) return { html: src, above: null, below: null };

  // `<p\b`, never `<p[^>]*>`: the latter matches `<pre>`, and the lazy run then
  // skips past the fence's own `</code>` to the NEXT one, swallowing the axis
  // paragraph with it. That is both a silent loss and a polynomial shape —
  // measured 1.34ms at 200 fenced blocks, 21.22ms at 800 — which is the CodeQL
  // js/polynomial-redos class this repo has been flagged for before.
  const re = /<p\b[^>]*>\s*<code[^>]*>([\s\S]*?)<\/code>\s*<\/p>\s*/g;
  let above = null;
  let below = null;
  const cuts = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    // AN ESCAPED SPAN IS LITERAL TEXT, BY DEFINITION. `inline-code-directives.js`
    // stamps `data-lat-escaped` so a second pass can tell a resolved escape from
    // a live directive — its header records that the runtime mirror runs many
    // times per document and without the mark would convert the literal back
    // into the thing the author escaped. This lift is another second pass. The
    // documented `` `\[x]` `` is exactly that case: escaping strips the
    // dispatch and leaves a bare bracketed span, which this would otherwise
    // read as an axis named "x".
    if (m[0].includes(ESCAPED_ATTR)) continue;
    const text = plainText(m[1]);
    const isAbove = m.index < boundary;
    // The bracket makes it a construct; position names it; the ACCEPTOR decides
    // whether this caller can use it. All three must agree before it is cut.
    if (isAbove) {
      if (!wantAbove || above !== null || !acceptAbove(text)) continue;
      above = text;
    } else {
      if (!wantBelow || below !== null || !acceptBelow(text)) continue;
      below = text;
    }
    cuts.push([m.index, m.index + m[0].length]);
  }
  if (!cuts.length) return { html: src, above, below };

  // Rebuild once, back to front, so an earlier cut cannot shift a later one.
  let out = src;
  for (let i = cuts.length - 1; i >= 0; i--) out = out.slice(0, cuts[i][0]) + out.slice(cuts[i][1]);
  return { html: out, above, below };
}

module.exports = { liftBracketSpans, bodyIndex, BODY_TAGS };
