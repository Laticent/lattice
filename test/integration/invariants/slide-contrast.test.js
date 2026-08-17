/**
 * SLIDE CONTRAST — the rendered-DOM WCAG gate over the long-running galleries.
 *
 * WHY THIS FILE EXISTS. `tools/check-slide-contrast.js` has measured the real DOM
 * since #1207 and has found every contrast defect this repo has shipped — including
 * both causes in `2026-08-17-dark-surface-ink.md` and the `journey` stage labels
 * (#1702) fixed in this same change. It found them all IN ONE RUN. It was simply
 * on-demand, so the only detector that ever fired was a human being bothered by a
 * slide. This wires the existing measurement to CI so a new sub-threshold run fails
 * the build instead of waiting to be noticed.
 *
 * ONE MEASUREMENT, NOT TWO. `PROBE` is imported from the tool itself rather than
 * reimplemented here. `axe-a11y.test.js` disables its own `color-contrast` rule with
 * the note that "ONE gate should own contrast … two gates disagreeing about a ratio is
 * worse than one gate owning it" — a second, drifting copy of the WCAG arithmetic here
 * would be exactly that. The tool owns the number; this file owns the POLICY.
 *
 * READ THE TEST NAMES LITERALLY. This gate does NOT assert "every text run on these
 * decks clears WCAG AA", and an earlier version of this file said exactly that in its
 * title while three separate exclusions ran underneath it. What it asserts is that **no
 * run outside a written-down exclusion falls below its threshold, and no exclusion
 * grows.** The three exclusions, all now counted:
 *
 *   1. `SANCTIONED_CONTRAST_EXEMPTIONS` — permanent. Runs no contrast change could ever
 *      satisfy (decorative by contract, or unmeasurable). EXACT per-surface, per-tag
 *      counts; grows or shrinks and the gate fails.
 *   2. `PREEXISTING_CONTRAST_BACKLOG` — real defects that predate this gate and belong
 *      to other components. CEILING-only: growth fails, progress prints and invites
 *      lowering the number.
 *   3. `EXEMPT_TIER_FLOOR` — the palette's WCAG-exempt decorative ink tier
 *      (`--text-muted` / `--border`), which the prober drops before this file sees it.
 *      That tier is 21.6% of all runs and was previously invisible; it is now held to
 *      the 3:1 graphical floor. See its comment — this is the hole an adversarial
 *      review drove a 297-run regression through.
 *
 * WHAT THIS STILL DOES NOT COVER, stated so the green is not read as more than it is:
 *   · THREE surfaces, not the 32-palette matrix. A palette-wide ink defect is the unit
 *     tier's job (`test/unit/palette/journey-stage-contrast.test.js` sweeps all 32 ×
 *     both schemes analytically). Neither tier subsumes the other: #1702 showed 3
 *     failing runs here and 31 of 64 pairs there.
 *   · Four components appear on no gated surface (`matrix-grid`, `scene`, `video`,
 *     `premise`) and are therefore ungated.
 *   · ONE viewport (1280×720) and the export shell only — never the player, the
 *     Playground, or a real device.
 *   · A same-surface, same-tag swap inside one matcher (fix one `image` `<h2>` while
 *     regressing another) keeps a cell unchanged and is not caught.
 *   · Occluded runs, raster backdrops, and the `absorb()` compositing error — see the
 *     tool's own header, which names each.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const puppeteer = require('puppeteer');
const { ROOT, runEmulator } = require('../../helpers/render');
const { PROBE } = require('../../../tools/check-slide-contrast.js');

/**
 * The gated surfaces: a light component catalog, the same catalog dark (ink bugs pick a
 * side — #1702 was light-only and the comment that caused it was fixing a dark-only
 * defect), and real editorial prose, which a component catalog explicitly is not.
 *
 * Three renders is a deliberate ceiling. Measured: this file is 48s standalone against a
 * `test:integration:pr` tier of 617s whose critical path is `export-formats` at 371s, so
 * the marginal wall clock is ~0. A fourth surface should still name the failure mode it
 * buys.
 */
