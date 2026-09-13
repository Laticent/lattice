#!/usr/bin/env node
/**
 * jank-census — run check-jank's `--anchors` discovery across the WHOLE catalog and rank what moves.
 *
 * `check-jank.js` answers one question about one component. This answers the prior
 * question nobody had asked: across all 69 catalog components and their declared
 * variants, WHICH ONES EVEN HAVE a mark that could drift — and of those, which ones
 * actually move as the content grows.
 *
 * WHY IT EXISTS. The jank invariant that runs per PR
 * (`test/integration/invariants/jank-sweep.test.js`) is a RIG-INTEGRITY test: it proves
 * `check-jank` can still detect a collision, on essentially one component. Green there
 * says nothing about the other 68. Every other gate in this repo asks whether content
 * FITS; `check-jank` is the only one that asks whether the layout STAYS PUT, and until
 * this census nothing had pointed it at the catalog.
 *
 * WHAT IT DOES NOT DO, and this matters more than what it does:
 *
 *  · IT CANNOT FAIL A COMPONENT. `--anchors` is discovery, not a verdict — without
 *    `--anchor` a check-jank run cannot exit 1 at all (drift and collision are both
 *    undefined). So a moving candidate here is a LEAD, not a defect. Re-sweep it with
 *    `--anchor '<sel>'` to get a verdict. The census prints that exact command per hit.
 *  · A `moves: 0px` ROW IS NOT A CLEAN BILL. It says the FIRST match of that selector
 *    held still on the heading axis, at `wide`, on `indaco`, with the manifest's own
 *    skeleton. A component whose real chrome is optional (a featured flag, a
 *    variant-only badge) can have a mark this sweep never rendered — see
 *    engineering/jank.md § "Declaring a `capacity.axis` silently changes what the tool
 *    sweeps".
 *  · `per > 1` MEANS THE NUMBER IS SIBLING SPREAD, not drift. A `li::before` matches
 *    every bullet; the census measures the first per slide, which is the right
 *    comparison, but the selector still names a set rather than a mark. Narrow it
 *    before believing the number.
 *
 * A RUN THAT DID NOT MEASURE IS NEVER REPORTED AS "none". check-jank's exit-2 set is
 * deliberately wide precisely because the dangerous failure for a measurement rig is a
 * confident CLEAN over something it never ran. A census inherits that hazard and
 * multiplies it by 272, so an unmeasurable class lands in its own UNMEASURED section
 * with the tool's own stderr, and the census exits 1. Use `--tolerate-unmeasured` to
 * exit 0 anyway when the failures are known and recorded.
 *
 * Usage:
 *   node tools/jank-census.js                      # base classes only (69)
 *   node tools/jank-census.js --variants           # + every declared variant (272)
 *   node tools/jank-census.js --only divider,cycle
 *   node tools/jank-census.js --jobs 3 --out .scratch/census.json
 *
 *   --variants             also sweep `<component> <variant>` for each manifest variant.
 *   --marks                also sweep every BASE MODIFIER that draws a section-level mark,
 *                          applied to a plain host slide. THIS IS THE ARCHETYPE: a
 *                          `section::before` running mark is the one thing on a slide that
 *                          is supposed to sit at the same place on every slide, and it is
 *                          the failure `check-jank` was built from (#2005). The modifiers
 *                          are not component variants, so `--variants` never reaches them.
 *   --host <class>         the component a `--marks` sweep hangs the modifier on.
 *                          Default `content` — it draws no positioned mark of its own, so
 *                          every candidate found belongs to the modifier under test.
 *   --only a,b,c           restrict to these components (base name match). `--only none`
 *                          selects no component at all, for a `--marks`-only sweep.
 *   --jobs N               concurrent check-jank runs. Default 3. Each spawns a Chromium
 *                          render sweep; past the core count they contend and the
 *                          wall-clock per run climbs faster than the batch shrinks.
 *   --family <f>           passed through (default wide, the calibrated cell).
 *   --out <path>           write the full JSON result (default: stdout table only).
 *   --md <path>            write the ranked table as markdown.
 *   --render <json>        re-write the markdown from a census JSON already on disk,
 *                          sweeping nothing. The table's formatting is edited far more
 *                          often than the measurements are, and a seven-minute Chromium
 *                          re-sweep to change a column header is how a committed table
 *                          ends up hand-edited instead.
 *   --tolerate-unmeasured  report unmeasurable classes but exit 0.
 *
 * Exit 0 clean, 1 when any class could not be measured (unless tolerated), 2 on a
 * census-level setup failure.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { FAMILIES } = require('./lib/calibrate-core.js');

const ROOT = path.join(__dirname, '..');
const CHECK_JANK = path.join(__dirname, 'check-jank.js');

// ── argv ──────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const BOOL = new Set(['variants', 'marks', 'tolerate-unmeasured', 'help']);
const opts = new Map();
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith('--')) die(`unexpected positional '${a}' — jank-census takes flags only.`);
  const key = a.slice(2);
  if (BOOL.has(key)) { opts.set(key, true); continue; }
  if (!['only', 'jobs', 'family', 'out', 'md', 'host', 'render'].includes(key)) die(`unknown flag '${a}'.`);
  const v = argv[++i];
  if (v == null || v.startsWith('--')) die(`flag '${a}' needs a value.`);
  opts.set(key, v);
}

function die(msg) {
  console.error(`jank-census: ${msg}`);
  process.exit(2);
}

// EVERY PATH THIS TOOL READS OR WRITES FROM A FLAG GOES THROUGH HERE, and it is confined
// to the repository. `--out`, `--md` and `--render` come off argv and reach `writeFileSync`
// / `readFileSync` / `mkdirSync`, which is CodeQL's `js/path-injection` (high) and, less
// abstractly, one fat-fingered `--md /etc/hosts` away from writing somewhere it should not.
// Confinement rather than sanitisation: resolve first, then require the result to sit under
// ROOT, so `..` segments and absolute paths are both handled by the same check instead of by
// a stripping rule that has to be right about every spelling.
function inRepo(flag, value) {
  const resolved = path.resolve(ROOT, value);
  const rel = path.relative(ROOT, resolved);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    die(`--${flag} must stay inside the repository (got '${value}' -> '${resolved}'). `
      + 'Write to .scratch/ for a throwaway run.');
  }
  return resolved;
}

if (opts.get('help')) {
  console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].split('\n')
    .filter((l) => l.startsWith(' *')).map((l) => l.replace(/^ \*ic?/, '').replace(/^ \*/, '')).join('\n'));
  process.exit(0);
}

