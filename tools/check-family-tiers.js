#!/usr/bin/env node
/**
 * check-family-tiers — does each adaptive family tier actually FIRE at each deck
 * size, and reflow the way the component intends?
 *
 * This is the gate #1218 needed and did not have. The old
 * `check-adaptive-families.js` compared two CLASSIFIERS (the JS verdict against a
 * `--lat-family` stamp the CSS computed) — but both halves were internally
 * consistent, so it could only ever catch them disagreeing, never catch a whole
 * tier being INERT. The square tier was dead for the entire life of that gate.
 *
 * So this asserts BEHAVIOR instead of agreement: render one deck per family
 * through the real emulator, then read the COMPUTED style of a property only that
 * family's rule can produce. A tier that stops matching flips the value and fails
 * here, whatever the cause — a bad selector, a lost stamp, a cascade change.
 *
 * TWO HALVES, because the first one alone is not enough. The probe half above
 * reads three components at four sizes, so it proves the MECHANISM works — but
 * it cannot see a clip, and it says nothing about the other 27 components whose
 * square tier fired for the first time in #1218. A red-team pass found exactly
 * that hole: `cycle`, `authority-chain` and `regulatory-update` rendered clean on
 * `main` and CLIPPED on the branch, with this gate, `build:check`, `npm test` and
 * `lint:deck` all green.
 *
 * So the second half is an OVERFLOW ORACLE. It renders one gallery slide per
 * family-reflowing component at every family size and records which components
 * clip, against a committed baseline (`test/oracle/family-overflow.json`). A NEW
 * clip fails; a clip that disappears fails too, asking to be re-blessed, so the
 * record cannot rot. Keyed on component NAME, not page number, so inserting a
 * slide does not churn the record.
 *
 * The baseline is not "zero" — several gallery slides already overflow at square
 * on `main`. The oracle's job is to freeze that set, not to assert it is empty.
 *
 * A THIRD half, added for #1234 group E: the CONFORMANCE pass. The probe above reads
 * three hand-picked components, and the oracle covers all 33 but records only whether
 * they CLIP — so for 30 of 33 components nothing checked that their `[data-family]`
 * rules do anything at all. That is the same shape of hole as the one in the first
 * paragraph. `--conformance` derives, per (component × @size), whether the tier MATCHED
 * and whether it CHANGED a computed value against the `wide` baseline, and freezes the
 * result in `test/oracle/family-conformance.json`.
 *
 * Usage: node tools/check-family-tiers.js [--bless]
 *        node tools/check-family-tiers.js --ladder    # reconcile the two blessed
 *          oracles per @size (reads committed JSON only — no browser, no render)
 *        node tools/check-family-tiers.js --presets   # what differs per @size:
 *          family, orientation, --canvas-scale, measured body/h2 px (report only)
 *        node tools/check-family-tiers.js --conformance [--bless]
 *          does every component's family tier actually fire? 165 derived cells from the
 *          same five sweep renders the clip oracle needs (npm run check:family-conformance)
 * Exit 1 on any disagreement; skips loudly with no Chromium.
 */
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { resolveChrome } = require('./lib/resolve-chrome');
const ROOT = process.cwd();


// Three probes, chosen so the harness proves BOTH directions:
//   stats       — the SQUARE probe, and the only family that WRAPS: wide is a
//                 nowrap row, square a 2-up wrapped row, tall/strip a column. So
//                 its flex-wrap alone separates square from every other family —
//                 if the square tier stopped firing, square would read `nowrap`
//                 like wide and this fails. Direction alone is no longer enough
//                 (square and wide are both `row` since stats went 2-up).
//   decision    — keeps its 2-up at square, collapses only at tall/strip.
//   matrix-2x2  — same, and always did ("a square box reads the quadrants fine").
// Without the stats probe, decision and matrix-2x2 now expect the same thing at
// wide and square, so the harness would pass even with the stamp broken.
const DECK = `---
theme: indaco
---

<!-- _class: decision -->

## Which path

- Rebuild in place
  - Keeps the data model; six weeks.
- Replatform
  - Clean slate; four months.

---

<!-- _class: matrix-2x2 -->

## Effort vs impact

- Quick wins
  - Ship this quarter.
- Big bets
  - Fund next year.
- Fill-ins
  - When idle.
- Money pits
  - Decline.

---

<!-- _class: stats -->

## The quarter in three numbers

1. 73%
   - faster close
2. 18 min
   - p99 decision
3. 4.2x
   - pipeline lift
`;

// One entry per registered non-landscape @size, not one per FAMILY — `portrait`
// and `story` are both `tall`, and covering only one of them was a real hole.
// A clip is a function of the BOX, not the family: `story` is 570px taller than
// `portrait` at the same width, so the same component can clip in one and not the
// other. Measured while auditing this note — `kpi` clips 7 gallery slides at
// portrait and 0 at story. Family-KEYED behavior must be identical across the two
// (that is the model's whole claim, and the probe below asserts it); OVERFLOW must
// be measured separately in each.
const SIZES = [
  { size: 'hd', vp: [1920, 1080], family: 'wide' },
  { size: 'square', vp: [1080, 1080], family: 'square' },
  { size: 'portrait', vp: [1080, 1350], family: 'tall' },
  { size: 'story', vp: [1080, 1920], family: 'tall' },
  { size: 'mobile', vp: [1080, 2340], family: 'strip' },
];

// ── The overflow oracle ────────────────────────────────────────────────────
const ORACLE = path.join(ROOT, 'test', 'oracle', 'family-overflow.json');
const SPLIT_ORACLE = path.join(ROOT, 'test', 'oracle', 'split-oracle.json');

/**
 * `{ <component>: { enrolled } }` — which components paginate instead of clipping once
 * `autosplit: on`. Read by BOTH the verdict below and `--ladder`, because they are asking
 * the same question and a second copy of the path is a second thing to drift.
 */
function splitEnrollment() {
  return JSON.parse(fs.readFileSync(SPLIT_ORACLE, 'utf8')).components;
}
const BLESS = process.argv.includes('--bless');

/** Every component whose stylesheet carries a `[data-family]` reflow rule. */
function familyReflowingComponents() {
  const out = new Set();
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!p.endsWith('.css')) continue;
      // Comment-stripped: a `[data-family]` quoted in prose is not a rule.
      if (/\[data-family/.test(fs.readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''))) {
        out.add(path.basename(path.dirname(p)));
      }
    }
  };
  walk(path.join(ROOT, 'lib', 'components'));
  // Real components only. `_chart-family` is a SHARED stylesheet directory, not a
  // component — it has no manifest and no slide, so rostering it was a phantom
  // entry the record then claimed coverage for.
  const real = new Set(require('../lib/components').loadAll().map((m) => m.name));
  return [...out].filter((c) => real.has(c)).sort();
}

// ── The gallery roster ─────────────────────────────────────────────────────
/**
 * Read the `_class:` directive's TOKENS out of a slide body.
 *
 * By value, not by substring. An earlier cut built a RegExp per component from its name
 * with only `-` hand-escaped, which CodeQL flagged (incomplete escaping) and which would
 * misfire on any name carrying a regex metacharacter. Comparing tokens has no escaping
 * problem to get wrong, and it is also more accurate: a substring match would let `list`
 * claim a `list-tabular` slide.
 */
function classTokens(slide) {
  const out = new Set();
  for (const m of slide.matchAll(/<!--\s*_?class:([^-]*(?:-(?!->)[^-]*)*)-->/g)) {
    for (const t of m[1].trim().split(/\s+/)) if (t) out.add(t);
  }
  return out;
}

