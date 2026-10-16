/**
 * The component contract's RENDER tier — nightly, REPORT-ONLY.
 * Design: engineering/decisions/2026-10-15-conformance-harness.md §6.2, §6.4, §9 phase 2, §12.4.
 *
 * This file lives in test/integration/components/, which `npm run test:integration:nightly` already
 * globs and the per-PR `test:integration:pr` does not: so it runs nightly with no workflow edit and
 * adds no minutes to a PR. §12.4 says the per-PR render budget is MEASURED here and set by the owner
 * before any of this blocks anything.
 *
 * WHAT FAILS THIS FILE, AND WHAT DOES NOT. A finding (a slide that overflows, a run under AA, an
 * axe violation, a card-row disagreement) is PRINTED and written to
 * `.scratch/conformance-render/report.json`; it never fails the file. What fails it is the harness
 * going blind or a probe that cannot bite (§6.3 rules 4 and 5):
 *   · reach   — the deck did not render every component, a slide carries no owner, or the palette
 *               sweep covered fewer palettes than ship;
 *   · bite    — each probe is run on a slide made to fail it and on its near-twin that passes, so
 *               "no findings" cannot mean "the probe is broken". Mutating the page in place is the
 *               fixture: the failing arm is the twin plus one injected defect.
 *
 * TWO PARTS, TWO COSTS. The `bite` tests take seconds (small decks) and always run, so a probe
 * that stops being able to fail is caught on the nightly slice. The MATRIX (every variant slide x
 * every shipped palette: the reach and report tests) is held behind `CONFORMANCE_RENDER=1`,
 * because measured on 2026-10-16 it costs tens of minutes (the figures are in the decision note,
 * section 13) and §12.4 gives the owner the call on spending that nightly. Wiring it in is one
 * environment variable on one step; this file does not make that call by running it on its own.
 *
 * Needs Chromium (CHROME_PATH). Local iteration: `CONFORMANCE_RENDER=1 CONF_ONLY=stats,kpi node --test <this file>`.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer');

const { runEmulator, ROOT } = require('../../helpers/render');
const { deckFromSample } = require('../../helpers/semantic-render');
const { runMatrix, summarize, formatReport, probeOverflow, probeCardRows, probeAxe } = require('../../../tools/conformance-render');
const { PROBE } = require('../../../tools/check-slide-contrast');
const { offenders } = require('../../../tools/palette-sweep');

const ONLY = (process.env.CONF_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);
const REPORT = path.join(ROOT, '.scratch', 'conformance-render', 'report.json');
const MIN_PALETTES = 33;
const MATRIX = process.env.CONFORMANCE_RENDER === '1';

const manifest = (name) => {
  for (const b of fs.readdirSync(path.join(ROOT, 'lib', 'components'))) {
    const f = path.join(ROOT, 'lib', 'components', b, name, `${name}.manifest.json`);
    if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  }
  throw new Error(`no manifest for ${name}`);
};

describe('component conformance, render tier (report-only)', () => {
  let report;
  let summary;
  let browser;

  before(async () => {
    browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--font-render-hinting=none'] });
    if (!MATRIX) return;
    report = await runMatrix({ only: ONLY.length ? ONLY : null, log: (m) => process.stderr.write(`  · ${m}\n`) });
    const corpus = JSON.parse(fs.readFileSync(path.join(ROOT, 'test', 'conformance', 'card-row-corpus.json'), 'utf8'));
    summary = summarize(report, ONLY.length ? {} : corpus.labels);
    fs.mkdirSync(path.dirname(REPORT), { recursive: true });
    fs.writeFileSync(REPORT, JSON.stringify({ timing: report.timing, summary: { ...summary, components: summary.components.map((c) => ({ ...c, contrast: Object.fromEntries(c.contrast) })) } }, null, 1));
    // The report goes to stderr so the nightly log carries it whether or not anything fails.
    process.stderr.write(`${formatReport(report, summary)}\n`);
  }, { timeout: 3 * 60 * 60 * 1000 });

  after(async () => { if (browser) await browser.close(); });

  describe('reach — the harness is not blind (§6.3 rule 5)', { skip: !MATRIX && 'set CONFORMANCE_RENDER=1 to run the matrix' }, () => {
    test('every component has a slide of its own, and no slide lacks a gallery header', () => {
      const empty = summary.components.filter((c) => c.slides === 0).map((c) => c.name);
      assert.deepEqual(empty, []);
      assert.deepEqual(summary.unowned, []);
    });
    test('the deck is the galleries: at least one slide per variant and a title per component', () => {
      if (ONLY.length) return;
      assert.ok(report.index.length >= 850, `only ${report.index.length} slides rendered; the 75 galleries carry 858`);
    });
    test('every shipped palette was swept, and each probed real text', () => {
      if (ONLY.length) return;
      assert.ok(report.swept.palettes.length >= MIN_PALETTES, `swept ${report.swept.palettes.length} palettes`);
      for (const p of report.swept.palettes) assert.ok(p.applied, `${p.theme}: the swapped sheet did not take (the sweep's oracle check failed)`);
      for (const p of report.swept.palettes) assert.ok(p.rows >= 4000, `${p.theme}: ${p.rows} text runs; the probe is not reaching the deck`);
      assert.ok(report.swept.distinctPaints >= 10, `only ${report.swept.distinctPaints} distinct painted canvases: the matrix collapsed`);
    });
    test('axe ran (a run that threw would look like a clean page; the bite test proves it can flag)', () => {
      assert.ok(Array.isArray(report.axeViolations));
      assert.ok(report.timing.axeMs > 0);
    });
  });

  describe('bite — each probe fails on a defect and passes on its twin (§6.3 rule 4)', () => {
    /** A page for a small deck, rendered through the same emulator as the matrix. */
    const open = async (md, key) => {
      const file = path.join(ROOT, '.scratch', 'conformance-render', `bite-${key}.md`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, md);
      const html = runEmulator(file, {}).replace(/\.pdf$/, '.html');
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
      await page.goto(`file://${html}`, { waitUntil: 'networkidle0' });
      await page.evaluate(async () => { try { await document.fonts.ready; } catch { /* no Font Loading API */ } });
      return page;
    }

    test('fits: a 24-stop agenda overflows; the shipped sample does not', async () => {
      const stops = Array.from({ length: 24 }, (_, i) => `- Stop ${i + 1}\n  - A line of detail for stop ${i + 1}.`).join('\n');
      const bad = await open(deckFromSample(`<!-- _class: agenda -->\n\n## Agenda\n\n${stops}\n`), 'agenda-24');
      const good = await open(deckFromSample(manifest('agenda').sample), 'agenda-sample');
      try {
        assert.equal((await probeOverflow(bad)).some((s) => s.over), true, 'the 24-stop agenda should overflow');
        assert.equal((await probeOverflow(good)).some((s) => s.over), false, 'the shipped agenda sample should fit');
      } finally { await bad.close(); await good.close(); }
    });

    test('contrast: pale text on the page is flagged; the untouched twin is clean', async () => {
      const page = await open(deckFromSample(manifest('quote').sample), 'quote-sample');
      try {
        const clean = offenders(await page.evaluate(PROBE), new Set());
        assert.deepEqual(clean.map((r) => `${r.text} ${r.r}`), [], 'the shipped quote sample should be AA-clean on indaco');
        await page.addStyleTag({ content: 'section, section * { color: #d4d4d4 !important; background-color: #ffffff !important; }' });
        const bad = offenders(await page.evaluate(PROBE), new Set());
        assert.ok(bad.length > 0, 'light grey on white should be flagged');
      } finally { await page.close(); }
    });

    test('axe: an image with no alt is flagged; the untouched twin is clean', async () => {
      const page = await open(deckFromSample(manifest('quote').sample), 'quote-sample');
      try {
        assert.deepEqual((await probeAxe(page)).map((v) => v.id), [], 'the shipped quote sample should be axe-clean');
        await page.evaluate(() => { const i = document.createElement('img'); i.src = 'data:image/gif;base64,R0lGODlhAQABAAAAACw='; document.querySelector('section[data-lattice-slide]').appendChild(i); });
        assert.ok((await probeAxe(page)).some((v) => v.id === 'image-alt'), 'an <img> with no alt should be flagged');
      } finally { await page.close(); }
    });

    test('card-row: stats (a row of equal cards) is a hit; quote (one block) is a miss', async () => {
      const hit = await open(deckFromSample(manifest('stats').sample), 'stats-sample');
      const miss = await open(deckFromSample(manifest('quote').sample), 'quote-sample');
      try {
        assert.equal((await probeCardRows(hit)).some((s) => s.cardRow), true, 'stats should trigger');
        assert.equal((await probeCardRows(miss)).some((s) => s.cardRow), false, 'quote should not trigger');
      } finally { await hit.close(); await miss.close(); }
    });
  });

  describe('report — findings are printed, never failed on', { skip: !MATRIX && 'set CONFORMANCE_RENDER=1 to run the matrix' }, () => {
    test('the report was written', () => {
      assert.ok(fs.existsSync(REPORT));
      const j = JSON.parse(fs.readFileSync(REPORT, 'utf8'));
      assert.ok(j.timing.renderMs > 0);
    });
  });
});