// RESOLVED AND CHECKED AT PARSE TIME, not at write time. A path the tool will refuse should
// be refused before it spends half a minute of Chromium renders earning a report it cannot
// save — and the eager check also means there is exactly one place these three flags become
// paths, rather than three call sites that each have to remember.
const OUT = opts.get('out') ? inRepo('out', opts.get('out')) : null;
const MD = opts.get('md') ? inRepo('md', opts.get('md')) : null;
const RENDER = opts.get('render') ? inRepo('render', opts.get('render')) : null;

const JOBS = Number(opts.get('jobs') ?? 3);
if (!Number.isFinite(JOBS) || JOBS < 1) die(`--jobs must be a positive number, got '${opts.get('jobs')}'.`);
// ALLOW-LISTED, NOT PASSED THROUGH. `--family` and `--host` both end up as ARGUMENTS to
// the `check-jank` child process, so an argv value reaching `spawn` unchecked is CodeQL's
// `js/command-line-injection` (high) — and, correctness aside, a typo'd family was
// previously forwarded to a child that would refuse it 24 renders later instead of here.
// Both sets are closed and known, so checking membership costs nothing and is the right
// behaviour anyway.
const FAMILY = (() => {
  const v = opts.get('family') || 'wide';
  if (!FAMILIES.includes(v)) die(`--family must be one of ${FAMILIES.join(' | ')}, got '${v}'.`);
  // Return the allow-listed element rather than the argv string. For a primitive this is a
  // no-op at RUNTIME — the safety is entirely the `includes` check above — but it is the
  // idiom taint analysis recognises as clearing the source. Said plainly because the earlier
  // comment here claimed a runtime guarantee it does not provide. (`MARK_HOST` below differs:
  // it genuinely re-reads the name off the catalog object.)
  return FAMILIES[FAMILIES.indexOf(v)];
})();
const WITH_VARIANTS = !!opts.get('variants');
const WITH_MARKS = !!opts.get('marks');
const MARK_HOST = (() => {
  const v = opts.get('host') || 'content';
  const known = catalog().find((c) => c.name === v);
  if (!known) die(`--host must be a catalog component, got '${v}'. It is the plain slide a `
    + 'section-level mark is hung on; `content` is the default because it draws no mark of its own.');
  return known.name;
})();
const ONLY = opts.get('only') ? new Set(opts.get('only').split(',').map((s) => s.trim())) : null;

