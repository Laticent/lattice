// markdown-it vs remark — a performance bake-off for Lattice's use cases.
//
// Lattice's engine is built on markdown-it (lib/engine/index.js); remark is the
// AST-first alternative in the unified ecosystem. This harness answers ONE
// question honestly: for the work Lattice actually does — parse a deck's
// markdown and turn it into HTML, per render, on a CLI/serverless cold start —
// which engine is faster, and by how much?
//
// It is a MEASUREMENT tool, not part of `npm test`, and remark is NOT a Lattice
// dependency (package.json stays clean). Install the comparison packages first:
//
//   npm i --no-save unified remark-parse remark-gfm remark-html \
//                   remark-rehype rehype-stringify
//
// Run:
//   node test/benchmark/markdown-it-vs-remark-bench.mjs          # all tiers
//   node test/benchmark/markdown-it-vs-remark-bench.mjs --json   # machine dump
//
// ── What's fair and what isn't (read before quoting a number) ──────────────────
// markdown-it produces a flat TOKEN STREAM; remark produces an mdast TREE. The
// two are NOT drop-in equivalents, so we measure on three tiers:
//
//  1. BASELINE  — vanilla markdown-it (commonmark + GFM) vs remark-parse +
//                 remark-gfm + HTML serializer. Pure engine speed, apples-to-
//                 apples: same input, same GFM surface, HTML out, no highlight,
//                 no Lattice plugins on either side.
//  2. PARSE-ONLY — md.parse() (tokens) vs unified.parse() (mdast). Isolates the
//                 cost of building the data structure each plugin model walks.
//  3. LATTICE    — the REAL production path (api.render: markdown-it + the
//                 Lattice plugins + the HTML transformers + highlight.js + KaTeX). remark has NO
//                 equivalent here — replicating it is a token-stream→AST rewrite
//                 of the whole kernel (HARD RULE #1). Shown to size the gap a
//                 migration would have to clear, NOT as a like-for-like race.
//
// Cold module-load is measured separately (load-tier.mjs child processes) because
// import cost can't be sampled in-process once the module is cached.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import MarkdownIt from 'markdown-it';
import { Bench } from 'tinybench';

import api from '../../lib/playground/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// remark is not a Lattice dependency, so its packages load lazily: a missing one
// stops the run with the install line instead of a bare ERR_MODULE_NOT_FOUND.
const REMARK_PKGS = ['unified', 'remark-parse', 'remark-gfm', 'remark-rehype', 'rehype-stringify'];
let mods;
try {
  mods = await Promise.all(REMARK_PKGS.map((p) => import(p)));
} catch (err) {
  console.error(`remark packages are not installed (${err.code ?? err.message}). Run:\n  npm i --no-save ${REMARK_PKGS.join(' ')}`);
  process.exit(2);
}
const [{ unified }, { default: remarkParse }, { default: remarkGfm }, { default: remarkRehype }, { default: rehypeStringify }] = mods;
const asJson = process.argv.includes('--json');

// ── datasets (the same workloads the engine bench uses) ────────────────────────
const jargon = readFileSync(join(ROOT, 'examples/gallery-jargon.md'), 'utf8');
function stressDeck(times) {
  const fmEnd = jargon.indexOf('\n---\n', jargon.indexOf('---') + 3);
  return jargon.slice(0, fmEnd) + Array.from({ length: times }, () => jargon.slice(fmEnd)).join('\n');
}
// Strip front matter for the engine-neutral tiers: markdown-it and remark both
// treat `---\n...\n---` as a thematic break + heading, not YAML. Lattice's own
// pipeline parses front matter upstream, so the baseline should see body only.
function stripFrontMatter(src) {
  const m = src.match(/^---\n[\s\S]*?\n---\n/);
  return m ? src.slice(m[0].length) : src;
}

const datasets = [
  { name: 'normal (jargon)', theme: 'crepuscolo', src: jargon },
  { name: 'stress (jargon x6)', theme: 'crepuscolo', src: stressDeck(6) },
];
for (const d of datasets) {
  d.body = stripFrontMatter(d.src);
  d.bytes = Buffer.byteLength(d.body);
}

// Register themes so the Lattice tier renders the full path (CSS resolution).
// A missing file stops the run: a silent skip would time an unthemed render.
for (const rel of ['dist/lattice.css', 'themes/crepuscolo/crepuscolo.css']) {
  if (!existsSync(join(ROOT, rel))) throw new Error(`${rel} is missing. Run \`npm run build\` first.`);
  api.addThemes([readFileSync(join(ROOT, rel), 'utf8')]);
}

// ── engines ────────────────────────────────────────────────────────────────────
// Baseline markdown-it: same surface as the Lattice engine MINUS the Lattice
// plugins and highlight (commonmark preset, GFM table+strikethrough, breaks,
// raw HTML passthrough). This is the closest vanilla equivalent to remark-gfm.
const mdit = new MarkdownIt('commonmark', { html: true, breaks: true });
mdit.enable(['table', 'strikethrough']);

// remark md→HTML via the rehype bridge (the canonical unified HTML path).
// allowDangerousHtml: raw HTML in the deck passes through, matching html:true.
const remarkToHtml = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeStringify, { allowDangerousHtml: true });

// Parse-only handles (data structure, no serialization).
const remarkParser = unified().use(remarkParse).use(remarkGfm);

const mean = (t) => t.result.latency.mean; // ms
const ratio = (a, b) => (a / b).toFixed(2);

