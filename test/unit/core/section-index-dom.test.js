/**
 * Unit: `applyToDom` in lib/core/section-index.js.
 *
 * In a VIRTUAL document (the Playground's filmstrip, `.lattice[data-lv]`, which holds only the
 * slides in view) it keeps a number the engine already stamped: a recount would renumber divider 5
 * as 01. Everywhere else — an export among them, which splits pages after the engine stamped — it
 * recounts, exactly as before.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { SECTION_INDEX_ATTR, applyToDom, stampValue } = require('../../../lib/core/section-index');

const wrap = (inner, virtual) => `<body><article class="lattice"${virtual ? ' data-lv=""' : ''}>${inner}</article></body>`;
const divider = (stamp) => `<section class="divider numbered"><h2${stamp == null ? '' : ` ${SECTION_INDEX_ATTR}="${stamp}"`}>Part</h2></section>`;

describe('section-index applyToDom', () => {
  test('in a virtual document, a heading the engine stamped keeps its number', () => {
    const doc = new JSDOM(wrap(divider(stampValue(5)), true)).window.document;
    applyToDom(doc);
    assert.equal(doc.querySelector('h2').getAttribute(SECTION_INDEX_ATTR), stampValue(5));
  });

  test('anywhere else (an export) the pass recounts, as it always has', () => {
    const doc = new JSDOM(wrap(`${divider(stampValue(1))}${divider(stampValue(3))}`, false)).window.document;
    applyToDom(doc);
    assert.deepEqual([...doc.querySelectorAll('h2')].map((h) => h.getAttribute(SECTION_INDEX_ATTR)), [stampValue(1), stampValue(2)]);
  });

  test('in a virtual document, an unstamped heading is numbered by position, counting the stamped ones', () => {
    const doc = new JSDOM(wrap(`${divider(stampValue(1))}${divider(null)}${divider(null)}`, true)).window.document;
    applyToDom(doc);
    assert.deepEqual(
      [...doc.querySelectorAll('h2')].map((h) => h.getAttribute(SECTION_INDEX_ATTR)),
      [stampValue(1), stampValue(2), stampValue(3)],
    );
  });

  test('a document the engine never ran over is numbered from 1', () => {
    const doc = new JSDOM(wrap(`${divider(null)}${divider(null)}`, false)).window.document;
    applyToDom(doc);
    assert.deepEqual([...doc.querySelectorAll('h2')].map((h) => h.getAttribute(SECTION_INDEX_ATTR)), [stampValue(1), stampValue(2)]);
  });
});