const SURFACES = [
  { id: 'gallery @ indaco', deck: path.join(ROOT, 'test/integration/baseline-decks/gallery.md'), palette: 'indaco' },
  { id: 'gallery @ indaco-dark', deck: path.join(ROOT, 'test/integration/baseline-decks/gallery.md'), palette: 'indaco-dark' },
  { id: 'gallery-jargon @ indaco', deck: path.join(ROOT, 'examples/gallery-jargon.md'), palette: 'indaco' },
];

/**
 * SANCTIONED_CONTRAST_EXEMPTIONS — runs that report below threshold and are NOT defects.
 *
 * The bar is absolute: **no contrast change could ever satisfy this run.** Decorative by
 * contract, or unmeasurable by this tool. Anything fixable belongs in the backlog below,
 * or in a fix.
 *
 * WHY COUNTS AND NOT JUST MATCHERS. An adversarial review found the hole: the first cut
 * of `raster-backdrop` matched any non-`none` `background-image`, which is 13.5% of all
 * runs (this engine draws RULES with two-stop gradients), and an injected 1.11:1
 * regression on `glossary th` was absorbed with the gate green. The matcher is now narrow
 * (`url()` only, 0.4% of runs) — but breadth is the wrong thing to rely on twice. A count
 * cannot widen by accident, and pinning the TAG as well as the surface catches a
 * cross-tag swap.
 *
 * Deliberately NOT here, because they were fixed instead of excused: the four `split-*`
 * running headers at 1.00:1 (a paint-order bug in the prober), the three `journey` stage
 * labels at 1.87:1 (#1702), and the `journey` mood legend at 3.78:1 — which only became
 * visible once the large-text threshold was corrected.
 */
const SANCTIONED_CONTRAST_EXEMPTIONS = [
  {
    id: 'decorative-oversized-glyph',
    why: [
      'Two ornaments, one shape: the 440px section letter on `split-panel watermark`',
      '(painted with `--on-dark-watermark`, white at 12% alpha by contract) and the 660px',
      'opening quotation mark on `split-panel pullquote`. Both are single glyphs set far',
      'above reading size, sitting behind or beside the content as typographic texture —',
      'incidental decoration, which WCAG 1.4.3 exempts from the ratio. Neither can be',
      'brought to 3:1 and remain what it is: at any alpha that passes, the wash stops',
      'reading as a wash and competes with the copy in front of it. NOT routed through the',
      "tool's `exemptInks` tier, which matches on the RESOLVED composited color — these",
      'composite over whatever rail they sit on, so that set cannot recognize them.',
      'The pullquote mark was invisible to this gate until the prober stopped dropping',
      'pseudo content that has no ASCII alphanumerics.',
    ].join(' '),
    match: (r) => r.fs >= 200 && r.text.trim().length <= 2
      && ((/(^|\s)watermark(\s|$)/.test(r.cls) && r.tag === 'div')
        || (/(^|\s)pullquote(\s|$)/.test(r.cls) && r.tag.endsWith('::before'))),
    counts: {
      'gallery @ indaco': { div: 2, 'div::before': 1 },
      'gallery @ indaco-dark': { div: 2, 'div::before': 1 },
      'gallery-jargon @ indaco': { div: 2 },
    },
  },
  {
    id: 'raster-backdrop',
    why: [
      'Text over a photograph on the `image` layouts. Every backdrop in the prober is read',
      'off `backgroundColor`, and the picture (`div.lattice-bg`, a `url()` background-image)',
      'plus its `div.image-scrim` gradient are both transparent to that read — so the climb',
      'sails past them onto the section canvas and reports white-on-white. The number is not',
      'a pessimistic measurement, it is a measurement of the wrong surface; the render is',
      'white display type on a dark photo and is legible. Flagged structurally by the prober',
      'as `imgBackdrop` (which counts `url()` paint ONLY), so this matches the MECHANISM',
      'rather than a slide. Making it a real measurement needs per-pixel sampling of the',
      'decoded image behind each glyph, which the prober does not do.',
    ].join(' '),
    match: (r) => r.imgBackdrop === true,
    counts: {
      'gallery @ indaco': { h2: 1, p: 1 },
      'gallery @ indaco-dark': {},
      'gallery-jargon @ indaco': {},
    },
  },
];

