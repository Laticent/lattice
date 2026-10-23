/**
 * The resolver's DRAW arm (lib/plugins/resolve.js `checkDraw`): a plugin whose figures a page may draw in a sandboxed draw frame declares `draw`,
 * and its files agree with it. Each rule is proven on the smallest synthetic plugin that must fail one way, so a mismatch is a build error
 * naming the plugin rather than a figure that quietly cannot draw. (The registry build that reads these files, and the frame itself,
 * are proven in real Chromium by test/integration/export/draw-frame*.test.js.)
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { resolvePlugins } = require('../../../lib/plugins/resolve');

const PAYLOAD = { lib: { from: 'npm:lib/dist/lib.js', global: 'libGlobal', when: 'used', vendored: { file: 'vendor/lib.js', version: '1.0.0', sha256: 'a'.repeat(64) } } };

/** A drawing plugin; `draw` / `exec` / `top` / `exports` override the manifest and what its modules are read to export. */
function drawPlugin(name, { draw = { frame: { library: 'inline' } }, exec = 'browser', top = {}, exports = {} } = {}) {
  const pass = exec === 'pass';
  return {
    folder: name,
    manifest: {
      type: 'plugin', format: 1, name, api: 1, title: name, description: name,
      contributes: { fences: { [`${name}fence`]: pass ? { body: 'mermaid', as: 'code' } : { body: 'json' } }, hydrate: {}, ...(pass ? { bake: true } : {}) },
      payload: PAYLOAD,
      render: { exec: { hydrate: exec, ...(pass ? { bake: 'subprocess' } : {}) } },
      ...(draw ? { draw } : {}),
      ...top,
    },
    exports: {
      fences: pass ? [] : [`${name}fence`],
      hasHydrate: !pass, hasPass: pass, hasBake: pass,
      vendored: { 'vendor/lib.js': 'a'.repeat(64) },
      hasDrawFrame: true, drawFrameSource: 'function draw(m, env) { return "x"; }', drawFrameModuleScope: '',
      ...exports,
    },
  };
}
const errorsOf = (plugins) => resolvePlugins(plugins, {}).errors;
const expectError = (plugins, pattern) => {
  const errors = errorsOf(plugins);
  assert.ok(errors.some((e) => pattern.test(e)), `expected an error matching ${pattern}; got:\n${errors.join('\n') || '(none)'}`);
};
const withShim = (draw) => ({ ...draw, shim: true });

describe('resolvePlugins: draw', () => {
  test('a browser-hydrate plugin with a frame function resolves, and so does a pass plugin with host and shim', () => {
    assert.deepEqual(errorsOf([drawPlugin('a')]), []);
    assert.deepEqual(
      errorsOf([drawPlugin('b', { exec: 'pass', draw: { frame: { library: 'esm', preload: ['flowDiagram'] }, host: true, shim: true }, top: { vendor: { esm: { from: 'npm:l/e.mjs', file: 'vendor/esm/e.mjs', version: '1.0.0', sha256: 'b'.repeat(64) }, 'esm-chunks': { from: 'npm:l/c/*.mjs', file: 'vendor/esm/c/', version: '1.0.0', sha256: 'c'.repeat(64) } } }, exports: { hasDrawHost: true, hasDrawShim: true, vendored: { 'vendor/lib.js': 'a'.repeat(64), 'vendor/esm/e.mjs': 'b'.repeat(64), 'vendor/esm/c/': 'c'.repeat(64) } } })]),
      [],
    );
  });

  test('draw needs a browser half and a payload library', () => {
    expectError([drawPlugin('a', { exec: 'runtime' })], /declares draw but has no browser half/);
    const noPayload = drawPlugin('a');
    delete noPayload.manifest.payload;
    expectError([noPayload], /declares draw but no payload/);
  });

  test('draw needs the frame function, and it must be self-contained', () => {
    expectError([drawPlugin('a', { exports: { hasDrawFrame: false } })], /has no a\.draw-frame\.js exporting draw\(job, env\)/);
    expectError([drawPlugin('a', { exports: { drawFrameSource: "const x = require('y');\nfunction draw() {}" } })], /a\.draw-frame\.js requires or imports a module/);
    expectError([drawPlugin('a', { exports: { drawFrameModuleScope: 'const helper = 1;' } })], /has code outside draw\(\)/);
  });

  test('a module-graph library needs its esm copy; preload belongs to one', () => {
    expectError([drawPlugin('a', { draw: { frame: { library: 'esm' } } })], /draw\.frame\.library "esm"\) but its vendor has no esm and esm-chunks/);
    expectError([drawPlugin('a', { draw: { frame: { library: 'inline', preload: ['x'] } } })], /gives draw\.frame\.preload but its library is not a module graph/);
  });

  test("the frame may use the plugin's hydrate function only when its hydrate is a browser one", () => {
    assert.deepEqual(errorsOf([drawPlugin('a', { draw: { frame: { library: 'inline', usesHydrate: true } } })]), []);
    expectError(
      [drawPlugin('b', { exec: 'pass', draw: { frame: { library: 'inline', usesHydrate: true }, shim: true }, exports: { hasDrawShim: true } })],
      /uses its hydrate function \(draw\.frame\.usesHydrate\) but its hydrate is not a browser hydrate function/,
    );
  });

  test('host and shim are declared exactly when their files exist', () => {
    expectError([drawPlugin('a', { draw: { frame: { library: 'inline' }, host: true } })], /declares draw\.host but has no a\.draw-host\.mjs/);
    expectError([drawPlugin('a', { exports: { hasDrawHost: true } })], /ships a\.draw-host\.mjs but its manifest does not declare draw\.host/);
    expectError([drawPlugin('a', { exports: { hasDrawShim: true } })], /ships a\.draw-shim\.mjs but its manifest does not declare draw\.shim/);
  });

  test('a pass plugin needs a shim for the global it calls itself; a hydrate plugin must not have one', () => {
    expectError([drawPlugin('a', { exec: 'pass' })], /drawn by a runtime pass .* draw needs shim/);
    expectError([drawPlugin('b', { draw: withShim({ frame: { library: 'inline' } }), exports: { hasDrawShim: true } })], /receives ctx\.draw, so draw\.shim is not used/);
  });

  test('draw files with no draw section are an error', () => {
    expectError([drawPlugin('a', { draw: null, exports: { hasDrawFrame: true } })], /ships a draw file .* but its manifest declares no draw/);
  });
});
