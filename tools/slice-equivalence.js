#!/usr/bin/env node
/**
 * Slice/deck equivalence — the instrument for structural gating
 * (engineering/decisions/2026-07-30-preview-deck-context-and-render-cost.md §5).
 *
 * THE QUESTION. The preview shows one slide. To render it alone and still get what the full deck
 * would give it, you can hand over each derived answer one at a time (what the page number and the
 * section number do today) or reconstruct the CONTEXT — the running directives an earlier slide set
 * and this one inherits — and let the engine derive everything itself. Only the second generalizes:
 * a running `header:` is text, not a number, so there is no count to hand over.
 *
 * This measures how far the second route gets: for every slide of every committed deck, render it
 * alone behind a synthesized prelude and compare against that slide's section from the whole-deck
 * render.
 *
 * ON-DEMAND, NOT A CI GATE — the same shape as `bench` and `quality`:
 *   npm run equiv          report the current reconciliation rate + the biggest residual
 *   npm run equiv:bless    write test/benchmark/slice-equivalence.json
 *   npm run equiv:check    compare against it and fail on a real drop
 *
 * WHY IT IS COMMITTED AT ALL. §5's original measurement lived in `.scratch/` and was lost, so when
 * its numbers were later questioned nobody could re-examine the residual — it was restated three
 * times (~99%, 92.6%, 96.5%) as successive passes found bugs in the probe rather than the engine. A
 * measurement that can be wrong by tens of points and still look plausible is worth keeping and
 * worth cataloguing, but it is NOT a test: it has no production consumer until the synthesizer
 * ships, so a drop here means "the prototype moved", not "a user broke".
 */
const fs = require('node:fs');
const path = require('node:path');
const { createEngine } = require('../lib/engine/index.js');
const { KNOWN_DIRECTIVES, FLAG_DIRECTIVES } = require('../lib/engine/directives.js');

const ROOT = path.join(__dirname, '..');
const BASELINE = path.join(ROOT, 'test/benchmark/slice-equivalence.json');
/** How far the rate may fall before `--check` fails. Corpus edits move it a little. */
const BAND = 1.5;