/**
 * PREEXISTING_CONTRAST_BACKLOG — real defects that predate this gate, itemized and
 * ratcheted. NOT a second exemption list: an entry above is something no contrast change
 * could satisfy; an entry HERE is a debt with a number on it.
 *
 * WHERE THEY CAME FROM. Two waves, both pre-existing, both reproduced at `91913c5` in a
 * clean worktree before this branch touched anything:
 *   · #1704 taught the prober to read element `opacity` (which composites ink AND
 *     background together) but never re-measured the RENDERED galleries, so the
 *     `agenda progress-*` and `kanban` de-emphasis washes have been failing on `main`
 *     unseen since that merge.
 *   · Correcting the large-text threshold in this change — it applied WCAG's 18pt line in
 *     DECK pixels, a 6pt cutoff, grading 68.6% of runs at 3:1 instead of 4.5:1 — surfaced
 *     `compare-prose` and `redline` too.
 *
 * Fixing any of them is a design call on a component unrelated to `journey`: how much
 * emphasis may a de-emphasized row keep, how loud may a struck clause be. HARD RULE #18
 * says log an off-path pre-existing defect rather than sweep it in; HARD RULE #17 says do
 * not bolt a second feature onto this PR. But a gate that cannot go green is not a gate,
 * so they are counted rather than ignored. Tracked as #1717.
 *
 * CEILING-ONLY, and that is a deliberate reversal. An earlier cut failed in both
 * directions, on the theory that a stale ceiling lets a regression slip back underneath
 * it. Measured, that theory costs more than it buys: `agenda li` sits at 2.97:1 against a
 * 3:1 floor, so the first token retune that IMPROVES the repo reds an unrelated PR and
 * hands its author a 400-line contrast policy to edit. Do that twice and "just bump the
 * number" becomes folk wisdom, which is what the design was meant to prevent. Growth
 * fails; progress prints; a full fix trips the staleness check and forces deletion.
 */
const PREEXISTING_CONTRAST_BACKLOG = [
  {
    id: 'agenda-progress-dimming',
    why: '`section.agenda[class*="progress-"] ol > li { opacity: 0.45 }` dims every '
      + 'non-current agenda item, including its ::before counter, so the current row stands '
      + 'out. Fixing it means deciding how much emphasis that row may keep.',
    match: (r) => /\bagenda\b/.test(r.cls),
    counts: {
      'gallery @ indaco': { li: 4, 'li::before': 4 },
      'gallery @ indaco-dark': { 'li::before': 4 },
      'gallery-jargon @ indaco': { li: 4, 'li::before': 4 },
    },
  },
  {
    id: 'kanban-dimming',
    why: 'The same de-emphasis wash on `kanban` card meta — the inline code chip and the '
      + 'column-header span. Same design call, different component.',
    match: (r) => /\bkanban\b/.test(r.cls),
    counts: {
      'gallery @ indaco': { span: 2, code: 2 },
      'gallery @ indaco-dark': { span: 2, code: 2 },
      'gallery-jargon @ indaco': { span: 3 },
    },
  },
  {
    id: 'compare-prose-decision-ink',
    why: 'The `decision` verdict chip on `compare-prose` paints its label on a mid accent '
      + 'fill: 3.24:1 light, 4.06:1 dark. Surfaced by the large-text threshold correction, '
      + 'not by any code change — it has always been below AA for text this size.',
    match: (r) => /\bcompare-prose\b/.test(r.cls),
    counts: {
      'gallery @ indaco': { strong: 1 },
      'gallery @ indaco-dark': { strong: 1 },
      'gallery-jargon @ indaco': { strong: 1 },
    },
  },
  {
    id: 'redline-strike-ink',
    why: 'The struck clause on `redline` in dark mode reads 4.25:1 against a 4.5 floor. '
      + 'Also surfaced by the threshold correction. A struck clause is still content.',
    match: (r) => /\bredline\b/.test(r.cls),
    counts: {
      'gallery @ indaco': {},
      'gallery @ indaco-dark': { del: 2 },
      'gallery-jargon @ indaco': {},
    },
  },
];

