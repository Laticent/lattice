#!/usr/bin/env node
/**
 * regex-census — decide the complexity of every regex literal in lib/** and keep the answer in tools/regex-census.json.
 *
 *   npm run regex:census                 report the backlog: slow literals per file and per folder
 *   npm run regex:census -- --write      decide each literal the table lacks, drop stale verdicts, lower the backlog
 *   npm run regex:census -- --verify     re-decide EVERY verdict and report each one that changed (slow: minutes)
 *   npm run regex:census -- --check '/a+b/'   decide one pattern and print recheck's answer (with the attack string)
 *
 * The gate is `checkRegexCensus` in tools/check-ownership.js, and it needs no recheck: it only holds lib/** to this table.
 * This writer is the one place recheck runs. recheck is pinned in its own folder, tools/recheck/, so the root `npm ci`
 * does not carry it: install it with `npm ci --prefix tools/recheck --omit=optional` (about 12 MB; the optional native
 * binaries are not needed). It runs the pure-JS backend with the automaton checker and NO timeout, so a verdict depends on
 * the pattern alone, never on the machine: recheck's own size limits stop a pattern it cannot model and report it as
 * `unknown`, which the table stores with recheck's reason.
 *
 * --write refuses a NEW literal recheck does not call linear, and refuses to raise a file's backlog (the count of its literals whose verdict is not `safe` and whose line carries
 * no `// regex-ok: <why>`): a new slow pattern is rewritten, or marked on its line with the reason it is bounded, or
 * admitted with --raise and the reason in the PR. Decisions run in parallel child processes (`--jobs N`, default the
 * CPU count). `--progress <file>` checkpoints each decision so an interrupted run resumes.
 */


const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fork } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const PIN_DIR = path.join(__dirname, 'recheck');
const RECHECK_VERSION = JSON.parse(fs.readFileSync(path.join(PIN_DIR, 'package.json'), 'utf8')).dependencies.recheck;

/** Split a literal's text, `/source/flags`, at its last slash. */
function splitLiteral(key) {
  const end = key.lastIndexOf('/');
  return { source: key.slice(1, end), flags: key.slice(end + 1) };
}

function loadRecheck() {
  process.env.RECHECK_BACKEND = 'pure';
  try {
    return require(path.join(PIN_DIR, 'node_modules', 'recheck'));
  } catch {
    console.error('regex-census: recheck is not installed. Run: npm ci --prefix tools/recheck --omit=optional --ignore-scripts');
    process.exit(2);
  }
}

/** One pattern's table entry from recheck's diagnostics. Deterministic: no timeout, the automaton checker only. */
async function decide(recheck, key) {
  const { source, flags } = splitLiteral(key);
  const r = await recheck.check(source, flags, { checker: 'automaton', timeout: null });
  if (r.status === 'safe') return { entry: 'safe', r };
  if (r.status === 'vulnerable') return { entry: r.complexity.type, r };
  const kind = r.error?.kind || r.status;
  const why = kind === 'unsupported' ? `recheck cannot model it: ${r.error.message}` : `recheck could not decide it (${kind}${r.error?.message ? `: ${r.error.message}` : ''})`;
  return { entry: { verdict: 'unknown', why }, r };
}

/** A child: decide the keys it is sent, one message each. */
function child() {
  const recheck = loadRecheck();
  process.on('message', async (key) => {
    const { entry } = await decide(recheck, key);
    process.send({ key, entry });
  });
}

/** The heap each child gets: fixed, so a pattern that exhausts it does so on every machine (an `unknown` verdict). */
const CHILD_HEAP_MB = 3072;
/** A child is replaced after this many decisions: recheck's runtime keeps memory between checks. */
const CHILD_BATCH = 40;

/**
 * Decide `keys` across `jobs` child processes. Returns { key: entry }. Each decision is appended to `progressFile` (JSON
 * lines) when one is given, and a run reads it back first, so an interrupted census resumes. A key whose child dies is
 * retried ALONE, in a fresh child that decides nothing else, so whether it exhausts the heap does not depend on what an
 * earlier key left behind; a second death records it as undecided, with the reason.
 */
