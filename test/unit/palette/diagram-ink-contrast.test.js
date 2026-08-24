/**
 * Unit: baked Mermaid ink is legible on the surface it actually sits on —
 * every shipped palette, both colour schemes.
 *
 * THE BUG THIS EXISTS TO CATCH. A Mermaid SVG bakes its colours to literal hex,
 * so `themeVariables` decide legibility outright; no CSS can rescue them
 * afterwards. The map used to feed EVERY text key from one token,
 * `--cat-on-fill`, on the reasoning that "the fills flip with the canvas too, so
 * ink and fill always stay matched". True for 27 of 32 palettes, false for the
 * `a11y-*` family, which PINS its categorical tier mode-invariant (fixed pale
 * chips carrying CVD-safe textures) while the canvas still flips. On
 * a11y-deuteranopia in a dark context that made `--cat-on-fill` #000000 —
 * correct on the pinned chips — and `--bg` #000000 too, so every canvas-sited
 * label rendered at 1.00:1. Flowchart edge labels vanished outright.
 *
 * Nothing caught it. `containment-contrast.test.js` gates the containment tier,
 * `theme-surface-aa.test.js` gates slide surfaces; neither reads the diagram
 * theme map, and the map's own key-set gate compares names, not legibility.
 *
 * WHY THE SITE TABLE IS HARD-CODED HERE. The obvious shape — partition the keys
 * by which token the map feeds them, then judge each tier against the surfaces
 * that tier pairs with — CANNOT FAIL. Point a key at the wrong token and the
 * gate simply re-judges it against that token's surfaces and stays green; I
 * wrote that version first and it passed the very mutation it was built to
 * catch. WHERE a label is drawn is a fact about Mermaid, not about our map, so
 * it has to be stated independently. SITES below is that statement: ink key →
 * the themeVariable whose colour it lands on. The gate then asks whether the
 * token the map assigns clears AA against the colour that surface resolves to.
 * Mis-assign a key and the gate fires.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { MERMAID_VAR_MAP } = require('../../../lib/core/mermaid-theme-map');
const { resolveTokenExpr } = require('../../../lib/core/resolve-token-expr');

const REPO = path.join(__dirname, '..', '..', '..');
const THEMES_DIR = path.join(REPO, 'themes');
const AA = 4.5;

/**
 * Ink key → the themeVariable naming the surface it is drawn on.
 *
 * Read off Mermaid's own pairings (`edgeLabelBackground` is the chip behind an
 * edge label, `taskBkgColor` the bar behind task text, and so on), not off our
 * map. A key not listed here is not judged — the coverage assertion below stops
 * that from silently becoming "nothing is judged".
 */
