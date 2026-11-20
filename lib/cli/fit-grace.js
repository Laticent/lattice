/**
 * lib/cli/fit-grace.js — when a slide clips, find the smallest `claim` that makes it fit, by rendering it.
 *
 * WHY. Lattice's budgets are strict on purpose, and the engine reports an overflow rather than shrink a slide. What it
 * did not do was offer the author a way out. `claim-quiet` and `claim-hero` are that way out for a slide that is
 * slightly crammed: they give the content more of the frame (measured: +24px and +113px of stage at 1280x720, the same
 * on every layout) without cutting a word or shrinking a type size. The owner's call (2026-11-20,
 * engineering/decisions/2026-11-20-coda-and-marp-parity.md §9): suggest it, but only a suggestion that has been CHECKED.
 *
 * HOW. Two renders through the CLI, judged by the export's own verdict (`LATTICE_FIT_REPORT`, written next to the
 * export's OVERFLOW and CONTENT CLIPPED lines), so a suggestion can never disagree with the warning it answers:
 *   1. the deck at `fit: report` (no auto-split, so page N is slide N) finds the slides that clip;
 *   2. those slides alone, each twice, under `claim-quiet` and under `claim-hero`.
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

const ROOT = path.join(__dirname, '..', '..');
const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/;
const CLAIMS = ['claim-quiet', 'claim-hero'];

/** The deck split into its front matter (YAML body, '' when absent) and its slides, as the authoring cores read it. */
function deckParts(src) {
  const m = src.match(FRONT_MATTER);
  const chunks = splitTopLevel(src);
  return { yaml: m ? m[1] : '', slides: chunks.slice(m ? 2 : 0) };
}

/** Front matter with `fit: report` (no split, so page N is slide N) replacing any `fit:`/`guards:` line. */
function reportFrontMatter(yaml) {
  const kept = yaml.split('\n').filter((l) => !/^(fit|guards)\s*:/.test(l));
  return `---\n${[...kept, 'fit: report'].join('\n')}\n---\n\n`;
}

/** The slide's `_class:` directive: where it sits and its class text, or null. Scanned, not matched by a pattern. */
function classDirective(slide) {
  let at = slide.indexOf('<!--');
  while (at !== -1) {
    const end = slide.indexOf('-->', at + 4);
    if (end === -1) return null;
    const body = slide.slice(at + 4, end).trim();
    if (body.startsWith('_class:')) return { start: at, end: end + 3, cls: body.slice('_class:'.length).trim() };
    at = slide.indexOf('<!--', end + 3);
  }
  return null;
}

/** The slide's own class tokens (its `_class:` directive), or []. */
function slideClasses(slide) {
  const d = classDirective(slide);
  return d ? d.cls.split(/\s+/).filter(Boolean) : [];
}

/** The slide with `claim` added to its own `_class:` (or a new directive when it has none). */
function withClaim(slide, claim) {
  const d = classDirective(slide);
  if (d) return `${slide.slice(0, d.start)}<!-- _class: ${d.cls} ${claim} -->${slide.slice(d.end)}`;
  return `<!-- _class: ${claim} -->\n\n${slide.trim()}`;
}

/** Render `md` through the CLI and return the export's fit verdict. */
function verdict(md, palette, tmp, tag) {
  const deck = path.join(tmp, `${tag}.md`);
  const report = path.join(tmp, `${tag}.fit.json`);
  fs.writeFileSync(deck, md);
  const args = [path.join(ROOT, 'lattice.js'), deck, path.join(tmp, `${tag}.html`), ...(palette ? [palette] : []), '-q'];
  const r = spawnSync(process.execPath, args, { env: { ...process.env, LATTICE_FIT_REPORT: report, LATTICE_FIT_GRACE: 'off' }, encoding: 'utf8' });
  if (!fs.existsSync(report)) throw new Error(`the render wrote no fit report (exit ${r.status}): ${(r.stderr || '').split('\n').slice(-5).join(' ')}`);
  return JSON.parse(fs.readFileSync(report, 'utf8'));
}

