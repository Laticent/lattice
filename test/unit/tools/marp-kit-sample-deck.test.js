/**
 * Unit: the copy-and-go kit's sample deck (`kit/Sample-Deck.md`, copied into dist/marp-kit) states two numbers about the kit,
 * and a reader takes both at face value: how many layouts there are, and how much a render loads.
 *
 * Both had gone stale with nothing to catch them. The deck said "Sixty-one" layouts while the catalog had grown to 79, and "5 MB"
 * while a render loaded 9. The deck is hand-written Markdown, so the numbers stay hand-written (the counts policy,
 * 2026-07-02-website-copy-positioning.md §7.3, allows a hand count only where a test holds it to the source of truth; the
 * Studio's welcome deck is held the same way, test/unit/playground/welcome-deck-counts.test.js). This test is that hold.
 *
 * If it fails: update the number in kit/Sample-Deck.md to the one the message gives. Do NOT relax the assertion.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'kit', 'Sample-Deck.md'), 'utf8');

describe('the Marp kit sample deck — stated numbers', () => {
  test('the layout count matches the live component catalog, everywhere the deck states it', () => {
    const live = require('../../../lib/components/index.js').loadAll().length;
    const stat = /^\d+\. (\d+)\n\s+- layouts available$/m.exec(SOURCE);
    const prose = /Picks the layout\. (\d+) to choose from\./.exec(SOURCE);
    assert.ok(stat && prose, 'could not find the two layout counts in kit/Sample-Deck.md — did a slide change shape?');
    assert.equal(Number(stat[1]), live, `the kit's KPI slide says ${stat[1]} layouts; the engine ships ${live}`);
    assert.equal(Number(prose[1]), live, `the kit's second slide says ${prose[1]} layouts; the engine ships ${live}`);
  });

  test('the size is within a megabyte of what the kit ships for rendering', () => {
    // A band, not the nearest MB: rounding flipped on any unrelated 240 KB change to the engine CSS or the runtime, and a check
    // that fires on someone else's PR teaches people to bump the number without looking (inversion lens, 2026-11-10).
    const { buildKit, renderBytes } = require('../../../tools/build-marp-kit.js');
    const mb = renderBytes(buildKit()) / 1e6;
    const stat = /^\d+\. (\d+) MB\n\s+- on disk, minified$/m.exec(SOURCE);
    assert.ok(stat, 'could not find the "<n> MB / on disk, minified" stat in kit/Sample-Deck.md');
    assert.ok(Math.abs(Number(stat[1]) - mb) < 1, `the kit's KPI slide says ${stat[1]} MB; the kit ships ${mb.toFixed(2)} MB for rendering (tools/build-marp-kit.js renderBytes)`);
  });

  test('the readable runtime carries no inline source map (most of its weight, and no use to a reader)', () => {
    const { buildKit, withoutInlineSourceMap } = require('../../../tools/build-marp-kit.js');
    const js = String(buildKit().get('lattice-runtime.js'));
    assert.ok(!js.includes('sourceMappingURL=data:'));
    assert.ok(js.length > 100000, 'the readable runtime is still there');
    assert.equal(withoutInlineSourceMap('a\n//# sourceMappingURL=data:x\n'), 'a\n');
    assert.equal(withoutInlineSourceMap('a\nb\n'), 'a\nb\n', 'text without a map is left as it was');
  });
});
