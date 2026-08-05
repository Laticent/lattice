/**
 * Unit: the SOURCE-side slide reconstruction agrees with the REAL render.
 *
 * `slideClassSpans` (lib/core/slide-class-spans.js) answers "which slide is this
 * byte on, and what class does that slide carry?" without rendering — the PDF
 * path needs it to bake a Mermaid diagram in its slide's band, and it needs the
 * answer before markdown-it has produced a single `<section>`.
 *
 * Any second answer to a question the renderer already answers will drift; the
 * only question is whether the drift is CAUGHT or shipped. It has been shipped
 * three times, each the same shape — a reconstruction that agreed with the engine
 * on the cases its author thought of:
 *
 *   1. A `$$…$$` display equation whose body contains a lone `=` line. To a
 *      parser without the `math_block` rule that is a SETEXT H1, and in a
 *      `split: headings` deck a heading is a slide boundary — so the source side
 *      saw a slide the engine does not have, and every byte after the equation
 *      was attributed to it. Live in the corpus at
 *      `lib/components/math/math/math.gallery.md`.
 *   2. The GLOBAL `<!-- class: X -->` directive, which carries forward from its
 *      slide to the end of the deck. Only the spot `<!-- _class: X -->` form was
 *      read, so a deck that switches to a dark canvas mid-way rendered dark
 *      sections with light-baked diagram ink.
 *   3. A directive QUOTED as prose — `` `<!-- _class: kpi -->` `` inside inline
 *      code, or inside a fenced block. A raw text scan cannot tell that from a
 *      real directive, and the last one on a slide wins, so a deck documenting
 *      its own syntax overrode its own layout. Live at `kit/Sample-Deck.md`.
 *
 * None of the three is reachable by a test that only exercises the cases someone
 * thought to write down. So this file does not test cases: it renders the WHOLE
 * committed corpus through the real engine and asserts the reconstruction matches
 * what came out. That is the gate the three defects would each have failed.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const latticeEngine = require('../../../lib/engine');
const { boundaryParser, FRONT_MATTER } = require('../../../lib/core/boundary-parser');
const { readDirectiveComment } = require('../../../lib/core/comment-directive');
const { resolveDiagramBand } = require('../../../lib/core/diagram-band');
const { slideClassSpans } = require('../../../lib/core/slide-class-spans');

const REPO = path.join(__dirname, '..', '..', '..');
const engine = latticeEngine.createEngine();

/**
 * Every COMMITTED Markdown file — asked of git, not of the filesystem.
 *
 * A directory walk finds build output too, and it did: 45 generated decks under
 * `docs/public/playground/v/<hash>/exemplars/**` (gitignored, staged at docs-build
 * time) were being rendered by this gate. That makes the corpus size depend on
 * whether the docs were built, so the number in a report is not reproducible, and
 * it points a failure at a path that does not exist in git. `git ls-files` is the
 * definition the word "committed" already carries.
 */
function corpus() {
  return execFileSync('git', ['ls-files', '-z', '--', '*.md'], { cwd: REPO, encoding: 'utf8' })
    .split('\0').filter(Boolean).map((rel) => path.join(REPO, rel))
    .filter((p) => fs.existsSync(p)); // a deleted-but-staged path is not a deck
}

/**
 * Each rendered section's class tokens, in document order.
 *
 * Memoized per deck: three tests need the same render, and rendering the corpus
 * three times costs three times as much for one answer.
 */
const RENDERED = new Map();
function sectionClasses(file, src) {
  if (!RENDERED.has(file)) {
    let classes = null;
    try {
      classes = [...engine.render(src).html.matchAll(/<section\b[^>]*\bclass="([^"]*)"/g)]
        .map((m) => m[1].split(/\s+/).filter(Boolean));
    } catch {
      classes = null; // a file that does not render is not this gate's business
    }
    RENDERED.set(file, classes);
  }
  return RENDERED.get(file);
}

const DECKS = corpus()
  .map((file) => ({ file, src: fs.readFileSync(file, 'utf8') }))
  .filter(({ src }) => /^---\r?\n[\s\S]*?\r?\n---/.test(src));

/**
 * `_focusSteps` EXPANDS one authored slide into several at render time, so a focus
 * deck legitimately renders more sections than the source has slides. That is the
 * one sanctioned divergence, and it is safe for the band question because every
 * expanded copy carries the class of the slide it was copied from
 * (`focusSteps` in lib/integrations/markdown-it/plugins.js clones the whole token
 * group, `_class` comment included).
 *
 * Detected off the TOKEN STREAM, not a text scan. A text scan is the technique this
 * whole gate exists to eliminate, and it misfires here for the same reason it
 * misfires there: a decision record that DISCUSSES `_focusSteps` in prose would be
 * silently excused from the slide-count check.
 */
