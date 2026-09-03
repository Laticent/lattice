#!/usr/bin/env node
/**
 * Bundle the Anima host + vector backends into ONE self-contained IIFE string, for
 * injection into the exported `.html` player (Stage 6b, slice C).
 *
 *   docs/src/lib/anima/hydrate.ts (+ zdog / vivus backends)
 *     →  lib/export/anima-player-bundle.generated.mjs
 *        (`export const ANIMA_PLAYER_JS = "<iife source>"`)
 *
 * WHY a string constant, not a browser module: the player's runtime is a SINGLE
 * CSP-hashed inline <script> assembled by `player-core.mjs`'s `playerJs()` — it cannot
 * `import`. The backends (Zdog/Vivus) are whole libraries, so they can't be `.toString()`-
 * inlined the way the present-transport kernel is; they must be pre-bundled. `player-core`
 * imports this string and injects it (only when the deck carries a live scene, so a
 * scene-less export stays byte-identical — the html-player golden holds). Both consumers
 * — the CLI `--player` path (via player-core.mjs) and the Studio share-export (via the
 * browser-bundled player-core.generated.js) — inherit it from that one assembler.
 *
 * BOUNDARY: this is a BUILD step that READS the Anima source (the consumer side, allowed);
 * the runtime engine reads only the generated STRING, never docs/ — so `checkAnimaBoundary`
 * (the host imports only in-folder + node:) is untouched. The IIFE exposes
 * `window.__latticeAnima.hydrateScenes`; the untrusted spec is still validated by
 * `parseScene` inside the host, and svg markup is inert-parsed by the Vivus backend
 * (defense-in-depth on top of the player's export-time DOMPurify pass).
 *
 * Flags: --check (freshness gate, exit 1 on drift), --silent.
 */

const esbuild = require('esbuild');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.resolve(__dirname, '..');
const ANIMA_DIR = path.join(ROOT, 'docs', 'src', 'lib', 'anima');
const OUT_FILE = path.join(ROOT, 'lib', 'export', 'anima-player-bundle.generated.mjs');

const argv = process.argv.slice(2);
const check = argv.includes('--check');
const silent = argv.includes('--silent') || check;

// The player calls `window.__latticeAnima.hydrateScenes(document)`. Default opts give the
// host its non-eager path — an IntersectionObserver lazy-mounts each scene on view and
// pauses it off-screen. That works NATIVELY here (the player runs in its own top-level
// document, not a cross-origin-scaled iframe), so the export gets play-on-view + pause-
// off-screen for free. Sanitize defaults to identity: the markup was DOMPurified at export
// time and Vivus inert-parses as a runtime backstop.
const ENTRY_CONTENTS = `
import { rendererFor } from './backends/registry';
import { hydrateScenes } from './hydrate';
window.__latticeAnima = {
  // \`rendererFor\` is now injected rather than imported by the host, so the entry declares
  // which backends it can reach and esbuild drops the rest. THIS entry is the scene player,
  // which needs both (a built scene renders on Zdog, an svg scene on Vivus).
  hydrateScenes: (root, opts) => hydrateScenes(root || document, { rendererFor, ...opts }),
};
`;

