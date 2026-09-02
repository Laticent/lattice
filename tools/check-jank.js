#!/usr/bin/env node
/**
 * check-jank — does a component's layout STAY PUT as its content grows? Anchor DRIFT, silent COLLISION and CROWDING, measured over a rendered content sweep.
 *
 * The three failures every existing fit gate in this repo is blind to, because every one of
 * them asks whether the content FITS and none asks whether the layout MOVES.
 *
 * NOT the web-perf sense of jank (dropped frames, layout thrash). In a slide engine it
 * is: a fixed visual element does not stay fixed as the content around it varies. Three
 * failure modes, three different measurements:
 *
 *   DRIFT      an anchor that is supposed to hold position moves as content grows. A
 *              running section mark 22% down the canvas on a one-line heading and 14%
 *              down on a three-line one is a defect PRECISELY because the eye expects it
 *              in the same place on every slide. Fine in a still; it wobbles across a deck.
 *   COLLISION  two boxes reach each other. The fatal case: one is `position: absolute`
 *              and the other flex-centered, so they lay out independently and NEITHER
 *              overflows anything. `probeSectionOverflow` measures flowed children
 *              spilling past the section's rect; two boxes painting on top of each other
 *              never leave it, so no ⚠ OVERFLOW line, no red ring, no clipped tag.
 *   CROWDING   content stays inside the frame and eats all its breathing room — the
 *              engine's own warning text admits this case is untagged.
 *
 * WHY NOTHING ELSE ANSWERS IT. `calibrate-capacity` / `calibrate-density` read a BINARY
 * overflow verdict out of the CLI log, so a box that moves 200px without overflowing is
 * invisible to them. `check:overflow-corpus` is the same verdict corpus-wide.
 * `pixel-check` / `regress` need a committed golden and one content shape. `check-chart-fit`
 * is one component, one box, clip-based. Everything asks DOES IT FIT; nothing asks DOES IT
 * STAY PUT. Born from #2005 (issue #2020), where this run found a design that read
 * beautifully in a still and wobbled as a running mark, and a collision at five lines that
 * every channel in the engine reported as fine.
 *
 * WHAT IT MEASURES, and the two traps already paid for:
 *
 *  · THE INK, NOT THE BOX. The flowed block is the union of the border boxes of every
 *    element that actually paints — one carrying direct text, a replaced element, or one
 *    painting its own surface — descending THROUGH pure wrappers. Measuring a section's
 *    top-level children instead reads the Form's `.cell-stage`, which spans its whole grid
 *    area whatever is inside it, so a crowded slide and an empty one measure identical.
 *    Absolutely positioned boxes are excluded by construction: they are what an anchor IS,
 *    so name one with `--anchor` to measure it.
 *  · THE ANCHOR'S PAINTED EDGE, NOT ITS CONTENT BOX. A `::after` is `content-box`, so
 *    `getComputedStyle(el, '::after').height` is the glyph alone — beneath it sit its
 *    padding and the border that IS the hairline (21.48px in the case this came from).
 *    Using the content box understated every clearance by that much and moved the reported
 *    first collision a whole line late. Any pseudo you treat as a keep-out zone has this
 *    trap (engineering/gotchas/css.md, "an OVERLAP IS NOT AN OVERFLOW").
 *
 * Usage:
 *   node tools/check-jank.js "divider numbered" --anchor 'h2::after'
 *   node tools/check-jank.js cards-grid --axis count --max 8
 *   node tools/check-jank.js closing --axis heading --family tall --json
 *
 *   <component>       the `_class` string to sweep. Modifiers are allowed and are the
 *                     point ("divider numbered"); the FIRST word resolves the manifest.
 *   --anchor <sel>    what must hold still, as a CSS selector resolved inside the
 *                     section. A trailing `::before` / `::after` names a pseudo, which is
 *                     the usual case for an engine-drawn mark. Omit it and the sweep still
 *                     reports crowding and where the content sits — there is just nothing
 *                     to collide with.
 *   --axis            heading (grow the heading, hold the documented chrome — the default
 *                     for a component with no count axis) · count (grow the element count,
 *                     `capacity.axis`) · words (grow the words per element).
 *   --family          wide | square | tall | strip (default wide).
 *   --max N           last step (heading/words: words; count: elements). Default 24 / 9.
 *   --count N         elements held fixed on the `words` axis. Default 3.
 *   --words N         words per element held fixed on the `count` axis. Default is the
 *                     component's own `density.soft` — the shape authors are told to write.
 *   --theme <name>    palette (default indaco — the theme the method was calibrated on).
 *   --style <css|f>   extra CSS, inline or a file path, injected as the deck's front-matter
 *                     `style:`. This is the falsifiability lever, and the reason the tool
 *                     can prove a fix rather than describe one: sweep once as shipped, once
 *                     with the fix's declarations neutralized, and the difference between
 *                     the two tables IS the evidence.
 *   --tight PX        clearance at or under this is reported TIGHT. Default 12.
 *   --max-drift PX    anchor movement over this fails. Default 2 (sub-pixel rounding).
 *   --json            machine-readable rows + summary.
 *   --advisory        always exit 0.
 *
 * ON-DEMAND, NOT A CI GATE — same reasoning as `overflow:check` and `bench:check`: it is a
 * Chromium sweep, and a wall-clock-ish diagnostic in the merge train is a flake generator.
 * Exit 1 on a collision or drift past the limit, 2 on a setup failure (no Chromium, no
 * manifest) so a broken rig never reads as a clean sweep, 0 otherwise.
 */

