#!/usr/bin/env node
/**
 * check-viz-render — the SCOPED-CSS black-fill guard (born from the #956
 * map/quadrant/radar iOS-black bug).
 *
 * THE GAP THIS CLOSES. Every other colour check in the tree renders through the
 * UNSCOPED emulator/PDF path (each `section` IS the page, tokens land directly).
 * The docs-site hosts a human actually taps — playground / Studio / Player —
 * render WITHOUT Marp's `<foreignObject>`, so the engine re-scopes every selector
 * under `div.lattice > section` via `packTheme` (lib/engine/css.js) and composes
 * with `composeCss`. #956 was a bug in THAT scoper: a chart rule led by
 * `:is(section.map, figure.chart-frame)` was mis-scoped as a slide descendant,
 * so a component-local token it defined (`--map-base`, quadrant's `--cell-*`,
 * radar's base) stayed undefined and every SVG fill reading it fell to SVG's
 * black initial value. color-parity.test.js could not see it — it never renders
 * the scoped path. This tool does.
 *
 * WHAT IT DOES. Renders the chart gallery deck through the REAL scoped
 * `composeCss()` output a browser loads, in headless Chromium, across a
 * representative theme × {light, dark} matrix, and reads
 * `getComputedStyle().fill/stroke` (plus gradient `<stop>` stop-color) on every
 * SVG paintable element. Any paint that computes to opaque black `rgb(0, 0, 0)`
 * is a candidate: black is the SVG initial value a dropped/undefined `var()`
 * colour falls to, so a NEW black where a themed colour belongs is the signature
 * of a scoping/token regression.
 *
 * SCOPE. This targets exactly the surface where #956 can occur: the SVG-painting
 * chart components (funnel/journey/map/piechart/quadrant/radar/word-cloud). The
 * HTML/CSS-layout charts emit no SVG (a dropped `var()` there goes transparent,
 * not black), and Mermaid diagrams bake INLINE fills at mmdc time (immune to the
 * scoped-`var()` mechanism; covered by test/integration/mermaid/). See the DECKS
 * note below.
 *
 * THE BASELINE RATCHET (mirrors bench:bless + the check-ownership allowlists).
 * Some SVG paint is legitimately black — a max-contrast text ink
 * (`light-dark(black, white)` on the light canvas), a diagram hairline. Those
 * live in test/viz-render/black-baseline.json, snapshotted from a known-good
 * tree. The gate FAILS on any black NOT in the baseline (a regression) AND on a
 * STALE baseline entry that no longer appears (so the list can't rot). Re-bless
 * ONLY with the change that justifies it: `node tools/check-viz-render.js --bless`.
 *
 * Usage:
 *   node tools/check-viz-render.js            # gate: exit 1 on an unsanctioned black
 *   node tools/check-viz-render.js --bless    # rewrite the baseline (justify in the PR)
 *   node tools/check-viz-render.js --json      # machine-readable findings
 *
 * Needs a Chromium (CHROME_PATH or the puppeteer cache) — same as the other
 * integration renders. On a headless host with no browser it SKIPS (exit 0) with
 * a loud notice, never a false green claim (HARD RULE #23).
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const BASELINE_FILE = path.join(ROOT, 'test', 'viz-render', 'black-baseline.json');

// The theme × scheme matrix. Two themes with different brand hues so a
// theme-specific token gap can't hide behind indaco; both canvases because a
// token can resolve on one scheme and drop on the other (light-dark()).
const THEMES = ['indaco', 'cuoio'];
const SCHEMES = ['light', 'dark'];

// The deck whose slides carry SVG kernels that paint themed colour through the
// scoped path. SCOPE NOTE (checker H1/M1): only the SVG-painting chart components
// (funnel/journey/map/piechart/quadrant/radar/word-cloud) are inspectable here —
// the HTML/CSS-layout charts (gantt/kanban/progress/roadmap/timeline-list) emit no
// SVG, and diagram/Mermaid is NOT rendered to SVG in the preview path (mmdc bakes
// it at build time, with INLINE `fill:#…`, so it is immune to the scoped-`var()`
// #956 mechanism and is covered separately by test/integration/mermaid/). This
// guard therefore targets exactly the surface where the #956 bug can occur.
const DECKS = [{ file: path.join(ROOT, 'lib', 'components', 'chart', 'chart.gallery.md'), family: 'chart' }];

// SVG paint that is legitimately absent — never a "dropped colour" signal.
const TRANSPARENT = new Set(['none', 'transparent', 'rgba(0, 0, 0, 0)']);

// Only LEAF paintable shapes carry a visible fill/stroke. Structural elements
// (defs, gradients, <stop>, <g> groups, desc/title) compute fill:black by
// default but paint nothing, so they are pure noise for a dropped-colour check.
const PAINTABLE_TAGS = new Set(['path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline', 'line', 'text', 'tspan', 'use']);

/** Best-effort Chromium path — mirrors tools/screenshot.js + color-parity.test.js. */
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
 * A stable key for a black finding: family + component + element tag.class +
 * property + SCHEME. NOT the theme (a legit black ink is black on both indaco and
 * cuoio) and NOT the slide index (position shifts as galleries grow) — but the
 * scheme IS part of the key: a `light-dark(black, white)` ink is black on light
 * and white on dark, so a light-only sanction must NOT excuse a black on the dark
 * canvas (where that same element must be white — a real dropped-token symptom).
 * Coarse enough to be durable, specific enough that a real regression can't alias
 * onto a sanctioned entry (checker H2 + M3).
 */
