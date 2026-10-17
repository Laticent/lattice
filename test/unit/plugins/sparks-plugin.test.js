/**
 * The sparks plugin (lib/plugins/sparks/): the kernel's own frame, look and corner words are the
 * words its manifest declares for the `spark:` register, so a word a spark accepts is always a word
 * the deck and the slide accept too. The kernel keeps a copy because it is bundled without the
 * manifest; this test is what stops the two from drifting.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

const manifest = require('../../../lib/plugins/sparks/sparks.manifest.json');
const sparks = require('../../../lib/plugins/sparks/sparks.inline.js');
const { AXIS_REGISTERS } = require('../../../lib/core/axis-registers.js');

test('the kernel\'s axis words are the manifest\'s, default first', () => {
  const axes = manifest.contributes.registers.spark.axes;
  assert.deepEqual([...sparks.SPARK_FRAME_NAMES], axes.frame);
  assert.deepEqual([...sparks.SPARK_LOOK_NAMES], axes.look);
  assert.deepEqual([...sparks.SPARK_CORNER_NAMES], axes.corners);
});

test('the `spark:` register the host builds is the sparks plugin\'s', () => {
  const r = AXIS_REGISTERS.find((x) => x.key === 'spark');
  assert.equal(r.plugin, 'sparks');
  assert.deepEqual(r.AXES.map((a) => a.axis), ['frame', 'look', 'corners']);
});

test('the inline kind is `spark`, behind `~`', () => {
  assert.deepEqual(Object.keys(manifest.contributes.inline), ['spark']);
  assert.equal(manifest.contributes.inline.spark.sigil, '~');
  assert.equal(typeof sparks.inline.spark.resolve, 'function');
});
