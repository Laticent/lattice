/**
 * Unit: editing a diagram's SOURCE in Marp for VS Code holds the drawing already on screen until the new one is drawn
 * (lib/plugins/mermaid/mermaid.hydrate.js `holdEditedDiagrams`).
 *
 * THE BUG THIS PINS. On every keystroke the VS Code preview diffs Marp's raw HTML into the page. The `<section>` survives; the
 * laid-out cell holding the fence and the runtime's `.mermaid` drawing is removed, and a new raw `<pre>` arrives. When the
 * keystroke was inside the fence the source is new, the cache has nothing for it, and the slot stood empty for the length of a
 * render, on every keystroke, in a real VS Code (engineering/decisions/2026-09-05-diagram-fence-flash.md §10).
 *
 * The edits here are that measured shape (including the diff lifting the keyed `<svg>` out first), and the records are the observer's own, from real DOM writes in jsdom, not
 * hand-built objects. What a browser PAINTS is not proven here (HARD RULE #23); the real-surface number is in the decision note.
 *
 * The function is lifted from the shipped source between its sentinels and driven directly, as
 * test/unit/runtime/diagram-adoption.test.js does for the Studio's hold: paraphrasing it here would test the paraphrase.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { figureScopeKey: diagramScopeKey } = require('../../../lib/plugins/figure-scope.mjs');

const SRC = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'lib', 'plugins', 'mermaid', 'mermaid.hydrate.js'), 'utf8');

/** The shipped fence selector, built the way the runtime builds it (as diagram-adoption.test.js reads it). */
function shippedFenceSelector() {
  const m = SRC.match(/const FENCE_CODE_SELECTOR\s*=\s*\n?\s*(`[^`]+`);/);
  const code = SRC.match(/const MERMAID_CODE = (.+);\n/);
  assert.ok(m && code, 'mermaid.hydrate.js must declare FENCE_CODE_SELECTOR and MERMAID_CODE');
  const { RUNTIME_DRAWN } = require('../../../lib/plugins/drawn.generated.mjs');
  const MERMAID_CODE = new Function('MERMAID_FENCES', `return ${code[1]};`)(RUNTIME_DRAWN.mermaid.fences);
  return new Function('MERMAID_CODE', `return ${m[1]};`)(MERMAID_CODE);
}

/** The shipped `restoreStrippedDiagrams`, whose held-drawing arm runs before it ever needs the cache (stubbed). */
function liftRestore() {
  const fn = /\n {2}function restoreStrippedDiagrams\(records\) \{[\s\S]*?\n {2}\}\n/.exec(SRC);
  assert.ok(fn, 'mermaid.hydrate.js must define restoreStrippedDiagrams');
  // eslint-disable-next-line no-new-func
  return new Function('fenceJob', 'settleFenceFromCache', `${fn[0]}\nreturn restoreStrippedDiagrams;`)(() => null, () => false);
}

/** The shipped `holdEditedDiagrams`, with the shipped `fencePres` it pairs by. */
function lift() {
  const start = SRC.indexOf('  // ── BEGIN VSCODE HOLD');
  const end = SRC.indexOf('  // ── END VSCODE HOLD');
  assert.ok(start !== -1 && end > start, 'mermaid.hydrate.js must bracket holdEditedDiagrams with BEGIN/END VSCODE HOLD');
  const fp = /\n {2}function fencePres\(node\) \{[\s\S]*?\n {2}\}\n/.exec(SRC);
  assert.ok(fp, 'mermaid.hydrate.js must define fencePres');
  // eslint-disable-next-line no-new-func
  const make = new Function('diagramScopeKey', 'FENCE_CODE_SELECTOR', `${fp[0]}${SRC.slice(start, end)}\nreturn holdEditedDiagrams;`);
  return { hold: make(diagramScopeKey, shippedFenceSelector()) };
}

const FENCE = (source) => `<pre data-lattice-hydrate="mermaid" data-lattice-settle="rendered"><code class="language-mermaid">${source}</code></pre>`;

/** A laid-out diagram slide: the layout cell holding the fence and the `.mermaid` drawing the runtime put beside it. */
function slide(cls = 'diagram', fences = 1) {
  const cells = Array.from({ length: fences }, (_, i) => `<div class="cell-stage">${FENCE(`flowchart LR\n A-->B${i}`)}<div class="mermaid"><svg id="drawn-${i}"></svg></div></div>`);
  const dom = new JSDOM(`<!doctype html><body><section class="${cls}"><h2>Title</h2>${cells.join('')}</section></body>`);
  return dom.window;
}

/** Mark every drawing on the slide as drawn under the slide's current scope, as the shipped write sites do (`rememberDrawnScope`). */
function drawn(w) {
  for (const box of w.document.querySelectorAll('.mermaid')) box.setAttribute('data-lattice-drawn-scope', diagramScopeKey(box.closest('section')));
}

/**
 * VS Code's re-render of an edited deck, in its measured shape (a recorder in a real VS Code 1.145.2 preview): the section stays,
 * each laid-out cell is removed, and a NEW raw `<pre>` per fence arrives. Then what the plugin's own pass does before the hold:
 * `replayCachedFences` finds nothing cached for the edited source, gives each fence an empty target and marks it `pending`.
 * Returns the observer's own records for the diff.
 */
async function vscodeEdit(w, { slideClass, fences, liftKeyed = true } = {}) {
  const records = [];
  const seen = new Promise((resolve) => new w.MutationObserver((r) => { records.push(...r); resolve(); })
    .observe(w.document.body, { childList: true, subtree: true }));
  const section = w.document.querySelector('section');
  const count = fences ?? section.querySelectorAll('.cell-stage').length;
  // The diff (morphdom) pulls each keyed element (one with an `id`, as Mermaid's `<svg>` has) out of a subtree it discards, in a
  // record of its own, before the subtree goes: what a recorder saw in the real preview. `liftKeyed: false` is the plain removal.
  if (liftKeyed) for (const svg of [...section.querySelectorAll('.mermaid > svg[id]')]) svg.parentNode.removeChild(svg);
  for (const cell of [...section.querySelectorAll('.cell-stage')]) section.removeChild(cell);
  for (let i = 0; i < count; i++) {
    const pre = w.document.createElement('pre');
    pre.innerHTML = `<code class="language-mermaid">flowchart LR\n A-->Bx${i}</code>`;
    section.appendChild(pre);
  }
  if (slideClass) section.className = slideClass;
  await seen;
  for (const pre of section.querySelectorAll('pre')) {
    pre.dataset.latticeHydrate = 'mermaid';
    pre.dataset.latticeSettle = 'pending';
    const target = w.document.createElement('div');
    target.className = 'mermaid';
    pre.insertAdjacentElement('afterend', target);
  }
  return records;
}

test('each drawing goes back beside the fence in its place, and the fence stays pending for the new render', async () => {
  const w = slide('diagram', 2);
  const { hold } = lift();
  drawn(w);
  const records = await vscodeEdit(w);
  assert.equal(w.document.querySelector('.mermaid svg'), null, 'the control: the edit left the slots empty');
  hold(records);
  assert.deepEqual([...w.document.querySelectorAll('.mermaid svg')].map((svg) => svg.id), ['drawn-0', 'drawn-1'], 'in order, one each');
  for (const pre of w.document.querySelectorAll('pre')) assert.equal(pre.dataset.latticeSettle, 'pending', 'the new render is still owed');
});

test('a drawing removed with its cell, not lifted out first, is held the same way', async () => {
  const w = slide();
  const { hold } = lift();
  drawn(w);
  hold(await vscodeEdit(w, { liftKeyed: false }));
  assert.equal(w.document.querySelector('.mermaid svg')?.id, 'drawn-0');
});

test('a palette change gets an empty slot, not the old palette\'s ink', async () => {
  const w = slide();
  const { hold } = lift();
  drawn(w);
  hold(await vscodeEdit(w, { slideClass: 'diagram dark' }));
  assert.equal(w.document.querySelector('.mermaid svg'), null);
});

test('a slide that gained a diagram holds nothing: positions would not mean the same fence', async () => {
  const w = slide();
  const { hold } = lift();
  drawn(w);
  hold(await vscodeEdit(w, { fences: 2 }));
  assert.equal(w.document.querySelector('.mermaid svg'), null);
});

test('a drawing with no recorded scope, or a fence the cache already settled, is left alone', async () => {
  const unknown = slide();
  lift().hold(await vscodeEdit(unknown));
  assert.equal(unknown.document.querySelector('.mermaid svg'), null, 'no recorded scope, no hold');

  const settled = slide();
  const b = lift();
  drawn(settled);
  const records = await vscodeEdit(settled);
  settled.document.querySelector('pre').dataset.latticeSettle = 'rendered';
  b.hold(records);
  assert.equal(settled.document.querySelector('.mermaid svg'), null, 'a settled fence already has its own drawing');
});

// VS Code's built-in Mermaid script (extensions/mermaid-markdown-features) answers every preview update by removing EVERY
// `.mermaid > svg` in the document, held drawing included: traced in a real VS Code 1.145.2 to its `go()` on
// `vscode.markdown.updateContent`. The held node goes back as it is; a hold that was meant to end is not undone.
test('a held drawing that VS Code\'s own Mermaid script strips goes back, and a cleared hold stays cleared', async () => {
  const w = slide();
  const { hold } = lift();
  const restore = liftRestore();
  drawn(w);
  hold(await vscodeEdit(w));
  const strip = async () => {
    const records = [];
    const seen = new Promise((resolve) => new w.MutationObserver((r) => { records.push(...r); resolve(); })
      .observe(w.document.body, { childList: true, subtree: true }));
    for (const svg of w.document.querySelectorAll('.mermaid > svg')) svg.remove();
    await seen;
    return records;
  };
  restore(await strip());
  assert.equal(w.document.querySelector('.mermaid svg')?.id, 'drawn-0', 'the placeholder is back until its render lands');

  // `resetFenceAfterFailure` ends a hold by clearing the box and dropping its marker: nothing is put back.
  w.document.querySelector('.mermaid').removeAttribute('data-lattice-drawn-scope');
  restore(await strip());
  assert.equal(w.document.querySelector('.mermaid svg'), null);
});