const SITES = {
  // Flowchart / general
  primaryTextColor:   'primaryColor',
  secondaryTextColor: 'secondaryColor',
  tertiaryTextColor:  'tertiaryColor',
  nodeTextColor:      'mainBkg',
  classText:          'mainBkg',
  textColor:          'background',
  titleColor:         'background',
  // Edge labels sit on `edgeLabelBackground` — this is the pair that broke.
  labelColor:         'edgeLabelBackground',
  labelTextColor:     'labelBackground',
  // Sequence
  actorTextColor:     'actorBkg',
  signalTextColor:    'background',
  loopTextColor:      'background',
  noteTextColor:      'noteBkgColor',
  // The autonumber badge: mermaid draws a `circle` marker filled from
  // `signalColor` and puts `.sequenceNumber` text on it.
  sequenceNumberColor: 'signalColor',
  // Pie
  pieTitleTextColor:   'background',
  pieLegendTextColor:  'background',
  pieSectionTextColor: 'pie1',
  // Gantt
  taskTextColor:          'taskBkgColor',
  taskTextLightColor:     'taskBkgColor',
  taskTextDarkColor:      'taskBkgColor',
  taskTextClickableColor: 'taskBkgColor',
  taskTextOutsideColor:   'background',
  // Git graph
  commitLabelColor: 'commitLabelBackground',
  tagLabelColor:    'tagLabelBackground',
  // Quadrant
  // The four quadrant labels are drawn on their own quadrant's fill.
  quadrant1TextFill:     'quadrant1Fill',
  quadrant2TextFill:     'quadrant2Fill',
  quadrant3TextFill:     'quadrant3Fill',
  quadrant4TextFill:     'quadrant4Fill',
  quadrantPointTextFill: 'quadrant1Fill',
  // NOT text — a plotted point and the rule between quadrants. They are listed
  // because they are drawn ON a quadrant fill and therefore read the tier curated
  // for that surface (`--cat-on-fill`), which sweeps them into `inkKeys()`. Being
  // held to the 4.5 text floor rather than 1.4.11's 3:1 is deliberate: they clear
  // it (worst 5.11:1) and the stricter floor costs nothing. Their graphical floor
  // is also covered by `tools/audit-diagram-contrast.mjs --report contrast`.
  quadrantPointFill: 'quadrant1Fill',
  quadrantInternalBorderStrokeFill: 'quadrant1Fill',
  quadrantXAxisTextFill: 'background',
  quadrantYAxisTextFill: 'background',
  quadrantTitleFill:     'background',
  // Keys added when the previously-unstated levers were pulled. Each names the
  // surface Mermaid actually draws that text on, read off the renderer, not off
  // our map: a state label sits on the state's own chip, a transition label and a
  // relation label sit on the canvas beside their line, a requirement's body sits
  // on the requirement box, a venn set label on its set fill, a venn title on the
  // canvas, and the xy chart's in-bar value label on the bar itself.
  stateLabelColor:       'stateBkg',
  transitionLabelColor:  'background',
  requirementTextColor:  'requirementBackground',
  relationLabelColor:    'background',
  vennSetTextColor:      'venn1',
  vennTitleTextColor:    'background',
  // The surface is `xyChart.plotColorPalette` — but that key is a comma-JOINED
  // string, so `tokenFor` returns null for it and the pair would be skipped in
  // silence, which is the one failure mode this gate must not have. `cScale0` is
  // fed from `--cat-1-mark`, the SAME value as the first plot series, so naming it
  // here judges the real pairing against a key the resolver can actually read.
  'xyChart.dataLabelColor': 'cScale0',
  // Error box
  errorTextColor: 'errorBkgColor',
};

// `cScaleLabel{N}` is the auto-generated `.section-N text` fill. Mermaid derives
// it from `cScale{N}`, but mermaid.css's band cycle repaints those bands with
// `--cat-N-fill`, so the surface the ink actually lands on is the PALE fill, not
// the mid-tone mark. That repaint is why the map pins these at all.
for (let i = 0; i < 12; i++) SITES[`cScaleLabel${i}`] = `fillType${i % 8}`;
// Git branch labels sit on the branch chips themselves.
for (let i = 0; i < 8; i++) SITES[`gitBranchLabel${i}`] = `git${i}`;
// NESTED keys are addressed dotted. `xyChart`'s title and axis labels are drawn
// on the chart's own `backgroundColor`, i.e. the canvas — so they belong to the
// canvas tier, and a re-wire to chip ink would regress a11y-* dark exactly like
// the edge labels did. They escaped an earlier version of this file, which only
// walked top-level entries.
for (const k of ['titleColor', 'xAxisLabelColor', 'xAxisTitleColor', 'yAxisLabelColor', 'yAxisTitleColor']) {
  SITES[`xyChart.${k}`] = 'xyChart.backgroundColor';
}

