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
  'legend/syntax': (a) => `\`${a.text}\` is not a legend: write \`@legend{{Label, row=…, col=…}}\` or \`@legend{[{A, c1}, {B, c2}], key}\`.`,
  'legend/layout': (a) => `\`${a.word}\` is not a legend layout: use ${LAYOUTS}.`,
  'legend/item': (a) => `\`${a.item}\` is not a legend entry: write each entry in braces, \`{Label, c2}\`.`,
  'legend/empty': () => 'The legend has no entries it can draw.',
  'legend/no-target': (a) => `"${a.text}" is an anchored label with nothing to anchor to: add \`row=\` and \`col=\` naming its cell.`,
  'legend/half-target': (a) => `"${a.text}" names only its ${a.has === 'row' ? 'row' : 'column'}: add \`${a.has === 'row' ? 'col' : 'row'}=\` too, so it names one cell.`,
  'legend/two-targets': (a) => `"${a.text}" names its cell twice, with \`row=\`/\`col=\` and with \`for=\`: keep one. The \`row=\`/\`col=\` pair is the one drawn.`,
};

/** A reader diagnostic as the sentence the linter shows. */
function legendMessage(d) {
  const say = WORDS[d?.code];
  return say ? say(d.args || {}) : String(d?.code || 'legend');
}

module.exports = { legendMessage };
