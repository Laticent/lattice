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
 * Usage: node tools/check-family-tiers.js
 * Exit 1 on any disagreement; skips loudly with no Chromium.
 */
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const ROOT = process.cwd();

function resolveChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  for (const r of [path.join(os.homedir(), '.cache', 'puppeteer', 'chrome'), '/root/.cache/puppeteer/chrome']) {
    if (!fs.existsSync(r)) continue;
    for (const b of fs.readdirSync(r).filter(d => d.startsWith('linux-')).sort().reverse()) {
      const bin = path.join(r, b, 'chrome-linux64', 'chrome'); if (fs.existsSync(bin)) return bin;
    }
  }
  return undefined;
}

// Three probes, chosen so the harness proves BOTH directions:
//   stats       — stacks at square/tall/strip, row at wide. If the square TIER
//                 stopped firing this goes `row` at square, so it is the probe
//                 that would catch a #1218 regression.
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

const SIZES = [
  { size: 'hd', vp: [1920, 1080], family: 'wide' },
  { size: 'square', vp: [1080, 1080], family: 'square' },
  { size: 'portrait', vp: [1080, 1350], family: 'tall' },
  { size: 'mobile', vp: [1080, 2340], family: 'strip' },
];

(async () => {
  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch({ executablePath: resolveChrome(), args: ['--no-sandbox'] });
  const rows = [];
  for (const s of SIZES) {
    const src = path.join(ROOT, '.scratch', `vf-${s.size}.md`);
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
      };
    }));
    await page.close();
    fs.rmSync(src, { force: true });
  }
  await browser.close();

  console.log('size      expect   stamp             decision   matrix     stats');
  let bad = 0;
  SIZES.forEach((s, i) => {
    const r = rows[i];
    const stampOk = r.stamp === s.family || (s.family === 'wide' && r.stamp === '(none → wide)');
    // Both components keep their side-by-side set at SQUARE and collapse only on
    // tall/strip. That is the deliberate #1218 outcome, not a loosened assertion:
    // square is the `balanced` family, and holding decision's 2-up raised its
    // measured ceiling 3 → 4 (tools/calibrate-capacity.js) with the two options
    // still readable side by side, which is the point of a decision slide.
    const wantDec = (s.family === 'tall' || s.family === 'strip') ? 'column' : 'row';
    const wantMat = (s.family === 'tall' || s.family === 'strip') ? 'column' : 'row';
    // stats DOES stack at square — the probe that proves the square tier fires.
    const wantStats = s.family === 'wide' ? 'row' : 'column';
    const ok = stampOk && r.decisionList === wantDec && r.matrixList === wantMat && r.statsList === wantStats;
    if (!ok) bad++;
    console.log(
      `${s.size.padEnd(9)} ${s.family.padEnd(8)} ${r.stamp.padEnd(17)} ` +
      `${r.decisionList.padEnd(10)} ${r.matrixList.padEnd(10)} ${r.statsList.padEnd(9)} ` +
      `${ok ? 'OK' : `FAIL (want ${wantDec}/${wantMat}/${wantStats})`}`);
  });
  console.log(bad ? `\n${bad} FAILURES` : '\nall tiers fire');
  process.exitCode = bad ? 1 : 0;
})();
