/**
 * lib/cli/fit-grace.js — when a slide clips, find the smallest `claim` that makes it fit, by rendering it.
 *
 * WHY. Lattice's budgets are strict on purpose, and the engine reports an overflow rather than shrink a slide. What it
 * did not do was offer the author a way out. `claim-quiet` and `claim-hero` are that way out for a slide that is
 * slightly crammed: they give the content more of the frame (measured: +24px and +113px of stage at 1280x720, the same
 * on every layout) without cutting a word or shrinking a type size. The owner's call (2026-11-20,
 * engineering/decisions/2026-11-20-coda-and-marp-parity.md §9): suggest it, but only a suggestion that has been CHECKED.
 *
 * HOW. Renders through the CLI, judged by the export's own verdict (`LATTICE_FIT_REPORT`, written next to the
 * export's OVERFLOW and CONTENT CLIPPED lines):
 *   1. the deck as written. When it renders one page per slide, page N is slide N and its verdict is the export's.
 *      When the engine split a slide (`fit: heal`), pages no longer map to slides, so the deck is rendered again at
 *      `fit: report` to find the candidates, and each candidate is re-checked ALONE at the deck's own `fit:` level:
 *      one the engine already healed is dropped, so grace never answers a warning the export did not give.
 *   2. the slides that still clip, each under `claim-quiet` and under `claim-hero`, carrying the running state they
 *      inherit from earlier slides (`synthesizePrelude`, the Studio's slice route), in either directive spelling.
 * The trial decks are written next to the source deck, so its local images and stylesheets resolve as they do for the
 * export, and the export's `--css` is forwarded.
 * A slide whose only cut is the running footer is left out: dropping the footer would "fix" it without fitting anything.
 * When three or more slides clip and one deck-wide `claim: quiet` fixes every one of them, that is suggested first.
 * Never a deck-wide `claim: hero`: it drops the header and footer on every slide (owner, D1 on #3362).
 *
 * Callers: the CLI export (lattice.js, under its OVERFLOW / CONTENT CLIPPED lines) and `npm run fit:grace`
 * (tools/fit-grace.js). It advises; it never gates.
 */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { splitTopLevel } = require('../authoring/slide-split');
const { slideSourceHidden, synthesizePrelude } = require('../diagnostics/slice-equivalence-core.mjs');
const { slideClassDirectives } = require('../core/class-directive-scan.mjs');
const { readRecord } = require('../core/meta-door.mjs');
const { recordValue } = require('../authoring/meta-migrate.mjs');
const { frontMatterFence } = require('../core/front-matter-fence.mjs');
const { normalizeSourceText } = require('../core/slide-boundaries.mjs');
const DIRECTIVES = require('../engine/directives.js');
// The engine's own directive vocabulary, which `synthesizePrelude` needs to rebuild what a slide inherits.
const PRELUDE_VOCAB = { known: DIRECTIVES.KNOWN_DIRECTIVES, flags: DIRECTIVES.FLAG_DIRECTIVES, slide: DIRECTIVES.SLIDE_ONLY_DIRECTIVES };

const ROOT = path.join(__dirname, '..', '..');
const CLAIMS = ['claim-quiet', 'claim-hero'];

/** The deck split into its front matter (YAML body, '' when absent) and its slides, as the authoring cores read it. */
function deckParts(src) {
  // One normalization for BOTH readers below: a byte-order mark hid the front matter from the `^---` reader (the trials
  // lost `size:` and `theme:`), and a bare-CR deck had its front matter found by the fence but not by `splitTopLevel`,
  // so dropping two chunks left no slides (review of #3362). LF from here on, as the engine reads it.
  src = normalizeSourceText(String(src));
  const yaml = frontMatter(src);
  const chunks = splitTopLevel(src);
  return { yaml: yaml ?? '', slides: chunks.slice(yaml == null ? 0 : 2) };
}

/** The YAML of a deck's front matter, or null when it opens with none: the engine's own fence
 *  (lib/core/front-matter-fence.mjs), so LF, CRLF and a bare CR all read as the engine reads them. */
function frontMatter(src) {
  const f = frontMatterFence(src);
  return f ? normalizeSourceText(src.slice(f.yamlFrom, f.yamlTo)) : null;
}

