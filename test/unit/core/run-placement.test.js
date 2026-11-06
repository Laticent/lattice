/**
 * Unit: a split run's body pages share one placement (lib/core/run-placement.js).
 *
 * The pass needs layout, which no DOM library here has, so the test hands it a small fake
 * document: each page is a section with a stage of a given room and content height, and the
 * fake layout moves the content by the stage's top padding, as a flex column starting at the
 * top would. The real-browser check is the export check deck (`.scratch/charts/runjump.js`).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { settleRunPlacement } = require('../../../lib/core/run-placement');

function fakeDoc(pages) {
  const sections = pages.map(({ id, room, height, cls = [], align = null }) => {
    const props = new Map();
    const attrs = new Map([['data-lattice-slide', id], ['data-split-role', 'body']]);
    if (align) attrs.set('data-align', align);
    const section = {
      classList: { contains: (c) => cls.includes(c) },
      style: {
        getPropertyValue: (k) => props.get(k) || '',
        setProperty: (k, v) => props.set(k, v),
        removeProperty: (k) => props.delete(k),
      },
      getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
      setAttribute: (k, v) => attrs.set(k, v),
      removeAttribute: (k) => attrs.delete(k),
      querySelector: (sel) => (sel === ':scope > .cell-stage' ? stage : null),
      props,
    };
    const pad = () => Number.parseFloat(props.get('--run-pad') || '20');
    const child = { getBoundingClientRect: () => ({ top: pad(), bottom: pad() + height }) };
    const stage = {
      kind: 'stage',
      pad,
      children: [child],
      getBoundingClientRect: () => ({ height: 1 }),
      offsetHeight: 1,
    };
    // The stage's border box does not change with its padding: a padding change moves the content.
    Object.defineProperty(stage, 'clientHeight', { get: () => room + 40 });
    return section;
  });
  global.getComputedStyle = (el) => (el.kind === 'stage'
    ? { display: 'flex', flexDirection: 'column', paddingTop: `${el.pad()}px`, paddingBottom: '20px' }
    : { display: 'block', position: 'static' });
  return { querySelectorAll: () => sections, sections };
}

test('a centered run gives every page the top that centers its tallest page', () => {
  const doc = fakeDoc([
    { id: '4.2', room: 600, height: 300 },
    { id: '4.3', room: 600, height: 500 },
    { id: '4.4', room: 600, height: 200 },
  ]);
  settleRunPlacement(doc);
  for (const s of doc.sections) {
    assert.equal(s.props.get('--run-offset'), '50px', '(600 − 500) / 2');
    assert.equal(s.props.get('--run-pad'), '70px', 'the stage padding (20) plus the offset');
  }
  assert.equal(settleRunPlacement(doc), 0, 'a second pass writes nothing');
});

test('bottom puts the tallest page on the floor, and every page starts with it', () => {
  const doc = fakeDoc([
    { id: '2.2', room: 600, height: 300, align: 'bottom' },
    { id: '2.3', room: 600, height: 450, align: 'bottom' },
  ]);
  settleRunPlacement(doc);
  for (const s of doc.sections) assert.equal(s.props.get('--run-offset'), '150px');
});

test('top, spread and fill are left to the page, and a lone page is not a run', () => {
  for (const align of ['top', 'spread', 'fill']) {
    const doc = fakeDoc([{ id: '3.2', room: 600, height: 300, align }, { id: '3.3', room: 600, height: 100, align }]);
    assert.equal(settleRunPlacement(doc), 0, align);
  }
  const lone = fakeDoc([{ id: '5.2', room: 600, height: 100 }]);
  assert.equal(settleRunPlacement(lone), 0);
});

test('a run whose tallest page overflows starts every page at the top', () => {
  const doc = fakeDoc([{ id: '6.2', room: 400, height: 500 }, { id: '6.3', room: 400, height: 100 }]);
  assert.equal(settleRunPlacement(doc), 0, 'no spare room: nothing to write');
});
