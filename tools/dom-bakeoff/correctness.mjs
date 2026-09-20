/**
 * dom-bakeoff correctness — can a candidate parser do the jobs jsdom does here?
 *
 * Speed is not consulted until a candidate passes this, and the reason is written
 * into `lib/core/dom-provider.js`: linkedom once measured 17x faster on this
 * repo's own hot path while silently lowercasing every SVG element name, which
 * would have killed every chart gradient and every Mermaid label with the whole
 * suite green. A fast parser that is wrong fails in the expensive direction.
 *
 * Every probe is drawn from something this repo actually does on the Node path,
 * and the two censuses behind the selection are in the decision note.
 *
 * ROUND-TRIP IS DIFFERENTIAL, ON PURPOSE. "Does output equal input?" is the wrong
 * question — every spec parser normalizes `alt` to `alt=""` and `<br />` to `<br>`,
 * so all six candidates "fail" it identically and the probe tells you nothing. The
 * migration question is whether swapping the parser CHANGES THE BYTES WE SHIP, so
 * each candidate is compared against jsdom's serialization of the same input.
 *
 * Usage:  node tools/dom-bakeoff/correctness.mjs [--json]
 *         npm i --no-save happy-dom linkedom node-html-parser cheerio   # the field
 */
import { writeFileSync } from 'node:fs';
import { closeWindow, loadAdapters } from './adapters.mjs';
import { fixtures } from './fixtures.mjs';

const adapters = await loadAdapters();
const names = Object.keys(adapters);
const FIX = await fixtures();

/** Can this adapter answer a selector at all? Used to mark a probe unmeasurable
 *  rather than scoring the harness's own shim as a library failure. */
const hasSelectors = (a) => {
  try { a.parse('<p>x</p>').root.querySelector('p'); return true; } catch { return false; }
};

const probes = [];
// `refKey` names the jsdom reference serialization a probe is compared against;
// only the differential Serialization probes pass one.
const probe = (id, group, why, fn, refKey) => probes.push({ id, group, why, fn, refKey });

// ── SVG casing — the disqualifier that has already nearly shipped ────────────
const SVG_ELS = ['radialGradient', 'linearGradient', 'clipPath', 'foreignObject', 'textPath', 'feGaussianBlur', 'animateTransform'];
probe('svg-element-case', 'SVG', 'camelCase SVG element names survive a parse', (a) => {
  const { root, window } = a.parse(`<svg viewBox="0 0 10 10">${SVG_ELS.map((e) => `<${e}></${e}>`).join('')}</svg>`);
  const out = root.innerHTML; closeWindow(window);
  const lost = SVG_ELS.filter((e) => !out.includes(`<${e}`));
  return { pass: lost.length === 0, detail: lost.length ? `lost ${lost.length}/${SVG_ELS.length}: ${lost.join(',')}` : `${SVG_ELS.length}/${SVG_ELS.length} kept` };
});

const SVG_ATTRS = ['viewBox', 'preserveAspectRatio', 'gradientUnits', 'patternUnits', 'clipPathUnits', 'textLength', 'markerWidth', 'gradientTransform'];
probe('svg-attr-case', 'SVG', 'camelCase SVG attribute names survive a parse', (a) => {
  const { root, window } = a.parse(`<svg ${SVG_ATTRS.map((x) => `${x}="1"`).join(' ')}></svg>`);
  const out = root.innerHTML; closeWindow(window);
  const lost = SVG_ATTRS.filter((x) => !out.includes(x));
  return { pass: lost.length === 0, detail: lost.length ? `lost: ${lost.join(',')}` : `${SVG_ATTRS.length}/${SVG_ATTRS.length} kept` };
});

