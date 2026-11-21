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
 *   2. the slides that still clip, each under `claim-quiet` and under `claim-hero`, carrying the running `class:`,
 *      `header:`, `footer:` and `paginate:` directives they inherit from earlier slides.
 * The trial decks are written next to the source deck, so its local images and stylesheets resolve as they do for the
 * export, and the export's `--css` is forwarded.
 * A slide whose only cut is the running footer is left out: dropping the footer would "fix" it without fitting anything.
 * When three or more slides clip and one deck-wide claim fixes every one of them, that is suggested instead, `quiet`
 * before `hero` (hero drops the header and footer on every slide).
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
const { slideSourceHidden } = require('../diagnostics/slice-equivalence-core.mjs');

const ROOT = path.join(__dirname, '..', '..');
const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/;
const CLAIMS = ['claim-quiet', 'claim-hero'];

/** The deck split into its front matter (YAML body, '' when absent) and its slides, as the authoring cores read it. */
function deckParts(src) {
  // A byte-order mark hides the front matter from the `^---` reader, and the trials then lost `size:` and `theme:`.
  src = String(src).replace(/^\uFEFF/, '');
  const m = src.match(FRONT_MATTER);
  const chunks = splitTopLevel(src);
  return { yaml: m ? m[1] : '', slides: chunks.slice(m ? 2 : 0) };
}

/** Front matter with `fit: report` (no split, so page N is slide N) replacing any `fit:`/`guards:` line. */
function reportFrontMatter(yaml) {
  const kept = yaml.split('\n').filter((l) => !/^(fit|guards)\s*:/.test(l));
  return `---\n${[...kept, 'fit: report'].join('\n')}\n---\n\n`;
}

/** Every `<!-- key: value -->` directive in a slide, in order, as { start, end, key, value }. Scanned, not matched by
 *  a pattern. `_key:` is a spot directive (this slide only); a bare `key:` runs on to the following slides (Marp). */
function directives(slide) {
  const out = [];
  slide = maskFences(slide);
  let at = slide.indexOf('<!--');
  while (at !== -1) {
    const end = slide.indexOf('-->', at + 4);
    if (end === -1) break;
    const body = slide.slice(at + 4, end).trim();
    const colon = body.indexOf(':');
    if (colon > 0 && !body.slice(0, colon).includes(' ')) out.push({ start: at, end: end + 3, key: body.slice(0, colon), value: body.slice(colon + 1).trim() });
    at = slide.indexOf('<!--', end + 3);
  }
  return out;
}

/** The slide with every fenced code block blanked out, same length and same line breaks, so a directive SHOWN in a
 *  code sample (a Marp tutorial slide) is not read as one and offsets still point into the real slide. */
function maskFences(slide) {
  let fence = null;
  return slide.split('\n').map((ln) => {
    const t = ln.trimStart();
    const mark = t.startsWith('```') ? '```' : t.startsWith('~~~') ? '~~~' : null;
    if (fence) { if (mark === fence) fence = null; return ' '.repeat(ln.length); }
    if (mark && ln.length - t.length <= 3) { fence = mark; return ' '.repeat(ln.length); }
    return ln;
  }).join('\n');
}

/** The slide's own `_class:` directive: where it sits and its class text, or null. */
function classDirective(slide) {
  const d = directives(slide).find((x) => x.key === '_class');
  return d ? { start: d.start, end: d.end, cls: d.value } : null;
}

/** The slide's own class tokens (its `_class:` directive), or []. */
function slideClasses(slide) {
  const d = classDirective(slide);
  return d ? d.cls.split(/\s+/).filter(Boolean) : [];
}

/** The running directives each slide inherits: for slide i, the last bare `class:`, `header:`, `footer:` and
 *  `paginate:` set on slides 0..i (its own included). A trial deck holds only the clipped slides, so it must carry them. */
const RUNNING = ['class', 'header', 'footer', 'paginate'];
function inheritedDirectives(slides) {
  const run = {};
  return slides.map((sl) => {
    for (const d of directives(sl)) if (RUNNING.includes(d.key)) run[d.key] = d.value;
    return { ...run };
  });
}

/** The slide with `claim` added to the class it renders with. Its own `_class:` gains the token; without one, a spot
 *  `_class:` repeats the running `class:` it inherits (a spot class REPLACES it on that slide, so a bare claim would
 *  drop the layout). */
function withClaim(slide, claim, inheritedClass = '') {
  const d = classDirective(slide);
  if (d) return `${slide.slice(0, d.start)}<!-- _class: ${d.cls} ${claim} -->${slide.slice(d.end)}`;
  return `<!-- _class: ${[inheritedClass, claim].filter(Boolean).join(' ')} -->\n\n${slide.trim()}`;
}

/** A slide as it renders on its own: the running directives it inherits, made spot directives, ahead of it. */
function standalone(slide, inherited) {
  const own = new Set(directives(slide).map((d) => d.key));
  const lead = RUNNING.filter((k) => k !== 'class' && inherited[k] != null && !own.has(k) && !own.has(`_${k}`))
    .map((k) => `<!-- _${k}: ${inherited[k]} -->`);
  return lead.length ? `${lead.join('\n')}\n\n${slide.trim()}` : slide;
}

/** Render `md` through the CLI and return the export's fit verdict. The deck is written into `dir` (the source deck's
 *  folder), so its relative images and stylesheets resolve as they do for the export. */
