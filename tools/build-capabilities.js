#!/usr/bin/env node
/**
 * Generate dist/engineering/capabilities.md — the single index of what this repo
 * already HAS: every npm script, every tool in tools/, and the frameworks we
 * build on.
 *
 * Why this exists: capabilities kept getting REDISCOVERED. Sessions rolled
 * their own benchmark harness without knowing `npm run bench` (tinybench)
 * existed; dozens of tools and scripts had no catalog, so agents reinvented
 * them.
 * Components never suffer this — they're cataloged (components.json) and
 * gated. This gives tools/scripts/frameworks the same treatment.
 *
 * Sources of truth that can't drift:
 *   - package.json `scripts`  → every command (described one file each in tools/script-docs/)
 *   - tools/*.{js,mjs,sh,py}  → every tool (description read from its header)
 *   - FRAMEWORKS (curated)    → the semantic "what we build on" a name omits
 *
 * Mandatory-description gate: a script with no tools/script-docs/ file, or a tool
 * whose header has no description line, renders a visible **TODO** — and makes
 * --check fail. So a new capability cannot land uncataloged: either describe it
 * in tools/script-docs/ / in the tool header, or the gate blocks the push.
 *
 * NOT COMMITTED. The output lives in dist/engineering/ and is rebuilt by `npm install`
 * (prepare), the SessionStart hook and `npm run build`. A committed copy was
 * rewritten by every PR that added a script or a tool, which made it one of the
 * two most-collided files in the repo (12 of the 50 commits to 2026-10-09).
 * Record: engineering/decisions/2026-10-09-generated-indexes-uncommitted.md.
 *
 * Flags:
 *   --check    Validate the SOURCES: exit 1 on any undescribed script/tool or an
 *              over-budget row. Reads no output — there is no committed copy to
 *              diff. `build:check` runs it through the step's `validates` tag.
 *   --silent   Suppress the success log line (implied by --check).
 *
 * Write never fails: it renders TODO rows and over-budget rows with a warning,
 * because it runs inside `npm install`.
 */

const fs   = require('node:fs');
const path = require('node:path');

const ROOT      = path.resolve(__dirname, '..');
const TOOLS_DIR = path.join(ROOT, 'tools');
const OUT_FILE  = path.join(ROOT, 'dist', 'engineering', 'capabilities.md');

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
  ['Rendering', 'The owned lattice-engine renders every shipping path (the CLI + the docs playground).', '`node lattice.js deck.md deck.pdf` (set `CHROME_PATH`)'],
  ['Browser automation', 'puppeteer with the cached Chromium (screenshots, export, DOM checks).', '`tools/screenshot.js` · custom scripts from repo root'],
  ['Bundling', 'esbuild — every `dist/` JS bundle and docs-site core is an esbuild build.', '`npm run build` (orchestrates all generators behind the ownership gate)'],
  ['Docs site', 'Astro + Starlight + React 19 + Tailwind v4 + shadcn/ui (new-york) + CodeMirror — a SEPARATE npm package under docs/. shadcn maps onto the 14-palette Lattice theme via the token bridge (`docs/src/styles/tailwind.css`); React islands are tested with Vitest + Testing Library. House additions to `docs/src/components/ui/` beyond stock shadcn: `split.tsx` — the pane splitter (pointer-captured drag, rail collapse, ARIA window-splitter, persisted ratio) shared by the Playground and Studio; don\'t hand-roll another.', '`cd docs && npm run dev` (runs the sync steps + astro; see CLAUDE.md § Cloud sandbox)'],
  ['Quality assessment', '`dependency-cruiser` (structural coupling, circular deps, custom architectural-boundary rules — `.dependency-cruiser.cjs`), `jscpd` (duplication — `.jscpd.json`), and `knip` (dead files/exports — `knip.json`), plus two bespoke scripts (git change-coupling, acorn-based complexity). On-demand diagnostic, NOT a blocking CI gate — mirrors `bench`/`scorecard`\'s baseline-ratchet pattern.', '`npm run quality` · `quality:bless` · `quality:check` · `engineering/quality-assessment.md`'],
  ['Self-driving walkthroughs', 'Vetrina — the framework-free "fake cursor drives the real app, seamlessly interruptible" engine (`docs/src/lib/vetrina/`). Powers the Studio demo; reusable for help tours, auto-presenters, narrated edits. Author with `storyboard()` / `scene()` / a raw `Walkthrough`; drive from React via the `useWalkthrough` adapter (`./react`). CSS-first `--vt-*` theming, a 5-gesture alphabet, `drag`, `awaitUser`. Two ownership gates keep it decoupled + the alphabet frozen. Do NOT hand-roll a tour — reuse this.', '`docs/src/lib/vetrina/README.md` · `import { scene, run } from \'…/lib/vetrina\'` · `npm run check:vetrina` (standalone typecheck)'],
];