function findingKey(f) {
  return `${f.family}/${f.component}/${f.selector}/${f.property}/${f.scheme}`;
}

async function collectBlacks() {
  const chrome = resolveChrome();
  if (!chrome) return { skipped: true, blacks: [] };

  // Lazy-require so --help / no-browser paths don't need the dep resolved.
  const puppeteer = require('puppeteer');
  const engine = require('../lib/engine');
  const { composeCss } = require('../lib/engine/css.js');
  const baseLatticeCss = fs.readFileSync(path.join(ROOT, 'dist', 'lattice.css'), 'utf8');

  const browser = await puppeteer.launch({ executablePath: chrome, args: ['--no-sandbox'] });
  const blacks = [];
  try {
    for (const deck of DECKS) {
      const src = fs.readFileSync(deck.file, 'utf8');
      for (const theme of THEMES) {
        const themeCss = fs.readFileSync(path.join(ROOT, 'themes', `${theme}.css`), 'utf8');
        const out = engine.render(src, theme, { preview: true });
        // THE PRODUCTION SURFACE: the scoped stylesheet a browser host loads,
        // not the unscoped emulator/PDF CSS.
        const css = composeCss({ themeCss, baseLatticeCss, sizeName: out.sizeName });
        for (const scheme of SCHEMES) {
          const page = await browser.newPage();
          await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
          const doc =
            `<!doctype html><html><head><style>:root{color-scheme:${scheme}}` +
            `${css}\n.lattice>section{width:1280px;height:720px}</style></head>` +
            `<body><div class="lattice" data-scheme="${scheme}">${out.html}</div></body></html>`;
          await page.setContent(doc, { waitUntil: 'networkidle0' });
          const found = await page.evaluate((TRANSPARENT_ARR, PAINTABLE_ARR, scheme) => {
            const transparent = new Set(TRANSPARENT_ARR);
            const paintable = new Set(PAINTABLE_ARR);
            const black = (v) => v === 'rgb(0, 0, 0)' || v === '#000000' || v === 'black';
            const out = [];
            for (const el of document.querySelectorAll('.lattice svg *')) {
              const tag = el.tagName.toLowerCase();
              const section = el.closest('section');
              const component = section
                ? [...section.classList].find((c) => c !== 'lattice') || section.className || '?'
                : '?';
              // The element's own most-specific class (or tag), PREFIXED with the
              // tag — so two different elements sharing a first class can't alias
              // onto one sanction key (checker M3).
              //
              // A CLASSLESS element gets its nearest classed ancestor as a
              // prefix. Wrapped SVG labels are `<text class="…"><tspan>` — the
              // tspan carries no class of its own and inherits the text's fill,
              // so a bare `tspan.` key would alias EVERY unclassed tspan in
              // every chart onto one sanction. One legitimately-black ink would
              // then mask a genuinely dropped color anywhere else.
              // When neither exists the key is the BARE TAG, with no trailing
              // dot: `tspan.` reads like a class that happens to be empty and
              // still aliases every classless tspan, which is the masking this
              // guards against. `tspan` says plainly that the sanction is for
              // an unattributable element — and that is a reason to look.
              const own = el.getAttribute('class');
              let selector = tag;
              if (own) {
                selector = `${tag}.${own.split(/\s+/)[0]}`;
              } else {
                const host = el.parentElement?.closest('svg [class]');
                const hostClass = host?.getAttribute('class');
                if (hostClass) {
                  selector = `${host.tagName.toLowerCase()}.${hostClass.split(/\s+/)[0]}>${tag}`;
                }
              }

              // A gradient <stop> paints no shape but feeds a shape's fill; a
              // themed stop-color that dropped to black is a real #956-family
              // regression (checker M2). Stops have no bbox — check stop-color
              // directly and skip the paintable/bbox path.
              if (tag === 'stop') {
                const sc = getComputedStyle(el).stopColor;
                if (!transparent.has(sc) && black(sc)) out.push({ component, selector, property: 'stop-color', scheme });
                continue;
              }

              if (!paintable.has(tag)) continue;
              // A zero-area element paints nothing — skip so an off-screen/empty
              // shape can't seed a phantom black. getBBox can throw on a
              // not-yet-laid-out/detached node in some engine states — treat a
              // throw as "unknown geometry, keep checking" rather than crashing
              // the whole run (checker L1).
              let box = null;
              try {
                box = el.getBBox ? el.getBBox() : null;
              } catch {
                box = null;
              }
              if (box && box.width === 0 && box.height === 0) continue;

              // A <line>/<polyline> has no fillable area — it paints via stroke
              // only, so its (always-black-by-default) fill is never visible.
              const props = tag === 'line' || tag === 'polyline' ? ['stroke'] : ['fill', 'stroke'];
              const cs = getComputedStyle(el);
              for (const property of props) {
                const v = cs[property];
                if (transparent.has(v)) continue;
                if (black(v)) out.push({ component, selector, property, scheme });
              }
            }
            return out;
          }, [...TRANSPARENT], [...PAINTABLE_TAGS], scheme);
          for (const f of found) blacks.push({ family: deck.family, ...f });
          await page.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
  return { skipped: false, blacks };
}

/** Dedupe findings to unique keys, keeping a representative for reporting. */
function uniqueByKey(findings) {
  const seen = new Map();
  for (const f of findings) if (!seen.has(findingKey(f))) seen.set(findingKey(f), f);
  return [...seen.values()];
}

/**
 * The pure comparison, shared by the CLI gate and the integration test: render,
 * diff against the baseline, return { skipped, regressions, stale, found }.
 */
async function evaluate() {
  const { skipped, blacks } = await collectBlacks();
  if (skipped) return { skipped: true, regressions: [], stale: [], found: [] };
  const found = uniqueByKey(blacks).sort((a, b) => findingKey(a).localeCompare(findingKey(b)));
  const foundKeys = new Set(found.map(findingKey));
  const baseline = fs.existsSync(BASELINE_FILE) ? JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')) : { sanctioned: [] };
  const sanctionedKeys = new Set(baseline.sanctioned.map(findingKey));
  const regressions = found.filter((f) => !sanctionedKeys.has(findingKey(f)));
  const stale = [...sanctionedKeys].filter((k) => !foundKeys.has(k));
  return { skipped: false, regressions, stale, found, findingKey };
}

module.exports = { collectBlacks, evaluate, findingKey, uniqueByKey, BASELINE_FILE, THEMES, SCHEMES };

async function main() {
  const args = process.argv.slice(2);
  const bless = args.includes('--bless');
  const asJson = args.includes('--json');

  const { skipped, blacks } = await collectBlacks();
  if (skipped) {
    console.error('check-viz-render: SKIPPED — no Chromium (set CHROME_PATH). Not a pass; the scoped-render guard did not run.');
    process.exit(0);
  }

  const found = uniqueByKey(blacks).sort((a, b) => findingKey(a).localeCompare(findingKey(b)));
  const foundKeys = new Set(found.map(findingKey));

  if (bless) {
    const payload = {
      note: 'Sanctioned opaque-black SVG paint on the SCOPED render path. Each entry is a legitimately-black ink/hairline, NOT a dropped-colour bug. Regenerate with `node tools/check-viz-render.js --bless`; justify any addition in the PR.',
      themes: THEMES,
      schemes: SCHEMES,
      sanctioned: found.map((f) => ({ family: f.family, component: f.component, selector: f.selector, property: f.property, scheme: f.scheme })),
    };
    fs.mkdirSync(path.dirname(BASELINE_FILE), { recursive: true });
    fs.writeFileSync(BASELINE_FILE, `${JSON.stringify(payload, null, 2)}\n`);
    console.log(`check-viz-render: blessed ${found.length} sanctioned black entries → ${path.relative(ROOT, BASELINE_FILE)}`);
    return;
  }

  const baseline = fs.existsSync(BASELINE_FILE) ? JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')) : { sanctioned: [] };
  const sanctionedKeys = new Set(baseline.sanctioned.map(findingKey));

  const regressions = found.filter((f) => !sanctionedKeys.has(findingKey(f)));
  const stale = [...sanctionedKeys].filter((k) => !foundKeys.has(k));

  if (asJson) {
    console.log(JSON.stringify({ regressions, stale, found }, null, 2));
  }

  if (regressions.length === 0 && stale.length === 0) {
    console.log(`check-viz-render OK — ${found.length} sanctioned black(s), no unsanctioned black SVG paint on the scoped path (${THEMES.join('/')} × ${SCHEMES.join('/')}).`);
    return;
  }

  if (regressions.length) {
    console.error(`\ncheck-viz-render FAILED — ${regressions.length} NEW black SVG paint (a dropped-colour regression on the scoped playground/Studio/Player path):`);
    for (const f of regressions) console.error(`  ✗ ${f.family} · section.${f.component} · ${f.selector} { ${f.property} } → rgb(0,0,0)`);
    console.error('\n  A themed SVG colour resolved to nothing and fell to black. Usually a selector-scoping or token-name break (see #956).');
    console.error('  If this black is INTENTIONAL (a max-contrast ink), re-bless: node tools/check-viz-render.js --bless');
  }
  if (stale.length) {
    console.error(`\ncheck-viz-render FAILED — ${stale.length} STALE baseline entr(y/ies) no longer render black (the list rotted):`);
    for (const k of stale) console.error(`  ✗ ${k}`);
    console.error('\n  Re-bless to drop them: node tools/check-viz-render.js --bless');
  }
  process.exit(1);
}

if (require.main === module) {
  main().catch((e) => {
    console.error('check-viz-render: crashed —', e?.stack ? e.stack : e);
    process.exit(1);
  });
}
