#!/usr/bin/env node
/**
 * Generate dist/engineering/codemap.md — the map of what lives where: every top-level folder,
 * every folder directly inside lib/, docs/, docs/src/, docs/src/lib/, test/, tools/ and .claude/,
 * every code part with its layer, every plugin and every workspace library, each with one line on
 * what it is for.
 *
 * Why this exists: an agent new to the repo had a doc index (CLAUDE.md's routing table) and a
 * script index (capabilities.md) but no map of the CODE, so "where does X live?" cost a grep
 * sweep or a scout agent. The one hand-written map, lib/README.md, had drifted to 21 of 29
 * folders with nothing to notice.
 *
 * Sources of truth that can't drift:
 *   - PARTS in tools/structure.js → every code part, its layer and its `about` line. The
 *     structure gate already fails a file that belongs to no part, so a new code folder must be
 *     placed there, and this check then fails until it has an `about`.
 *   - each plugin's manifest `description` and each workspace library's package.json
 *     `description`: they describe themselves.
 *   - FOLDERS below → the folders that are not code parts (docs, tests, assets, CSS-only lib/
 *     folders). --check fails on a folder in scope that neither PARTS nor FOLDERS describes, and
 *     on a FOLDERS entry whose folder is gone.
 *
 * NOT COMMITTED. Like capabilities.md, the output lives in dist/engineering/ and is rebuilt by
 * `npm install` (prepare), the SessionStart hook and `npm run build`; build:check runs --check on
 * every PR through the step's `validates` tag. The publish-kits workflow copies it to the
 * dist-kits branch for readers without a clone.
 * Record: engineering/decisions/2026-10-09-generated-indexes-uncommitted.md.
 *
 * Flags:
 *   --check    Validate the SOURCES: exit 1 on a folder or part with no purpose line, or a stale
 *              FOLDERS entry. Reads no output.
 *   --silent   Suppress the success log line (implied by --check).
 *
 * Write never fails on a source problem: it warns and renders a TODO for a missing purpose (and
 * leaves out a part it cannot place), because it runs inside `npm install`.
 *
 * What --check covers: the IMMEDIATE child folders of each scope in SCOPES. A new folder deeper
 * down (lib/core/x/, tools/lib/x/) is described by its parent's line and is not checked. It checks
 * that a line EXISTS, not that it is still true, so an `about` says what a folder is FOR, never
 * a list of what it holds: a list goes stale the day a file is added, and nothing notices.
 *
 * --check refuses to run outside a git checkout (a "Download ZIP" copy): coverage needs the
 * tracked file list, and a check that silently skipped it would read as a pass.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT_FILE = path.join(ROOT, 'dist', 'engineering', 'codemap.md');

// The folders whose children the map lists one by one. Deeper folders are described by their
// parent's line or their own README.
const SCOPES = [
  { dir: '', title: 'Top level' },
  { dir: 'lib/', title: '`lib/` — the engine' },
  { dir: 'docs/', title: '`docs/` — the docs site package' },
  { dir: 'docs/src/', title: '`docs/src/` — the docs site source' },
  { dir: 'docs/src/lib/', title: '`docs/src/lib/` — site libraries that do not publish on their own' },
  { dir: 'test/', title: '`test/` — tests, fixtures and baselines' },
  { dir: 'tools/', title: '`tools/` — build steps, gates and maintenance scripts' },
  { dir: '.claude/', title: '`.claude/` — agent roster, hooks, skills, workflows' },
];

/**
 * Folders that are NOT code parts in tools/structure.js, keyed by path with a trailing slash.
 * A code folder goes in PARTS instead (with `about`), never here.
 */
