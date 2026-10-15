/**
 * lib/plugins/code-format/code-format.bake.js — the CLI half: format every block that asks, in the
 * deck's Markdown, before the engine renders it (lib/plugins/host-bake.js runs it only for a deck
 * whose `detect` says it formats something).
 *
 * The plan and the splice are shared/plan.mjs, the same module the docs site runs above its render,
 * so both surfaces render the same formatted source. The formatting itself runs in one child process
 * (shared/worker.mjs) for all of the deck's blocks at once, because a bake is synchronous and every
 * formatter is not. A block a formatter refuses (invalid code, a language none reads) keeps its
 * author's text, and the bake says so on stderr unless the export is quiet.
 */

const { spawnSync } = require('node:child_process');
const path = require('node:path');

/**
 * The worker, from the package root the export hands every bake (`ctx.pkgRoot`, BAKE_SERVICES):
 * the CLI runs this module bundled into dist/lattice.js, where `__dirname` is dist/, so a path built
 * from it would name a file that is not there. Unbundled (a test), the folder three levels up.
 */
function workerPath(ctx) {
  const root = ctx.pkgRoot || path.join(__dirname, '..', '..', '..');
  return path.join(root, 'lib', 'plugins', 'code-format', 'shared', 'worker.mjs');
}

let planModule = null;
/** plan.mjs is ESM; a bake is synchronous, so it is loaded through `require` of the ESM graph (Node 22). */
function plan() {
  planModule ??= require('./shared/plan.mjs');
  return planModule;
}

function bake(source, ctx = {}) {
  const { planFormat, applyFormat } = plan();
  const jobs = planFormat(source);
  if (!jobs.length) return source;
  const run = spawnSync(process.execPath, [workerPath(ctx)], {
    input: JSON.stringify({ jobs: jobs.filter((j) => j.supported).map(({ id, lang, code, opts }) => ({ id, lang, code, opts })) }),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (run.status !== 0) throw new Error(`code-format: the formatter process failed: ${(run.stderr || '').trim().split('\n')[0] || `exit ${run.status}`}`);
  const results = new Map(JSON.parse(run.stdout).results);
  const { markdown, skipped } = applyFormat(source, jobs, results);
  if (!ctx.quiet) {
    for (const s of skipped) process.stderr.write(`  code-format: the ${s.lang} block at line ${s.line + 1} keeps its text: ${s.error}\n`);
  }
  return markdown;
}

module.exports = { bake };