// ── npm scripts (mandatory descriptions) ─────────────────────────────────
// One file per script in tools/script-docs/, so adding a script touches package.json plus
// one NEW file and never a map every script-adding PR edits (it was in 9 of 50 commits).
// The file name is the script name with ':' written as '+' (':' is not a legal file name
// character everywhere the desktop app will build). `group` is one of GROUP_ORDER_SCRIPTS
// below, with no trailing comment. Format:
//   ---
//   group: Build & bundle
//   ---
//   One-line description.
// A package.json script with no file renders a TODO and fails --check; so does a file with
// no script (a rename or removal left it behind), an unknown group or an empty description.
const SCRIPT_DOCS_DIR = path.join(TOOLS_DIR, 'script-docs');
const scriptFileName  = (name) => `${name.replace(/:/g, '+')}.md`;

/** Parse one script-docs file. Returns { group, desc } or { error }. */
function parseScriptDoc(text) {
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n'));
  if (!m) return { error: 'no front-matter (expected a --- block with "group:")' };
  const group = /^group:\s*(.+?)\s*$/m.exec(m[1])?.[1];
  if (!group) return { error: 'front-matter has no "group:" line' };
  const desc = m[2].split('\n').map((l) => l.trim()).filter(Boolean).join(' ');
  if (!desc) return { error: 'no description under the front-matter' };
  return { group, desc };
}

/** Read the folder. Returns { meta: {script: [group, desc]}, problems: [string] }. */
function loadScriptMeta(scriptNames, groups, dir = SCRIPT_DOCS_DIR) {
  const meta = {};
  const problems = [];
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.md')) : [];
  const known = new Map(scriptNames.map((n) => [scriptFileName(n), n]));
  for (const f of files.sort()) {
    const name = known.get(f);
    if (!name) { problems.push(`tools/script-docs/${f}: no package.json script has this name — delete it, or fix the file name (':' is written '+')`); continue; }
    let text;
    try { text = fs.readFileSync(path.join(dir, f), 'utf8'); }
    catch (err) { problems.push(`tools/script-docs/${f}: unreadable (${err.code || err.message})`); continue; }
    const parsed = parseScriptDoc(text);
    if (parsed.error) { problems.push(`tools/script-docs/${f}: ${parsed.error}`); continue; }
    if (!groups.includes(parsed.group)) { problems.push(`tools/script-docs/${f}: unknown group "${parsed.group}" (one of: ${groups.join(', ')})`); continue; }
    meta[name] = [parsed.group, parsed.desc];
  }
  return { meta, problems };
}

// ── tools/ groups (descriptions come from each file's header) ────────────
const TOOL_GROUP = {
  // Build/generate
  'build.js': 'Build / generate', 'build-css.js': 'Build / generate', 'build-default-bundle.js': 'Build / generate',
  'build-runtime.js': 'Build / generate', 'build-cli.js': 'Build / generate', 'build-playground.js': 'Build / generate',
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
  'palette-sweep.js': 'Lint / audit', 'conformance-render.js': 'Lint / audit',
  'pixel-check.js': 'Lint / audit', 'sweep-guide-gestures.mjs': 'Lint / audit', 'mutate-guide-gestures.mjs': 'Lint / audit', 'mutate-segno.mjs': 'Lint / audit', 'check-shadcn-bridge-contrast.js': 'Lint / audit',
  'measure-glyph-advances.js': 'Lint / audit', 'quality-assessment.js': 'Lint / audit', 'change-coupling.js': 'Lint / audit', 'complexity-report.js': 'Lint / audit',
  'check-jank.js': 'Lint / audit',
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
  'queue-precheck.sh': 'Check / gate',
  'ascii-preview.py': 'Misc',
};

// Description override for tools whose header has no usable one-liner.
const TOOL_DESC_OVERRIDE = {
  'screenshot-slides.js': 'Screenshot each slide of a rendered deck to PNGs (dev helper).',
};

