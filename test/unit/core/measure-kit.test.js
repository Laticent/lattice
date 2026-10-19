/**
 * measure-kit — the shared measuring lifecycle behind `collage` and `logo-wall`
 * (lib/core/measure-kit.js; decision note 2026-10-16-mosaico-layout-library.md §4.5, §8 item 4).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const kit = require('../../../lib/core/measure-kit');

const doc = () => new JSDOM('<!doctype html><body><ul id="l"><li></li></ul><ul id="m"><li></li></ul></body>').window.document;
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const never = () => new Promise(() => {});

test.beforeEach(() => kit.forget());

test('run: every shape known now finishes in the same task, with no frame between', () => {
  const d = doc();
  const list = d.getElementById('l');
  const seen = [];
  kit.run({ list, attr: 'data-x', sources: [() => 1.5, () => 0.5], finish: (v) => { seen.push(v); list.setAttribute('data-x', 'packed'); } });
  assert.deepEqual(seen, [[1.5, 0.5]]);
  assert.equal(list.getAttribute('data-x'), 'packed', 'never observed as measuring after the call');
});

test('run: holds the list as measuring until the last shape arrives, then finishes once', async () => {
  const d = doc();
  const list = d.getElementById('l');
  let release;
  const slow = new Promise((r) => { release = r; });
  const calls = [];
  kit.run({ list, attr: 'data-x', sources: [() => 2, () => slow], finish: (v) => calls.push(v) });
  assert.equal(list.getAttribute('data-x'), 'measuring');
  assert.equal(calls.length, 0);
  release(0.75);
  await tick();
  assert.deepEqual(calls, [[2, 0.75]]);
});

test('stability rule: a second run on a list being measured is refused, and a late arrival never re-packs', async () => {
  const d = doc();
  const list = d.getElementById('l');
  let release;
  const slow = new Promise((r) => { release = r; });
  const calls = [];
  assert.equal(kit.run({ list, attr: 'data-x', sources: [() => slow], finish: (v) => calls.push(v) }), true);
  assert.equal(kit.run({ list, attr: 'data-x', sources: [() => 9], finish: (v) => calls.push(['second', v]) }), false);
  release(1);
  await tick();
  await tick();
  assert.deepEqual(calls, [[1]], 'one finish, from the first run');
});

test('cap: finishes with what is known when a shape never arrives', async () => {
  const d = doc();
  const list = d.getElementById('l');
  const calls = [];
  kit.run({ list, attr: 'data-x', sources: [() => 1, never], finish: (v) => calls.push(v), cap: 20 });
  await tick(60);
  assert.deepEqual(calls, [[1, null]]);
});

test('a source that throws or rejects reads as unknown and does not stop the others', async () => {
  const d = doc();
  const list = d.getElementById('l');
  const calls = [];
  kit.run({ list, attr: 'data-x', sources: [() => { throw new Error('x'); }, () => Promise.reject(new Error('y')), () => 3], finish: (v) => calls.push(v) });
  await tick();
  assert.deepEqual(calls, [[null, null, 3]]);
});

test('registry: idle resolves true when the last run finishes, false at its own cap', async () => {
  const d = doc();
  const a = d.getElementById('l');
  const b = d.getElementById('m');
  const reg = kit.registryOf(d);
  assert.equal(await reg.idle(10), true, 'nothing measuring: idle at once');
  let release;
  const slow = new Promise((r) => { release = r; });
  kit.run({ list: a, attr: 'data-x', sources: [() => slow], finish: () => {} });
  kit.run({ list: b, attr: 'data-y', sources: [never], finish: () => {}, cap: 5000 });
  assert.equal(await reg.idle(15), false, 'one list still measuring at the cap');
  release(1);
  await tick();
  const waiting = reg.idle(500);
  reg.settle();
  assert.equal(await waiting, true);
});

test('registry: settle finishes every run still measuring with what is known, and says how many', async () => {
  const d = doc();
  const a = d.getElementById('l');
  const calls = [];
  kit.run({ list: a, attr: 'data-x', sources: [() => 2, never], finish: (v) => { calls.push(v); a.setAttribute('data-x', 'fallback'); } });
  assert.equal(a.getAttribute('data-x'), 'measuring');
  assert.equal(kit.registryOf(d).settle(), 1);
  assert.deepEqual(calls, [[2, null]]);
  assert.equal(a.getAttribute('data-x'), 'fallback', 'never left measuring');
  assert.equal(kit.registryOf(d).settle(), 0);
});

test('remember: shares one Promise per key, keeps a shape, forgets a failure so a later visit retries', async () => {
  let loads = 0;
  const load = (v) => () => { loads++; return Promise.resolve(v); };
  const p1 = kit.remember('u', load(2));
  const p2 = kit.remember('u', load(99));
  assert.equal(p1, p2, 'the same Promise while it is in flight');
  assert.equal(await p1, 2);
  assert.equal(kit.remember('u', load(99)), 2, 'a kept shape answers at once, with no new load');
  assert.equal(loads, 1);
  assert.equal(await kit.remember('bad', () => Promise.resolve(null)), null);
  assert.equal(await kit.remember('bad', load(4)), 4, 'a null was not kept');
  assert.equal(await kit.remember('rej', () => Promise.reject(new Error('net'))), null);
  assert.equal(await kit.remember('rej', load(5)), 5, 'a rejection was forgotten');
});

test('aspectOfImage: a loaded image answers now; an unloaded one answers on load, and again from memory', async () => {
  const d = doc();
  const mk = (complete, w, h, src) => {
    const im = d.createElement('img');
    Object.defineProperties(im, { complete: { get: () => complete }, naturalWidth: { get: () => w }, naturalHeight: { get: () => h }, src: { get: () => src } });
    return im;
  };
  assert.equal(kit.aspectOfImage(mk(true, 300, 200, 'a.png')), 1.5);
  assert.equal(kit.aspectOfImage(mk(true, 0, 0, 'broken.png')), null, 'a broken image is complete and unknown, not awaited');
  let state = { complete: false, w: 0, h: 0 };
  const im = d.createElement('img');
  Object.defineProperties(im, { complete: { get: () => state.complete }, naturalWidth: { get: () => state.w }, naturalHeight: { get: () => state.h }, src: { get: () => 'late.png' } });
  const p = kit.aspectOfImage(im);
  assert.equal(typeof p.then, 'function');
  state = { complete: true, w: 100, h: 400 };
  im.dispatchEvent(new d.defaultView.Event('load'));
  assert.equal(await p, 0.25);
  const again = mk(false, 0, 0, 'late.png');
  assert.equal(kit.aspectOfImage(again), 0.25, 'a revisit that re-creates the image does not wait');
});

test('a finish that throws leaves the list as the unpacked grid, and settle still reaches the other lists', () => {
  const d = doc();
  const a = d.getElementById('l');
  const b = d.getElementById('m');
  const seen = [];
  kit.run({ list: a, attr: 'data-x', sources: [never], finish: () => { throw new Error('boom'); } });
  kit.run({ list: b, attr: 'data-x', sources: [never], finish: (v) => seen.push(v) });
  assert.doesNotThrow(() => kit.registryOf(d).settle());
  assert.equal(a.getAttribute('data-x'), 'fallback', 'never left measuring, which the CSS hides');
  assert.deepEqual(seen, [[null]]);
  assert.equal(kit.registryOf(d).runs.size, 0);
});

test('remember with keepNull keeps a successful read that found no shape, and still forgets a rejection', async () => {
  let loads = 0;
  const unreadable = () => { loads++; return Promise.resolve(null); };
  assert.equal(await kit.remember('svg', unreadable, { keepNull: true }), null);
  assert.equal(kit.remember('svg', unreadable, { keepNull: true }), null);
  assert.equal(loads, 1, 'asked once');
  await kit.remember('down', () => Promise.reject(new Error('net')), { keepNull: true });
  assert.equal(await kit.remember('down', () => Promise.resolve(2), { keepNull: true }), 2);
});

test('aspectOfImage forgets a URL whose image is broken now', () => {
  const d = doc();
  const mk = (complete, w, h) => {
    const im = d.createElement('img');
    Object.defineProperties(im, { complete: { get: () => complete }, naturalWidth: { get: () => w }, naturalHeight: { get: () => h }, src: { get: () => 'same.png' } });
    return im;
  };
  assert.equal(kit.aspectOfImage(mk(true, 300, 100)), 3);
  assert.equal(kit.aspectOfImage(mk(true, 0, 0)), null);
  const p = kit.aspectOfImage(mk(false, 0, 0));
  assert.equal(typeof p.then, 'function', 'an old shape does not answer for a broken image');
});