/**
 * EXEMPT_TIER_FLOOR — the exclusion nobody was watching, now held to a floor.
 *
 * THE HOLE. `PROBE` resolves `--text-muted` and `--border` per section and marks any run
 * whose composited ink equals one of those values `exempt`. Every assertion in this file
 * skips those runs FIRST — before the exemption list, before the backlog, before the
 * share cap. Measured: **841 of 3888 runs (21.6%) are excluded this way.**
 *
 * An adversarial review turned that into a working attack. Softening `--text-muted` in
 * `themes/indaco.css` by one line drove **297 runs to 1.17:1** — wifi field labels and
 * logo-wall captions visibly gone from the render — and `npm test`, `build:check`, the
 * palette suite and this gate all stayed green. The tool printed "(+297 in the
 * WCAG-exempt decorative tier, not counted)" and exited 0.
 *
 * The justification was also false. Three places describe this tier as chrome
 * ("pagination/header/footer"); measured on `gallery @ indaco`, **136 of 330 exempt runs
 * are real content** — `logo-wall` company names, `wifi` `dt` labels, `pricing` and
 * `checklist` copy, chart axis numbers, `word-cloud` words. 44 `color: var(--text-muted)`
 * sites exist across 31 components.
 *
 * WHY A FLOOR RATHER THAN A COUNT OF SUB-AA RUNS. The whole tier sits just under AA by
 * design (median 4.10:1, max 4.19:1 — that is what "WCAG-exempt by palette contract"
 * means), so counting sub-4.5 runs would pin ~333 and move for no useful reason. What
 * must never happen is the tier falling through the **3:1 graphical floor** WCAG 1.4.11
 * holds non-text to. Today 14/14/12 runs are below it and are themselves a tracked
 * backlog: 13 bookend footers at 2.76:1 plus one `split-panel steps` numeral at 1.11:1
 * inked with `--border`. Ceiling-only, same reasoning as the backlog. The 297-run attack
 * takes this from 14 to ~311 and fails loudly.
 *
 * AND THE TIER'S SIZE IS PINNED TOO, because the floor alone does not close it. The same
 * review's second attack needs no theme edit at all: point a COMPONENT's ink at
 * `--text-muted` (one `var()` swap, HARD RULE #3-clean) and its runs become exempt at
 * ~4.10:1 — above the floor, so the floor never fires, and they leave the measured
 * population entirely. Reproduced: `glossary td` → `--text-muted` drops 14 body runs out
 * of the gate with every assertion green.
 *
 * So the exempt tier is treated as what it is: an OPT-OUT FROM MEASUREMENT. Its size is a
 * ceiling. Growing it means more real text is excluded from this gate, which may be
 * correct — chrome legitimately uses these tokens — but it must be a visible, argued edit
 * rather than a side effect. `size` is deliberately the count of ALL exempt runs, not
 * just failing ones, because the whole point is that failing ones are invisible.
 */
const EXEMPT_TIER_FLOOR = {
  floor: 3,
  why: 'The WCAG-exempt decorative ink tier may sit below the 4.5:1 TEXT threshold by '
    + 'palette contract, but nothing in it may fall through the 3:1 graphical floor, and '
    + 'the tier may not silently grow. Ceiling-only on both; the recorded numbers are '
    + 'themselves a backlog (#1717).',
  counts: {
    'gallery @ indaco': 14,
    'gallery @ indaco-dark': 14,
    'gallery-jargon @ indaco': 12,
  },
  size: {
    'gallery @ indaco': 333,
    'gallery @ indaco-dark': 333,
    'gallery-jargon @ indaco': 184,
  },
};

function resolveChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  for (const root of [path.join(os.homedir(), '.cache', 'puppeteer', 'chrome'), '/root/.cache/puppeteer/chrome']) {
    if (!fs.existsSync(root)) continue;
    for (const build of fs.readdirSync(root).filter((d) => d.startsWith('linux-')).sort().reverse()) {
      const bin = path.join(root, build, 'chrome-linux64', 'chrome');
      if (fs.existsSync(bin)) return bin;
    }
  }
  return undefined;
}

const fmt = (r) =>
  `p${r.page} ${r.cls || '(no class)'} <${r.tag}> ${r.fs}px/${r.w} `
  + `${r.r}:1 (need ${r.need}) fg rgb(${r.fg}) on rgb(${r.bg})${r.imgBackdrop ? ' [img backdrop]' : ''}\n`
  + `        "${r.text}"`;

/** Sub-threshold, non-exempt runs — the population every list below partitions. */
const offenders = (rows) => rows.filter((r) => r.r < r.need && !r.exempt);

/** Count a matcher's sub-threshold hits per tag on one surface. */
function tally(rows, match) {
  const out = {};
  let total = 0;
  for (const r of offenders(rows)) {
    if (!match(r)) continue;
    out[r.tag] = (out[r.tag] || 0) + 1;
    total += 1;
  }
  return { out, total };
}

