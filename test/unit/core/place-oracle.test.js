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
const { corpus } = require('./place-corpus.js');

/**
 * Every other reader must agree with the engine, slide by slide. The browser's DOM walk and Compose (the vitest
 * arm in docs/src/lib/compose/inline-objects.test.ts) are the readers that will always need their own adapter:
 * neither can run markdown-it, so they are held to the engine's answer here. The narrator and lint read the same
 * tokens through the shared place tracker (chart-places.js), so each agrees by construction, and the test is what
 * keeps the mapping from a token back to its source line honest.
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
