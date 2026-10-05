#!/usr/bin/env node
/**
 * score-venue-lint — score lint's `capacity-scale` warnings against the export's clips, per venue.
 *
 * It answers how well lint predicts what clips on real decks.
 *
 * For each deck and each venue it forces `venue: <v>` into the front matter, renders the deck
 * through the real export (`renderProbe`, the same emulator the CLI runs) and reads the pages the
 * overflow probe reports, then lints the same text and reads the slides `capacity-scale` warns
 * on. Each slide lands in one bucket:
 *
 *   right   lint warns and the export clips it
 *   false   lint warns and the export renders it whole
 *   missed  the export clips it and lint is silent
 *
 * It also lists DESIGNED-SIZE claims — a finding that says the slide clips "even at the designed
 * size" — on a slide the LAPTOP export renders whole. That is the one claim lint must never make
 * falsely (followups.d/2361-p2-venue-lint-accuracy-on-real-decks.md).
 *
 * A clip is the OVERFLOW line only, the scorer every earlier round used. A box that clips its
 * own content (CONTENT CLIPPED) is printed apart, because the same line also reports an
 * ellipsis on a label at any size.
 *
 * Renders are cached in `.scratch/score-venue-lint/`, keyed on the forced deck text only, so pass
 * `--fresh` after a CSS or engine change. A lint-only change (the usual loop) re-scores in seconds.
 *
 * Usage:
 *   node tools/score-venue-lint.js [deck.md ...] [--venues laptop,huddle,conference,hall]
 *                                  [--fresh] [--json] [--detail]
 *
 * With no deck it scores the default corpus: test/integration/baseline-decks/gallery.md and the
 * three example talks the follow-up scored (bloom-engineering-journey, seven-steps-problem-to-code,
 * kaizen-craftsmanship). `--detail` prints each wrong slide with its component.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { ROOT, renderProbe } = require('./lib/calibrate-core.js');
const { lintText, buildVocab } = require('../lib/authoring/lint');
const { splitTopLevel } = require('../lib/authoring/slide-split');

const DEFAULT_DECKS = [
  'test/integration/baseline-decks/gallery.md',
  'examples/bloom-engineering-journey.md',
  'examples/seven-steps-problem-to-code.md',
  'examples/kaizen-craftsmanship.md',
];
const CACHE = path.join(ROOT, '.scratch', 'score-venue-lint');

/** The deck's text with `venue: <v>` set in its front matter (added when absent). */
function forceVenue(text, venue) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return `---\nvenue: ${venue}\n---\n\n${text}`;
  const fm = /^\s*venue:.*$/m.test(m[1]) ? m[1].replace(/^\s*venue:.*$/m, `venue: ${venue}`) : `${m[1]}\nvenue: ${venue}`;
  return `---\n${fm}\n---${text.slice(m[0].length)}`;
}

