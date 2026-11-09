/**
 * The linear readers that replaced slow regexes (#3045 part 4) must also do linear WORK. The regex trace
 * (test/helpers/regex-trace.js) sees which patterns run, not a loop that repeats an `indexOf` from every opener: the
 * checker on part 4 found two such loops (`replaceFencedBlocks` searching for one far `\n` from each `\r`-split opener,
 * `replaceVarRefs` for one far `)` from each `var(--x,`), each quadratic while the trace stayed green. `scanWork`
 * (test/helpers/work-count.js) totals the characters every search covered, so it passes or fails on the code alone
 * (HARD RULE #32). Inputs are the checker's repros and their siblings, at two sizes so a quadratic reader cannot hide in
 * a large constant.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { scanWork } = require('../../helpers/work-count');
const gate = require('../../../lib/layout/gate.js');
const narration = require('../../../lib/core/chart-narration.js');
const relationship = require('../../../lib/core/relationship.js');

const PER_CHAR = 12;
const linear = (name, fn, make) => {
  for (const n of [5000, 20000]) {
    const input = make(n);
    const { scanned } = scanWork(() => fn(input));
    assert.ok(scanned <= PER_CHAR * input.length, `${name} at ${input.length} chars: ${scanned} scanned (${(scanned / input.length).toFixed(1)} per char)`);
  }
};

describe('the part-4 readers search each character a bounded number of times', () => {
  test('layout gate: fences split by \\r or U+2028, unclosed autolinks, glued tags', () => {
    const id = (m) => m;
    linear('replaceFencedBlocks \\r', (s) => gate.replaceFencedBlocks(s, id), (n) => `${'```\r'.repeat(n / 4)}\n`);
    linear('replaceFencedBlocks U+2028', (s) => gate.replaceFencedBlocks(s, id), (n) => `${'~~~\u2028'.repeat(n / 4)}\n`);
    linear('replaceFencedBlocks unclosed', (s) => gate.replaceFencedBlocks(s, id), (n) => '```\n'.repeat(n / 4));
    linear('replaceAutolinks', (s) => gate.replaceAutolinks(s, id), (n) => '<a://'.repeat(n / 5));
    linear('replaceAutolinks email', (s) => gate.replaceAutolinks(s, id), (n) => '<x@y '.repeat(n / 5));
    linear('skeletonTags', (s) => [...gate.skeletonTags(s)], (n) => '<ab!'.repeat(n / 4));
  });

  test('slide camera: unclosed fallbacks and unclosed faces', async () => {
    const camera = await import('../../../lib/core/slide-camera.mjs');
    linear('replaceVarRefs', (s) => camera.replaceVarRefs(s, () => ''), (n) => 'var(--a,'.repeat(n / 8));
    linear('fontFaceRules', (s) => camera.fontFaceRules(s), (n) => '@font-face{'.repeat(n / 11));
    linear('fontFaceRules blank', (s) => camera.fontFaceRules(s), (n) => '@font-face '.repeat(n / 11));
  });

  test('narration and relationship: unclosed links and directives, blank runs', () => {
    linear('stripMdLinks', narration.__stripMdLinksForTest, (n) => '[a]('.repeat(n / 4));
    linear('stripMdLinks brackets', narration.__stripMdLinksForTest, (n) => `${'['.repeat(n - 1)}]`);
    linear('stripMermaidDirectives', narration.__stripMermaidDirectivesForTest, (n) => '%%{'.repeat(n / 3));
    linear('firstClause', relationship.firstClause, (n) => `${' '.repeat(n)}x`);
    linear('closePunctGaps', relationship.closePunctGaps, (n) => `${' '.repeat(n)}x`);
  });

  test('agenda and progress (#3045 part 4, P3): unclosed fences, html blocks, directives, headings', () => {
    const lint = require('../../../lib/authoring/lint-core');
    const { replaceClassDirective } = require('../../../lib/core/agenda-autofill');
    const { firstHeadingInner } = require('../../../lib/forms/tile/progress/progress.transform');
    linear('stripAgendaFences', lint.__stripAgendaFencesForTest, (n) => '```\n'.repeat(n / 4));
    linear('stripAgendaFences \\r', lint.__stripAgendaFencesForTest, (n) => `${'```\r'.repeat(n / 4)}\n`);
    linear('stripAgendaHtmlBlocks', lint.__stripAgendaHtmlBlocksForTest, (n) => '<a\n'.repeat(n / 3));
    linear('replaceClassDirective', (s) => replaceClassDirective(s, (m) => m), (n) => `<!-- _class: "a${' --> '.repeat(n / 5)}`);
    linear('firstHeadingInner', firstHeadingInner, (n) => '<h1>'.repeat(n / 4));
  });

  test('failing arm: an opener loop that searches afresh each time is caught', () => {
    // The shape the checker found: one `indexOf` per opener, to a far terminator they all share.
    const uncached = (s) => { for (let i = s.indexOf('```'); i !== -1; i = s.indexOf('```', i + 1)) s.indexOf('\n', i); return s; };
    assert.throws(() => linear('uncached', uncached, (n) => `${'```\r'.repeat(n / 4)}\n`), /per char/);
  });
});