describe('slide contrast — the rendered galleries, against written-down exclusions', () => {
  let browser;
  const measured = [];

  before(async () => {
    browser = await puppeteer.launch({
      executablePath: resolveChrome(),
      args: ['--no-sandbox', '--font-render-hinting=none'],
    });
    for (const s of SURFACES) {
      const pdf = runEmulator(s.deck, { palette: s.palette });
      const html = pdf.replace(/\.pdf$/, '.html');
      assert.ok(fs.existsSync(html), `no HTML sidecar for ${s.id} at ${html}`);
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
      await page.goto(`file://${html}`, { waitUntil: 'networkidle0' });
      await new Promise((r) => setTimeout(r, 400));
      measured.push({ surface: s.id, rows: await page.evaluate(PROBE) });
      await page.close();
    }
  });

  after(async () => { if (browser) await browser.close(); });

  /**
   * The green-because-nothing-ran guard. Every assertion below is vacuously true over an
   * empty row set, so a render that silently produced no slides — or a PROBE that threw
   * and returned [] — would pass this file as "0 failures". Measured today: 1518/1518/852.
   */
  test('the sweep actually measured all three surfaces', () => {
    assert.equal(measured.length, SURFACES.length, 'a surface failed to render or probe');
    for (const m of measured) {
      assert.ok(m.rows.length >= 400,
        `${m.surface}: only ${m.rows.length} text runs measured — the probe is not reaching the deck`);
    }
  });

  test('no un-exempt, un-backlogged text run falls below its threshold', () => {
    const bad = [];
    for (const m of measured) {
      for (const r of offenders(m.rows)) {
        if (SANCTIONED_CONTRAST_EXEMPTIONS.some((e) => e.match(r))) continue;
        if (PREEXISTING_CONTRAST_BACKLOG.some((e) => e.match(r))) continue;
        bad.push(`  ${m.surface}: ${fmt(r)}`);
      }
    }
    assert.deepEqual(bad, [],
      `${bad.length} text run(s) below their WCAG threshold on the rendered galleries.\n`
      + 'Fix the contrast. Add a SANCTIONED_CONTRAST_EXEMPTIONS entry ONLY if no contrast\n'
      + 'change could ever satisfy the run (decorative by contract, or unmeasurable):\n'
      + `${bad.join('\n')}\n`);
  });

  /**
   * Every recorded surface key must name a live surface, and every live surface must be
   * recorded. Without this a typo'd or stale key is simply never read — a fabricated
   * `'gallery @ TYPO': { div: 99 }` passed the ledger silently, which is the opposite of
   * a list that fails both ways.
   */
  test('every recorded surface key names a live surface, and none is missing', () => {
    const live = new Set(SURFACES.map((s) => s.id));
    const bad = [];
    const lists = [['EXEMPTIONS', SANCTIONED_CONTRAST_EXEMPTIONS], ['BACKLOG', PREEXISTING_CONTRAST_BACKLOG]];
    for (const [name, list] of lists) {
      for (const e of list) {
        for (const k of Object.keys(e.counts)) if (!live.has(k)) bad.push(`${name}/${e.id}: unknown surface "${k}"`);
        for (const s of live) if (!(s in e.counts)) bad.push(`${name}/${e.id}: no entry for "${s}"`);
      }
    }
    for (const k of Object.keys(EXEMPT_TIER_FLOOR.counts)) if (!live.has(k)) bad.push(`EXEMPT_TIER_FLOOR: unknown surface "${k}"`);
    for (const s of live) if (!(s in EXEMPT_TIER_FLOOR.counts)) bad.push(`EXEMPT_TIER_FLOOR: no entry for "${s}"`);
    assert.deepEqual(bad, [], `recorded counts do not line up with SURFACES:\n  ${bad.join('\n  ')}`);
  });

  /**
   * The exemption ledger: EXACT, both directions. A permanent exemption that grows is a
   * regression; one that shrinks is a claim the repo no longer supports — the surface was
   * fixed (delete the entry) or it moved (repair the matcher). Leaving it is how an
   * allowlist rots into a place real failures hide.
   */
  test('permanent exemptions match EXACTLY what is written down', () => {
    const problems = [];
    for (const e of SANCTIONED_CONTRAST_EXEMPTIONS) {
      let seen = 0;
      for (const m of measured) {
        const { out: actual, total } = tally(m.rows, e.match);
        seen += total;
        const expected = e.counts[m.surface] || {};
        for (const tag of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
          const exp = expected[tag] || 0;
          const got = actual[tag] || 0;
          if (got === exp) continue;
          problems.push(`${e.id} · ${m.surface} · <${tag}>: ${got} sub-threshold runs, recorded ${exp}. `
            + (got > exp
              ? 'GREW — something regressed or the matcher widened. Do not raise the number to match.'
              : `SHRANK — fix the matcher, or lower the recorded count to ${got}.`));
        }
      }
      if (seen === 0) {
        problems.push(`${e.id} matches nothing at all — it is stale. Delete it, or repair its matcher.`);
      }
    }
    assert.deepEqual(problems, [], `exemption ledger:\n  ${problems.join('\n  ')}`);
  });

  /**
   * The backlog ratchet: CEILING-only. Growth fails. Progress prints rather than failing,
   * so a PR that improves an unrelated component is not reded for it — see the list's own
   * comment for why that reversal was made. A backlog that reaches zero is stale and must
   * be deleted, which is what forces the ratchet to actually close.
   */
  test('the pre-existing backlog has not grown', () => {
    const problems = [];
    for (const e of PREEXISTING_CONTRAST_BACKLOG) {
      let seen = 0;
      for (const m of measured) {
        const { out: actual, total } = tally(m.rows, e.match);
        seen += total;
        const expected = e.counts[m.surface] || {};
        for (const tag of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
          const exp = expected[tag] || 0;
          const got = actual[tag] || 0;
          if (got > exp) {
            problems.push(`${e.id} · ${m.surface} · <${tag}>: ${got} sub-threshold runs, ceiling ${exp}. `
              + 'This GREW. Fix the regression; do not raise the ceiling.');
          } else if (got < exp) {
            console.log(`    ↓ backlog progress — ${e.id} · ${m.surface} · <${tag}>: ${got} now, `
              + `ceiling ${exp}. Lower it to ${got} to hold the new floor (#1717).`);
          }
        }
      }
      if (seen === 0) {
        problems.push(`${e.id} is fully fixed — DELETE the entry rather than leaving it at zero (#1717).`);
      }
    }
    assert.deepEqual(problems, [], `contrast backlog ratchet:\n  ${problems.join('\n  ')}`);
  });

  /**
   * The exempt decorative tier may sit under the TEXT threshold by palette contract, but
   * not under the 3:1 graphical floor. This is the guard that closes the 21.6% blind spot
   * — see EXEMPT_TIER_FLOOR's comment for the 297-run regression that walked through it.
   */
  test(`the WCAG-exempt ink tier stays above the ${EXEMPT_TIER_FLOOR.floor}:1 graphical floor`, () => {
    const problems = [];
    for (const m of measured) {
      const below = m.rows.filter((r) => r.exempt && r.r < EXEMPT_TIER_FLOOR.floor);
      const ceiling = EXEMPT_TIER_FLOOR.counts[m.surface] ?? 0;
      if (below.length > ceiling) {
        const worst = below.sort((a, b) => a.r - b.r).slice(0, 6).map((r) => `      ${fmt(r)}`).join('\n');
        problems.push(`${m.surface}: ${below.length} exempt runs below ${EXEMPT_TIER_FLOOR.floor}:1, ceiling ${ceiling}.\n`
          + '    A decorative ink token has been softened past the graphical floor. Every run\n'
          + '    inked with it is invisible to every other assertion in this file.\n'
          + `${worst}`);
      } else if (below.length < ceiling) {
        console.log(`    ↓ exempt-tier progress — ${m.surface}: ${below.length} below `
          + `${EXEMPT_TIER_FLOOR.floor}:1, ceiling ${ceiling}. Lower it to ${below.length} (#1717).`);
      }
    }
    assert.deepEqual(problems, [], `exempt-tier floor:\n  ${problems.join('\n  ')}`);
  });

  /**
   * The tier is an opt-out from measurement, so its SIZE is pinned. Pointing a component's
   * ink at `--text-muted` moves its runs above the floor and out of the gate in one
   * `var()` swap — no theme edit, no allowlist entry, no reviewer signal. That may be a
   * correct change; it may not; it must not be an invisible one.
   */
  test('the WCAG-exempt ink tier has not grown', () => {
    const problems = [];
    for (const m of measured) {
      const n = m.rows.filter((r) => r.exempt).length;
      const ceiling = EXEMPT_TIER_FLOOR.size[m.surface] ?? 0;
      if (n > ceiling) {
        problems.push(`${m.surface}: ${n} runs are inked with the exempt decorative tier, ceiling ${ceiling}. `
          + 'Something re-pointed real text at `--text-muted` / `--border`, which removes it from '
          + 'every other assertion here. If that is intended, raise the ceiling IN THIS COMMIT and '
          + 'say why; otherwise use an ink tier that is actually measured.');
      } else if (n < ceiling) {
        console.log(`    ↓ exempt-tier shrank — ${m.surface}: ${n} exempt runs, ceiling ${ceiling}. `
          + `Lower it to ${n}.`);
      }
    }
    assert.deepEqual(problems, [], `exempt-tier size:\n  ${problems.join('\n  ')}`);
  });

  /**
   * A canary on the permanent matchers. Both are narrow by construction, but a future edit
   * that broadened one (dropping the font-size floor, matching a whole layout) would
   * silently swallow real defects while the ledger was updated to match. Counts the
   * permanent list only — folding the backlog in would let a widened matcher hide behind
   * the backlog's own volume.
   */
  test('permanent exemptions stay narrow — a negligible share of all runs', () => {
    let total = 0, absorbed = 0;
    for (const m of measured) {
      total += m.rows.length;
      for (const r of offenders(m.rows)) {
        if (SANCTIONED_CONTRAST_EXEMPTIONS.some((e) => e.match(r))) absorbed += 1;
      }
    }
    assert.ok(absorbed / total < 0.005,
      `permanent exemptions absorb ${absorbed} of ${total} runs (${(100 * absorbed / total).toFixed(2)}%) — `
      + 'a matcher has been broadened past "decorative or unmeasurable" and can now hide a real defect.');
  });
});
