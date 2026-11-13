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

async function warningsFor({ css, marp = true, vscode = false, link = '' }) {
  const slide = `<section id="1"><h1>T</h1>${link}</section>`;
  const svg = `<svg data-marpit-svg=""><foreignObject>${slide}</foreignObject></svg>`;
  const body = !marp ? `<article class="lattice">${slide}</article>`
    : vscode ? `<div id="__marp-vscode"><div>${svg}</div></div>` : `<div class="marpit">${svg}</div>`;
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
  assert.match(w[0], /--config-file marp\.config\.cjs/);
});

// In the VS Code preview the styling arrives from the deck's link to the VS Code stylesheet (lib/export/marp-vscode-stub.js), so the
// warning tells a missing link line from a link to a file that is not there.
test('in the VS Code preview, the warning names the missing link line, or the missing file', { skip }, async () => {
  const [noLink] = await warningsFor({ css: '', vscode: true });
  assert.match(noLink, /lost its <link rel="stylesheet"/);
  const [missing] = await warningsFor({ css: '', vscode: true, link: '<link rel="stylesheet" href="lattice-vscode.css">' });
  assert.match(missing, /links lattice-vscode\.css, but that file is not beside the deck/);
});

test('no warning when the engine stylesheet is there, or when the page is not a Marp render', { skip }, async () => {
  assert.deepEqual(await warningsFor({ css: 'section { --fs-h1: 10px; }' }), []);
  assert.deepEqual(await warningsFor({ css: '', marp: false }), []);
});