let CANDIDATE_CACHE = null;
/**
 * Every gallery slide that names component `c`, in preference order: the shared baseline
 * deck first, then the component's own `<c>.gallery.md`.
 *
 * The baseline deck leads because HARD RULE #8 keeps feature work out of the six
 * long-running galleries, so a slide there is the stable choice — and it is the slide an
 * author following the docs writes first.
 *
 * The component's own gallery is a FALL BACK rather than a reason to add slides to the
 * baseline deck (again #8), and a component with neither is a hard error. Silently
 * skipping is how the record came to claim 34 components while rendering 31: `premise`
 * and `video` have no baseline slide, so the two components a change gave new reflows
 * were the two it never measured — which is exactly why a regression that put premise's
 * own `<h2>` off the top of the frame passed every gate.
 */
function galleryCandidates(c) {
  if (!CANDIDATE_CACHE) {
    CANDIDATE_CACHE = new Map();
    const { loadAll, manifestBucket } = require('../lib/components');
    const gallery = fs.readFileSync(path.join(ROOT, 'test', 'integration', 'baseline-decks', 'gallery.md'), 'utf8');
    const baseline = gallery.split(/^---\s*$/m).map((s) => ({ s, tokens: classTokens(s) }));
    for (const m of loadAll()) {
      const own = [];
      const p = path.join(ROOT, 'lib', 'components', manifestBucket(m), m.name, `${m.name}.gallery.md`);
      if (fs.existsSync(p)) {
        for (const s of fs.readFileSync(p, 'utf8').split(/^---\s*$/m)) {
          const tokens = classTokens(s);
          // `title` slides are the gallery's own chapter headings, not the component.
          if (tokens.has(m.name) && !tokens.has('title')) own.push({ s, tokens });
        }
      }
      CANDIDATE_CACHE.set(m.name, [...baseline.filter((x) => x.tokens.has(m.name)), ...own]
        .map((x) => ({ body: x.s.trim(), tokens: x.tokens })));
    }
  }
  return CANDIDATE_CACHE.get(c) || [];
}

/** Wrap slide bodies in a deck at `size`. */
function deckSource(size, bodies) {
  // The deck carries NO split directive — there is none to carry. These sweeps measure
  // the UN-SPLIT terminal of the Fit Ladder on purpose ("what clips when nothing
  // paginates"), which is INSTRUMENTATION, so it is bought with the emulator's
  // `--no-split` flag at the call site below rather than with a line in the deck. Without
  // it the sweep would paginate, the 1:1 page↔slide mapping would break, and the record
  // would quietly start measuring something else entirely.
  return `---\nmarp: true\ntheme: indaco\nsize: ${size}\npaginate: true\n---\n\n`
    + bodies.join('\n\n---\n\n') + '\n';
}

/**
 * THE CLIP ROSTER — one gallery slide per component, the FIRST candidate.
 *
 * The question this deck answers is "does this component's canonical slide overflow at
 * this @size", so it wants the slide an author is most likely to write, held STABLE
 * across unrelated edits. `galleryCandidates` already orders baseline-first for exactly
 * that reason, so first-wins is the answer — not a score.
 *
 * A previous cut had this roster follow the CONFORMANCE score below, on the theory that
 * both passes want "the slide that exercises the reflow". They do not, and the cost was
 * concrete: it moved seven components off the #8-protected baseline deck onto their own
 * galleries (which ordinary feature work edits freely), dropped four verified true
 * positives from the record, and blessed four new ones — including `math`, whose hero
 * equation runs 1884px off a portrait canvas with `enrolled: false`, i.e. no split
 * recourse. A clip record is a merge gate; it is the wrong place to be clever.
 */
function clipDeck(size, comps) {
  const picked = [], unrenderable = [];
  for (const c of comps) {
    const cands = galleryCandidates(c);
    if (!cands.length) { unrenderable.push(c); continue; }
    picked.push({ comps: [c], body: cands[0].body });
  }
  if (unrenderable.length) {
    throw new Error(
      `family-overflow oracle: no slide to render for ${unrenderable.join(', ')} — neither the `
      + 'baseline gallery nor the component\'s own gallery deck has one. The record must not claim '
      + 'coverage it does not have; give the component a gallery slide or remove it from the roster.',
    );
  }
  return { src: deckSource(size, picked.map((p) => p.body)), slides: picked };
}

/**
 * THE CONFORMANCE ROSTER — EVERY gallery slide a family rule could reach.
 *
 * The conformance question is different from the clip question: "does every rule this
 * component ships for this family actually do something", which one slide cannot answer.
 * A component whose reflow is scoped to a variant (`q-and-a`'s rules are scoped `.grid`)
 * or scoped AGAINST one (`list-steps`' are `:not(.timeline)`) has rules that the first
 * candidate cannot match — so a one-slide roster reported `unexercised` for a live tier,
 * or worse, let a matched sibling rule vote green for it.
 *
 * The fix is to stop choosing. Rendering every candidate costs about ten seconds a size
 * (321 slides, measured) against roughly one for 33, which is nothing on a nightly — so
 * the roster is not a judgement call any more, and `unexercised` recovers its real
 * meaning: NO gallery slide anywhere carries what this rule targets.
 *
 * Deduped by slide BODY, because one baseline slide can name two components (the
 * `compare-prose decision` slide is one page serving both) and rendering it twice would
 * measure the same pixels twice.
 */
function conformanceDeck(size, comps) {
  const byBody = new Map();
  for (const c of comps) {
    for (const cand of galleryCandidates(c)) {
      let e = byBody.get(cand.body);
      if (!e) { e = { body: cand.body, comps: [] }; byBody.set(cand.body, e); }
      if (!e.comps.includes(c)) e.comps.push(c);
    }
  }
  const slides = [...byBody.values()];
  if (!slides.length) throw new Error('family-conformance: no gallery slides for any rostered component.');
  return { src: deckSource(size, slides.map((s) => s.body)), slides };
}

/**
 * Render one sweep deck and return `{ log, html, slides }` — the emulator's combined
 * output, the path to the `.html` sidecar it wrote, and the page↔slide roster.
 *
 * ONE renderer for both halves of this file. The clip oracle greps `log`; the
 * conformance pass (below) opens `html` in a browser and reads computed style. They ask
 * different questions and now render different DECKS (`clipDeck` vs `conformanceDeck`),
 * but the render, the sentinel and the artifact handling are identical and belong in one
 * place.
 */
function renderSweep(size, deck, tag, { split = false } = {}) {
  const { src, slides } = deck;
  const file = path.join(ROOT, '.scratch', `family-sweep-${tag}-${size}.md`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, src);
  // Keep the artifact where the conformance pass can find it. The emulator writes its
  // `.html` sidecar beside the PDF it is given, so naming the PDF names the HTML.
  const pdf = path.join(os.tmpdir(), `fs-${tag}-${size}-${process.pid}.pdf`);
  let log = '';
  try {
    // BOTH streams. The overflow warning goes to STDERR, and an stdout-only read
    // returned "nothing clipped" for every size — a gate that reports success
    // because it is looking at the wrong pipe. That is the same shape of silent
    // pass this oracle exists to prevent, so the sentinel below guards it.
    // NOT `-q`: quiet mode prints nothing on a clean deck, so "no output" and
    // "no overflow" become the same string and the sentinel below has nothing to
    // check. The `HTML: N slides` tally is the proof the read worked.
    const r = spawnSync(process.execPath,
      [path.join(ROOT, 'lattice-emulator.js'), file, pdf, 'indaco', ...(split ? [] : ['--no-split'])],
      { cwd: ROOT, encoding: 'utf8', timeout: 900000 });
    if (r.error) throw r.error;
    if (r.status !== 0) throw new Error(`emulator exited ${r.status} for ${size}:\n${r.stderr || r.stdout}`);
    log = `${r.stdout || ''}\n${r.stderr || ''}`;
  } finally {
    fs.rmSync(file, { force: true });
  }
  // Sentinel: the emulator always prints `HTML: N slides → …`. If that is
  // missing, the read is broken (wrong stream, changed format, silent failure)
  // and "no overflow" means nothing — fail rather than record a false clean.
  // This exact guard caught an stdout-only read that recorded 0 clips at every
  // size while the deck really clipped four slides at square.
  if (!/HTML:\s*\d+\s*slides?/i.test(log)) {
    throw new Error(`family-overflow oracle: unrecognizable emulator output for ${size} — cannot tell "clean" from "not read". Output was:\n${log.slice(0, 400)}`);
  }
  return { log, html: pdf.replace(/\.pdf$/, '.html'), slides };
}

