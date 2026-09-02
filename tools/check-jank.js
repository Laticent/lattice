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
 *   DRIFT      an anchor that is supposed to hold position moves as content grows —
 *              measured on BOTH axes, because a mark can walk sideways off the slide
 *              without changing altitude by a pixel. A
 *              running section mark 22% down the canvas on a one-line heading and 14%
 *              down on a three-line one is a defect PRECISELY because the eye expects it
 *              in the same place on every slide. Fine in a still; it wobbles across a deck.
 *   COLLISION  the anchor reaches READABLE CONTENT — text, or a replaced element. The
 *              fatal case: one box is `position: absolute` and the other flex-centered, so
 *              they lay out independently and NEITHER overflows anything.
 *              `probeSectionOverflow` measures flowed children spilling past the section's
 *              rect; two boxes painting on top of each other never leave it, so no
 *              ⚠ OVERFLOW line, no red ring, no clipped tag. The anchor touching mere
 *              DECORATION is reported as CHROME and does not fail: one engine-drawn mark
 *              deliberately touching another is a design choice a geometry rig cannot
 *              second-guess, and shipped `cycle` makes it — its hub dot is centered ON the
 *              ring it straddles. Failing that cried wolf on a working component; the
 *              defect this tool was built from struck the eyebrow TEXT and cut the COPY.
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
 *  · THE INK, NOT THE BOX. The flowed block is the union of every box that actually paints
 *    — one carrying direct text, a replaced element, or one painting its own surface —
 *    descending THROUGH pure wrappers. Measuring a section's top-level children instead
 *    reads the Form's `.cell-stage`, which spans its whole grid area whatever is inside it,
 *    so a crowded slide and an empty one measure identical. Absolutely positioned boxes are
 *    excluded by construction: they are what an anchor IS, so name one with `--anchor`.
 *    Two things the first cut of that walk missed, both of which reported a hard overlap as
 *    CLEAN: a GENERATED box is not a child, so a pseudo painting chrome on a text-free
 *    wrapper was invisible (the engine bundle carries hundreds of such rules) — positioned
 *    pseudos are now reconstructed and folded in, and an offset in-flow one, whose static
 *    position the DOM does not expose, is COUNTED and suppresses the clean verdict rather
 *    than being dropped — and the descent CONTINUES past a painting box, because stopping
 *    there left 66 positioned pseudos in the shipped gallery unseen with no `unplaced` note.
 *    A positioned pseudo's own TRANSFORM is applied: the `translate(-50%, 50%)` centering
 *    idiom put a shipped mark 15.3px from where it paints, and 21 positioned pseudo rules in
 *    the bundle carry one.
 *    What the ink deliberately is NOT: the element's scroll extent. Text escaping its border
 *    box on the inline axis is not in the ink, because both richer measures tried for it
 *    invented collisions on layouts that are fine — a Range's line boxes carry the font's
 *    leading, and `scrollWidth` includes absolutely positioned descendants, so the named
 *    anchor returned through its own container and shipped `list-steps` reported a -219.1px
 *    collision against unmodified CSS. That case is not silent: the engine's overflow probe
 *    flags it, on the same row, in the `probe` column.
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
 *   --max-drift PX    anchor movement over this fails, on either axis. Default 2 (sub-pixel
 *                     rounding, not a tolerance).
 *   --help            print the flags and exit 0.
 *   --json            machine-readable rows + summary.
 *   --advisory        always exit 0.
 *
 * ON-DEMAND, NOT A CI GATE — same reasoning as `overflow:check` and `bench:check`: it is a
 * Chromium sweep, and a wall-clock-ish diagnostic in the merge train is a flake generator.
 * Exit 1 on a collision or drift past the limit, 2 on a setup failure, 0 otherwise. The
 * exit-2 set is deliberately wide, because the failure that matters for a measurement rig is
 * not a crash — it is a confident CLEAN over something it never measured: no Chromium, no
 * manifest, an unknown or unusable flag, a `--style` path that does not exist (it would
 * inject nothing and silently match its own baseline), or an anchor that resolves on some
 * slides but not all (drift and clearance are claims across the whole sweep).
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
//
// PARSED, NOT SCANNED. The first cut used `argv.indexOf('--max')` per flag, which
// silently ignored BOTH the `--flag=value` form (the one `lattice-emulator.js` itself
// accepts, so the natural thing to type) and any misspelling. `--anchor='h2::after'`
// therefore ran a full sweep with NO anchor: no DRIFT line, no COLLISION line, exit 0
// — a rig reporting clean because it was never told what to look at. Unknown flags and
// unusable values are now refusals, not shrugs.
const VALUE_FLAGS = new Set([
  'anchor', 'axis', 'family', 'max', 'count', 'words', 'theme', 'tight', 'max-drift', 'style',
]);
const BOOL_FLAGS = new Set(['json', 'advisory', 'help', 'anchors']);
const NUMERIC = { max: 'int', count: 'int', words: 'int', tight: 'float', 'max-drift': 'float' };

function die(msg, code = 2) { console.error(`check-jank: ${msg}`); process.exit(code); }