// ── the work list ─────────────────────────────────────────────────────────
//
// Straight off the manifests, so the census cannot drift from the catalog: a component
// added tomorrow is swept tomorrow without anyone editing a list here.
function catalog() {
  const dirs = fs.readdirSync(path.join(ROOT, 'lib/components'), { withFileTypes: true })
    .filter((d) => d.isDirectory());
  const out = [];
  for (const bucket of dirs) {
    const bdir = path.join(ROOT, 'lib/components', bucket.name);
    for (const comp of fs.readdirSync(bdir, { withFileTypes: true })) {
      if (!comp.isDirectory()) continue;
      const mf = path.join(bdir, comp.name, `${comp.name}.manifest.json`);
      if (!fs.existsSync(mf)) continue;
      const m = JSON.parse(fs.readFileSync(mf, 'utf8'));
      const variants = Array.isArray(m.variants)
        ? m.variants.filter((v) => typeof v === 'string')
        : [];
      out.push({ bucket: bucket.name, name: m.name || comp.name, variants });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// ── the section-level marks ───────────────────────────────────────────────
//
// Read out of the BUILT BUNDLE rather than a list kept here, for the same reason the
// component list is read from the manifests: a mark added tomorrow is swept tomorrow.
// The catalog census cannot reach these — they are base MODIFIERS (`mark-orbit`,
// `stamp-seal`), not manifest variants — which is exactly how the archetype this whole
// tool exists for went unmeasured while 272 component classes were swept clean.
//
// A component's OWN class is excluded: the bookend rules are component chrome and are
// already covered by the catalog sweep under their own names.
//
// SO IS A CLASS THAT IS NEITHER, and getting that wrong produced the exact false clean this
// tool exists against. `form` is the Form WRAPPER every slide carries — not a component, so
// the catalog never covers it, and not a modifier, so appending it to a host does nothing.
// Its `::after` is the PAGE NUMBER (lib/forms/cell/pagination-right/pagination-right.css),
// which paints only under `paginate: true` front matter — something a `_class` string cannot
// supply. Swept as `content form` it therefore rendered no mark, produced no candidate, and
// landed in the committed table's "no placeable positioned mark" list: a clean bill for a
// section-level running mark that was never on the page. The pagination number is precisely
// the fixed-element-that-must-hold-position case #2005 was about.
// Listed here with its reason and reported as OUT OF REACH rather than swept, because a rig
// that cannot see something must say so rather than certify around it. Measuring it needs a
// front-matter register the class string has no way to reach (#2168).
const NOT_A_MODIFIER = Object.freeze({
  form: 'the Form wrapper class every slide carries, not a modifier. Its `::after` is the '
    + 'page number, which needs `paginate: true` front matter that a _class string cannot supply',
});

// A MODIFIER THAT PAINTS NOTHING ON ITS OWN NEEDS ITS COMPANION, or the census reports
// "none" for a mark that is simply not on the page — the false clean this whole tool is
// built against, reproduced one level up. `stamp-*` picks the SHAPE of a state marker; the
// LABEL and color come from the state class (`confidential`, `wip`, `draft`, …), so
// `content stamp-seal` really does draw nothing while `content confidential stamp-seal`
// draws a 98.8x98.8 seal. Measured both ways before this table existed.
// base.registers.docs.md § "The `stamp:` / `tone:` front-matter registers".
const MARK_COMPANIONS = Object.freeze([
  { prefix: 'stamp-', companion: 'confidential' },
]);

const companionFor = (mod) => MARK_COMPANIONS.find((c) => mod.startsWith(c.prefix))?.companion || null;

function sectionMarkModifiers(componentNames) {
  const bundle = path.join(ROOT, 'dist', 'lattice.css');
  if (!fs.existsSync(bundle)) {
    die(`--marks needs the built bundle at ${path.relative(ROOT, bundle)} — run \`npm run build\` first. `
      + 'Scanning the source sheets instead would miss whatever the build composes, which is '
      + 'the silent-miss this flag exists to close.');
  }
  const css = fs.readFileSync(bundle, 'utf8');
  const found = new Set();
  // BOUNDED REPETITION, on purpose. `[a-z0-9-]*` followed by a required `::` is the
  // polynomial-ReDoS shape CodeQL flags (js/polynomial-redos, high): the class is greedy,
  // so every failed match backtracks one character at a time, and `matchAll` retries from
  // every start position across a ~2MB bundle — O(n^2). A CSS identifier here is a
  // component or modifier name; the longest in the catalog is well under 40 characters, so
  // capping the run removes the backtracking class without changing what matches. This
  // repo has been bitten by the same query before, on regexes in new test helpers
  // (ci.yml's own note on #1689).
  for (const m of css.matchAll(/section\.([a-z][a-z0-9-]{0,63})::(?:before|after)\b/g)) {
    if (!componentNames.has(m[1])) found.add(m[1]);
  }
  const outOfReach = [...found].filter((n) => NOT_A_MODIFIER[n]).sort();
  return { modifiers: [...found].filter((n) => !NOT_A_MODIFIER[n]).sort(), outOfReach };
}

// AN UNKNOWN `--only` NAME IS A TYPO, NOT AN EMPTY SELECTION. Without this, `--only divder
// --marks` (one transposed letter) is satisfied by the mark classes alone, runs a full sweep,
// exits 0 and writes a table whose header implies it covered what you asked for. The guard
// existed and was switched off by the flag most likely to be used beside it.
if (ONLY && !(ONLY.has('none') && ONLY.size === 1)) {
  const known = new Set(catalog().map((c) => c.name));
  const unknown = [...ONLY].filter((n) => !known.has(n));
  if (unknown.length) {
    die(`--only names no such component: ${unknown.join(', ')}. Use \`--only none\` to sweep `
      + 'the section-level marks alone.');
  }
}

const components = ONLY?.has('none') && ONLY.size === 1
  // `--only none --marks` sweeps the section-level marks ALONE. Spelled as a real value
  // rather than left to an empty `--only`, which the flag parser rejects.
  ? []
  : catalog().filter((c) => !ONLY || ONLY.has(c.name));

const work = [];
const outOfReach = [];
if (WITH_MARKS) {
  const names = new Set(catalog().map((c) => c.name));
  const marks = sectionMarkModifiers(names);
  for (const mod of marks.modifiers) {
    const companion = companionFor(mod);
    const cls = companion ? `${MARK_HOST} ${companion} ${mod}` : `${MARK_HOST} ${mod}`;
    work.push({ component: MARK_HOST, bucket: 'base-modifier', variant: mod, cls });
  }
  for (const name of marks.outOfReach) outOfReach.push({ cls: name, reason: NOT_A_MODIFIER[name] });
}
for (const c of components) {
  work.push({ component: c.name, bucket: c.bucket, variant: null, cls: c.name });
  if (WITH_VARIANTS) {
    for (const v of c.variants) {
      work.push({ component: c.name, bucket: c.bucket, variant: v, cls: `${c.name} ${v}` });
    }
  }
}

// `--render` sweeps nothing by design, so an empty work list is not an error for it — and
// the flags it is normally copy-pasted beside (`--only none --marks`) made the guard fire on
// the documented re-render workflow.
if (!work.length && !RENDER) {
  die('nothing to sweep — no component matched, and --marks was not given.');
}

// ── run one ───────────────────────────────────────────────────────────────
//
// EVERY AXIS IS TRIED BEFORE A CLASS IS CALLED UNMEASURABLE, and the difference the
// retry buys is the difference between two very unlike sentences. check-jank's
// `--anchors` defaults to the heading sweep, and a component whose skeleton carries no
// heading (`quote`, `big-number`) refuses on it — which on one attempt reads as "the rig
// could not run here", i.e. maybe the flag was wrong. Trying `count` and `words` too
// turns it into a claim: this class cannot be swept on ANY axis this rig has, because it
// has neither a heading to grow nor an element builder to grow a collection. That is a
// hole in the instrument worth a ticket, not a bad invocation worth a retry.
const AXES = ['heading', 'count', 'words'];

// THE ONE PLACE A CLASS STRING BECOMES A CHILD-PROCESS ARGUMENT, and the barrier sits here
// rather than at each producer. `item.cls` is assembled from manifest `name` and `variants`
// fields — i.e. from `JSON.parse(fs.readFileSync(...))`, which is a taint source for
// `js/command-line-injection` (high) however trustworthy the tree looks today. A `_class`
// token is kebab-case by construction across all 69 manifests, so the check costs nothing
// and turns a malformed manifest into a loud failure here instead of an odd one 24 renders
// deep in a child.
const CLASS_TOKEN = /^[a-z][a-z0-9-]{0,63}$/;

function assertSweepable(cls) {
  const tokens = String(cls).split(' ').filter(Boolean);
  if (!tokens.length || !tokens.every((t) => CLASS_TOKEN.test(t))) {
    die(`refusing to sweep '${cls}' — a _class token must be kebab-case (a manifest name or `
      + 'variant is malformed). Nothing was rendered.');
  }
  return tokens.join(' ');
}

function sweep(item, axis) {
  return new Promise((resolve) => {
    const args = [CHECK_JANK, assertSweepable(item.cls), '--anchors', '--json', '--family', FAMILY];
    if (axis && axis !== 'heading') args.push('--axis', axis);
    const started = Date.now();
    const child = spawn(process.execPath, args, { cwd: ROOT });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => resolve({ ...item, ok: false, reason: `spawn failed: ${e.message}`, ms: Date.now() - started }));
    child.on('close', (code) => {
      const ms = Date.now() - started;
      if (code !== 0) {
        return resolve({ ...item, ok: false, code, reason: (err || out).trim().split('\n')[0] || `exit ${code}`, ms });
      }
      let parsed;
      try { parsed = JSON.parse(out); } catch {
        // A zero exit whose payload will not parse is the same hazard as exit 2 wearing a
        // friendlier face: there is no candidate list, so "none" would be a fabrication.
        return resolve({ ...item, ok: false, code, reason: `unparseable --json payload (${out.length} bytes)`, ms });
      }
      resolve({ ...item, ok: true, axis: axis || 'heading', candidates: parsed.candidates || [], ms });
    });
  });
}

async function sweepAnyAxis(item) {
  const refusals = [];
  for (const axis of AXES) {
    const r = await sweep(item, axis);
    if (r.ok) return r;
    refusals.push(`${axis}: ${r.reason}`);
    // A refusal that is not about the AXIS will repeat identically on the other two, so
    // there is nothing to learn from asking twice more (and two more Chromium launches
    // per broken class is what makes a census slow for no information).
    if (!/axis|heading|builder/i.test(r.reason)) break;
  }
  return { ...item, ok: false, reason: refusals.join(' | '), ms: 0 };
}

// ── pool ──────────────────────────────────────────────────────────────────
async function main() {
  if (RENDER) {
    if (!fs.existsSync(RENDER)) die(`--render: no census JSON at ${RENDER}.`);
    const saved = JSON.parse(fs.readFileSync(RENDER, 'utf8'));
    if (!MD) die('--render needs --md to say where the table goes.');
    fs.mkdirSync(path.dirname(MD), { recursive: true });
    fs.writeFileSync(MD, markdown(saved));
    console.log(`  re-rendered ${saved.totals.classes} classes from ${path.relative(ROOT, RENDER)} `
      + `→ ${path.relative(ROOT, MD)} (swept nothing; the measurements are ${saved.generated})`);
    return;
  }
  const results = [];
  let next = 0;
  let done = 0;
  const t0 = Date.now();
  const workers = Array.from({ length: Math.min(JOBS, work.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= work.length) return;
      const r = await sweepAnyAxis(work[i]);
      results[i] = r;
      done++;
      const pct = ((done / work.length) * 100).toFixed(0);
      const mark = r.ok ? (r.candidates.length ? `${r.candidates.length} cand` : 'none') : 'UNMEASURED';
      process.stderr.write(`  [${String(done).padStart(3)}/${work.length}] ${pct.padStart(3)}%  ${r.cls.padEnd(34)} ${mark}\n`);
    }
  });
  await Promise.all(workers);

  const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
  const measured = results.filter((r) => r.ok);
  const unmeasured = results.filter((r) => !r.ok);

  // Rank by the worst-moving candidate the class has. A class with no placeable
  // candidate is not ranked at all — there is nothing for `--anchor` to name.
  const ranked = measured
    .map((r) => {
      const worst = r.candidates.slice().sort((a, b) => b.drift - a.drift)[0];
      return { ...r, worst, worstDrift: worst ? worst.drift : null };
    })
    .filter((r) => r.candidates.length)
    .sort((a, b) => (b.worstDrift ?? -1) - (a.worstDrift ?? -1));

  const payload = {
    // THE COMMAND, AS ACTUALLY TYPED. The markdown used to print a reconstruction of it
    // from two of the flags, which omitted `--marks` — and `--marks` is the half of this
    // census that covers the running marks. A command in a generated doc is a claim like
    // any other number: echo the argv rather than rebuilding a plausible one.
    invocation: `node tools/jank-census.js ${process.argv.slice(2).join(' ')}`,
    family: FAMILY,
    axis: 'heading',
    generated: new Date().toISOString(),
    totals: {
      classes: work.length,
      measured: measured.length,
      unmeasured: unmeasured.length,
      withCandidates: ranked.length,
      movingOver2px: ranked.filter((r) => r.worstDrift > 2).length,
      elapsedSeconds: Number(elapsed),
    },
    ranked: ranked.map((r) => ({
      cls: r.cls, component: r.component, bucket: r.bucket, variant: r.variant,
      worst: r.worst, candidates: r.candidates,
    })),
    noCandidates: measured.filter((r) => !r.candidates.length).map((r) => r.cls),
    // Classes the discovery found and deliberately did NOT sweep, with why. Never folded
    // into `noCandidates`: "we did not look" and "we looked and there was nothing" are the
    // two sentences this whole tool exists to keep apart.
    outOfReach,
    unmeasured: unmeasured.map((r) => ({ cls: r.cls, reason: r.reason })),
  };

  if (OUT) {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`);
  }
  if (MD) {
    fs.mkdirSync(path.dirname(MD), { recursive: true });
    fs.writeFileSync(MD, markdown(payload));
  }

  console.log(`\n  jank census · ${FAMILY} · heading sweep · ${work.length} classes in ${elapsed}s\n`);
  console.log(`  ${'class'.padEnd(34)} ${'worst candidate'.padEnd(34)} ${'per'.padStart(4)} ${'moves'.padStart(9)}`);
  for (const r of ranked) {
    const flag = r.worstDrift > 2 && r.worst.per === 1 ? '  ← does not hold position' : '';
    console.log(`  ${r.cls.padEnd(34)} ${r.worst.sel.padEnd(34)} ${String(r.worst.per).padStart(4)} `
      + `${`${r.worstDrift}px`.padStart(9)}${flag}`);
  }
  console.log(`\n  ${payload.noCandidates.length} classes draw no positioned mark the walk can place.`);
  if (outOfReach.length) {
    console.log(`\n  OUT OF REACH — ${outOfReach.length} section-level class(es) this mode cannot sweep. NOT clean:`);
    for (const o of outOfReach) console.log(`    ${o.cls.padEnd(20)} ${o.reason}`);
  }
  if (unmeasured.length) {
    console.log(`\n  UNMEASURED — ${unmeasured.length} classes the rig could not sweep. These are NOT "clean":`);
    for (const u of unmeasured) console.log(`    ${u.cls.padEnd(34)} ${u.reason}`);
  }
  const hits = ranked.filter((r) => r.worstDrift > 2);
  if (hits.length) {
    console.log('\n  Re-sweep each mover for a VERDICT (--anchors alone cannot fail):');
    for (const r of hits.slice(0, 10)) {
      console.log(`    node tools/check-jank.js "${r.cls}" --anchor '${r.worst.sel}'`);
    }
  }

  if (unmeasured.length && !opts.get('tolerate-unmeasured')) process.exit(1);
}

// ESCAPE THE ESCAPE FIRST. Replacing `|` with `\|` and stopping there is CodeQL's
// `js/incomplete-sanitization` (high), and the failure is concrete rather than theoretical:
// an input that already contains `\|` comes out as `\\|`, which a GFM renderer reads as a
// literal backslash followed by an UNESCAPED cell delimiter — the exact character the
// escaping existed to neutralise, now splitting the row. Backslash first, then the pipe.
//
// Newlines are stripped rather than escaped because they cannot be escaped: a newline ends
// the table ROW, and check-jank's refusals are assembled from child-process stderr, which is
// free to contain one. `[\r\n]` and not `\r?\n`: a LONE carriage return is a line ending in
// GFM too, so the narrower pattern let a bare `\r` — exactly what an in-place progress
// spinner writes — split a row, which is this function's own defect surviving inside its own
// fix. `reason` is built with `.split('\n')`, which does not split on a lone `\r` either, so
// one really can reach here mid-string.
//
// Applied to EVERY interpolated cell, not just the one CodeQL pointed at. A CSS selector is
// as plausible a carrier as a reason string — `[lang|=en]` is a valid selector, and a pipe
// inside a code span still breaks a GFM table.
function mdCell(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/[\r\n]+/g, ' ');
}

function markdown(p) {
  const l = [];
  l.push(`<!-- generated by tools/jank-census.js — do not hand-edit -->`);
  l.push(`# Jank census — ${p.totals.classes} classes, ${p.family} family, heading axis`);
  l.push('');
  l.push(`Generated \`${p.generated}\` in ${p.totals.elapsedSeconds}s by:`);
  l.push('');
  l.push('```sh');
  l.push(p.invocation || 'node tools/jank-census.js --variants --marks');
  l.push('```');
  l.push('');
  l.push(`- **${p.totals.measured}** classes measured, **${p.totals.unmeasured}** unmeasurable.`);
  l.push(`- **${p.totals.withCandidates}** draw at least one positioned mark the walk can place.`);
  l.push(`- **${p.totals.movingOver2px}** have a mark that moves past the 2px sub-pixel floor.`);
  l.push('');
  l.push('`moves` is the spread of the selector\'s FIRST match across the sweep. A row here is a');
  l.push('LEAD, not a verdict: `--anchors` cannot fail a run. Re-sweep with `--anchor` for a verdict.');
  l.push('');
  l.push('| class | worst candidate | per | moves |');
  l.push('|---|---|---:|---:|');
  for (const r of p.ranked) {
    l.push(`| \`${mdCell(r.cls)}\` | \`${mdCell(r.worst.sel)}\` | ${mdCell(r.worst.per)} | ${mdCell(r.worst.drift)}px |`);
  }
  l.push('');
  if ((p.outOfReach || []).length) {
    l.push('## Out of reach for this mode');
    l.push('');
    l.push('Found by the discovery scan and deliberately **not** swept. These are **not** clean —');
    l.push('nothing was rendered. "We did not look" and "we looked and there was nothing" are the two');
    l.push('sentences this census exists to keep apart.');
    l.push('');
    l.push('| class | why |');
    l.push('|---|---|');
    for (const o of p.outOfReach) l.push(`| \`${mdCell(o.cls)}\` | ${mdCell(o.reason)} |`);
    l.push('');
  }
  l.push('## Classes with no placeable positioned mark');
  l.push('');
  l.push('Nothing for `--anchor` to name on this axis, at this family. Crowding and the overflow');
  l.push('probe still apply; so does a mark that only appears on content this sweep never built.');
  l.push('');
  l.push(p.noCandidates.map((c) => `\`${mdCell(c)}\``).join(', ') || '_none_');
  if (p.unmeasured.length) {
    l.push('');
    l.push('## UNMEASURED');
    l.push('');
    l.push('The rig could not sweep these. They are **not** clean — nothing was measured.');
    l.push('');
    l.push('| class | reason |');
    l.push('|---|---|');
    for (const u of p.unmeasured) l.push(`| \`${mdCell(u.cls)}\` | ${mdCell(u.reason)} |`);
  }
  l.push('');
  return l.join('\n');
}

// Exported for the unit test; the CLI still runs on direct invocation. `mdCell` is the
// piece worth pinning — it is a sanitiser, and a sanitiser nobody has watched fail is the
// same shape of decoration this PR's other two items are about.
if (require.main === module) main().catch((e) => die(e.stack || e.message));

module.exports = { mdCell };
