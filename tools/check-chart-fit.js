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
 * A THIRD ASSERTION RIDES THE SAME RENDERS, and is the opposite question. The
 * two above ask whether the chart is too BIG for its box; the INSET check (#1598)
 * asks whether its box is needlessly too SMALL — whether the body re-derives the
 * frame inset the stage already carries. That failure is silent in the other
 * direction: nothing clips, nothing overflows, the chart is simply 64px narrower
 * per side than it should be, on every chart, forever. It costs no extra render,
 * so it lives here rather than in a gate of its own. design/forms.md §6.1.
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
const { resolveChrome } = require('./lib/resolve-chrome');

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
  // failed the gate if it had not been — which is exactly the behavior the list is for.
  //
  // Portrait roadmap REOPENED at 75.4px on 2026-09-02 and was closed again the same day,
  // without an entry. Worth knowing because the second cause had nothing to do with the
  // first: #2016 made the split's forward-pointer signal universal and seats it INSIDE
  // `.cell-stage`, and roadmap floored its chart-body at `min-height: 100%`, so the stage
  // was already exactly full when the sibling arrived. Two rules each correct alone. The
  // fix is `flex: 1 0 auto` on that body (roadmap.styles.css) — grow into the free space
  // the signal did not take, never shrink, so `overflow-probe.js` still sees an
  // overstuffed body. A sanction would have hidden a live regression in a shipped deck
  // (`examples/portrait-roadmap.md`, 5 pages) behind a line saying "known".
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
    const insets = [];
    let vbSkipped = 0;

    for (const sec of document.querySelectorAll('section[data-class]')) {
      const component = sec.dataset.class.trim().split(/\s+/)[0];
      const stage = sec.querySelector('.cell-stage');

      // ── 0. INSET OWNERSHIP — the stage owns the outer inset, the body fills it.
      // design/forms.md §6.1, #1598. Asserted by MEASUREMENT, not by reading the
      // CSS, because the shape that breaks it (`width: calc(100cqi − <spacing>)`)
      // reads as sizing: the box it produces is centered, inside the frame, and
      // overflows nothing — it is simply 64px narrower on each side than it should
      // be, on every chart, forever. Two assertions, both on the INLINE axis:
      //   · the body's BORDER box coincides with the stage's CONTENT box, so the
      //     inset is not re-derived below the stage;
      //   · the body carries no INLINE padding of its own, UNLESS it PAINTS ITS
      //     OWN SURFACE — the one case the rule's second clause allows, because
      //     text must not touch a visible edge. That is tested by measurement too
      //     (a non-transparent background or a real border), not by a class list:
      //     it is what earns `code`'s `pre` its padding and what the chart's
      //     opt-in `canvas` panel earns, and a class list would have to be kept in
      //     sync with every future body that paints.
      // BLOCK padding is NOT asserted, and that is a finding rather than an
      // omission: `overflow` cuts at the PADDING box, so a body's block padding is
      // a CLIP MARGIN — the slack a chart paints into before anything is lost —
      // not an inset. Removing it clipped nine decks that had never clipped. The
      // inline half was the genuine duplicate (frame + width calc + the body's own
      // = 192px per side against prose's 64); this gate asserts that half.
      // Block axis is deliberately NOT asserted: a pinned list body (`flex: 0 0
      // auto`) is centered at its natural height and legitimately does not fill the
      // cell, and an overstuffed one MUST spill it so overflow-probe.js can see it.
      // The HOLDER is the stage under the Form and the SECTION on the `no-form`
      // path — the rule is about which box owns the inset, not about a class name,
      // and `no-form` / `form: off` are supported opt-outs. Keying on `.cell-stage`
      // alone left this assertion silent on exactly the path where the first cut of
      // #1598 regressed, so it falls back to the section instead of skipping.
      const holder = stage || sec;
      {
        const body = holder.querySelector(':scope > .chart-body, :scope > .mermaid-svg, :scope > .mermaid, :scope > pre, :scope > marp-pre');
        if (body?.getClientRects().length) {
          const sr = holder.getBoundingClientRect();
          const sc = getComputedStyle(holder);
          const br = body.getBoundingClientRect();
          const bc = getComputedStyle(body);
          const num = (v) => Number.parseFloat(v) || 0;
          const left = sr.left + num(sc.paddingLeft) + num(sc.borderLeftWidth);
          const right = sr.right - num(sc.paddingRight) - num(sc.borderRightWidth);
          const pad = [bc.paddingTop, bc.paddingRight, bc.paddingBottom, bc.paddingLeft].map(num);
          // "Paints its own surface": a background that is not fully transparent,
          // a background image/gradient, or a real border on any side.
          const opaque = !/^(?:transparent|rgba\(0,\s*0,\s*0,\s*0\))$/.test(bc.backgroundColor);
          const painted = opaque || bc.backgroundImage !== 'none'
            || [bc.borderTopWidth, bc.borderRightWidth, bc.borderBottomWidth, bc.borderLeftWidth]
              .some((w) => num(w) > 0);
          // A PAINTED body's inline padding must BE `--chart-panel-x`, not merely
          // be allowed. The clause above says a box that paints its own surface
          // earns an inset; this says the inset it earns is the one token that
          // governs it. The token was split out of `--chart-inset-x` precisely so
          // a move of one could not silently move the other — and the split's
          // first outing missed a per-chart override that fed BOTH, retuning a
          // `timeline-list canvas` panel 3× tighter with nothing to catch it
          // (found twice over by the trio, gated here). Two ways to fail: a
          // painted body with NO inline padding (content on a visible edge), and
          // one whose padding has drifted off the token.
          // Resolved by PROBE, not by reading the property: a custom property's
          // computed value is a token sequence, so `getPropertyValue` hands back
          // `calc(1.25 * var(--_sec-1cqi) * …)` and `parseFloat` gives NaN. A
          // throwaway element sized `width: var(--chart-panel-x)` inside the body
          // makes the browser do the arithmetic, in the same container context the
          // padding resolves in.
          const probe = document.createElement('div');
          probe.style.cssText = 'position:absolute;visibility:hidden;height:0;width:var(--chart-panel-x)';
          body.appendChild(probe);
          const panelX = probe.getBoundingClientRect().width;
          probe.remove();
          const panelBad = painted && (
            pad[1] <= SLACK_ || pad[3] <= SLACK_
            || Math.abs(pad[1] - panelX) > SLACK_ || Math.abs(pad[3] - panelX) > SLACK_);
          insets.push({
            slide: +sec.id || insets.length + 1,
            component: stage ? component : `${component} (no-form)`,
            // `getAttribute`, not `.className`: on an SVG element that property is an
            // SVGAnimatedString and stringifies to `[object SVGAnimatedString]`.
            body: body.getAttribute('class') || body.tagName,
            insetLeft: +(br.left - left).toFixed(1),
            insetRight: +(right - br.right).toFixed(1),
            pad: pad.join('/'),
            painted,
            panelX: +panelX.toFixed(1),
            panelBad,
            bad: Math.abs(br.left - left) > SLACK_ || Math.abs(right - br.right) > SLACK_
              || (!painted && (pad[1] > SLACK_ || pad[3] > SLACK_))
              || panelBad,
          });
        }
      }

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
    return { stages, boxes, insets, vbSkipped };
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
    // EXIT 2, NOT 0. This used to exit 0 with "SKIPPED, nothing verified" — a check
    // that reports success having measured nothing, which is the one thing a gate
    // must never do. It cost nothing while the script was unwired, and it is exactly
    // what would have been wired: on a runner whose Chromium is missing or whose
    // puppeteer cache restored without the binary (a failure `overflow-nightly.yml`
    // documents as recurring), the job would have gone green every night while every
    // clip went unmeasured. `check-geometry-parity.js`, its closest sibling, already
    // exits 2 here; this matches it. 2 rather than 1 keeps a SETUP failure distinct
    // from a real clip finding, which is the discrimination the nightly alarm family
    // is built on.
    console.error('check-chart-fit: no Chromium (set CHROME_PATH) — nothing was verified.');
    process.exit(2);
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
  let insetCount = 0;
  let skipCount = 0;
  const stageBad = [];
  const boxBad = [];
  const insetBad = [];
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
      const { stages, boxes, insets, vbSkipped } = await measure(page, SLACK, VB_SLACK);
      await page.close();

      stageCount += stages.length;
      boxCount += boxes.length;
      insetCount += insets.length;
      skipCount += vbSkipped;
      for (const r of stages) if (r.clipped) stageBad.push({ ...r, size: s.name });
      for (const r of boxes) if (r.clipped) boxBad.push({ ...r, size: s.name });
      for (const r of insets) if (r.bad) insetBad.push({ ...r, size: s.name });
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
        for (const r of insets) {
          console.log(
            `  inset   slide ${String(r.slide).padStart(2)} ${r.component.padEnd(15)} ` +
            `${String(r.body).padEnd(20)} inset[L ${r.insetLeft} R ${r.insetRight}] pad[${r.pad}]` +
            `${r.painted ? ' (paints)' : ''} ${r.bad ? 'RE-INSET' : 'ok'}`,
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

    if (insetBad.length) {
      console.error(`\ncheck-chart-fit: ${insetBad.length} re-derived outer inset(s) across ${sizes.length} size(s):\n`);
      for (const r of insetBad) {
        if (r.panelBad) {
          console.error(
            `  \u2717 [${r.size}] slide ${r.slide} (${r.component}): <${r.body}> PAINTS a surface, so its inline ` +
            `padding must be \`--chart-panel-x\` \u2014 pad[${r.pad}] against a resolved ${r.panelX}px. A painted box ` +
            'owes its content an inset (design/forms.md \u00a76.1) and that inset is the panel token, so a change to ' +
            'the frame inset can never silently move it.',
          );
          continue;
        }
        console.error(
          `  \u2717 [${r.size}] slide ${r.slide} (${r.component}): <${r.body}> does not fill its holder's ` +
          `content box \u2014 inset[L ${r.insetLeft} R ${r.insetRight}] pad[${r.pad}]. The stage owns the outer ` +
          'inset (design/forms.md \u00a76.1); a body re-deriving it makes the figure pay twice.',
        );
      }
      console.error('');
      failed = true;
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
    } else if (!insetBad.length) {
      // `!insetBad.length` is load-bearing: this `else` used to be guarded only by
      // the CLIP arrays, so a run that reported every inset failure then printed the
      // all-clear sentence underneath them. A log tail would have read green.
      console.log(
        `check-chart-fit: ${stageCount} chart slide(s) fit their stage, ${insetCount} body/stage pair(s) inset ` +
        `once, and ${boxCount} SVG(s) fit their viewBox, ` +
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