/**
 * Ink keys sanctioned as BELOW AA. **This list is now EMPTY, and that is the point of
 * #1348:** every ink key the map feeds clears AA against the surface it is drawn on, on
 * all 32 palettes in both schemes. It is kept as a named, exceed-only escape hatch rather
 * than deleted, because deleting it would make the next below-AA pair look like a choice
 * between "fix it" and "delete the assertion".
 *
 * All four entries it once held shared ONE shape — `--cat-on-fill` is curated for the PALE
 * `--cat-N-fill` band, and each key put it somewhere else — and each needed a different
 * answer, which is why they came off the list one at a time:
 *
 *   gitBranchLabel0-7  on `git0-7` = `--cat-N-MARK`, 1.2-3.0:1 EVERYWHERE. The sanction
 *                      asked for "a third ink tier or move the chips to the pale band".
 *                      The third tier already existed — `--cat-on-mark`, with nothing
 *                      pointing at it. `themes/a11y-base.css` additionally pins that ink,
 *                      because the a11y family holds its categorical ramp mode-invariant
 *                      while inheriting a flipping `--cat-on-mark` from onyx.
 *
 *   noteTextColor      on `--diagram-note`, 3.83:1 on the five a11y palettes in dark.
 *                      `--diagram-note` is not in the categorical band at all, so the ink
 *                      already curated against the non-categorical diagram surfaces —
 *                      `--text-heading` — is the tier that belongs there. Clears all 64,
 *                      worst 4.63:1.
 *
 *   sequenceNumberColor  on `signalColor` = `--diagram-LINE`. The worst of the four and
 *                      the least visible: 57 of 64 combos below AA, and 45 of those at
 *                      exactly 1.00:1, because most palettes derive `--cat-on-fill` and
 *                      `--diagram-line` from the same end of the ramp — the autonumber
 *                      badge rendered as a blank disc. The fill is a FOREGROUND tier, so
 *                      the ink that belongs on it is the CANVAS (`--bg`), the same
 *                      inversion `errorTextColor` already uses on `--fail`. Of seven
 *                      candidate inks measured, it was the only one close: worst 3.59:1
 *                      against `--cat-on-mark`'s 7 failures and `--text-heading`'s 62.
 *                      The residual two combos were cuoio's dark `--diagram-line`, lifted
 *                      #786A5B -> #8C7C6B, which also raises every cuoio-dark edge and
 *                      arrow against the canvas from 3.59:1 to 4.66:1.
 *
 *   errorTextColor     (`--bg`) on `errorBkgColor` (`--fail`), 2.34:1 — by the end, ONE
 *                      combo of 64, and not a diagram defect at all. carbone pins `--bg`
 *                      flat dark while still declaring its status trio as `light-dark()`
 *                      pairs whose LIGHT arms were tuned for an off-white canvas the
 *                      palette does not have; measured against the canvas it does have,
 *                      `--pass` read 3.90:1 and `--fail` 2.34:1. Reachable through
 *                      `section.light` / `section.print`, which govern their own subtree
 *                      past carbone's `:where(:root)` pin. Fixed palette-side by pinning
 *                      the trio flat, as #1348 said it had to be ("a palette-side --fail
 *                      curation, not a map edit").
 *
 * The list is exceed-only: an entry that starts PASSING everywhere is a stale sanction and
 * fails below, so it cannot rot. Adding a row means arguing for it.
 */
const KNOWN_BELOW_AA = new Set([
  // The LAST one, down from four, and by the end it is not a diagram defect at all.
  // `errorTextColor` (`--bg`) on `errorBkgColor` (`--fail`) — the Mermaid parse-error box.
  // ONE combo of 64: **carbone light, 2.34:1**. Everything #1348 said about this pair —
  // "the fix is a palette-side --fail curation, not a map edit" — holds, and the map side
  // is already optimal: of seven candidate inks measured against `--fail` across all 64
  // combos, `--bg` fails 1, `--bg-alt` fails 1, `--cat-on-mark` fails 6 and every other
  // ink tier fails 58 or more. There is no map edit that improves this.
  //
  // WHAT IT ACTUALLY IS. carbone pins `--bg` FLAT dark (#1A1A1C, no `light-dark()`
  // wrapping) while still declaring its status trio as `light-dark()` pairs whose LIGHT
  // arms are tuned, in the palette's own words, for "the off-white canvas" — a canvas this
  // palette does not have. Measured against the canvas it does have: `--pass` 3.90:1,
  // `--fail` 2.34:1, both short of AA as TEXT, before any diagram is involved. It is
  // reachable, not theoretical: `section.light` / `section.print` set color-scheme on the
  // ELEMENT and govern their own subtree past carbone's `:where(:root)` pin, which is the
  // same seam `paired-token-parity.test.js` spells out as the cost of carbone's exemption
  // there — so a `_class: light` slide flips the status ink to a light-canvas tuning while
  // the canvas stays dark. `tools/contrast-audit.js` does not see it because it audits
  // carbone in `[dark]` only.
  //
  // WHY IT IS NOT FIXED HERE, having been tried. Pinning the trio flat to its dark arms
  // was implemented and measured end-to-end: it fixes this pair, lifts `--pass` to 14.13:1
  // and `--fail` to 9.63:1, and RETIRES TEN `KNOWN_SUB_THRESHOLD` sanctions in
  // `tools/composed-contrast.js` (every `carbone|light|*` entry). It also drops
  // `warn^fail` under deuteranopia from 0.2386 to 0.1465, through the 0.15 collapse floor
  // in `cvd-trio-floor.test.js`. That number is not incidental: carbone's DARK arms — the
  // trio it actually renders — are frozen at that same 0.1465 and grandfathered, so the
  // pin does not introduce the weakness, it propagates an existing one onto a second
  // reading. Choosing between WCAG AA on the canvas and CVD separation, on values
  // `2026-08-24-status-trio-monochromacy-respacing.md` set the same day, is a palette
  // contract decision rather than a gate fix. Raised with the measured trade rather than
  // taken; see `engineering/decisions/2026-08-24-diagram-ink-tier-errors.md` §4.
  'errorTextColor',
]);