// ── Differential serialization against jsdom ────────────────────────────────
for (const [key, label] of [['slideMedian', 'median slide'], ['slideHeaviest', 'heaviest slide'], ['deck', 'whole gallery deck']]) {
  probe(`serialize-matches-jsdom:${key}`, 'Serialization', `serializes ${label} byte-identically to jsdom`, (a, ref) => {
    if (a.name === 'jsdom') return { pass: true, detail: 'reference' };
    if (ref == null) return { pass: null, detail: 'no jsdom reference available' };
    const { root, window } = a.parse(FIX[key]);
    const out = root.innerHTML; closeWindow(window);
    if (out === ref) return { pass: true, detail: 'byte-identical to jsdom' };
    let i = 0; while (i < Math.min(out.length, ref.length) && out[i] === ref[i]) i++;
    return { pass: false, detail: `diverges @${i}: jsdom ${JSON.stringify(ref.slice(i, i + 32))} vs ${JSON.stringify(out.slice(i, i + 32))}` };
  }, key);
}

// ── Selectors this repo actually writes (from the Node census) ──────────────
// `:has()`, `:is()` and `:where()` are deliberately absent: zero uses on the Node side.
//
// EVERY ROW ASSERTS THE MATCH COUNT. An earlier cut asserted only that the call did
// not throw and printed the count as detail — so a selector engine that silently
// matched NOTHING scored a clean PASS. Three candidates did exactly that on `:scope`
// (domino, basichtml and cheerio all return 0 where every other library returns 2),
// and the false pass reached the decision note's table before an independent checker
// caught it. A parser that returns an empty NodeList is the single worst failure mode
// here: every transform finds no sections and no-ops, silently, output unchanged.
const SELECTOR_FIXTURE = '<section class="lattice lead" data-lattice="1"><h1>t</h1><p>a</p></section><section class="lattice"><h2>u</h2></section>';
for (const [label, sel, expected] of [
  ['child >', 'body > section', 2],
  ['attribute', 'section[data-lattice]', 1],
  [':scope', ':scope > section', 2],
  ['selector list', 'h1, h2, h3', 2],
  [':not()', 'section:not(.lead)', 1],
  [':nth-child', 'section:nth-child(2)', 1],
]) {
  probe(`selector:${label}`, 'Selectors', `querySelectorAll('${sel}') returns exactly ${expected}`, (a) => {
    const { root, doc, window } = a.parse(SELECTOR_FIXTURE);
    try {
      const target = sel.startsWith(':scope') ? root : (doc.querySelectorAll ? doc : root);
      const n = target.querySelectorAll(sel).length;
      closeWindow(window);
      return { pass: n === expected, detail: n === expected ? `${n} match(es)` : `matched ${n}, expected ${expected}` };
    } catch (e) { closeWindow(window); return { pass: false, detail: `throws: ${String(e.message).slice(0, 56)}` }; }
  });
}

// ── Mutation surface the transformers use ───────────────────────────────────
for (const [label, fn] of [
  ['createElement + appendChild', (el, doc) => { el.appendChild(doc.createElement('span')); return !!el.querySelector('span'); }],
  ['innerHTML set', (el) => { el.querySelector('h1').innerHTML = '<em>q</em>'; return !!el.querySelector('em'); }],
  ['textContent set', (el) => { el.querySelector('h1').textContent = 'z'; return el.querySelector('h1').textContent === 'z'; }],
  ['outerHTML get', (el) => typeof el.outerHTML === 'string'],
  ['setAttribute / getAttribute', (el) => { el.setAttribute('data-x', '1'); return el.getAttribute('data-x') === '1'; }],
  ['classList', (el) => { el.classList.add('zz'); return el.className.includes('zz'); }],
  ['dataset', (el) => { el.dataset.foo = 'bar'; return el.getAttribute('data-foo') === 'bar'; }],
  ['closest', (el) => el.querySelector('p').closest('section') !== null],
  ['matches', (el) => el.querySelector('p').matches('p')],
  ['cloneNode(deep)', (el) => el.cloneNode(true).querySelectorAll('p').length === 1],
  ['replaceWith', (el, doc) => { el.querySelector('p').replaceWith(doc.createElement('i')); return !!el.querySelector('i'); }],
  ['remove', (el) => { el.querySelector('p').remove(); return !el.querySelector('p'); }],
  ['insertAdjacentHTML', (el) => { el.insertAdjacentHTML('beforeend', '<b>x</b>'); return !!el.querySelector('b'); }],
  ['createTreeWalker', (el, doc) => { const w = doc.createTreeWalker(el, 0x01); let n = 0; while (w.nextNode()) n++; return n > 0; }],
]) {
  probe(`mutate:${label}`, 'Mutation', label, (a) => {
    const { root, doc, window } = a.parse('<section class="lattice" data-lattice="1"><h1>t</h1><p>a</p></section>');
    try {
      const el = root.querySelector('section');
      if (!el) { closeWindow(window); return { pass: false, detail: 'no section' }; }
      const ok = fn(el, doc); closeWindow(window);
      return { pass: !!ok, detail: ok ? 'ok' : 'returned falsy' };
    } catch (e) { closeWindow(window); return { pass: false, detail: `throws: ${String(e.message).slice(0, 56)}` }; }
  });
}

