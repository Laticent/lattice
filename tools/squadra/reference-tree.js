// The reference for the lint-core rewrite's diffs (decision 2026-11-13-squadra-replaces-lint-core §6, §10): lint-core
// as MAIN has it at the point this branch left it, run from a git worktree of that commit.
//
// WHY A WORKTREE. lint-core's answer depends on about 220 modules: its own file, lib/core, the generated tables, and
// the Segno, Markup, Segno-markdown and Squadra libraries, some reached through `require`, some through ESM `import`,
// some only while it lints or fixes. This branch already edits two of them (the deck model's `containers`, the Squadra
// driver lint-core's own Fix all runs). A copy of lint-core.js, or a list of the files to watch, misses some of them and
// says nothing; both were tried and both had silent holes. A worktree of the merge-base is that commit's whole tree, so
// nothing has to be listed. The libraries are built in it, and its node_modules links the workspace packages to ITS
// docs/src/lib, never the branch's (`linkModules`).
//
// Cost, measured 2026-11-15: about 19 s the first time for a commit (8 s worktree and links, 11 s for six library
// builds), nothing after: the tree is kept under .scratch/squadra-reference/<sha> and reused while it is complete.
//
// Node only: it runs git and the library builds.

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const DIR = path.join(ROOT, '.scratch', 'squadra-reference');
/** The workspace libraries lint-core loads (segno, markup, segno-markdown, squadra) and the ones its transforms need. */
const LIBS = ['segno', 'markup', 'segno-markdown', 'mosaico', 'fluido', 'squadra'];
const READY = '.squadra-reference-ready';

function git(args, cwd = ROOT) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${String(r.stderr).trim()}`);
  return r.stdout.trim();
}

/** The commit this branch left main at. Throws when there is none: the diff refuses to run without a reference. */
function referenceBase() {
  for (const main of ['origin/main', 'main']) {
    const r = spawnSync('git', ['merge-base', 'HEAD', main], { cwd: ROOT, encoding: 'utf8' });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  }
  throw new Error('no merge-base with origin/main or main: fetch main (`git fetch origin main`) so the reference diff knows what to compare against');
}

/**
 * The tree's node_modules: every package of the repo's install linked in, except the workspace packages, whose links
 * (relative, `../../docs/src/lib/<pkg>`) are copied as they are so they resolve inside the tree.
 */
function linkModules(tree) {
  const from = path.join(ROOT, 'node_modules');
  const to = path.join(tree, 'node_modules');
  fs.mkdirSync(path.join(to, '@laticent'), { recursive: true });
  for (const name of fs.readdirSync(from)) {
    if (name === '@laticent') continue;
    fs.symlinkSync(path.join(from, name), path.join(to, name));
  }
  for (const name of fs.readdirSync(path.join(from, '@laticent'))) {
    fs.symlinkSync(fs.readlinkSync(path.join(from, '@laticent', name)), path.join(to, '@laticent', name));
  }
}

/** The reference tree for `sha` (default: the merge-base), built if it is not there yet. Returns its path. */
function ensureReferenceTree(sha = referenceBase(), log = (s) => process.stderr.write(`${s}\n`)) {
  const tree = path.join(DIR, sha);
  if (fs.existsSync(path.join(tree, READY))) return tree;
  if (fs.existsSync(tree)) {
    spawnSync('git', ['worktree', 'remove', '--force', tree], { cwd: ROOT });
    fs.rmSync(tree, { recursive: true, force: true });
  }
  git(['worktree', 'prune']);
  fs.mkdirSync(DIR, { recursive: true });
  log(`[squadra-reference] building the reference at ${sha.slice(0, 9)} (main where this branch left it)`);
  git(['worktree', 'add', '--detach', tree, sha]);
  linkModules(tree);
  for (const lib of LIBS) {
    const r = spawnSync(process.execPath, [path.join('tools', `build-${lib}-lib.js`), '--silent'], { cwd: tree, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`building ${lib} in the reference tree failed: ${String(r.stderr).slice(-2000)}`);
  }
  const leaked = isolationLeaks(tree);
  if (leaked.length) throw new Error(`the reference tree loaded modules from the branch, so it is not main's lint-core: ${leaked.slice(0, 5).join(', ')}`);
  fs.writeFileSync(path.join(tree, READY), `${sha}\n`);
  return tree;
}

/**
 * Load the reference in a fresh process, lint the gallery and run a Fix all (which loads the fix driver on demand), and
 * list every repo module it loaded from outside the tree. [] means the reference is isolated from the branch. Read
 * from the module cache and, for ESM imports, from a resolve hook, so neither kind of load slips past.
 */
function isolationLeaks(tree) {
  const script = `
const { register } = require('node:module');
const seen = new Set();
const { port1, port2 } = new MessageChannel();
port1.on('message', (u) => seen.add(u));
port1.unref();
register('data:text/javascript,' + encodeURIComponent('let p; export function initialize(d){p=d.port} export async function resolve(s,c,n){const r=await n(s,c); if(r.url.startsWith("file:")) p.postMessage(r.url); return r}'), { data: { port: port2 }, transferList: [port2] });
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const tree = ${JSON.stringify(tree)};
const core = require(path.join(tree, 'lib/authoring/lint-core.js'));
const vocab = require(path.join(tree, 'lib/authoring/lint.js')).buildVocab();
const deck = require('node:fs').readFileSync(path.join(tree, 'test/integration/baseline-decks/gallery.md'), 'utf8');
core.lintTextWith(deck, vocab);
core.applyAllFixes('<!-- _paginate: true -->\\n# A\\n' + deck, vocab);
setTimeout(() => {
  const files = [...Object.keys(require.cache), ...[...seen].map((u) => fileURLToPath(u))];
  const root = ${JSON.stringify(`${ROOT}${path.sep}`)};
  const out = [...new Set(files.filter((f) => f.startsWith(root) && !f.startsWith(tree + path.sep) && !f.includes(path.sep + 'node_modules' + path.sep)))];
  console.log(JSON.stringify(out));
}, 50);
`;
  const r = spawnSync(process.execPath, ['-e', script], { cwd: tree, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`the isolation check could not load the reference: ${String(r.stderr).slice(-2000)}`);
  return JSON.parse(r.stdout.trim().split('\n').pop());
}

/** lint-core and what the diff calls beside it, all loaded from the reference tree. */
function loadReference(tree = ensureReferenceTree()) {
  const req = (p) => require(path.join(tree, p));
  return {
    tree,
    sha: fs.readFileSync(path.join(tree, READY), 'utf8').trim(),
    core: req('lib/authoring/lint-core.js'),
    buildVocab: req('lib/authoring/lint.js').buildVocab,
    separatorLines: req('lib/authoring/slide-split.js').separatorLines,
    fencedLines: req('lib/core/shape-glyphs.js').fencedLines,
  };
}

module.exports = { referenceBase, ensureReferenceTree, loadReference, linkModules, isolationLeaks, LIBS, DIR };
