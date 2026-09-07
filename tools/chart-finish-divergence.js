#!/usr/bin/env node
/**
 * chart-finish-divergence — do two chart finishes actually LOOK different, and
 * on which members?
 *
 * A "finish" is a named look an author selects in front matter. The whole
 * proposition fails if two of them render the same chart the same way: that is
 * not a family of finishes, it is one finish with several names. The failure is
 * easy to ship and nearly impossible to catch by eye, because a finish that
 * misses a member does not error — its selectors simply match nothing and the
 * member renders exactly as before. Two rounds of this design were lost to it:
 * four finishes that varied furniture opacity and corner radius, and then three
 * that varied mark body depth through `[data-cat]`, an attribute most of the
 * family does not emit.
 *
 * So this renders one deck once per (variant x theme), slices it per slide,
 * and reports, per member and per variant PAIR:
 *
 *   mean    mean absolute channel difference, 0-255, over the whole slide
 *   moved   percent of pixels that changed by more than ~3%, which is the
 *           number that answers "would a reader notice"
 *
 * A pair whose `moved` is under --threshold on a member is reported as
 * IDENTICAL there. That list is the deliverable: it names exactly which member
 * a finish fails to reach, which is the thing prose about the design cannot
 * tell you and a contact sheet hides.
 *
 * Pair with the KEYING arm of `chart-language-census.js` — divergence says
 * WHERE a finish failed to land, keying says WHY (the member keys its marks on
 * data-mark or data-s or nothing, so a rule written against data-cat never
 * matched).
 *
 * A diagnostic, not a gate. There is no correct divergence: a finish MAY
 * legitimately leave a member alone (radar keeps its alpha under every finish,
 * by decision). What it refuses to let you do is believe a finish reaches a
 * member it does not.
 *
 * Usage:
 *   node tools/chart-finish-divergence.js [deck.md] \
 *     --variant pigment=path/to/pigment.css --variant etching=path/to/etching.css \
 *     [--theme indaco] [--dark] [--threshold 0.5] [--json out.json]
 *
 * A baseline (no injected CSS) is always included, so `base>pigment` tells you
 * how far the default finish moves from what ships today.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '..');
const DEFAULT_DECK = path.join(REPO, 'lib/components/chart/chart.gallery.md');

function parseArgs(argv) {
  const out = { deck: DEFAULT_DECK, variants: [], themes: [], dark: false, threshold: 0.5, json: null };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--variant') {
      const [id, file] = String(argv[++i]).split('=');
      out.variants.push({ id, file });
    } else if (a === '--theme') out.themes.push(argv[++i]);
    else if (a === '--dark') out.dark = true;
    else if (a === '--threshold') out.threshold = parseFloat(argv[++i]);
    else if (a === '--json') out.json = argv[++i];
    else rest.push(a);
  }
  if (rest[0]) out.deck = path.resolve(rest[0]);
  if (!out.themes.length) out.themes = ['indaco'];
  return out;
}

/**
 * Slide index (1-based, as the emulator numbers its PNGs) to member name.
 * A slide with no `_class` still consumes an index, so the walk cannot skip.
 */
function slideMembers(md) {
  const body = md.replace(/^---\n[\s\S]*?\n---\n/, '');
  return body.split(/\n---\s*\n/).map((chunk, i) => {
    const m = /<!--\s*_class:\s*([^\s>-]+)/.exec(chunk);
    return { index: i + 1, name: m ? m[1] : `slide-${i + 1}` };
  });
}

