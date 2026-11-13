/**
 * The docs site's ESM engine starts with an EMPTY chart registry (tools/build-playground.js `lazyChartRegistryPlugin`)
 * and each chart entry fills it. The stand-in has to carry every table the dispatch reads before a kernel exists, and
 * each entry has to bring the phone-page code (lib/plugins/chart-family/shared/chart-phone.js) with its kernel.
 *
 * Born from a stand-in that carried LAYOUTS, FIGURE_CLASSES, KERNELS and PLUGIN but not FORM_KINDS: every chart on a
 * phone-sized page in the Studio and the Playground threw "Cannot read properties of undefined (reading 'has')", and
 * no unit test saw it, because they all load the full Node registry.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { ESM_OPTIONS } = require('../../../tools/build-playground');
const registry = require('../../../lib/plugins/chart-family/shared/chart-registry.generated');

/** Run the plugin's setup against a stand-in build and collect its loaders by namespace. */
function loaders() {
  const plugin = ESM_OPTIONS.plugins.find((p) => p.name === 'lazy-chart-registry');
  assert.ok(plugin, 'the ESM build has the lazy chart registry');
  const onLoad = {};
  plugin.setup({ onResolve() {}, onLoad: ({ namespace }, fn) => { onLoad[namespace] = fn; } });
  return onLoad;
}

test('the empty registry carries every table the dispatch reads before a kernel loads', () => {
  const { contents } = loaders()['lazy-chart-registry']({ path: 'x' });
  const module = { exports: {} };
  vm.runInNewContext(contents, { module, Set });
  const r = module.exports;
  assert.equal(Object.keys(r.KERNELS).length, 0, 'no kernel until an entry brings one');
  assert.equal(r.PHONE, null, 'no phone code until an entry brings it');
  assert.deepEqual([...r.LAYOUTS], [...registry.LAYOUTS]);
  assert.deepEqual([...r.FORM_KINDS].sort(), [...registry.FORM_KINDS].sort());
  assert.deepEqual([...r.FORM_HERO_KINDS].sort(), [...registry.FORM_HERO_KINDS].sort());
  // Every key the Node registry exports is in the stand-in, so a table added there cannot be missing here.
  for (const key of Object.keys(registry)) assert.ok(key in r, `the stand-in carries ${key}`);
});

test('each chart entry registers its kernel and brings the phone code with it', () => {
  const { contents } = loaders()['lattice-chart']({ path: 'bar' });
  assert.match(contents, /registry\.KERNELS\["bar"\] = /);
  assert.match(contents, /import phone from ".*chart-phone\.js"/);
  assert.match(contents, /if \(!registry\.PHONE\) registry\.PHONE = phone;/);
});