/** Every palette, with its `@import` chain flattened (base first, then overrides). */
function paletteSource(name, seen = new Set()) {
  if (seen.has(name)) return '';
  seen.add(name);
  const file = path.join(THEMES_DIR, `${name}.css`);
  if (!fs.existsSync(file)) return '';
  const css = fs.readFileSync(file, 'utf8');
  let out = '';
  for (const m of css.matchAll(/@import\s+['"]([^'"]+)['"]/g)) out += `${paletteSource(m[1], seen)}\n`;
  return out + css;
}

function declaredVars(css) {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const vars = {};
  for (const m of stripped.matchAll(/--([a-zA-Z0-9-]+)\s*:\s*([^;}]+)[;}]/g)) vars[m[1]] = m[2].trim();
  return vars;
}

const LAYOUT_CSS = fs.readFileSync(path.join(REPO, 'dist', 'lattice.css'), 'utf8');
const THEMES = fs.readdirSync(THEMES_DIR)
  .filter((f) => f.endsWith('.css') && !f.includes('audit'))
  .map((f) => f.replace(/\.css$/, ''))
  .sort();

function relativeLuminance(hex) {
  const c = hex.replace('#', '');
  const ch = [0, 2, 4].map((i) => Number.parseInt(c.slice(i, i + 2), 16) / 255);
  const lin = ch.map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function contrast(a, b) {
  const [l1, l2] = [relativeLuminance(a), relativeLuminance(b)];
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

const isHex = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v.trim());

/**
 * The palette token the map feeds a themeVariable, or null for a literal.
 *
 * Accepts a dotted key (`xyChart.titleColor`) so nested blocks are addressable —
 * without that, every nested ink key silently drops out of the gate.
 */
function tokenFor(key) {
  const [head, nested] = key.split('.');
  const entry = MERMAID_VAR_MAP[head];
  if (!entry) return null;
  if (nested === undefined) return entry.var ?? null;
  return entry.nested?.[nested]?.var ?? null;
}

/** Every ink-bearing themeVariable, nested blocks included, as dotted keys. */
function inkKeys() {
  // All three ink tiers the map feeds. `cat-on-mark` joined when the gitgraph
  // branch labels moved onto it (#1348) — without it those eight keys would drop
  // out of the coverage assertion below, and a later mis-assignment could delete
  // their SITES rows unnoticed.
  const INK_TOKENS = new Set(['cat-on-fill', 'cat-on-mark', 'text-heading']);
  const out = [];
  for (const [key, entry] of Object.entries(MERMAID_VAR_MAP)) {
    if (entry.nested) {
      for (const [nk, ne] of Object.entries(entry.nested)) if (INK_TOKENS.has(ne.var)) out.push(`${key}.${nk}`);
      continue;
    }
    if (INK_TOKENS.has(entry.var)) out.push(key);
  }
  return out;
}

describe('baked diagram ink clears AA on the surface it sits on', () => {
  test('the site table covers every ink key the map feeds from an ink token', () => {
    // Without this, deleting rows from SITES would quietly shrink the gate to
    // nothing while every remaining assertion stayed green. NESTED blocks are
    // walked too: an earlier version of this file looked only at top-level
    // entries, so the five xyChart label colours were never judged at all.
    const keys = inkKeys();
    const uncovered = keys.filter((k) => !SITES[k]);
    assert.deepEqual(uncovered, [],
      'these themeVariables carry ink but name no surface in SITES — add the pairing, do not drop the key');
    assert.ok(keys.length >= 45, `expected the ink tier to be substantial, got ${keys.length}`);
    assert.ok(keys.some((k) => k.includes('.')), 'the sweep must reach nested blocks');
  });

  test('every surface named in SITES is a real key in the map', () => {
    // Dotted, so a nested surface (`xyChart.backgroundColor`) resolves too.
    const exists = (key) => {
      const [head, nested] = key.split('.');
      const entry = MERMAID_VAR_MAP[head];
      if (!entry) return false;
      return nested === undefined ? true : Boolean(entry.nested?.[nested]);
    };
    const missing = [...new Set(Object.values(SITES))].filter((k) => !exists(k));
    assert.deepEqual(missing, [], 'SITES names surfaces the map does not define');
  });

  test('no sanction is stale — every KNOWN_BELOW_AA entry still fails somewhere', () => {
    // A sanction that has quietly started passing everywhere is a licence nobody
    // is using, and the next person reads it as "this pair is hopeless". Retire it.
    const stillFailing = new Set();
    for (const theme of THEMES) {
      const raw = declaredVars(`${LAYOUT_CSS}\n${paletteSource(theme)}`);
      for (const dark of [false, true]) {
        const resolve = (t) => resolveTokenExpr(raw[t], raw, dark);
        for (const inkKey of KNOWN_BELOW_AA) {
          const inkToken = tokenFor(inkKey);
          const surfaceToken = tokenFor(SITES[inkKey]);
          if (!inkToken || !surfaceToken) continue;
          const ink = resolve(inkToken);
          const surface = resolve(surfaceToken);
          if (!isHex(ink) || !isHex(surface)) continue;
          if (contrast(ink, surface) < AA) stillFailing.add(inkKey);
        }
      }
    }
    const stale = [...KNOWN_BELOW_AA].filter((k) => !stillFailing.has(k));
    assert.deepEqual(stale, [], 'these sanctions now pass everywhere — delete them from KNOWN_BELOW_AA');
  });

  for (const theme of THEMES) {
    const raw = declaredVars(`${LAYOUT_CSS}\n${paletteSource(theme)}`);
    for (const dark of [false, true]) {
      const scheme = dark ? 'dark' : 'light';
      test(`${theme} · ${scheme}`, () => {
        const resolve = (token) => resolveTokenExpr(raw[token], raw, dark);
        const failures = [];
        for (const [inkKey, surfaceKey] of Object.entries(SITES)) {
          if (KNOWN_BELOW_AA.has(inkKey)) continue;
          const inkToken = tokenFor(inkKey);
          const surfaceToken = tokenFor(surfaceKey);
          if (!inkToken || !surfaceToken) continue; // one side is a literal — nothing to resolve
          const ink = resolve(inkToken);
          const surface = resolve(surfaceToken);
          if (!isHex(ink) || !isHex(surface)) continue;
          const ratio = contrast(ink, surface);
          if (ratio < AA) {
            failures.push(
              `${inkKey} (--${inkToken} ${ink}) on ${surfaceKey} (--${surfaceToken} ${surface}) = ${ratio.toFixed(2)}:1`,
            );
          }
        }
        assert.deepEqual(failures, [],
          `${theme} (${scheme}) bakes diagram ink below AA:\n  ${failures.join('\n  ')}\n` +
          'A Mermaid SVG bakes its colours, so no CSS can fix this after the fact. Either the key is fed ' +
          'from the wrong tier in lib/core/mermaid-theme-map.js, or the palette needs to curate the token.');
      });
    }
  }
});