const USAGE = [
  "usage: node tools/check-jank.js <component> [--anchor 'h2::after'] [options]",
  '',
  '  --anchor <sel>   what must hold still (a trailing ::before/::after names a pseudo)',
  '  --axis           heading | count | words',
  '  --family         wide | square | tall | strip        --theme <name>',
  '  --max N          last step             --count N     --words N',
  '  --tight PX       clearance at or under this is TIGHT (default 12)',
  '  --max-drift PX   anchor movement over this fails (default 2)',
  '  --style <css|f>  CSS injected as the deck\'s front-matter `style:`',
  '  --anchors        list the marks this component HAS, and how far each moves',
  '  --json           machine-readable      --advisory    always exit 0',
  '',
  'The header of tools/check-jank.js is the long form. engineering/jank.md is the method.',
].join('\n');

const { opts, positionals } = (() => {
  const o = new Map();
  const pos = [];
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { pos.push(a); continue; }
    const eq = a.indexOf('=');
    const name = (eq >= 0 ? a.slice(2, eq) : a.slice(2)).trim();
    if (BOOL_FLAGS.has(name)) {
      if (eq >= 0) die(`--${name} takes no value.`);
      o.set(name, true);
      continue;
    }
    if (!VALUE_FLAGS.has(name)) {
      die(`unknown option '--${name}'. Known: ${[...VALUE_FLAGS, ...BOOL_FLAGS].sort().join(', ')}.\n\n${USAGE}`);
    }
    // A VALUE may legitimately begin with `--`: injected CSS often neutralizes a custom
    // property. So the next argv entry is taken verbatim rather than sniffed.
    const value = eq >= 0 ? a.slice(eq + 1) : argv[++i];
    if (value === undefined) die(`--${name} requires a value.`);
    o.set(name, value);
  }
  return { opts: o, positionals: pos };
})();

if (opts.get('help')) { console.log(USAGE); process.exit(0); }

const flag = (name, def) => (opts.has(name) ? opts.get(name) : def);
const num = (name, def) => {
  const raw = flag(name, def);
  const v = NUMERIC[name] === 'int' ? Number(raw) : Number.parseFloat(raw);
  if (NUMERIC[name] === 'int' && Number.isFinite(v) && !Number.isInteger(v)) {
    // `parseInt` truncated silently: `--max 2.9` swept 2 steps and `--max 2e1` swept 2.
    die(`--${name} needs a whole number, got '${raw}'.`);
  }
  // NaN is the silent one: `--max-drift banana` used to print "(limit NaN) ok" and exit 0
  // on a sweep with real drift, because every comparison against NaN is false.
  if (!Number.isFinite(v)) die(`--${name} needs a number, got '${raw}'.`);
  return v;
};

const JSON_OUT = !!opts.get('json');
const ANCHORS_MODE = !!opts.get('anchors');
const ADVISORY = !!opts.get('advisory');
// An EMPTY anchor is a missing one. `--anchor ''` (an unset shell variable) kept the empty
// string, which is falsy, so the anchor path was skipped AND the partial-anchor refusal was
// skipped — reproducing the first-cut failure verbatim: no DRIFT line, no COLLISION line,
// exit 0.
const ANCHOR = (() => {
  const raw = flag('anchor', null);
  if (raw == null) return null;
  if (!raw.trim()) die('--anchor was given an empty selector. Drop the flag, or name what must hold still.');
  return raw.trim();
})();
const FAMILY = flag('family', 'wide');
const THEME = flag('theme', 'indaco');
const TIGHT = num('tight', '12');
const MAX_DRIFT = num('max-drift', '2');
const COUNT = num('count', '3');