const fs = require('node:fs');
const {
  SIZE_ALIAS, FAMILIES, BUILDERS, words, cap, findManifest, gradedDeck, renderProbe,
} = require('./lib/calibrate-core.js');
const { resolveChrome } = require('./lib/resolve-chrome.js');

// A pixel of slack, as in check-chart-fit: sub-pixel layout rounding routinely puts a box
// a few hundredths past its neighbor with nothing visibly touching.
const SLACK = 1.0;

// ── argv ──────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const has = (f) => argv.includes(`--${f}`);
const flag = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : def;
};
const JSON_OUT = has('json');
const ADVISORY = has('advisory');
const ANCHOR = flag('anchor', null);
const FAMILY = flag('family', 'wide');
const THEME = flag('theme', 'indaco');
const TIGHT = parseFloat(flag('tight', '12'));
const MAX_DRIFT = parseFloat(flag('max-drift', '2'));
const COUNT = parseInt(flag('count', '3'), 10);
// Read verbatim, not through `flag`: injected CSS legitimately starts with `--` (a custom
// property is the most natural thing to neutralize), and `flag` reads a `--`-leading value
// as a missing one.
const STYLE = (() => {
  const i = argv.indexOf('--style');
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : null;
})();

function die(msg, code = 2) { console.error(`check-jank: ${msg}`); process.exit(code); }

// The positional is the whole class string, so `"divider numbered"` sweeps the modifier
// that owns the anchor. Flag VALUES are skipped, or `--family tall` would read as one.
const CLASS = (() => {
  const skip = new Set();
  for (const name of ['anchor', 'axis', 'family', 'max', 'count', 'words', 'theme', 'tight', 'max-drift', 'style']) {
    const i = argv.indexOf(`--${name}`);
    if (i >= 0 && argv[i + 1]) skip.add(i + 1);
  }
  const at = argv.findIndex((a, i) => !a.startsWith('--') && !skip.has(i));
  return at >= 0 ? argv[at] : null;
})();
if (!CLASS) die('usage: node tools/check-jank.js <component> [--anchor \'h2::after\'] [--axis heading|count|words]');

