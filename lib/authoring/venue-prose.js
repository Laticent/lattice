/**
 * venue-prose — how many words a prose component's primary slot carries, read from a slide's
 * markdown. Pure and fs-free (lint-core runs in the browser too).
 *
 * A component that is ONE block of prose (a big-number's caption, a redline's clause, an image's
 * paragraph) has no element count to budget, so its manifest states a WORD budget per venue
 * (`venueCapacity.prose`, measured on the real slide by growing that slot until the page clips).
 * lint-core's `venue-prose` rule compares this count with that row. Each reader below mirrors the
 * slot the manifest names, in the markdown an author writes; one that cannot find its slot returns
 * null, and the rule then says nothing rather than guess.
 */

const stripInline = (s) => String(s)
  .replace(/<[^>]+>/g, ' ')           // <del>, <ins>, <br>
  .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // an image has no words
  .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // a link keeps its label
  .replace(/[*_`~]/g, '');
const wordCount = (s) => (stripInline(s).match(/\S+/g) || []).length;

/** The first run of `> …` lines. */
function firstBlockquote(slide) {
  const lines = String(slide).split('\n');
  const start = lines.findIndex((l) => /^\s*>/.test(l));
  if (start < 0) return null;
  const run = [];
  for (let i = start; i < lines.length && /^\s*>/.test(lines[i]); i++) run.push(lines[i].replace(/^\s*>\s?/, ''));
  return run.join(' ');
}

/** The first plain paragraph below the heading: not a directive, code span, image, list or quote. */
function firstParagraph(slide) {
  const lines = String(slide).split('\n');
  let seenHeading = false;
  for (const raw of lines) {
    const l = raw.trim();
    if (/^#{1,6}\s/.test(l)) { seenHeading = true; continue; }
    if (!seenHeading || !l) continue;
    if (/^(<!--|`|!\[|[-*+]\s|\d+\.\s|>|\||<)/.test(l)) continue;
    return l;
  }
  return null;
}

/** Every word of the card's body: the quotation, the gloss and the action. The heading, the directive
 * and the one-code-span citation line are chrome, not prose. */
function wholeBody(slide) {
  const keep = [];
  let seenHeading = false;
  for (const raw of String(slide).split('\n')) {
    const l = raw.trim();
    if (!l || l.startsWith('<!--')) continue;
    if (/^#{1,6}\s/.test(l)) { seenHeading = true; continue; }
    if (/^`[^`]+`$/.test(l)) continue;
    if (!seenHeading) continue;
    keep.push(l.replace(/^(>\s*|[-*+]\s+|\d+\.\s+)+/, ''));
  }
  return keep.length ? keep.join(' ') : null;
}

/** The text of the first nested list line (a big-number's caption). */
function firstNestedBullet(slide) {
  const m = String(slide).match(/^[ \t]{2,}[-*+]\s+(.+)$/m);
  return m ? m[1] : null;
}

const SLOT = {
  'big-number': firstNestedBullet,
  redline: firstBlockquote,
  'citation-card': wholeBody,
  image: firstParagraph,
  collage: firstParagraph,
};

/** Words in `comp`'s primary prose slot on this slide, or null when it has none the rule reads. */
function proseWords(comp, slide) {
  const read = SLOT[comp];
  if (!read) return null;
  const text = read(slide);
  return text == null ? null : wordCount(text);
}

module.exports = { proseWords, wordCount };