probe('nodelist-iterable', 'Mutation', 'querySelectorAll returns an ITERABLE NodeList (130 `for...of` sites depend on it)', (a) => {
  // Not a nicety. `lib/` and `tools/` walk query results with `for (const x of ...)` in
  // 130 places, and `withDom` is FAIL-CLOSED — it catches a throw and returns the input
  // unchanged. So on a parser whose NodeList lacks Symbol.iterator, every one of those
  // transforms silently no-ops and the deck still renders, untransformed, tests green.
  const { root, window } = a.parse('<section><h1>a</h1></section><section><h2>b</h2></section>');
  try {
    const nl = root.querySelectorAll('section');
    const iterable = typeof nl?.[Symbol.iterator] === 'function';
    let walked = 0;
    if (iterable) for (const _ of nl) walked++;
    closeWindow(window);
    return { pass: iterable && walked === 2, detail: iterable ? `iterated ${walked}` : 'NodeList has no Symbol.iterator' };
  } catch (e) { closeWindow(window); return { pass: false, detail: `throws: ${String(e.message).slice(0, 56)}` }; }
});

// ── Script execution — 17 Node sites boot the real runtime inside the DOM ───
probe('runs-script', 'Scripting', 'executes a <script> in the parsed document (dist/lattice-runtime.js needs this)', async (a) => {
  if (a.name === 'jsdom' || a.name === 'jsdom30') {
    // Match the whole jsdom FAMILY: an alias installed to compare majors is still jsdom,
    // and an earlier cut of this probe hardcoded the bare name, scoring jsdom30 as
    // script-incapable when the adapter simply was not recognized.
    const { JSDOM } = await import(a.name === 'jsdom30' ? 'jsdom30' : 'jsdom');
    const d = new JSDOM('<!DOCTYPE html><html><body><script>document.body.setAttribute("data-ran","1")</script></body></html>', { runScripts: 'dangerously' });
    const ok = d.window.document.body.getAttribute('data-ran') === '1';
    return { pass: ok, detail: ok ? 'runScripts: dangerously' : 'did not run' };
  }
  if (a.name === 'happy-dom') {
    // FIVE configurations were tried and none ran the script on 20.14.5: a bare
    // `new Window()`, one with `url` set, one with `settings.disableJavaScriptEvaluation:
    // false`, the `Browser`/`newPage` API with `waitUntilComplete()`, and appending a
    // `<script>` element with `textContent` (the idiom the 17 Node sites use). Reported
    // as measured, not as a claim that the library cannot be made to do it.
    const { Window } = await import('happy-dom');
    const w = new Window();
    w.document.write('<!DOCTYPE html><html><body><script>document.body.setAttribute("data-ran","1")</script></body></html>');
    try { await w.happyDOM?.waitUntilComplete?.(); } catch { /* no task queue */ }
    const ok = w.document.body.getAttribute('data-ran') === '1';
    closeWindow(w);
    return { pass: ok, detail: ok ? 'scripts run' : 'did not run in 5 configurations (see source)' };
  }
  return { pass: false, detail: 'no script execution' };
});