/** Fence-aware slide split — a `---` inside a fenced block is not a boundary. */
function splitSlides(body) {
  const out = [[]];
  let fence = null;
  for (const line of body.split('\n')) {
    const m = /^[ \t]*(```|~~~)/.exec(line);
    if (m) fence = fence === m[1] ? null : (fence ?? m[1]);
    if (!fence && /^-{3,}[ \t]*$/.test(line)) { out.push([]); continue; }
    out[out.length - 1].push(line);
  }
  return out.map((l) => l.join('\n'));
}

/**
 * The running-global directives in force when slide `k` renders. A directive comment WITHOUT the
 * `_` spot prefix applies to its slide and every one after, so a slice loses what it inherited.
 *
 * Keyed on the ENGINE's own vocabulary. §5 records that treating any `name: value` comment as a
 * running global injected slide-local `describe:` notes into every later slide — 32 mismatches that
 * were the probe's fault, not the engine's.
 */
function synthesizePrelude(slides, k) {
  const running = new Map();
  for (let i = 0; i < k; i++) {
    // `key: value` AND the bare flag form. `build`/`debug`/`lens` are legal written bare
    // (`<!-- build -->` ≡ `build:` with an empty value — see FLAG_DIRECTIVES in
    // lib/engine/directives.js), and missing them under-synthesizes the prelude, which reports a
    // mismatch caused by this file rather than by the engine. Found in review.
    for (const m of slides[i].matchAll(/<!--\s*([A-Za-z][\w]*)\s*(?::\s*([\s\S]*?))?-->/g)) {
      const [, key, value] = m;
      if (value === undefined) { if (FLAG_DIRECTIVES.has(key)) running.set(key, ''); continue; }
      if (KNOWN_DIRECTIVES.has(key)) running.set(key, value.trim());
    }
  }
  return [...running].map(([k2, v]) => (v === '' ? `<!-- ${k2} -->` : `<!-- ${k2}: ${v} -->`)).join('\n');
}

const sectionsOf = (html) => html.match(/<section[\s\S]*?<\/section>/g) || [];

/**
 * Neutralize differences that are already-shipped repairs or documented instrument artifacts. Each
 * one flatters the number, so each is named:
 *   - positional `id` + pagination attr/span — supplied today (#1272)
 *   - progress rail — supplied today (#1280), but not by this harness
 *   - inter-block whitespace — §5's own artifact: injecting a prelude perturbs markdown block
 *     adjacency, so the body re-parses tight-vs-loose. §5 leaves this owed to a better instrument.
 */
const normalize = (s) =>
  s
    .replace(/\sid="\d+"/g, '')
    .replace(/data-lattice-pagination(?:-total)?="\d+"/g, '')
    .replace(/(<span class="lat-pagination">)\d+(<\/span>)/g, '$1$2')
    .replace(/<div class="tile-progress"[\s\S]*?<\/div>/g, '')
    .replace(/>\s+</g, '><')
    .trim();

/** Why a slide failed to reconcile — the buckets map to §5's repair-cascade rows. */
function classify(got, want) {
  const strip = (s) => s.replace(/\blat-svg[td]-\d+\b/g, '').replace(/\bcat-\d\b/g, '');
  if (strip(got) === strip(want)) return 'generated ids / cat-N (seedRenderIds row)';
  if (/tile-watermark/.test(got) !== /tile-watermark/.test(want)) return 'watermark glyph';
  return 'unclassified';
}

function measure() {
  const engine = createEngine();
  // RECURSIVE. `examples/` has real decks in subfolders (token-contrast/, chart-theme-gallery/);
  // a flat read silently measured 111 of 125 and called the result "the corpus". Found in review.
  const walk = (d) =>
    fs.existsSync(d)
      ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
          e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)],
        )
      : [];
  const files = [...walk(path.join(ROOT, 'examples')), ...walk(path.join(ROOT, 'test/integration/baseline-decks'))]
    .filter((f) => f.endsWith('.md'));

  let slides = 0;
  let matched = 0;
  const byDeck = new Map();
  const byCause = new Map();

  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    const fm = (/^---\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n/.exec(src) || [''])[0];
    const chunks = splitSlides(src.slice(fm.length));
    let full;
    try { full = sectionsOf(engine.render(src, 'lattice').html); } catch { continue; }
    // 1→N expanders (`_focusSteps`, `split: headings`) have no 1:1 slide↔section pairing (§5).
    if (full.length !== chunks.length) continue;

    chunks.forEach((chunk, k) => {
      const prelude = synthesizePrelude(chunks, k);
      let got;
      try {
        got = sectionsOf(engine.render(`${fm}${prelude ? `${prelude}\n\n` : ''}${chunk}`, 'lattice').html)[0] ?? '';
      } catch { got = ''; }
      slides += 1;
      const a = normalize(got);
      const b = normalize(full[k]);
      if (a === b) { matched += 1; return; }
      const name = path.basename(file);
      byDeck.set(name, (byDeck.get(name) || 0) + 1);
      const cause = classify(a, b);
      byCause.set(cause, (byCause.get(cause) || 0) + 1);
    });
  }
  return { slides, matched, rate: +((matched / slides) * 100).toFixed(1), byDeck, byCause };
}

const r = measure();
const mode = process.argv[2] || process.argv.find((a) => a.startsWith('--'));

console.log(`\nslice/deck equivalence — prelude only: ${r.matched}/${r.slides} slides (${r.rate}%)\n`);
console.log('residual by cause:');
for (const [c, n] of [...r.byCause].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${c}`);
console.log('\nresidual by deck (top 8):');
for (const [d, n] of [...r.byDeck].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`  ${String(n).padStart(4)}  ${d}`);

if (mode === '--bless') {
  fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
  fs.writeFileSync(BASELINE, `${JSON.stringify({ slides: r.slides, matched: r.matched, rate: r.rate }, null, 2)}\n`);
  console.log(`\nblessed → ${path.relative(ROOT, BASELINE)}`);
} else if (mode === '--check') {
  if (!fs.existsSync(BASELINE)) { console.error('\nno baseline — run `npm run equiv:bless`'); process.exit(1); }
  const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  const delta = +(r.rate - base.rate).toFixed(1);
  console.log(`\nbaseline ${base.rate}%  ->  now ${r.rate}%  (${delta >= 0 ? '+' : ''}${delta})`);
  if (delta < -BAND) {
    console.error(`FAIL — dropped more than ${BAND} points. Re-bless only with a reason.`);
    process.exit(1);
  }
  console.log('within band.');
}