function decideAll(keys, jobs, progressFile) {
  const out = {};
  if (progressFile && fs.existsSync(progressFile)) {
    for (const line of fs.readFileSync(progressFile, 'utf8').split('\n')) {
      if (!line) continue;
      try {
        const { key, entry } = JSON.parse(line);
        if (typeof key === 'string' && keys.includes(key)) out[key] = entry;
      } catch {
        /* a torn last line from an interrupted run */
      }
    }
  }
  const queue = keys.filter((k) => out[k] === undefined);
  const total = queue.length;
  return new Promise((resolve) => {
    if (!total) return resolve(out);
    let done = 0;
    let live = 0;
    let settled = false;
    const kids = [];
    const finish = () => {
      if (settled) return;
      settled = true;
      for (const k of kids) if (k.connected) k.disconnect();
      resolve(out);
    };
    // A key is recorded once: a late or repeated message cannot count twice and end the run early.
    const record = (key, entry) => {
      if (typeof key !== 'string' || Object.hasOwn(out, key)) return;
      out[key] = entry;
      if (progressFile) fs.appendFileSync(progressFile, `${JSON.stringify({ key, entry })}\n`);
      done++;
      if (done % 50 === 0 || done === total) process.stderr.write(`regex-census: ${done}/${total} decided\n`);
      if (done === total) finish();
    };
    const next = () => {
      if (queue.length) spawn(null);
      else if (!live && done < total) finish();
    };
    // `solo` is a key retried after its child died: the child decides that one key and nothing else.
    const spawn = (solo) => {
      live++;
      const kid = fork(__filename, [], { env: { ...process.env, REGEX_CENSUS_CHILD: '1' }, execArgv: [`--max-old-space-size=${CHILD_HEAP_MB}`], stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
      kids.push(kid);
      let current = null;
      let served = 0;
      let exited = false;
      const feed = () => {
        if (exited) return;
        const k = solo !== null ? (served === 0 ? solo : undefined) : served < CHILD_BATCH ? queue.shift() : undefined;
        // `current` is null whenever this child holds no key, so its exit is not mistaken for a crash.
        current = k === undefined ? null : k;
        if (current === null) return kid.connected && kid.disconnect();
        served++;
        kid.send(current);
      };
      kid.on('message', ({ key, entry }) => {
        if (key === current) current = null;
        record(key, entry);
        feed();
      });
      kid.on('exit', (code, signal) => {
        exited = true;
        live--;
        const lost = current;
        current = null;
        if (lost !== null && !Object.hasOwn(out, lost)) {
          if (solo === null) spawn(lost);
          else record(lost, { verdict: 'unknown', why: `recheck could not decide it within a ${CHILD_HEAP_MB} MB heap, alone in a fresh process (the checker exits ${signal || code})` });
        }
        next();
      });
      feed();
    };
    for (let i = 0; i < Math.min(jobs, total); i++) spawn(null);
  });
}

/** The committed table. Only a MISSING file is a first run; a table that does not parse is an error, never a fresh start
 *  (a re-baseline would quietly admit every slow literal). */
function readTable(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error(`regex-census: ${path.relative(ROOT, file)} does not parse (${e.message}). Fix or restore it (git checkout); it is never rebuilt from scratch here.`);
    process.exit(2);
  }
}

function sortObject(o) {
  return Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
}

function folderOf(file) {
  return file.split('/').slice(0, 3).join('/');
}

function report(tree, table, census) {
  const verdicts = table.verdicts || {};
  const backlog = census.regexBacklog(tree, verdicts);
  const counts = {};
  for (const v of Object.values(verdicts)) counts[census.regexVerdictOf(v)] = (counts[census.regexVerdictOf(v)] || 0) + 1;
  const total = Object.values(backlog).reduce((a, b) => a + b, 0);
  console.log(`regex census (recheck ${table.recheck || '?'}): ${Object.keys(verdicts).length} distinct literals —`, Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(', '));
  console.log(`backlog: ${total} slow literal(s) in ${Object.keys(backlog).length} file(s)\n`);
  const byFolder = {};
  for (const [f, n] of Object.entries(backlog)) byFolder[folderOf(f)] = (byFolder[folderOf(f)] || 0) + n;
  console.log('by folder:');
  for (const [d, n] of Object.entries(byFolder).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${d}`);
  console.log('\ntop files:');
  for (const [f, n] of Object.entries(backlog).sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${String(n).padStart(4)}  ${f}`);
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name) => args.includes(name);
  const opt = (name, dflt) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : dflt;
  };
  const tableFile = path.resolve(opt('--table', path.join(__dirname, 'regex-census.json')));
  const jobs = Number(opt('--jobs', Math.max(1, os.cpus().length)));

  if (flag('--check')) {
    const recheck = loadRecheck();
    const key = opt('--check');
    const { entry, r } = await decide(recheck, key);
    console.log(JSON.stringify({ key, entry, attack: r.attack?.pattern ?? r.attack?.string, hotspot: r.hotspot }, null, 2));
    return;
  }

  const census = require('./check-ownership.js');
  const tree = census.regexLiteralTree(ROOT);
  const found = readTable(tableFile);
  const firstRun = found === null;
  const table = found || { verdicts: {}, backlog: {} };
  const verdicts = table.verdicts || {};
  const live = new Set(Object.values(tree).flatMap((ls) => ls.map((l) => l.key)));

  if (flag('--verify')) {
    const keys = Object.keys(verdicts).filter((k) => live.has(k));
    const fresh = await decideAll(keys, jobs, opt('--progress'));
    const changed = keys.filter((k) => JSON.stringify(fresh[k]) !== JSON.stringify(verdicts[k]));
    for (const k of changed) console.log(`${k}: table ${JSON.stringify(verdicts[k])}, recheck ${JSON.stringify(fresh[k])}`);
    console.log(`regex-census --verify: ${keys.length} verdict(s) re-decided, ${changed.length} differ.`);
    process.exit(changed.length ? 1 : 0);
  }

  if (!flag('--write')) {
    report(tree, table, census);
    const errors = census.regexCensusFindings(tree, table);
    if (errors.length) console.log(`\n${errors.length} finding(s); \`npm run regex:census -- --write\` settles the mechanical ones.`);
    return;
  }

  const missing = [...live].filter((k) => verdicts[k] === undefined);
  const decided = await decideAll(missing, jobs, opt('--progress'));
  const next = {};
  for (const k of live) next[k] = verdicts[k] !== undefined ? verdicts[k] : decided[k];
  const backlog = census.regexBacklog(tree, next);
  const old = table.backlog || {};
  const raised = Object.entries(backlog).filter(([f, n]) => n > (old[f] || 0));
  // A NEW slow literal is refused even where the file's count would not rise: without this, a file could trade a drained
  // pattern for a new slow one and keep its count (the gate holds counts, and only the writer sees which literal is new).
  const newSlow = Object.entries(tree).flatMap(([f, ls]) => ls.filter((l) => !l.ok && missing.includes(l.key) && census.regexVerdictOf(next[l.key]) !== 'safe').map((l) => `${f}:${l.line} ${l.key}  ${JSON.stringify(next[l.key])}`));
  if (newSlow.length && !firstRun && !flag('--raise')) {
    console.error('regex-census: refusing to write, recheck does not call these new literals linear:');
    for (const line of newSlow) console.error(`  ${line}`);
    console.error('Rewrite each so recheck calls it safe (`npm run regex:census -- --check \'/…/\'` prints the attack string), or mark a bounded one');
    console.error('with // regex-ok: <why>. --raise admits it; give the reason in the PR.');
    process.exit(1);
  }
  if (raised.length && !firstRun && !flag('--raise')) {
    console.error('regex-census: refusing to write, these files would hold more slow literals than the backlog allows:');
    for (const [f, n] of raised) {
      const slow = tree[f].filter((l) => !l.ok && census.regexVerdictOf(next[l.key]) !== 'safe');
      console.error(`  ${f}: ${old[f] || 0} → ${n}`);
      for (const l of slow) if (missing.includes(l.key) || !(old[f])) console.error(`    :${l.line} ${l.key}  ${JSON.stringify(next[l.key])}`);
    }
    console.error('Rewrite the pattern so recheck calls it safe (`npm run regex:census -- --check \'/…/\'` prints the attack string), or mark a bounded one');
    console.error('with // regex-ok: <why>. --raise admits it; give the reason in the PR.');
    process.exit(1);
  }
  const out = {
    _comment:
      'HARD RULE #32 regex census, held by checkRegexCensus in tools/check-ownership.js. `verdicts` is recheck\'s answer for each distinct regex literal in lib/** (keyed on its text), so only a new or changed literal is decided again; `backlog` is each file\'s count of literals that are not safe and carry no // regex-ok, held exactly so it only shrinks. Written by `npm run regex:census -- --write`; never raise a backlog count without the reason in the PR. followups.d/3045-p2-regex-recheck-gate.md drains it.',
    recheck: RECHECK_VERSION,
    backlog: sortObject(backlog),
    verdicts: sortObject(next),
  };
  fs.writeFileSync(tableFile, `${JSON.stringify(out, null, 2)}\n`);
  const lowered = Object.entries(old).filter(([f, n]) => (backlog[f] || 0) < n).length;
  console.log(`regex-census: wrote ${path.relative(ROOT, tableFile)}: ${missing.length} decided, ${Object.keys(verdicts).filter((k) => !live.has(k)).length} stale dropped, ${lowered} file backlog(s) lowered${raised.length && !firstRun ? `, ${raised.length} RAISED (--raise)` : ''}.`);
}

if (process.env.REGEX_CENSUS_CHILD) child();
else {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
