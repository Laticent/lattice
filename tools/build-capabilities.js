#!/usr/bin/env node
/**
 * Generate engineering/capabilities.md — the single index of what this repo
 * already HAS: every npm script, every tool in tools/, and the frameworks we
 * build on.
 *
 * Why this exists: capabilities kept getting REDISCOVERED. Sessions rolled
 * their own benchmark harness without knowing `npm run bench` (tinybench)
 * existed; dozens of tools and scripts had no catalog, so agents reinvented
 * them.
 * Components never suffer this — they're catalogued (components.json) and
 * gated. This gives tools/scripts/frameworks the same treatment.
 *
 * Sources of truth that can't drift:
 *   - package.json `scripts`  → every command (described in SCRIPT_META here)
 *   - tools/*.{js,mjs,sh,py}  → every tool (description read from its header)
 *   - FRAMEWORKS (curated)    → the semantic "what we build on" a name omits
 *
 * Mandatory-description gate: a script with no SCRIPT_META entry, or a tool
 * whose header has no description line, renders a visible **TODO** — which
 * makes --check fail as drift. So a new capability cannot land uncatalogued:
 * either describe it here / in the tool header, or the gate blocks the commit.
 * This mirrors tools/build-dist-readme.js.
 *
 * Flags:
 *   --check    Generate in memory and diff against the committed
 *              engineering/capabilities.md. Exits 1 on drift (incl. any TODO).
 *              CI / build:check / pre-commit gate.
 *   --silent   Suppress the success log line (implied by --check).
 */

const fs   = require('node:fs');
const path = require('node:path');

const ROOT      = path.resolve(__dirname, '..');
const TOOLS_DIR = path.join(ROOT, 'tools');
const OUT_FILE  = path.join(ROOT, 'engineering', 'capabilities.md');

const argv   = process.argv.slice(2);
const check  = argv.includes('--check');
const silent = argv.includes('--silent') || check;

// ── Frameworks & libraries (curated) ─────────────────────────────────────
// The semantic layer a script/tool name alone doesn't announce. Keep this to
// the things an agent might otherwise REINVENT.
const FRAMEWORKS = [
  ['Testing', "Node's built-in test runner (`node:test`) — no Jest/Mocha/Vitest.", '`npm test` (suite) · `node --test <file>` (one file; the `<dir>` form errors)'],
  ['Benchmarking', '`tinybench` render benchmark — the owned lattice-engine over time, on-demand (NOT in `npm test`). A committed baseline (`test/benchmark/baseline.json`) is the perf ratchet: `bench:bless` writes it, `bench:check` compares within a variance band (HARD RULE #19).', '`npm run bench` (`-- --export` adds rasterize · `-- --json` machine-readable) · `npm run bench:bless` / `bench:check` · `test/benchmark/engine-bench.mjs`'],
  ['Lint / format', 'Biome (linter on, formatter off). The registry `biome` is the WRONG package — always go through npm.', '`npm run lint` / `lint:fix` · never `npx biome`'],
  ['Rendering', 'The owned lattice-engine renders every shipping path (the emulator CLI + the docs playground).', '`node lattice-emulator.js deck.md deck.pdf` (set `CHROME_PATH`)'],
  ['Browser automation', 'puppeteer with the cached Chromium (screenshots, export, DOM checks).', '`tools/screenshot.js` · custom scripts from repo root'],
  ['Bundling', 'esbuild — every `dist/` JS bundle and docs-site core is an esbuild build.', '`npm run build` (orchestrates all generators behind the ownership gate)'],
  ['Docs site', 'Astro + Starlight + React 19 + Tailwind v4 + shadcn/ui (new-york) + CodeMirror — a SEPARATE npm package under docs/. shadcn maps onto the 14-palette Lattice theme via the token bridge (`docs/src/styles/tailwind.css`); React islands are tested with Vitest + Testing Library. House additions to `docs/src/components/ui/` beyond stock shadcn: `split.tsx` — the pane splitter (pointer-captured drag, rail collapse, ARIA window-splitter, persisted ratio) shared by the Playground and Studio; don\'t hand-roll another.', '`cd docs && npm run dev` (runs the sync steps + astro; see CLAUDE.md § Cloud sandbox)'],
  ['Quality assessment', '`dependency-cruiser` (structural coupling, circular deps, custom architectural-boundary rules — `.dependency-cruiser.cjs`), `jscpd` (duplication — `.jscpd.json`), and `knip` (dead files/exports — `knip.json`), plus two bespoke scripts (git change-coupling, acorn-based complexity). On-demand diagnostic, NOT a blocking CI gate — mirrors `bench`/`scorecard`\'s baseline-ratchet pattern.', '`npm run quality` · `quality:bless` · `quality:check` · `engineering/quality-assessment.md`'],
  ['Self-driving walkthroughs', 'Vetrina — the framework-free "fake cursor drives the real app, seamlessly interruptible" engine (`docs/src/lib/vetrina/`). Powers the Studio demo; reusable for help tours, auto-presenters, narrated edits. Author with `storyboard()` / `scene()` / a raw `Walkthrough`; drive from React via the `useWalkthrough` adapter (`./react`). CSS-first `--vt-*` theming, a 5-gesture alphabet, `drag`, `awaitUser`. Two ownership gates keep it decoupled + the alphabet frozen. Do NOT hand-roll a tour — reuse this.', '`docs/src/lib/vetrina/README.md` · `import { scene, run } from \'…/lib/vetrina\'` · `npm run check:vetrina` (standalone typecheck)'],
];

