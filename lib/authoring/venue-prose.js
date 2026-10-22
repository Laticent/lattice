/**
 * venue-prose — the words in a prose component's primary slot, read from a slide's markdown. Pure
 * and fs-free: lint-core runs in the browser too, so this stays small (the Studio's lint bundle has
 * a byte ceiling).
 *
 * A one-block component (a big-number's caption, a redline's clause, an image's paragraph) has no
 * element count, so its manifest states a WORD budget per venue (`venueCapacity.prose`). lint's
 * `venue-prose` rule compares this count with that row. A reader that finds no slot returns null,
 * and the rule says nothing rather than guess.
 */

const words = (s) => (s.replace(/<[^>]+>|!\[[^\]]*\]\([^)]*\)|[*_`~]/g, ' ').match(/\S+/g) || []).length;
const quote = (s) => (s.match(/^[ \t]*>.*(?:\n[ \t]*>.*)*/m) || [''])[0].replace(/^[ \t]*>[ \t]?/gm, '');
// Below the first heading, a line that is not a directive, code span, image, list item, quote or table.
const afterHeading = (s) => s.replace(/^[\s\S]*?^#{1,6}[ \t].*$/m, '');
const paragraph = (s) => (afterHeading(s).match(/^(?![ \t]*(?:<|`|!\[|[-*+][ \t]|\d+\.[ \t]|>|\|))\S.*$/m) || [''])[0];
// The citation card's body: quotation, gloss and action, less its one-code-span citation line.
const body = (s) => afterHeading(s).replace(/^(?:<!--.*|`[^`]+`)$/gm, '').replace(/^[ \t]*(?:>|[-*+]|\d+\.)[ \t]*/gm, '');
const nested = (s) => s.match(/^[ \t]{2,}[-*+][ \t]+(.+)$/m)?.[1];

const SLOT = { 'big-number': nested, redline: quote, 'citation-card': body, image: paragraph, collage: paragraph };

/** Words in `comp`'s primary prose slot on this slide, or null when it has none the rule reads. */
function proseWords(comp, slide) {
  const text = SLOT[comp]?.(String(slide));
  return text ? words(text) : null;
}

module.exports = { proseWords };