/** Front matter with `fit: report` (no split, so page N is slide N) replacing any `fit:` line. (`guards:` is retired and
 *  the engine no longer reads it, so it can stay.) */
function reportFrontMatter(yaml) {
  const kept = yaml.split('\n').filter((l) => !(l.startsWith('fit') && l.slice(3).trimStart().startsWith(':')));
  return `---\n${[...kept, 'fit: report'].join('\n')}\n---\n\n`;
}

/** The class a slide renders with, read the way the engine reads it: a `@meta` record or a directive comment, its own
 *  spot class or a running one before it in `text` (lib/core/class-directive-scan.mjs). '' when none. */
function classInForce(text) {
  const all = slideClassDirectives(text);
  return all.length ? all[all.length - 1].payload : '';
}

/** The slide's own class tokens (read from the slide alone, so a running class from earlier slides is not counted). */
function slideClasses(slide) {
  return classInForce(slide).split(/\s+/).filter(Boolean);
}

/** True when the slide sets its class for itself alone (a spot `_class:` comment or a record without `carry`). A class
 *  from a running directive, even one written on this slide, is not: a claim added there would run on to every later
 *  slide, so the advice is a spot record instead. */
function hasSpotClass(slide) {
  const all = slideClassDirectives(slide);
  const d = all[all.length - 1];
  if (!d || !d.payload) return false;
  // The winning directive's comment, read by the engine's own record reader: a record is spot unless it says `carry`
  // (the short `<!-- {…} -->` form and a quoted value with commas included); a comment is spot when it is `_class:`.
  const t = d.text.trim();
  const body = t.startsWith('<!--') && t.endsWith('-->') ? t.slice(4, -3) : t;
  const rec = readRecord(body);
  return rec ? !rec.carry : body.trim().startsWith('_class');
}

/** A slide record for a class, written the way `lattice migrate meta` writes one: the first word as `layout`, the rest as
 *  `class` (the same shape as lint-core's `slideRecord`). */
function classRecord(tokens) {
  const [first, ...rest] = tokens;
  if (!first) return '<!-- @meta{} -->';
  const more = rest.length ? `, class=${recordValue(rest.join(' '))}` : '';
  return `<!-- @meta{layout=${recordValue(first)}${more}} -->`;
}

/** The slide with `claim` added to the class it renders with: one spot record at its end carrying the whole class plus
 *  the claim. The last class directive on a slide wins, in either spelling, so the record replaces whatever set the class
 *  before it without editing it; a running class the slide inherits is repeated, because a spot class REPLACES it. */
function withClaim(slide, claim) {
  return `${slide.trimEnd()}\n\n${classRecord([...classInForce(slide).split(/\s+/).filter(Boolean), claim])}\n`;
}

/** Slide `k` as it renders on its own: behind the running state it inherits from the slides before it, rebuilt by the
 *  same `synthesizePrelude` the Studio's slice route uses, in both spellings. (Since the meta sweep a `header:` or
 *  `footer:` comment sets only its own slide, so the front matter is what carries them, and the trial deck keeps it.)
 *  The running CLASS is taken from the engine-accurate reader instead: the prelude reads every comment outside a fence,
 *  so a `<!-- class: kpi -->` quoted in inline code or a paragraph on an earlier slide became a phantom running class
 *  and the trial rendered a layout the deck does not have (checker on PR 3362). It goes in as a spot record, so it
 *  cannot run on into the next trial of a joined trial deck either. */
function standalone(slides, k) {
  const prelude = synthesizePrelude(slides, k, PRELUDE_VOCAB)
    .split('\n').filter((line) => line.trim() && !setsClass(line)).join('\n');
  const own = classInForce(slides[k]);
  const entries = slideClassDirectives(slides.join('\n\n---\n\n'));
  const running = own ? '' : (entries[k]?.payload || '');
  const lead = [prelude, running ? classRecord(running.split(/\s+/).filter(Boolean)) : ''].filter(Boolean).join('\n');
  return lead ? `${lead}\n\n${slides[k].trim()}` : slides[k];
}

/** True when a prelude line (one directive comment) sets the class. */
function setsClass(line) {
  const t = line.trim();
  const body = t.startsWith('<!--') && t.endsWith('-->') ? t.slice(4, -3) : t;
  const rec = readRecord(body);
  return rec ? Object.hasOwn(rec.d, 'class') : body.trim().startsWith('class:');
}