// ── npm scripts (mandatory descriptions) ─────────────────────────────────
// group → ordered. desc is one line. A package.json script with no entry here
// renders a TODO and fails --check (the capture forcing-function).
const SCRIPT_META = {
  // Build & bundle
  'build':                    ['Build & bundle', 'Regenerate every generated artifact in dependency order, behind the ownership gate.'],
  'build:check':              ['Build & bundle', 'Freshness gate: regenerate in memory and byte-diff every artifact; fail on drift (CI/pre-push).'],
  'css:build':                ['Build & bundle', 'Bundle dist/lattice.css (+ .min) — the palette-blind engine stylesheet.'],
  'css:check':                ['Build & bundle', 'Freshness gate for dist/lattice.css.'],
  'default:build':            ['Build & bundle', 'Build dist/lattice-default.css — the flattened zero-config drop-in (engine + cuoio).'],
  'default:check':            ['Build & bundle', 'Freshness gate for the default bundle.'],
  'runtime:build':            ['Build & bundle', 'Build dist/lattice-runtime.js — browser runtime transforms (vscode preview / web export).'],
  'runtime:check':            ['Build & bundle', 'Freshness gate for the runtime bundle.'],
  'runtime:watch':            ['Build & bundle', 'Rebuild the runtime bundle on change.'],
  'emulator:build':           ['Build & bundle', 'Build dist/lattice-emulator.js — the bundled Marp-faithful CLI (package bin/main).'],
  'emulator:check':           ['Build & bundle', 'Freshness gate for the emulator bundle.'],
  'playground:build':         ['Build & bundle', 'Build docs/public/playground/lattice-playground.js — the in-browser engine bundle.'],
  'playground:check':         ['Build & bundle', 'Freshness gate for the playground bundle.'],
  'playground:watch':         ['Build & bundle', 'Rebuild the playground bundle on change.'],
  'theme-core:build':         ['Build & bundle', 'Bundle the pure Theme Studio core for the browser (docs site).'],
  'theme-core:check':         ['Build & bundle', 'Freshness gate for the theme-core bundle.'],
  'layout-core:build':        ['Build & bundle', 'Bundle the pure Layout Studio core for the browser (docs site).'],
  'layout-core:check':        ['Build & bundle', 'Freshness gate for the layout-core bundle.'],
  'authoring-core:build':     ['Build & bundle', 'Bundle the pure authoring engines (lint/review/scorecard) for the browser.'],
  'authoring-core:check':     ['Build & bundle', 'Freshness gate for the authoring-core bundle.'],
  'exemplar-core:build':      ['Build & bundle', 'Bundle the pure exemplar tier-filter for the browser (Drafting picker length chooser).'],
  'exemplar-core:check':      ['Build & bundle', 'Freshness gate for the exemplar-core bundle.'],
  'standalone-core:build':    ['Build & bundle', 'Bundle the standalone chart-SVG export core for the browser (docs site).'],
  'standalone-core:check':    ['Build & bundle', 'Freshness gate for the standalone-core bundle.'],
  'snippets:build':           ['Build & bundle', 'Generate .vscode/lattice.code-snippets from component manifests.'],
  'snippets:check':           ['Build & bundle', 'Freshness gate for the VS Code snippets.'],
  'dist-readme:build':        ['Build & bundle', 'Generate dist/README.md — the distribution-folder index.'],
  'dist-readme:check':        ['Build & bundle', 'Freshness gate for dist/README.md.'],
  'capabilities:build':       ['Build & bundle', 'Generate engineering/capabilities.md — the index of every script, tool, and framework.'],
  'capabilities:check':       ['Build & bundle', 'Freshness gate for capabilities.md; fails on drift or any undescribed script/tool.'],
  'docs:components':          ['Build & bundle', 'Generate per-component docs.md + gallery.md siblings from each manifest.'],
  'docs:components:check':    ['Build & bundle', 'Freshness gate for the per-component docs.'],
  'docs:portal':              ['Build & bundle', 'Aggregate manifests into dist/docs/components.{md,json} + grammar.json (the LFM per-component grammar) — the canonical component catalog.'],
  'docs:portal:check':        ['Build & bundle', 'Freshness gate for the component catalog (md/json) + LFM grammar.json.'],
  'docs:forms':               ['Build & bundle', 'Aggregate the Form manifests (lib/forms/{frame,tile,cell}) into dist/docs/forms.json — the machine catalog of the Frame + Cell + Tile composition model.'],
  'docs:forms:check':         ['Build & bundle', 'Freshness gate for the Form catalog (dist/docs/forms.json).'],
  'docs:concepts':            ['Build & bundle', 'Project the concept ontology (lib/concepts) into dist/docs/concepts.json — the machine catalog of the four axes, the Frame/Cell/Tile nouns, the Component join, and the typed relationships between them; counts derive live from the component + form catalogs.'],
  'docs:concepts:check':      ['Build & bundle', 'Freshness + drift gate for the concept catalog (dist/docs/concepts.json) — fails if the ontology references a vocabulary the live catalogs no longer ship.'],
  'docs:landing-tokens':      ['Build & bundle', 'Emit per-palette CSS token blocks for the docs landing page.'],
  'docs:landing-tokens:check':['Build & bundle', 'Freshness gate for the landing-page token blocks.'],
  'docs:spec':                ['Build & bundle', 'Generate the docs-site Specification pages (LFM 1.0 + Diagnostic Protocol) from the canonical spec/*.md.'],
  'docs:spec:check':          ['Build & bundle', 'Freshness gate for the generated docs-site spec pages (stale vs spec/).'],
  'a11y-textures:build':      ['Build & bundle', 'Bundle the categorical/chart texture-<defs> kernel (lib/core/accessibility-textures.js) into the docs Playground ESM module.'],
  'a11y-textures:check':      ['Build & bundle', 'Freshness gate for the bundled a11y-textures Playground module.'],
  'player-core:build':        ['Build & bundle', 'Bundle the pure HTML-player assembly core (lib/export/player-core.mjs) for the browser — the Studio "Download as webpage" export.'],
  'player-core:check':        ['Build & bundle', 'Freshness gate for the player-core Playground bundle.'],
  'cadenza-lib:build':        ['Build & bundle', 'Build the Cadenza library dist/ (CJS + .d.ts, esbuild + tsc) so root CJS can require(\'@slidewright/cadenza\') — the workspace package that retires the caption hand-mirrors.'],
  'cadenza-lib:check':        ['Build & bundle', 'Freshness gate for the Cadenza library dist/ (stale vs docs/src/lib/cadenza/*.ts).'],
  'vetrina-lib:build':        ['Build & bundle', 'Build the Vetrina library dist/ (two CJS entries + .d.ts, esbuild + tsc; react external) — the publishable workspace package for the walkthrough engine.'],
  'vetrina-lib:check':        ['Build & bundle', 'Freshness gate for the Vetrina library dist/ (stale vs docs/src/lib/vetrina/*.ts).'],
  'decisions:index':          ['Build & bundle', 'Regenerate the "Current notes" index in engineering/decisions/README.md from each note\'s YAML front-matter.'],
  'decisions:index:check':    ['Build & bundle', 'Freshness gate for the decisions-index (stale vs the notes\' front-matter).'],

  // Galleries & preview (rendered PDFs)
  'build:galleries':          ['Galleries & preview', 'Rebuild per-component gallery PDFs (light + dark).'],
  'build:galleries:check':    ['Galleries & preview', 'Freshness gate for the per-component galleries.'],
  'build:bucket-galleries':   ['Galleries & preview', 'Rebuild per-bucket survey gallery PDFs (light + dark).'],
  'build:bucket-galleries:check':['Galleries & preview', 'Freshness gate for the bucket survey galleries.'],
  'build:gallery-jargon':     ['Galleries & preview', 'Rebuild the jargon showcase gallery PDF.'],
  'build:exemplar-pdfs':      ['Galleries & preview', 'Bulk-regenerate committed PDFs for the worked exemplar decks (on-demand, like bless; not in build). `-- --only <stem>` for one.'],
  'preview':                  ['Galleries & preview', 'Fast visual-iteration loop: scope-detect from git diff, rebuild affected, pixel-diff vs last commit.'],
  'preview:watch':            ['Galleries & preview', 'Run the preview loop on change.'],
  'preview:component':         ['Galleries & preview', 'Faithfully render ONE local / AI-generated component to a PNG (lattice.css + the component CSS, full frame) for pixel review.'],

  // Test & verify
  'test':                     ['Test & verify', 'Full unit suite (node:test). The inner loop.'],
  'test:watch':               ['Test & verify', 'Re-run the unit suite on file change.'],
  'test:all':                 ['Test & verify', 'Unit + integration umbrella.'],
  'test:coverage':            ['Test & verify', 'c8 coverage over the unit suite (→ .scratch/coverage/).'],
  'test:coverage:all':        ['Test & verify', 'c8 coverage over unit + integration.'],
  'test:palette':             ['Test & verify', 'Unit scope: palette, resolution, contrast.'],
  'test:mermaid':             ['Test & verify', 'Unit scope: mermaid var-map.'],
  'test:parsing':             ['Test & verify', 'Unit scope: source-parse, splitter, slot-label-lift, marp plugins.'],
  'test:components':          ['Test & verify', 'Unit scope: component manifests + per-component logic.'],
  'test:cli':                 ['Test & verify', 'Unit scope: the CLI.'],
  'test:playground':          ['Test & verify', 'Unit scope: the playground bundle/core.'],
  'test:engine':              ['Test & verify', 'Unit scope: lattice-engine internals.'],
  'test:layout':              ['Test & verify', 'Unit scope: the layout system.'],
  'test:transformers':        ['Test & verify', 'Unit scope: transformer registry/adapters.'],
  'test:authoring':           ['Test & verify', 'Unit scope: authoring helpers (speaker notes, …).'],
  'test:core':                ['Test & verify', 'Unit scope: lib/core/* (token resolver, splits, marp bundle, …).'],
  'test:export':              ['Test & verify', 'Unit scope: the owned export writers (PPTX, …).'],
  'test:release':             ['Test & verify', 'Unit scope: the release tooling.'],
  'test:tokens':              ['Test & verify', 'Unit scope: the universal token system.'],
  'test:tools':               ['Test & verify', 'Unit scope: author tools (export-marp, …).'],
  'test:integration':         ['Test & verify', 'The FULL integration tier (every suite — PR slice + nightly slice). What pre-push runs under LATTICE_FULL_PUSH=1.'],
  'test:integration:pr':      ['Test & verify', 'PR-blocking integration slice (the required CI gate): cross-path wiring (parity) + export pipeline + per-component semantic invariants.'],
  'test:integration:nightly': ['Test & verify', 'Nightly render-regression slice (runs on main via integration-nightly.yml): gallery/component/exemplar page-counts + mermaid + screenshot.'],
  'test:integration:galleries':['Test & verify', 'Integration scope: gallery render + page-count regression.'],
  'test:integration:parity': ['Test & verify', 'Integration scope: resolver↔DOM colour parity, deck-class/finish/logo front-matter, chart-family.'],
  'test:integration:mermaid':['Test & verify', 'Integration scope: mermaid smoke render.'],
  'test:integration:screenshot':['Test & verify', 'Integration scope: the screenshot harness.'],
  'test:integration:exemplars':['Test & verify', 'Integration scope: the 45 worked exemplars render + committed-PDF freshness (page-count gate).'],
  'bench':                    ['Test & verify', 'tinybench render benchmark — the owned engine over time (on-demand; not in `npm test`). `-- --export` / `-- --json`.'],
  'bench:bless':              ['Test & verify', 'Write the committed perf baseline (test/benchmark/baseline.json) from a fresh bench run — the ratchet a perf PR updates (HARD RULE #19).'],
  'bench:check':              ['Test & verify', 'Re-run the bench and compare vs the committed baseline; flags a regression only beyond the variance band (max of tolerancePct and combined RME). On-demand, not a blocking CI gate.'],
  'regress':                  ['Test & verify', 'Visual regression gate (LOCAL spot-check): render every gallery fresh and pixel-diff it against the committed golden PDF; fails on unblessed drift.'],
  'bless':                    ['Test & verify', 'Re-render the gallery goldens (the regression gate baseline) and overwrite them; commit the refreshed PDFs. `-- --only <name>` for one.'],

  // Lint & audit
  'lint':                     ['Lint & audit', 'Biome over the JS tree (read-only). NEVER `npx biome`.'],
  'lint:fix':                 ['Lint & audit', 'Biome check --write (includes import sorting + unsafe fixes).'],
  'lint:deck':                ['Lint & audit', 'Author-facing footgun checks on one deck (card-style title, ordered-list bold, unknown _class).'],
  'lint:deck:all':            ['Lint & audit', 'Repo-wide strict deck lint (always-on CI gate).'],
  'export:marp':              ['Build & bundle', 'Export a deck as a portable, Marp-native bundle: splits baked to ---, themes, assets, marp-cli config, a README, and (by default) an AI-agent kit (AGENTS.md + component catalog). `<deck.md> <out-dir-or-zip> [palette] [--no-agent]`.'],
  'check:ownership':          ['Lint & audit', 'Collision/ownership guard: hard-fails on accidental duplicate selectors/transformers/names.'],
  'check:responsive':         ['Lint & audit', 'Static lint: no fixed-px layout in chart CSS (responsive contract).'],
  'fonts:check':              ['Lint & audit', 'Font parity gate: the canonical face manifest (lib/fonts/text-faces.js), assets/fonts/, and the web-export supply must agree, with no Google-Fonts CDN URL — the library self-hosts its type (zero network).'],
  'fonts:emoji':              ['Build & bundle', 'Vendor Noto Color Emoji into dist/fonts/ for the opt-in full-offline tier (~25 MB, excluded from the npm tarball). Run once while online; needs network.'],
  'scorecard':                ['Lint & audit', 'Token-parity + palette-quality score for every theme.'],
  'scorecard:check':          ['Lint & audit', 'Gate: fail if any theme scorecard regresses.'],
  'quality':                  ['Lint & audit', 'Codebase quality assessment: coupling, boundaries, cycles, change coupling, complexity, duplication, dead code — see engineering/quality-assessment.md.'],
  'quality:bless':            ['Lint & audit', 'Write the committed quality-assessment baseline (test/quality/baseline.json) from a fresh run — the ratchet a quality-improving PR updates.'],
  'quality:check':            ['Lint & audit', 'Re-run the quality assessment and compare vs the committed baseline; flags any metric that got worse. On-demand, not a blocking CI gate.'],

  // Scaffold
  'new:theme':                ['Scaffold', 'Scaffold a new palette from the indaco template.'],
  'new:slide':                ['Scaffold', 'Scaffold a slide skeleton.'],
  'new:component':            ['Scaffold', 'Scaffold a new component (layout) with its manifest + CSS + transform stubs.'],

  // Release
  'release':                  ['Release', 'Deterministic, changelog-driven release orchestrator (manually triggered).'],
  'release:dry':              ['Release', 'Release dry-run — derive the bump and preview without publishing.'],
  'release:zip':              ['Release', 'Assemble the curated GitHub release zip.'],
  'changelog:bump':           ['Release', 'Roll CHANGELOG.md ## Unreleased → a versioned section (semver from the entries).'],

  // Project queue
  'sync:backlog':             ['Project queue', 'Regenerate BACKLOG.md — the one-way mirror of the open GitHub issue queue (input: `gh issue list` JSON).'],
  'sync:labels':              ['Project queue', 'Apply the .github/labels.json taxonomy to the repo labels via the gh CLI (labels-as-code; needs gh auth).'],

  // Meta / housekeeping
  'clean:scratch':            ['Meta', 'Delete .scratch/ entries older than 14 days.'],
  'prepare':                  ['Meta', 'npm lifecycle: wire the lefthook git hooks on install.'],
  'prepublishOnly':           ['Meta', 'npm lifecycle: guard run before publish.'],
};

