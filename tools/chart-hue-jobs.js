#!/usr/bin/env node
/**
 * chart-hue-jobs — does this member's categorical hue do a job, or is it decoration?
 *
 * The grouping rule went through two wrong tests before this one. "Does this
 * mark's KIND recur?" gave the wrong answer on pie, funnel and scatter. Its
 * replacement, G0 ("does the mark carry its own name, or share a label axis with
 * its siblings?"), reads well and cannot separate a `bar row` from a `funnel`:
 * both put the name in a left gutter, one spends five hues and the other one,
 * and no clause in G0 says why. Rendering the two with the same data is what
 * showed it.
 *
 * So this measures the two jobs hue can actually do, on the rendered document
 * rather than from a member's reputation:
 *
 *   BIND    the mark and its name are separated, so hue is what joins them —
 *           a detached legend rail, a leader line the layout engine had to draw,
 *           or an open path labelled at one end and read along its length
 *   SEPARATE the marks touch, overlap or interleave, so position does not tell
 *           them apart and hue does
 *
 * A mark with an adjacent label and clear space around it needs neither, and a
 * hue spent there is decoration. That is the whole test.
 *
 * WHAT EACH ARM MEASURES, and why it is that and not something easier:
 *
 *   key       read off the DOM — a legend rail is `.chart-key-*`, direct labels
 *             are `.cart-series` / `.slope-name` and friends. A rail is a gap by
 *             construction: the name is somewhere else on the slide.
 *   leaders   `.chart-leader` elements actually drawn. A leader line is the
 *             layout engine ADMITTING it could not place the name beside its
 *             mark — quadrant's own docs say "on a crowded plot 'beside' stops
 *             meaning 'nearest'". Counting drawn leaders beats counting call
 *             sites, because a member may draw none on a given deck.
 *   gap       the MEDIAN nearest-neighbour gap between same-class marks, in
 *             units of the median mark size. 0 means touching. Normalising by
 *             mark size is what makes a pie wedge and a matrix cell comparable.
 *   extended  the fraction of marks that are open paths (`path`/`polyline`) —
 *             a line or a slope is read along its length, so a label at one end
 *             is not adjacent to most of it.
 *   hues      distinct paints on the marks, split CATEGORICAL from STATE. The
 *             split is load-bearing and its absence mis-flagged three members:
 *             `waterfall` spends three hues with no bind and no separate, which
 *             looks like decoration until you see they are `data-s` — rise,
 *             fall, total — a nominal variable NO other channel carries. State
 *             hue is a third job this test does not model and does not judge;
 *             only the categorical count is held to the two jobs. Paint is read
 *             off fill, background, border, stroke and `::before` — timeline-list
 *             draws its whole categorical channel as a ring on a pseudo-element
 *             — and a `url()` fill is resolved to its gradient's first stop.
 *             What COUNTS is a paint that DISTINGUISHES: a colour carried by
 *             every mark in the class is dropped before counting, because a
 *             shared canvas background is not a categorical channel. Reading
 *             one paint per mark and taking the first non-null instead reported
 *             1 hue for a member cycling four, because the shared background
 *             short-circuited the chain ahead of the ring.
 *             READ THE COUNT AS A BOOLEAN, not as a hue count. A mark can carry
 *             two distinguishing paints (a fill AND a ring), so the number is an
 *             upper bound — matrix-grid reads 18 against six row hues. What is
 *             load-bearing is only whether it is 1 or more than 1.
 *
 * A DIAGNOSTIC, not a gate. It reports the verdict beside what the member
 * actually spends, and where those disagree the member is worth looking at —
 * it does not decide that the member is wrong. Some disagreements are the
 * design's (a11y textures ride the same slots), and one is a question this repo
 * has not answered yet.
 *
 * Usage:
 *   node tools/chart-hue-jobs.js [deck.md] [--theme <name>] [--json <path>]
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '..');
const DEFAULT_DECK = path.join(REPO, 'lib/components/chart/chart.gallery.md');

function parseArgs(argv) {
  const out = { deck: DEFAULT_DECK, theme: null, json: null };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--theme') out.theme = argv[++i];
    else if (argv[i] === '--json') out.json = argv[++i];
    else rest.push(argv[i]);
  }
  if (rest[0]) out.deck = path.resolve(rest[0]);
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!process.env.CHROME_PATH) {
    console.error('chart-hue-jobs: CHROME_PATH is unset — this reads a rendered document.');
    process.exit(2);
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'huejobs-'));
  const html = path.join(tmp, 'd.html');
  const emu = [path.join(REPO, 'dist/lattice-emulator.js'), args.deck, html];
  if (args.theme) emu.push(args.theme);
  execFileSync(process.execPath, emu, { stdio: ['ignore', 'ignore', 'inherit'] });

  const puppeteer = require('puppeteer');
  let browser;
  let rows;
  try {
    browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.goto(`file://${html}`, { waitUntil: 'networkidle0' });
    rows = await page.evaluate(() => {
      const px = document.createElement('canvas');
      px.width = px.height = 1;
      const cx = px.getContext('2d', { willReadFrequently: true });
      const toRgb = (c) => {
        if (!c || c === 'none') return null;
        if (/^url\(/.test(c)) {
          const id = c.replace(/^url\(["']?#?/, '').replace(/["']?\).*$/, '');
          const def = document.getElementById(id);
          const stop = def?.querySelector('stop');
          if (!stop) return null;
          c = getComputedStyle(stop).stopColor;
        }
        // A canvas keeps its PREVIOUS fillStyle when a value does not parse, so
        // the sentinel is what tells a bad value apart from a real black. Reading
        // it back makes that guard explicit — an implicit reset reads to a linter
        // (and to the next person) as a write nothing uses.
        const SENTINEL = '#010203';
        cx.clearRect(0, 0, 1, 1);
        cx.fillStyle = SENTINEL;
        // Read it back BEFORE the real assignment: that both normalizes the
        // sentinel to the form the canvas returns, and makes the write plainly
        // live to a reader (and to the analyzer, which flagged the earlier form
        // as a dead store twice — correctly, on the code as written).
        const sentinel = cx.fillStyle;
        cx.fillStyle = c;
        if (cx.fillStyle === sentinel && String(c).trim().toLowerCase() !== sentinel) return null;
        cx.fillRect(0, 0, 1, 1);
        const d = cx.getImageData(0, 0, 1, 1).data;
        return d[3] === 0 ? null : `${d[0]},${d[1]},${d[2]}`;
      };
      const MARK = '.wedge,.funnel-band,.bar-mark,.sbar-seg,.waterfall-bar,.scatter-dot,.scatter-bubble,'
        + '.quadrant-dot,.quadrant-bubble,.map-region--on,.gantt-bar,.radar-poly,.cell-filled,.kanban-card,'
        + '.wc-word,.line-path,.line-dot,.slope-line,.slope-dot,.timeline-dot,.progress-fill,.bullet-measure,'
        + '.state-node,.cell-state,.journey-face';
      const CHROME = new Set(['chart-frame', 'viz-frame', 'standard', 'dark', 'light', 'lr', 'row', 'td']);
      const median = (a) => (a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0);

      const out = [];
      for (const sec of document.querySelectorAll('section.chart-frame')) {
        const name = [...sec.classList].find(
          (c) => !CHROME.has(c) && !c.startsWith('size-') && !c.startsWith('deck-'),
        );
        if (!name) continue;

        const key = sec.querySelector('[class*="chart-key"], [class*="legend"]') ? 'legend-rail'
          : sec.querySelector('.cart-series, .slope-name, [class*="direct-label"]') ? 'direct-labels'
          : 'none';
        const leaders = sec.querySelectorAll('.chart-leader, [class*="leader"]').length;

        // Group marks by class so a gap is measured between siblings, never
        // between two different kinds of mark that happen to sit near one another.
        const byClass = new Map();
        for (const el of sec.querySelectorAll(MARK)) {
          const cls = [...el.classList][0];
          (byClass.get(cls) || byClass.set(cls, []).get(cls)).push(el);
        }
        let gapN = null;
        let extended = 0;
        let total = 0;
        let catCount = 0;
        let stateCount = 0;
        for (const [, els] of byClass) {
          total += els.length;
          const perEl = [];
          const stateEl = [];
          for (const el of els) {
            const tag = el.tagName.toLowerCase();
            if (tag === 'path' || tag === 'polyline') extended += 1;
            const cs = getComputedStyle(el);
            const isSvg = el.namespaceURI === 'http://www.w3.org/2000/svg';
            // `::before` is not an afterthought: timeline-list draws its whole
            // categorical channel as a ring on one, so an element-only read
            // reported a single hue for a member cycling four.
            const be = isSvg ? null : getComputedStyle(el, '::before');
            const paints = new Set();
            for (const c of isSvg
              ? [cs.fill, cs.stroke]
              : [cs.backgroundColor, cs.borderTopColor, cs.backgroundImage,
                be?.borderTopColor, be?.backgroundColor]) {
              const v = toRgb(c);
              if (v) paints.add(v);
            }
            perEl.push(paints);
            // A mark keyed on data-s takes the STATE palette; anything else that
            // carries a slot takes the categorical cycle. A mark with neither
            // counts as categorical, because that is the cycle a positional
            // nth-child rule reaches for — which is exactly what funnel and
            // timeline-list do.
            if (el.hasAttribute('data-s') && !el.hasAttribute('data-hue')) stateEl.push(paints);
          }
          // A paint every mark in the class carries distinguishes nothing —
          // drop it, then count what is left.
          const distinguishing = (sets) => {
            if (!sets.length) return 0;
            const union = new Set(sets.flatMap((x) => [...x]));
            let n = 0;
            for (const c of union) if (!sets.every((x) => x.has(c))) n += 1;
            return n || 1;
          };
          const isState = stateEl.length === perEl.length && perEl.length > 0;
          const d = distinguishing(perEl);
          if (isState) stateCount = Math.max(stateCount, d);
          else catCount = Math.max(catCount, d);

          if (els.length < 2) continue;
          const boxes = els.map((e) => e.getBoundingClientRect()).filter((b) => b.width || b.height);
          if (boxes.length < 2) continue;
          const size = median(boxes.map((b) => Math.max(b.width, b.height))) || 1;
          const nearest = boxes.map((a, i) => {
            let best = Infinity;
            boxes.forEach((b, j) => {
              if (i === j) return;
              const dx = Math.max(0, Math.max(a.left - b.right, b.left - a.right));
              const dy = Math.max(0, Math.max(a.top - b.bottom, b.top - a.bottom));
              best = Math.min(best, Math.hypot(dx, dy));
            });
            return best;
          }).filter(Number.isFinite);
          const g = median(nearest) / size;
          gapN = gapN === null ? g : Math.min(gapN, g);
        }
        out.push({
          name, key, leaders, marks: total,
          gap: gapN === null ? null : Math.round(gapN * 100) / 100,
          extended: total ? extended / total : 0,
          hues: catCount,
          stateHues: stateCount,
        });
      }
      return out;
    });
  } finally {
    if (browser) await browser.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  // TOUCH_MAX: a nearest-neighbour gap under a tenth of a mark's own size reads
  // as touching. Pie wedges and stacked segments land at 0; a bar's gap is ~0.3
  // of a bar width and a funnel's is wider still.
  const TOUCH_MAX = 0.1;
  const verdictOf = (r) => {
    const bind = r.key === 'legend-rail' || r.leaders > 0 || r.extended > 0.3;
    const sep = r.gap !== null && r.gap <= TOUCH_MAX;
    // A member whose paint is mostly STATE is not judged here. Its hue encodes a
    // nominal variable no other channel carries, which is a third job, and
    // holding gantt or waterfall to a categorical test only produces noise.
    const stateLed = r.stateHues > r.hues;
    return { bind, sep, hue: bind || sep, stateLed };
  };

  const label = args.theme ? `${path.basename(args.deck)} · ${args.theme}` : path.basename(args.deck);
  console.log(`\nhue jobs — ${label}   (does this member's categorical hue do a job?)\n`);
  console.log(`  ${'member'.padEnd(14)} ${'key'.padEnd(14)} ${'lead'.padEnd(5)} ${'gap'.padEnd(6)} ${'ext'.padEnd(5)} ${'cat'.padEnd(4)} ${'state'.padEnd(6)} ${'BIND'.padEnd(5)} ${'SEP'.padEnd(4)} verdict`);
  const flagged = [];
  for (const r of rows.sort((a, b) => a.name.localeCompare(b.name))) {
    const v = verdictOf(r);
    const spends = r.hues > 1;
    const agree = v.stateLed || v.hue === spends;
    if (!agree) flagged.push({ ...r, ...v, spends });
    console.log(
      `  ${r.name.padEnd(14)} ${r.key.padEnd(14)} ${String(r.leaders).padEnd(5)} `
      + `${(r.gap === null ? '—' : r.gap.toFixed(2)).padEnd(6)} ${r.extended.toFixed(2).padEnd(5)} `
      + `${String(r.hues).padEnd(4)} ${String(r.stateHues).padEnd(6)} ${(v.bind ? 'yes' : 'no').padEnd(5)} ${(v.sep ? 'yes' : 'no').padEnd(4)} `
      + `${v.stateLed ? 'state-keyed — not judged' : v.hue ? 'hue earns its place' : 'no job for hue'}`
      + `${agree ? '' : spends ? '   ← SPENDS HUE ANYWAY' : '   ← job, but one hue'}`,
    );
  }
  console.log(`\n  ${rows.length - flagged.length} of ${rows.length} members agree with the test.`);
  for (const f of flagged) {
    console.log(`    ${f.name}: ${f.spends ? `spends ${f.hues} CATEGORICAL hues with no bind and no separate` : 'has a job for hue and spends one'}`);
  }
  console.log('');
  if (args.json) {
    fs.writeFileSync(args.json, JSON.stringify({ ...args, rows: rows.map((r) => ({ ...r, ...verdictOf(r) })) }, null, 2));
    console.log(`json → ${args.json}\n`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