/** The component names whose slide overflowed in one sweep. */
function clippedAt(size, comps) {
  const { log, slides } = renderSweep(size, clipDeck(size, comps), 'clip');
  // The emitted line wraps, so match across it: "⚠ OVERFLOW … pages 3, 7, 11."
  const m = log.match(/OVERFLOW[\s\S]*?pages?\s+([\d,\s]+)/);
  if (!m) return [];
  // Page N is slide N — the front matter emits no slide, and the sweep sets no
  // `autosplit`, so the 1:1 page↔component mapping holds. A component that split
  // would break it, which is why a page number past the roster is a hard error.
  return m[1].split(',').map((n) => parseInt(n.trim(), 10)).filter(Boolean).map((n) => {
    const s = slides[n - 1];
    if (!s) throw new Error(`family-overflow oracle: page ${n} has no component (a slide split?) — the page↔component mapping is broken; fix the sweep before trusting this record.`);
    return s.comps[0];
  }).sort();
}

function overflowOracle() {
  const comps = familyReflowingComponents();
  const fresh = {};
  for (const s of SIZES) fresh[s.size] = clippedAt(s.size, comps);

  if (BLESS) {
    fs.mkdirSync(path.dirname(ORACLE), { recursive: true });
    // The record carries its own semantics. Without this the `clipped` lists read
    // as "these components are broken at this size", and they do not mean that: the
    // sweep deliberately sets NO `autosplit`, so a clip here is "overflows when the
    // author has not opted into splitting". Many of these entries are components
    // `split-oracle.json` records as enrolled and splittable — i.e. two blessed
    // records appearing to disagree, reconciled only by a comment in this file. A
    // record that needs an out-of-band comment to read correctly is a trap for
    // whoever inherits it.
    // This comment used to quote the overlap as "16 of the 22 portrait entries".
    // Re-derived it is 18 — it drifted the moment `roadmap` gained a carousel recipe
    // and `premise` was enrolled. `--ladder` computes it instead; the note says the
    // command, not the count.
    const note = [
      "Components whose GALLERY SLIDE overflows at each @size, rendered with the emulator's",
      '`--no-split` flag. A name here means "overflows when nothing paginates" — NOT "broken".',
      'Splitting is INTRINSIC (2026-07-29) at the PRESENTATION sizes — square, portrait, story, mobile:',
      'there an overflowing slide WITH A SEAM is divided at render without being asked, so those rows are',
      'not the ordinary case — they are the un-split terminal of the Fit Ladder, measured on purpose so',
      'the record has a stable baseline. Most of that set paginates in a real export. For how many clip',
      'un-split vs. with splitting on, per @size, run `node tools/check-family-tiers.js --ladder` — an',
      'earlier note quoted 21 at portrait against a clipped.portrait of 22, which is the drift this file',
      'keeps re-learning: do not write the count down, name the command. The `hd` row is DIFFERENT: the split move does',
      'not run at a landscape @size, so a clip recorded there is the real terminal a reader sees — an',
      'authoring or layout defect to fix, not a baseline. (There is no 4K row: 4K and hd are the same box,',
      'so sweeping both would measure the same thing twice.) WHAT THIS FILE DOES NOT COVER: it renders one',
      'synthetic per-component slide, not the real galleries, so `hd: []` means "no skeleton clips", NOT',
      '"nothing clips at landscape" — four galleries and four example decks do. See the wide-clip ratchet',
      'named in engineering/decisions/2026-07-29-autosplit-is-not-a-toggle.md Risks.',
      'Run `node tools/check-family-tiers.js --ladder` for the overlap per @size, and for which',
      'components still ring because they have no seam at all. One entry per registered @size, not per',
      'family: `portrait` and `story` are both `tall`, but a clip is a function of the BOX — story is',
      '570px taller at the same width, and the two clip sets differ substantially.',
    ].join(' ');
    fs.writeFileSync(ORACLE, `${JSON.stringify({ note, components: comps, clipped: fresh }, null, 2)}\n`);
    console.log(`\nblessed ${path.relative(ROOT, ORACLE)} — ${comps.length} components across ${SIZES.length} families.`);
    return 0;
  }

  let blessed;
  try { blessed = JSON.parse(fs.readFileSync(ORACLE, 'utf8')); } catch {
    console.log(`\noverflow oracle: no record at ${path.relative(ROOT, ORACLE)} — run \`node tools/check-family-tiers.js --bless\`.`);
    return 1;
  }

  let bad = 0;
  const split = splitEnrollment();
  console.log('\noverflow oracle — gallery slide per family-reflowing component');
  for (const s of SIZES) {
    const now = fresh[s.size];
    const was = (blessed.clipped?.[s.size] || []).slice().sort();
    const added = now.filter((c) => !was.includes(c));
    const gone = was.filter((c) => !now.includes(c));
    if (added.length) {
      bad++;
      // NOT every new clip is a defect, and saying so flatly cost fifteen nights of
      // #1529 being read as a layout regression it was not. This sweep sets no
      // `autosplit`, so a clip here means "overflows when the author has not opted in"
      // — and at a PRESENTATION @size an ENROLLED component paginates instead, which is
      // the ORACLE's own note ("most of that set paginates in a real export"). What is
      // always a defect is a clip that RINGS: no reflow fits it and no split is
      // available, so the export shows it clipped. At a LANDSCAPE @size the split move
      // does not run at all, so everything there rings by construction — which is why
      // that row, and only that row, is the one the note calls a real terminal.
      const rings = s.family === 'wide' ? added : added.filter((c) => !split[c]?.enrolled);
      const mayPaginate = added.filter((c) => !rings.includes(c));
      if (rings.length) {
        console.log(`  ${s.size.padEnd(9)} NEW CLIPS (ring): ${rings.join(', ')} — no reflow fits these and no split is available, so the export rings them. Fix the layout; do not bless it away.`);
      }
      if (mayPaginate.length) {
        const spec = mayPaginate.map((c) => `${c}@${s.size}`).join(',');
        console.log(`  ${s.size.padEnd(9)} NEW CLIPS (may paginate): ${mayPaginate.join(', ')} — these overflow only UN-SPLIT and each DECLARES a split path, so this MAY be baseline drift rather than a regression a reader sees. Enrollment is not proof — verify, then bless: node tools/check-family-tiers.js --verify-paginates ${spec}`);
      }
    }
    if (gone.length) {
      bad++;
      console.log(`  ${s.size.padEnd(9)} FIXED (re-bless): ${gone.join(', ')} — run \`node tools/check-family-tiers.js --bless\` and say so in the PR.`);
    }
    if (!added.length && !gone.length) console.log(`  ${s.size.padEnd(9)} ${now.length} clipped, as recorded${now.length ? ` (${now.join(', ')})` : ''}`);
  }
  const roster = (blessed.components || []).slice().sort();
  if (JSON.stringify(roster) !== JSON.stringify(comps)) {
    bad++;
    const added = comps.filter((c) => !roster.includes(c));
    const gone = roster.filter((c) => !comps.includes(c));
    console.log(`  roster    CHANGED — ${added.length ? `+${added.join(', ')} ` : ''}${gone.length ? `-${gone.join(', ')}` : ''}. A component gaining or losing family reflow is a decision; re-bless and justify it.`);
  }
  return bad;
}