const FOLDERS = {
  // Top level
  '.claude/': 'Claude Code settings, the agent roster, hooks, skills and named workflows.',
  '.github/': 'CI workflows, composite actions, issue templates and the PR template.',
  '.vscode/': 'Editor settings for the repository.',
  'assets/': 'Source files vended into the build: the self-hosted fonts and third-party license texts.',
  'backlog.d/': 'GENERATED mirror of the open GitHub issues, one file per issue. Edit the issue, not the file.',
  'changelog/': 'The pre-release changelog archive.',
  'changelog.d/': 'One changelog fragment per PR (HARD RULE #10). The release folds them into CHANGELOG.md.',
  'design/': 'The design system, the deck-authoring contract, design principles and the authoring skills.',
  'docs/': 'The public docs site, Playground and Studio: a separate Astro package.',
  'engineering/': 'Engineering references, decision notes (`decisions/`) and gotcha topics (`gotchas/`).',
  'examples/': 'Per-feature demo decks (HARD RULE #9) and the galleries; CI renders their PDFs.',
  'exemplars/': 'Full, realistic decks by sector: what good looks like.',
  'experiments/': 'Measured prototypes kept in reserve. Nothing imports from here and no build step runs it.',
  'followups.d/': 'One file per pending follow-up that has no issue yet.',
  'lib/': 'The engine source. Every folder is listed below.',
  'spec/': 'The hand-written specs: Lattice-Flavored Markdown, the Diagnostic Protocol, the Lattice Timing Track.',
  'test/': 'Unit and integration tests, fixtures and committed baselines. Every folder is listed below.',
  'themes/': 'The palettes: one folder per theme, each supplying the color tokens.',
  'kit/': 'The Marp kit: a sample deck and its VS Code extension.',
  // lib/ folders that hold no code the import graph sees (CSS, images, a README)
  'lib/helpers/': 'Authoring-time diagnostics: the `.overflow` warning-ring contract.',
  'lib/samples/': 'Every demonstration picture Lattice ships, in one flat folder.',
  'lib/shared/': 'Semi-universal CSS modifiers: `compact` and `accent`.',
  // docs/
  'docs/.vscode/': 'Editor and debugger settings for the docs package.',
  'docs/e2e/': 'Playwright end-to-end specs for the Playground and Studio.',
  'docs/patches/': 'patch-package patches applied on `npm install`, one per pinned dependency version.',
  'docs/public/': 'Static files the site serves as-is: icons, fonts, the KaTeX provider, playground chunks.',
  'docs/route-budget.d/': 'One file per PR that spends its startup-JavaScript allowance on a route.',
  'docs/scripts/': 'Docs-package scripts: sync steps, benches, bake-offs and browser setup for e2e.',
  'docs/src/': 'The site source. Every folder is listed below.',
  // docs/src/
  'docs/src/test/': 'Shared helpers and stubs for the site unit tests.',
  // docs/src/lib/ folders that are not workspace libraries (those are listed from their package.json)
  'docs/src/lib/anima/': 'Anima, the motion library: compiles a scene spec into the moves an animated slide plays.',
  'docs/src/lib/code-packages/': 'The code-package door: how the Studio runs a code package a deck uses, sandboxed and only with consent.',
  'docs/src/lib/compose/': "Compose, the Studio's rich-text editor: the whole deck as one editable document, and the commands that edit it.",
  'docs/src/lib/deck-outline/': 'The deck as an outline, so the Markdown and Compose editors keep the same place in it.',
  'docs/src/lib/vetrina-exemplars/': 'Exemplar walkthroughs and a stress battery that prove the Vetrina library on a host other than the Studio.',
  'docs/src/lib/vetrina-narration/': 'The seam that lets a Vetrina walkthrough narrate with Cadenza timing, with no audio needed.',
  // tools/
  'tools/dom-bakeoff/': 'A measured bake-off of HTML parsers against the DOM contract the engine uses.',
  'tools/frame-lab/': 'Renders every component gallery in a frame you can narrow, to see whether it reflows well.',
  'tools/icon-font/': 'The Python step that turns the curated icon drawings into the Lattice Icons font (`npm run icons:font`).',
  'tools/intent-bakeoff/': 'Measures the component intent ranker the site ships against its alternatives.',
  'tools/kit-branch/': 'Files the publish-kits workflow copies to the root of the `dist-kits` branch, kept here so they are reviewed on `main`.',
  'tools/lastra-corpus/': 'Generates the lastra image decoder\'s test pictures and their expected results, and benchmarks its speed.',
  'tools/lib/': 'Shared modules the scripts in `tools/` import, so no script reimplements another.',
  'tools/office-conformance/': 'The Open XML SDK checker that validates exported Office files against the official schemas.',
  'tools/parser-bakeoff/': 'A measured bake-off of inline-notation parsers against the shipped kernel as the control.',
  'tools/perf-torture/': 'A reusable profiler that repeats one user action in a browser and reports memory that leaks.',
  'tools/recheck/': 'The pinned regex complexity checker behind `tools/regex-census.js`, kept out of the root install.',
  'tools/script-docs/': 'One description per npm script, the source of `dist/engineering/capabilities.md`.',
  'tools/segno-legacy/': 'Frozen copies of the inline-code kernels from before Segno phase 2, kept as the bake-off baseline.',
  'tools/spike-card-slack/': 'A spike, not production tooling: the measurement behind the card-stack vertical alignment decision.',
  'tools/squadra/': 'Corpora and reference data the Squadra lint diffs run on, so every run reads the same cases.',
  // test/
  'test/benchmark/': 'The render benchmark and its committed baseline (`npm run bench`, HARD RULE #19).',
  'test/conformance/': 'Fixtures, corpora and the debt list for the conformance contracts.',
  'test/fit/': 'The fit-harness baseline: clip, unreadable and lost counts per component.',
  'test/fixtures/': 'Decks, images and data the tests read.',
  'test/helpers/': 'Shared test helpers: the setup and measuring code more than one test file needs.',
  'test/integration/': 'The render tier: cross-renderer parity, page counts, the baseline gallery.',
  'test/lint-coverage/': 'The lint-coverage baseline.',
  'test/oracle/': 'Frozen oracles: recorded expected results that tests compare a fresh run against.',
  'test/quality/': 'The quality-assessment and structure snapshots.',
  'test/unit/': 'The unit tier (`npm test`). Folders mirror `lib/` and `tools/`.',
  'test/viz-render/': 'The chart paint guard baseline.',
  // .claude/
  '.claude/agents/': 'The agent roster: one card per agent (scout, checker, red-team, …), each pinned to Opus.',
  '.claude/hooks/': 'Claude Code hooks: sandbox setup at session start, warnings that run before a tool call, and the rebase check at stop.',
  '.claude/skills/': 'Project skills an agent loads by name.',
  '.claude/workflows/': 'Named multi-agent workflows, such as design-competition.',
};

