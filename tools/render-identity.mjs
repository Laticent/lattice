#!/usr/bin/env node
/**
 * render-identity — does this tree render every shipped deck byte-identically to another commit?
 *
 * The characterization test for a refactor that must not move output (engineering/decisions/
 * 2026-11-02-slide-facts-for-kinds.md §8). It renders every deck the engine ships with (examples/,
 * test/integration/baseline-decks/, and every *.gallery.md under lib/) through the owned engine of BOTH trees,
 * hashes the HTML and CSS each produces, and runs `lint:deck` over the same files in both trees. A deck is matched
 * across the two trees by its SOURCE (a hash of its markdown), not its path, so a file that moved still pairs up.
 *
 *   npm run identity:check                     # against origin/main
 *   npm run identity:check -- --ref <commit>   # against any commit
 *   npm run identity:check -- --json           # machine-readable result
 *
 * Exit 0 when every paired deck renders identically and lint reports the same findings; exit 1 with the decks that
 * differ. A deck whose source exists in only one tree is listed (added or removed), not failed: a refactor that adds
 * a deck is not a regression of the others.
 *
 * The other tree is checked out with `git worktree add --detach` into the OS temp directory. It shares this repo's
 * third-party node_modules, so the comparison is not of dependency versions, but it resolves the workspace libraries
 * (@laticent/*) to its OWN sources and builds its own generated files, so a change moved into a library is compared
 * too. The worktree is removed on exit.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const refAt = argv.indexOf('--ref');
const REF = refAt >= 0 ? argv[refAt + 1] : 'origin/main';
const JSON_OUT = argv.includes('--json');

const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

/** The child script: render and lint every deck of the tree at `root`, print one JSON object. */
const CHILD = `
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = process.argv[1];
const engine = require(path.join(root, 'lib/engine'));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
const decks = [];
const walk = (d, keep) => {
  if (!fs.existsSync(d)) return;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, keep); else if (keep(e.name)) decks.push(p);
  }
};
walk(path.join(root, 'examples'), (n) => n.endsWith('.md') && n !== 'README.md');
walk(path.join(root, 'test/integration/baseline-decks'), (n) => n.endsWith('.md') && n !== 'README.md');
walk(path.join(root, 'lib'), (n) => n.endsWith('.gallery.md'));
const scrub = (s) => String(s).split(root).join('<ROOT>');
const out = { decks: {}, lint: [] };
const byFile = new Map();
for (const file of decks.sort()) {
  const src = fs.readFileSync(file, 'utf8');
  const key = sha(src);
  byFile.set(path.resolve(file), key);
  let r;
  try {
    const res = engine.render(src, { baseUrl: undefined });
    r = { html: sha(scrub(res.html)), css: sha(scrub(res.css || '')) };
  } catch (e) { r = { error: scrub(e.message).slice(0, 200) }; }
  out.decks[key] = { ...r, path: path.relative(root, file) };
}
const lint = JSON.parse(execFileSync(process.execPath, [path.join(root, 'tools/lint-deck.js'), '--all', '--json'],
  { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }));
for (const k of ['findings', 'reviewFindings']) {
  for (const f of lint[k] || []) {
    const key = byFile.get(path.resolve(f.file)) || scrub(f.file);
    out.lint.push(JSON.stringify({ ...f, file: key }, Object.keys({ ...f, file: key }).sort()));
  }
}
out.lint.sort();
process.stdout.write(JSON.stringify(out));
`;

function renderTree(root) {
  return JSON.parse(execFileSync(process.execPath, ['-e', CHILD, root], {
    cwd: root, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024,
  }));
}