const FOCUS_STEPS = { known: new Set(['focusSteps']), flags: new Set() };
function expandsAtRender(src) {
  const body = src.replace(FRONT_MATTER, '');
  return boundaryParser.parse(body, {}).some(
    (t) => t.type === 'html_block' && readDirectiveComment(t.content, FOCUS_STEPS),
  );
}

describe('slideClassSpans ≡ the engine, over the committed corpus', () => {
  test('the corpus is actually there (a walk that finds nothing proves nothing)', () => {
    assert.ok(DECKS.length > 300, `expected the committed corpus, found ${DECKS.length} files`);
  });

  test('every deck reconstructs the same NUMBER of slides the engine renders', () => {
    const wrong = [];
    for (const { file, src } of DECKS) {
      if (expandsAtRender(src)) continue;
      const classes = sectionClasses(file, src);
      if (!classes) continue;
      const rendered = classes.length;
      const reconstructed = slideClassSpans(src).spans.length;
      if (rendered !== reconstructed) {
        wrong.push(`${path.relative(REPO, file)}: engine ${rendered}, spans ${reconstructed}`);
      }
    }
    assert.deepEqual(wrong, [],
      'a slide-count divergence offsets the MAPPING: every diagram after the extra or '
      + 'missing boundary resolves its band from a different slide than it renders on');
  });

  test("every slide's reconstructed class is really on the section that renders", () => {
    // CONTAINMENT, not equality: the section also carries what the source cannot
    // know — the deck-wide tokens `deckClassPropagate` appends, `defaultComponent`'s
    // fallback layout, the form/finish/mode tokens. What must hold is that nothing
    // the source claims is absent from the render.
    const wrong = [];
    let slides = 0;
    for (const { file, src } of DECKS) {
      const classes = sectionClasses(file, src);
      if (!classes) continue;
      const { spans } = slideClassSpans(src);
      if (classes.length !== spans.length) continue; // counted by the test above
      spans.forEach((span, i) => {
        slides++;
        const have = new Set(classes[i]);
        const missing = span.slideClass.split(/\s+/).filter(Boolean).filter((t) => !have.has(t));
        if (missing.length) {
          wrong.push(`${path.relative(REPO, file)} slide ${i}: `
            + `source says ${JSON.stringify(span.slideClass)}, section is `
            + `${JSON.stringify(classes[i].join(' '))} (missing ${missing.join(', ')})`);
        }
      });
    }
    assert.ok(slides > 3000, `expected thousands of slides of coverage, checked ${slides}`);
    assert.deepEqual(wrong, [],
      'the source-side class is what decides a Mermaid diagram\'s baked palette; a token '
      + 'the section does not actually carry is ink that disagrees with its own chip');
  });

  test('every slide resolves the SAME BAND from the source as from the render', () => {
    // Containment above is one-directional: it catches a token the source INVENTS,
    // and an empty source answer passes it trivially. This is the other direction,
    // and it is the one the bug is actually denominated in — a band is the currency
    // both halves trade in, so `light` where the section says `dark` fails here no
    // matter which half went wrong.
    //
    // The section side needs no deck context of its own: `deckClassPropagate` has
    // already merged the deck-wide color token onto every section that did not pin
    // its own, which is precisely the resolution rule `resolveDiagramBand` applies.
    const wrong = [];
    for (const { file, src } of DECKS) {
      const classes = sectionClasses(file, src);
      if (!classes) continue;
      const { spans } = slideClassSpans(src);
      if (classes.length !== spans.length) continue; // counted by the first test
      const frontMatter = /^---\r?\n[\s\S]*?\r?\n---/.exec(src)?.[0] ?? '';
      spans.forEach((span, i) => {
        const fromSource = resolveDiagramBand({ frontMatter, slideClass: span.slideClass });
        const fromRender = resolveDiagramBand({ frontMatter, slideClass: classes[i].join(' ') });
        if (fromSource !== fromRender) {
          wrong.push(`${path.relative(REPO, file)} slide ${i}: source bakes ${fromSource}, `
            + `section renders ${fromRender} (source class ${JSON.stringify(span.slideClass)}, `
            + `section class ${JSON.stringify(classes[i].join(' '))})`);
        }
      });
    }
    assert.deepEqual(wrong, [],
      'a Mermaid SVG bakes its palette to literal hex; the CSS chip beneath it stays live '
      + 'and per-section. When these two bands disagree, that is the whole of #1326');
  });
});
