#!/usr/bin/env node
/**
 * check-chart-fit — does the chart actually FIT the boxes that crop it?
 *
 * THE GAP THIS CLOSES. Every other chart gate asks whether a chart is correct in
 * isolation: `check-svg-scaling` asks whether it SCALES, `check-chart-responsiveness`
 * whether its CSS uses relative units, `check-viz-render` whether its paint
 * survives the scoped path. None of them asks whether the rendered thing fits
 * inside the box that crops it — and the answer to "no" is always silent: the
 * chart looks finished and part of it is simply gone.
 *
 * TWO CROPPING BOUNDARIES, TWO ASSERTIONS. They are complementary, not
 * alternatives, and each is blind to the other's failures:
 *
 *   clip location                        caught by
 *   ─────────────────────────────────    ─────────────────────────────────
 *   content overflows `.cell-stage`      the STAGE check (below), and
 *                                        lib/core/overflow-probe.js
 *   content overflows the **viewBox**    the VIEWBOX check (below) — and
 *                                        nothing else in the repo
 *
 * The stage check came first, from two radar small-multiples breakages that the
 * suite could not see. A flex row let the LAST row's minis stretch to fill a
 * four-wide track, dragging their height with them (607.8px into a 449.1px
 * stage, 115.8px of chart clipped). Before that, a two-line caption band on
 * every mini pushed a six-series deck 22.7px over.
 *
 * The viewBox check was added for #1212. `state-chart` at portrait drew two of
 * its five states past the bottom of its OWN viewBox — `Published`, the terminal
 * state, absent entirely. Every DOM boundary said the slide was fine
 * (`stage.scrollHeight === stage.clientHeight`, painted SVG 60px ABOVE the stage
 * bottom) because the SVG had already cropped the content before anything
 * measured it. `overflow-probe.js` is structurally blind to this, and so was the
 * stage check here: it compares each chart's PAINTED extent to the stage, and
 * the paint has been cropped by the viewBox first.
 *
 * An SVG whose computed `overflow` is `visible` does NOT crop — `.wc-svg` sets
 * exactly that, deliberately, so a glyph's optical bbox can breathe past the
 * viewBox edge. Asserting on those would be a false positive, so they are
 * skipped and counted.
 *
 * THREE SIZES. A chart that fits at landscape routinely clips at portrait: `cqi`
 * is a share of container INLINE size, so portrait (1080 inline) shrinks every
 * cqi-derived length ~44% against landscape (1920) at exactly the moment the box
 * grows taller. The fixture is therefore rendered at landscape, portrait AND
 * square, and each fixture slide is really three cases. Rendering the same deck
 * three times (rather than keeping three fixtures) keeps coverage identical
 * across sizes by construction.
 *
 * Usage:
 *   node tools/check-chart-fit.js [fixture.md]      # gate: exit 1 on a clip
 *   node tools/check-chart-fit.js --report          # per-slide numbers
 *   node tools/check-chart-fit.js --size portrait   # one size only
 *
 * Needs a Chromium (CHROME_PATH or the puppeteer cache). With none it SKIPS
 * loudly and exits 0 — never a false green (HARD RULE #23). On-demand, like its
 * siblings: it costs three emulator renders, so it is not in the browser-free
 * `build:check`.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const EMULATOR = path.join(ROOT, 'lattice-emulator.js');
const FIXTURE = process.argv.find((a) => a.endsWith('.md'))
  || path.join(ROOT, 'test', 'fixtures', 'chart-fit.md');

// A pixel of slack. Sub-pixel layout rounding routinely puts a box a few
// hundredths outside its parent with nothing visibly cut; anything past this is
// a real clip (the observed stage failures were 22.7px and 115.8px).
const SLACK = 1.5;

// The viewBox check works in USER UNITS, not px, so it needs its own slack: a
// viewBox is typically a few hundred units wide, and a stroke's bbox legitimately
// reaches half a stroke-width past a shape's nominal edge. The observed failure
// was +255.2 units, so this is nowhere near it.
const VB_SLACK = 1.0;

// KNOWN, JUSTIFIED CLIPS — the SANCTIONED_* idiom (cf. SANCTIONED_MARGINS in
// tools/check-ownership.js). A clip listed here does not fail the gate, but the
// gate DOES fail if a sanction goes stale (the clip no longer happens, so the
// entry should be deleted) or if it grows past `maxOver` (the defect got worse).
// So the debt stays visible and cannot rot into a silent pass.
//
// Adding an entry needs a PR justification, never a silent edit — and it is only
// ever for a PRE-EXISTING clip that is genuinely blocked, never for one this
// change introduced (HARD RULE #18).
const SANCTIONED_CLIPS = [
  // EMPTY, and that is the point. Portrait roadmap was sanctioned here at 80.4px while
  // it was genuinely blocked; #1209's split recipe (`roadmap-horizons`) closed it, so
  // the entry was DELETED rather than left to rot. The stale check below would have
  // failed the gate if it had not been — which is exactly the behaviour the list is for.
];

// The three supported deck shapes. `size:` is the front-matter key the emulator
// reads; landscape is the default and takes no key.
// `autosplit` is ON for portrait/square and omitted for landscape, mirroring the
// engine: `AUTOSPLIT_APPLIES` (lattice-emulator.js) makes it a no-op on a landscape
// deck, and it is the supported answer for a portrait slide that cannot fit — a
// roadmap paginates its phase cards rather than clipping (#1209). Measuring portrait
// WITHOUT it would gate a configuration the engine does not intend anyone to ship.
const SIZES = [
  { name: 'landscape', size: null, autosplit: false, viewport: [1920, 1080] },
  { name: 'portrait', size: 'portrait', autosplit: true, viewport: [1080, 1350] },
  { name: 'square', size: 'square', autosplit: true, viewport: [1080, 1080] },
];

/** Best-effort Chromium — mirrors tools/check-viz-render.js + check-svg-scaling.js. */
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

