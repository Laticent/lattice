/**
 * A Marp render whose Lattice stylesheet never registered says so once, in the console (lib/runtime/index.js
 * `warnIfMarpThemeUnregistered`). It is the one Marp failure that otherwise produces no message at all: every slide renders
 * as plain text and neither Marp nor the editor reports anything (the kit README's "If the slides look plain").
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { closeQuietly } = require('../../helpers/jsdom-close');

const RUNTIME = path.join(__dirname, '..', '..', '..', 'dist', 'lattice-runtime.js');
const skip = !fs.existsSync(RUNTIME) && 'dist/ not built';

async function warningsFor({ css, marp = true }) {
  const slide = '<section id="1"><h1>T</h1></section>';
  const body = marp ? `<div class="marpit"><svg data-marpit-svg=""><foreignObject>${slide}</foreignObject></svg></div>` : `<article class="lattice">${slide}</article>`;
  const dom = new JSDOM(`<!doctype html><html><head><style>${css}</style></head><body>${body}</body></html>`, { runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  const warns = [];
  w.console.warn = (m) => warns.push(String(m));
  w.console.log = () => {};
  w.eval(fs.readFileSync(RUNTIME, 'utf8'));
  // A signal, not a duration (HARD RULE #32): the check runs on `load`.
  if (w.document.readyState !== 'complete') await new Promise((r) => w.addEventListener('load', r, { once: true }));
  await Promise.resolve();
  closeQuietly(w);
  return warns.filter((m) => m.includes('The Lattice stylesheet is not applied'));
}

test('a Marp slide with no Lattice stylesheet gets one warning that names the fix', { skip }, async () => {
  const w = await warningsFor({ css: '' });
  assert.equal(w.length, 1);
  assert.match(w[0], /workspace root/);
  assert.match(w[0], /--config-file marp\.config\.cjs/);
});

test('no warning when the engine stylesheet is there, or when the page is not a Marp render', { skip }, async () => {
  assert.deepEqual(await warningsFor({ css: 'section { --fs-h1: 10px; }' }), []);
  assert.deepEqual(await warningsFor({ css: '', marp: false }), []);
});