function withRefTree(ref, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'render-identity-'));
  execFileSync('git', ['worktree', 'add', '--detach', '--quiet', dir, ref], { cwd: ROOT });
  try {
    // Third-party dependencies are shared; the workspace libraries (@laticent/*) are the OTHER tree's own, so a change
    // inside a library (a move into @laticent/markup, a rewritten reader) is part of what is compared.
    const nm = path.join(dir, 'node_modules');
    fs.mkdirSync(path.join(nm, '@laticent'), { recursive: true });
    for (const e of fs.readdirSync(path.join(ROOT, 'node_modules'))) {
      if (e !== '@laticent') fs.symlinkSync(path.join(ROOT, 'node_modules', e), path.join(nm, e));
    }
    for (const lib of fs.readdirSync(path.join(ROOT, 'node_modules', '@laticent'))) {
      const target = fs.readlinkSync(path.join(ROOT, 'node_modules', '@laticent', lib));
      const own = path.resolve(path.join(nm, '@laticent'), target);
      fs.symlinkSync(fs.existsSync(own) ? own : path.join(ROOT, 'node_modules', '@laticent', lib), path.join(nm, '@laticent', lib));
    }
    if (fs.existsSync(path.join(ROOT, 'docs/node_modules'))) fs.symlinkSync(path.join(ROOT, 'docs/node_modules'), path.join(dir, 'docs/node_modules'), 'dir');
    // The other tree's own workspace-library builds (not committed) and its CSS bundle; its committed generated
    // tables are already in the checkout. Not the whole `npm run build`: its bundling steps (the agent kit, the
    // player) read esbuild's path banners and do not run against a shared node_modules, and the engine needs none.
    const steps = fs.readdirSync(path.join(dir, 'tools')).filter((f) => /^build-[a-z]+-lib\.js$/.test(f)).sort();
    if (fs.existsSync(path.join(dir, 'tools/build-segno-grammar.js'))) steps.unshift('build-segno-grammar.js');
    steps.push('build-css.js');
    for (const step of steps) {
      try {
        execFileSync(process.execPath, [path.join(dir, 'tools', step)], { cwd: dir, encoding: 'utf8', stdio: 'pipe', maxBuffer: 64 * 1024 * 1024 });
      } catch (e) {
        throw new Error(`building ${ref} (${step}) failed:\n${String(e.stdout || '').slice(-1500)}${String(e.stderr || '').slice(-1500)}`);
      }
    }
    return fn(dir);
  } finally {
    execFileSync('git', ['worktree', 'remove', '--force', dir], { cwd: ROOT });
  }
}

const here = renderTree(ROOT);
const there = withRefTree(REF, renderTree);

const changed = [];
const added = [];
const removed = [];
for (const [key, a] of Object.entries(here.decks)) {
  const b = there.decks[key];
  if (!b) { added.push(a.path); continue; }
  if (a.html !== b.html || a.css !== b.css || a.error !== b.error) {
    changed.push({ path: a.path, was: b.path, html: a.html !== b.html, css: a.css !== b.css, error: a.error || b.error || null });
  }
}
for (const [key, b] of Object.entries(there.decks)) if (!here.decks[key]) removed.push(b.path);
const lintSame = JSON.stringify(here.lint) === JSON.stringify(there.lint);

const result = {
  ref: REF,
  decks: Object.keys(here.decks).length,
  paired: Object.keys(here.decks).filter((k) => there.decks[k]).length,
  changed, added, removed, lintSame,
  lintFindings: { here: here.lint.length, there: there.lint.length },
};
if (JSON_OUT) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
else {
  console.log(`render-identity vs ${REF}: ${result.paired} paired decks, ${changed.length} differ; ` +
    `${added.length} added, ${removed.length} removed; lint ${lintSame ? 'identical' : 'DIFFERS'} ` +
    `(${result.lintFindings.here} findings here, ${result.lintFindings.there} there).`);
  for (const c of changed) console.log(`  differs: ${c.path}${c.was !== c.path ? ` (was ${c.was})` : ''}${c.html ? ' html' : ''}${c.css ? ' css' : ''}${c.error ? ` error: ${c.error}` : ''}`);
  for (const p of added) console.log(`  added:   ${p}`);
  for (const p of removed) console.log(`  removed: ${p}`);
}
process.exit(changed.length || !lintSame ? 1 : 0);
