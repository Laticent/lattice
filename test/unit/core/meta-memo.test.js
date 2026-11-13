// The slide-metadata memo (lib/core/meta-memo.mjs) and its two readers, counted, never timed (HARD RULE #32).
// A slide that holds a phone photo is megabytes of data URI. The memo used to copy such a slide on every read, keep it
// until the next write evicted it, and evict every other slide to make room: a deck of three phone photos held
// Firefox's main thread for up to 29 s (docs/e2e/export-photo-size.spec.ts).
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const PHOTO = `![bg](data:image/jpeg;base64,${'A'.repeat(3_000_000)})`;

describe('meta-memo: a key over the cap', () => {
  test('is never copied, stored or looked up, and evicts nothing', async () => {
    const { memoGet, memoSet, memoStats } = await import('../../../lib/core/meta-memo.mjs');
    const map = new Map();
    memoSet(map, 'small one', 1, 100);
    memoSet(map, 'small two', 2, 100);
    const before = memoStats.copiedChars;
    memoSet(map, 'x'.repeat(101), 3, 100);
    assert.equal(memoStats.copiedChars - before, 0, 'an over-cap key was copied');
    assert.deepEqual([...map.keys()], ['small one', 'small two'], 'an over-cap key was stored, or evicted the others');
    assert.equal(memoGet(map, 'x'.repeat(101), 100), undefined);
    assert.equal(memoGet(map, 'small one', 100), 1, 'the entries under the cap still hit');
  });

  test('a key AT the cap is remembered (the bound is inclusive)', async () => {
    const { memoGet, memoSet } = await import('../../../lib/core/meta-memo.mjs');
    const map = new Map();
    memoSet(map, 'y'.repeat(100), 'v', 100);
    assert.equal(memoGet(map, 'y'.repeat(100), 100), 'v');
  });
});

describe('the readers on a deck with a photo slide', () => {
  test('readMetaField copies no photo slide, and the small slides keep hitting', async () => {
    const { readMetaField } = await import('../../../lib/core/meta-edit.mjs');
    const { memoStats } = await import('../../../lib/core/meta-memo.mjs');
    const slides = ['<!-- _class: title -->\n\n# Photos', `<!-- _class: image -->\n\n## One\n\n${PHOTO}`, '## Plain\n\nText.'];
    for (const s of slides) readMetaField(s, 'class');
    const before = memoStats.copiedChars;
    // Ten renders, every slide read on each, as the Studio's class editor does.
    for (let i = 0; i < 10; i++) for (const s of slides) readMetaField(s, 'class');
    assert.equal(memoStats.copiedChars - before, 0, 'a render re-copied a slide: the photo slide was memoized, or evicted the rest');
    assert.equal(readMetaField(slides[1], 'class').value, 'image', 'the photo slide still reads');
  });

  test('readRecord reads an over-cap record uncached, the same answer each time', async () => {
    const { readRecord } = await import('../../../lib/core/meta-door.mjs');
    const { memoStats } = await import('../../../lib/core/meta-memo.mjs');
    const body = ` {class=cards, note=${'n'.repeat(1_100_000)}} `;
    const before = memoStats.copiedChars;
    const a = readRecord(body);
    const b = readRecord(body);
    assert.equal(memoStats.copiedChars - before, 0, 'an over-cap record was copied into the memo');
    assert.deepEqual(a, b);
    assert.equal(a.ok, true);
  });
});
