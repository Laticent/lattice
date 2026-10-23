/**
 * venue-prose-fill — write N words into a one-block prose component's primary slot.
 *
 * The inverse of `lib/authoring/venue-prose.js`, which COUNTS the words in that slot: that reader
 * and this writer name the same five slots, so a slide filled to N words reads back as N. Shared by
 * `tools/calibrate-venue-prose.js` (finds how many words a slot holds on a canvas) and
 * `tools/check-venue-conformance.js` (renders a slide AT the measured budget and checks it fits).
 */
const { words } = require('./calibrate-core');
const { proseWords } = require('../../lib/authoring/venue-prose');

const QUOTE = /^[ \t]*>.*(?:\n[ \t]*>.*)*/m;
const NESTED = /^([ \t]{2,}[-*+][ \t]+)(.+)$/m;
// A prose line: not a directive, code span, image, list item, quote, table, heading or tag.
const PLAIN = /^(?![ \t]*(?:<|`|!\[|[-*+][ \t]|\d+\.[ \t]|>|\||#))\S.*$/m;

/** The slide markdown with `comp`'s primary slot holding `n` words, or null for a component with no slot reader. */
function fillSlot(comp, md, n) {
  const src = String(md);
  switch (comp) {
    case 'big-number':
      return NESTED.test(src) ? src.replace(NESTED, (_, lead) => lead + words(n)) : null;
    case 'redline':
      return QUOTE.test(src) ? src.replace(QUOTE, `> ${words(n)}`) : null;
    case 'citation-card': {
      // The budget spans the quotation, the gloss and the action; the quotation takes what the other two leave.
      if (!QUOTE.test(src)) return null;
      const rest = proseWords(comp, src.replace(QUOTE, '> x')) - 1;
      // Below that, the gloss and action go too, so a small N is N words and not the probe's full card.
      if (n <= rest) return src.replace(QUOTE, `> ${words(n)}`).replace(/^[ \t]*[-*+][ \t].*(?:\n[ \t]+[-*+][ \t].*)*$/gm, '');
      return src.replace(QUOTE, `> ${words(n - rest)}`);
    }
    case 'image':
    case 'collage': {
      // The first prose line below the first heading, as the reader finds it.
      const h = src.match(/^#{1,6}[ \t].*$/m);
      const from = h ? h.index + h[0].length : 0;
      const tail = src.slice(from);
      const line = tail.match(PLAIN);
      return line ? src.slice(0, from) + tail.replace(PLAIN, words(n)) : null;
    }
    default:
      return null;
  }
}

module.exports = { fillSlot };
