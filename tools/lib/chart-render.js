/**
 * chart-render.js — render a deck and open it, for the chart probes.
 *
 * THREE chart tools (`chart-structure-census`, `chart-contrast-solve`,
 * `chart-finish-flatten`) ask different questions of the same thing: the chart
 * bucket gallery, rendered in a real browser, under a named theme and medium.
 * They were written during one investigation against a hand-built HTML file in
 * `.scratch/`, which is deleted by `npm run clean:scratch` — so each of them
 * was a tool that worked exactly once, on one machine. This is the shared
 * scaffolding that makes them re-runnable.
 *
 * It deliberately does NOT wrap puppeteer's page: what each tool evaluates in
 * the page is the interesting part and belongs in that tool.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '../..');

/** The one deck that carries every chart member exactly once. */
const CHART_GALLERY = path.join(REPO, 'lib/components/chart/chart.gallery.md');

/**
 * The classes a chart <section> carries that are frame chrome rather than the
 * member's own name. Kept here because all three tools need the same list, and
 * a drifted copy silently reports a member called `print`.
 */
const FRAME_CHROME = [
  'chart-frame', 'viz-frame', 'standard', 'print', 'dark', 'light',
  'lr', 'td', 'silent', 'title', 'has-notes', 'split', 'auto-split',
];

/**
 * Every mark each chart member declares, keyed by member name — the manifests'
 * `kernel.marks`, which is the family's own statement of what a data mark IS.
 * Read from the manifests rather than from a checked-in JSON snapshot: a
 * snapshot is a second declaration that drifts from the first.
 */
function declaredMarks() {
  const { loadAll } = require(path.join(REPO, 'lib/components'));
  const byMember = {};
  for (const m of loadAll()) {
    if (m.kernel && Array.isArray(m.kernel.marks)) byMember[m.name] = m.kernel.marks;
  }
  return byMember;
}

/**
 * Render `deck` to a standalone HTML file and return its path. The caller owns
 * the temp directory's lifetime; these are a few MB and worth keeping around
 * while a run is being read, so nothing is auto-deleted.
 */
function renderDeck(deck = CHART_GALLERY, { theme = null, label = 'chart-probe' } = {}) {
  if (!fs.existsSync(deck)) throw new Error(`no such deck — ${deck}`);
  const emulator = path.join(REPO, 'dist/lattice-emulator.js');
  if (!fs.existsSync(emulator)) {
    throw new Error('dist/lattice-emulator.js is missing — run `npm run build` first');
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `${label}-`));
  const html = path.join(dir, 'deck.html');
  const args = [emulator, deck, html];
  if (theme) args.push(theme);
  execFileSync(process.execPath, args, { stdio: ['ignore', 'ignore', 'inherit'] });
  return html;
}

/**
 * Resolve Chromium or exit with the reason. Every one of these tools measures
 * RESOLVED style, so there is no degraded mode worth offering: without a
 * browser the answer would be a guess wearing a measurement's clothes.
 */
function requireChrome(toolName) {
  const { resolveChrome } = require('./resolve-chrome.js');
  const chrome = resolveChrome();
  if (!chrome) {
    console.error(`${toolName}: no Chromium found — this measures RESOLVED style, which needs`);
    console.error('a real browser. Export CHROME_PATH (see engineering/development.md).');
    process.exit(2);
  }
  return chrome;
}

module.exports = { CHART_GALLERY, FRAME_CHROME, REPO, declaredMarks, renderDeck, requireChrome };
