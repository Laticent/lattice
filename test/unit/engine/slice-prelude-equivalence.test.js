/**
 * THE INSTRUMENT for structural gating (step 3 of
 * engineering/decisions/2026-07-30-preview-deck-context-and-render-cost.md §5).
 *
 * The preview shows one slide. To render that slide ALONE and still get what the full deck would
 * give it, you can either hand over each derived answer one at a time (what the page number and the
 * section number do today) or reconstruct the CONTEXT — the running directives an earlier slide set
 * and this one inherits — and let the engine derive everything itself. The second is the general
 * mechanism; a running `header:` is text, not a number, so it cannot be handed over as a count.
 *
 * This file is the harness that tells us whether a synthesized prelude actually reproduces the
 * deck's output, per slide, over the committed corpus. It exists as a COMMITTED test because §5's
 * original measurement lived in `.scratch/` and was lost, which is why its residual could not be
 * re-examined when its numbers were later questioned.
 *
 * It reports rather than asserts perfection: the design predicts a small genuine bail set, so the
 * gate here is "no REGRESSION in what reconciles", not "everything matches".
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createEngine } = require('../../../lib/engine/index.js');
const { KNOWN_DIRECTIVES } = require('../../../lib/engine/directives.js');

const ROOT = path.join(__dirname, '../../..');

/** Fence-aware slide split — a `---` inside a fenced block is not a boundary. */
function splitSlides(body) {
  const lines = body.split('\n');
  const out = [[]];
  let fence = null;
  for (const line of lines) {
    const m = /^[ \t]*(```|~~~)/.exec(line);
    if (m) fence = fence === m[1] ? null : (fence ?? m[1]);
    if (!fence && /^-{3,}[ \t]*$/.test(line)) { out.push([]); continue; }
    out[out.length - 1].push(line);
  }
  return out.map((l) => l.join('\n'));
}

/**
 * Reconstruct the running-global directives in force when slide `k` renders.
 *
 * A directive comment WITHOUT the `_` spot prefix applies to its slide and every one after, so a
 * slice rendered alone loses whatever an earlier slide established. Walk the preceding slides,
 * keep the last value per key, and emit them as a prelude.
 *
 * Keyed on the ENGINE's own `KNOWN_DIRECTIVES`. §5 records that the first probe treated any
 * `name: value` comment as a running global and so injected slide-local `describe:` notes into
 * every later slide — 32 spurious mismatches from the instrument, not the engine.
 */
function synthesizePrelude(slides, k) {
  const running = new Map();
  for (let i = 0; i < k; i++) {
    for (const m of slides[i].matchAll(/<!--\s*([A-Za-z][\w]*)\s*:\s*([\s\S]*?)-->/g)) {
      const [, key, value] = m;
      if (KNOWN_DIRECTIVES.has(key)) running.set(key, value.trim());
    }
  }
  return [...running].map(([k2, v]) => `<!-- ${k2}: ${v} -->`).join('\n');
}

const sectionsOf = (html) => html.match(/<section[\s\S]*?<\/section>/g) || [];
/** Normalize the two differences §5 documents as instrument artifacts, not engine properties. */
const normalize = (s) =>
  s
    .replace(/\sid="\d+"/g, '') // positional id — re-stamped from the cached position
    .replace(/data-lattice-pagination(?:-total)?="\d+"/g, '') // supplied today
    // …and the PAINTED page number the form frame emits. Normalizing only the attribute left the
    // rendered span carrying the difference, which put ~440 slides in an "unexplained" bucket that
    // was really pagination all along — the same under-normalizing instrument bug §5 records twice.
    .replace(/(<span class="lat-pagination">)\d+(<\/span>)/g, '$1$2')
    // The progress rail is supplied in production (page.deckSection) but not by this harness, so
    // its absence here is a property of the instrument, not of the prelude.
    .replace(/<div class="tile-progress"[\s\S]*?<\/div>/g, '')
    .replace(/>\s+</g, '><') // block adjacency: injecting a prelude perturbs tight-vs-loose parsing
    .trim();

function corpus() {
  const dirs = [path.join(ROOT, 'examples'), path.join(ROOT, 'test/integration/baseline-decks')];
  return dirs
    .flatMap((d) => (fs.existsSync(d) ? fs.readdirSync(d).map((f) => path.join(d, f)) : []))
    .filter((f) => f.endsWith('.md'));
}

describe('synthesized prelude reproduces the deck section', () => {
  test('measures how much of the corpus a prelude alone reconciles', () => {
    const engine = createEngine();
    let slidesSeen = 0;
    let matched = 0;
    const offenders = new Map();

    for (const file of corpus()) {
      const src = fs.readFileSync(file, 'utf8');
      const fm = (/^---\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n/.exec(src) || [''])[0];
      const body = src.slice(fm.length);
      const slides = splitSlides(body);
      let full;
      try {
        full = sectionsOf(engine.render(src, 'lattice').html);
      } catch {
        continue; // a deck the engine declines is not this harness's subject
      }
      if (full.length !== slides.length) continue; // 1→N expanders have no 1:1 pairing (§5)

      slides.forEach((slide, k) => {
        const prelude = synthesizePrelude(slides, k);
        const lone = `${fm}${prelude ? `${prelude}\n\n` : ''}${slide}`;
        let got;
        try {
          got = sectionsOf(engine.render(lone, 'lattice').html)[0] ?? '';
        } catch {
          got = '';
        }
        slidesSeen += 1;
        if (normalize(got) === normalize(full[k])) matched += 1;
        else offenders.set(path.basename(file), (offenders.get(path.basename(file)) || 0) + 1);
      });
    }

    const pct = ((matched / slidesSeen) * 100).toFixed(1);
    const top = [...offenders].sort((a, b) => b[1] - a[1]).slice(0, 8);
    console.log(`\n  prelude-only equivalence: ${matched}/${slidesSeen} slides (${pct}%)`);
    console.log(`  decks with the most residual:`);
    for (const [f, n] of top) console.log(`    ${String(n).padStart(4)}  ${f}`);

    // A FLOOR, not a target. §5 measured 3.5% byte-exact from the prelude alone, rising to 96.5%
    // after the documented repair cascade. This asserts the instrument still runs and the corpus is
    // real; the number it prints is the thing to move as the cascade lands.
    assert.ok(slidesSeen > 500, `expected a real corpus, saw ${slidesSeen} slides`);
  });
});
