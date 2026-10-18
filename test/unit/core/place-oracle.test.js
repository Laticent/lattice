// The PLACE ORACLE. Every reader that decides "is this code span a chart row's record" asks the one
// function `ownsRecordSpan` (lib/core/chart-rows.js), but each measures the span's PLACE (depth, last in
// its row, in the first list, quoted, what came before) from its own input: the engine from markdown-it
// tokens, lint and the narrator from source lines, the browser from the DOM, Compose from a ProseMirror
// doc. Every review round of the chart row record found its defects in that measuring, never in the
// decision (engineering/decisions/2026-10-14-chart-authoring-uniform-model.md, followups.d/2690-p1-…).
//
// This test runs the same generated slides through each reader and compares WHICH spans it called the
// record, as an ordered list of texts (the corpus makes every record value unique). The engine is the
// reference: it is what draws the slide. A reader that disagrees fails the test with the slide source.
//
// A disagreement that is KNOWN and not worth a fix is listed in KNOWN, with its reason. The test also
// fails when a KNOWN entry no longer disagrees, so the list cannot go stale (the same discipline as the
// repo's other sanction lists).
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const { READERS, fencedTexts } = require('./place-readers.js');
const { corpus, matrixCorpus, deckOf } = require('./place-corpus.js');

/**
 * Every other reader must agree with the engine, slide by slide. The browser's DOM walk and Compose (the vitest
 * arm in docs/src/lib/compose/inline-objects.test.ts) are the readers that will always need their own adapter:
 * neither can run markdown-it, so they are held to the engine's answer here. The narrator and lint run the same
 * tracker (chart-places.js) over the bare block parser's tokens, so they agree with the engine WHERE THE ENGINE'S
 * TOKENS ARE THE PARSER'S. They are not the same everywhere: about twenty core rules rewrite the engine's tokens
 * before the pill pass runs (`strip_heading_periods` empties a trailing `.` after a record on a `no-period`
 * slide, so the engine claims a record the bare parser does not). The corpus carries no class modifiers, so it
 * cannot see that class of difference (followups.d/2690-p1-chart-model-phase-2-reader.md, round 16). The test
 * is also what keeps the mapping from a token back to its source line (the narrator's `lastCodeSpan`, lint's
 * pipe counting) honest.
 */
const ENFORCED = ['dom', 'narrator', 'lint'];

describe('place oracle: every reader calls the same spans the record', () => {
  const N = Number(process.env.ORACLE_N) || 30;
  for (const slide of corpus(N)) {
    test(slide.name, () => {
      const fenced = fencedTexts(slide.body);
      const want = READERS.engine(slide).filter((t) => !fenced.has(t));
      for (const name of ENFORCED) {
        const got = READERS[name](slide).filter((t) => !fenced.has(t));
        assert.deepEqual(got, want, `${name} disagrees with the engine on ${slide.name}\n--- slide ---\n${slide.body}`);
      }
    });
  }
  test('the engine claims records on most slides, or the comparison proves nothing', () => {
    const claiming = corpus(N).filter((s) => READERS.engine(s).length > 0).length;
    assert.ok(claiming > N * 5, `only ${claiming} of ${N * 13} slides have a record the engine claims`);
  });
});

// matrix-grid decides a sole `{done}` cell in a pass of its own (the engine's `matrixGridCells`, the browser's
// `applyToDom`), and its three state words are not unique, so it is compared by WHICH cells became state cells,
// in order, rather than by record text. Both passes ask the same decision with the same place counting.
describe('place oracle: matrix-grid cells become state cells in the engine and in the browser alike', () => {
  const { JSDOM } = require('jsdom');
  const MarkdownIt = require('markdown-it');
  const matrixGridCells = require('../../../lib/core/matrix-grid-cells.js');
  const { isOwnedRecordElement } = require('../../../lib/core/resolve-inline-code.js');
  const engine = require('../../../lib/engine');
  const md = new MarkdownIt({ html: true });
  const STATES = /class="cell cell-(?:filled|outlined|empty)"/g; // the cell element, not the stylesheet that names the classes
  const cells = (slide) => {
    const html = engine.render(deckOf(slide), {}).html;
    const body = html.slice(html.indexOf('<section'), html.indexOf('</section>'));
    const engineCells = [...body.matchAll(STATES)].map((m) => m[0]);
    const dom = new JSDOM(`<!DOCTYPE html><html><body><section class="matrix-grid">${md.render(`## A\n\n${slide.body}`)}</section></body></html>`);
    matrixGridCells.applyToDom(dom.window.document, { isRecord: isOwnedRecordElement });
    const domCells = [...dom.window.document.body.innerHTML.matchAll(STATES)].map((m) => m[0]);
    return { engineCells, domCells };
  };
  const slides = matrixCorpus(60);
  let sawState = 0;
  for (const slide of slides) {
    test(slide.name, () => {
      const { engineCells, domCells } = cells(slide);
      sawState += engineCells.length;
      assert.deepEqual(domCells, engineCells, `the browser's state cells differ from the engine's on ${slide.name}\n${slide.body}`);
    });
  }
  test('the corpus makes state cells, or the comparison proves nothing', () => {
    assert.ok(sawState > 60, `only ${sawState} state cells across ${slides.length} slides`);
  });
});

// Lint's `chart-row-record-unread` warns that a record is not read and the row loses its value. It classifies
// WHY with a token loop of its own (not yet on the shared tracker), so this guards its dangerous direction: it
// must never warn about a record the engine claims and draws.
describe('place oracle: lint never calls a record the engine claims "unread"', () => {
  const { lintText } = require('../../../lib/authoring/lint.js');
  let warned = 0;
  for (const slide of corpus(Number(process.env.ORACLE_N) || 30)) {
    test(slide.name, () => {
      const claimed = new Set(READERS.engine(slide));
      for (const f of lintText(deckOf(slide)).filter((x) => x.rule === 'chart-row-record-unread')) {
        warned++;
        const text = /`(\{[^`]*\})`/.exec(f.message)?.[1];
        assert.ok(!claimed.has(text), `lint calls ${text} unread, but the engine claims it on ${slide.name}: ${f.message}\n${slide.body}`);
      }
    });
  }
  test('lint warned about some records, or the guard proves nothing', () => {
    assert.ok(warned > 20, `only ${warned} unread-record warnings across the corpus`);
  });
});
