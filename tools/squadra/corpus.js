// The corpora the Squadra diffs run on (decision 2026-11-13-squadra-replaces-lint-core §6, carried from #3194),
// read by tools/squadra-reference-diff.js, so every run reads the same "cases someone already thought mattered"
// and the same tracked decks.
//
//   recordLintInputs  corpus 1: every source the lint unit tests hand the linter, recorded by running them
//                     with record-lint-inputs.cjs preloaded (or a saved recording, `reuse`).
//   trackedDecks      corpus 3: the tracked decks `lint:deck --all` reads, as `{ path, text }`.
//   hostsOf           an even spread of `n` tracked decks, the hosts a mutated corpus splices into.
//   splice            a source spliced into a host after its first slide: corpus 2.
//
// Node only: it runs the test suite and reads files.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');

/** Every unit test file that hands a source to the linter. */
function lintTestFiles() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.test.js') && /lintTextWith|lintText\(|applyAllFixes|applyFix\(/.test(fs.readFileSync(p, 'utf8'))) out.push(p);
    }
  };
  walk(path.join(ROOT, 'test', 'unit'));
  return out.sort();
}

/** LF and no BOM, as `lint:deck --fix` reads a deck, so every diff compares like with like. */
const fold = (s) => s.replace(/^﻿/, '').replace(/\r\n?/g, '\n');

/** Corpus 1, deduplicated and LF-folded: `{ inputs, tests, testExit }`. */
function recordLintInputs(reuse = null) {
  if (reuse) {
    const seen = new Set();
    for (const line of fs.readFileSync(reuse, 'utf8').split('\n')) if (line) seen.add(fold(JSON.parse(line)));
    return { inputs: [...seen], tests: lintTestFiles().length, testExit: 'reused recording' };
  }
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'squadra-corpus-')), 'inputs.jsonl');
  const tests = lintTestFiles();
  const res = spawnSync(process.execPath, ['--require', path.join(__dirname, 'record-lint-inputs.cjs'), '--test', '--test-reporter=dot', ...tests], {
    cwd: ROOT,
    env: { ...process.env, SQUADRA_RECORD: file },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (!fs.existsSync(file)) throw new Error(`recording the lint tests' inputs wrote nothing (exit ${res.status}): ${String(res.stderr).slice(-2000)}`);
  // A red lint test means the corpus is the input set of a run that broke somewhere: stop rather than diff over it.
  // The preload is lazy so that no test is red because of it (record-lint-inputs.cjs).
  if (res.status !== 0) throw new Error(`the lint tests failed while their inputs were recorded (exit ${res.status}), so the corpus cannot be trusted:\n${String(res.stdout).slice(-3000)}`);
  const seen = new Set();
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) if (line) seen.add(fold(JSON.parse(line)));
  return { inputs: [...seen], tests: tests.length, testExit: res.status, file };
}

/** Corpus 3: the tracked decks, `{ path, text }`, in `lint:deck --all`'s order. */
function trackedDecks() {
  const { discoverDecks } = require('../lint-deck');
  return discoverDecks().map((p) => ({ path: path.relative(ROOT, p), text: fs.readFileSync(p, 'utf8') }));
}

/** Splice `inner` (a corpus-1 source, already folded) into `host` (folded) after the host's first slide. */
function splice(host, inner) {
  const body = inner.replace(/^---\n[\s\S]*?\n---[ \t]*\n/, '');
  const at = host.indexOf('\n---\n', host.startsWith('---\n') ? host.indexOf('\n---', 4) + 4 : 0);
  return at < 0 ? `${host}\n\n---\n\n${body}` : `${host.slice(0, at)}\n\n---\n\n${body}${host.slice(at)}`;
}

/** `n` decks spread evenly over `decks`. */
function hostsOf(decks, n) {
  const step = Math.max(1, Math.floor(decks.length / n));
  return decks.filter((_, i) => i % step === 0).slice(0, n);
}

module.exports = { ROOT, fold, lintTestFiles, recordLintInputs, splice, trackedDecks, hostsOf };