/**
 * Rewrite the fixture's front matter to pin a deck size. Returns the full source
 * text. A deck with no front matter gains one; an existing `size:` is replaced
 * rather than duplicated (a second key would silently win or lose by parser
 * order, which is exactly the kind of thing a gate must not be vague about).
 */
function withSize(src, size, autosplit) {
  const extra = [];
  if (size) extra.push(`size: ${size}`);
  if (autosplit) extra.push('autosplit: on');
  const fm = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(src);
  if (!fm) return extra.length ? `---\n${extra.join('\n')}\n---\n\n${src}` : src;
  const body = fm[1].split(/\r?\n/)
    .filter((l) => !/^\s*(?:size|autosplit)\s*:/.test(l))
    .concat(extra);
  return `---\n${body.join('\n')}\n---\n${src.slice(fm[0].length)}`;
}

/** Measure one rendered sidecar: stage-fit for every chart, viewBox-fit for every SVG. */
async function measure(page, slack, vbSlack) {
  return page.evaluate((SLACK_, VB_SLACK_) => {
    const stages = [];
    const boxes = [];
    let vbSkipped = 0;

    for (const sec of document.querySelectorAll('section[data-class]')) {
      const component = sec.dataset.class.trim().split(/\s+/)[0];
      const stage = sec.querySelector('.cell-stage');

      // ── 1. STAGE FIT — painted marks vs the stage clip.
      if (stage) {
        // The painted marks, not their container: a container can sit inside the
        // stage while the children overflowing IT are the ones cut.
        const marks = [...stage.querySelectorAll('svg, .chart-body > *, [data-mark]')]
          .filter((el) => el.getClientRects().length > 0);
        if (marks.length) {
          const sr = stage.getBoundingClientRect();
          let top = Infinity; let bottom = -Infinity; let left = Infinity; let right = -Infinity;
          for (const el of marks) {
            const r = el.getBoundingClientRect();
            top = Math.min(top, r.top); bottom = Math.max(bottom, r.bottom);
            left = Math.min(left, r.left); right = Math.max(right, r.right);
          }
          stages.push({
            slide: +sec.id || stages.length + 1,
            component,
            overTop: +(sr.top - top).toFixed(1),
            overBottom: +(bottom - sr.bottom).toFixed(1),
            overLeft: +(sr.left - left).toFixed(1),
            overRight: +(right - sr.right).toFixed(1),
            clipped: (sr.top - top) > SLACK_ || (bottom - sr.bottom) > SLACK_
              || (sr.left - left) > SLACK_ || (right - sr.right) > SLACK_,
          });
        }
      }

      // ── 2. VIEWBOX FIT — content bbox vs the viewBox, in the SVG's own units.
      // This is the boundary that actually crops an SVG chart, and it needs no
      // stage and no layout. Nested SVGs are each their own coordinate space, so
      // every one with a viewBox is checked (radar's small-multiples are N minis).
      for (const svg of sec.querySelectorAll('svg')) {
        const vb = svg.viewBox?.baseVal;
        if (!vb?.width || !vb.height) continue;
        // `overflow: visible` means the viewBox does NOT crop — content painted
        // outside it is still drawn (`.wc-svg` relies on this so a glyph's
        // optical bbox can breathe past the edge). Asserting here would be a
        // false positive.
        if (getComputedStyle(svg).overflow.includes('visible')) { vbSkipped += 1; continue; }
        let bb;
        try { bb = svg.getBBox(); } catch { continue; }
        if (!bb || (!bb.width && !bb.height)) continue;
        const overTop = vb.y - bb.y;
        const overBottom = (bb.y + bb.height) - (vb.y + vb.height);
        const overLeft = vb.x - bb.x;
        const overRight = (bb.x + bb.width) - (vb.x + vb.width);
        boxes.push({
          slide: +sec.id || boxes.length + 1,
          component,
          cls: svg.getAttribute('class') || '(no class)',
          viewBox: `${+vb.x.toFixed(1)} ${+vb.y.toFixed(1)} ${+vb.width.toFixed(1)} ${+vb.height.toFixed(1)}`,
          overTop: +overTop.toFixed(1),
          overBottom: +overBottom.toFixed(1),
          overLeft: +overLeft.toFixed(1),
          overRight: +overRight.toFixed(1),
          clipped: overTop > VB_SLACK_ || overBottom > VB_SLACK_
            || overLeft > VB_SLACK_ || overRight > VB_SLACK_,
        });
      }
    }
    return { stages, boxes, vbSkipped };
  }, slack, vbSlack);
}