/** Render `md` through the CLI and return the export's fit verdict. The deck is written into `dir` (the source deck's
 *  folder), so its relative images and stylesheets resolve as they do for the export. */
function verdict(md, { palette, dir, args = [] }, tag) {
  const base = path.join(dir, `.fit-grace-${process.pid}-${tag}`);
  const deck = `${base}.md`;
  const report = `${base}.fit.json`;
  const out = `${base}.html`;
  fs.writeFileSync(deck, md);
  try {
    const cli = [path.join(ROOT, 'lattice.js'), deck, out, ...(palette ? [palette] : []), ...args, '-q'];
    const r = spawnSync(process.execPath, cli, { env: { ...process.env, LATTICE_FIT_REPORT: report, LATTICE_FIT_GRACE: 'off', LATTICE_FIT_GRACE_PARENT: String(process.pid) }, encoding: 'utf8' });
    if (!fs.existsSync(report)) throw new Error(`the render wrote no fit report (exit ${r.status}): ${(r.stderr || '').split('\n').slice(-5).join(' ')}`);
    return JSON.parse(fs.readFileSync(report, 'utf8'));
  } finally {
    for (const f of [deck, report, out]) fs.rmSync(f, { force: true });
  }
}

/** Grace installs no signal handler. A trial blocks the event loop (`spawnSync`), so a handler could not run until the
 *  trials were done, and Node drops a signal still queued when the process ends: an interrupted export carried on and
 *  exited 0 (checker on PR 3362). With no handler, Ctrl-C or SIGTERM ends the export at once, as it did before grace.
 *  The trial render dies with it (`watchParent`), but a killed run can leave its trial deck beside the author's, so each
 *  run first removes any whose process is gone. A file name carries its process id: `.fit-grace-<pid>-<tag>.<ext>`. */
function sweepStale(dir) {
  let names;
  try { names = fs.readdirSync(dir); } catch { return; }
  for (const name of names) {
    if (!name.startsWith('.fit-grace-') || !['.md', '.fit.json', '.html'].some((ext) => name.endsWith(ext))) continue;
    const rest = name.slice('.fit-grace-'.length);
    const dash = rest.indexOf('-');
    const pid = dash > 0 && [...rest.slice(0, dash)].every((c) => c >= '0' && c <= '9') ? Number(rest.slice(0, dash)) : NaN;
    if (!pid || pid === process.pid || alive(pid)) continue;
    fs.rmSync(path.join(dir, name), { force: true });
  }
}
function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

/** A trial render ends when the export that started it is gone. Ctrl-C reaches the whole process group, but a SIGTERM
 *  sent to the export alone (`kill <pid>`, a supervisor) does not reach the trial, which kept rendering and wrote its
 *  `.fit-grace-*.html` beside the deck after the export had died (checker on PR 3362). The trial is told its parent's
 *  pid and exits once its parent changes, which on Linux and macOS is what an orphan sees. A no-op in any other run. */
function watchParent(env = process.env) {
  const parent = Number(env.LATTICE_FIT_GRACE_PARENT);
  if (!parent) return null;
  const check = () => { if (process.ppid !== parent) process.exit(143); };
  check();
  const t = setInterval(check, 250);
  t.unref();
  return t;
}

const bad = (v) => new Set([...v.overflow, ...v.clipped]);

/** Is this a CI run? Grace is skipped there (owner's D3). `CI` set to anything but an empty string, `false` or `0`, so
 *  a machine that exports `CI=false` still gets the advice. */
function inCI(env = process.env) {
  const v = String(env.CI ?? '').trim().toLowerCase();
  return v !== '' && v !== 'false' && v !== '0';
}

/** The export's options that change how a slide lays out, taken from its own argv so a trial renders the way the
 *  export did: `--size`, `--packages`, `--disable-plugin`, `--default-plugins`, `--no-split`, `--allow-remote` and `--css`. Both
 *  `--flag value` and `--flag=value`; path values made absolute, since the trial runs from another folder. */