// ── CSSOM ───────────────────────────────────────────────────────────────────
probe('cssom:getComputedStyle', 'CSSOM', 'getComputedStyle resolves a declared property', (a) => {
  const { root, window } = a.parse('<style>.k{color:rgb(1,2,3)}</style><section class="k">x</section>');
  try {
    if (!window?.getComputedStyle) { closeWindow(window); return { pass: false, detail: 'not implemented' }; }
    const v = window.getComputedStyle(root.querySelector('.k')).color; closeWindow(window);
    return { pass: !!v, detail: `color=${v || '(empty)'}` };
  } catch (e) { closeWindow(window); return { pass: false, detail: `throws: ${String(e.message).slice(0, 56)}` }; }
});
probe('cssom:styleSheets', 'CSSOM', 'document.styleSheets exposes parsed cssRules', (a) => {
  const { doc, window } = a.parse('<style>.k{color:red}.j{color:blue}</style>');
  try { const n = doc.styleSheets?.[0]?.cssRules?.length; closeWindow(window); return { pass: n === 2, detail: `cssRules=${n}` }; }
  catch (e) { closeWindow(window); return { pass: false, detail: `throws: ${String(e.message).slice(0, 56)}` }; }
});

// ── Parser conformance ──────────────────────────────────────────────────────
probe('html:implicit tbody', 'Parser', 'table rows get the implicit <tbody> the spec requires', (a) => {
  const { root, window } = a.parse('<table><tr><td>1</td></tr></table>');
  const out = root.innerHTML; closeWindow(window);
  return { pass: out.includes('<tbody>'), detail: out.slice(0, 48) };
});
probe('html:template content', 'Parser', '<template> exposes .content as an inert fragment', (a) => {
  if (a.kind === 'parse-only' && !hasSelectors(a)) return { pass: null, detail: 'adapter has no selector engine — not measurable here' };
  const { root, window } = a.parse('<template><p>x</p></template>');
  try { const t = root.querySelector('template'); const ok = !!t?.content?.querySelector('p'); closeWindow(window); return { pass: ok, detail: ok ? 'has .content' : 'no .content' }; }
  catch (e) { closeWindow(window); return { pass: false, detail: `throws: ${String(e.message).slice(0, 56)}` }; }
});
probe('html:style rawtext', 'Parser', 'a </style> inside CSS ends the element — the HARD RULE #22 breakout', (a) => {
  if (a.kind === 'parse-only' && !hasSelectors(a)) return { pass: null, detail: 'adapter has no selector engine — not measurable here' };
  // Not a defect to fix: spec behavior the stylesheet guard is built around. A parser
  // that does NOT break out here would make the guard's own tests read green falsely.
  const { root, window } = a.parse('<style>.a{content:"</style><img src=x onerror=1>"}</style>');
  try { const ok = !!root.querySelector?.('img'); closeWindow(window); return { pass: ok, detail: ok ? 'breaks out (spec-correct)' : 'does NOT break out' }; }
  catch (e) { closeWindow(window); return { pass: false, detail: `throws: ${String(e.message).slice(0, 56)}` }; }
});
probe('html:entities', 'Parser', 'named and numeric entities decode without corruption', (a) => {
  if (a.kind === 'parse-only' && !hasSelectors(a)) return { pass: null, detail: 'adapter has no selector engine — not measurable here' };
  const { root, window } = a.parse('<p>a&amp;b &lt;c&gt; &#169;</p>');
  try { const t = root.querySelector('p').textContent; closeWindow(window); return { pass: t.includes('a&b') && t.includes('<c>') && t.includes('©'), detail: JSON.stringify(t.slice(0, 32)) }; }
  catch (e) { closeWindow(window); return { pass: false, detail: `throws: ${String(e.message).slice(0, 56)}` }; }
});