/** `over[...]` detail for the failing edges only. */
function worstEdges(r, slack, unit) {
  return [['top', r.overTop], ['bottom', r.overBottom], ['left', r.overLeft], ['right', r.overRight]]
    .filter(([, v]) => v > slack)
    .map(([k, v]) => `${k} +${v}${unit}`)
    .join(', ');
}

async function main() {
  const report = process.argv.includes('--report');
  const only = (() => {
    const i = process.argv.indexOf('--size');
    return i >= 0 ? process.argv[i + 1] : null;
  })();
  const sizes = only ? SIZES.filter((s) => s.name === only) : SIZES;
  if (!sizes.length) {
    console.error(`check-chart-fit: unknown --size ${only} (want: ${SIZES.map((s) => s.name).join(', ')})`);
    process.exit(2);
  }

  const chrome = resolveChrome();
  if (!chrome) {
    console.error('check-chart-fit: no Chromium (set CHROME_PATH) — SKIPPED, nothing verified.');
    process.exit(0);
  }
  if (!fs.existsSync(FIXTURE)) {
    console.error(`check-chart-fit: fixture not found: ${FIXTURE}`);
    process.exit(2);
  }

  const src = fs.readFileSync(FIXTURE, 'utf8');
  const puppeteer = require('puppeteer');
  const scratch = [];
  let browser;
  let stageCount = 0;
  let boxCount = 0;
  let skipCount = 0;
  const stageBad = [];
  const boxBad = [];
  // Set inside the try, acted on AFTER the finally. `process.exit()` terminates
  // immediately and does NOT run a pending `finally`, so exiting from inside the
  // try would strand the per-size scratch decks in test/fixtures/ on every
  // failing run — the one path that always runs while a gate is being fixed.
  let failed = false;
  const allSizesRun = [];

  try {
    browser = await puppeteer.launch({ executablePath: chrome, args: ['--no-sandbox'] });

    for (const s of sizes) {
      // The emulator reads the deck size from front matter, so each size is its
      // own source file next to the fixture (same dir → same relative asset paths).
      const md = path.join(path.dirname(FIXTURE), `.chart-fit-${s.name}-${process.pid}.md`);
      const base = path.join(os.tmpdir(), `chart-fit-${s.name}-${process.pid}`);
      scratch.push(md, `${base}.pdf`, `${base}.html`);
      fs.writeFileSync(md, withSize(src, s.size, s.autosplit));

      execFileSync(process.execPath, [EMULATOR, md, `${base}.pdf`, 'indaco', '-q'], {
        cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], timeout: 10 * 60_000,
      });
      if (!fs.existsSync(`${base}.html`)) throw new Error(`emulator produced no HTML sidecar for ${s.name}`);

      const page = await browser.newPage();
      await page.setViewport({ width: s.viewport[0], height: s.viewport[1] });
      await page.goto(`file://${base}.html`, { waitUntil: 'networkidle0', timeout: 120_000 });
      const { stages, boxes, vbSkipped } = await measure(page, SLACK, VB_SLACK);
      await page.close();

      stageCount += stages.length;
      boxCount += boxes.length;
      skipCount += vbSkipped;
      for (const r of stages) if (r.clipped) stageBad.push({ ...r, size: s.name });
      for (const r of boxes) if (r.clipped) boxBad.push({ ...r, size: s.name });
      allSizesRun.push(s.name);

      if (report) {
        console.log(`\n── ${s.name} (${s.viewport.join('×')}) ──`);
        for (const r of stages) {
          console.log(
            `  stage   slide ${String(r.slide).padStart(2)} ${r.component.padEnd(15)} ` +
            `over[T ${r.overTop} B ${r.overBottom} L ${r.overLeft} R ${r.overRight}] ` +
            `${r.clipped ? 'CLIPPED' : 'fits'}`,
          );
        }
        for (const r of boxes) {
          console.log(
            `  viewBox slide ${String(r.slide).padStart(2)} ${r.component.padEnd(15)} ` +
            `${r.cls.padEnd(20)} over[T ${r.overTop} B ${r.overBottom} L ${r.overLeft} R ${r.overRight}] ` +
            `${r.clipped ? 'CLIPPED' : 'fits'}`,
          );
        }
      }
    }

    // ── Apply the sanctions. Each entry absorbs at most one matching stage clip,
    // and only while it stays within `maxOver`; anything past that is reported.
    const sanctionHits = new Map();
    const unsanctioned = [];
    for (const r of stageBad) {
      const worst = Math.max(r.overTop, r.overBottom, r.overLeft, r.overRight);
      const s = SANCTIONED_CLIPS.find((c) => c.size === r.size && c.component === r.component
        && !sanctionHits.has(c) && worst <= c.maxOver);
      if (s) { sanctionHits.set(s, { ...r, worst }); continue; }
      unsanctioned.push(r);
    }
    stageBad.length = 0;
    stageBad.push(...unsanctioned);

    // A sanction that matched nothing is STALE — the clip it documents is gone (or
    // moved), so the entry is now a lie the gate would otherwise keep telling.
    // Only judge sanctions for sizes this run actually covered (`--size` narrows it).
    const stale = SANCTIONED_CLIPS.filter((c) => !sanctionHits.has(c) && allSizesRun.includes(c.size));
    if (stale.length) {
      console.error(`\ncheck-chart-fit: ${stale.length} STALE sanction(s) — the clip no longer occurs:\n`);
      for (const c of stale) {
        console.error(
          `  ✗ [${c.size}] ${c.component} (${c.issue}): sanctioned for up to ${c.maxOver}px, but it now ` +
          'fits (or clips differently). Delete the SANCTIONED_CLIPS entry — the debt is paid.',
        );
      }
      console.error('');
      failed = true;
    }
    for (const [c, r] of sanctionHits) {
      console.log(
        `check-chart-fit: SANCTIONED clip — [${c.size}] ${c.component} ${r.worst}px ` +
        `(cap ${c.maxOver}px, ${c.issue}). Known and tracked, not fixed.`,
      );
    }

    if (stageBad.length || boxBad.length) {
      console.error(`\ncheck-chart-fit: ${stageBad.length + boxBad.length} clip(s) across ${sizes.length} size(s):\n`);
      for (const r of stageBad) {
        console.error(
          `  ✗ [${r.size}] slide ${r.slide} (${r.component}): painted outside .cell-stage — ` +
          `${worstEdges(r, SLACK, 'px')}. The stage is \`overflow: clip\`, so this is CUT, silently.`,
        );
      }
      for (const r of boxBad) {
        console.error(
          `  ✗ [${r.size}] slide ${r.slide} (${r.component}): <svg class="${r.cls}"> content outside its own ` +
          `viewBox "${r.viewBox}" — ${worstEdges(r, VB_SLACK, 'u')}. The SVG crops at the viewBox, so this is ` +
          'CUT before anything in the DOM can measure it.',
        );
      }
      console.error('');
      failed = true;
    } else {
      console.log(
        `check-chart-fit: ${stageCount} chart slide(s) fit their stage and ${boxCount} SVG(s) fit their viewBox, ` +
        `across ${sizes.length} size(s) [${sizes.map((s) => s.name).join(', ')}]` +
        `${skipCount ? ` — ${skipCount} overflow:visible SVG(s) not viewBox-checked` : ''}.`,
      );
    }
  } finally {
    if (browser) await browser.close();
    for (const f of scratch) { try { fs.unlinkSync(f); } catch { /* best effort */ } }
  }
  if (failed) process.exit(1);
}

if (require.main === module) {
  main().catch((err) => { console.error(`check-chart-fit: ${err?.stack || err}`); process.exit(2); });
}

module.exports = { SLACK, VB_SLACK, FIXTURE, SIZES, withSize };