// ── tools/ groups (descriptions come from each file's header) ────────────
const TOOL_GROUP = {
  // Build/generate
  'build.js': 'Build / generate', 'build-css.js': 'Build / generate', 'build-default-bundle.js': 'Build / generate',
  'build-runtime.js': 'Build / generate', 'build-emulator.js': 'Build / generate', 'build-playground.js': 'Build / generate',
  'build-theme-core.js': 'Build / generate', 'build-layout-core.js': 'Build / generate', 'build-authoring-core.js': 'Build / generate',
  'build-exemplar-core.js': 'Build / generate',
  'build-component-docs.js': 'Build / generate', 'build-docs-portal.js': 'Build / generate', 'build-concepts.js': 'Build / generate', 'build-dist-readme.js': 'Build / generate',
  'build-capabilities.js': 'Build / generate', 'build-landing-tokens.js': 'Build / generate', 'build-snippets.js': 'Build / generate',
  'build-galleries.js': 'Build / generate', 'build-bucket-galleries.js': 'Build / generate', 'build-basemap.js': 'Build / generate',
  'build-basemap.world.js': 'Build / generate', 'minify-css.js': 'Build / generate', 'anatomy-catalog.js': 'Build / generate',
  'make-pwa-icons.js': 'Build / generate',
  // Check/gate
  'check-ownership.js': 'Check / gate', 'check-commit-msg.sh': 'Check / gate', 'build-staged-pdfs.js': 'Check / gate',
  'check-chart-responsiveness.js': 'Check / gate', 'check-svg-scaling.js': 'Check / gate', 'affected-tests.js': 'Check / gate',
  // Lint/audit
  'lint-deck.js': 'Lint / audit', 'contrast-audit.js': 'Lint / audit', 'theme-scorecard.js': 'Lint / audit',
  'pixel-check.js': 'Lint / audit', 'check-shadcn-bridge-contrast.js': 'Lint / audit',
  'quality-assessment.js': 'Lint / audit', 'change-coupling.js': 'Lint / audit', 'complexity-report.js': 'Lint / audit',
  // Render/visual
  'emulator-engine-parity.mjs': 'Render / visual',
  'regression-gate.mjs': 'Render / visual',
  'preview.js': 'Render / visual', 'screenshot.js': 'Render / visual', 'screenshot-slides.js': 'Render / visual',
  'rasterize-for-review.sh': 'Render / visual',
  // Release
  'release.js': 'Release', 'build-release-zip.js': 'Release', 'changelog.js': 'Release',
  // Scaffold
  'new-component.js': 'Scaffold', 'new-theme.js': 'Scaffold', 'new-slide.js': 'Scaffold',
  // Project queue
  'sync-backlog.js': 'Project queue', 'sync-labels.js': 'Project queue',
  // Misc
  'ascii-preview.py': 'Misc',
};

