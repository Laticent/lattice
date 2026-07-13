/**
 * Integration: COLOUR resolver ↔ real DOM parity.
 *
 * The guarantee the universal token system needs but nothing else asserts: that
 * a token resolves to the SAME value through the emulator's offline resolver
 * (lib/core/resolve-token-expr.js, the twin of getComputedStyle) and through a
 * REAL browser's getComputedStyle over the engine-rendered DOM. A rename that
 * points the resolver at a name one theme spells differently, or a resolver that
 * drifts from the browser's colour math, fails here instead of shipping an
 * off-brand diagram.
 *
 * The probe deck is rendered by the owned engine (the production HTML + CSS
 * emitter the emulator ships) so the cascade is the real one — tokens on
 * `section`, not a hand-injected `:root`; the latter does NOT reproduce
 * production and gives false negatives on alias-to-alias custom properties.
 * Two checks:
 *   1. Every bridge-fed token (the ones the Mermaid bridge reads) resolves to
 *      the EXACT same RGB in resolver vs browser, indaco + cuoio, light + dark.
 *   2. The resolver's color-mix() evaluation tracks Chromium within a couple of
 *      levels (forward-looking: guards re-derivation / the chart triad flowing
 *      through the bridge).
 *
 * Needs a Chromium (CHROME_PATH or the puppeteer cache) — same as the other
 * integration tests. See engineering/decisions/2026-06-11-universal-token-system.md.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const puppeteer = require('puppeteer');
const latticeEngine = require('../../../lib/engine');
const { resolveTokenExpr } = require('../../../lib/core/resolve-token-expr');

const ROOT = path.join(__dirname, '..', '..', '..');
const LATTICE_CSS_FILE = path.join(ROOT, 'dist', 'lattice.css');

/** Best-effort Chromium path — mirrors tools/screenshot.js. */
function resolveChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  for (const root of [path.join(os.homedir(), '.cache', 'puppeteer', 'chrome'), '/root/.cache/puppeteer/chrome']) {
    if (!fs.existsSync(root)) continue;
    for (const build of fs.readdirSync(root).filter(d => d.startsWith('linux-')).sort().reverse()) {
      const bin = path.join(root, build, 'chrome-linux64', 'chrome');
      if (fs.existsSync(bin)) return bin;
    }
  }
  return undefined;
}

/** Raw :root token map — mirrors the emulator's parsePaletteVars extraction. */
function rawRootVars(css) {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const vars = {};
  for (const block of stripped.match(/:root\s*\{[^}]*\}/g) || []) {
    for (const d of block.match(/--[a-z0-9-]+\s*:\s*[^;]+/gi) || []) {
      const m = d.match(/--([a-z0-9-]+)\s*:\s*(.+)$/i);
      if (m) vars[m[1]] = m[2].trim();
    }
  }
  return vars;
}

// One engine with every palette registered (lattice base + all themes/), so a
// `theme:` directive resolves to real token values — the same emitter the
// emulator ships.
const engine = (() => {
  const eng = latticeEngine.createEngine();
  eng.addThemes([LATTICE_CSS_FILE,
    ...fs.readdirSync(path.join(ROOT, 'themes')).filter((f) => f.endsWith('.css')).map((f) => path.join(ROOT, 'themes', f)),
  ].map((f) => fs.readFileSync(f, 'utf8')));
  return eng;
})();

/** Render a one-slide probe deck for `theme` to a self-contained HTML file via
 *  the owned engine (the production HTML + CSS emitter — tokens scoped to
 *  `section`, the real cascade, not a hand-injected `:root` that gives false
 *  negatives on alias-to-alias custom properties). */
function renderProbeHtml(theme) {
  const out = path.join(os.tmpdir(), `cp-${theme}-${process.pid}.html`);
  const { html, css } = engine.render(`---\ntheme: ${theme}\n---\n\n# probe\n\ntext\n`, theme);
  fs.writeFileSync(out, `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${html}</body></html>`);
  return out;
}