// The CHART entry. A separate bundle rather than a second export off the scene one, because
// the whole point is that a chart deck never ships the scene backends: charts emit only
// `reveal`/`slide`, so they use `backends/marks.ts` and pull in neither Zdog nor anime.js.
// Measured: 20,981 bytes raw against the scene player's ~81,500.
//
// It mirrors `anima-scenes.ts`'s rebind() cascade — deck `motion:` on means EVERY chart
// section is eligible, otherwise only per-slide opt-ins — because that cascade is the
// authoring contract and two implementations of it would drift. The deck's front-matter
// values are baked in by player-core at export time (an exported file has no front matter to
// read), and land here as `__latticeChartMotion`.
const CHART_ENTRY_CONTENTS = `
import { hydrateChart } from '../chart-anima-hydrate';
import { hasAnimatableChart, MOTION_OPT_IN_SEL, parseDeckMotion, PREHIDE_CLASS, prehideEligibleCharts, resolveMotion, speedToDurationMs } from '../../playground/anima-host-sel';

window.__latticeAnimaCharts = {
  // \`raw\` is the deck's three front-matter scalars exactly as authored. Parsing them HERE
  // rather than at export time is what keeps one interpretation: this is the same
  // \`parseDeckMotion\` the Playground calls, so a forwarded file and the live surface cannot
  // disagree about what \`motion: on\` meant.
  hydrate(root, raw) {
    const d = root || document;
    const deck = parseDeckMotion(raw && raw.motion, raw && raw.style, raw && raw.speed);
    const controllers = [];
    // Hide eligible charts BEFORE the first paint so a build does not flash its finished
    // state and then restart — the same pre-hide the live surfaces use.
    const prehidden = prehideEligibleCharts(d, deck);
    const sections = deck.play === 'on'
      ? Array.from(d.querySelectorAll('section')).filter(hasAnimatableChart)
      : Array.from(d.querySelectorAll(MOTION_OPT_IN_SEL));
    for (const section of sections) {
      const cfg = resolveMotion(section, deck);
      if (!cfg) continue;
      const marks = section.querySelectorAll('svg [data-mark]').length;
      const c = hydrateChart(section, { style: cfg.style, durationMs: speedToDurationMs(cfg.speed, marks) });
      if (c) controllers.push(c);
    }
    for (const el of prehidden) el.classList.remove(PREHIDE_CLASS);
    return { dispose: () => { for (const c of controllers) c.dispose(); } };
  },
};
`;

const BUILD_OPTIONS = {
  stdin: { contents: ENTRY_CONTENTS, resolveDir: ANIMA_DIR, loader: 'ts', sourcefile: 'anima-player.entry.ts' },
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome109'],
  minify: true, // the player embeds this verbatim; keep the export small
  legalComments: 'none',
};

async function buildIife(options = BUILD_OPTIONS) {
  const result = await esbuild.build({ ...options, write: false });
  return result.outputFiles[0].text;
}

const CHART_BUILD_OPTIONS = {
  ...BUILD_OPTIONS,
  stdin: { contents: CHART_ENTRY_CONTENTS, resolveDir: ANIMA_DIR, loader: 'ts', sourcefile: 'anima-chart.entry.ts' },
  alias: { '@': path.join(ROOT, 'docs', 'src') },
};

function moduleSource(iife, chartIife) {
  return (
    '// Auto-generated by tools/build-anima-player.js — DO NOT EDIT.\n' +
    '// Sources: docs/src/lib/anima/hydrate.ts (+ zdog / anime.js drawable backends) for the SCENE\n' +
    '// player; docs/src/lib/chart-anima-hydrate.ts (+ the marks backend) for the CHART player.\n' +
    '// Two bundles, deliberately: a chart deck must not ship the scene backends it cannot reach.\n' +
    '// Rebuild: npm run anima-player:build\n' +
    `export const ANIMA_PLAYER_JS = ${JSON.stringify(iife)};\n` +
    `export const ANIMA_CHART_JS = ${JSON.stringify(chartIife)};\n`
  );
}

async function main() {
  const iife = await buildIife();
  const chartIife = await buildIife(CHART_BUILD_OPTIONS);
  const out = moduleSource(iife, chartIife);
  if (check) {
    const current = fs.existsSync(OUT_FILE) ? fs.readFileSync(OUT_FILE, 'utf8') : '';
    if (current !== out) {
      console.error('[build-anima-player] STALE — run `npm run anima-player:build` and commit lib/export/anima-player-bundle.generated.mjs');
      process.exit(1);
    }
    if (!silent) console.log('[build-anima-player] up to date.');
    return;
  }
  fs.writeFileSync(OUT_FILE, out);
  if (!silent) console.log(`[build-anima-player] wrote ${path.relative(ROOT, OUT_FILE)} (${(iife.length / 1024).toFixed(1)} KB IIFE).`);
}

main().catch((err) => {
  console.error('[build-anima-player]', err);
  process.exit(1);
});
