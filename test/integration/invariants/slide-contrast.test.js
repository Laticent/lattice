/**
 * SLIDE CONTRAST — the rendered-DOM WCAG AA gate over the long-running galleries.
 *
 * WHY THIS FILE EXISTS. `tools/check-slide-contrast.js` has measured the real DOM
 * since #1207 and has found every contrast defect this repo has shipped — including
 * both causes in `2026-08-17-dark-surface-ink.md` and the `journey` stage labels
 * (#1702) fixed in this same change. It found them all IN ONE RUN. It was simply
 * on-demand, so the only detector that ever fired was a human being bothered by a
 * slide. Every one of those defects was silent, and each cost a measurement round to
 * rediscover. This wires the existing measurement to CI so a new sub-AA run fails the
 * build instead of waiting to be noticed.
 *
 * ONE MEASUREMENT, NOT TWO. `PROBE` is imported from the tool itself rather than
 * reimplemented here. `axe-a11y.test.js` disables its own `color-contrast` rule with
 * the note that "ONE gate should own contrast … two gates disagreeing about a ratio
 * is worse than one gate owning it" — a second, drifting copy of the WCAG arithmetic
 * in this file would be exactly that. The tool owns the number; this file owns the
 * POLICY (which runs are exempt, and on what grounds).
 *
 * AN ALLOWLIST, NOT A BUDGET. A bare `expect N failures` would absorb the next real
 * defect the moment one of today's exemptions was fixed, and would say nothing about
 * WHY any row is tolerated. Following `SANCTIONED_MARGINS` (#20) and
 * `SANCTIONED_PREVIEW_BUILDERS` (#22), the exemptions below are explicit, individually
 * justified, and FAIL BOTH WAYS: an un-exempt failure errors, AND an exemption that
 * matches nothing errors as stale. Genuine failures today: ZERO.
 *
 * WHAT THIS DOES NOT COVER, stated so the green is not read as more than it is:
 *   · THREE surfaces (below), not the 32-palette matrix. A palette-wide ink defect is
 *     the unit tier's job — see `test/unit/palette/journey-stage-contrast.test.js`,
 *     which sweeps all 32 x both schemes analytically. This tier catches what only
 *     exists once a slide LAYS OUT; that tier catches what only exists across
 *     palettes. Neither subsumes the other, and #1702 needed both to be honest: the
 *     rendered gallery showed 3 failing runs, the palette sweep showed 31 of 64 pairs.
 *   · ONE viewport (1280x720) and the export shell only — never the player, the
 *     Playground, or a real device.
 *   · The `--text-muted` / `--border` decorative tier, which the palette contract
 *     makes WCAG-exempt by design; the tool buckets those separately and this gate
 *     inherits that, so chrome ink regressions are NOT caught here (tracked as
 *     G13/G15/G16 in the semantic-HTML ADR gap register).
 *   · Occluded runs and raster backdrops — see the tool's own header.
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
 * The gated surfaces. Two canvases of the component catalog plus one editorial deck:
 *
 *   gallery.md @ indaco       the whole component catalog on a LIGHT canvas
 *   gallery.md @ indaco-dark  the same catalog on a DARK one — not redundant. #1702
 *                             was light-only, and the comment that CAUSED it was
 *                             fixing a real dark-only defect. Ink bugs pick a side.
 *   gallery-jargon.md @ indaco  real editorial prose, which a component catalog is
 *                             explicitly not (`engineering/workflow.md` says so).
 *
 * Three renders is the cost ceiling chosen deliberately: renders are cached locally
 * and fresh in CI, and each surface here buys a distinct failure mode. Adding a fourth
 * should have to name the mode it buys.
 */
const SURFACES = [
  { id: 'gallery @ indaco', deck: path.join(ROOT, 'test/integration/baseline-decks/gallery.md'), palette: 'indaco' },
  { id: 'gallery @ indaco-dark', deck: path.join(ROOT, 'test/integration/baseline-decks/gallery.md'), palette: 'indaco-dark' },
  { id: 'gallery-jargon @ indaco', deck: path.join(ROOT, 'examples/gallery-jargon.md'), palette: 'indaco' },
];

/**
 * SANCTIONED_CONTRAST_EXEMPTIONS — runs that report below AA and are NOT defects.
 *
 * Each entry needs a structural `match` (never a page number — the galleries are
 * long-running and their slides move, HARD RULE #8), a written justification, and it
 * must match at least one run or the gate fails it as stale.
 *
 * Deliberately NOT here, because they were fixed instead of excused:
 *   · the four `split-*` running headers that scored 1.00:1 white-on-white. They are
 *     painted white on the dark rail and perfectly legible; the tool was approximating
 *     paint order by DOM order and discarding the rail. Fixed in the prober.
 *   · the three `journey` stage labels at 1.87:1 (#1702). A real defect, fixed in
 *     `journey.styles.css`.
 * Both were on the list this gate was scoped to absorb. An allowlist is where a
 * fixable bug goes to become permanent, so the bar for adding an entry is that no
 * contrast change could ever satisfy it.
 */
