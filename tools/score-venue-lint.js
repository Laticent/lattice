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
 *
 * SWEEP — what a lint change does to every committed deck:
 *
 *   node tools/score-venue-lint.js --sweep <base-ref> [--fresh] [--json]
 *
 * Lints every committed example, component gallery and baseline deck (`git ls-files`) at its own
 * size and at huddle, conference and hall, on this tree and on <base-ref> (checked out as a git
 * worktree in the cache, with this checkout's node_modules linked in), and lists every slide whose
 * `capacity-scale` verdict changed. A change at a deck's own size is printed as it is: that is the
 * laptop judgment, which no venue render settles. Every change at a venue is rendered at that venue
 * and classified:
 *
 *   NEW CATCH   newly warned, and the export clips it
 *   NEW FALSE   newly warned, and the export renders it whole
 *   FALSE GONE  no longer warned, and it renders whole
 *   LOST CATCH  no longer warned, and it clips
 *
 * Only the changed decks are rendered, once per venue, through the same cache as the scorer.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
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

/** The decks a sweep lints: every committed example, component gallery and baseline deck. */
function sweepDecks() {
  const r = spawnSync('git', ['ls-files', 'examples/*.md', 'lib/components/*/*/*.gallery.md', 'test/integration/baseline-decks/*.md'], { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ls-files failed: ${r.stderr}`);
  return r.stdout.split('\n').filter(Boolean);
}

/** A checkout of `ref` in the cache, reused while the ref resolves to the same commit. */
function baseTree(ref) {
  const sha = spawnSync('git', ['rev-parse', '--verify', `${ref}^{commit}`], { cwd: ROOT, encoding: 'utf8' });
  if (sha.status !== 0) throw new Error(`Unknown ref '${ref}'.`);
  const dir = path.join(CACHE, `base-${sha.stdout.trim().slice(0, 12)}`);
  if (!fs.existsSync(path.join(dir, 'lib'))) {
    fs.mkdirSync(CACHE, { recursive: true });
    spawnSync('git', ['worktree', 'prune'], { cwd: ROOT });
    const w = spawnSync('git', ['worktree', 'add', '--detach', dir, sha.stdout.trim()], { cwd: ROOT, encoding: 'utf8' });
    if (w.status !== 0) throw new Error(`git worktree add failed: ${w.stderr}`);
    fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
  }
  return dir;
}

/** `{ "<deck>@<venue>": [slides] }` — the slides `capacity-scale` names in each deck, at its own size
 * (`asis`) and forced to each venue, linted by the tree at `root`. Run in a child process so the two
 * trees' modules never share a require cache. */
function lintMap(root, decks) {
  const code = `
    const path = require('node:path'); const fs = require('node:fs');
    const [root, here, list] = process.argv.slice(1);
    const { lintText, buildVocab } = require(path.join(root, 'lib/authoring/lint'));
    const { forceVenue } = require(path.join(here, 'tools/score-venue-lint.js'));
    const vocab = buildVocab();
    const out = {};
    for (const d of JSON.parse(list)) {
      const src = fs.readFileSync(path.join(here, d), 'utf8');
      for (const v of ['asis', 'huddle', 'conference', 'hall']) {
        const f = lintText(v === 'asis' ? src : forceVenue(src, v), { vocab }).filter((x) => x.rule === 'capacity-scale');
        out[d + '@' + v] = [...new Set(f.map((x) => x.slide))].sort((a, b) => a - b);
      }
    }
    process.stdout.write(JSON.stringify(out));`;
  const r = spawnSync(process.execPath, ['-e', code, root, ROOT, JSON.stringify(decks)], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`lint failed in ${root}:\n${r.stderr.trim().split('\n').slice(-6).join('\n')}`);
  return JSON.parse(r.stdout);
}

/** Every changed verdict between `ref` and this tree, venue changes classified by a render. */
function sweep(ref, fresh) {
  const decks = sweepDecks();
  const before = lintMap(baseTree(ref), decks);
  const after = lintMap(ROOT, decks);
  const rows = [];
  for (const key of Object.keys(after)) {
    const a = new Set(before[key] || []);
    const b = new Set(after[key]);
    const added = [...b].filter((x) => !a.has(x));
    const removed = [...a].filter((x) => !b.has(x));
    if (!added.length && !removed.length) continue;
    const [deck, venue] = key.split('@');
    if (venue === 'asis') {
      for (const slide of added) rows.push({ deck, venue, slide, kind: 'OWN SIZE +' });
      for (const slide of removed) rows.push({ deck, venue, slide, kind: 'OWN SIZE -' });
      continue;
    }
    const forced = forceVenue(fs.readFileSync(path.resolve(ROOT, deck), 'utf8'), venue);
    const clip = new Set(clipsOf(forced, `${path.basename(deck, '.md')}-${venue}`, fresh).clipped);
    for (const slide of added) rows.push({ deck, venue, slide, kind: clip.has(slide) ? 'NEW CATCH' : 'NEW FALSE' });
    for (const slide of removed) rows.push({ deck, venue, slide, kind: clip.has(slide) ? 'LOST CATCH' : 'FALSE GONE' });
  }
  return { decks: decks.length, rows };
}

function main(argv) {
  const flag = (n) => argv.includes(n);
  const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
  const venues = opt('--venues', 'laptop,huddle,conference,hall').split(',');
  const decks = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--venues' && argv[i - 1] !== '--sweep');
  const fresh = flag('--fresh');
  if (flag('--sweep')) {
    const ref = opt('--sweep');
    if (!ref || ref.startsWith('--')) throw new Error('--sweep takes a base ref, e.g. --sweep origin/main');
    const { decks: n, rows } = sweep(ref, fresh);
    if (flag('--json')) {
      process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
      return;
    }
    for (const r of rows) console.log(`${r.kind.padEnd(11)} ${r.deck}@${r.venue} #${r.slide}`);
    const count = (k) => rows.filter((r) => r.kind === k).length;
    console.log(`\n${n} decks vs ${ref}: ${count('NEW CATCH')} new catches, ${count('NEW FALSE')} new false, ${count('FALSE GONE')} false gone, ${count('LOST CATCH')} lost catches; at a deck's own size ${count('OWN SIZE +')} added, ${count('OWN SIZE -')} removed`);
    return;
  }
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

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    console.error(`score-venue-lint: ${e.message}`);
    process.exit(1);
  }
}

module.exports = { forceVenue };
