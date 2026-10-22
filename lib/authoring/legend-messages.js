/**
 * legend-messages.js — the words for the legend reader's diagnostics.
 *
 * lib/core/legend.js reports a code and the facts it names, and never prose: that module ships in
 * the preview runtime, which renders a legend and reports nothing, so sentences there would be bytes
 * on every page for no reader (docs/route-budget.json). The linter is the reader, so the sentences
 * live beside it. One function per code; an unknown code falls back to the code itself.
 */

const LAYOUTS = '`key`, `anchored`, `along-path`';

const WORDS = {
  'legend/entry': (a) => a.reason,
  'legend/ambiguous-pair': (a) => `\`${a.src}\` reads as the label "${a.a}" with the style word \`${a.b}\`. To name ${a.a} "${a.b}", quote it: \`{${a.a}, "${a.b}"}\`.`,
  'legend/syntax': (a) => `\`${a.text}\` is not a callout or a legend: write \`@callout{{Label, row=…, col=…}}\` or \`@legend{[{A, c1}, {B, c2}], key}\`.`,
  'callout/layout': (a) => `\`${a.word}\` is not a callout layout: a callout is always anchored to the mark it names, so the word is ignored.`,
  'legend/layout': (a) => `\`${a.word}\` is not a legend layout: use ${LAYOUTS}.`,
  'legend/side': (a) => `\`${a.word}\` is not a callout side: use \`under\` or \`beside\`.`,
  'legend/side-kind': (a) => `\`${a.word}\` sets where callout notes sit, and only a \`@callout{…}\` span reads it: it is ignored here.`,
  'legend/side-twice': (a) => `A callout span names two sides, \`${a.first}\` and \`${a.word}\`: the first, \`${a.first}\`, is the one used.`,
  'legend/item': (a) => `\`${a.item}\` is not a legend entry: write each entry in braces, \`{Label, c2}\`.`,
  'legend/empty': () => 'The legend has no entries it can draw.',
  'legend/no-target': (a) => `"${a.text}" is a callout with nothing to point at: add \`row=\` and \`col=\` naming its cell.`,
  'legend/half-target': (a) => `"${a.text}" names only its ${a.has === 'row' ? 'row' : 'column'}: add \`${a.has === 'row' ? 'col' : 'row'}=\` too, so it names one cell.`,
  'legend/two-targets': (a) => (a.drawn === 'for'
    ? `"${a.text}" names its cell with \`for=\` and with half a \`row=\`/\`col=\` pair: keep one. \`for=\` is the one drawn.`
    : `"${a.text}" names its cell twice, with \`row=\`/\`col=\` and with \`for=\`: keep one. The \`row=\`/\`col=\` pair is the one drawn.`),
};

/** A reader diagnostic as the sentence the linter shows. */
function legendMessage(d) {
  const say = WORDS[d?.code];
  return say ? say(d.args || {}) : String(d?.code || 'legend');
}

module.exports = { legendMessage };