// ── DOMPurify host — HARD RULE #22 ──────────────────────────────────────────
probe('dompurify:strips a script', 'Sanitizer', 'DOMPurify hosted on this window removes vectors AND keeps benign markup', async (a) => {
  // TWO directions, and the second was missing until domino exposed why it matters.
  // An earlier cut asserted only that the payload did not survive, so a host on which
  // DOMPurify destroys EVERYTHING scored a clean pass — domino returns "" for any
  // markup at all, which is not sanitizing, it is deleting. A sanitizer has to be
  // graded on what it keeps as well as on what it removes.
  const PAYLOAD = '<img src=x onerror=alert(1)><script>steal()</script><svg><foreignObject><p onclick=evil()>x</p></foreignObject></svg><p>ok</p>';
  const BENIGN = '<h1>Title</h1><p>body <strong>bold</strong></p>';
  try {
    const DOMPurify = (await import('dompurify')).default;
    const { window } = a.parse('<p>x</p>');
    if (!window) return { pass: false, detail: 'no window to host DOMPurify' };
    const dp = DOMPurify(window);
    if (!dp?.sanitize) { closeWindow(window); return { pass: false, detail: 'DOMPurify() gave no sanitize' }; }
    const out = dp.sanitize(PAYLOAD);
    const kept = dp.sanitize(BENIGN);
    closeWindow(window);
    const leaks = ['<script', 'onerror', 'onclick', 'steal()'].filter((x) => out.includes(x));
    if (leaks.length) return { pass: false, detail: `LEAKS ${leaks.join(',')} — ${out.slice(0, 40)}` };
    if (kept !== BENIGN) return { pass: false, detail: `DESTROYS benign markup — kept ${JSON.stringify(kept.slice(0, 40))}` };
    return { pass: true, detail: 'removes vectors, keeps benign markup' };
  } catch (e) { return { pass: false, detail: `throws: ${String(e.message).slice(0, 56)}` }; }
});

// ── run ─────────────────────────────────────────────────────────────────────
const refs = {};
if (adapters.jsdom) {
  for (const key of ['slideMedian', 'slideHeaviest', 'deck']) {
    const { root, window } = adapters.jsdom.parse(FIX[key]);
    refs[key] = root.innerHTML; closeWindow(window);
  }
}

const results = {};
for (const p of probes) {
  results[p.id] = {};
  for (const n of names) {
    try { results[p.id][n] = await p.fn(adapters[n], p.refKey ? refs[p.refKey] : undefined); }
    catch (e) { results[p.id][n] = { pass: false, detail: `harness threw: ${String(e.message).slice(0, 56)}` }; }
  }
}

if (process.argv.includes('--json')) {
  const out = { versions: Object.fromEntries(names.map((n) => [n, adapters[n].version])), probes: probes.map((p) => ({ id: p.id, group: p.group, why: p.why })), results };
  writeFileSync(new URL('./correctness.json', import.meta.url), JSON.stringify(out, null, 2));
  console.log('wrote tools/dom-bakeoff/correctness.json');
}

const mark = (r) => (r.pass === null ? '  n/a' : r.pass ? ' PASS' : ' FAIL');
console.log('\n' + '='.repeat(34 + names.length * 18));
console.log('DOM BAKE-OFF · CORRECTNESS   ' + names.map((n) => `${n}@${adapters[n].version}`).join('  '));
if (names.length < 6) console.log('(install the rest of the field: npm i --no-save happy-dom linkedom node-html-parser cheerio)');
console.log('='.repeat(34 + names.length * 18));
let group = '';
for (const p of probes) {
  if (p.group !== group) { group = p.group; console.log(`\n-- ${group} ${'-'.repeat(60 - group.length)}`); console.log('   ' + ''.padEnd(31) + names.map((n) => n.slice(0, 16).padStart(18)).join('')); }
  console.log('   ' + p.id.padEnd(31) + names.map((n) => mark(results[p.id][n]).padStart(18)).join(''));
}
console.log('\n' + '-'.repeat(34 + names.length * 18));
console.log('TOTALS (passed / applicable)');
for (const n of names) {
  const app = probes.filter((p) => results[p.id][n].pass !== null);
  const passed = app.filter((p) => results[p.id][n].pass).length;
  console.log('   ' + n.padEnd(20) + `${passed}/${app.length}`);
}
console.log('\nFailures in detail:');
for (const p of probes) for (const n of names) {
  const r = results[p.id][n];
  if (r.pass === false) console.log(`   ${n.padEnd(18)} ${p.id.padEnd(31)} ${r.detail}`);
}