const SANCTIONED_CONTRAST_EXEMPTIONS = [
  {
    id: 'decorative-watermark',
    why: [
      'The oversized section letter on `split-panel watermark` is painted with',
      '`--on-dark-watermark` — white at 12% alpha, by contract (base.tokens.css). It is a',
      '440px single glyph behind the content, a decorative flourish rather than text',
      'content, and WCAG 1.4.3 exempts incidental/decorative text from the ratio.',
      'It cannot be brought to 3:1 without ceasing to be a watermark: at any alpha that',
      'passes, it stops reading as a wash and competes with the copy in front of it.',
      'NOT routed through the tool\'s `exemptInks` tier, which matches on the RESOLVED',
      'composited colour — the watermark composites over whatever rail it sits on, so',
      'that set cannot recognise it.',
    ].join(' '),
    match: (r) => /(^|\s)watermark(\s|$)/.test(r.cls) && r.tag === 'div' && r.fs >= 200 && r.text.trim().length <= 2,
  },
  {
    id: 'raster-backdrop',
    why: [
      'Text over a photograph or gradient on the `image` layouts. Every backdrop in the',
      'prober is read off `backgroundColor`, and the picture (`div.lattice-bg`, a',
      '`background-image`) plus its `div.image-scrim` gradient are both transparent to',
      'that read — so the climb sails past them onto the section canvas and reports',
      'white-on-white. The number is not a pessimistic measurement, it is a measurement',
      'of the wrong surface; the render is white display type on a dark photo and is',
      'legible. Flagged structurally by the prober as `imgBackdrop`, so this matches the',
      'MECHANISM rather than a slide. Making it a real measurement needs per-pixel',
      'sampling of the decoded image behind each glyph, which the prober does not do.',
    ].join(' '),
    match: (r) => r.imgBackdrop === true,
  },
];

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
  `p${r.page} ${r.cls || '(no class)'} <${r.tag}> ${r.fs}px/${r.w} ` +
  `${r.r}:1 (need ${r.need}) fg rgb(${r.fg}) on rgb(${r.bg})${r.imgBackdrop ? ' [img backdrop]' : ''}\n` +
  `        "${r.text}"`;

describe('slide contrast — every text run clears WCAG AA on the rendered galleries', () => {
  let browser;
  /** @type {{surface: string, rows: any[]}[]} */
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
   * The green-because-nothing-ran guard. Every assertion below is vacuously true over
   * an empty row set, so a render that silently produced no slides — or a PROBE that
   * threw and returned [] — would pass this file as "0 failures". Measured today:
   * 1518 / 1518 / 852. The floor is deliberately loose (galleries grow) but non-zero.
   */
  test('the sweep actually measured all three surfaces', () => {
    assert.equal(measured.length, SURFACES.length, 'a surface failed to render or probe');
    for (const m of measured) {
      assert.ok(m.rows.length >= 400,
        `${m.surface}: only ${m.rows.length} text runs measured — the probe is not reaching the deck`);
    }
  });

  test('no un-exempt text run falls below its AA threshold', () => {
    const offenders = [];
    for (const m of measured) {
      for (const r of m.rows) {
        if (r.r >= r.need || r.exempt) continue;
        if (SANCTIONED_CONTRAST_EXEMPTIONS.some((e) => e.match(r))) continue;
        offenders.push(`  ${m.surface}: ${fmt(r)}`);
      }
    }
    assert.deepEqual(offenders, [],
      `${offenders.length} text run(s) below WCAG AA on the rendered galleries.\n` +
      'Fix the contrast. Only add a SANCTIONED_CONTRAST_EXEMPTIONS entry if NO contrast\n' +
      'change could ever satisfy the run (decorative by contract, or unmeasurable):\n' +
      `${offenders.join('\n')}\n`);
  });

  /**
   * The other direction, which is the half an allowlist usually forgets. An entry that
   * stops matching is a claim the repo no longer supports — either the surface was
   * fixed (delete the entry) or it moved (fix the matcher). Leaving it is how an
   * allowlist rots into a place real failures can hide.
   */
  test('every exemption still matches at least one run (no stale entries)', () => {
    const counts = new Map(SANCTIONED_CONTRAST_EXEMPTIONS.map((e) => [e.id, 0]));
    for (const m of measured) {
      for (const r of m.rows) {
        if (r.r >= r.need || r.exempt) continue;
        for (const e of SANCTIONED_CONTRAST_EXEMPTIONS) if (e.match(r)) counts.set(e.id, counts.get(e.id) + 1);
      }
    }
    const stale = [...counts].filter(([, n]) => n === 0).map(([id]) => id);
    assert.deepEqual(stale, [],
      `SANCTIONED_CONTRAST_EXEMPTIONS entries matching nothing: ${stale.join(', ')}.\n` +
      'The surface was fixed or moved. Delete the entry, or repair its matcher — do not\n' +
      `leave it.\n  counts: ${JSON.stringify(Object.fromEntries(counts))}`);
  });

  /**
   * A canary on the matchers themselves. Both are narrow by construction, but a future
   * edit that broadened one (dropping the font-size floor, matching a whole layout)
   * would silently swallow real defects while every assertion above stayed green. The
   * exempted set is ~6 runs in ~3900 today; 0.5% is far above that and far below any
   * plausible real regression.
   */
  test('exemptions stay narrow — they absorb a negligible share of all runs', () => {
    let total = 0, absorbed = 0;
    for (const m of measured) {
      total += m.rows.length;
      for (const r of m.rows) {
        if (r.r >= r.need || r.exempt) continue;
        if (SANCTIONED_CONTRAST_EXEMPTIONS.some((e) => e.match(r))) absorbed += 1;
      }
    }
    assert.ok(absorbed / total < 0.005,
      `exemptions absorb ${absorbed} of ${total} runs (${(100 * absorbed / total).toFixed(2)}%) — ` +
      'a matcher has been broadened past "decorative or unmeasurable" and is now capable ' +
      'of hiding a real defect.');
  });
});
