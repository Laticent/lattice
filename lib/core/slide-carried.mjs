/**
 * lib/core/slide-carried.mjs — WHAT A SLIDE INHERITS FROM THE SLIDES BEFORE IT, for the readers that ask whether a picture is
 * its placed photo (lib/core/placed-picture.mjs). The kernel decides from one slide's text and classes; two things that change
 * its answer are not in that text:
 *
 *   carriedClass     the last running `<!-- class: … -->` on this slide or an earlier one (no underscore: it carries forward),
 *                    which a slide with no `_class` of its own takes
 *   backgroundImage  whether a background image already places the slide's photo: the front matter's `backgroundImage:` and a
 *                    running `<!-- backgroundImage: … -->` carry forward, and the slide's own `<!-- _backgroundImage: … -->`
 *                    replaces them for that slide (the engine's directive overlay, lib/engine/slides.js). Only the CARRIED
 *                    value counts here; the kernel reads the slide's own directive from its text.
 *
 * The caller cuts the deck into slides on the engine's boundaries and hands their texts in order: Export-to-Marp from
 * lib/core/slide-class-spans.js (lib/export/picture-placement.js), the Studio from its deck index's units
 * (docs/src/lib/slide-carried.ts). Directives are read where the engine reads them, top-level comment blocks, in either
 * spelling (a comment or the meta record, lib/core/comment-directive.mjs). Pure ESM, so the Studio imports it as is.
 * test/fixtures/placed-picture-cases.json holds every reader to the engine.
 */

import { readDirectiveComment } from './comment-directive.mjs';
import frontMatterKey from './front-matter-key.js';
import { backgroundImagePlaces } from './placed-picture.mjs';

const KNOWN = { known: new Set(['class', 'backgroundImage']), flags: new Set() };

/**
 * @param {string} frontMatter  the front-matter body (or block); '' for none
 * @param {ReadonlyArray<string>} slides  each slide's text, in order
 * @param {{ parse(text: string, env: object): Array<{ type: string, content: string }> }} md  the caller's boundary parser
 *   (lib/core/boundary-parser.mjs), as for the placed-picture kernel: the playground keeps the lint's parser apart, so this
 *   module imports none
 * @returns {{ carriedClass: string[] | null, backgroundImage: boolean }[]}  one per slide
 */
export function slidesCarried(frontMatter, slides, md) {
  let carriedClass = null;
  let background = frontMatterKey.topLevelFrontMatterValue(String(frontMatter ?? ''), 'backgroundImage');
  return slides.map((text) => {
    let spot = null;
    const body = String(text ?? '');
    if (body.includes('<!--')) {
      for (const t of md.parse(body, {})) {
        if (t.type !== 'html_block') continue;
        const dir = readDirectiveComment(t.content, KNOWN);
        if (!dir) continue;
        if (dir.key === 'backgroundImage') {
          if (dir.spot) spot = dir.value;
          else background = dir.value;
        } else if (!dir.spot) {
          carriedClass = dir.value.split(/\s+/).filter(Boolean);
        }
      }
    }
    return { carriedClass, backgroundImage: spot === null && backgroundImagePlaces(background) };
  });
}
