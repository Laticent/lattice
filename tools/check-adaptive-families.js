#!/usr/bin/env node
/**
 * check-adaptive-families — do the JS and the CSS agree on what family a deck is?
 *
 * THE DEFECT THIS EXISTS FOR (#1218). The adaptive family model is classified
 * TWICE, against two different boxes:
 *
 *   · JS  — `familyFor(width / height)` on the DECK geometry
 *           (lib/engine/css.js `orientationFor`, which stamps `data-orientation`).
 *   · CSS — `@container lattice (aspect-ratio …)`, which a container query
 *           evaluates on the container's CONTENT box.
 *
 * `section` is `container-type: size` and carries asymmetric padding (more
 * vertical than horizontal), so its content box is proportionally WIDER than the
 * deck. With ONE set of boundary numbers used for both, a 1080x1080 deck
 * classified `square` in JS while the CSS saw 1.078 and matched `wide` — so every
 * `@container lattice (aspect-ratio <= 1.05)` rule in the library (18 files) was
 * INERT on square decks. Silent: nothing rendered wrong, the square tier simply
 * never ran, and no test could see it because both halves were internally
 * consistent.
 *
 * The fix splits the numbers (`BOUNDARIES` vs `CSS_BOUNDARIES` in
 * lib/adaptive/families.js). This gate is what keeps them honest: fixed numbers
 * are only correct while they sit in the GAPS between the aspects a deck can
 * actually have, and three things can move a deck out of its gap —
 *
 *   1. a theme registering a new `@size` at a new aspect,
 *   2. a change to the section's padding (it decides the drift),
 *   3. someone "tidying" one list into the other.
 *
 * All three fail here instead of silently disabling a tier.
 *
 * HOW. Renders one deck per registered `@size` through `lattice-emulator.js`,
 * reads `--lat-family` (stamped on `.cell-stage` by lib/base/base.elements.css —
 * the CSS's own verdict, not a recomputation), and compares it to `familyFor()`
 * on the rendered section's BORDER box. Reading the stamp rather than
 * re-deriving is the point: it reports which branch the cascade actually took.
 *
 * Usage:
 *   node tools/check-adaptive-families.js            # gate: exit 1 on disagreement
 *   node tools/check-adaptive-families.js --report   # per-size numbers
 *
 * Needs a Chromium (CHROME_PATH or the puppeteer cache). With none it SKIPS
 * loudly and exits 0 — never a false green (HARD RULE #23). On-demand: it costs
 * one emulator render per size, so it is not in the browser-free `build:check`.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const EMULATOR = path.join(ROOT, 'lattice-emulator.js');
const { familyFor, BOUNDARIES, CSS_BOUNDARIES } = require('../lib/adaptive/families.js');
const { parseSizes } = require('../lib/engine/css.js');

// A minimal deck that renders one ordinary content section with a `.cell-stage`.
// Deliberately plain: the question is the SECTION's family, and a component with
// its own container queries would only add noise.
const PROBE_DECK = '<!-- _class: content -->\n<!-- _footer: "probe" -->\n\n## Probe.\n\n- One\n- Two\n';

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

/** Every registered `@size` name, from the same source the emulator validates against. */
function registeredSizes() {
  const names = new Set();
  for (const rel of ['lattice.css', 'themes/indaco.css']) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    try { for (const k of parseSizes(fs.readFileSync(abs, 'utf8')).keys()) names.add(k); } catch { /* skip */ }
  }
  return [...names].sort();
}