// Description override for tools whose header has no usable one-liner.
const TOOL_DESC_OVERRIDE = {
  'screenshot-slides.js': 'Screenshot each slide of a rendered deck to PNGs (dev helper).',
};

const GROUP_ORDER_SCRIPTS = ['Build & bundle', 'Galleries & preview', 'Test & verify', 'Lint & audit', 'Scaffold', 'Release', 'Project queue', 'Meta'];
const GROUP_ORDER_TOOLS   = ['Build / generate', 'Check / gate', 'Lint / audit', 'Render / visual', 'Release', 'Scaffold', 'Project queue', 'Misc'];

const TODO_SCRIPT = (n) => `**TODO: describe \`${n}\` in tools/build-capabilities.js (SCRIPT_META).**`;
const TODO_TOOL   = (n) => `**TODO: add a one-line header description to tools/${n}.**`;

/** Pull the first descriptive line out of a tool file's header comment. */
function toolHeaderDescription(file) {
  const abs = path.join(TOOLS_DIR, file);
  const lines = fs.readFileSync(abs, 'utf8').split('\n').slice(0, 24);
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
      .replace(/^\s*(\/\*\*?|\*\/?|#!?|\/\/)\s?/, '')
      .replace(/\s+$/, '')
      .trim();
    if (!line) continue;
    if (/eslint|Auto-generated|DO NOT EDIT|@ts-|^Usage:|^Flags:|require\(|^const /.test(line)) continue;
    if (/^[A-Za-z`]/.test(line) && line.length > 15) return line;
  }
  return null;
}

function table(rows) {
  return ['| Name | What it does |', '|---|---|', ...rows].join('\n');
}

function render() {
  const scripts = require(path.join(ROOT, 'package.json')).scripts || {};
  const missing = [];

  // Frameworks
  const fwRows = FRAMEWORKS.map(([n, what, how]) => `| **${n}** | ${what} | ${how} |`);

  // Scripts grouped
  const byGroupS = {};
  for (const name of Object.keys(scripts).sort()) {
    const meta = SCRIPT_META[name];
    if (!meta) { missing.push(`script: ${name}`); (byGroupS.Meta ??= []).push([name, TODO_SCRIPT(name)]); continue; }
    (byGroupS[meta[0]] ??= []).push([name, meta[1]]);
  }
  let scriptSections = '';
  for (const g of GROUP_ORDER_SCRIPTS) {
    const rows = (byGroupS[g] || []).sort((a, b) => a[0].localeCompare(b[0]));
    if (!rows.length) continue;
    scriptSections += `\n### ${g}\n\n${table(rows.map(([n, d]) => `| \`${n}\` | ${d} |`))}\n`;
  }

  // Tools grouped (description from header / override)
  const toolFiles = fs.readdirSync(TOOLS_DIR)
    .filter((f) => /\.(js|mjs|sh|py)$/.test(f))
    .sort();
  const byGroupT = {};
  for (const f of toolFiles) {
    const desc = TOOL_DESC_OVERRIDE[f] || toolHeaderDescription(f);
    if (!desc) missing.push(`tool: ${f}`);
    const group = TOOL_GROUP[f] || 'Misc';
    (byGroupT[group] ??= []).push([f, desc || TODO_TOOL(f)]);
  }
  let toolSections = '';
  for (const g of GROUP_ORDER_TOOLS) {
    const rows = (byGroupT[g] || []).sort((a, b) => a[0].localeCompare(b[0]));
    if (!rows.length) continue;
    toolSections += `\n### ${g}\n\n${table(rows.map(([n, d]) => `| \`tools/${n}\` | ${d} |`))}\n`;
  }

  const body = `<!-- Auto-generated by tools/build-capabilities.js — DO NOT EDIT.
     Regenerate: npm run capabilities:build (part of npm run build). -->

# Capabilities — what this repo already has

**Before building any tool, harness, test, or framework, check here first —
we almost certainly already have it.** This index is generated from
\`package.json\` scripts and the \`tools/\` headers (so it can't drift) and is
gated by \`capabilities:check\` (so a new **script or tool** can't land
uncatalogued). The live source lists never lie either: \`npm run\` prints every
script, \`ls tools/\` every tool.

To add: a new npm script → describe it in \`SCRIPT_META\` in
\`tools/build-capabilities.js\`; a new \`tools/\` file → give it a one-line
header description. Either way, \`npm run capabilities:build\` then commit the
regenerated file. Skipping it fails the gate. The **Frameworks** list below is
the one curated-by-hand section — it is NOT gated, so when you add a library or
harness the index can't infer, add it to \`FRAMEWORKS\` in the generator.

## Frameworks & libraries we build on

| Area | What | How to invoke |
|---|---|---|
${fwRows.join('\n')}

## Commands — \`npm run …\` by purpose
${scriptSections}
## Tools — \`tools/\`
${toolSections}`;

  return { body, missing };
}

function main() {
  const { body, missing } = render();

  if (check) {
    const current = fs.existsSync(OUT_FILE) ? fs.readFileSync(OUT_FILE, 'utf8') : '';
    if (current !== body) {
      console.error('✗ engineering/capabilities.md is stale relative to package.json scripts / tools/');
      if (missing.length) {
        console.error('  Undescribed capabilities (each must be documented):');
        for (const m of missing) console.error(`    - ${m}`);
      }
      console.error('  Run: npm run capabilities:build');
      console.error('  Bypass (last resort): git commit --no-verify');
      process.exit(1);
    }
    process.exit(0);
  }

  fs.writeFileSync(OUT_FILE, body);
  if (!silent) {
    console.log(`[build-capabilities] ${path.relative(ROOT, OUT_FILE)}`);
    if (missing.length) console.log(`  ⚠ ${missing.length} undescribed (rendered as TODO): ${missing.join(', ')}`);
  }
}

main();
