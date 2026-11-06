/**
 * The helpers that replace sleeps and stopwatches (HARD RULE #32) see what they claim to see, and are blind where
 * they say they are. A counter that reads zero on everything would turn every test built on it into a pass.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { scanWork, charReads } = require('../../helpers/work-count');
const { virtualClock } = require('../../helpers/runtime-boot');

describe('scanWork', () => {
  const text = 'ab'.repeat(5000);

  test('a single pass covers the text once; a search restarted from every position covers it n / 2 times', () => {
    const once = scanWork(() => text.indexOf('zz')).scanned;
    assert.equal(once, text.length);
    const rescan = scanWork(() => { for (let i = 0; i < text.length; i += 100) text.indexOf('zz', i); }).scanned;
    assert.ok(rescan > 40 * text.length, `restarting every 100 characters covered ${rescan}`);
  });

  test('a regex reached through replace, match, test and split is counted, from lastIndex on a global one', () => {
    for (const fn of [() => text.replace(/z/g, ''), () => text.match(/z/), () => /z/.test(text), () => text.split(/z/)]) {
      assert.ok(scanWork(fn).scanned >= text.length, String(fn));
    }
    const re = /b/g;
    re.lastIndex = text.length - 2;
    assert.equal(scanWork(() => re.exec(text)).scanned, 2);
  });

  test('a wrapped search behaves as the native one: includes still refuses a regex', () => {
    assert.throws(() => scanWork(() => 'a/a/'.includes(/a/)), TypeError);
    assert.equal(scanWork(() => 'abcabc'.lastIndexOf('c', Number.NaN)).scanned, 1, 'a NaN start searches from the end');
  });

  test('the prototypes are restored, even when the work throws', () => {
    const { indexOf } = String.prototype;
    const { exec } = RegExp.prototype;
    assert.throws(() => scanWork(() => { throw new Error('x'); }));
    assert.equal(String.prototype.indexOf, indexOf);
    assert.equal(RegExp.prototype.exec, exec);
  });
});

describe('charReads', () => {
  test('a charCodeAt walk reads each character once; restarting it from every position reads n / 2 each', () => {
    const text = 'ab'.repeat(500);
    const walk = (from) => { let n = 0; for (let k = from; k < text.length; k++) n += text.charCodeAt(k); return n; };
    assert.equal(charReads(() => walk(0)).reads, text.length);
    const { reads } = charReads(() => { for (let i = 0; i < text.length; i++) walk(i); });
    assert.equal(reads, (text.length * (text.length + 1)) / 2);
  });

  test('a scan that slices off the rest at every step is charged for the copies, with no character read', () => {
    const text = 'x'.repeat(1000);
    const { reads } = charReads(() => { let rest = text; while (rest.length) rest = rest.slice(1); });
    assert.equal(reads, (text.length * (text.length - 1)) / 2);
  });

  test('an array search charges the array it walks, and the prototypes come back', () => {
    const { charCodeAt } = String.prototype;
    const { some } = Array.prototype;
    assert.equal(charReads(() => [1, 2, 3, 4].some((x) => x > 9)).reads, 4);
    assert.equal(String.prototype.charCodeAt, charCodeAt);
    assert.equal(Array.prototype.some, some);
  });
});

describe('virtualClock', () => {
  test('settle fires timers in time order, frames included, and resolves once none are queued', async () => {
    const win = new JSDOM('').window;
    const { settle, now } = virtualClock(win);
    const seen = [];
    win.setTimeout(() => seen.push('b'), 50);
    win.setTimeout(() => { seen.push('a'); win.setTimeout(() => seen.push('c'), 100); }, 10);
    win.requestAnimationFrame(() => seen.push('frame'));
    const cleared = win.setTimeout(() => seen.push('never'), 5);
    win.clearTimeout(cleared);
    assert.equal(await settle(), 4);
    assert.deepEqual(seen, ['a', 'frame', 'b', 'c']);
    assert.equal(now(), 110);
  });

  test('a window that runs scripts reads the virtual time; a plain one leaves Node\'s clock alone', async () => {
    const scripted = new JSDOM('', { runScripts: 'dangerously' }).window;
    const { settle } = virtualClock(scripted);
    scripted.setTimeout(() => {}, 110);
    await settle();
    assert.equal(scripted.performance.now(), 110, 'the window reads the virtual time');
    assert.equal(scripted.eval('Date.now()'), Date.UTC(2026, 0, 1) + 110, 'and so does its Date, from a fixed epoch');
    // A plain jsdom window shares Node's Date: pinning it would freeze Date.now() for the rest of the file.
    const plain = new JSDOM('').window;
    assert.equal(plain.Date, Date, 'precondition: this window shares Node\'s Date');
    const nodeNow = Date.now;
    virtualClock(plain);
    assert.equal(Date.now, nodeNow, 'Node\'s Date.now is untouched');
  });

  test('work that never stops is an error, not a hang', async () => {
    const win = new JSDOM('').window;
    const { settle } = virtualClock(win);
    win.setInterval(() => {}, 16);
    await assert.rejects(settle({ maxSteps: 20 }), /never settles/);
  });
});