// ── sources ────────────────────────────────────────────────────────────────

/** Tracked files, or null outside a git checkout. */
function trackedFiles(root = ROOT) {
  const r = spawnSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) return null;
  return r.stdout.split('\0').filter(Boolean);
}

/** Every immediate child folder of each scope that holds a tracked file: `lib/core/`, `docs/e2e/`, … */
function foldersInScope(files, scopes = SCOPES) {
  const out = new Set();
  for (const f of files) {
    for (const { dir } of scopes) {
      if (!f.startsWith(dir)) continue;
      const rest = f.slice(dir.length);
      const slash = rest.indexOf('/');
      if (slash > 0) out.add(dir + rest.slice(0, slash + 1));
    }
  }
  return [...out].sort();
}

/**
 * A one-line purpose from a self-description (a plugin manifest, a library package.json), which
 * can run to a paragraph. The first sentence; the next one too when the first is a fragment
 * ("How a deck is read."); and when that is long, the clause before its first `:`, `;` or dash.
 */
function summarize(text, { short = 30, long = 160 } = {}) {
  // Mask inline code first: `!{Ada}`, `photo.jpg` and `<!-- _class: X -->` carry the very
  // punctuation a sentence or clause split keys on.
  const codes = [];
  const masked = String(text || '').replace(/\s+/g, ' ').trim().replace(/`+[^`]*`+/g, (m) => `\uE000${codes.push(m) - 1}\uE001`);
  // An abbreviation's period is not a sentence end: "for every slide, e.g. bar and line" stays whole.
  const abbrev = masked.replace(/\b(e\.g|i\.e|cf|vs|approx)\.(?=\s)/gi, (m) => m.replace(/\./g, '\uE002'));
  const unmask = (t) => t.replace(/\uE000(\d+)\uE001/g, (_, i) => codes[Number(i)]).replace(/\uE002/g, '.');
  // A sentence ends at . ! or ? followed by whitespace or the end, so `Chart.js` and `v1.2` stay whole.
  const sentences = abbrev.match(/[\s\S]*?[.!?]+(?=\s|$)|[\s\S]+$/g) || [];
  let out = (sentences[0] || '').trim();
  if (out.length < short && sentences[1]) out = `${out} ${sentences[1].trim()}`;
  if (unmask(out).length > long) {
    const m = /^(.{20,}?)(?::\s|;\s|\s[—–]\s)/.exec(out);
    if (m) out = `${m[1]}.`;
  }
  return unmask(out);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * The rows the map shows: one per described path. `kind` is `part`, `plugin`, `library` or
 * `folder`; `where` is the path (a folder with a trailing slash, a file, or a glob).
 */
function collect({ root = ROOT, parts = require('./structure.js').PARTS, folders = FOLDERS } = {}) {
  const rows = [];
  for (const p of parts) {
    if (p.library) {
      const pkg = readJson(path.join(root, p.match, 'package.json'));
      rows.push({ kind: 'library', name: p.part, where: p.match, layer: p.layer, about: summarize(pkg?.description) });
      continue;
    }
    if (p.plugin) {
      const dir = path.join(root, 'lib', 'plugins');
      for (const d of fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort()) {
        const manifest = readJson(path.join(dir, d, `${d}.manifest.json`));
        if (!manifest) continue; // not a plugin folder; the plugin build owns that rule
        rows.push({ kind: 'plugin', name: `lib/plugins/${d}`, where: `lib/plugins/${d}/`, layer: p.layer, about: summarize(manifest.description) });
      }
      continue;
    }
    const name = typeof p.part === 'string' ? p.part : '?';
    // A part that matches by function has no path to show unless it names one in `where`. Record
    // it as a problem row rather than rendering the function's source as a path.
    if (!p.where && typeof p.match !== 'string') {
      rows.push({ kind: 'part', name, where: null, layer: p.layer, about: p.about || '', noWhere: true });
      continue;
    }
    const wheres = p.where ? [].concat(p.where) : [p.match];
    for (const where of wheres) rows.push({ kind: 'part', name, where, layer: p.layer, about: p.about || '' });
  }
  // A folder inside a code part (tools/lib/ inside `tools`) shows that part's layer: the longest
  // prefix match wins. A folder no part matches (CSS-only, docs, tests) keeps a blank layer.
  const layerOf = (where) => {
    let best = null;
    for (const p of parts) {
      if (typeof p.match === 'string' && where.startsWith(p.match) && (!best || p.match.length > best.match.length)) best = p;
    }
    return best?.layer;
  };
  for (const [where, about] of Object.entries(folders)) rows.push({ kind: 'folder', where, layer: layerOf(where), about });
  return rows;
}

/** A backslash inside a code span: the one text a table cell cannot render as written. */
const CODE_SPAN_BACKSLASH = /`[^`]*\\[^`]*`/;

/**
 * Everything --check fails on. `files` is the tracked file list (null skips the coverage and
 * staleness checks, which need it).
 */
function problems(rows, files, { scopes = SCOPES, folders = FOLDERS } = {}) {
  const out = [];
  for (const r of rows) {
    if (r.noWhere) out.push(`part ${r.name} matches by function and has no \`where\`: add its path(s) as \`where\` on its PARTS entry in tools/structure.js`);
  }
  rows = rows.filter((r) => !r.noWhere);
  for (const r of rows) {
    if (CODE_SPAN_BACKSLASH.test(r.about || '')) out.push(`${r.where} has a backslash inside a code span in its purpose line, which the map cannot show as written: reword it`);
  }
  for (const r of rows) {
    if (r.about) continue;
    if (r.kind === 'part') out.push(`part ${r.name} (${r.where}) has no \`about\` line: add one to its PARTS entry in tools/structure.js`);
    else if (r.kind === 'plugin') out.push(`plugin ${r.name} has no manifest \`description\``);
    else if (r.kind === 'library') out.push(`workspace library ${r.name} has no package.json \`description\``);
    else out.push(`folder ${r.where} has an empty FOLDERS entry in tools/build-codemap.js`);
  }
  const partPaths = new Set(rows.filter((r) => r.kind !== 'folder').map((r) => r.where));
  for (const where of Object.keys(folders)) {
    if (partPaths.has(where)) out.push(`${where} is a code part in tools/structure.js: drop its FOLDERS entry in tools/build-codemap.js`);
  }
  if (!files) return out;
  const described = new Set(rows.map((r) => r.where));
  for (const dir of foldersInScope(files, scopes)) {
    if (!described.has(dir)) out.push(`folder ${dir} is not on the code map: add it to FOLDERS in tools/build-codemap.js (or, if it holds code, to PARTS in tools/structure.js)`);
  }
  for (const where of Object.keys(folders)) {
    if (!files.some((f) => f.startsWith(where))) out.push(`FOLDERS entry ${where} names a folder with no tracked files: remove it from tools/build-codemap.js`);
  }
  // A part whose path matches nothing would stay on the map, describing a folder that is gone.
  // Globs (`lib/**/*.schema.json`) are skipped here; the structure gate maps their files.
  for (const r of rows) {
    if (r.kind !== 'part' || /[*]/.test(r.where)) continue;
    const hit = r.where.endsWith('/') ? files.some((f) => f.startsWith(r.where)) : files.includes(r.where);
    if (!hit) out.push(`part ${r.name} names ${r.where}, which holds no tracked file: update its PARTS entry in tools/structure.js`);
  }
  return out;
}

