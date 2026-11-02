// The browser stub the bundles swap in for the host's KaTeX wall (lib/engine/katex-browser-stub.js). The host requires
// its walls lazily (lib/plugins/host.js), so in a bundle the stub can start AFTER lattice-katex.js has loaded: #2997
// shipped exactly that order, and every Studio equation rendered as its source. Both orders must typeset.
const test = require('node:test');
const assert = require('node:assert/strict');

const STUB = require.resolve('../../../lib/engine/katex-browser-stub.js');
const fake = { renderToString: (src) => `<span class="katex">${src}</span>` };

function freshStub(win) {
  delete require.cache[STUB];
  globalThis.window = win;
  try {
    return require(STUB);
  } finally {
    delete globalThis.window;
  }
}

test('a stub that starts after the provider loaded adopts window.__latticeKatex', () => {
  const stub = freshStub({ __latticeKatex: fake });
  assert.equal(stub.renderToString('x^2', {}), '<span class="katex">x^2</span>');
});

test('a stub that starts before the provider is handed KaTeX by __latticeRegisterKatex', () => {
  const win = {};
  const stub = freshStub(win);
  assert.throws(() => stub.renderToString('x', {}), /KaTeX not loaded yet/);
  win.__latticeRegisterKatex(fake);
  assert.equal(stub.renderToString('y', {}), '<span class="katex">y</span>');
});

test('the arm: with no provider at all the stub still throws, so math.render.js shows the source', () => {
  const stub = freshStub({});
  assert.throws(() => stub.renderToString('z', {}), /KaTeX not loaded yet/);
});
