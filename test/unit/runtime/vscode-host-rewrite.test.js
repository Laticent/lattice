/**
 * Marp for VS Code's re-render, named by the host: `vscode.markdown.updateContent` (lib/runtime/index.js `vscodeHostWrite`).
 *
 * On every keystroke the preview diffs Marp's raw HTML into the page, which takes a laid-out slide back to Marp's markup (the
 * runtime's classes and cells go), and then dispatches `vscode.markdown.updateContent` in the same task. The runtime must lay
 * the slide out again IN THE OBSERVER'S MICROTASK, before any frame paints and before a plugin replays a cache keyed on the
 * slide's classes (Mermaid's, lib/plugins/figure-scope.mjs). Measured in VS Code 1.145.2: without it, 0 of 8 Mermaid cache
 * lookups hit after a re-render and the diagram slot stood empty for ~6 painted frames each time.
 *
 * Deterministic (HARD RULE #32): a MutationObserver callback is a microtask queued by the mutation itself, so one awaited
 * microtask after the write is past it; the debounced pass (150 ms) cannot have run.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { closeQuietly } = require('../../helpers/jsdom-close');

const RUNTIME = path.join(__dirname, '..', '..', '..', 'dist', 'lattice-runtime.js');
const skip = !fs.existsSync(RUNTIME) && 'dist/ not built';

// Marp's raw slide, as the preview writes it back on every re-render.
const RAW = '<h1>Plain</h1><p>Body text.</p>';

async function boot() {
  const dom = new JSDOM(`<!doctype html><html><head></head><body><div class="marpit"><section id="1" class="content">${RAW}</section></div></body></html>`,
    { runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.console.log = () => {};
  w.console.warn = () => {};
  w.eval(fs.readFileSync(RUNTIME, 'utf8'));
  // A signal, not a duration: the runtime marks the root when its first pass has run.
  for (let i = 0; i < 200 && w.document.documentElement.dataset.latticeRuntime !== 'loaded'; i++) await new Promise((r) => w.setTimeout(r, 5));
  return w;
}

/** What the preview's diff does to a laid-out slide: its classes and children back to Marp's raw markup. */
function hostRewrite(w, { announce }) {
  const s = w.document.querySelector('section');
  for (const a of [...s.attributes]) if (a.name !== 'id') s.removeAttribute(a.name);
  s.className = 'content';
  s.innerHTML = RAW;
  if (announce) w.dispatchEvent(new w.CustomEvent('vscode.markdown.updateContent'));
}

const laidOut = (w) => w.document.querySelector('section').classList.contains('form');

test('the slide is laid out again in the same microtask when VS Code announces its re-render', { skip }, async () => {
  const w = await boot();
  assert.ok(laidOut(w), 'the first pass laid the slide out');
  hostRewrite(w, { announce: true });
  assert.ok(!laidOut(w), 'the host write took the layout away');
  await Promise.resolve();
  assert.ok(laidOut(w), 'laid out again before the next frame, by the observer microtask');
  closeQuietly(w);
});

test('without the announcement the slide waits for the debounced pass (the control: the test above can fail)', { skip }, async () => {
  const w = await boot();
  hostRewrite(w, { announce: false });
  await Promise.resolve();
  assert.ok(!laidOut(w), 'an unannounced write keeps the old schedule');
  closeQuietly(w);
});