const COMP = CLASS.trim().split(/\s+/)[0];
const manifest = findManifest(COMP);
if (!manifest) die(`no manifest for '${COMP}'.`);
if (!SIZE_ALIAS[FAMILY]) die(`unknown family '${FAMILY}'. Known: ${FAMILIES.join(', ')}.`);

// The default axis is the component's own. `capacity.axis` already encodes what a deck
// author adds more of, and a component with none (an anchor slide: `adapt.mode: native`,
// one heading, no repeating element) has exactly one thing that can grow — the heading.
const AXIS = flag('axis', manifest.capacity?.axis && BUILDERS[COMP] ? 'count' : 'heading');
if (!['heading', 'count', 'words'].includes(AXIS)) die(`unknown --axis '${AXIS}' (heading | count | words).`);
const MAX = parseInt(flag('max', AXIS === 'count' ? '9' : '24'), 10);
if (!(MAX > 1)) die('--max must be at least 2 — a sweep of one step measures nothing.');

// ── the sweep deck ────────────────────────────────────────────────────────

/**
 * The component's documented shape with the heading swapped for a graded one.
 *
 * The skeleton is the manifest's own authored form, so the sweep carries the real chrome
 * — for a divider that is the eyebrow, and the eyebrow is the TOP of the block. #2005's
 * first advisory rule measured the `h2` and so read a line late; a sweep that renders a
 * bare heading reproduces that mistake.
 */