async function main() {
  const report = process.argv.includes('--report');
  const chrome = resolveChrome();
  if (!chrome) {
    console.error('check-adaptive-families: no Chromium (set CHROME_PATH) — SKIPPED, nothing verified.');
    process.exit(0);
  }

  const sizes = registeredSizes();
  if (!sizes.length) {
    console.error('check-adaptive-families: no registered @size names found — cannot verify.');
    process.exit(2);
  }

  const puppeteer = require('puppeteer');
  const scratch = [];
  const rows = [];
  let browser;
  let failed = false;

  try {
    browser = await puppeteer.launch({ executablePath: chrome, args: ['--no-sandbox'] });
    for (const size of sizes) {
      const slug = size.replace(/[^\w-]/g, '-');
      const md = path.join(ROOT, '.scratch', `.families-${slug}-${process.pid}.md`);
      const base = path.join(os.tmpdir(), `families-${slug}-${process.pid}`);
      scratch.push(md, `${base}.pdf`, `${base}.html`);
      fs.mkdirSync(path.dirname(md), { recursive: true });
      fs.writeFileSync(md, `---\nsize: ${size}\ntheme: indaco\n---\n\n${PROBE_DECK}`);
      execFileSync(process.execPath, [EMULATOR, md, `${base}.pdf`, 'indaco', '-q'], {
        cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], timeout: 10 * 60_000,
      });

      const page = await browser.newPage();
      await page.goto(`file://${base}.html`, { waitUntil: 'networkidle0', timeout: 120_000 });
      const m = await page.evaluate(() => {
        const sec = document.querySelector('section');
        const stage = sec?.querySelector('.cell-stage');
        if (!sec || !stage) return null;
        const r = sec.getBoundingClientRect();
        const cs = getComputedStyle(sec);
        // CONTENT box = border box - padding - BORDER. The border matters: the
        // section carries a `border-top` (the spectrum strip), and omitting it
        // understates the aspect enough to misreport which side of a boundary a
        // deck sits on — the reported number would contradict the CSS's verdict.
        const cw = r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
          - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth);
        const ch = r.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
          - parseFloat(cs.borderTopWidth) - parseFloat(cs.borderBottomWidth);
        return {
          deckAspect: r.width / r.height,
          contentAspect: cw / ch,
          cssFamily: getComputedStyle(stage).getPropertyValue('--lat-family').trim(),
        };
      });
      await page.close();

      if (!m) { console.error(`  ✗ ${size}: no section/.cell-stage rendered — cannot read the CSS verdict.`); failed = true; continue; }
      if (!m.cssFamily) { console.error(`  ✗ ${size}: --lat-family is empty; the stamp in lib/base/base.elements.css did not match any branch.`); failed = true; continue; }

      const jsFamily = familyFor(m.deckAspect);
      const agree = jsFamily === m.cssFamily;
      if (!agree) failed = true;
      rows.push({ size, ...m, jsFamily, agree });
    }

    if (report || failed) {
      console.log(`\n${'size'.padEnd(12)}${'deck'.padStart(8)}${'content'.padStart(10)}  ${'JS'.padEnd(8)}${'CSS'.padEnd(8)}`);
      for (const r of rows) {
        console.log(
          `${r.size.padEnd(12)}${r.deckAspect.toFixed(3).padStart(8)}${r.contentAspect.toFixed(3).padStart(10)}  ` +
          `${r.jsFamily.padEnd(8)}${r.cssFamily.padEnd(8)}${r.agree ? '' : '  ← DISAGREE'}`,
        );
      }
    }

    if (failed) {
      console.error(
        '\ncheck-adaptive-families FAILED — the JS and CSS classifications disagree.\n\n' +
        `  deck boundaries (JS):  ${BOUNDARIES.join(', ')}\n` +
        `  CSS boundaries:        ${CSS_BOUNDARIES.join(', ')}\n\n` +
        '  A container query measures the container CONTENT box, which is wider than the\n' +
        '  deck box, so the two lists are deliberately different numbers for the same bands.\n' +
        '  A disagreement means a boundary no longer sits in the gap between real deck\n' +
        '  aspects — most likely a new @size, or a change to the section padding that moved\n' +
        '  the drift. Re-measure with --report and retune CSS_BOUNDARIES in\n' +
        '  lib/adaptive/families.js (and the literals in the component CSS, which the\n' +
        '  families drift test pins).\n',
      );
    } else {
      console.log(`check-adaptive-families: ${rows.length} registered @size(s) — JS and CSS agree on every family.`);
    }
  } finally {
    if (browser) await browser.close();
    for (const f of scratch) { try { fs.unlinkSync(f); } catch { /* best effort */ } }
  }
  if (failed) process.exit(1);
}

if (require.main === module) {
  main().catch((err) => { console.error(`check-adaptive-families: ${err?.stack || err}`); process.exit(2); });
}

module.exports = { registeredSizes };