// ── Does it actually paginate? ─────────────────────────────────────────────
/**
 * Render each `<component>@<size>` with splitting ON and report whether it still
 * overflows. Exit 1 on any that does.
 *
 * WHY THIS EXISTS. The verdict above can say a new clip "may paginate", on the strength
 * of `enrolled` in `split-oracle.json`. That field is a component-TYPE opt-in recomputed
 * from the manifest (`tools/bless-split-oracle.js`), NOT a promise that a seam exists for
 * this content in this box: `lib/core/auto-split.js` bails to the ring on a specimen
 * slide, a null carousel recipe, an underivable axis, `count <= 1`, `perSlide >= count`,
 * and `parts.length <= 1`. An enrolled component CAN still clip a real export — measured,
 * not supposed.
 *
 * An earlier cut of the verdict asked the author to prove the bless by showing
 * `--ladder`'s `rings` column unchanged. That evidence cannot fail: `rings` is
 * `clipped.filter((c) => !enrolled)` and the branch fires only where `enrolled` is true,
 * so an added name is excluded from `rings` BY CONSTRUCTION. It asked for a rubber stamp
 * and then read the stamp as proof. This is the falsifiable replacement.
 *
 * Usage: node tools/check-family-tiers.js --verify-paginates kpi@square,premise@story
 */
function verifyPaginates(spec) {
  const pairs = String(spec || '').split(',').map((t) => t.trim()).filter(Boolean)
    .map((t) => { const [c, size] = t.split('@'); return { c, size }; });
  if (!pairs.length) {
    console.log('usage: --verify-paginates <component>@<size>[,<component>@<size>…]');
    return 2;
  }
  const known = new Set(SIZES.map((s) => s.size));
  let bad = 0;
  console.log('does it paginate? — one gallery slide per pair, rendered with splitting ON\n');
  for (const { c, size } of pairs) {
    if (!known.has(size)) {
      console.log(`  ${`${c}@${size}`.padEnd(34)} UNKNOWN @size — one of ${[...known].join(', ')}`);
      bad++; continue;
    }
    const cands = galleryCandidates(c);
    if (!cands.length) {
      console.log(`  ${`${c}@${size}`.padEnd(34)} NO GALLERY SLIDE — cannot verify`);
      bad++; continue;
    }
    const deck = { src: deckSource(size, [cands[0].body]), slides: [{ comps: [c], body: cands[0].body }] };
    const { log } = renderSweep(size, deck, `pag-${c}`, { split: true });
    const clipped = /OVERFLOW/.test(log);
    if (clipped) bad++;
    console.log(`  ${`${c}@${size}`.padEnd(34)} ${clipped ? 'STILL CLIPS — it does NOT paginate. Fix the layout; do not bless it.' : 'paginates (no overflow with splitting on)'}`);
  }
  console.log(bad
    ? `\n${bad} of ${pairs.length} did NOT paginate. Do not bless those.`
    : `\nall ${pairs.length} paginate with splitting on — the bless is justified for these.`);
  return bad ? 1 : 0;
}

// ── The ladder report ──────────────────────────────────────────────────────
/**
 * Reconcile the TWO blessed records against each other, per @size.
 *
 * They look like they contradict: `family-overflow.json` names components as CLIPPED
 * at a size, while `split-oracle.json` records many of the same ones as ENROLLED and
 * splittable. They do not. They measure two different terminals of the same Fit
 * Ladder — this sweep sets NO `autosplit`, so a clip here means "overflows when the
 * author has not opted in", and an enrolled component paginates instead once
 * `autosplit: on` is set.
 *
 * That reconciliation used to live in a COMMENT in this file, quoting "16 of the 22
 * portrait entries". Re-derived today it is 18 of 22 — the number drifted the moment
 * `roadmap` gained a carousel recipe (#1209) and `premise` was enrolled, and nobody
 * re-ran it. So the constant is deleted and this prints it instead. Both decision
 * notes name this command rather than a figure.
 *
 * Reads the two committed records only — no browser, no render, so it is safe to
 * quote from a doc and cheap to run.
 */
function ladderReport() {
  const fam = JSON.parse(fs.readFileSync(ORACLE, 'utf8'));
  const split = splitEnrollment();
  console.log('The Fit Ladder, per @size — REFLOW\'s clipped set against SPLIT\'s enrolled set.');
  console.log('A component in both columns clips un-split and paginates once `autosplit: on`.\n');
  console.log('size      clipped  enrolled  rings  components that still ring (no opt-in)');
  for (const s of SIZES) {
    const clipped = (fam.clipped?.[s.size] || []).slice().sort();
    const enrolled = clipped.filter((c) => split[c]?.enrolled);
    const rings = clipped.filter((c) => !split[c]?.enrolled);
    console.log(
      `${s.size.padEnd(9)} ${String(clipped.length).padEnd(8)} ${String(enrolled.length).padEnd(9)} `
      + `${String(rings.length).padEnd(6)} ${rings.join(', ') || '—'}`,
    );
  }
  console.log(
    '\nA name in the last column is the honest terminal of the ladder: no reflow fits it,'
    + '\nand no split is available, so the export rings it. That is the set worth shrinking.',
  );
  return 0;
}

// ── The CONFORMANCE pass — does every component's family tier actually FIRE? ──
/**
 * The hole this closes is the one this file's own header confesses: the probe half
 * asserts a tier fires for THREE hand-picked components, and the overflow oracle covers
 * all 33 but records only whether they CLIP. So for 30 of 33 components, nothing checks
 * that their `[data-family]` rules do anything at all — which is exactly the failure that
 * killed the gate this one replaced, where the square tier was inert for its entire life
 * while every check stayed green.
 *
 * #1234 group E asked for this as "~97 of 265 conformance cells are UNVERIFIED — re-run
 * with a render budget". That table was hand-marked, lived only in `.scratch/`, and is
 * gone. Re-marking it by hand would rebuild the very thing the issue is about: an
 * assertion written down once and never re-derived. So the cells are DERIVED here instead,
 * and the budget turned out to be small: one deck per @size carrying every gallery slide of
 * every rostered component renders in about ten seconds, so the pass reads the DOM of five
 * renders rather than adding 165.
 *
 * A cell is an aggregate of PER-RULE facts, and every rule the component ships for that
 * family is in the denominator. `fires` means all of them had an effect — matched on at
 * least one of the component's own gallery slides, and moved a property they declare when
 * the family stamp came off THAT render. Anything less prints as `n/m` plus tags that name
 * the shortfall: `inert` (element present, predicate did not match — the #1218 bug this
 * pass exists to catch), `unexercised` (no gallery slide anywhere carries what the rule
 * targets — a gap in the galleries, not a defect), `no-effect` (matched, nothing moved),
 * `no-baseline` (matched, but cannot be switched off without losing the element, so the
 * pass is blind). `n/a` means nothing was promised for that family.
 *
 * The `wide` column is `n/a` by construction: `wide` is the ABSENCE of the stamp
 * (`familySelector('wide')` is `:where(section:not([data-family]))`), so no
 * `[data-family=…]` rule can match there. That is what makes it the baseline.
 */
const CONFORMANCE_ORACLE = path.join(ROOT, 'test', 'oracle', 'family-conformance.json');

/**
 * Markers only the SPLITTER puts on a page (`lib/core/auto-split.js`, `lib/core/carousel.js`).
 * These sweeps render `--no-split` deliberately — they measure the un-split terminal of the
 * Fit Ladder — so a family rule scoped to one of them cannot be exercised here no matter
 * which slides are in the deck. Four of `kanban`'s seven tall rules are in this class. That
 * is a REACH limit of this instrument, not a gap in the galleries, and the two must not be
 * reported with the same words.
 */
