#!/usr/bin/env node
/**
 * chart-mark-separation — can a reader still tell one category from another,
 * in the chart AS RENDERED, under a colour-vision condition?
 *
 * This is NOT `tools/cvd-audit.js`, and the difference is the whole point.
 * cvd-audit asks whether a THEME's tokens stay distinct under a condition — it
 * reads `--cat-1-fill` against `--cat-2-fill` and scores the gap. That is the
 * right question about a palette and the wrong one about a chart, because a
 * chart does not paint its tokens flat:
 *
 *   - A member may paint a token through a TEXTURE, and keep its read on a
 *     palette whose colours collapse completely (the pie on a11y-achromatopsia).
 *   - A member may paint perfectly separated tokens through a GRADIENT, and
 *     lose its read anyway — because the shading INSIDE one mark covers more
 *     ground than the gap to its neighbour. The quadrant does exactly this: its
 *     four zone tints are well separated as tokens and unreadable as zones,
 *     since each zone's radial dome ramps further than the step between zones.
 *
 * So the measurement has to happen on resolved paint, per mark, after the
 * cascade — and it needs two numbers per mark, not one:
 *
 *   SEPARATION   OKLab distance between this mark's representative colour and
 *                the next slot's, simulated under the condition. How far apart
 *                two categories are.
 *   SELF-RANGE   OKLab distance across this mark's OWN paint — the spread of
 *                its gradient stops, simulated the same way. How much ground a
 *                single category covers on its own.
 *
 * A mark whose SELF-RANGE meets or exceeds its SEPARATION has destroyed its own
 * categorical read: somewhere inside category A there is a colour that matches
 * category B. That is reported as SWAMPED, and it is a defect no palette work
 * can fix — only the fill finish can.
 *
 * A textured mark is scored as separated by construction: two different
 * `<pattern>`s are two different reads whatever their colours do. That is the
 * texture channel working as designed, and it is reported as such rather than
 * being scored on colour it does not depend on.
 *
 * A DIAGNOSTIC, not a gate. It exits 0 unless `--strict` is passed, because the
 * brand themes encode category in hue and are SUPPOSED to collapse under
 * achromatopsia — that is what the a11y palettes exist for. What it is for is
 * telling apart the two ways a chart can fail on an a11y palette: "this member
 * has no non-colour channel" and "this member has one and paints over it".
 *
 * WHAT IT DOES NOT SEE, stated so a clean run is not mistaken for a clean bill:
 *
 *   - Members whose colour encodes STATUS rather than category (gantt, progress,
 *     state-chart, timeline-list, waterfall, roadmap) are skipped. Every status
 *     surface in this family also carries a text label, so it is not separated
 *     by colour alone and scoring it here would manufacture failures.
 *   - A CHOROPLETH is a sequential ramp, not a categorical cycle. `map` is
 *     skipped: its 175 regions are 175 samples of one scale, and "are adjacent
 *     samples distinct" is the wrong question to ask of it.
 *   - `word-cloud` colours TEXT, which this does not treat as a mark. Its
 *     categorical read, if it has one, is unmeasured here.
 *   - POSITION and SHAPE are channels too, and this scores neither. A chart that
 *     separates categories by where they sit will read as collapsed.
 *
 * So a COLLAPSED verdict means "colour, texture and line style do not separate
 * these two" — it is the start of a look, not a verdict on the chart.
 *
 * Usage:
 *   node tools/chart-mark-separation.js [deck.md] [--theme <name>]
 *        [--type achromatopsia|protanopia|deuteranopia|tritanopia|none]
 *        [--floor <oklab>] [--strict] [--json <path>]
 *
 * Defaults: the chart bucket gallery, theme a11y-achromatopsia, condition
 * achromatopsia (the palette measured under the condition it is built for).
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { simulate } = require('../lib/theme/cvd');
const { hexToOklab, rgbToHex } = require('../lib/theme/color');

const REPO = path.resolve(__dirname, '..');
const DEFAULT_DECK = path.join(REPO, 'lib/components/chart/chart.gallery.md');

// The floor is the same 0.15 OKLab adjacent-slot distinctness the chart palette
// recipe already commits to (chart-family.style.md § the shared spine, point 4),
// so this tool and the palette curation cannot disagree about what "distinct"
// means.
const DEFAULT_FLOOR = 0.15;

function parseArgs(argv) {
  const out = {
    deck: DEFAULT_DECK,
    theme: 'a11y-achromatopsia',
    type: 'achromatopsia',
    floor: DEFAULT_FLOOR,
    strict: false,
    json: null,
    debug: false,
  };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--theme') out.theme = argv[++i];
    else if (a === '--type') out.type = argv[++i];
    else if (a === '--floor') out.floor = parseFloat(argv[++i]);
    else if (a === '--strict') out.strict = true;
    else if (a === '--json') out.json = argv[++i];
    else if (a === '--debug') out.debug = true;
    else rest.push(a);
  }
  if (rest[0]) out.deck = path.resolve(rest[0]);
  return out;
}

/** `rgb(1, 2, 3)` / `rgba(1, 2, 3, 0.5)` → `#010203`, or null if unparseable. */
function cssColorToHex(css) {
  const m = /^rgba?\(([^)]*)\)/.exec((css || '').trim());
  if (!m) return null;
  const comps = m[1].split(/[,/]/).map((t) => parseFloat(t.trim()));
  if (comps.length < 3 || comps.slice(0, 3).some((n) => Number.isNaN(n))) return null;
  return rgbToHex([comps[0], comps[1], comps[2]]);
}

