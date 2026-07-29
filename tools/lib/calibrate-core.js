/**
 * calibrate-core — the shared rig behind `calibrate-density` and
 * `calibrate-capacity`.
 *
 * Both tools run the SAME experiment and differ only in which variable moves:
 *
 *   density  — hold the element COUNT, grow the WORDS per element
 *   capacity — hold the words per element, grow the element COUNT
 *
 * Each builds a graded deck (one slide per step), renders it through the real
 * engine, and reads the SAME cell-aware overflow probe the runtime and export
 * use — the "⚠ OVERFLOW … pages X, Y" line. The first step that trips the probe
 * is the geometric break point. The oracle is the shipping renderer, not a
 * model of it, which is the whole reason these numbers can be trusted
 * (2026-06-17-content-capacity-contract.md §4).
 *
 * Keeping the element BUILDERS in one place matters: they encode each
 * component's real authored shape, and a second copy would drift from the first
 * exactly the way the hand-written capacity numbers drifted from reality.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const EMULATOR = path.join(ROOT, 'lattice-emulator.js');

// Deck sizes to calibrate against. The four adaptive FAMILIES (lib/adaptive/
// families.js) are the useful axis — a component's capacity is a property of the
// box shape it reflows into, not of a particular @size — so each family maps to
// a representative registered @size. The legacy landscape/portrait words are
// kept so existing invocations of calibrate-density keep working.
const SIZE_ALIAS = {
  wide: '16:9',
  square: 'square',
  tall: 'portrait',
  strip: 'mobile',
  landscape: '16:9',
  portrait: '9:16',
};

const FAMILIES = ['wide', 'square', 'tall', 'strip'];

const FILLER = ('clear concise board ready signal scored weekly across teams before review normalized into one schema then ranked by confidence recency and strategic weight adjusted each quarter against measured outcomes')
  .split(' ');

/** N prose words drawn from a fixed filler, so a step is reproducible. */
const words = (n) => Array.from({ length: Math.max(1, n) }, (_, i) => FILLER[i % FILLER.length]).join(' ');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Per-element builders: author the component's real shape with the body filled
// to W PROSE words (matching lib/authoring/prose-budgets.js elementWordCounts).
//
// NOTE: a few layouts (split-panel, timeline-list) carry a lead/subtitle
// paragraph in their real sample that these builders omit — so a calibration
// reads a slightly MORE generous ceiling than reality. Harmless while the
// shipped numbers sit editorially below the measured ceiling, but add the lead
// line here if you ever tighten a budget toward the geometry.
const BUILDERS = {
  'cards-grid': (w) => `- ${cap(words(2))}\n  - ${cap(words(w - 2))}.`,
  'cards-stack': (w) => `- ${cap(words(2))}\n  - ${cap(words(w - 2))}.`,
  'verdict-grid': (w) => `- **${cap(words(2))}.**\n  - ${cap(words(w - 2))}.`,
  inventory: (w) => `- **${cap(words(2))}.** ${cap(words(w - 2))}.`,
  actors: (w) => `- ${cap(words(w - 2))} \`Head of Product\`\n  - ${cap(words(2))}.`,
  'list-steps': (w) => `1. ${cap(words(2))}\n   - ${cap(words(w - 2))}.`,
  // A premise row is term / clause / framing question — three parts, matching its
  // skeleton. Added in #1220: premise's capacity was first set from an ad-hoc
  // render, which is the "measured by a script nobody can re-run" shape this repo
  // keeps getting bitten by. With a builder here the number is re-derivable:
  // `node tools/calibrate-capacity.js premise --family tall`.
  premise: (w) => `1. ${cap(words(2))}\n   - ${cap(words(Math.max(1, w - 5)))}.\n   - ${cap(words(3))}?`,
  'q-and-a': (w) => `- ${cap(words(2))}?\n  - ${cap(words(w - 2))}.`,
  agenda: (w) => `1. ${cap(words(w))} \`p.3\``,
  checklist: (w) => `- [x] ${cap(words(w))}`,
  stats: (w) => `1. 73%\n   - ${cap(words(w))}`,
  kpi: (w) => `1. 42%\n   - ${cap(words(w))}`,
  list: (w) => `- ${cap(words(w))}.`,
  glossary: (w) => `- ${cap(words(1))}\n  - ${cap(words(w - 1))}.`,
  'list-criteria': (w) => `1. ${cap(words(2))}\n   - ${cap(words(w - 2))}.`,
  'list-tabular': (w) => `1. ${cap(words(2))}\n   - ${cap(words(w - 2))}.`,
  'timeline-list': (w) => `1. \`2025 Q1\` ${cap(words(2))}\n   - ${cap(words(w - 2))}.`,
  'compare-prose': (w) => `- ${cap(words(2))}\n  - ${cap(words(w - 2))}.`,
  decision: (w) => `- ${cap(words(2))}\n  - ${cap(words(w - 2))}.`,
  'matrix-2x2': (w) => `- **${cap(words(2))}.**\n  - ${cap(words(w - 2))}`,
  'split-panel': (w) => `- ${cap(words(2))}\n  - ${cap(words(w - 2))}.`,
  'split-compare': (w) => `- ${cap(words(2))}\n  - ${cap(words(w - 2))}.`,
  // Legal-family layouts with a countable item axis (added for the square
  // capacity grounding, #1218). Shapes follow each manifest's own skeleton.
  'authority-chain': (w) => `1. ${cap(words(2))}\n   - \`${cap(words(2))}\`\n   - ${cap(words(Math.max(1, w - 4)))}.`,
  'regulatory-update': (w) => `1. ${cap(words(2))}\n   - \`${cap(words(2))}\`\n   - ${cap(words(Math.max(1, w - 6)))}.\n   - \`Effective Mar 2026\``,
  'statute-stack': (w) => `- ${cap(words(1))} \`${cap(words(2))}\`\n  - ${cap(words(Math.max(1, w - 5)))}.\n  - \`${cap(words(2))}\``,
  pricing: (w) => `- ${cap(words(1))} \`$49 / mo\`\n  - [x] ${cap(words(2))}\n  - ${cap(words(Math.max(1, w - 4)))}.`,
};

