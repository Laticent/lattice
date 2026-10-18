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
 * Readers that must agree with the engine slide by slide. The browser's DOM walk is the only reader that
 * will always need its own adapter (it cannot run markdown-it), so it is held to the engine's answer here.
 */
const ENFORCED = ['dom'];

/**
 * Readers that still measure a span's place with a hand-rolled line walker (lint's `renderedInlineSpans`, the
 * narrator's `bridgeLines`) and so disagree with the engine on the slides counted here. The shared place walker
 * replaces them; each step lowers its number, and the ratchet is exact so a fix cannot leave a stale count
 * behind. A reader leaves this table when its number reaches 0 and joins ENFORCED. Counts are for the default
 * corpus size (30 seeds per chart), so the ratchet is skipped when ORACLE_N says otherwise.
 */
const PENDING = { narrator: 49, lint: 163 };

describe('place oracle: every reader calls the same spans the record', () => {
  const N = Number(process.env.ORACLE_N) || 30;
  const slides = corpus(N);
  const wrong = { narrator: [], lint: [] };
  for (const slide of slides) {
    test(slide.name, () => {
      const fenced = fencedTexts(slide.body);
      const want = READERS.engine(slide).filter((t) => !fenced.has(t));
      for (const name of ENFORCED) {
        const got = READERS[name](slide).filter((t) => !fenced.has(t));
        assert.deepEqual(got, want, `${name} disagrees with the engine on ${slide.name}\n--- slide ---\n${slide.body}`);
      }
      for (const name of Object.keys(PENDING)) {
        const got = READERS[name](slide).filter((t) => !fenced.has(t));
        if (JSON.stringify(got) !== JSON.stringify(want)) wrong[name].push(slide.name);
      }
    });
  }
  for (const name of Object.keys(PENDING)) {
    test(`${name} still disagrees on exactly ${PENDING[name]} slides (the ratchet; lower it as the shared walker lands)`, (t) => {
      if (N !== 30) return t.skip('the ratchet is for the default corpus');
      assert.equal(wrong[name].length, PENDING[name],
        `${name} disagrees on ${wrong[name].length} slides, ratchet says ${PENDING[name]}. First: ${wrong[name].slice(0, 5).join('; ')}`);
    });
  }
});