function verdict(md, { palette, dir, args = [] }, tag) {
  const base = path.join(dir, `.fit-grace-${process.pid}-${tag}`);
  const deck = `${base}.md`;
  const report = `${base}.fit.json`;
  const out = `${base}.html`;
  fs.writeFileSync(deck, md);
  live.add(base);
  try {
    const cli = [path.join(ROOT, 'lattice.js'), deck, out, ...(palette ? [palette] : []), ...args, '-q'];
    const r = spawnSync(process.execPath, cli, { env: { ...process.env, LATTICE_FIT_REPORT: report, LATTICE_FIT_GRACE: 'off' }, encoding: 'utf8' });
    if (!fs.existsSync(report)) throw new Error(`the render wrote no fit report (exit ${r.status}): ${(r.stderr || '').split('\n').slice(-5).join(' ')}`);
    return JSON.parse(fs.readFileSync(report, 'utf8'));
  } finally {
    for (const f of [deck, report, out]) fs.rmSync(f, { force: true });
    live.delete(base);
  }
}

/** The trial files on disk right now. The trials sit next to the author's deck, so an interrupted export (Ctrl-C, a
 *  killed CI job) must not leave `.fit-grace-*` files there: `finally` does not run on a signal, this does. */
const live = new Set();
function sweep() {
  for (const base of live) for (const ext of ['.md', '.fit.json', '.html']) fs.rmSync(`${base}${ext}`, { force: true });
  live.clear();
}
function onSignal(sig) {
  sweep();
  process.removeListener('SIGINT', onSignal);
  process.removeListener('SIGTERM', onSignal);
  process.kill(process.pid, sig);
}

const bad = (v) => new Set([...v.overflow, ...v.clipped]);

/** The export's options that change how a slide lays out, taken from its own argv so a trial renders the way the
 *  export did: `--size`, `--packages`, `--disable-plugin`, `--default-plugins`, `--no-split` and `--css`. Both
 *  `--flag value` and `--flag=value`; path values made absolute, since the trial runs from another folder. */
const LAYOUT_VALUE = { '--size': false, '--packages': true, '--disable-plugin': false, '--default-plugins': false, '--css': true, '-c': true };
const LAYOUT_SWITCH = new Set(['--no-split']);
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
  const inherited = inheritedDirectives(slides);
  // The export passes the verdict it just printed, so the advice answers exactly that warning and costs one render
  // less. On its own (`npm run fit:grace`, `lint:deck --fit`) the deck is rendered as written.
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  try {
    return planWith(slides, yaml, fm, inherited, opts, exportVerdict || verdict(src, opts, 'deck'));
  } finally {
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
  }
}

function planWith(slides, yaml, fm, inherited, opts, asWritten) {
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
      if (bad(verdict(fm + standalone(slides[n - 1], inherited[n - 1]) + '\n', opts, `alone-${n}`)).size) clipped.push(n);
    }
  }
  if (!clipped.length) return { clipped, footerOnly, perSlide: [], deck: null };
  // Each clipped slide, under each claim it does not already carry, as it renders on its own. One render for all.
  const trials = [];
  // A slide the author marked `claim-framed` chose the framed stage; grace suggests no claim there, as lint does not.
  const framed = (n) => slideClasses(slides[n - 1]).includes('claim-framed');
  for (const n of clipped) {
    if (framed(n)) continue;
    const own = slideClasses(slides[n - 1]);
    for (const claim of CLAIMS) {
      if (own.includes(claim) || (claim === 'claim-quiet' && own.includes('claim-hero'))) continue;
      const md = withClaim(standalone(slides[n - 1], inherited[n - 1]), claim, inherited[n - 1].class || '');
      trials.push({ slide: n, claim, md });
    }
  }
  const fits = new Map(clipped.map((n) => [n, []]));
  if (trials.length) {
    const v = bad(verdict(reportFrontMatter(yaml) + trials.map((t) => t.md).join('\n\n---\n\n') + '\n', opts, 'trials'));
    trials.forEach((t, i) => { if (!v.has(i + 1)) fits.get(t.slide).push(t.claim); });
  }
  const perSlide = clipped.map((n) => {
    const own = slideClasses(slides[n - 1]);
    const claim = CLAIMS.find((c) => fits.get(n).includes(c)) || null;
    // What to write: the slide's own `_class:` gains the token; without one, the spot class must repeat the running one.
    const write = claim && !classDirective(slides[n - 1]) && inherited[n - 1].class ? `<!-- _class: ${inherited[n - 1].class} ${claim} -->` : null;
    return { slide: n, claim, had: CLAIMS.find((c) => own.includes(c)) || null, ...(write ? { write } : {}), ...(framed(n) ? { framed: true } : {}) };
  });
  // Deck-wide: three or more clipped slides, every one fixed by the same claim. Quiet first. A slide already carrying
  // the claim counts as tried (it clips with it, so the deck-wide claim does not fit it either).
  let deck = null;
  if (clipped.length >= 3) {
    const allFit = (claim) => clipped.every((n) => fits.get(n).includes(claim));
    if (allFit('claim-quiet')) deck = 'quiet';
    else if (allFit('claim-hero')) deck = 'hero';
  }
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
    out.push(p.deck === 'quiet'
      ? '    It tones the header and footer down on every slide and keeps them.'
      : '    It drops the header and footer on every slide.');
    out.push('    Or, slide by slide:');
  }
  for (const s of p.perSlide) {
    if (s.framed) out.push(`  ↳ grace: slide ${s.slide} clips; it is marked \`claim-framed\`, so no claim is suggested. Shorten it or split it.`);
    else if (s.claim && s.write) out.push(`  ↳ grace: slide ${s.slide} fits with \`${s.write}\` (checked by rendering).`);
    else if (s.claim) out.push(`  ↳ grace: slide ${s.slide} fits with \`${s.claim}\` added to its \`_class:\` (checked by rendering).`);
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


module.exports = { maskFences, plan, describe, main, withClaim, slideClasses, reportFrontMatter, deckParts, inheritedDirectives, standalone, layoutArgs };