const SPLIT_ONLY_MARKER = /\blat-split-native\b|\[data-split-role/;

/**
 * The same selector with its family predicate removed, so the SAME element can be found
 * in the `wide` render for comparison.
 *
 * Without this the effect test is vacuous: at `wide` the section carries no `data-family`
 * attribute, so a family-scoped selector matches nothing, every property reads as
 * "different from a baseline that does not exist", and every cell says `fires` — a green
 * that means nothing. Caught by prototyping the pass before trusting it.
 */
function descopeFamily(sel) {
  const bare = sel
    // `:where([data-family="tall"], [data-family="strip"])` — the house idiom, zero
    // specificity so removing it cannot change which rule wins in the baseline.
    .replace(/:where\(\s*\[data-family[^()]*\)/g, '')
    // …and a bare `[data-family="tall"]` written inline.
    .replace(/\[data-family(?:\s*[~^$*|]?=\s*(?:"[^"]*"|'[^']*'|[\w-]+))?\]/g, '')
    .replace(/\s{2,}/g, ' ').trim();
  // A selector that was ONLY the family predicate de-scopes to nothing; there is no
  // element to compare against, so the caller must skip the effect test rather than
  // guess.
  return bare && !/^[>+~,]/.test(bare) ? bare : null;
}

/**
 * Read the family-scoped rules out of a rendered page's own stylesheets.
 *
 * From the PAGE rather than from `dist/lattice.css`, deliberately: what matters is the
 * rule set the browser actually resolved, after the bundle, the theme and any `@media`
 * nesting. Reading the source file would be measuring a different artifact from the one
 * the components are laid out by.
 */
async function readFamilyRules(browser, html) {
  const page = await browser.newPage();
  try {
    await page.goto(`file://${path.resolve(html)}`, { waitUntil: 'networkidle0', timeout: 120000 });
    return await page.evaluate(() => {
      const rules = [];
      const walk = (list) => {
        for (const r of list) {
          // A CSSStyleRule ALSO exposes `.cssRules` (CSS nesting), and an EMPTY
          // CSSRuleList is TRUTHY — so a naive `if (r.cssRules) recurse; else record`
          // records nothing at all. Recurse on LENGTH; record on selectorText.
          if (r.selectorText && /data-family/.test(r.selectorText)) {
            const props = [];
            for (let i = 0; i < r.style.length; i++) props.push(r.style[i]);
            if (props.length) rules.push({ sel: r.selectorText, props });
          }
          // `?.length` keeps the trap closed: undefined -> falsy, and an EMPTY (but truthy)
          // CSSRuleList -> 0 -> falsy. Recursing on truthiness alone is what found 0 rules.
          if (r.cssRules?.length) walk(r.cssRules);
        }
      };
      for (const sheet of document.styleSheets) {
        let list; try { list = sheet.cssRules; } catch { continue; }
        walk(list);
      }
      return rules;
    });
  } finally { await page.close(); }
}

/**
 * For one rendered sweep, per slide: which of `rules` match, what they compute, and what
 * the same element computes through the DE-SCOPED selector (the `wide` baseline read).
 */
async function measureSweep(browser, html, rules) {
  const page = await browser.newPage();
  try {
    await page.goto(`file://${path.resolve(html)}`, { waitUntil: 'networkidle0', timeout: 120000 });
    return await page.evaluate((rs) => {
      const per = [];
      document.querySelectorAll('section[data-lattice-slide]').forEach((sec) => {
        const fam = sec.getAttribute('data-family') || 'wide';
        const scoped = {}, reachable = {}, withoutStamp = {};

        // A rule may target a PSEUDO-element, and `querySelectorAll` can never match one.
        // Ten of the catalog's 142 family rules are pseudo-only — three of them are the whole
        // visible substance of `cycle`'s tall reflow (the chevron, the return arc, the glyph)
        // — so a pass that skips them reports green while they are dead. Split the pseudo off
        // the selector, match the real element, and read the pseudo's own computed style.
        const split = (sel) => {
          const m = String(sel || '').match(/^(.*?)(::?(?:before|after|marker|placeholder))\s*$/);
          return m ? { base: m[1].trim(), pseudo: m[2].replace(/^:?:/, '::') } : { base: sel, pseudo: null };
        };
        const pick = (sel) => {
          const { base, pseudo } = split(sel);
          if (!base) return null;
          let els = [];
          try { els = [...sec.querySelectorAll(base)]; } catch { return null; }
          let self = false; try { self = sec.matches(base); } catch { /* not valid on a section */ }
          if (self) els = [sec, ...els];
          return els.length ? { el: els[0], pseudo } : null;
        };
        const read = (hit, props) => {
          const cs = getComputedStyle(hit.el, hit.pseudo || undefined);
          return props.map((k) => cs.getPropertyValue(k));
        };

        // PASS 1 — the rule as it ships. `reachable` records whether the rule's target element
        // exists at all (via the de-scoped selector), which is what separates a DEAD tier from
        // one this slide simply never exercises.
        for (const r of rs) {
          const hit = pick(r.sel);
          if (hit) scoped[r.sel] = read(hit, r.props);
          if (pick(r.descoped)) reachable[r.sel] = true;
        }

        // PASS 2 — THE A/B. Remove the family stamp from this section and read the same
        // element again, in the SAME render, at the SAME viewport.
        //
        // This replaces a baseline taken from the `hd` render, which was confounded and is the
        // reason this pass shipped unable to fail. Every `--sp-*` rides `--canvas-scale` and
        // every `--fs-*` rides `cqi`, so ANY rule declaring a scale-derived length reads a
        // different px at portrait than at hd whether or not the family predicate did anything.
        // Measured on the catalog: 87 of 101 `fires` verdicts rested on at least one such
        // length. Proven by three independent mutations that the gate did not catch —
        // `verdict-grid`'s tier reverted outright (column -> row), `compare-prose`'s rule made a
        // byte-for-byte no-op, and all three of `cycle`'s pseudo rules killed.
        //
        // Dropping the attribute makes exactly one thing false — the family predicate — and
        // holds the box, the tokens, the DOM and the cascade fixed. So a difference here IS the
        // rule's effect, and nothing else can produce one.
        if (fam !== 'wide') {
          sec.removeAttribute('data-family');
          void sec.offsetHeight; // force a style recalculation before reading back
          for (const r of rs) {
            if (!scoped[r.sel]) continue;
            // With the stamp gone the scoped selector cannot match, so the same element has to
            // be re-found through the de-scoped one. A rule whose selector de-scopes to nothing
            // has no readable "off" state; it is left absent and reported as `no-baseline`.
            const off = pick(r.descoped);
            if (off) withoutStamp[r.sel] = read(off, r.props);
          }
          sec.setAttribute('data-family', fam);
        }
        per.push({ family: fam, scoped, reachable, withoutStamp });
      });
      return per;
    }, rules);
  } finally { await page.close(); }
}

/**
 * The conformance pass. Renders one sweep per @size (the same five the clip oracle
 * needs), and returns `{ [size]: { [component]: verdict } }`.
 */
async function conformanceSweep(browser, comps) {
  // `hd` is rendered like any other size, not treated as a baseline. It USED to be the
  // baseline, and that was the defect: comparing an element at hd against itself at portrait
  // measures the viewport, not the family predicate. The A/B now happens inside each render
  // (measureSweep), so hd is here only to DERIVE its own row rather than assert it — a
  // hardcoded `n/a` column would be 20% of the advertised cells taken on faith.
  const wide = renderSweep('hd', conformanceDeck('hd', comps), 'conf');
  const rules = (await readFamilyRules(browser, wide.html))
    .map((r) => ({ ...r, descoped: descopeFamily(r.sel) }));

  // FLOOR SENTINEL. The rule reader has already failed once by returning nothing (an empty
  // CSSRuleList is truthy, so every rule recursed into its own empty children). If it fails
  // that way again, every cell becomes `n/a` and `--bless` would freeze a record that asserts
  // nothing and is green forever. The clip oracle guards its read with a sentinel for exactly
  // this reason; this one has to as well.
  if (rules.length < 100) {
    throw new Error(
      `family-conformance: read only ${rules.length} family-scoped rules from the rendered bundle — `
      + 'the catalog has ~142 and this pass has failed by reading ZERO before. Refusing to derive '
      + 'a table (or bless one) from a read that is probably broken.',
    );
  }

  // Only the rules that NAME a component are its promise. A rule matching inside its slide
  // but belonging to shared chrome (the masthead carries family rules too) is not that
  // component's tier, and counting it would let a component inherit a green it never earned.
  // Negations are stripped first: `:not(.stats)` inside a `math` selector is not `stats`
  // promising anything — it is `math` promising to exclude it.
  const positive = (sel) => sel.replace(/:not\([^()]*\)/g, ' ');
  const rulesFor = new Map(comps.map((c) => [c,
    rules.filter((x) => new RegExp(`(^|[^\\w-])${c}([^\\w-]|$)`).test(positive(x.sel)))]));

  // Every rule that fell short of `effect`, with its selector. The cell strings carry the
  // COUNTS (they are the record, and a record has to diff cleanly); this carries the NAMES,
  // printed but never blessed, so "kanban: 3/7 unexercised:4" is something a human can act
  // on instead of a number to shrug at.
  const shortfall = [];
  const table = {};
  for (const s of SIZES) {
    const r = s.size === 'hd' ? wide : renderSweep(s.size, conformanceDeck(s.size, comps), 'conf');
    const per = await measureSweep(browser, r.html, rules);
    fs.rmSync(r.html, { force: true });
    if (per.length !== r.slides.length) {
      throw new Error(
        `family-conformance: rendered ${r.slides.length} slides at ${s.size} but measured ${per.length} `
        + '— the page↔slide mapping is broken and every verdict below it would be attributed to the '
        + 'wrong component. Fix the sweep before trusting this record.',
      );
    }
    // Which probe slides serve which component. A component is judged ONLY on its own
    // slides — a rule naming `list` is not tested against a `kpi` page.
    const probesOf = new Map(comps.map((c) => [c, []]));
    r.slides.forEach((sl, i) => { for (const c of sl.comps) probesOf.get(c)?.push(per[i]); });

    table[s.size] = {};
    for (const comp of comps) {
      const probes = probesOf.get(comp) || [];
      if (!probes.length) { table[s.size][comp] = 'unrendered'; continue; }
      // Every probe of a component sits in the same deck at the same @size, so they all carry
      // the same family stamp; read it off the first.
      const family = probes[0].family;
      const forFamily = (rulesFor.get(comp) || []).filter((x) => x.sel.includes(`"${family}"`));
      if (!forFamily.length) { table[s.size][comp] = 'n/a'; continue; }

      // PER RULE, ACROSS EVERY PROBE. This is what the full roster buys. Before it, the sweep
      // rendered ONE slide per component and a rule scoped to a variant that slide did not
      // carry read as `unexercised` — a coverage gap in the instrument reported as a fact
      // about the component. Now a rule is `unexercised` only when NO gallery slide anywhere
      // carries what it targets, which is a real finding worth a human.
      const tally = { effect: 0, 'no-effect': 0, 'no-baseline': 0, inert: 0, unexercised: 0 };
      const note = (k, sel) => { tally[k] += 1; if (k !== 'effect') shortfall.push({ size: s.size, comp, kind: k, sel }); };
      for (const x of forFamily) {
        const hits = probes.filter((p) => p.scoped[x.sel]);
        if (!hits.length) {
          // NOTHING matched on any probe — two very different reasons, and calling both
          // `inert` would cry wolf. If the rule's non-family part finds no element either,
          // no slide carries what the rule targets (a variant it is scoped to, or one it
          // excludes) and the tier was never exercised. If the de-scoped selector DOES find
          // the element, the family predicate is the only thing that failed — #1218 exactly.
          note(probes.some((p) => p.reachable[x.sel]) ? 'inert' : 'unexercised', x.sel);
          continue;
        }
        // THE EFFECT TEST — same element, same render, same viewport, stamp on vs stamp off.
        // A rule counts as having an effect only if ITS OWN declared properties move; a
        // sibling rule moving is not evidence about this one. (An early cut took `.some()`
        // across all matched rules against a different-SIZED render, so one sibling reading a
        // different px voted `fires` for a tier that had been reverted outright.)
        // Across probes it IS `some`, and that is the right quantifier here: the claim under
        // test is "this rule does something", so one slide demonstrating it settles the rule.
        if (hits.some((p) => {
          const on = p.scoped[x.sel], off = p.withoutStamp[x.sel];
          return off && on.some((v, k) => v !== off[k]);
        })) { note('effect', x.sel); continue; }
        // No probe moved. Distinguish "measured, nothing changed" from "could not measure":
        // a selector that de-scopes to nothing cannot be switched off without also losing the
        // element, and that is the instrument admitting it is blind, not a verdict about the
        // component. An earlier pass called this `no-effect` and published a diagnosis
        // ("redundant, or losing a cascade fight") that was false for all three instances.
        note(hits.some((p) => p.withoutStamp[x.sel]) ? 'no-effect' : 'no-baseline', x.sel);
      }

      // EVERY rule the component ships for this family must earn its own green — and the
      // denominator is `forFamily`, not "the ones that happened to match". Excusing the
      // unmatched ones is how a cell read `fires` while 4 of 7 rules were never tested.
      const m = forFamily.length;
      if (tally.effect === m) { table[s.size][comp] = 'fires'; continue; }
      // Most-alarming first, and always both the count and the reasons, so the record can
      // never say "green-ish" without saying what is wrong and how much of it.
      const tags = ['inert', 'unexercised', 'no-effect', 'no-baseline']
        .filter((k) => tally[k]).map((k) => `${k}:${tally[k]}`);
      table[s.size][comp] = `${tally.effect}/${m} ${tags.join(' ')}`;
    }
  }
  return {
    table, shortfall, ruleCount: rules.length, probeCount: conformanceDeck('hd', comps).slides.length,
  };
}

/**
 * `--conformance` — run the pass, print the table, and check it against the committed
 * record (or rewrite that record with `--bless`).
 *
 * Exceed-only would be the wrong shape here. A cell going `fires` → `inert` is the
 * regression this exists to catch, but `inert` → `fires` is someone FIXING a dead tier
 * and the record has to move with it; and `fires` → `n/a` means a component quietly
 * dropped a family rule it used to ship. So the check is EXACT, and any drift asks for a
 * re-bless with the diff in front of you.
 */
async function conformanceReport(browser) {
  const comps = familyReflowingComponents();
  const { table, shortfall, ruleCount, probeCount } = await conformanceSweep(browser, comps);
  const sizes = Object.keys(table);
  const tally = {};
  for (const s of sizes) for (const v of Object.values(table[s])) tally[v] = (tally[v] || 0) + 1;

  const w = Math.max(...comps.map((c) => c.length), 9);
  const cw = Math.max(...Object.values(table).flatMap((r) => Object.values(r)).map((v) => v.length), 8) + 2;
  console.log(`\nfamily-tier CONFORMANCE — ${comps.length} components x ${sizes.length} @sizes `
    + `= ${comps.length * sizes.length} cells, from ${ruleCount} family-scoped rules `
    + `measured across ${probeCount} gallery slides per @size\n`);
  console.log(`${'component'.padEnd(w)}  ${sizes.map((s) => s.padEnd(cw)).join('')}`);
  for (const c of comps) {
    console.log(`${c.padEnd(w)}  ${sizes.map((s) => String(table[s][c] || '—').padEnd(cw)).join('')}`);
  }
  console.log(`\n  ${Object.entries(tally).sort().map(([k, v]) => `${k}: ${v}`).join(' · ')}`);
  console.log('  fires     = EVERY rule the component ships for this family had an effect: it matched on');
  console.log('              at least one of its gallery slides, and removing the stamp IN THAT RENDER');
  console.log('              moved a property that rule declares — same element, same box, rule on vs off');
  console.log('  n/m tags  = only n of the m rules the component ships for this family had an effect, and');
  console.log('              the tags say what the other m-n are. The denominator is EVERY rule it ships,');
  console.log('              not just the ones that matched — excusing an unmatched rule is how a cell');
  console.log('              read green while 4 of 7 rules had never been tested at all:');
  console.log('    inert:k       ships the rule, the target element IS present, the family predicate did');
  console.log('                  not match — the #1218 bug, and the state this pass exists to catch');
  console.log('    unexercised:k no slide in this sweep carries what the rule targets, so it could not be');
  console.log('                  tested — a COVERAGE gap, not a defect in the component. Usually that means');
  console.log('                  no gallery slide exercises the variant. But these decks render --no-split,');
  console.log('                  so a rule scoped to a marker the SPLITTER emits is out of this instrument\'s');
  console.log('                  reach altogether; the listing below flags which ones those are');
  console.log('    no-effect:k   matched, off-state readable, nothing it declares moved: redundant with');
  console.log('                  the base rule, or losing a cascade fight');
  console.log('    no-baseline:k matched but cannot be switched off without losing the element too, so');
  console.log('                  this pass is BLIND here — not a verdict about the component');
  console.log('  n/a       = nothing promised for this family (every cell at hd, which IS the baseline)');

  // WHICH rules fell short, by name. A cell reading `3/7 unexercised:4` is only actionable if
  // you can see the four selectors, and a count alone is the kind of number a reader learns to
  // scroll past. Collapsed across @sizes: a rule scoped `tall` shows up identically at portrait
  // and story (same family), and printing it twice would treble the list for no information.
  if (shortfall.length) {
    const byRule = new Map();
    for (const f of shortfall) {
      const k = `${f.comp}\u0000${f.kind}\u0000${f.sel}`;
      if (!byRule.has(k)) byRule.set(k, { ...f, sizes: [] });
      byRule.get(k).sizes.push(f.size);
    }
    console.log(`\n  rules that did not fire (${byRule.size} distinct, across ${shortfall.length} cells):`);
    for (const f of [...byRule.values()].sort((a, b) => a.comp.localeCompare(b.comp) || a.kind.localeCompare(b.kind))) {
      // A rule scoped to a marker the SPLITTER emits can never be exercised by this sweep,
      // which renders `--no-split` on purpose. Reporting that as a gallery coverage gap would
      // point the reader at the wrong thing entirely — there is no slide to add.
      const why = SPLIT_ONLY_MARKER.test(f.sel) ? '  [unreachable here: needs split output, this sweep is --no-split]' : '';
      console.log(`    ${f.comp} · ${f.kind} @ ${f.sizes.join(',')}${why}\n      ${f.sel}`);
    }
  }

  const fresh = { note: CONFORMANCE_NOTE, components: comps, cells: table };
  if (BLESS) {
    fs.mkdirSync(path.dirname(CONFORMANCE_ORACLE), { recursive: true });
    fs.writeFileSync(CONFORMANCE_ORACLE, `${JSON.stringify(fresh, null, 2)}\n`);
    console.log(`\nblessed ${path.relative(ROOT, CONFORMANCE_ORACLE)}`);
    return 0;
  }
  if (!fs.existsSync(CONFORMANCE_ORACLE)) {
    console.error(`\nno record at ${path.relative(ROOT, CONFORMANCE_ORACLE)} — run with --bless once you have read the table above.`);
    return 1;
  }
  const prev = JSON.parse(fs.readFileSync(CONFORMANCE_ORACLE, 'utf8'));
  const drift = [];
  for (const s of sizes) {
    for (const c of comps) {
      const was = prev.cells?.[s]?.[c] ?? '(absent)';
      const now = table[s][c];
      if (was !== now) drift.push(`  ${c} @ ${s}: ${was} -> ${now}`);
    }
  }
  for (const c of Object.keys(prev.cells?.hd || {})) {
    if (!comps.includes(c)) drift.push(`  ${c}: in the record, no longer a family-reflowing component`);
  }
  // The NOTE is part of the record and rots the same way the cells do. It explains what every
  // verdict means, so a note describing an older pass is worse than no note — and without this
  // check, editing `CONFORMANCE_NOTE` and forgetting to re-bless leaves exactly that, silently.
  // This whole issue is about assertions written down once and never re-derived.
  if (prev.note !== CONFORMANCE_NOTE) {
    drift.push('  note: the record\'s explanation of its own verdicts is stale — re-bless to update it');
  }
  if (!drift.length) { console.log('\nconformance OK — every cell matches the record.'); return 0; }
  console.error(`\n${drift.length} difference(s) from ${path.relative(ROOT, CONFORMANCE_ORACLE)}:`);
  console.error(drift.join('\n'));
  console.error('\nRead the diff before re-blessing: `fires -> inert` is a tier that stopped firing.');
  return 1;
}

const CONFORMANCE_NOTE = [
  'Does each family-reflowing component\'s [data-family] tier actually FIRE at each @size?',
  'DERIVED, never hand-marked: `node tools/check-family-tiers.js --conformance` renders EVERY gallery',
  'slide of every rostered component, at each @size, and reads the rendered DOM. `fires` = every rule',
  'naming this component for this family matched on at least one of its slides, and removing the',
  'data-family stamp FROM THAT SAME RENDER changed one of the properties THAT RULE declares — same',
  'element, same viewport, rule on vs rule off. An earlier cut compared against the `hd` render',
  'instead, which was confounded: every --sp-* rides --canvas-scale and every --fs-* rides cqi, so any',
  'scale-derived length differs between boxes whatever the family predicate does — three deliberately',
  'reverted tiers passed it. Anything short of every rule is reported as `n/m` plus tags naming the',
  'shortfall, and the DENOMINATOR is every rule the component ships for that family, not just the ones',
  'that matched: `inert:k` = the element IS present but the family predicate did not match, the #1218',
  'defect this pass exists to catch; `unexercised:k` = no slide in the sweep carries what the rule',
  'targets, a coverage gap rather than a defect — usually no gallery slide exercises the variant, but',
  'these decks render --no-split, so a rule scoped to a marker the SPLITTER emits (four of kanban\'s',
  'seven tall rules) is out of this instrument\'s reach altogether and the run\'s listing flags it;',
  '`no-effect:k` = matched, off-state',
  'readable, nothing it declares moved (redundant, or losing a cascade fight); `no-baseline:k` = matched',
  'but not switchable off without losing the element too, so the pass is blind there rather than making',
  'a claim. Sweeping every slide rather than one picked per component is deliberate — with one slide,',
  'a rule scoped to a variant that slide did not carry read as a fact about the component when it was',
  'really a gap in the instrument, and a matched sibling rule could vote green for it. `n/a` = nothing',
  'promised. Every hd cell is n/a by construction: `wide` is the ABSENCE of the stamp, so no',
  '[data-family=] rule can match there — that is what makes it the baseline. The check is EXACT in both',
  'directions, because a tier being fixed must move the record just as loudly as one going dead.',
].join(' ');

// Same short-circuit shape as `--presets`: a REPORT/gate that must not also run the tier
// probe and the clip oracle. Checked inside the main IIFE below, which already launches
// the browser this needs — a top-level `return` would be legal under the CommonJS module
// wrapper but is an error to the linter, and duplicating the launch would be worse.
const CONFORMANCE_ONLY = process.argv.includes('--conformance');

// REQUIRABLE WITHOUT RUNNING. The roster builders decide which slides every verdict in both
// records is derived from, so they need unit tests — and a test that has to lift them out of
// the source with `new Function` (which is what the first cut of
// `test/unit/tools/family-conformance.test.js` did) silently tests nothing the day one is
// renamed. Both entry points below are guarded instead, so `require()` costs a parse.
const IS_CLI = require.main === module;

module.exports = {
  classTokens, galleryCandidates, clipDeck, conformanceDeck, descopeFamily, SPLIT_ONLY_MARKER,
};

if (IS_CLI && process.argv.includes('--ladder')) process.exit(ladderReport());
if (IS_CLI && process.argv.includes('--verify-paginates')) {
  process.exit(verifyPaginates(process.argv[process.argv.indexOf('--verify-paginates') + 1]));
}

// ── The preset report ──────────────────────────────────────────────────────
/**
 * What actually differs between the registered @sizes: the family stamp, the deck
 * orientation, `--canvas-scale`, and the MEASURED body / `h2` px.
 *
 * The split note's §0b asserted "every portrait preset is 1080 wide, so body type is
 * one size across them; a taller preset simply holds more units", and reasoned about
 * one budget across a bucket that included `square`. Two of the three claims in that
 * sentence are false, and no command existed to check any of them — so this prints
 * the numbers instead of the note quoting them. `portrait`/`story`/`mobile` share the
 * `portrait` type category and agree exactly; `square` is its own category and does
 * not.
 *
 * A REPORT, not a gate: it asserts nothing and exits 0. The tier assertions are the
 * default run above; this exists so a doc can name a command rather than a constant.
 */
const PRESET_DECK = `<!-- _class: content -->

## A heading for the probe

A plain body paragraph carrying the container default type role, long enough to wrap
at any preset and be measured honestly.
`;

async function presetReport() {
  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch({ executablePath: resolveChrome(), args: ['--no-sandbox'] });
  console.log('Per-@size render facts — the family stamp, the type category, and the measured result.\n');
  console.log('size      family   orientation  --canvas-scale  body px    h2 px');
  for (const s of SIZES) {
    const src = path.join(ROOT, '.scratch', `preset-${s.size}.md`);
    fs.mkdirSync(path.dirname(src), { recursive: true });
    fs.writeFileSync(src, `---\nmarp: true\ntheme: indaco\nsize: ${s.size}\n---\n\n${PRESET_DECK}`);
    const base = path.join(os.tmpdir(), `preset-${s.size}-${process.pid}`);
    execFileSync(process.execPath, [path.join(ROOT, 'lattice-emulator.js'), src, `${base}.pdf`, 'indaco', '-q'],
      { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], timeout: 600000 });
    const page = await browser.newPage();
    await page.setViewport({ width: s.vp[0], height: s.vp[1] });
    await page.goto(`file://${base}.html`, { waitUntil: 'networkidle0', timeout: 120000 });
    const r = await page.evaluate(() => {
      const sec = [...document.querySelectorAll('section')].find((x) => x.className.includes('content'));
      const px = (el) => (el ? getComputedStyle(el).fontSize : 'MISSING');
      return {
        stamp: sec?.getAttribute('data-family') || '(none → wide)',
        orientation: sec?.getAttribute('data-orientation') || '(none)',
        scale: sec ? (getComputedStyle(sec).getPropertyValue('--canvas-scale').trim() || '1 (unset)') : '?',
        body: px(sec?.querySelector('.cell-stage p') || sec?.querySelector('p')),
        h2: px(sec?.querySelector('h2')),
      };
    });
    console.log(
      `${s.size.padEnd(9)} ${s.family.padEnd(8)} ${r.orientation.padEnd(12)} `
      + `${r.scale.padEnd(15)} ${r.body.padEnd(10)} ${r.h2}`,
    );
    await page.close();
    fs.rmSync(src, { force: true });
  }
  await browser.close();
  console.log(
    '\nType is `coefficient × cqi` per ORIENTATION category (lib/typography/scale.js), not one'
    + '\nscale × a multiplier — so portrait/story/mobile agree exactly (same category, all 1080'
    + '\nwide) and square does not (its own category). `--canvas-scale` still ramps by aspect but'
    + '\nno longer multiplies type; it drives spacing.',
  );
  return 0;
}

// `--presets` short-circuits the assertion run below: it is a REPORT, and running the
// full tier probe + four emulator sweeps to print five rows would make a doc's cited
// command too slow to actually run.
const PRESETS_ONLY = process.argv.includes('--presets');

(async () => {
  if (!IS_CLI) return; // required as a module for its roster builders — run nothing
  if (PRESETS_ONLY) { process.exitCode = await presetReport(); return; }
  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch({ executablePath: resolveChrome(), args: ['--no-sandbox'] });
  if (CONFORMANCE_ONLY) {
    try { process.exitCode = await conformanceReport(browser); } finally { await browser.close(); }
    return;
  }
  const rows = [];
  for (const s of SIZES) {
    const src = path.join(ROOT, '.scratch', `vf-${s.size}.md`);
    // `.scratch/` is gitignored, so on a fresh checkout it does not exist and this
    // write threw ENOENT before the oracle half (which does mkdir) ever ran. It
    // only worked because something earlier in the session had created it — an
    // undeclared ordering dependency that the new nightly workflow step would
    // have inherited.
    fs.mkdirSync(path.dirname(src), { recursive: true });
    fs.writeFileSync(src, `---\nsize: ${s.size}\ntheme: indaco\n---\n\n` + DECK.split('---\ntheme: indaco\n---\n\n')[1]);
    const base = path.join(os.tmpdir(), `vf-${s.size}-${process.pid}`);
    execFileSync(process.execPath, [path.join(ROOT, 'lattice-emulator.js'), src, `${base}.pdf`, 'indaco', '-q'],
      { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], timeout: 600000 });
    const page = await browser.newPage();
    await page.setViewport({ width: s.vp[0], height: s.vp[1] });
    await page.goto(`file://${base}.html`, { waitUntil: 'networkidle0', timeout: 120000 });
    rows.push(await page.evaluate(() => {
      const pick = (cls) => [...document.querySelectorAll('section')].find(x => x.className.includes(cls));
      const dec = pick('decision'), mat = pick('matrix-2x2'), st = pick('stats');
      const dir = (sec, sel) => {
        const el = sec?.querySelector(sel);
        return el ? getComputedStyle(el).flexDirection : 'MISSING';
      };
      const sec = dec || mat;
      return {
        stamp: sec ? (sec.getAttribute('data-family') || '(none → wide)') : 'NO SECTION',
        orientation: sec ? sec.getAttribute('data-orientation') : null,
        decisionList: dir(dec, '.cell-stage > ul, .cell-stage > ol'),
        matrixList: dir(mat, '.cell-stage > ul, .cell-stage > ol'),
        statsList: dir(st, '.cell-stage > ol'),
        statsWrap: (() => {
          const el = st?.querySelector('.cell-stage > ol');
          return el ? getComputedStyle(el).flexWrap : 'MISSING';
        })(),
      };
    }));
    await page.close();
    fs.rmSync(src, { force: true });
  }
  await browser.close();

  console.log('size      expect   stamp             decision   matrix     stats      wrap');
  let bad = 0;
  SIZES.forEach((s, i) => {
    const r = rows[i];
    const stampOk = r.stamp === s.family || (s.family === 'wide' && r.stamp === '(none → wide)');
    // Both components keep their side-by-side set at SQUARE and collapse only on
    // tall/strip. That is the deliberate #1218 outcome, not a loosened assertion:
    // square is the `balanced` family, and a decision read side by side is the
    // point of the layout. As shipped, `node tools/calibrate-capacity.js decision
    // --family square` measures a ceiling of 4 at decision's own `density.soft`.
    const wantDec = (s.family === 'tall' || s.family === 'strip') ? 'column' : 'row';
    const wantMat = (s.family === 'tall' || s.family === 'strip') ? 'column' : 'row';
    // stats: wide = nowrap row · square = WRAPPED row (2-up) · tall/strip = column.
    // The wrap is what proves the square tier fired.
    const wantStats = (s.family === 'tall' || s.family === 'strip') ? 'column' : 'row';
    const wantWrap = s.family === 'square' ? 'wrap' : 'nowrap';
    const ok = stampOk && r.decisionList === wantDec && r.matrixList === wantMat
      && r.statsList === wantStats && r.statsWrap === wantWrap;
    if (!ok) bad++;
    console.log(
      `${s.size.padEnd(9)} ${s.family.padEnd(8)} ${r.stamp.padEnd(17)} ` +
      `${r.decisionList.padEnd(10)} ${r.matrixList.padEnd(10)} ${r.statsList.padEnd(10)} ${r.statsWrap.padEnd(8)} ` +
      `${ok ? 'OK' : `FAIL (want ${wantDec}/${wantMat}/${wantStats}/${wantWrap})`}`);
  });
  console.log(bad ? `\n${bad} FAILURES` : '\nall tiers fire');
  bad += overflowOracle();
  process.exitCode = bad ? 1 : 0;
})();