function oklabDist(a, b) {
  const A = hexToOklab(a);
  const B = hexToOklab(b);
  return Math.hypot(A.L - B.L, A.a - B.a, A.b - B.b);
}

/** Distance between two hexes AS SEEN under the condition ('none' = unsimulated). */
function distUnder(a, b, type) {
  if (type === 'none') return oklabDist(a, b);
  return oklabDist(simulate(a, type), simulate(b, type));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const chrome = process.env.CHROME_PATH;
  if (!chrome) {
    console.error('chart-mark-separation: CHROME_PATH is unset — this measures RESOLVED paint,');
    console.error('which needs a real browser. Re-export it (see engineering/development.md).');
    process.exit(2);
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'chart-sep-'));
  const html = path.join(tmp, 'deck.html');
  execFileSync(
    process.execPath,
    [path.join(REPO, 'dist/lattice-emulator.js'), args.deck, html, args.theme],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  );

  const puppeteer = require('puppeteer');
  let browser;
  let raw;
  try {
    browser = await puppeteer.launch({ executablePath: chrome, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.goto(`file://${html}`, { waitUntil: 'networkidle0' });

    raw = await page.evaluate(() => {
      // Colour conversion belongs to the browser. getComputedStyle returns
      // `oklab(...)` / `color(...)` for tokens resolved through color-mix, and a
      // regex for `rgb(r, g, b)` reads those as UNPARSEABLE — which drops the
      // mark from the audit rather than failing loudly. Painting one pixel and
      // reading it back resolves every colour syntax the engine can emit,
      // including ones added after this was written.
      const _px = document.createElement('canvas');
      _px.width = _px.height = 1;
      const _ctx = _px.getContext('2d', { willReadFrequently: true });
      const toRgb = (css) => {
        if (!css || css === 'none') return null;
        _ctx.clearRect(0, 0, 1, 1);
        _ctx.fillStyle = '#000';
        _ctx.fillStyle = css;              // invalid syntax leaves it at #000
        if (_ctx.fillStyle === '#000000' && !/^(#000000|black|rgb\(0, 0, 0\))$/i.test(css.trim())) return null;
        _ctx.fillRect(0, 0, 1, 1);
        const d = _ctx.getImageData(0, 0, 1, 1).data;
        return d[3] === 0 ? null : `rgb(${d[0]}, ${d[1]}, ${d[2]})`;
      };

      const CHROME = new Set([
        'chart-frame', 'viz-frame', 'standard', 'print', 'dark', 'light',
        'lr', 'td', 'silent', 'title', 'has-notes', 'split', 'auto-split',
      ]);

      // Marks that carry a CATEGORICAL slot. Status marks (data-s) are excluded
      // on purpose: status is meaning, and every status surface in this family
      // also carries a text label, so it is not separated by colour alone.
      const CAT_SEL = [
        '[data-cat]', '[data-cell]', '[data-series]',
        '.wedge', '.funnel-band', '.quadrant-tint',
        '.sbar-seg', '.radar-poly', '.cell-filled', '.kanban-card', '.wc-word',
      ].join(', ');

      // Only PAINTED GEOMETRY is a mark. A <g data-series> groups a line's dots
      // and its area but paints nothing itself, and resolving it yields the UA
      // default black for every series — which reads as a total collapse that
      // is not there. Same for a <defs> child, which is never on the canvas.
      const PAINTS = new Set(['path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline']);
      const paintsItself = (el) => {
        if (el.closest('defs')) return false;
        const tag = el.tagName.toLowerCase();
        if (PAINTS.has(tag)) return true;
        // An HTML mark (kanban card, matrix cell) counts when it carries its own
        // background rather than inheriting the slide's.
        const cs = getComputedStyle(el);
        return cs.backgroundImage !== 'none'
          || (cs.backgroundColor && !/rgba\(0, 0, 0, 0\)/.test(cs.backgroundColor));
      };

      /** Resolve one element's paint to {kind, colors[]} — patterns keep their id. */
      const paintOf = (el) => {
        const cs = getComputedStyle(el);
        // COMPUTED style first, always. The `fill` presentation attribute is the
        // WEAKEST source in the cascade, and the a11y themes override it with
        // `fill: url(#latt-a11y-tex-N) !important` — so reading the attribute
        // reports the gradient the kernel emitted and misses the texture the
        // reader actually sees, which is the exact opposite of this tool's job.
        const isSvg = el.namespaceURI === 'http://www.w3.org/2000/svg';
        const declared = isSvg
          ? (cs.fill && cs.fill !== 'none' ? cs.fill : el.style.fill || el.getAttribute('fill'))
          : null;
        const bg = cs.backgroundImage;

        if (declared && /^url\(/.test(declared)) {
          const id = declared.replace(/^url\(["']?#?/, '').replace(/["']?\)$/, '');
          const def = document.getElementById(id) || document.querySelector(`[id="${CSS.escape(id)}"]`);
          if (!def) return { kind: 'unresolved', colors: [], ref: id };
          const tag = def.tagName.toLowerCase();
          if (tag === 'pattern') return { kind: 'pattern', colors: [], ref: id, dash: 'none' };
          const stops = [...def.querySelectorAll('stop')].map((s) => {
            const scs = getComputedStyle(s);
            return toRgb(scs.stopColor || s.getAttribute('stop-color'));
          }).filter(Boolean);
          return { kind: tag === 'radialgradient' ? 'radial' : 'linear', colors: stops, ref: id, dash: cs.strokeDasharray || 'none' };
        }

        if (bg && bg !== 'none' && /gradient/.test(bg)) {
          const cols = (bg.match(/(?:rgba?|oklab|oklch|color)\([^)]*\)/g) || []).map(toRgb).filter(Boolean);
          return { kind: /radial/.test(bg) ? 'radial' : 'linear', colors: cols, ref: null, dash: 'none' };
        }

        let flat = (declared ? toRgb(declared) : null) || toRgb(cs.backgroundColor);
        // A STROKED mark (a line's path, a slope's connector, a radar outline)
        // carries its category on the stroke; its fill is transparent by
        // construction. Falling back keeps those members in the audit instead of
        // reporting every series as the same transparent nothing.
        if (!flat && isSvg) flat = toRgb(cs.stroke);
        if (!flat) return { kind: 'none', colors: [], ref: null };
        return { kind: 'flat', colors: [flat], ref: null, dash: isSvg ? (cs.strokeDasharray || 'none') : 'none' };
      };

      const members = [];
      for (const sec of document.querySelectorAll('section.chart-frame')) {
        const name = [...sec.classList].find(
          (c) => !CHROME.has(c) && !c.startsWith('size-') && !c.startsWith('deck-'),
        );
        if (!name) continue;

        const marks = [];
        const seen = new Set();
        [...sec.querySelectorAll(CAT_SEL)].filter(paintsItself).forEach((el, i) => {
          // One entry per categorical SLOT, not per element: a legend swatch and
          // its wedge are the same category and must not count as two.
          const slot = el.getAttribute('data-cat') ?? el.getAttribute('data-cell')
            ?? el.getAttribute('data-series') ?? `pos${i}`;
          const isKey = el.closest('.chart-key, [class*="chart-key"]') !== null
            || (el.getAttribute('class') || '').includes('chart-key');
          if (isKey) return;
          if (seen.has(slot)) return;
          seen.add(slot);
          const p = paintOf(el);
          marks.push({ slot, cls: el.getAttribute('class') || '', ...p });
        });

        members.push({ name, marks });
      }
      return members;
    });
  } finally {
    if (browser) await browser.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  // ── Score ────────────────────────────────────────────────────────────────
  const results = [];
  for (const m of raw) {
    const marks = m.marks
      .map((k) => {
        const hexes = k.colors.map(cssColorToHex).filter(Boolean);
        let selfRange = 0;
        for (let i = 0; i < hexes.length; i++) {
          for (let j = i + 1; j < hexes.length; j++) {
            selfRange = Math.max(selfRange, distUnder(hexes[i], hexes[j], args.type));
          }
        }
        // Representative = the midpoint stop, which is what a reader averages a
        // shaded mark to. For a flat fill it is simply the fill.
        const rep = hexes.length ? hexes[Math.floor(hexes.length / 2)] : null;
        return { ...k, hexes, rep, selfRange, dash: k.dash || 'none' };
      })
      .filter((k) => k.kind !== 'none');

    if (!marks.length) { results.push({ name: m.name, verdict: 'no categorical marks', marks: [] }); continue; }

    const textured = marks.filter((k) => k.kind === 'pattern').length;
    const colored = marks.filter((k) => k.rep);

    // Separation is measured against the NEAREST other slot, not just the next
    // one — a reader confuses whichever two are closest, in whatever order the
    // document happened to emit them.
    let worst = null;
    for (let i = 0; i < colored.length; i++) {
      let nearest = Infinity;
      let against = null;
      for (let j = 0; j < colored.length; j++) {
        if (i === j) continue;
        const d = distUnder(colored[i].rep, colored[j].rep, args.type);
        if (d < nearest) { nearest = d; against = colored[j].slot; }
      }
      if (!Number.isFinite(nearest)) continue;
      // A mark separated from its nearest neighbour by LINE STYLE is separated,
      // whatever the two colours do — that is the channel a11y-base spends on
      // stroked members (slope, radar, line, scatter trends), precisely because
      // their strokes are grayscale there. Scoring those on colour alone would
      // fail them for having complied.
      const twin = colored.find((c) => c.slot === against);
      const dashSeparated = colored[i].dash !== 'none'
        || (twin ? twin.dash !== colored[i].dash : false);
      const row = {
        slot: colored[i].slot,
        kind: colored[i].kind,
        separation: nearest,
        against,
        selfRange: colored[i].selfRange,
        dashSeparated,
        swamped: !dashSeparated && colored[i].selfRange > 0 && colored[i].selfRange >= nearest,
      };
      if (!worst || row.separation - row.selfRange < worst.separation - worst.selfRange) worst = row;
    }

    const verdict = textured >= 2 && colored.length <= 1 ? 'textured'
      : !worst ? 'single category'
      : worst.swamped ? 'SWAMPED'
      : worst.dashSeparated ? 'line-styled'
      : worst.separation < args.floor ? 'COLLAPSED'
      : 'separated';

    results.push({ name: m.name, verdict, textured, total: marks.length, worst, marks: marks.map((k) => ({ slot: k.slot, kind: k.kind, selfRange: k.selfRange })) });
  }

  if (args.debug) {
    for (const m of raw) {
      console.log(`\n[debug] ${m.name} — ${m.marks.length} mark(s)`);
      for (const k of m.marks) console.log(`   slot=${k.slot} kind=${k.kind} ref=${k.ref || '-'} colors=${JSON.stringify(k.colors).slice(0, 90)} cls=${k.cls.slice(0, 44)}`);
    }
  }

  // ── Report ───────────────────────────────────────────────────────────────
  console.log(`\nchart mark separation — theme ${args.theme} · seen as ${args.type} · floor ${args.floor}\n`);
  console.log(`  ${'member'.padEnd(14)} ${'verdict'.padEnd(16)} ${'nearest'.padEnd(9)} ${'self-range'.padEnd(11)} note`);
  const failures = [];
  for (const r of results.sort((a, b) => a.name.localeCompare(b.name))) {
    const w = r.worst;
    const sep = w ? w.separation.toFixed(3) : '—';
    const self = w ? w.selfRange.toFixed(3) : '—';
    let note = '';
    if (r.verdict === 'textured') note = `all ${r.total} marks patterned — colour not load-bearing`;
    else if (r.verdict === 'SWAMPED') note = `slot ${w.slot}'s own shading (${self}) covers more than the gap to ${w.against} (${sep})`;
    else if (r.verdict === 'line-styled') note = 'separated by stroke dash pattern, not colour';
    else if (r.verdict === 'COLLAPSED') note = `slot ${w.slot} vs ${w.against} below the ${args.floor} floor`;
    else if (r.textured) note = `${r.textured}/${r.total} marks patterned`;
    if (r.verdict === 'SWAMPED' || r.verdict === 'COLLAPSED') failures.push(r);
    console.log(`  ${r.name.padEnd(14)} ${r.verdict.padEnd(16)} ${sep.padEnd(9)} ${self.padEnd(11)} ${note}`);
  }

  console.log(`\n  ${failures.length} member(s) lose the categorical read under ${args.type} on ${args.theme}.`);
  if (failures.length) {
    console.log('  SWAMPED is a fill-finish defect, not a palette one: no theme can separate');
    console.log('  categories that a mark\'s own shading paints over.\n');
  } else {
    console.log('');
  }

  if (args.json) {
    fs.writeFileSync(args.json, JSON.stringify({ ...args, results }, null, 2));
    console.log(`json → ${args.json}\n`);
  }
  if (args.strict && failures.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
