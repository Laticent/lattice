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

/**
 * One gallery slide per component, in a deck at `size`. The gallery is the
 * repo's own canonical authoring — if a component clips THERE, it clips for a
 * user who followed the docs.
 */
function sweepDeck(size, comps) {
  const gallery = fs.readFileSync(path.join(ROOT, 'test', 'integration', 'baseline-decks', 'gallery.md'), 'utf8');
  const slides = gallery.split(/^---\s*$/m);
  const picked = [];
  // Read the `_class:` directive's TOKENS and compare by value. An earlier cut
  // built a RegExp per component from its name with only `-` hand-escaped, which
  // CodeQL flagged (incomplete escaping) and which would misfire on any name
  // carrying a regex metacharacter. Comparing tokens has no escaping problem to
  // get wrong, and it is also more accurate: a substring match would let
  // `list` claim a `list-tabular` slide.
  const classTokens = (slide) => {
    const out = new Set();
    for (const m of slide.matchAll(/<!--\s*_?class:([^-]*(?:-(?!->)[^-]*)*)-->/g)) {
      for (const t of m[1].trim().split(/\s+/)) if (t) out.add(t);
    }
    return out;
  };
  const tokenised = slides.map((s) => ({ s, tokens: classTokens(s) }));
  // FALL BACK to the component's OWN gallery deck when the shared baseline has no
  // slide for it, and hard-fail if neither does. Silently skipping is how the
  // record came to claim 34 components while rendering 31: `premise` and `video`
  // have no baseline slide, so the two components this change gave new reflows
  // were the two it never measured — which is exactly why a regression that put
  // premise's own `<h2>` off the top of the frame passed every gate.
  // Falling back rather than adding slides to the baseline deck is deliberate:
  // HARD RULE #8 keeps feature work out of the six long-running galleries.
  const { loadAll, manifestBucket } = require('../lib/components');
  const byName = new Map(loadAll().map((m) => [m.name, m]));
  const ownGallerySlide = (c) => {
    const m = byName.get(c);
    if (!m) return null;
    const p = path.join(ROOT, 'lib', 'components', manifestBucket(m), c, `${c}.gallery.md`);
    if (!fs.existsSync(p)) return null;
    const own = fs.readFileSync(p, 'utf8').split(/^---\s*$/m);
    const hit = own.map((s) => ({ s, tokens: classTokens(s) }))
      .find((x) => x.tokens.has(c) && !x.tokens.has('title'));
    return hit ? hit.s.trim() : null;
  };
  const unrenderable = [];
  for (const c of comps) {
    const hit = tokenised.find((x) => x.tokens.has(c));
    if (hit) { picked.push({ comp: c, body: hit.s.trim() }); continue; }
    const own = ownGallerySlide(c);
    if (own) { picked.push({ comp: c, body: own }); continue; }
    unrenderable.push(c);
  }
  if (unrenderable.length) {
    throw new Error(
      `family-overflow oracle: no slide to render for ${unrenderable.join(', ')} — neither the `
      + 'baseline gallery nor the component\'s own gallery deck has one. The record must not claim '
      + 'coverage it does not have; give the component a gallery slide or remove it from the roster.',
    );
  }
  // The deck carries NO split directive — there is none to carry. This record measures
  // the UN-SPLIT terminal of the Fit Ladder on purpose ("what clips when nothing
  // paginates"), which is INSTRUMENTATION, so it is bought with the emulator's
  // `--no-split` flag at the call site below rather than with a line in the deck. Without
  // it the sweep would paginate, the 1:1 page↔component mapping would break, and the
  // record would quietly start measuring something else entirely.
  const src = `---\nmarp: true\ntheme: indaco\nsize: ${size}\npaginate: true\n---\n\n`
    + picked.map((p) => p.body).join('\n\n---\n\n') + '\n';
  return { src, comps: picked.map((p) => p.comp) };
}