const GROUP_ORDER_SCRIPTS = ['Build & bundle', 'Galleries & preview', 'Test & verify', 'Lint & audit', 'Scaffold', 'Release', 'Project queue', 'Meta'];
const GROUP_ORDER_TOOLS   = ['Build / generate', 'Check / gate', 'Lint / audit', 'Render / visual', 'Release', 'Scaffold', 'Project queue', 'Misc'];

const TODO_SCRIPT = (n) => `**TODO: describe \`${n}\` in tools/script-docs/${scriptFileName(n)}.**`;
const TODO_TOOL   = (n) => `**TODO: add a one-line header description to tools/${n}.**`;

/** Pull the first descriptive line out of a tool file's header comment. */
function toolHeaderDescription(file) {
  const abs = path.join(TOOLS_DIR, file);
  const lines = fs.readFileSync(abs, 'utf8').split('\n').slice(0, 24);
  // FROM LINE 0, not line 1. Starting at 1 skipped the first line of the header, which for a
  // `//`-comment tool IS the description — so those tools got whatever line happened to be
  // second, i.e. a mid-sentence continuation of a wrapped paragraph. Two rows shipped that way
  // ("The claim here |", "Everything it demonstrated was jsdom + a stubbed fetch — code-path-exact,
  // but by HARD |") and read as truncated garbage in a doc that is supposed to be the index of
  // what exists (#1462 item 7). A shebang and a bare `/**` are already rejected below: the first
  // strips to a path starting with `/`, the second to an empty string.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
      .replace(/^\s*(\/\*\*?|\*\/?|#!?|\/\/)\s?/, '')
      .replace(/\s+$/, '')
      .trim();
    if (!line) continue;
    // `^import ` joins `require(` and `^const `: an ESM tool whose header ends before its
    // first import renders that import AS its description (`tools/diagram-oracle.mjs` did —
    // its row read `import { execFileSync } from 'node:child_process';` while the real
    // description sat two lines below). A row that describes nothing is invisible to every
    // grep but one carrying its own filename, which is worse under grep-first routing than
    // it was under a read-whole index.
    if (/eslint|Auto-generated|DO NOT EDIT|@ts-|^Usage:|^Flags:|require\(|^const |^import /.test(line)) continue;
    if (/^[A-Za-z`]/.test(line) && line.length > 15) return line;
  }
  return null;
}

// ── Row budget (the grep unit) ────────────────────────────────────────────
// This index is READ BY GREP, so what a reader pays is the ROW, not the file.
// Budget the row and the cost of a query stays bounded no matter how many
// capabilities land; budget the FILE and you bill whichever PR crosses the line
// for 300 predecessors' contributions, which is the aggregate mistake #1547
// already removed from the generated artifacts.
//
// IT IS A RATCHET, PINNED AT THE WIDEST LIVE ROW — the same shape as `ROW_CAP`
// in tools/build-decisions-index.js, and NOT what this gate shipped first.
//
// The first cut set the cap BELOW the tail and trimmed eleven rows into it. That
// was wrong, and the way it was wrong is worth keeping: it bought 846 tokens (6%)
// on a file whose size is not the fixable problem — no cap reaches the 10k
// read-whole budget, which is why the routing changed to grep-first — and it paid
// for that in the one currency a grep-first index actually spends. Measured across
// the trim: ~130 distinct words stopped matching anywhere in the file, among them
// `permission`, `wink-nlp`, `cascade`, `retired` and `classifier`. `grep -i
// permission` had returned the measured finding that `--allowed-tools Read`
// overrides the working-directory refusal — a reinvention hazard, which is the
// exact thing HARD RULE #15 exists to stop someone rediscovering. Ten probe
// queries chosen by the trimmer said the trim was clean; twenty words chosen by a
// red team found five losses and a word-set diff found ~130.
//
// So the cap now only stops a row growing PAST the worst that exists, which is all
// a ratchet can honestly claim. Lowering it means deleting authored prose, and
// nothing here can tell prose that carries a search term from prose that does not
// — build that check first (a per-row word-set assertion across the edit), then
// lower this. Do not lower it on the strength of a probe list.
//
// It scopes to the SCRIPT and TOOL tables, not FRAMEWORKS: the nine framework rows
// are curated prose about libraries whose L2 is that library's own docs, and two of
// them are already wider than any script row.
//
// 1500 was `intent:pick-agents`'s own width when this shipped. That row was rewritten in
// #1897 and is now 1463; the widest OTHER row is `contrast:player` at 1158, so nothing live
// touches the cap any more and it carries 37 characters of slack. It is
// deliberately NOT lowered to 1158: this ratchet's whole recorded lesson is that tightening
// it is what forces prose out of a grep-first index, and nothing here can yet tell prose
// carrying a search term from prose that does not. Build the per-row word-set assertion
// first. Re-measure before quoting either figure.
const ROW_CAP = 1500;

/** Per-row, per-capability: the check one PR can be held responsible for. */
function rowCostProblems(rows) {
  const problems = [];
  for (const row of rows) {
    if (row.length <= ROW_CAP) continue;
    const name = row.match(/^\| `([^`]+)`/)?.[1] || row.slice(0, 40);
    problems.push(
      `${name}: its catalog row is ${row.length} characters, over the ${ROW_CAP} ratchet — ` +
        'the widest row that exists today. Rows are edited in `tools/script-docs/<script>.md` (npm scripts) ' +
        "or the tool file's own header comment (tools/)." +
        ' Before you shorten one, check that no word only findable in this row goes ' +
        'with it: this index is read by grep, and a row nobody can find is worse than a long one.',
    );
  }
  return problems;
}

function table(rows) {
  return ['| Name | What it does |', '|---|---|', ...rows].join('\n');
}

function render() {
  const scripts = require(path.join(ROOT, 'package.json')).scripts || {};
  const missing = [];
  const catalogRows = [];
  const { meta: SCRIPT_META, problems: docProblems } = loadScriptMeta(Object.keys(scripts), GROUP_ORDER_SCRIPTS);
  missing.push(...docProblems);

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
    const rendered = rows.map(([n, d]) => `| \`${n}\` | ${d} |`);
    catalogRows.push(...rendered);
    scriptSections += `\n### ${g}\n\n${table(rendered)}\n`;
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
    const rendered = rows.map(([n, d]) => `| \`tools/${n}\` | ${d} |`);
    catalogRows.push(...rendered);
    toolSections += `\n### ${g}\n\n${table(rendered)}\n`;
  }

  const body = `<!-- Auto-generated by tools/build-capabilities.js — DO NOT EDIT.
     Rebuilt by npm install and npm run build; never committed (dist/ is ignored). -->

# Capabilities — what this repo already has

**Before building any tool, harness, test, or framework, look here first —
we almost certainly already have it.** This catalog is past the size where
reading it top-to-bottom pays, so **\`grep\` it for the thing you were about to
build** (\`grep -i contrast\`, \`grep -i bench\`, \`grep -i render\`), then open the
script or tool the row names — its own header is the long form. A zero-hit grep
means try another word, not that nothing exists.

It is generated from \`package.json\` scripts and the \`tools/\` headers (so it
can't drift) and is gated by \`capabilities:check\` (so a new **script or tool**
can't land uncataloged). The live source lists never lie either: \`npm run\`
prints every script, \`ls tools/\` every tool.

To add: a new npm script → describe it in a new file,
\`tools/script-docs/<script>.md\` (\`:\` is written \`+\`); a new \`tools/\` file → give it a one-line
header description. Either way, \`npm run capabilities:check\` tells you whether
you did; skipping it fails the gate. This file is rebuilt, never committed. The **Frameworks** list below is
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

  return { body, missing, rowProblems: rowCostProblems(catalogRows) };
}

function main() {
  const { body, missing, rowProblems } = render();

  if (check) {
    if (!missing.length && !rowProblems.length) process.exit(0);
    if (missing.length) {
      console.error('✗ undescribed capabilities — each must be documented (a tools/script-docs/ file, or the tool\'s header):');
      for (const m of missing) console.error(`    - ${m}`);
    }
    if (rowProblems.length) {
      console.error(`✗ ${rowProblems.length} catalog row(s) over the ${ROW_CAP}-character budget:`);
      for (const p of rowProblems) console.error(`    - ${p}`);
    }
    process.exit(1);
  }

  // Write never fails (see the header): it runs inside `npm install`.
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, body);
  if (!silent) {
    console.log(`[build-capabilities] ${path.relative(ROOT, OUT_FILE)}`);
    if (missing.length) console.log(`  ⚠ ${missing.length} undescribed (rendered as TODO): ${missing.join(', ')}`);
    for (const p of rowProblems) console.log(`  ⚠ over the ${ROW_CAP}-character budget: ${p}`);
  }
}

// Guarded so the row budget is unit-testable without running the generator — the
// same shape tools/build-decisions-index.js uses for `rowCostProblems`.
if (require.main === module) main();

module.exports = { rowCostProblems, ROW_CAP, loadScriptMeta, parseScriptDoc, scriptFileName };