function headingSweep() {
  const skeleton = manifest.skeleton || manifest.sample;
  if (!skeleton) die(`'${COMP}' has no skeleton or sample in its manifest to sweep.`);
  const lines = skeleton.split('\n').filter((l) => !/^\s*<!--\s*_class:/.test(l));
  const at = lines.findIndex((l) => /^#{1,6}\s+\S/.test(l));
  if (at < 0) {
    die(`'${COMP}'s skeleton has no heading line, so there is nothing to grow on the heading `
      + 'axis. Sweep --axis count (or --axis words) instead.');
  }
  const level = lines[at].match(/^#+/)[0];
  return {
    steps: Array.from({ length: MAX }, (_, i) => i + 1),
    slideFor: (n) => ({
      slide: lines.map((l, i) => (i === at ? `${level} ${cap(words(n))}.` : l)).join('\n'),
    }),
  };
}

/** calibrate-capacity's experiment: hold the body, grow the element COUNT. */
function countSweep() {
  const build = BUILDERS[COMP];
  if (!build) {
    die(`no element builder for '${COMP}' — add one to tools/lib/calibrate-core.js BUILDERS, or `
      + 'sweep --axis heading.');
  }
  const per = parseInt(flag('words', manifest.density?.soft || 12), 10);
  return {
    steps: Array.from({ length: MAX }, (_, i) => i + 1),
    slideFor: (n) => ({
      label: `${n} element${n === 1 ? '' : 's'}`,
      body: Array.from({ length: n }, () => build(per)).join('\n'),
    }),
  };
}

/** calibrate-density's experiment: hold the count, grow the WORDS per element. */
function wordsSweep() {
  const build = BUILDERS[COMP];
  if (!build) {
    die(`no element builder for '${COMP}' — add one to tools/lib/calibrate-core.js BUILDERS, or `
      + 'sweep --axis heading.');
  }
  // From three words — below that a "body" is a fragment, not the shape an author writes.
  if (MAX < 5) die('--axis words needs --max 5 or more (the sweep starts at 3 words).');
  return {
    steps: Array.from({ length: MAX - 2 }, (_, i) => i + 3),
    slideFor: (n) => ({
      label: `${n} words per element`,
      body: Array.from({ length: COUNT }, () => build(n)).join('\n'),
    }),
  };
}

const sweep = AXIS === 'heading' ? headingSweep() : AXIS === 'count' ? countSweep() : wordsSweep();

// ── the measurement, in the page ──────────────────────────────────────────

/**
 * Per section: where the ink sits, where the anchor sits, and how much room is left.
 *
 * Runs as one `page.evaluate` so every rect comes from a single layout — reading them
 * across round trips would let a lazy relayout land between two numbers that are supposed
 * to be comparable.
 */
function measureInPage(anchorSel, anchorPseudo, slack) {
  const REPLACED = new Set(['IMG', 'SVG', 'CANVAS', 'VIDEO', 'PICTURE', 'IFRAME', 'HR']);
  const num = (v) => Number.parseFloat(v) || 0;
  const round = (v) => (Number.isFinite(v) ? +v.toFixed(1) : null);

  /** Does this box paint a surface of its own? Then IT is the visible edge, not its text. */
  const paints = (cs) => (
    !/^(?:transparent|rgba\(0,\s*0,\s*0,\s*0\))$/.test(cs.backgroundColor)
    || cs.backgroundImage !== 'none'
    || [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth]
      .some((w) => num(w) > 0)
  );

  /**
   * The ink: the union of every painting box, descending through pure wrappers.
   * A wrapper contributes nothing of its own — the Form's `.cell-stage` fills its grid
   * area whether it holds one line or twelve — so stopping at the section's children
   * measures the grid, not the content.
   */
  function ink(el, acc, skipEl) {
    if (el === skipEl || el.hasAttribute('data-lattice-berth')) return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    // Out-of-flow boxes are excluded on purpose: an absolutely positioned mark is what an
    // ANCHOR is, and folding it into the ink would hide the very collision we are after.
    if (cs.position === 'absolute' || cs.position === 'fixed') return;
    const r = el.getBoundingClientRect();
    const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    const own = ownText || REPLACED.has(el.tagName.toUpperCase()) || paints(cs);
    if (own && r.width > 0 && r.height > 0) { acc.push(r); return; }
    for (const kid of el.children) ink(kid, acc, skipEl);
  }

  /**
   * The anchor's PAINTED border box, in viewport coordinates.
   *
   * An element hands one over directly. A pseudo does not — there is no rect API for it —
   * so it is reconstructed from computed style, which only resolves when the pseudo is
   * positioned. `top` is measured from the containing block's PADDING box (the nearest
   * positioned ancestor), and the box is the content height PLUS its padding and border:
   * the hairline under a section numeral is a `border-bottom`, and it is exactly the edge
   * the copy has to clear.
   */
  function anchorBox(base, pseudo) {
    if (!pseudo) {
      const r = base.getBoundingClientRect();
      return r.width > 0 && r.height > 0 ? { rect: r } : { error: 'the anchor element paints no box' };
    }
    const cs = getComputedStyle(base, pseudo);
    if (cs.content === 'none' || cs.display === 'none') return { error: `${pseudo} generates no box` };
    if (cs.position !== 'absolute' && cs.position !== 'fixed') {
      return { error: `${pseudo} is \`position: ${cs.position}\` — an in-flow pseudo has no measurable rect; name an element anchor instead` };
    }
    if (!/px$/.test(cs.top) || !/px$/.test(cs.left)) {
      return { error: `${pseudo} resolves \`top: ${cs.top}\` / \`left: ${cs.left}\` — an offset that is not a length cannot be placed` };
    }
    // FROM THE ORIGINATING ELEMENT, not its parent. A pseudo is a child of the element it
    // hangs on, so that element is its own containing block the moment it is positioned —
    // and that is not a corner case, it is the shape of the design this tool exists to
    // reject: a mark hung on a positioned heading rides the heading and drifts with it.
    // Starting the walk one level up reported such a mark as pinned to the section.
    let cb = base;
    while (cb && getComputedStyle(cb).position === 'static') cb = cb.parentElement;
    if (!cb) return { error: `${pseudo} has no positioned containing block` };
    const cbr = cb.getBoundingClientRect();
    const cbs = getComputedStyle(cb);
    const border = cs.boxSizing === 'border-box'
      ? { w: 0, h: 0 }
      : {
        w: num(cs.paddingLeft) + num(cs.paddingRight) + num(cs.borderLeftWidth) + num(cs.borderRightWidth),
        h: num(cs.paddingTop) + num(cs.paddingBottom) + num(cs.borderTopWidth) + num(cs.borderBottomWidth),
      };
    const top = cbr.top + num(cbs.borderTopWidth) + num(cs.top) + num(cs.marginTop);
    const left = cbr.left + num(cbs.borderLeftWidth) + num(cs.left) + num(cs.marginLeft);
    const height = num(cs.height) + border.h;
    const width = num(cs.width) + border.w;
    return { rect: { top, left, bottom: top + height, right: left + width, width, height } };
  }

  const rows = [];
  for (const sec of document.querySelectorAll('section[data-lattice-slide]')) {
    const sr = sec.getBoundingClientRect();
    const scs = getComputedStyle(sec);
    // The CONTENT box: inside the border AND the padding. Ink past this edge is still
    // inside the frame — nothing overflows, nothing clips — and is exactly the "overflows
    // by padding alone" case the engine's own warning text says it does not tag.
    const content = {
      top: sr.top + num(scs.borderTopWidth) + num(scs.paddingTop),
      bottom: sr.bottom - num(scs.borderBottomWidth) - num(scs.paddingBottom),
      left: sr.left + num(scs.borderLeftWidth) + num(scs.paddingLeft),
      right: sr.right - num(scs.borderRightWidth) - num(scs.paddingRight),
    };

    let anchor = null;
    let anchorError = null;
    let anchorCount = 0;
    let skipEl = null;
    if (anchorSel) {
      let found = [];
      try {
        found = sec.querySelectorAll(anchorSel);
      } catch {
        anchorError = `'${anchorSel}' is not a valid CSS selector`;
      }
      anchorCount = found.length;
      if (anchorError) {
        // reported as-is
      } else if (!found.length) {
        anchorError = 'no match';
      } else {
        if (!anchorPseudo) skipEl = found[0];
        const box = anchorBox(found[0], anchorPseudo);
        if (box.error) anchorError = box.error; else anchor = box.rect;
      }
    }

    const rects = [];
    for (const kid of sec.children) ink(kid, rects, skipEl);
    const heading = sec.querySelector('h1, h2, h3');
    // Line boxes, not an estimate: a Range over the heading's own text returns one rect per
    // rendered line, which is the unit a reader actually sees the block grow in.
    let lines = null;
    if (heading) {
      const range = document.createRange();
      range.selectNodeContents(heading);
      lines = range.getClientRects().length;
    }

    const row = {
      slide: +sec.id || rows.length + 1,
      chars: heading ? heading.textContent.trim().length : null,
      lines,
      anchorCount,
      anchorError,
    };

    if (!rects.length) {
      rows.push({ ...row, empty: true });
      continue;
    }
    const inkBox = {
      top: Math.min(...rects.map((r) => r.top)),
      bottom: Math.max(...rects.map((r) => r.bottom)),
      left: Math.min(...rects.map((r) => r.left)),
      right: Math.max(...rects.map((r) => r.right)),
    };

    // Breathing room: how far the ink stays inside the section's content box, worst edge.
    // Negative means it has eaten into the padding — inside the frame, past the margin the
    // layout reserved for it.
    const edges = {
      top: inkBox.top - content.top,
      bottom: content.bottom - inkBox.bottom,
      left: inkBox.left - content.left,
      right: content.right - inkBox.right,
    };
    const worst = Object.entries(edges).sort((a, b) => a[1] - b[1])[0];

    let clearance = null;
    let side = null;
    let intersects = false;
    if (anchor) {
      const anchorMid = (anchor.top + anchor.bottom) / 2;
      const inkMid = (inkBox.top + inkBox.bottom) / 2;
      side = anchorMid <= inkMid ? 'above' : 'below';
      clearance = side === 'above' ? inkBox.top - anchor.bottom : anchor.top - inkBox.bottom;
      const overlapY = Math.min(anchor.bottom, inkBox.bottom) - Math.max(anchor.top, inkBox.top);
      const overlapX = Math.min(anchor.right, inkBox.right) - Math.max(anchor.left, inkBox.left);
      intersects = overlapY > slack && overlapX > slack;
    }

    rows.push({
      ...row,
      inkTop: round(inkBox.top - sr.top),
      inkBottom: round(inkBox.bottom - sr.top),
      inkHeight: round(inkBox.bottom - inkBox.top),
      anchorTop: anchor ? round(anchor.top - sr.top) : null,
      anchorBottom: anchor ? round(anchor.bottom - sr.top) : null,
      side,
      clearance: round(clearance),
      intersects,
      breathing: round(worst[1]),
      breathingEdge: worst[0],
      section: { width: round(sr.width), height: round(sr.height) },
    });
  }
  return rows;
}

// ── run ───────────────────────────────────────────────────────────────────

async function main() {
  const chrome = resolveChrome();
  // EXIT 2, never a silent 0: a sweep that measured nothing must not read as a clean one
  // (HARD RULE #23). Matches check-chart-fit and check-geometry-parity.
  if (!chrome) die('no Chromium (set CHROME_PATH) — nothing was measured.');

  const anchorPseudo = ANCHOR && /::?(?:before|after)$/i.test(ANCHOR)
    ? `::${ANCHOR.match(/::?(before|after)$/i)[1].toLowerCase()}`
    : null;
  const anchorSel = anchorPseudo ? ANCHOR.replace(/::?(?:before|after)$/i, '').trim() : ANCHOR;
  if (anchorPseudo && !anchorSel) die('--anchor needs an element to hang the pseudo on, e.g. \'h2::after\'.');

  let deck = gradedDeck({
    comp: CLASS, size: SIZE_ALIAS[FAMILY], steps: sweep.steps, slideFor: sweep.slideFor,
  });
  if (STYLE) {
    // Normalized at the read (#1349): the CSS goes into a YAML BLOCK SCALAR, where a stray
    // CR rides to the end of every line and a BOM lands mid-document. A user's stylesheet
    // is outside-world text like any other deck the CLI takes.
    const css = (fs.existsSync(STYLE) ? fs.readFileSync(STYLE, 'utf8') : STYLE)
      .replace(/^\uFEFF/, '')
      .replace(/\r\n?/g, '\n');
    // A block scalar in the front matter the deck already opens with, so the injected CSS
    // rides the same path an author's `style:` does rather than a second mechanism.
    const block = css.trimEnd().split('\n').map((l) => `  ${l}`).join('\n');
    deck = deck.replace(/^---\n/, `---\nstyle: |\n${block}\n`);
  }
  const render = renderProbe(deck, `jank-${COMP}-${FAMILY}`, { format: 'html', palette: THEME, keep: true });
  let rows;
  try {
    if (!fs.existsSync(render.out)) throw new Error('the emulator produced no HTML output');
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({ executablePath: chrome, args: ['--no-sandbox'] });
    try {
      const page = await browser.newPage();
      // The emulator's HTML pins each section's size in px, so the measurement does not
      // depend on this viewport (verified: identical rects at 800x600, 1280x720, 1920x1080).
      // It is set large enough only so nothing is scrolled out of the layout viewport.
      await page.setViewport({ width: 1920, height: 1200 });
      await page.goto(`file://${render.out}`, { waitUntil: 'networkidle0', timeout: 120_000 });
      rows = await page.evaluate(measureInPage, anchorSel, anchorPseudo, SLACK);
    } finally {
      await browser.close();
    }
  } finally {
    render.cleanup();
  }

  if (rows.length !== sweep.steps.length) {
    die(`the sweep rendered ${rows.length} slides for ${sweep.steps.length} steps — page N no `
      + 'longer maps to step N, so nothing below can be trusted.');
  }
  rows.forEach((r, i) => { r.step = sweep.steps[i]; r.over = render.overflowed.has(r.slide); });

  // ── verdicts ────────────────────────────────────────────────────────────
  const measured = rows.filter((r) => !r.empty);
  const withAnchor = measured.filter((r) => r.anchorTop != null);
  const anchorErrors = [...new Set(rows.map((r) => r.anchorError).filter(Boolean))];

  const drift = withAnchor.length > 1
    ? Math.max(
      Math.max(...withAnchor.map((r) => r.anchorTop)) - Math.min(...withAnchor.map((r) => r.anchorTop)),
      Math.max(...withAnchor.map((r) => r.anchorBottom)) - Math.min(...withAnchor.map((r) => r.anchorBottom)),
    )
    : null;
  // A COLLISION is an intersection on BOTH axes, not merely a negative gap on one. An
  // anchor in a corner and ink in a column beside it can pass each other on the block axis
  // for a whole sweep without ever touching, and failing that would make the tool cry wolf
  // on every side-set mark. The one-axis case is still worth saying out loud — it is a
  // collision waiting for a wider line — so it is reported, not failed.
  const collision = withAnchor.find((r) => r.intersects) || null;
  const passes = withAnchor.find((r) => !r.intersects && r.clearance < 0) || null;
  const tight = withAnchor.find((r) => !r.intersects && r.clearance >= 0 && r.clearance <= TIGHT) || null;
  const crowded = measured.find((r) => r.breathing < -SLACK) || null;
  const firstOver = rows.find((r) => r.over) || null;

  // A sweep whose steps all lay out identically proves nothing — it means the axis never
  // moved the content, so every clean verdict below is vacuous. Say so rather than pass.
  const spread = measured.length > 1
    ? Math.max(...measured.map((r) => r.inkHeight)) - Math.min(...measured.map((r) => r.inkHeight))
    : 0;

  const summary = {
    component: CLASS, family: FAMILY, theme: THEME, axis: AXIS, steps: sweep.steps.length,
    anchor: ANCHOR, anchorErrors,
    drift, maxDrift: MAX_DRIFT,
    collision: collision && { step: collision.step, slide: collision.slide, clearance: collision.clearance },
    passesOnOneAxis: passes && { step: passes.step, clearance: passes.clearance },
    tight: tight && { step: tight.step, clearance: tight.clearance },
    crowded: crowded && { step: crowded.step, breathing: crowded.breathing, edge: crowded.breathingEdge },
    firstOverflow: firstOver ? firstOver.step : null,
    inkHeightSpread: +spread.toFixed(1),
    vacuous: spread <= SLACK,
  };

  if (JSON_OUT) {
    console.log(JSON.stringify({ summary, rows }, null, 2));
  } else {
    const axisLabel = { heading: 'heading words', count: 'elements', words: 'words/element' }[AXIS];
    console.log(`\n  ${CLASS} · ${FAMILY} (@size ${SIZE_ALIAS[FAMILY]}) · ${THEME} · ${AXIS} sweep, ${sweep.steps.length} steps`);
    if (ANCHOR) console.log(`  anchor: ${ANCHOR}`);
    const head = [
      'slide'.padStart(5), axisLabel.padStart(14), 'chars'.padStart(5), 'lines'.padStart(5),
      'ink top'.padStart(7), 'ink bot'.padStart(7), 'anchor'.padStart(7), 'clearance'.padStart(10),
      'breathe'.padStart(9), 'probe',
    ];
    console.log(`\n  ${head.join('  ')}`);
    for (const r of rows) {
      if (r.empty) {
        console.log(`  ${String(r.slide).padStart(5)}  ${String(r.step).padStart(14)}  (no ink measured on this slide)`);
        continue;
      }
      // The anchor column is the edge FACING the content — its bottom when it sits above
      // the ink, its top when below. That is the edge the clearance is measured from.
      const anchorEdge = r.anchorTop == null ? '—' : (r.side === 'above' ? r.anchorBottom : r.anchorTop);
      const clr = r.clearance == null ? '—' : (r.intersects ? `${r.clearance} ✱` : `${r.clearance}`);
      console.log(`  ${[
        String(r.slide).padStart(5),
        String(r.step).padStart(14),
        String(r.chars ?? '—').padStart(5),
        String(r.lines ?? '—').padStart(5),
        String(r.inkTop).padStart(7),
        String(r.inkBottom).padStart(7),
        String(anchorEdge).padStart(7),
        String(clr).padStart(10),
        // The edge letter matters: the worst edge is usually the inline start, which sits
        // flush at 0 by design, so a bare number reads as "no room left" when it means
        // "the text begins where the content box begins".
        `${r.breathing} ${r.breathingEdge[0].toUpperCase()}`.padStart(9),
        r.over ? 'OVER' : '·',
      ].join('  ')}`);
    }
    if (withAnchor.some((r) => r.intersects)) console.log('\n  ✱ the anchor and the ink genuinely intersect — not merely a negative gap on one axis.');

    console.log('');
    if (anchorErrors.length) console.log(`  ANCHOR    unmeasurable on some slides: ${anchorErrors.join('; ')}`);
    if (drift != null) {
      console.log(`  DRIFT     the anchor moved ${drift.toFixed(1)}px across the sweep (limit ${MAX_DRIFT})`
        + `${drift > MAX_DRIFT ? '  ✗ it does not hold position' : '  ok'}`);
    }
    if (collision) {
      console.log(`  COLLISION step ${collision.step} (${collision.lines ?? '—'} lines, ${collision.chars ?? '—'} chars): `
        + `clearance ${collision.clearance}px${collision.over ? '' : ' — and the overflow probe says this slide is fine'}  ✗`);
    } else if (withAnchor.length) {
      console.log(`  COLLISION none through step ${sweep.steps.at(-1)}`
        + `${tight ? `  (tightest ${tight.clearance}px at step ${tight.step} — at or under --tight ${TIGHT})` : ''}  ok`);
    }
    if (passes) {
      console.log(`  PASSES    step ${passes.step}: the ink is ${Math.abs(passes.clearance)}px past the anchor on the `
        + 'block axis without overlapping it — they do not share a column today, and a wider '
        + 'line is all that separates this from a collision  (advisory)');
    }
    if (crowded) {
      console.log(`  CROWDING  step ${crowded.step}: the ink is ${Math.abs(crowded.breathing)}px into the section's `
        + `${crowded.breathingEdge} padding — inside the frame, so no channel tags it  (advisory)`);
    }
    console.log(`  OVERFLOW  ${firstOver ? `the probe first flags step ${firstOver.step}` : 'the probe flags no step'}`);
    if (summary.vacuous) {
      console.log('\n  ⚠ every step laid out at the same height — this axis is not moving the content, '
        + 'so the verdicts above are vacuous. Raise --max, or sweep a different --axis.');
    }
  }

  // NAMING AN ANCHOR THAT NEVER RESOLVES IS A SETUP FAILURE, not a clean sweep. Every
  // verdict that matters is measured against it, so a run that found none reported "no
  // collision" for the same reason an unplugged alarm reports no fire — and the one-line
  // ANCHOR note above is easy to read past. Exit 2, with the other tools' meaning: the rig
  // did not run, as distinct from the 1 that means it found something.
  if (ANCHOR && !withAnchor.length) {
    die(`the anchor '${ANCHOR}' was measurable on no slide (${anchorErrors.join('; ') || 'no reason recorded'}) `
      + '— nothing was compared against it, so this sweep has no verdict.');
  }

  const failed = (drift != null && drift > MAX_DRIFT) || !!collision;
  process.exitCode = failed && !ADVISORY ? 1 : 0;
}

main().catch((err) => {
  console.error(`check-jank: ${err.message}`);
  process.exit(2);
});
