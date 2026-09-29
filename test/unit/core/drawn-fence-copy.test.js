
/**
 * lib/core/remote-ref.js carries a COPY of the plugin registry's runtime-drawn fence names
 * (`DRAWN_ALT`, behind `isDrawnFenceClass`), because it is a dependency-free CommonJS leaf and the registry's data is an ES
 * module. Its HARD RULE #22 scans (a diagram's remote refs, a code package's diagram classes in
 * lib/core/door-attr.mjs) find a runtime-drawn block by those names, so a copy that fell behind
 * would let a new runtime-drawn plugin's fences through unscanned. This fails the day they differ.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isDrawnFenceClass } = require('../../../lib/core/remote-ref.js');
const { RUNTIME_DRAWN_FENCES } = require('../../../lib/plugins/drawn.generated.mjs');

test('remote-ref.js recognizes every fence in the registry\'s RUNTIME_DRAWN_FENCES', () => {
  assert.ok(RUNTIME_DRAWN_FENCES.length > 0, 'the registry names no runtime-drawn fence — this test would check nothing');
  for (const f of RUNTIME_DRAWN_FENCES) {
    assert.equal(isDrawnFenceClass(`language-${f}`), true, `remote-ref.js DRAWN_ALT is missing the "${f}" fence`);
  }
});

test('isDrawnFenceClass reads the code class by substring and the bare word, and nothing longer', () => {
  for (const f of RUNTIME_DRAWN_FENCES) {
    assert.equal(isDrawnFenceClass(`hljs language-${f}`), true);
    assert.equal(isDrawnFenceClass(`language-${f}-source`), true, 'the runtime still draws a defanged fence');
    assert.equal(isDrawnFenceClass(f), true);
    assert.equal(isDrawnFenceClass(`a ${f} b`), true);
    assert.equal(isDrawnFenceClass(`${f}x`), false);
  }
  assert.equal(isDrawnFenceClass('language-js'), false);
  assert.equal(isDrawnFenceClass(''), false);
});