const LAYOUT_VALUE = { '--size': false, '--packages': true, '--disable-plugin': false, '--default-plugins': false, '--css': true, '-c': true };
// `--allow-remote` decides whether remote images load, and an image that loads can change what fits.
const LAYOUT_SWITCH = new Set(['--no-split', '--allow-remote']);
function layoutArgs(argv, cwd = process.cwd()) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (LAYOUT_SWITCH.has(a)) { out.push(a); continue; }
    const eq = a.indexOf('=');
    const flag = eq > 0 ? a.slice(0, eq) : a;
    if (!Object.hasOwn(LAYOUT_VALUE, flag)) continue;
    const value = eq > 0 ? a.slice(eq + 1) : argv[++i];
    if (value === undefined) continue;
    out.push(flag === '-c' ? '--css' : flag, LAYOUT_VALUE[flag] ? path.resolve(cwd, value) : value);
  }
  return out;
}

/**
 * The grace plan for a deck source.
 * @returns {{ clipped: number[], footerOnly: number[], perSlide: {slide:number, claim:string|null, had:string|null}[],
 *             deck: string|null, skipped?: string }}
 */
function plan(src, { palette = null, dir = os.tmpdir(), args = [], exportVerdict = null } = {}) {
  src = String(src).replace(/^\uFEFF/, '');
  const { yaml, slides } = deckParts(src);
  const opts = { palette, dir, args };
  const fm = yaml ? `---\n${yaml}\n---\n\n` : '';
  // The export passes the verdict it just printed, so the advice answers exactly that warning and costs one render
  // less. On its own (`npm run fit:grace`, `lint:deck --fit`) the deck is rendered as written.
  sweepStale(dir);
  return planWith(slides, yaml, fm, opts, exportVerdict || verdict(src, opts, 'deck'));
}

function planWith(slides, yaml, fm, opts, asWritten) {
  // A hidden slide renders no page, so pages map onto the SHOWN slides: page N is the Nth shown slide. Matching pages to
  // ALL slides by count named the wrong slide when hidden slides and a split happened to cancel out (red team, #3362).
  const shown = slides.map((sl, i) => (slideSourceHidden(sl) ? -1 : i + 1)).filter((n) => n > 0);
  const toSlides = (pages) => [...pages].map((pg) => shown[pg - 1]).filter(Boolean).sort((a, b) => a - b);
  let clipped;
  let footerOnly;
  if (asWritten.pages === shown.length) {
    // One page per shown slide: the export's own verdict, slide for slide.
    clipped = toSlides(bad(asWritten));
    footerOnly = asWritten.footerOnly;
  } else {
    // The engine split something, so pages no longer map to slides. Find the candidates at `fit: report`, then keep
    // only those that still clip ALONE at the deck's own level: one the engine healed raised no warning to answer.
    const report = verdict(reportFrontMatter(yaml) + slides.join('\n\n---\n\n') + '\n', opts, 'report');
    if (report.pages !== shown.length) {
      return { clipped: [], footerOnly: [], perSlide: [], deck: null,
        skipped: `the deck renders ${report.pages} pages from ${shown.length} shown slides even at \`fit: report\`, so pages cannot be matched to slides` };
    }
    footerOnly = report.footerOnly;
    clipped = [];
    for (const n of toSlides(bad(report))) {
      if (bad(verdict(fm + standalone(slides, n - 1) + '\n', opts, `alone-${n}`)).size) clipped.push(n);
    }
  }
  if (!clipped.length) return { clipped, footerOnly, perSlide: [], deck: null };
  // Each clipped slide, under each claim it does not already carry, as it renders on its own. One render for all.
  const trials = [];
  // A slide the author marked `claim-framed` chose the framed stage; grace suggests no claim there, as lint does not.
  // Both read the class the slide renders with, so a claim inherited through a running class counts too.
  const inForceOf = (n) => classInForce(standalone(slides, n - 1)).split(/\s+/).filter(Boolean);
  const framed = (n) => inForceOf(n).includes('claim-framed');
  for (const n of clipped) {
    if (framed(n)) continue;
    const own = inForceOf(n);
    for (const claim of CLAIMS) {
      if (own.includes(claim) || (claim === 'claim-quiet' && own.includes('claim-hero'))) continue;
      const md = withClaim(standalone(slides, n - 1), claim);
      trials.push({ slide: n, claim, md });
    }
  }
  const fits = new Map(clipped.map((n) => [n, []]));
  if (trials.length) {
    const v = bad(verdict(reportFrontMatter(yaml) + trials.map((t) => t.md).join('\n\n---\n\n') + '\n', opts, 'trials'));
    trials.forEach((t, i) => { if (!v.has(i + 1)) fits.get(t.slide).push(t.claim); });
  }
  const perSlide = clipped.map((n) => {
    const own = inForceOf(n);
    const claim = CLAIMS.find((c) => fits.get(n).includes(c)) || null;
    // What to write: a slide with its own class gains the token there; one that takes a running class needs its own
    // record, repeating that class, because a spot class replaces the running one on its slide.
    const inForce = classInForce(standalone(slides, n - 1)).split(/\s+/).filter(Boolean);
    const write = claim && !hasSpotClass(slides[n - 1]) && inForce.length ? classRecord([...inForce, claim]) : null;
    return { slide: n, claim, had: CLAIMS.find((c) => own.includes(c)) || null, ...(write ? { write } : {}), ...(framed(n) ? { framed: true } : {}) };
  });
  // Deck-wide: three or more clipped slides, every one fixed by `claim-quiet`. QUIET ONLY (owner, D1 on #3362,
  // 2026-11-21): a deck-wide `claim: hero` drops the header and footer, page numbers and a confidentiality line
  // included, on every slide, and only the clipped ones were checked, so `hero` is offered slide by slide and never
  // for the whole deck. A slide already carrying `claim-quiet` counts as tried (it clips with it).
  let deck = null;
  if (clipped.length >= 3 && clipped.every((n) => fits.get(n).includes('claim-quiet'))) deck = 'quiet';
  return { clipped, footerOnly, perSlide, deck };
}

