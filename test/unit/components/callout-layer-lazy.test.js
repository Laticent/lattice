/**
 * Unit: a deck with no callout never needs the heavy half of the callout layer
 * (lib/components/chart/_chart-family/callout-layer.js, callout-place.js). The ESM playground ships
 * that half as its own chunk, loaded only for a deck that has a callout, so a chart that reached it
 * on a callout-free slide would throw in the browser while passing every test in Node, where the
 * `require` always succeeds. This test withholds the half and renders.
 *
 * Design: engineering/decisions/2026-10-20-callout-placement.md § 10.
 */

const { test, describe, before, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const layer = require('../../../lib/components/chart/_chart-family/callout-layer');
const engine = require('../../../lib/engine');

const EXAMPLES = path.join(__dirname, '..', '..', '..', 'examples');
const decks = fs.readdirSync(EXAMPLES).filter((f) => f.endsWith('.md')).map((f) => [f, fs.readFileSync(path.join(EXAMPLES, f), 'utf8')]);
const hasCallout = (md) => /@callout|@legend|callout/.test(md);

describe('the heavy half of the callout layer', () => {
  before(() => engine.render(decks[0][1]));
  afterEach(() => layer.reset());

  test('no deck without a callout reaches it', () => {
    layer.uninstall();
    const plain = decks.filter(([, md]) => !hasCallout(md));
    assert.ok(plain.length > 100, 'the example decks are the census');
    const reached = [];
    for (const [name, md] of plain) {
      try { engine.render(md); } catch (e) { if (e.name === 'ChunkLoadError') reached.push(name); else throw e; }
    }
    assert.deepEqual(reached, []);
  });

  test('a deck with a callout, with the half missing, fails loudly instead of drawing no callouts', () => {
    layer.uninstall();
    const [, md] = decks.find(([f]) => f === 'callouts-bars.md');
    assert.throws(() => engine.render(md), { name: 'ChunkLoadError' });
  });

  test('the host\'s scan names every deck that needs the half, and none in Node, where it is carried', async () => {
    const load = require('../../../lib/components/chart/_chart-family/callout-place-load');
    const { default: PG } = await import('../../../lib/playground/index.js');
    const [, deck] = decks.find(([f]) => f === 'callouts-bars.md');
    assert.equal(PG.calloutsNeeded(deck), false, 'not lazy here, so nothing to load');
    load.lazy = true;
    try {
      layer.uninstall();
      assert.equal(PG.calloutsNeeded('# no callout here\n'), false);
      const missed = [];
      for (const [name, md] of decks) {
        let needed = false;
        try { engine.render(md); } catch (e) { if (e.name !== 'ChunkLoadError') throw e; needed = true; }
        if (needed && !PG.calloutsNeeded(md)) missed.push(name);
      }
      assert.deepEqual(missed, [], 'a deck the scan skips would throw in the browser');
      assert.equal(PG.calloutsNeeded(deck), true);
    } finally {
      load.lazy = false;
    }
  });

  test('install() hands the half over and reset() lets Node load it again', () => {
    layer.uninstall();
    layer.install(require('../../../lib/components/chart/_chart-family/callout-place'));
    const [, md] = decks.find(([f]) => f === 'callouts-bars.md');
    assert.doesNotThrow(() => engine.render(md));
    layer.reset();
    assert.doesNotThrow(() => engine.render(md));
  });
});