/** The pages the export clips, cached on the forced text. */
function clipsOf(text, label, fresh) {
  fs.mkdirSync(CACHE, { recursive: true });
  const key = crypto.createHash('sha1').update(text).digest('hex').slice(0, 16);
  const file = path.join(CACHE, `${label}-${key}.json`);
  if (!fresh && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const r = renderProbe(text, label);
  const box = (r.log.match(/⚠ CONTENT CLIPPED[^\n]*?pages?\s+([\d,\s]+)/) || ['', ''])[1]
    .split(',').map((s) => parseInt(s, 10)).filter(Boolean);
  const out = { clipped: [...r.clipped].sort((a, b) => a - b), box };
  fs.writeFileSync(file, JSON.stringify(out));
  return out;
}

/** The class tokens each slide carries, numbered the way lint numbers slides (`splitTopLevel`,
 * the front matter's two chunks skipped), for the detail list. */
function componentsBySlide(text, vocab) {
  const out = {};
  const fm = /^---\r?\n[\s\S]*?\r?\n---/.test(text) ? 2 : 0;
  splitTopLevel(text).forEach((s, idx) => {
    if (idx < fm) return;
    const m = s.match(/<!--\s*_?class:\s*([^>]*?)-->/);
    const toks = m ? m[1].trim().split(/\s+/) : [];
    const comp = toks.filter((t) => vocab.names.has(t)).join(' ') || 'content';
    const rest = toks.filter((t) => !vocab.names.has(t));
    out[idx - fm + 1] = rest.length ? `${comp} [${rest.join(' ')}]` : comp;
  });
  return out;
}

function score(deck, venue, vocab, fresh) {
  const forced = forceVenue(fs.readFileSync(path.resolve(ROOT, deck), 'utf8'), venue);
  const label = `${path.basename(deck, '.md')}-${venue}`;
  const { clipped, box } = clipsOf(forced, label, fresh);
  const findings = lintText(forced, { vocab }).filter((f) => f.rule === 'capacity-scale');
  const warned = [...new Set(findings.map((f) => f.slide))].sort((a, b) => a - b);
  const designed = [...new Set(findings.filter((f) => /even at the designed size|at the designed size; this slide/.test(f.message || '')).map((f) => f.slide))];
  const clip = new Set(clipped);
  const warn = new Set(warned);
  return {
    deck, venue, clipped, box, warned, designed,
    right: warned.filter((s) => clip.has(s)),
    false: warned.filter((s) => !clip.has(s)),
    missed: clipped.filter((s) => !warn.has(s)),
    comps: componentsBySlide(forced, vocab),
  };
}

function main(argv) {
  const flag = (n) => argv.includes(n);
  const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
  const venues = opt('--venues', 'laptop,huddle,conference,hall').split(',');
  const skip = new Set([opt('--venues')]);
  const decks = argv.filter((a, i) => !a.startsWith('--') && !skip.has(a) && argv[i - 1] !== '--venues');
  const fresh = flag('--fresh');
  const vocab = buildVocab();
  const rows = [];
  for (const deck of decks.length ? decks : DEFAULT_DECKS) for (const v of venues) rows.push(score(deck, v, vocab, fresh));
  if (flag('--json')) {
    process.stdout.write(`${JSON.stringify(rows.map(({ comps, ...r }) => r), null, 2)}\n`);
    return;
  }
  const lap = new Map(rows.filter((r) => r.venue === 'laptop').map((r) => [r.deck, new Set(r.clipped)]));
  console.log('deck                                   venue        clip  right false missed  (box)');
  const tot = {};
  for (const r of rows) {
    const t = (tot[r.venue] ||= { clip: 0, right: 0, false: 0, missed: 0 });
    t.clip += r.clipped.length; t.right += r.right.length; t.false += r.false.length; t.missed += r.missed.length;
    console.log(`${path.basename(r.deck).padEnd(38)} ${r.venue.padEnd(11)} ${String(r.clipped.length).padStart(5)} ${String(r.right.length).padStart(6)} ${String(r.false.length).padStart(5)} ${String(r.missed.length).padStart(6)}  (${r.box.length})`);
    if (flag('--detail')) {
      for (const s of r.false) console.log(`    false  ${String(s).padStart(3)}  ${r.comps[s]}`);
      for (const s of r.missed) console.log(`    missed ${String(s).padStart(3)}  ${r.comps[s]}`);
    }
    const lapClips = lap.get(r.deck);
    const bad = lapClips ? r.designed.filter((s) => !lapClips.has(s)) : [];
    if (bad.length) console.log(`    ✗ designed-size claim on a slide the laptop export renders whole: ${bad.join(', ')}`);
  }
  console.log('\nsummed, right/false/missed:');
  for (const [v, t] of Object.entries(tot)) console.log(`  ${v.padEnd(11)} ${t.right}/${t.false}/${t.missed}   (clipped ${t.clip})`);
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { forceVenue };