/**
 * The grace plan for a deck source.
 * @returns {{ clipped: number[], footerOnly: number[], perSlide: {slide:number, claim:string|null, had:string|null}[],
 *             deck: string|null, skipped?: string }}
 */
function plan(src, { palette = null } = {}) {
  const { yaml, slides } = deckParts(src);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fit-grace-'));
  try {
    const fm = reportFrontMatter(yaml);
    const base = verdict(fm + slides.join('\n\n---\n\n') + '\n', palette, tmp, 'base');
    if (base.pages !== slides.length) {
      return { clipped: [], footerOnly: [], perSlide: [], deck: null,
        skipped: `the deck renders ${base.pages} pages from ${slides.length} slides (a \`split:\` rule divides it), so pages cannot be matched to slides` };
    }
    const clipped = [...new Set([...base.overflow, ...base.clipped])].sort((a, b) => a - b);
    if (!clipped.length) return { clipped, footerOnly: base.footerOnly, perSlide: [], deck: null };
    // Each clipped slide, under each claim it does not already carry. One render for all of them.
    const trials = [];
    for (const n of clipped) {
      const own = slideClasses(slides[n - 1]);
      for (const claim of CLAIMS) {
        if (own.includes(claim) || (claim === 'claim-quiet' && own.includes('claim-hero'))) continue;
        trials.push({ slide: n, claim, md: withClaim(slides[n - 1], claim) });
      }
    }
    const fits = new Map(clipped.map((n) => [n, []]));
    if (trials.length) {
      const v = verdict(fm + trials.map((t) => t.md).join('\n\n---\n\n') + '\n', palette, tmp, 'trials');
      const bad = new Set([...v.overflow, ...v.clipped]);
      trials.forEach((t, i) => { if (!bad.has(i + 1)) fits.get(t.slide).push(t.claim); });
    }
    const perSlide = clipped.map((n) => {
      const own = slideClasses(slides[n - 1]);
      return { slide: n, claim: CLAIMS.find((c) => fits.get(n).includes(c)) || null, had: CLAIMS.find((c) => own.includes(c)) || null };
    });
    // Deck-wide: three or more clipped slides, every one fixed by the same claim. Quiet first.
    let deck = null;
    // A deck-wide claim is suggested only when EVERY clipped slide was rendered under it and fit. A slide already
    // carrying the claim counts as tried (it clips with it, so the deck-wide claim does not fit it either).
    if (clipped.length >= 3) {
      const allFit = (claim) => clipped.every((n) => fits.get(n).includes(claim));
      if (allFit('claim-quiet')) deck = 'quiet';
      else if (allFit('claim-hero')) deck = 'hero';
    }
    return { clipped, footerOnly: base.footerOnly, perSlide, deck };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
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
    if (s.claim) out.push(`  ↳ grace: slide ${s.slide} fits with \`${s.claim}\` added to its \`_class:\` (checked by rendering).`);
    else out.push(`  ↳ grace: slide ${s.slide} still clips${s.had ? ` with \`${s.had}\`` : ''} under every claim; shorten it or split it.`);
  }
  return out.concat(footnote);
}

/** The command line (tools/fit-grace.js). */
function main(argv) {
  const json = argv.includes('--json');
  const [file, palette] = argv.filter((a) => !a.startsWith('--'));
  if (!file) { process.stderr.write('usage: node tools/fit-grace.js <deck.md> [palette] [--json]\n'); return 2; }
  const p = plan(fs.readFileSync(file, 'utf8'), { palette });
  if (json) process.stdout.write(JSON.stringify(p, null, 2) + '\n');
  else {
    const lines = describe(p);
    process.stdout.write((lines.length ? lines.join('\n') : `  fit-grace: nothing clips in ${path.basename(file)}.`) + '\n');
  }
  return 0;
}


module.exports = { plan, describe, main, withClaim, slideClasses, reportFrontMatter, deckParts };