// Square-family components this rig deliberately does NOT calibrate, and why.
// Logged rather than silently skipped: a count calibration needs a repeatable
// element AND no fixed chrome the builder can't express, or the measured
// ceiling is a fiction.
//
//   citation-card  — atomic. One citation per slide; there is no count axis.
//   logo-wall      — elements are image assets; a synthetic deck would measure
//                    broken-image boxes, not logos.
//   math           — the equation is fixed chrome that dominates the box; a deck
//                    of bare legend lines measures the wrong thing.
//   content        — same: the lead paragraph is the slide, the bullets optional.
// Shape: { name → why }. Printed by `calibrate-capacity --all` so the dropped
// coverage is stated, not implied by an absence — the list existed as an inert
// export for a while, reading like a decision while enforcing nothing.
const NOT_COUNT_CALIBRATABLE = Object.freeze({
  'citation-card': 'atomic — one citation per slide, so there is no count axis',
  'logo-wall': 'elements are image assets; a synthetic deck measures broken-image boxes, not logos',
  math: 'the equation is fixed chrome that dominates the box; a deck of bare legend lines measures the wrong thing',
  content: 'the lead paragraph IS the slide and the bullets are optional — same problem',
});

/** The component's manifest, found across the bucket directories. */
function findManifest(name) {
  const buckets = fs.readdirSync(path.join(ROOT, 'lib', 'components'));
  for (const b of buckets) {
    const p = path.join(ROOT, 'lib', 'components', b, name, `${name}.manifest.json`);
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  }
  return null;
}

/**
 * A graded deck: one slide per step, page N ↔ step N.
 *
 * Deliberately `autosplit: off` — the deck must not re-paginate, or page N would
 * stop mapping to step N. This used to rely on the flag being off by DEFAULT, which
 * stopped being true in #1234: split is now on unless a deck opts out, so the
 * measurement rig has to opt out explicitly or a graded step would silently become
 * several pages and every ceiling would read wrong. Front matter emits no
 * `section[data-lattice-slide]`, so the emulator's `slide: i+1` aligns to
 * steps[i].
 */
function gradedDeck({ comp, size, steps, slideFor }) {
  const slides = steps.map((step, i) => {
    const heading = `## Calibration step ${i + 1} — ${slideFor(step).label}.`;
    return `<!-- _class: ${comp} -->\n\n${heading}\n\n${slideFor(step).body}`;
  });
  return `---\nsize: ${size}\nautosplit: off\n---\n\n${slides.join('\n\n---\n\n')}\n`;
}

/**
 * Render a deck and return the set of 1-based page numbers the overflow probe
 * flagged. Throws only when the render itself failed for a reason other than
 * overflow (the probe's own non-zero exit is the signal we came for).
 */
function renderProbe(deck, label) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'calibrate-'));
  const src = path.join(tmpDir, `${label}.md`);
  const out = path.join(tmpDir, `${label}.pdf`);
  fs.writeFileSync(src, deck);
  try {
    const r = spawnSync('node', [EMULATOR, src, out, '-q'], { cwd: ROOT, encoding: 'utf8', timeout: 180000 });
    const log = `${r.stdout || ''}\n${r.stderr || ''}`;
    if (r.status !== 0 && !/OVERFLOW/.test(log)) {
      const tail = log.trim().split('\n').slice(-8).join('\n');
      throw new Error(`Render failed for '${label}' (exit ${r.status}).\n${tail}`);
    }
    const m = log.match(/OVERFLOW[\s\S]*?pages?\s+([\d,\s]+)/i);
    const pages = m ? m[1].split(',').map((s) => parseInt(s.trim(), 10)).filter(Boolean) : [];
    return { overflowed: new Set(pages), log };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

module.exports = { ROOT, EMULATOR, SIZE_ALIAS, FAMILIES, BUILDERS, NOT_COUNT_CALIBRATABLE, words, cap, findManifest, gradedDeck, renderProbe };