/** The plan as the lines an author reads (the export prints these under its overflow warnings). */
function describe(p) {
  const out = [];
  if (p.skipped) { out.push(`  ↳ grace: not checked; ${p.skipped}.`); return out; }
  if (!p.perSlide.length) return out;
  const footnote = p.footerOnly?.length
    ? [`    (Not counted: page${p.footerOnly.length > 1 ? 's' : ''} ${p.footerOnly.join(', ')}, where only the running footer is cut. A claim that drops the footer is not a fix for that; shorten the footer.)`]
    : [];
  if (p.deck) {
    out.push(`  ↳ grace: \`claim: ${p.deck}\` in the front matter fits all ${p.perSlide.length} clipped slides (checked by rendering).`);
    out.push('    It tones the header and footer down on every slide and keeps them.');
    out.push('    Or, slide by slide:');
  }
  for (const s of p.perSlide) {
    if (s.framed) out.push(`  ↳ grace: slide ${s.slide} clips; it is marked \`claim-framed\`, so no claim is suggested. Shorten it or split it.`);
    else if (s.claim && s.write) out.push(`  ↳ grace: slide ${s.slide} fits with \`${s.write}\` (checked by rendering).`);
    else if (s.claim) out.push(`  ↳ grace: slide ${s.slide} fits with \`${s.claim}\` added to its class (checked by rendering).`);
    else out.push(`  ↳ grace: slide ${s.slide} still clips${s.had ? ` with \`${s.had}\`` : ''} under every claim; shorten it or split it.`);
  }
  return out.concat(footnote);
}

/** The command line (tools/fit-grace.js). */
function main(argv) {
  const json = argv.includes('--json');
  const [file, palette] = argv.filter((a) => !a.startsWith('--'));
  if (!file) { process.stderr.write('usage: node tools/fit-grace.js <deck.md> [palette] [--json]\n'); return 2; }
  const p = plan(fs.readFileSync(file, 'utf8'), { palette, dir: path.dirname(path.resolve(file)) });
  if (json) process.stdout.write(JSON.stringify(p, null, 2) + '\n');
  else {
    const lines = describe(p);
    process.stdout.write((lines.length ? lines.join('\n') : `  fit-grace: nothing clips in ${path.basename(file)}.`) + '\n');
  }
  return 0;
}


module.exports = { plan, describe, main, withClaim, slideClasses, classInForce, classRecord, hasSpotClass, reportFrontMatter, deckParts, standalone, layoutArgs, inCI, sweepStale, watchParent };
