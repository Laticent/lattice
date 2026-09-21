/**
 * FRAME IDENTITY — the two encodings of "which Frame carves this slide" must agree.
 *
 * A slide states its Frame twice, and the two statements are produced at different
 * times by different code:
 *   · the `form` CLASS — added by `formToggleClass` at the HTML stage, and the hook
 *     the ~245 chrome rules select on. Present iff the Frame hosts chrome Cells.
 *   · `data-frame="<id>"` — stamped by `stampFormAttrs` at the same stage, naming the
 *     Frame positively (`standard`, or a sovereign Frame's own id).
 *
 * So the invariant is one line: `data-frame` names a SOVEREIGN Frame if and only if the
 * slide does NOT carry `form`. Anything else means a slide claims to compose one way and
 * is painted another.
 *
 * WHY THIS IS A TEST AND NOT A COMMENT. Both encodings are written once, early, from the
 * AUTHORED class — and the auto-split pass rewrites that class much later, in the browser.
 * A `premise` cover page is re-authored into a `content lat-split-cover form` field page,
 * which changed the class and left the attribute saying `premise`. Measured on
 * examples/split-horizontal.md before the fix: 1 of 23 sections disagreed. One page, and
 * invisible — nothing selects on `data-frame` yet, so no pixel moved and every gate in
 * the repo stayed green. That is exactly the defect worth pinning: an attribute whose
 * whole purpose is to be the answer a future stylesheet, export tool or medium asks for,
 * silently wrong on the one slide shape that rewrites itself.
 *
 * The fix re-derives the attribute after the swap (lib/core/split-envelope.js
 * `roleOpenTag`); this asserts the property rather than that line, so a future split
 * strategy that re-authors a class its own way has to keep the invariant too.
 *
 * ASSERTED ON THE REAL EXPORT (HARD RULE #23). The bug only exists after the auto-split
 * pass, which runs in a real browser against laid-out DOM — `lib/engine` alone never
 * produces it. So these render through the emulator, the same artifact the shipped
 * `lattice` CLI writes. The decks are chosen for split pressure, not coverage: every one
 * of them splits, and between them they exercise the native path, the five re-authoring
 * cover strategies, the carousel and the closing page.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runEmulator, ROOT } = require('../../helpers/render');
const plugins = require('../../../lib/integrations/markdown-it/plugins');

/** The sovereign set, DERIVED — never a literal (lib/components/manifest.schema.json). */
const SOVEREIGN = new Set(plugins.SOVEREIGN_FRAMES);

// A `class="..."` that is NOT `data-class="..."`, and a `data-frame` that is not
// `data-split-frame` or similar: both attributes have prefixed siblings on these tags,
// and `\b` alone matches inside them.
const CLASS_ATTR = /(?<![-\w])class="([^"]*)"/;
const FRAME_ATTR = /(?<!-)\bdata-frame="([^"]*)"/;

/** Every top-level slide section in a rendered document, as {frame, classes}. */
function slidesOf(html) {
  const out = [];
  for (const m of html.matchAll(/<section\b[^>]*>/g)) {
    const frame = (m[0].match(FRAME_ATTR) || [])[1];
    if (frame === undefined) continue; // a nested/template section — never stamped
    out.push({
      frame,
      classes: ((m[0].match(CLASS_ATTR) || ['', ''])[1]).trim().split(/\s+/).filter(Boolean),
      tag: m[0],
    });
  }
  return out;
}

// Split-heavy decks: each one splits, and between them they cover the native path,
// the re-authoring cover strategies, the carousel and the closing page.
const DECKS = [
  'examples/split-horizontal.md',
  'examples/split-envelope.md',
  'examples/split-relationship.md',
  'examples/autosplit-coverage.md',
  'examples/read-across-carousel.md',
  'examples/form.md',
];

describe('frame identity — the class and data-frame agree', () => {
  for (const deck of DECKS) {
    const abs = path.join(ROOT, deck);
    if (!fs.existsSync(abs)) continue;

    test(`${deck}: data-frame names a sovereign Frame iff the slide has no \`form\``, () => {
      const pdf = runEmulator(abs);
      const html = fs.readFileSync(pdf.replace(/\.pdf$/, '.html'), 'utf8');
      const slides = slidesOf(html);
      assert.ok(slides.length > 0, `${deck}: no stamped sections — the render or the parse is wrong`);

      const disagree = slides.filter((s) => SOVEREIGN.has(s.frame) === s.classes.includes('form'));
      assert.deepEqual(
        disagree.map((s) => ({ frame: s.frame, classes: s.classes.join(' ') })),
        [],
        `${deck}: ${disagree.length} of ${slides.length} sections state two different Frames`,
      );
    });

    test(`${deck}: every slide carries the medium`, () => {
      const pdf = runEmulator(abs);
      const html = fs.readFileSync(pdf.replace(/\.pdf$/, '.html'), 'utf8');
      const slides = slidesOf(html);
      const missing = slides.filter((s) => !/(?<!-)\sdata-form="2d"/.test(s.tag));
      assert.equal(missing.length, 0, `${deck}: ${missing.length} slide(s) without data-form="2d"`);
    });
  }
});