// The bridge-fed tokens (what the Mermaid bridge reads), now under the universal
// vocabulary. All flat `light-dark()` → exact match expected.
const BRIDGE_TOKENS = [
  ...Array.from({ length: 12 }, (_, i) => `cat-${i + 1}-fill`),
  ...Array.from({ length: 12 }, (_, i) => `cat-${i + 1}-mark`),
  'cat-on-fill', 'cat-on-mark',
  'diagram-stroke', 'diagram-line',
  'diagram-active', 'diagram-active-mark', 'diagram-done', 'diagram-done-mark',
  'diagram-critical', 'diagram-critical-mark', 'diagram-today', 'diagram-note',
  'bg', 'bg-alt', 'surface-inverse', 'text-heading',
];

const THEMES = ['indaco', 'cuoio'];
const MODES = [['light', false], ['dark', true]];

describe('color-parity (offline resolver ↔ real engine-rendered DOM getComputedStyle)', () => {
  let browser;
  const html = {};
  const raw = {};

  before(async () => {
    for (const theme of THEMES) {
      html[theme] = renderProbeHtml(theme);
      raw[theme] = rawRootVars(`${fs.readFileSync(LATTICE_CSS_FILE, 'utf8')}\n${fs.readFileSync(path.join(ROOT, 'themes', `${theme}.css`), 'utf8')}`);
    }
    browser = await puppeteer.launch({
      executablePath: resolveChrome(),
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  });
  after(async () => { if (browser) await browser.close(); });

  /** Used-value RGB of an expression on the slide section, via a 1px canvas
   * (format-agnostic: handles rgb(), oklab(), color(srgb …)). */
  async function usedRgb(page, mode, expr) {
    return page.evaluate((m, e) => {
      const sec = document.querySelector('section');
      sec.style.colorScheme = m;
      sec.style.color = '';
      sec.style.color = e;
      const c = getComputedStyle(sec).color;
      const cv = document.createElement('canvas'); cv.width = cv.height = 1;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#000'; ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2]];
    }, mode, expr);
  }

  for (const theme of THEMES) {
    for (const [mode, isDark] of MODES) {
      test(`${theme}/${mode}: every bridge token resolves to the same RGB in both renderers`,
        { timeout: 120000 },
        async () => {
          const page = await browser.newPage();
          await page.goto(`file://${html[theme]}`, { waitUntil: 'load', timeout: 60000 });
          const drift = [];
          for (const tok of BRIDGE_TOKENS) {
            const emuHex = resolveTokenExpr(raw[theme][tok], raw[theme], isDark);
            const emu = emuHex ? await usedRgb(page, mode, emuHex) : null; // canvas-normalize the emulator literal too
            const br = await usedRgb(page, mode, `var(--${tok})`);
            if (!emu) { drift.push(`--${tok}: emulator did not resolve (${raw[theme][tok]})`); continue; }
            if (emu.some((c, i) => c !== br[i])) drift.push(`--${tok}: emulator ${emuHex}→${emu} vs browser ${br}`);
          }
          await page.close();
          assert.deepEqual(drift, [], `cross-renderer colour drift (${theme}/${mode}):\n${drift.join('\n')}`);
        });
    }
  }

  test('color-mix() evaluation tracks Chromium (±3 per channel)',
    { timeout: 60000 },
    async () => {
      const exprs = [
        'color-mix(in oklab, #0a6ce0 24%, #ffffff)',
        'color-mix(in oklab, #c2790a 40%, #000000)',
        'color-mix(in oklab, #1e9e48 58%, #000000)',
        'color-mix(in srgb, #112233 50%, #ffffff)',
      ];
      const page = await browser.newPage();
      await page.goto(`file://${html.indaco}`, { waitUntil: 'load', timeout: 60000 });
      const drift = [];
      for (const e of exprs) {
        const emu = await usedRgb(page, 'light', resolveTokenExpr(e, {}, false));
        const br = await usedRgb(page, 'light', e);
        const delta = Math.max(...emu.map((c, i) => Math.abs(c - br[i])));
        if (delta > 3) drift.push(`${e}: emulator ${emu} vs browser ${br} (Δ${delta})`);
      }
      await page.close();
      assert.deepEqual(drift, [], `color-mix drift:\n${drift.join('\n')}`);
    });
});
