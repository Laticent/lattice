const { test } = require('node:test');
const assert = require('node:assert/strict');
const { toBase64, fromBase64 } = require('../../../lib/core/base64-utf8');

const SAMPLES = ['x²', 'R&D — “quoted” ≤ 3', '日本語', '🙂 emoji', 'plain ascii'];

test('round-trips non-ASCII text on the Node path', () => {
  for (const s of SAMPLES) assert.equal(fromBase64(toBase64(s)), s);
});

// The browser path is the one that shipped `XÂ²`: the runtime and the emulator's page
// script run where Buffer does not exist. Hide Buffer and take that path explicitly.
test('round-trips non-ASCII text on the browser path', () => {
  const saved = globalThis.Buffer;
  const nodeEncoded = SAMPLES.map(toBase64);
  try {
    globalThis.Buffer = undefined;
    SAMPLES.forEach((s, i) => {
      assert.equal(toBase64(s), nodeEncoded[i], 'both paths encode the same bytes');
      assert.equal(fromBase64(nodeEncoded[i]), s);
    });
  } finally {
    globalThis.Buffer = saved;
  }
});

test('a bare atob is the defect this pair exists to prevent', () => {
  assert.equal(atob(toBase64('x²')), 'xÂ²');
});

test('the injected source decodes UTF-8 without Buffer', () => {
  const saved = globalThis.Buffer;
  try {
    globalThis.Buffer = undefined;
    const injected = new Function(`return (${fromBase64.toString()})`)();
    assert.equal(injected(toBase64.call(null, 'x²')), 'x²');
  } finally {
    globalThis.Buffer = saved;
  }
});
