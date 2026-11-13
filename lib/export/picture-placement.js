/**
 * lib/export/picture-placement.js — WHERE THE ENGINE PLACES EACH SLIDE'S PICTURE, by source line, for the Export-to-Marp
 * translation of the image plugin (lib/plugins/image/shared/image-marp-export.js).
 *
 * The decision is the placed-picture kernel's (lib/core/placed-picture.mjs), the one every reader asks. This module only puts
 * the deck in front of it the way the engine does: each slide's classes from the engine's own slide boundaries (the slide's
 * `_class`, else the running `class:` comment: lib/core/slide-class-spans.js) plus the deck's `class:`, which the engine
 * appends after dropping a component name (lib/core/deck-class-register.js), so a deck-wide `bleed` places every picture and a
 * deck-wide `image` or `collage` none.
 *
 * WHY IT LIVES HERE AND NOT IN THE PLUGIN. Reading slides needs the boundary parser, and the image plugin's files are reached
 * from the lint core (through the plugin services), which the playground build keeps on its own parser instance
 * (tools/build-playground.js `assertLintParserIsolated`). The export is Node-only, so it reads here and hands the plugin the
 * answer (`opts.placement`).
 */
const { boundaryParser } = require('../core/boundary-parser');
const { slideClassSpans } = require('../core/slide-class-spans');
const { deckClassTokensFromFrontMatter } = require('../core/deck-class-register');
const { placedPictureInSlide, backgroundDirectiveOf, backgroundImagePlaces } = require('../core/placed-picture');
const { topLevelFrontMatterValue } = require('../core/front-matter-key');

/**
 * @param {string} source  the deck, as the export holds it
 * @returns {{ classesOfLine: string[][], placedLines: Map<number, { src: string, title: string|null, lines: number }> }}  per
 *   0-based line (split on `\n`) the classes of its slide, and the first line of each picture the engine places, with what the
 *   export needs to write it
 */
function picturePlacement(source) {
  const src = String(source ?? '');
  // The front matter read as the engine reads it for this (lib/engine/slides.js `deckClassTokensOf`).
  const fm = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  const deckTokens = fm ? deckClassTokensFromFrontMatter(fm[1]) : [];
  const lineStarts = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === '\n') lineStarts.push(i + 1);
  const lineAt = (offset) => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const classesOfLine = [];
  const placedLines = new Map();
  // A background image already on the slide is its photo: the front matter's `backgroundImage:` and a running
  // `<!-- backgroundImage: … -->` carry forward, and a slide's own `<!-- _backgroundImage: … -->` replaces them for that slide
  // (the engine's directive overlay; the kernel reads the slide's own, so only the carried value is passed in).
  let carried = fm ? topLevelFrontMatterValue(fm[1], 'backgroundImage') : null;
  for (const span of slideClassSpans(src).spans) {
    const classes = [...span.slideClass.split(/\s+/).filter(Boolean), ...deckTokens];
    const first = lineAt(span.start);
    for (let l = first; l <= lineAt(Math.max(span.start, span.end - 1)); l++) classesOfLine[l] = classes;
    const text = src.slice(span.start, span.end);
    let spot = null;
    if (text.includes('ackgroundImage')) {
      for (const t of boundaryParser.parse(text, {})) {
        const dir = t.type === 'html_block' ? backgroundDirectiveOf(t.content) : null;
        if (dir?.spot) spot = dir.value;
        else if (dir) carried = dir.value;
      }
    }
    const backgroundImage = spot === null && backgroundImagePlaces(carried);
    const pic = placedPictureInSlide(text, classes, { md: boundaryParser, backgroundImage });
    if (pic && pic.line >= 0) placedLines.set(first + pic.line, { src: pic.src, title: pic.title, lines: pic.lines });
  }
  return { classesOfLine, placedLines };
}

module.exports = { picturePlacement };
