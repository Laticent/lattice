/**
 * The CLI's draw host (lib/export/locked-figures.js `openExportDrawHost`): what reaches the capture page when the locked
 * page cannot draw. The host's own failure (the page did not open, or broke while drawing) releases the figure showing
 * its source, with one warning; a plugin's own error (a bad config) is the plot's and its text shows (D2 slice 2,
 * the maker-checker's finding).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openExportDrawHost } = require('../../../lib/export/locked-figures.js');

const job = { kind: 'function-plot', configB64: 'e30=', configText: '{}', width: 600, height: 300, index: 0 };

test('a locked page that cannot open releases its figures, warning once', async () => {
  const warnings = [];
  const host = openExportDrawHost({}, ['function-plot'], { warn: (m) => warnings.push(m), open: async () => { throw new Error('no context'); } });
  assert.deepEqual(await host.call(job), { release: true });
  assert.deepEqual(await host.call({ ...job, index: 1 }), { release: true });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /could not draw \(no context\)/);
});

test('a locked page that breaks WHILE drawing releases its figures too, warning once', async () => {
  const warnings = [];
  const page = { draw: async () => { throw new Error('Protocol error: Target closed'); }, close: async () => {} };
  const host = openExportDrawHost({}, ['function-plot'], { warn: (m) => warnings.push(m), open: async () => page });
  assert.deepEqual(await host.call(job), { release: true }, 'never an error text baked into the export');
  assert.deepEqual(await host.call({ ...job, index: 1 }), { release: true });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /failed while drawing \(Protocol error: Target closed\)/);
});

test('a plugin\'s own error (a bad config) is the plot\'s: its text is drawn, nothing released', async () => {
  const page = { draw: async () => ({ error: 'functionplot error: bad config' }), close: async () => {} };
  const host = openExportDrawHost({}, ['function-plot'], { open: async () => page });
  assert.deepEqual(await host.call(job), { error: 'functionplot error: bad config' });
});

test('a figure is drawn once per job and pixel ratio, however often the page asks', async () => {
  let draws = 0;
  const page = { draw: async () => { draws++; return { out: '<svg/>' }; }, close: async () => {} };
  const host = openExportDrawHost({}, ['function-plot'], { open: async () => page });
  await host.call(job, 1);
  await host.call(job, 1);
  await host.call(job, 2);
  assert.equal(draws, 2);
});

test('the pixel ratio the page asks for is clamped, so page script cannot ask for a giant viewport (the red team, D2)', async () => {
  const ratios = [];
  const page = { draw: async (_job, r) => { ratios.push(r); return { out: '<svg/>' }; }, close: async () => {} };
  const host = openExportDrawHost({}, ['function-plot'], { open: async () => page });
  await host.call(job, 1000);
  await host.call({ ...job, index: 1 }, 0);
  await host.call({ ...job, index: 2 }, 2);
  assert.deepEqual(ratios, [8, 1, 2]);
});

test('the finished draws it keeps are bounded: the oldest is drawn again once 512 newer ones were asked for', async () => {
  let draws = 0;
  const page = { draw: async () => { draws++; return { out: '<svg/>' }; }, close: async () => {} };
  const host = openExportDrawHost({}, ['function-plot'], { open: async () => page });
  for (let i = 0; i <= 512; i++) await host.call({ ...job, index: i });
  assert.equal(draws, 513);
  await host.call({ ...job, index: 512 });
  assert.equal(draws, 513, 'a recent one is kept');
  await host.call({ ...job, index: 0 });
  assert.equal(draws, 514, 'the oldest was dropped');
});