// A path that does not exist is a REFUSAL, not CSS. `--style ./my-fix.css` with a typo
// used to inject the path text itself, which the engine drops — so the "sweep with the fix
// neutralized" run came back byte-identical to the baseline and read as proof that the fix
// held. The falsifiability lever must not fail open. A value carrying `{` is inline CSS.
const STYLE = (() => {
  const raw = flag('style', null);
  if (raw == null) return null;
  if (raw.includes('{')) return raw;
  if (!fs.existsSync(raw)) {
    die(`--style '${raw}' is neither a readable file nor CSS (no \`{\` in it). `
      + 'A missing stylesheet would inject nothing and the sweep would silently match its baseline.');
  }
  // AND THE FILE HAS TO CARRY CSS. The missing-path refusal was written because an empty
  // injection makes the "swept with the fix neutralized" run byte-identical to its baseline
  // and read as proof the fix held — and a file that EXISTS and is empty, or is prose, does
  // exactly the same thing. Measured: `--style empty.css` produced JSON identical to the
  // un-styled run.
  const text = fs.readFileSync(raw, 'utf8');
  if (!/\{|^\s*@/m.test(text)) {
    die(`--style '${raw}' exists but carries no CSS (no rule block, no at-rule). It would `
      + 'inject nothing, and the sweep would silently match its own baseline.');
  }
  return raw;
})();

const CLASS = positionals[0] || null;
if (!CLASS) die(`a component is required.\n\n${USAGE}`);
if (positionals.length > 1) {
  die(`more than one component given (${positionals.join(', ')}). Quote a class string with modifiers: "divider numbered".`);
}

const COMP = CLASS.trim().split(/\s+/)[0];
const manifest = findManifest(COMP);
if (!manifest) die(`no manifest for '${COMP}'.`);
if (!SIZE_ALIAS[FAMILY]) die(`unknown family '${FAMILY}'. Known: ${FAMILIES.join(', ')}.`);

// The default axis is the component's own. `capacity.axis` already encodes what a deck
// author adds more of, and a component with none (an anchor slide: `adapt.mode: native`,
// one heading, no repeating element) has exactly one thing that can grow — the heading.
const AXIS = flag('axis', manifest.capacity?.axis && BUILDERS[COMP] ? 'count' : 'heading');
if (!['heading', 'count', 'words'].includes(AXIS)) die(`unknown --axis '${AXIS}' (heading | count | words).`);
const MAX = num('max', AXIS === 'count' ? '9' : '24');
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
  const per = num('words', String(manifest.density?.soft || 12));
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

  /**
   * Does this pseudo put TEXT on the slide? Its resolved `content` answers: a quoted
   * string, a `counter()`, an `attr()` — words. An empty string or a bare image is
   * decoration. Errs toward content, which errs toward reporting a collision rather than
   * missing one.
   */
  const generatesText = (ps) => {
    const c = (ps.content || '').trim();
    if (!c || c === 'none' || c === 'normal' || c === '""' || c === "''") return false;
    return !/^(?:url|image-set|-webkit-image-set|linear-gradient|radial-gradient|conic-gradient)\(/.test(c);
  };

  /** A fully transparent background paints nothing, whatever its channels say. */
  const transparent = (color) => {
    if (color === 'transparent') return true;
    // `rgb()`/`hsl()`/`#rrggbbaa` all serialize to `rgba(...)` in Chromium, but `oklch()`,
    // `lab()` and `color()` keep their own form — and an alpha-0 one of those read as
    // PAINTING, which stops the walk at an invisible wrapper and pushes its whole rect.
    const m = /^(?:rgba?|hsla?|oklch|oklab|lch|lab|color)\(([^)]+)\)$/.exec(color);
    if (!m) return false;
    const alpha = /\/\s*([\d.]+%?)\s*$/.exec(m[1]);
    if (alpha) return Number.parseFloat(alpha[1]) === 0;
    const parts = m[1].split(',').map((v) => v.trim());
    return parts.length > 3 && Number.parseFloat(parts[3]) === 0;
  };

  /** Does this box paint a surface of its own? Then IT is the visible edge, not its text. */
  const paints = (cs) => (
    !transparent(cs.backgroundColor)
    || cs.backgroundImage !== 'none'
    || [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth]
      .some((w) => num(w) > 0)
  );

  /**
   * The rect an ABSOLUTELY POSITIONED pseudo paints, reconstructed from computed style —
   * there is no rect API for a generated box. Shared by the anchor and by the ink walk,
   * because the same reconstruction answers both "where is the mark" and "is there other
   * chrome up here". Returns null when the box cannot be placed.
   *
   * The containing block is the nearest ancestor that ESTABLISHES one — and `position` is
   * not the only property that does. `transform`, `filter`, `perspective`, `contain` and
   * `container-type` all make a static element the containing block for an absolutely
   * positioned descendant, and this engine puts `container-type: size` on every section.
   * Walking on `position` alone silently misplaced such a pseudo (measured: 37px off).
   */
  const establishesCb = (el) => {
    const cs = getComputedStyle(el);
    if (cs.position !== 'static') return true;
    if (cs.transform !== 'none' || cs.perspective !== 'none') return true;
    if (cs.filter !== 'none' || (cs.backdropFilter && cs.backdropFilter !== 'none')) return true;
    // The INDIVIDUAL longhands establish one too and do NOT show up in `transform`, which
    // computes to `none` beside them — measured 340px of silent error apiece.
    if (['translate', 'rotate', 'scale'].some((k) => cs[k] && cs[k] !== 'none')) return true;
    if (cs.contentVisibility && cs.contentVisibility !== 'visible') return true;
    if (cs.willChange && /transform|perspective|filter|contain/.test(cs.willChange)) return true;
    if (cs.contain && /(^|\s)(layout|paint|strict|content)(\s|$)/.test(cs.contain)) return true;
    if (cs.containerType && cs.containerType !== 'normal') return true;
    return false;
  };

  /**
   * A 2D transform applied to a reconstructed box, as its axis-aligned bounding box.
   * `placedBox` builds the box from `top`/`left`/`width`/`height`, which are the UNtransformed
   * used values — so a mark placed with the near-universal `translate(-50%, 50%)` centering
   * idiom was reported 15.3px from where it paints (measured against CDP `DOM.getBoxModel` on
   * the shipped `cycle` component, and six positioned pseudos in the bundle carry one).
   * `matrix3d` and anything unparseable return null, which becomes a refusal upstream: a
   * confident wrong number is the one thing this tool must not produce.
   */
  function applyTransform(box, cs) {
    if (!cs.transform || cs.transform === 'none') return box;
    const m = /^matrix\(([^)]+)\)$/.exec(cs.transform);
    if (!m) return null;
    const [a, b, c, d, e, f] = m[1].split(',').map((v) => Number.parseFloat(v));
    if ([a, b, c, d, e, f].some((v) => !Number.isFinite(v))) return null;
    const [ox, oy] = (cs.transformOrigin || '0px 0px').split(/\s+/).map(num);
    const px = box.left + ox;
    const py = box.top + oy;
    const pts = [[box.left, box.top], [box.right, box.top], [box.left, box.bottom], [box.right, box.bottom]]
      .map(([x, y]) => {
        const dx = x - px;
        const dy = y - py;
        return [px + (a * dx) + (c * dy) + e, py + (b * dx) + (d * dy) + f];
      });
    const xs = pts.map((q) => q[0]);
    const ys = pts.map((q) => q[1]);
    const top = Math.min(...ys);
    const left = Math.min(...xs);
    const bottom = Math.max(...ys);
    const right = Math.max(...xs);
    return { top, left, bottom, right, width: right - left, height: bottom - top };
  }

  function placedBox(base, cs) {
    if (!/px$/.test(cs.top) || !/px$/.test(cs.left)) return null;
    let originTop = 0;
    let originLeft = 0;
    if (cs.position !== 'fixed') {
      // FROM THE ORIGINATING ELEMENT, not its parent. A pseudo is a child of the element it
      // hangs on, so that element is its own containing block the moment it establishes one
      // — and that is the shape of the design this tool exists to reject: a mark hung on a
      // positioned heading rides the heading and drifts with it.
      let cb = base;
      while (cb && !establishesCb(cb)) cb = cb.parentElement;
      if (!cb) return null;
      const cbr = cb.getBoundingClientRect();
      const cbs = getComputedStyle(cb);
      // A TRANSFORMED containing block mixes coordinate spaces: its rect comes back
      // post-transform while the pseudo's `top`/`width` are its own untransformed used
      // values, so under a `scale` the two cannot be added. Refuse rather than report.
      if (cbs.transform !== 'none') return null;
      originTop = cbr.top + num(cbs.borderTopWidth);
      originLeft = cbr.left + num(cbs.borderLeftWidth);
    }
    // A `fixed` box resolves against the viewport, which IS the coordinate space every rect
    // here already lives in — so its origin is 0,0 and no ancestor is consulted.
    const grow = cs.boxSizing === 'border-box'
      ? { w: 0, h: 0 }
      : {
        w: num(cs.paddingLeft) + num(cs.paddingRight) + num(cs.borderLeftWidth) + num(cs.borderRightWidth),
        h: num(cs.paddingTop) + num(cs.paddingBottom) + num(cs.borderTopWidth) + num(cs.borderBottomWidth),
      };
    const top = originTop + num(cs.top) + num(cs.marginTop);
    const left = originLeft + num(cs.left) + num(cs.marginLeft);
    const height = num(cs.height) + grow.h;
    const width = num(cs.width) + grow.w;
    if (!(width > 0) || !(height > 0)) return null;
    return applyTransform({
      top, left, bottom: top + height, right: left + width, width, height,
    }, cs);
  }

  /**
   * The ink: the union of every painting box, descending through pure wrappers.
   * A wrapper contributes nothing of its own — the Form's `.cell-stage` fills its grid
   * area whether it holds one line or twelve — so stopping at the section's children
   * measures the grid, not the content.
   */
  function ink(el, acc, unplaced, skip, candidates) {
    if (el === skip.el && !skip.pseudo) return;
    if (el.hasAttribute('data-lattice-berth')) return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    // Out-of-flow boxes are excluded on purpose: an absolutely positioned mark is what an
    // ANCHOR is, and folding it into the ink would hide the very collision we are after.
    if (cs.position === 'absolute' || cs.position === 'fixed') return;

    // GENERATED BOXES ARE NOT CHILDREN, and the first cut of this walk therefore could not
    // see them: a wrapper with no direct text and no background read as a pure wrapper, so
    // the walk descended into `el.children` and every pixel its pseudo painted was invisible
    // to the tool. That is not an exotic case — the eyebrow `<p><code>` is exactly that
    // shape, and the engine bundle carries hundreds of `::before`/`::after` rules painting
    // chrome. A hard, full-width overlap with the anchor reported COLLISION none, exit 0.
    for (const pseudo of ['::before', '::after']) {
      // THE ANCHOR IS NOT ITS OWN OBSTACLE. Folding the named pseudo into the ink makes
      // every sweep collide with itself — the shipped divider reported a -136.2px
      // collision against its own section mark the moment this walk learned to see
      // generated boxes.
      if (el === skip.el && pseudo === skip.pseudo) continue;
      const ps = getComputedStyle(el, pseudo);
      if (ps.content === 'none' || ps.display === 'none' || ps.visibility === 'hidden') continue;
      // Every reconstructable generated box is recorded, whether or not it is the named
      // anchor — this is what `--anchors` prints. The tool's own thesis is that nobody forms
      // the suspicion by looking, so a mode that only verifies an anchor you already
      // suspected contradicts it. The walk already does the work.
      if (ps.position === 'absolute' || ps.position === 'fixed') {
        const box = placedBox(el, ps);
        // A generated box is CHROME only when it generates no text. Hardcoding it chrome
        // was wrong: the bundle carries 20 absolutely positioned pseudo rules whose
        // `content` is a counter, an `attr()` or a quoted label — card numerals, 'DECISION',
        // the matrix axis names — every one of them words a reader reads. The tool printed
        // "no readable content in it" over a 32-character label.
        const sel = `${el.tagName.toLowerCase()}${[...el.classList].map((c) => `.${c}`).join('')}${pseudo}`;
        if (box) {
          candidates.push({ sel, top: box.top, left: box.left, width: box.width, height: box.height });
          acc.push({ ...box, kind: generatesText(ps) ? 'content' : 'chrome' });
        } else unplaced.push(`${el.tagName.toLowerCase()}${pseudo}`);
        continue;
      }
      // An in-flow pseudo lays out inside its originating element's box, so the element's
      // own rect already covers it — UNLESS it is offset out of that box by `relative`,
      // which paints somewhere this tool cannot compute (its static position is not
      // exposed). Counted, never silently dropped: a clean verdict is not claimed over ink
      // nobody measured.
      if (ps.position === 'relative'
        && [ps.top, ps.left, ps.bottom, ps.right].some((v) => /px$/.test(v) && num(v) !== 0)) {
        unplaced.push(`${el.tagName.toLowerCase()}${pseudo}`);
      }
    }

    const r = el.getBoundingClientRect();
    const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    // THE BORDER BOX, and nothing cleverer. Two richer measures were tried and BOTH
    // manufactured collisions on layouts that are fine:
    //   · a Range over the contents returns LINE boxes, which carry the font's leading, so
    //     every text element grew ~5px upward and a mark just above one read as a hit;
    //   · `scrollWidth`/`scrollHeight` include the border boxes of ABSOLUTELY POSITIONED
    //     descendants for which the element is the containing block — so every out-of-flow
    //     box this walk deliberately drops, the named ANCHOR included, came straight back
    //     in through its own container's scroll extent. Measured: shipped `list-steps`
    //     (a `position: relative` li with a painting `li::after` chevron) reported a
    //     -219.1px COLLISION against unmodified CSS, and `divider numbered` collided with
    //     its own numeral the moment the heading was made `position: relative`. They also
    //     count CLIPPED text, which paints nowhere.
    // What that costs: text escaping its box on the inline axis (a `nowrap` heading) is not
    // in the ink. That case is not silent — the engine's own overflow probe flags it, and
    // the `probe` column reports it on the same row. A measure that invents collisions on
    // shipped components to catch a case another channel already catches is a bad trade.
    // A PAINTING BOX ENDS THE ELEMENT INK, NOT THE WALK. Returning here left every
    // positioned pseudo BELOW a painting wrapper unseen — 66 of them across the shipped
    // gallery (verdict-grid's 16 badge marks among them) — with no `unplaced` entry, so
    // the clean line still said `ok`. That is the same false clean this walk was rewritten
    // to close, one level down: a lime block painted through the section mark went back to
    // reporting `COLLISION none` the moment the wrapper above it had a background.
    // So the element's own rect is taken once, and the descent continues for pseudos.
    const box = (kind) => acc.push({
      top: r.top, left: r.left, bottom: r.bottom, right: r.right, width: r.width, height: r.height, kind,
    });

    // CONTENT is what a reader reads: a box with its own text, or a replaced element. Its
    // border box already covers its descendants, so the walk stops here.
    if ((ownText || REPLACED.has(el.tagName.toUpperCase())) && r.width > 0 && r.height > 0) {
      box('content');
      return;
    }

    // A PAINTING BOX IS CHROME AND THE WALK CONTINUES THROUGH IT. Stopping here — which is
    // what the first cut of the content split did — meant a painting ANCESTOR swallowed
    // every text box beneath it and left behind a stand-in rect that carried no text and so
    // classified as chrome. The engine puts `border-bottom` on `.cell-masthead`, so on every
    // Form component the heading and the eyebrow — the exact surfaces #2005's numeral and
    // hairline struck — became decoration, and a mark laid straight through an `h2` exited 0.
    // One cosmetic hairline decided whether a heading strike was a defect.
    if (paints(cs) && r.width > 0 && r.height > 0) box('chrome');
    for (const kid of el.children) ink(kid, acc, unplaced, skip, candidates);
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
    const rect = placedBox(base, cs);
    if (!rect) {
      return { error: `${pseudo} resolves \`top: ${cs.top}\` / \`left: ${cs.left}\` at ${cs.width}x${cs.height} — that box cannot be placed` };
    }
    return { rect };
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
    const skip = { el: null, pseudo: anchorPseudo };
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
        skip.el = found[0];
        const box = anchorBox(found[0], anchorPseudo);
        if (box.error) anchorError = box.error; else anchor = box.rect;
      }
    }

    const rects = [];
    const unplaced = [];
    const candidates = [];
    for (const kid of sec.children) ink(kid, rects, unplaced, skip, candidates);
    const heading = sec.querySelector('h1, h2, h3');
    // Line boxes, not an estimate: a Range over the heading's text returns a rect per inline
    // BOX, so `<strong>` in a heading would count twice on one line. Distinct rounded tops,
    // which is the unit a reader actually sees the block grow in.
    let lines = null;
    if (heading) {
      const range = document.createRange();
      range.selectNodeContents(heading);
      lines = new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size || null;
    }

    const row = {
      slide: +sec.id || rows.length + 1,
      chars: heading ? heading.textContent.trim().length : null,
      lines,
      anchorCount,
      anchorError,
      unplaced: [...new Set(unplaced)],
      // Section-relative, so a candidate's spread across the sweep IS its drift.
      candidates: candidates.map((c) => ({
        sel: c.sel,
        top: round(c.top - sr.top),
        left: round(c.left - sr.left),
        size: `${round(c.width)}x${round(c.height)}`,
      })),
    };

    if (!rects.length) {
      rows.push({ ...row, empty: true });
      continue;
    }
    // THE INK IS THE CONTENT — the words and the pictures, which is what the reader reads
    // and what the #2005 defect actually struck (the numeral through the eyebrow, the
    // hairline through the copy). Chrome is measured too, and reported, but it does not
    // decide the verdict: a component can draw one decoration deliberately touching
    // another, and shipped `cycle` does exactly that — its hub dot is centered ON the ring
    // it straddles. Failing that is crying wolf on a component that is working as designed.
    const contentRects = rects.filter((r) => r.kind === 'content');
    const chromeRects = rects.filter((r) => r.kind !== 'content');
    const union = (list) => (list.length ? {
      top: Math.min(...list.map((r) => r.top)),
      bottom: Math.max(...list.map((r) => r.bottom)),
      left: Math.min(...list.map((r) => r.left)),
      right: Math.max(...list.map((r) => r.right)),
    } : null);
    // THE INK IS EVERYTHING THAT PAINTS — chrome included. Narrowing it to content moved
    // `ink top`, `ink bot`, `clearance` and `breathe` on 12 of 12 sampled components (a
    // masthead band vanished from the block, overstating clearance by 90–280px) and left
    // CROWDING blind: a painted box eating the top padding printed no row at all. The split
    // belongs to the VERDICT and nowhere else — everything is measured, everything is
    // printed, and only `intersects` asks whether what was struck is readable.
    const inkBox = union(rects);

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
    let chromeHit = false;
    if (anchor) {
      const anchorMid = (anchor.top + anchor.bottom) / 2;
      const inkMid = (inkBox.top + inkBox.bottom) / 2;
      side = anchorMid <= inkMid ? 'above' : 'below';
      clearance = side === 'above' ? inkBox.top - anchor.bottom : anchor.top - inkBox.bottom;
      // PER RECT, NOT THE UNION. `inkBox` is a bounding box over everything that paints,
      // so an anchor sitting in a GAP between two pieces of ink — a mark centered between a
      // heading above and a body below — is enveloped by the union while touching neither.
      // Asserting on the union made that a COLLISION and a failing exit; the union is the
      // right thing to REPORT a clearance against, and the wrong thing to fail on.
      const hits = (list) => list.some((r) => (
        Math.min(anchor.bottom, r.bottom) - Math.max(anchor.top, r.top) > slack
        && Math.min(anchor.right, r.right) - Math.max(anchor.left, r.left) > slack
      ));
      intersects = hits(contentRects.length ? contentRects : rects);
      chromeHit = hits(chromeRects);
    }

    rows.push({
      ...row,
      inkTop: round(inkBox.top - sr.top),
      inkBottom: round(inkBox.bottom - sr.top),
      inkHeight: round(inkBox.bottom - inkBox.top),
      inkWidth: round(inkBox.right - inkBox.left),
      anchorTop: anchor ? round(anchor.top - sr.top) : null,
      anchorBottom: anchor ? round(anchor.bottom - sr.top) : null,
      // BOTH AXES. Drift used to be read off the block axis alone, so a mark that walked
      // 604px sideways — off the edge of the slide on the first step — reported 0.0px and
      // "ok". An anchor holds a POSITION, not an altitude.
      anchorLeft: anchor ? round(anchor.left - sr.left) : null,
      anchorRight: anchor ? round(anchor.right - sr.left) : null,
      side,
      clearance: round(clearance),
      intersects,
      chromeHit,
      // Counted per slide so the classifier is OBSERVABLE. Without this the only way to
      // check that a painted box reached the measurement is through the ink union, and a
      // union moves for layout reasons too — an arm written that way passed while chrome
      // collection was mutated out entirely.
      contentBoxes: contentRects.length,
      chromeBoxes: chromeRects.length,
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

  // DRIFT ON BOTH AXES, and the axis is named. The first cut maxed over `anchorTop` and
  // `anchorBottom` only, so a mark that walked 604px SIDEWAYS across the sweep — entirely
  // off the slide on step 1 — reported `0.0px  ok` while the header promised "anchor
  // movement". An anchor holds a position, not an altitude.
  const spreadOf = (key) => Math.max(...withAnchor.map((r) => r[key])) - Math.min(...withAnchor.map((r) => r[key]));
  const driftAxes = withAnchor.length > 1
    ? { vertical: Math.max(spreadOf('anchorTop'), spreadOf('anchorBottom')), horizontal: Math.max(spreadOf('anchorLeft'), spreadOf('anchorRight')) }
    : null;
  const drift = driftAxes ? Math.max(driftAxes.vertical, driftAxes.horizontal) : null;
  const driftAxis = driftAxes && driftAxes.horizontal > driftAxes.vertical ? 'horizontal' : 'vertical';
  // A COLLISION is an intersection on BOTH axes, not merely a negative gap on one. An
  // anchor in a corner and ink in a column beside it can pass each other on the block axis
  // for a whole sweep without ever touching, and failing that would make the tool cry wolf
  // on every side-set mark. The one-axis case is still worth saying out loud — it is a
  // collision waiting for a wider line — so it is reported, not failed.
  const collision = withAnchor.find((r) => r.intersects) || null;
  // Reported, never failed on. Two engine-drawn decorations touching is a design choice a
  // geometry rig cannot second-guess: shipped `cycle` centers its hub dot ON the ring.
  const chromeTouch = withAnchor.find((r) => !r.intersects && r.chromeHit) || null;
  const passes = withAnchor.find((r) => !r.intersects && r.clearance < 0) || null;
  const tight = withAnchor.find((r) => !r.intersects && r.clearance >= 0 && r.clearance <= TIGHT) || null;
  const crowded = measured.find((r) => r.breathing < -SLACK) || null;
  const firstOver = rows.find((r) => r.over) || null;

  // A sweep whose steps all lay out identically proves nothing — it means the axis never
  // moved the content, so every clean verdict below is vacuous. Say so rather than pass.
  // Height AND width: a sweep can move the content sideways (a `nowrap` heading runs off
  // the slide without gaining a pixel of height), and calling that "vacuous" told the
  // operator the axis was inert on the exact run where it was doing the most damage.
  const spreadRange = (key) => {
    const vals = measured.map((r) => r[key]).filter((v) => v != null);
    return vals.length > 1 ? Math.max(...vals) - Math.min(...vals) : 0;
  };
  // SIZE **AND** POSITION. Measuring the ink union's dimensions alone declared a sweep
  // "not moving the content" four lines under a DRIFT line reporting 300px of movement —
  // the block kept its shape and changed where it sat. Anything that moves counts.
  const spread = measured.length > 1
    ? Math.max(spreadRange('inkHeight'), spreadRange('inkWidth'),
      spreadRange('inkTop'), spreadRange('inkBottom'), spreadRange('anchorTop'), spreadRange('anchorLeft'))
    : 0;

  const summary = {
    component: CLASS, family: FAMILY, theme: THEME, axis: AXIS, steps: sweep.steps.length,
    anchor: ANCHOR, anchorErrors,
    drift, driftAxis, driftAxes, maxDrift: MAX_DRIFT,
    unplaced: [...new Set(rows.flatMap((r) => r.unplaced || []))],
    anchorMatches: [...new Set(rows.map((r) => r.anchorCount).filter((n) => n > 1))],
    collision: collision && { step: collision.step, slide: collision.slide, clearance: collision.clearance },
    chromeTouch: chromeTouch && { step: chromeTouch.step, slide: chromeTouch.slide },
    passesOnOneAxis: passes && { step: passes.step, clearance: passes.clearance },
    tight: tight && { step: tight.step, clearance: tight.clearance },
    crowded: crowded && { step: crowded.step, breathing: crowded.breathing, edge: crowded.breathingEdge },
    firstOverflow: firstOver ? firstOver.step : null,
    inkHeightSpread: +spread.toFixed(1),
    vacuous: spread <= SLACK,
  };

  // THE REFUSAL COMES FIRST. Printing the report and then dying meant `--json` emitted a
  // complete payload reading `collision: null` before exit 2, and the human-readable path
  // printed `COLLISION none … ok` on its way out — a clean verdict on a sweep with no
  // verdict, in the one place the tool is supposed to be loudest.
  if (ANCHOR && withAnchor.length < measured.length) {
    die(`the anchor '${ANCHOR}' was measurable on ${withAnchor.length} of ${measured.length} slides `
      + `(${anchorErrors.join('; ') || 'no reason recorded'}) — drift and clearance are claims across the `
      + 'whole sweep, so a partial one has no verdict.');
  }

  // ── DISCOVERY. The tool's own thesis is that nobody forms the suspicion by looking, so a
  // mode that can only verify an anchor you already suspected contradicts it — and without
  // `--anchor` the run cannot fail at all, which makes the natural first invocation a
  // report-only mode that exits 0 on everything. This lists what there IS to watch, with the
  // spread of each across the sweep, so the operator picks an anchor from evidence.
  if (ANCHORS_MODE) {
    // ONE OCCURRENCE PER SLIDE, the first in document order. A selector like `li::before`
    // matches every item, so pooling all of them measures the spread BETWEEN SIBLINGS — a
    // list's second bullet is of course lower than its first — and reports it as drift. The
    // question is whether a given mark moves ACROSS THE SWEEP, so compare like with like.
    const seen = new Map();
    for (const r of rows) {
      const firstPerSel = new Map();
      for (const c of r.candidates || []) if (!firstPerSel.has(c.sel)) firstPerSel.set(c.sel, c);
      for (const [sel, c] of firstPerSel) {
        if (!seen.has(sel)) seen.set(sel, { tops: [], lefts: [], size: c.size, perSlide: [] });
        seen.get(sel).tops.push(c.top);
        seen.get(sel).lefts.push(c.left);
        seen.get(sel).perSlide.push((r.candidates || []).filter((x) => x.sel === sel).length);
      }
    }
    const spread = (v) => (v.length > 1 ? Math.max(...v) - Math.min(...v) : 0);
    const found = [...seen.entries()].map(([sel, v]) => ({
      sel,
      size: v.size,
      slides: v.tops.length,
      // How many match per slide — a selector matching several is not one mark, and naming
      // it measures whichever happens to be first in document order.
      per: Math.max(...v.perSlide),
      drift: +Math.max(spread(v.tops), spread(v.lefts)).toFixed(1),
    })).sort((a, b) => b.drift - a.drift);
    if (JSON_OUT) { console.log(JSON.stringify({ component: CLASS, family: FAMILY, candidates: found }, null, 2)); return; }
    console.log(`\n  ${CLASS} · ${FAMILY} · ${AXIS} sweep, ${rows.length} slides — generated boxes this tool can watch\n`);
    if (!found.length) {
      console.log('  none. This component draws no positioned pseudo the walk can place, so there is\n'
        + '  nothing for --anchor to name. Crowding and the probe column still apply.');
    } else {
      console.log(`  ${'candidate'.padEnd(38)} ${'size'.padStart(12)} ${'slides'.padStart(6)} ${'per'.padStart(4)} ${'moves'.padStart(8)}`);
      for (const f of found) {
        console.log(`  ${f.sel.padEnd(38)} ${f.size.padStart(12)} ${String(f.slides).padStart(6)} `
          + `${String(f.per).padStart(4)} ${`${f.drift}px`.padStart(8)}`
          + `${f.per > 1 ? '  (many per slide — the FIRST is measured)' : ''}`
          + `${f.drift > MAX_DRIFT && f.per === 1 ? '  ← does not hold position' : ''}`);
      }
      console.log(`\n  Sweep one with:  node tools/check-jank.js "${CLASS}" --anchor '${found[0].sel}'`);
      console.log('  `slides` is how many of the swept slides it appeared on — fewer than all means the\n'
        + '  mark is conditional, and a sweep naming it will refuse rather than half-measure.\n'
        + '  `moves` is the spread of the FIRST match across the sweep; for a selector matching\n'
        + '  several per slide that is one item\'s travel, not the set\'s, and it may be layout\n'
        + '  rather than drift. Narrow the selector before believing it.');
    }
    return;
  }

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
    if (summary.anchorMatches.length) {
      console.log(`  ANCHOR    '${ANCHOR}' matches more than one element (${summary.anchorMatches.join(', ')}) — `
        + 'the FIRST in document order is measured and the rest are folded into the ink. Narrow it.');
    }
    if (summary.unplaced.length) {
      console.log(`  UNPLACED  ${summary.unplaced.length} generated box(es) paint where this tool cannot place them `
        + `(${summary.unplaced.join(', ')}) — an offset in-flow pseudo has no exposed static position. `
        + 'A clean verdict below does NOT cover them.');
    }
    if (drift != null) {
      console.log(`  DRIFT     the anchor moved ${drift.toFixed(1)}px across the sweep, ${driftAxis} (limit ${MAX_DRIFT})`
        + `${drift > MAX_DRIFT ? '  ✗ it does not hold position' : '  ok'}`);
    }
    if (collision) {
      console.log(`  COLLISION step ${collision.step} (${collision.lines ?? '—'} lines, ${collision.chars ?? '—'} chars): `
        + `clearance ${collision.clearance}px${collision.over ? '' : ' — and the overflow probe says this slide is fine'}  ✗`);
    } else if (withAnchor.length) {
      // Never the bare word "ok" while something up there went unmeasured — that is the
      // shape of every false clean this tool is built to refuse.
      console.log(`  COLLISION none through step ${sweep.steps.at(-1)}`
        + `${tight ? `  (tightest ${tight.clearance}px at step ${tight.step} — at or under --tight ${TIGHT})` : ''}`
        + `${chromeTouch ? '  (it does touch DECORATION — see CHROME)' : ''}`
        + `${summary.unplaced.length ? '  — among the ink it could place; see UNPLACED' : '  ok'}`);
    }
    if (chromeTouch) {
      console.log(`  CHROME    step ${chromeTouch.step}: the anchor overlaps DECORATION — a painted box or a `
        + 'generated one, no readable content in it. Reported, not failed: one engine-drawn mark '
        + 'deliberately touching another is a design choice  (advisory)');
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
    console.log(`  SWEEP     moved: ink height ${spreadRange('inkHeight').toFixed(1)}px · `
      + `ink width ${spreadRange('inkWidth').toFixed(1)}px · ink top ${spreadRange('inkTop').toFixed(1)}px`
      + `${withAnchor.length ? ` · anchor ${drift == null ? '—' : drift.toFixed(1)}px` : ''}`);
    console.log(`  OVERFLOW  ${firstOver ? `the probe first flags step ${firstOver.step}` : 'the probe flags no step'}`);
    if (FAMILY !== 'wide') {
      console.log(`\n  ⚠ the sweep renders --no-split so page N stays step N, and autosplit is a NO-OP at`
        + `\n    wide but ACTIVE at ${FAMILY} — so this run measures a slide shape the real ${FAMILY}`
        + '\n    render may never emit. The heading axis is unaffected (a heading is one element).');
    }
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
  const failed = (drift != null && drift > MAX_DRIFT) || !!collision;
  process.exitCode = failed && !ADVISORY ? 1 : 0;
}

main().catch((err) => {
  console.error(`check-jank: ${err.message}`);
  process.exit(2);
});
