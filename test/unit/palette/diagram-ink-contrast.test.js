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
  quadrantPointTextFill: 'quadrant1Fill',
  quadrantXAxisTextFill: 'background',
  quadrantYAxisTextFill: 'background',
  quadrantTitleFill:     'background',
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

/**
 * Ink keys that are BELOW AA today, on every palette, and were before this gate
 * existed. Sanctioned so the gate can ship green over the pairs it was written
 * for, without pretending these are fine.
 *
 * Both are the same shape: `--cat-on-fill` is curated to sit on the PALE
 * `--cat-N-fill` band, and these two keys put it on something else.
 *
 *   gitBranchLabel0-7  on git0-7 = `--cat-N-MARK`, the saturated mid-tone. 1.2-3.0:1
 *                      in every shipped palette, both schemes. Pre-dates this
 *                      branch on the export path; the preview path fed it
 *                      `--text-heading`, which fails the same chips from the other
 *                      side. A real fix is a third ink tier ("on-mark") or moving
 *                      the branch chips to the pale band — a palette-contract
 *                      change, not a map edit.
 *   noteTextColor      on `--diagram-note`, 3.83:1 in five palettes. Marginal, and
 *                      the same "ink curated for one tier, used on another" story.
 *
 * The list is exceed-only: an entry that starts PASSING everywhere is a stale
 * sanction and fails below, so it cannot rot. Adding a row means arguing for it.
 */
const KNOWN_BELOW_AA = new Set([
  ...Array.from({ length: 8 }, (_, i) => `gitBranchLabel${i}`),
  'noteTextColor',
  // errorTextColor (--bg) on errorBkgColor (--fail): 1.55-2.28:1 on the four
  // a11y palettes in dark and on carbone in light. Identical on origin/main —
  // #1181 decoupled this pair from --cat-on-mark/--diagram-critical precisely to
  // fix a worse version of it, on the stated grounds that the ['bg','fail'] pair
  // "the slide-surface audit already holds to AA in both modes". That audit
  // evidently does not cover these five combos. Untouched here; the fix is a
  // palette-side --fail curation, not a map edit.
  'errorTextColor',
  // sequenceNumberColor (--cat-on-fill) on the autonumber badge (--diagram-line).
  // Same shape as gitBranchLabel: pale-band ink on a saturated mark-tier fill.
  'sequenceNumberColor',
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

/** The palette token the map feeds a themeVariable, or null for a literal. */
function tokenFor(key) {
  const entry = MERMAID_VAR_MAP[key];
  return entry?.var ?? null;
}

describe('baked diagram ink clears AA on the surface it sits on', () => {
  test('the site table covers every ink key the map feeds from an ink token', () => {
    // Without this, deleting rows from SITES would quietly shrink the gate to
    // nothing while every remaining assertion stayed green.
    const INK_TOKENS = new Set(['cat-on-fill', 'text-heading']);
    const inkKeys = Object.entries(MERMAID_VAR_MAP)
      .filter(([, e]) => INK_TOKENS.has(e.var))
      .map(([k]) => k);
    const uncovered = inkKeys.filter((k) => !SITES[k]);
    assert.deepEqual(uncovered, [],
      'these themeVariables carry ink but name no surface in SITES — add the pairing, do not drop the key');
    assert.ok(inkKeys.length >= 40, `expected the ink tier to be substantial, got ${inkKeys.length}`);
  });

  test('every surface named in SITES is a real key in the map', () => {
    const missing = [...new Set(Object.values(SITES))].filter((s) => !MERMAID_VAR_MAP[s]);
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
