/**
 * lib/export/math-typeset.js — the CLI's typesetter for `math.render.js`'s seam (`setTypesetter`): every formula
 * typeset by KaTeX in the LOCKED page (`math-typeset-worker.js`, a child process the synchronous render can wait on),
 * never in this process (owner decision 14; engineering/decisions/2026-10-19-first-party-plugins-in-the-sandbox.md).
 *
 * `prepare(collect)` runs before a deck's real render: `collect` renders it once to find the formulas it holds (a miss
 * shows its source and is recorded), and one worker typesets them all. Every later render reads them; a formula one meets
 * for the first time (a display formula reflowed only once its first typeset was seen) is typeset on its own.
 *
 * IF THE LOCKED PAGE CANNOT START (no browser), the formulas are typeset in this process, as before this move, and the
 * CLI says so once: a deck that renders today keeps rendering. The owner's decision D-A on the PR's card may tighten it.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const math = require('../plugins/math/math.render.js');

const WORKER = path.join(__dirname, 'math-typeset-worker.js');
const WORKER_TIMEOUT_MS = 180000;

/**
 * @param {{ chromePath?: string, warn?: (line: string) => void }} [opts]
 * @returns {{ prepare: (collect: () => void) => void, stats: { formulas: number, workerRuns: number, inProcess: number, layer: string|null } }}
 */
function createMathTypesetter({ chromePath, warn = (l) => console.error(l) } = {}) {
  const lookup = new Map();
  const stats = { formulas: 0, workerRuns: 0, inProcess: 0, layer: null };
  let warned = false;
  const inProcess = (keys, why) => {
    if (!warned) {
      warned = true;
      warn(`  ⚠ math: the locked page could not typeset this deck's formulas (${why}), so KaTeX typeset them in this process.`);
    }
    for (const key of keys) {
      const { src, display, output } = math.parseTypesetKey(key);
      lookup.set(key, math.typesetInProcess(src, display, output));
      stats.inProcess++;
    }
  };
  const typeset = (keys) => {
    const todo = [...new Set(keys)].filter((k) => !lookup.has(k));
    if (!todo.length) return;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-math-'));
    try {
      const outFile = path.join(dir, 'out.json');
      const jobFile = path.join(dir, 'job.json');
      fs.writeFileSync(jobFile, JSON.stringify({ chromePath, outFile, formulas: todo.map((key) => ({ key, ...math.parseTypesetKey(key) })) }));
      stats.workerRuns++;
      const r = spawnSync(process.execPath, [WORKER, jobFile], { encoding: 'utf8', timeout: WORKER_TIMEOUT_MS });
      let payload = null;
      try {
        payload = JSON.parse(fs.readFileSync(outFile, 'utf8'));
      } catch {
        /* no result file: the worker died */
      }
      if (!payload?.ok) return inProcess(todo, payload?.error || (r.error ? r.error.message : `the worker exited ${r.status}`));
      stats.layer = payload.layer ?? null;
      for (const key of todo) {
        // A formula the worker could not typeset shows its source, as a KaTeX failure always has.
        const html = payload.results[key];
        lookup.set(key, typeof html === 'string' ? html : escapeSource(key));
        stats.formulas++;
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
  const escapeSource = (key) => math.parseTypesetKey(key).src.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  /**
   * Typeset a deck's formulas before its real render: `collect` renders it once with misses recorded (the plain engine
   * render; no code package runs twice for it), one worker typesets them all, and from then on every render of this
   * process reads `lookup`, typesetting a formula it has not seen on its own.
   */
  function prepare(collect) {
    const misses = new Set();
    math.setTypesetter({ lookup, misses, typeset });
    try {
      collect();
    } finally {
      math.setTypesetter({ lookup, misses: null, typeset });
    }
    if (misses.size) typeset([...misses]);
  }
  return { prepare, stats };
}

module.exports = { createMathTypesetter };
