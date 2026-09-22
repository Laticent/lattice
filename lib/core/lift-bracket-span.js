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

/**
 * Where the chart's own body begins.
 *
 * Every charted component renders its data as a list or a table — `<ul>`/`<ol>`
 * for the SVG charts, `<table>` for the grid family — so the first one of those
 * IS the boundary. Read with `indexOf` rather than a regex because this runs on
 * every section on both render paths, and because there is nothing to match:
 * the question is only "where does the body start".
 */
function bodyIndex(html) {
  let at = -1;
  for (const tag of ['<ul', '<ol', '<table']) {
    const i = html.indexOf(tag);
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  return at;
}

/**
 * Lift the author's bracketed spans out of a section's HTML.
 *
 * Both slots are optional and independent: a chart may carry an axis, a label
 * set, both, or neither. The FIRST bracketed list in each slot wins; a second
 * is left in place rather than silently merged, so an author who writes two
 * sees two instead of losing one (`#2272` made a duplicate key a warning for
 * the same reason).
 *
 * @param {string} html  the section's html
 * @returns {{html: string, above: string|null, below: string|null}}
 *   html with the lifted paragraphs removed, and each slot's raw span text —
 *   the CALLER parses, because arity differs by slot (an axis takes three
 *   parts, a label set two).
 */
function liftBracketSpans(html) {
  const src = String(html ?? '');
  const boundary = bodyIndex(src);
  // No body means no chart, so there is no slot to be in and nothing to lift.
  if (boundary < 0) return { html: src, above: null, below: null };

  // The trailing `\s*` takes the newline the paragraph sat on with it, so a
  // lifted span leaves no blank gap behind. Anchored after a literal `</p>`,
  // so there is no ambiguity for it to backtrack through.
  const re = /<p[^>]*>\s*<code[^>]*>([\s\S]*?)<\/code>\s*<\/p>\s*/g;
  let above = null;
  let below = null;
  const cuts = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    const text = plainText(m[1]);
    // The bracket is what makes it a construct; position is what names it.
    if (!parseBracketList(text)) continue;
    const isAbove = m.index < boundary;
    if (isAbove && above === null) above = text;
    else if (!isAbove && below === null) below = text;
    else continue;
    cuts.push([m.index, m.index + m[0].length]);
  }
  if (!cuts.length) return { html: src, above, below };

  // Rebuild once, back to front, so an earlier cut cannot shift a later one.
  let out = src;
  for (let i = cuts.length - 1; i >= 0; i--) out = out.slice(0, cuts[i][0]) + out.slice(cuts[i][1]);
  return { html: out, above, below };
}

module.exports = { liftBracketSpans, bodyIndex };