/** Mean absolute difference (0-255) and percent of pixels visibly moved. */
function compare(a, b) {
  const fx = (expr) => parseFloat(
    execFileSync('convert', [a, b, '-compose', 'difference', '-composite', '-colorspace', 'Gray', '-format', expr, 'info:'], { encoding: 'utf8' }),
  );
  return { mean: fx('%[fx:mean*255]'), moved: parseFloat(
    execFileSync('convert', [a, b, '-compose', 'difference', '-composite', '-colorspace', 'Gray', '-threshold', '3%', '-format', '%[fx:mean*100]', 'info:'], { encoding: 'utf8' }),
  ) };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!process.env.CHROME_PATH) {
    console.error('chart-finish-divergence: CHROME_PATH is unset — this renders in a real browser.');
    process.exit(2);
  }
  // A deck path is an author's, not the repo's: strip a BOM and normalize CRLF
  // at the read, or the `^---` front-matter anchor below misses and the whole
  // header is parsed as body (#1349).
  const md = fs.readFileSync(args.deck, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const slides = slideMembers(md);
  const { injectDark } = require(path.join(REPO, 'tools/build-galleries.js'));

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'finish-div-'));
  const variants = [{ id: 'base', css: '' }, ...args.variants.map((v) => ({ id: v.id, css: fs.readFileSync(v.file, 'utf8') }))];
  const shot = {}; // theme -> variant -> index -> png path

  try {
    for (const theme of args.themes) {
      shot[theme] = {};
      for (const v of variants) {
        const tag = `${v.id}__${theme}`;
        const deck = path.join(tmp, `${tag}.md`);
        const src = v.css.trim() ? `<style>\n${v.css.trim()}\n</style>\n\n` : '';
        fs.writeFileSync(deck, src + (args.dark ? injectDark(md) : md));
        execFileSync(process.execPath, [path.join(REPO, 'dist/lattice-emulator.js'), deck, path.join(tmp, `${tag}.png`), theme], {
          stdio: ['ignore', 'ignore', 'inherit'],
        });
        shot[theme][v.id] = {};
        for (const s of slides) {
          const p = path.join(tmp, `${tag}.${String(s.index).padStart(3, '0')}.png`);
          if (fs.existsSync(p)) shot[theme][v.id][s.index] = p;
        }
        process.stderr.write(`  rendered ${tag}\n`);
      }
    }

    const pairs = [];
    for (let i = 0; i < variants.length; i++) {
      for (let j = i + 1; j < variants.length; j++) pairs.push([variants[i].id, variants[j].id]);
    }

    const rows = [];
    for (const theme of args.themes) {
      for (const s of slides) {
        if (!shot[theme][variants[0].id][s.index]) continue;
        const cells = {};
        for (const [a, b] of pairs) {
          const pa = shot[theme][a][s.index];
          const pb = shot[theme][b][s.index];
          if (!pa || !pb) continue;
          cells[`${a}>${b}`] = compare(pa, pb);
        }
        rows.push({ theme, member: s.name, cells });
      }
    }

    const label = pairs.map(([a, b]) => `${a}>${b}`);
    console.log(`\nfinish divergence — ${path.basename(args.deck)}${args.dark ? ' · dark' : ''}`);
    console.log('  mean = mean absolute channel difference (0-255); moved = % of pixels a reader would see change\n');
    for (const theme of args.themes) {
      console.log(`── ${theme} ${'─'.repeat(56)}`);
      console.log(`  ${'member'.padEnd(15)}${label.map((l) => l.padEnd(18)).join('')}`);
      for (const r of rows.filter((x) => x.theme === theme)) {
        const cols = label.map((l) => {
          const c = r.cells[l];
          if (!c) return '—'.padEnd(18);
          const flag = c.moved < args.threshold ? '!' : ' ';
          return `${c.mean.toFixed(2).padStart(6)} ${c.moved.toFixed(1).padStart(5)}%${flag}`.padEnd(18);
        });
        console.log(`  ${r.member.padEnd(15)}${cols.join('')}`);
      }
      console.log('');
    }

    console.log(`── IDENTICAL — pairs whose divergence is under ${args.threshold}% of pixels ${'─'.repeat(10)}`);
    let any = false;
    for (const l of label) {
      const dead = rows.filter((r) => r.cells[l] && r.cells[l].moved < args.threshold);
      if (!dead.length) { console.log(`  ${l.padEnd(18)} —`); continue; }
      any = true;
      const byMember = [...new Set(dead.map((r) => r.member))].sort();
      console.log(`  ${l.padEnd(18)} ${byMember.length} member(s): ${byMember.join(', ')}`);
    }
    if (any) console.log('\n  A finish that cannot be seen on a member does not exist on it.');
    console.log('');

    if (args.json) {
      fs.writeFileSync(args.json, JSON.stringify({ deck: args.deck, dark: args.dark, threshold: args.threshold, rows }, null, 2));
      console.log(`json → ${args.json}\n`);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main();