// ── render ─────────────────────────────────────────────────────────────────

// A table cell: escape the backslash first, then the pipe, so a `\|` in the text cannot become `\\|`
// (an escaped backslash, then a bare pipe that ends the cell early). Inside a code span a backslash
// is literal, so doubling one there would show `a\\b`: --check refuses a purpose line with a
// backslash inside a code span (see CODE_SPAN_BACKSLASH), so that case never reaches this.
const cell = (s) => String(s).replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
// Plain paths, not links: the reader is mostly an agent reading the raw text, and a link
// writes every path twice (measured: 25 KB with links, the table below without).
const link = (where) => `\`${where}\``;
// Code-unit order, not localeCompare: the row order must not depend on the machine's locale
// (Lithuanian ICU moved `lib/typography/` two rows).
const byCodeUnit = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function fileCount(files, where) {
  if (!files || /[*]/.test(where)) return '';
  return String(where.endsWith('/') ? files.filter((f) => f.startsWith(where)).length : files.includes(where) ? 1 : 0);
}

function readme(root, where) {
  return where.endsWith('/') && fs.existsSync(path.join(root, where, 'README.md')) ? ' (README)' : '';
}

/** The scope a row is listed under: the deepest scope its path sits directly inside. */
function scopeOf(where, scopes = SCOPES) {
  let best = null;
  for (const { dir } of scopes) {
    if (!where.startsWith(dir) || where === dir) continue;
    if (!best || dir.length > best.length) best = dir;
  }
  return best ?? '';
}