// ── tier 1: baseline parse→HTML (apples-to-apples) ─────────────────────────────
async function baselineTier() {
  const b = new Bench({ name: 'baseline', warmup: true, time: 1500, iterations: 12 });
  for (const d of datasets) {
    b.add(`markdown-it · ${d.name}`, () => mdit.render(d.body));
    b.add(`remark · ${d.name}`, () => String(remarkToHtml.processSync(d.body)));
  }
  await b.run();
  console.log('\n=== TIER 1 · BASELINE parse→HTML (vanilla, GFM, no Lattice plugins) ===');
  console.table(b.table());
  return b;
}

// ── tier 2: parse-only (token stream vs mdast tree) ────────────────────────────
async function parseTier() {
  const b = new Bench({ name: 'parse', warmup: true, time: 1500, iterations: 12 });
  for (const d of datasets) {
    b.add(`markdown-it tokens · ${d.name}`, () => mdit.parse(d.body, {}));
    b.add(`remark mdast · ${d.name}`, () => remarkParser.parse(d.body));
  }
  await b.run();
  console.log('\n=== TIER 2 · PARSE-ONLY (markdown-it tokens vs remark mdast) ===');
  console.table(b.table());
  return b;
}

// ── tier 3: the real Lattice path (markdown-it + plugins + transformers) ───────
async function latticeTier() {
  const b = new Bench({ name: 'lattice', warmup: true, time: 1500, iterations: 8 });
  for (const d of datasets) {
    b.add(`lattice render · ${d.name}`, () => api.render(d.src, d.theme));
  }
  await b.run();
  console.log('\n=== TIER 3 · LATTICE production path (markdown-it + Lattice plugins + transformers + hljs + KaTeX) ===');
  console.table(b.table());
  console.log('  (remark has NO equivalent here — replicating it is a kernel rewrite, HARD RULE #1)');
  return b;
}

// ── peak heap per single render ────────────────────────────────────────────────
function heapTier() {
  console.log('\n=== HEAP · retained bytes for one parse→HTML of the stress deck ===');
  const big = datasets.find((d) => d.name.startsWith('stress')).body;
  const rows = [];
  for (const [label, fn] of [
    ['markdown-it', () => mdit.render(big)],
    ['remark', () => String(remarkToHtml.processSync(big))],
  ]) {
    globalThis.gc?.();
    const before = process.memoryUsage().heapUsed;
    const out = fn();
    const after = process.memoryUsage().heapUsed;
    rows.push({ engine: label, 'heap Δ (MB)': ((after - before) / 1e6).toFixed(2), 'html bytes': out.length });
  }
  console.table(rows);
  if (!globalThis.gc) console.log('  (run with `node --expose-gc` for stable heap deltas)');
  return rows;
}

// ── cold module-load (fresh process each — import cost is one-shot) ─────────────
function loadTier() {
  console.log('\n=== COLD LOAD · time to import the engine in a fresh process (5 runs, min ms) ===');
  const probes = {
    'markdown-it': "import MarkdownIt from 'markdown-it'; new MarkdownIt('commonmark');",
    remark:
      "import {unified} from 'unified';import p from 'remark-parse';import g from 'remark-gfm';import r from 'remark-rehype';import s from 'rehype-stringify';unified().use(p).use(g).use(r).use(s);",
    'lattice engine': "import api from '" + join(ROOT, 'lib/playground/index.js') + "';void api;",
  };
  // Probe files live INSIDE the repo so bare specifiers (markdown-it, remark-*)
  // resolve against the repo's node_modules (a tmpdir can't).
  const dir = mkdtempSync(join(ROOT, '.bench-load-'));
  const rows = [];
  for (const [label, code] of Object.entries(probes)) {
    const file = join(dir, `${label.replace(/\W+/g, '-')}.mjs`);
    // Time the import from inside a fresh child so the module cache is cold.
    writeFileSync(file, `const t=process.hrtime.bigint();await import(${JSON.stringify('file://' + file + '.target.mjs')});process.stdout.write(String(Number(process.hrtime.bigint()-t)/1e6));`);
    writeFileSync(file + '.target.mjs', code);
    const times = [];
    for (let i = 0; i < 5; i++) {
      try {
        times.push(Number(execFileSync(process.execPath, [file], { cwd: ROOT, encoding: 'utf8' })));
      } catch {
        /* probe failed — skip */
      }
    }
    rows.push({ engine: label, 'import ms (min)': times.length ? Math.min(...times).toFixed(1) : 'n/a' });
  }
  rmSync(dir, { recursive: true, force: true });
  console.table(rows);
  return rows;
}

async function mainRun() {
  console.log('Datasets:', datasets.map((d) => `${d.name} (${d.bytes} B body)`).join(', '));
  const baseline = await baselineTier();
  const parse = await parseTier();
  const lattice = await latticeTier();
  const heap = heapTier();
  const load = loadTier();

  // ── verdict table ────────────────────────────────────────────────────────────
  console.log('\n=== VERDICT · markdown-it speedup over remark (×, higher = markdown-it faster) ===');
  for (const d of datasets) {
    const bl = ratio(mean(baseline.getTask(`remark · ${d.name}`)), mean(baseline.getTask(`markdown-it · ${d.name}`)));
    const pr = ratio(mean(parse.getTask(`remark mdast · ${d.name}`)), mean(parse.getTask(`markdown-it tokens · ${d.name}`)));
    console.log(`  ${d.name.padEnd(20)} baseline ${bl}×   parse-only ${pr}×`);
  }

  if (asJson) {
    const dump = (b) => Object.fromEntries(b.tasks.map((t) => [t.name, { ms: mean(t), opsPerSec: 1000 / mean(t) }]));
    console.log('\n' + JSON.stringify({ baseline: dump(baseline), parse: dump(parse), lattice: dump(lattice), heap, load }, null, 2));
  }
  console.log('\nDone.');
}

mainRun();