/**
 * Render one sweep deck and return `{ log, html, order }` — the emulator's combined
 * output, the path to the `.html` sidecar it wrote, and the page↔component roster.
 *
 * ONE renderer for both halves of this file. The clip oracle greps `log`; the
 * conformance pass (below) opens `html` in a browser and reads computed style. They
 * measure different things about the SAME render, and rendering the catalog twice to
 * ask two questions about it would double the tool's cost for nothing.
 */
function renderSweep(size, comps) {
  const { src, comps: order } = sweepDeck(size, comps);
  const file = path.join(ROOT, '.scratch', `family-sweep-${size}.md`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, src);
  // Keep the artifact where the conformance pass can find it. The emulator writes its
  // `.html` sidecar beside the PDF it is given, so naming the PDF names the HTML.
  const pdf = path.join(os.tmpdir(), `fs-${size}-${process.pid}.pdf`);
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
      [path.join(ROOT, 'lattice-emulator.js'), file, pdf, 'indaco', '--no-split'],
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
  return { log, html: pdf.replace(/\.pdf$/, '.html'), order };
}

/** The component names whose slide overflowed in one sweep. */
function clippedAt(size, comps) {
  const { log, order } = renderSweep(size, comps);
  // The emitted line wraps, so match across it: "⚠ OVERFLOW … pages 3, 7, 11."
  const m = log.match(/OVERFLOW[\s\S]*?pages?\s+([\d,\s]+)/);
  if (!m) return [];
  // Page N is slide N — the front matter emits no slide, and the sweep sets no
  // `autosplit`, so the 1:1 page↔component mapping holds. A component that split
  // would break it, which is why a page number past the roster is a hard error.
  return m[1].split(',').map((n) => parseInt(n.trim(), 10)).filter(Boolean).map((n) => {
    const c = order[n - 1];
    if (!c) throw new Error(`family-overflow oracle: page ${n} has no component (a slide split?) — the page↔component mapping is broken; fix the sweep before trusting this record.`);
    return c;
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
  console.log('\noverflow oracle — gallery slide per family-reflowing component');
  for (const s of SIZES) {
    const now = fresh[s.size];
    const was = (blessed.clipped?.[s.size] || []).slice().sort();
    const added = now.filter((c) => !was.includes(c));
    const gone = was.filter((c) => !now.includes(c));
    if (added.length) {
      bad++;
      console.log(`  ${s.size.padEnd(9)} NEW CLIPS: ${added.join(', ')} — this family's reflow now overflows the frame where it did not. Fix the layout; do not bless it away.`);
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
  const splitPath = path.join(ROOT, 'test', 'oracle', 'split-oracle.json');
  const split = JSON.parse(fs.readFileSync(splitPath, 'utf8')).components;
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
 * and the budget falls out — the sweep already renders one deck per @size, and this reads
 * the DOM of those same renders rather than adding 165 more.
 *
 * Per (component × @size), four honest states:
 *   fires     the family-scoped selector matches, AND at least one property it declares
 *             computes differently from the same element in the `wide` render
 *   no-effect it matches, but nothing it declares changes the computed style — either
 *             redundant with the base rule, or LOSING a cascade fight. Not a failure on
 *             its own; it is the cell a human has to look at
 *   inert     the component ships a rule for this family and NOTHING matches it. This is
 *             the #1218 bug, and it is the state this pass exists to catch
 *   n/a       the component ships no rule for this family — nothing was promised
 *
 * The `wide` column is `n/a` by construction: `wide` is the ABSENCE of the stamp
 * (`familySelector('wide')` is `:where(section:not([data-family]))`), so no
 * `[data-family=…]` rule can match there. That is what makes it the baseline.
 */
const CONFORMANCE_ORACLE = path.join(ROOT, 'test', 'oracle', 'family-conformance.json');

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
  const wide = renderSweep('hd', comps);
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

  const table = {};
  for (const s of SIZES) {
    const r = s.size === 'hd' ? wide : renderSweep(s.size, comps);
    const per = await measureSweep(browser, r.html, rules);
    fs.rmSync(r.html, { force: true });
    table[s.size] = {};
    r.order.forEach((comp, i) => {
      const at = per[i];
      if (!at) { table[s.size][comp] = 'unrendered'; return; }
      // Only the rules that NAME this component are its promise. A rule matching inside its
      // slide but belonging to shared chrome (the masthead carries family rules too) is not
      // this component's tier, and counting it would let a component inherit a green it never
      // earned. Negations are stripped first: `:not(.stats)` inside a `math` selector is not
      // `stats` promising anything — it is `math` promising to exclude it.
      const positive = (sel) => sel.replace(/:not\([^()]*\)/g, ' ');
      const mine = rules.filter((x) => new RegExp(`(^|[^\\w-])${comp}([^\\w-]|$)`).test(positive(x.sel)));
      const forFamily = mine.filter((x) => x.sel.includes(`"${at.family}"`));
      if (!forFamily.length) { table[s.size][comp] = 'n/a'; return; }
      const matched = forFamily.filter((x) => at.scoped[x.sel]);
      if (!matched.length) {
        // NOTHING matched — two very different reasons, and calling both `inert` would cry
        // wolf. If the rule's non-family part finds no element either, the slide simply does
        // not carry what the rule targets (a variant it is scoped to, or one it excludes), so
        // the tier was never exercised. If the de-scoped selector DOES find the element, the
        // family predicate is the only thing that failed — the #1218 defect exactly.
        //
        // Not hypothetical: six of the first seven `inert` cells were `q-and-a` (rule scoped
        // `.grid`, sweep slide is plain) and `list-steps` (rule scoped `:not(.timeline)`,
        // sweep slide IS the timeline one). Reporting those as dead tiers would have been a
        // confident, wrong, expensive claim.
        table[s.size][comp] = forFamily.some((x) => at.reachable[x.sel]) ? 'inert' : 'unexercised';
        return;
      }
      // THE EFFECT TEST — same element, same render, same viewport, stamp on vs stamp off.
      // A rule counts as having an effect only if ITS OWN declared properties move; a sibling
      // rule moving is not evidence about this one. (The old test took `.some()` across all
      // matched rules against a different-sized render, so one sibling reading a different px
      // voted `fires` for a tier that had been reverted outright.)
      const withEffect = matched.filter((x) => {
        const on = at.scoped[x.sel], off = at.withoutStamp[x.sel];
        return off && on.some((v, k) => v !== off[k]);
      });
      // EVERY matched rule must earn its own green — `some()` is not enough.
      //
      // A component's cell aggregates per-RULE facts, and taking `some()` lets one live rule
      // mask a dead sibling. Proven against this very pass: `list` ships three family rules;
      // neutering one of them (space-evenly -> the initial value) left the cell reading `fires`
      // because the other two still moved. That is the same defect class as the confound this
      // A/B replaced, one level of granularity down, so it gets the same treatment: `fires`
      // means ALL of them did something, `partial` means some did and some did not, and
      // `partial` is the cell that wants a human.
      if (withEffect.length === matched.length) { table[s.size][comp] = 'fires'; return; }
      if (withEffect.length) {
        table[s.size][comp] = `partial:${withEffect.length}/${matched.length}`;
        return;
      }
      // Every matched rule had NO readable "off" state — the selector de-scopes to nothing, so
      // the rule cannot be switched off without also losing the element. That is the
      // instrument admitting it is blind here, and it must not borrow a defect's name: the old
      // pass called this `no-effect` and then published a diagnosis ("redundant, or losing a
      // cascade fight") that was false for all three of its instances.
      const anyBaseline = matched.some((x) => at.withoutStamp[x.sel]);
      table[s.size][comp] = anyBaseline ? 'no-effect' : 'no-baseline';
    });
  }
  return { table, ruleCount: rules.length };
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
  const { table, ruleCount } = await conformanceSweep(browser, comps);
  const sizes = Object.keys(table);
  const tally = {};
  for (const s of sizes) for (const v of Object.values(table[s])) tally[v] = (tally[v] || 0) + 1;

  const w = Math.max(...comps.map((c) => c.length), 9);
  console.log(`\nfamily-tier CONFORMANCE — ${comps.length} components x ${sizes.length} @sizes `
    + `= ${comps.length * sizes.length} cells, from ${ruleCount} family-scoped rules\n`);
  console.log(`${'component'.padEnd(w)}  ${sizes.map((s) => s.padEnd(12)).join('')}`);
  for (const c of comps) {
    console.log(`${c.padEnd(w)}  ${sizes.map((s) => String(table[s][c] || '—').padEnd(12)).join('')}`);
  }
  console.log(`\n  ${Object.entries(tally).sort().map(([k, v]) => `${k}: ${v}`).join(' · ')}`);
  console.log('  fires     = EVERY rule the component ships for this family matched, and removing the');
  console.log('              stamp IN THIS RENDER moved a property each one declares — same element,');
  console.log('              same box, rule on vs off');
  console.log('  partial:n/m = n of m matched rules had an effect; the rest are redundant or dead.');
  console.log('              One live rule must not vote green for a dead sibling');
  console.log('  no-effect = it matched, the off-state was readable, and nothing it declares moved:');
  console.log('              redundant with the base rule, or losing a cascade fight');
  console.log('  no-baseline = it matched but cannot be switched off without losing the element too,');
  console.log('              so this pass is BLIND here — not a verdict about the component');
  console.log('  inert     = the component ships a rule for this family and nothing matched it (#1218\'s bug)');
  console.log('  unexercised = a rule exists, but this slide does not carry what it targets — the sweep');
  console.log('              never tested it. A COVERAGE gap in the roster, not a defect in the component');
  console.log('  n/a       = nothing promised for this family (every cell at hd, which IS the baseline)');

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
  if (!drift.length) { console.log('\nconformance OK — every cell matches the record.'); return 0; }
  console.error(`\n${drift.length} cell(s) drifted from ${path.relative(ROOT, CONFORMANCE_ORACLE)}:`);
  console.error(drift.join('\n'));
  console.error('\nRead the diff before re-blessing: `fires -> inert` is a tier that stopped firing.');
  return 1;
}

const CONFORMANCE_NOTE = [
  'Does each family-reflowing component\'s [data-family] tier actually FIRE at each @size?',
  'DERIVED, never hand-marked: `node tools/check-family-tiers.js --conformance` renders one sweep',
  'per @size and reads the rendered DOM. `fires` = a rule naming this component matched, and removing',
  'the data-family stamp FROM THAT SAME RENDER changed one of the properties THAT RULE declares —',
  'same element, same viewport, rule on vs rule off. An earlier cut compared against the `hd` render',
  'instead, which was confounded: every --sp-* rides --canvas-scale and every --fs-* rides cqi, so any',
  'scale-derived length differs between boxes whatever the family predicate does — three deliberately',
  'reverted tiers passed it. `no-effect` = matched, off-state readable, nothing it declares moved:',
  'redundant or losing a cascade fight. `no-baseline` = matched but not switchable off without losing',
  'the element too, so the pass is blind there rather than making a claim. `inert` = ships a rule for that',
  'family and the element IS present but the family predicate did not match — the #1218 defect this',
  'pass exists to catch. `unexercised` = a rule exists but the sweep slide does not carry what it',
  'targets (a variant it is scoped to, or one it excludes), so the tier was never tested: a coverage',
  'gap in the roster, not a defect. `n/a` = nothing',
  'promised. Every hd cell is n/a by construction: `wide` is the ABSENCE of the stamp, so no',
  '[data-family=] rule can match there — that is what makes it the baseline. The check is EXACT in both',
  'directions, because a tier being fixed must move the record just as loudly as one going dead.',
].join(' ');

// Same short-circuit shape as `--presets`: a REPORT/gate that must not also run the tier
// probe and the clip oracle. Checked inside the main IIFE below, which already launches
// the browser this needs — a top-level `return` would be legal under the CommonJS module
// wrapper but is an error to the linter, and duplicating the launch would be worse.
const CONFORMANCE_ONLY = process.argv.includes('--conformance');

if (process.argv.includes('--ladder')) process.exit(ladderReport());

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