function render(rows, files, root = ROOT) {
  rows = rows.filter((r) => typeof r.where === 'string');
  const table = (list) => {
    const lines = ['| Path | Layer | Files | What it is for |', '|---|---|---|---|'];
    // One part with several `where` paths in the same section is one row, not N copies of its line.
    const merged = [];
    for (const r of list) {
      const prev = merged.find((m) => m.kind === 'part' && r.kind === 'part' && m.name === r.name && m.about === r.about);
      if (prev) prev.wheres.push(r.where);
      else merged.push({ ...r, wheres: [r.where] });
    }
    for (const r of merged) {
      const counts = r.wheres.map((w) => fileCount(files, w));
      const total = counts.every((c) => c !== '') ? String(counts.reduce((n, c) => n + Number(c), 0)) : '';
      const paths = r.wheres.map((w) => cell(link(w))).join(', ');
      const readmes = r.wheres.length === 1 ? readme(root, r.where) : '';
      lines.push(`| ${paths} | ${r.layer ?? ''} | ${total} | ${cell(r.about || '**TODO**')}${readmes} |`);
    }
    return lines.join('\n');
  };
  const byPath = (a, b) => byCodeUnit(a.where, b.where);
  const plain = rows.filter((r) => r.kind === 'part' || r.kind === 'folder');
  const out = [
    '# Code map',
    '',
    '<!-- GENERATED by tools/build-codemap.js. Do not edit: change the source it names. -->',
    '',
    'What lives where. One line per folder, code part, plugin and workspace library. Find the row,',
    'then open it. (README) marks a folder with its own README. **Layer** is the part\'s layer in',
    '`tools/structure.js`: a part imports only parts on its own layer or below, and a blank means the',
    'folder holds no code the import graph sees. **Files** counts tracked files.',
    '',
    'Where the purposes come from: `PARTS` in `tools/structure.js` (code parts), each plugin\'s',
    'manifest, each workspace library\'s `package.json`, and `FOLDERS` in `tools/build-codemap.js`',
    '(everything else). `build:check` fails when a folder directly inside one of the sections below has',
    'no line. It does not check that a line is still true, and folders deeper down are covered by',
    'their parent\'s line. To find a file or a symbol, grep: this map stops at folders.',
    '',
    'Other maps: docs by topic, the routing table in `CLAUDE.md`; scripts and tools,',
    '`dist/engineering/capabilities.md`; components, `dist/docs/components.pick.md`; how a deck flows',
    'through the engine, `engineering/architecture.md`.',
  ];
  for (const scope of SCOPES) {
    const list = plain.filter((r) => scopeOf(r.where) === scope.dir).sort(byPath);
    if (!list.length) continue;
    out.push('', `## ${scope.title}`, '', table(list));
  }
  for (const [kind, title, intro] of [
    ['plugin', 'Plugins — `lib/plugins/<name>/`', 'Each plugin adds a syntax or a fence that works on any slide. Purpose from its manifest.'],
    ['library', 'Workspace libraries — `docs/src/lib/<name>/`', 'Each publishes on its own as `@laticent/<name>`. Purpose from its `package.json`.'],
  ]) {
    const list = rows.filter((r) => r.kind === kind).sort(byPath);
    if (list.length) out.push('', `## ${title}`, '', intro, '', table(list));
  }
  return `${out.join('\n')}\n`;
}

// ── main ───────────────────────────────────────────────────────────────────

function main(argv = process.argv.slice(2)) {
  const check = argv.includes('--check');
  const silent = argv.includes('--silent') || check;
  const files = trackedFiles();
  const rows = collect();
  const found = problems(rows, files);
  if (check) {
    if (!files) {
      console.error('codemap: --check needs a git checkout (it reads the tracked file list).');
      return 1;
    }
    if (found.length) {
      console.error(`codemap: ${found.length} problem(s):\n${found.map((p) => `  - ${p}`).join('\n')}`);
      return 1;
    }
    return 0;
  }
  for (const p of found) console.warn(`codemap: warning: ${p}`);
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, render(rows, files));
  if (!silent) console.log(`codemap: wrote ${path.relative(ROOT, OUT_FILE)} (${rows.length} rows)`);
  return 0;
}

if (require.main === module) process.exit(main());

module.exports = { FOLDERS, SCOPES, collect, problems, render, foldersInScope, scopeOf, summarize, cell, main };
