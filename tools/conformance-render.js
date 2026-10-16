#!/usr/bin/env node
/**
 * conformance-render — the RENDER tier of the component contract, report-only.
 *
 * Design: engineering/decisions/2026-10-15-conformance-harness.md §6.2 (component row), §6.4,
 * §9 phase 2, §12.4. The static clauses of `lib/conformance/kinds/component.contract.js` read
 * files; the clauses here need a browser. They share ONE deck and ONE render:
 *
 *   deck      every slide of every component's generated gallery (75 galleries, one slide per
 *             variant — the tier `component.variants-rendered` keeps honest), joined into a single
 *             Marp deck. Not the hand-written baseline gallery, which misses 18 components.
 *   render    once, through the same emulator every integration test uses (`runEmulator`).
 *   themes    `tools/palette-sweep.js` re-themes the rendered page in place for every shipped
 *             palette (33 files; light and dark are separate palettes), so theme × scheme costs
 *             a probe per palette, not a render. The sweep proves it matches a native render
 *             (`tools/palette-native.js` is the nightly referee).
 *   probes    the contrast PROBE every contrast gate shares (`tools/check-slide-contrast.js`, HARD
 *             RULE #15), the overflow oracle (`lib/core/overflow-probe.js`, HARD RULE #1), axe-core
 *             with its contrast rule off (the PROBE owns contrast), and the card-row trigger.
 *
 * REPORT-ONLY. Nothing here blocks a PR: `component.render.*` clauses in the contract are
 * marked `status: 'report-only'`, and the nightly test that calls this
 * (`test/integration/components/component-conformance.test.js`) fails only when the harness
 * itself is blind or a probe cannot bite — never on a finding. §12.4 says the per-PR render
 * budget is measured here and brought to the owner before any of it blocks.
 *
 * Usage:
 *   node tools/conformance-render.js [--only=a,b] [--themes=a,b] [--json=out.json]
 *                                    [--no-axe] [--no-themes]
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

/** Every component directory with a generated gallery, as `{ name, bucket, file }`, sorted. */
function galleryFiles(only = null) {
  const out = [];
  const base = path.join(ROOT, 'lib', 'components');
  for (const b of fs.readdirSync(base, { withFileTypes: true })) {
    if (!b.isDirectory()) continue;
    for (const d of fs.readdirSync(path.join(base, b.name), { withFileTypes: true })) {
      if (!d.isDirectory() || d.name.startsWith('_')) continue;
      const file = path.join(base, b.name, d.name, `${d.name}.gallery.md`);
      if (fs.existsSync(file) && (!only || only.includes(d.name))) out.push({ name: d.name, bucket: b.name, file });
    }
  }
  return out.sort((a, c) => a.name.localeCompare(c.name));
}

/** A gallery without its front matter. */
function galleryBody(file) {
  const src = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const m = src.match(/^---\n[\s\S]*?\n---\n/);
  return (m ? src.slice(m[0].length) : src).trim();
}

/** A gallery's front-matter `header:` — "Lattice · <component>" — which names it on every slide. */
function galleryHeader(file) {
  const m = fs.readFileSync(file, 'utf8').match(/^header:\s*"([^"]*)"/m);
  return m ? m[1] : null;
}

/**
 * The matrix deck: every gallery's slides, in component order, under one front matter. `form: on`
 * matches the deck-wide default (component-invariants.test.js explains why it is not optional).
 *
 * A gallery's own `header:` is what the real gallery prints on each of its slides, and it names
 * the component. Joining 75 galleries loses their separate front matter, so each slide gets a
 * local `_header` directive carrying it. The rendered `<header>` then names the slide's component
 * exactly — on every page auto-split makes too — with no counting of slides, and no extra class
 * for the engine to mistake for a component (it warns on one).
 */
function buildMatrixDeck(files) {
  const headers = new Map();
  const parts = files.map((f) => {
    const header = galleryHeader(f.file);
    if (!header) throw new Error(`conformance-render: ${path.relative(ROOT, f.file)} has no front-matter header:`);
    if (headers.has(header)) throw new Error(`conformance-render: galleries ${headers.get(header)} and ${f.name} share the header "${header}"`);
    headers.set(header, f.name);
    return galleryBody(f.file).replace(/(<!--\s*_class:)/g, `<!-- _header: ${JSON.stringify(header)} -->\n$1`);
  });
  const md = `---\nmarp: true\ntheme: indaco\nform: on\npaginate: true\n---\n\n${parts.join('\n\n---\n\n')}\n`;
  return { md, headers };
}

// ── browser-side probes (serialized into the page; no closures) ──────────────────────────────

/** Per slide: overflow verdict from the shared probe. Evaluated once; geometry is palette-blind. */
const OVERFLOW_PAGE = (src, clipSel, ignoreSel) => {
  // eslint-disable-next-line no-new-func
  const probe = new Function(`return (${src})`)();
  return [...document.querySelectorAll('section[data-lattice-slide]')].map((s) => {
    const r = probe(s, clipSel, 12, ignoreSel);
    return { slide: Number(s.getAttribute('data-lattice-slide')), cls: [...s.classList].join(' '), over: Boolean(r.over), scrollH: r.scrollH, clientH: r.clientH };
  });
};

/**
 * The card-row trigger (§6.3 rule 6: geometry, not markup). A card row is THREE OR MORE sibling
 * boxes that (1) are visibly boxes — a painted background or a border, (2) have the same width
 * and the same height to within 1 px, and (3) sit in one row or one column of a single parent.
 * Per slide it returns the largest such group. A `<dl>`, a flex row and a grid all hit it the same.
 */
const CARD_ROW_PAGE = () => {
  const paintsBox = (cs) => {
    const bg = cs.backgroundColor;
    const filled = bg && bg !== 'transparent' && !/^rgba\(0, 0, 0, 0\)/.test(bg);
    const edge = ['Top', 'Right', 'Bottom', 'Left'].some((s) => parseFloat(cs[`border${s}Width`]) > 0 && cs[`border${s}Style`] !== 'none');
    return filled || edge;
  };
  const out = [];
  for (const s of document.querySelectorAll('section[data-lattice-slide]')) {
    let best = 0;
    for (const parent of s.querySelectorAll('*')) {
      const kids = [...parent.children].filter((k) => {
        const r = k.getBoundingClientRect();
        return r.width >= 60 && r.height >= 40 && paintsBox(getComputedStyle(k));
      });
      if (kids.length < 3) continue;
      const rects = kids.map((k) => k.getBoundingClientRect());
      const groups = new Map();
      for (const r of rects) {
        const key = `${Math.round(r.width)}x${Math.round(r.height)}`;
        // tolerate 1 px by also counting the neighbors
        groups.set(key, (groups.get(key) || 0) + 1);
      }
      let top = 0;
      for (const [key, n] of groups) {
        const [w, h] = key.split('x').map(Number);
        const near = [...groups].filter(([k]) => { const [a, b] = k.split('x').map(Number); return Math.abs(a - w) <= 1 && Math.abs(b - h) <= 1; }).reduce((t, [, c]) => t + c, 0);
        top = Math.max(top, n, near);
      }
      best = Math.max(best, top);
    }
    out.push({ slide: Number(s.getAttribute('data-lattice-slide')), cls: [...s.classList].join(' '), cardRow: best >= 3, size: best });
  }
  return out;
};

/** Per slide, section classes and slide number — to attribute rows to a component. */
const SLIDE_INDEX_PAGE = () => [...document.querySelectorAll('section[data-lattice-slide]')].map((s) => ({
  slide: Number(s.getAttribute('data-lattice-slide')), cls: [...s.classList], header: (s.querySelector(':scope > header')?.textContent || '').trim(),
}));

/** The overflow verdict for every slide of the page, from the shared probe. */
function probeOverflow(page) {
  const { PROBE_SRC, CLIP_CELL_SELECTOR, IGNORED_CLIP_SELECTOR } = require('../lib/core/overflow-probe');
  return page.evaluate(OVERFLOW_PAGE, PROBE_SRC, CLIP_CELL_SELECTOR, IGNORED_CLIP_SELECTOR);
}

/** The card-row trigger on every slide of the page. */
function probeCardRows(page) {
  return page.evaluate(CARD_ROW_PAGE);
}

/**
 * axe-core on every slide, contrast off (the contrast PROBE owns it), in chunks.
 *
 * axe flattens the WHOLE document on every run, so one run per slide on an 858-slide page is
 * quadratic: 57 ms a run on 73 slides, and the full page overran puppeteer's 180 s call limit.
 * So the sections are lifted out (a comment marks each one's place), put back one chunk at a time,
 * and axe runs on a document only a chunk long. Structural rules (alt text, names, roles, order)
 * do not depend on the slides that are absent. Everything is restored before this returns.
 */
async function probeAxe(page, chunk = 40) {
  const axeSrc = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
  await page.evaluate(axeSrc);
  const total = await page.evaluate(() => {
    window.__confHeld = [...document.querySelectorAll('section[data-lattice-slide]')].map((node) => {
      const mark = document.createComment('conf-slot');
      node.replaceWith(mark);
      return { node, mark };
    });
    return window.__confHeld.length;
  });
  const out = [];
  try {
    for (let from = 0; from < total; from += chunk) {
      out.push(...await page.evaluate(async (a, b) => {
        const held = window.__confHeld.slice(a, b);
        for (const h of held) h.mark.replaceWith(h.node);
        const found = [];
        try {
          const r = await window.axe.run(document, { rules: { 'color-contrast': { enabled: false } }, resultTypes: ['violations'] });
          for (const v of r.violations) {
            for (const n of v.nodes) {
              const sec = document.querySelector(n.target[0])?.closest('section[data-lattice-slide]');
              found.push({ slide: sec ? Number(sec.getAttribute('data-lattice-slide')) : null, id: v.id, impact: v.impact, html: n.html.slice(0, 120) });
            }
          }
        } finally {
          for (const h of held) { const m = document.createComment('conf-slot'); h.node.replaceWith(m); h.mark = m; }
        }
        return found;
      }, from, from + chunk));
    }
  } finally {
    await page.evaluate(() => { for (const h of window.__confHeld) h.mark.replaceWith(h.node); delete window.__confHeld; });
  }
  return out;
}

/**
 * Render a deck to the emulator's HTML, without the PDF. The PDF is the slow, fragile half: an
 * 858-slide deck's PDF write timed out at Chromium's 30 s protocol limit, and nothing here reads
 * it. An `.html` output stops after the page the PDF would have been printed from.
 */
function renderHtmlOnly(mdFile, { timeout = 600000 } = {}) {
  const { execFileSync } = require('node:child_process');
  const out = mdFile.replace(/\.md$/, '.html');
  execFileSync(process.execPath, [path.join(ROOT, 'lattice.js'), mdFile, path.join(ROOT, 'dist', 'lattice.css'), out, 'indaco', '-q'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], timeout });
  if (!fs.existsSync(out) || fs.statSync(out).size < 10000) throw new Error(`conformance-render: no HTML at ${out}`);
  return out;
}

// ── the run ──────────────────────────────────────────────────────────────────────────────────

const now = () => Number(process.hrtime.bigint() / 1000000n);

/** How many slides one page carries. The palette sweep is superlinear in page size (measured: 2.0 s
 *  a palette at 73 slides, 4.7 s at 200, 85.7 s at 858), so the deck is cut into pages of about this. */
const CHUNK_SLIDES = Number(process.env.CONF_CHUNK) || 150;

/** Slides a gallery contributes: one per `_class` directive (the galleries are generated). */
const slideCount = (file) => (galleryBody(file).match(/<!--\s*_class:/g) || []).length;

/** Pack galleries, in order, into chunks of at most `max` slides (one gallery is never split). */
function chunkFiles(files, max = CHUNK_SLIDES) {
  const chunks = [];
  let cur = [];
  let n = 0;
  for (const f of files) {
    const c = slideCount(f.file);
    if (cur.length && n + c > max) { chunks.push(cur); cur = []; n = 0; }
    cur.push(f);
    n += c;
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

/**
 * Render the matrix and run every probe. Returns a plain report; prints nothing.
 *
 * The deck is rendered and probed in pages (`CHUNK_SLIDES`); slide numbers in the report are GLOBAL
 * (a page's offset added), so a slide is one number whichever page held it.
 *
 * @param {{ only?: string[]|null, themes?: string[]|null, axe?: boolean, sweepThemes?: boolean, chrome?: string, log?: (s: string) => void }} [opts]
 */
async function runMatrix(opts = {}) {
  const { only = null, axe = true, sweepThemes = true, log = () => {} } = opts;
  const puppeteer = require('puppeteer');
  const { sweep, offenders, listSweepThemes } = require('./palette-sweep');
  const { paneClasses } = require('../lib/core/pane-css');

  const timing = { renderMs: 0, loadMs: 0, overflowMs: 0, cardRowMs: 0, axeMs: axe ? 0 : null, sweepMs: sweepThemes ? 0 : null, pages: 0 };
  const files = galleryFiles(only);
  const themes = sweepThemes ? opts.themes || listSweepThemes() : [];
  if (sweepThemes) timing.themes = themes.length;
  const out = { files, index: [], slideOwner: new Map(), overflow: [], cardRows: [], axeViolations: axe ? [] : null, swept: null, timing };
  const perTheme = new Map(themes.map((th) => [th, { theme: th, rows: 0, applied: true, signature: new Set(), offenders: [] }]));
  let offset = 0;

  const browser = await puppeteer.launch({
    executablePath: opts.chrome || process.env.CHROME_PATH,
    args: ['--no-sandbox', '--font-render-hinting=none'],
  });
  try {
    for (const [ci, group] of chunkFiles(files).entries()) {
      const { md, headers } = buildMatrixDeck(group);
      const deckFile = path.join(ROOT, '.scratch', 'conformance-render', `component-matrix-${ci}.md`);
      fs.mkdirSync(path.dirname(deckFile), { recursive: true });
      fs.writeFileSync(deckFile, md);

      let t = now();
      const html = renderHtmlOnly(deckFile);
      timing.renderMs += now() - t;

      const page = await browser.newPage();
      try {
        await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
        t = now();
        await page.goto(`file://${html}`, { waitUntil: 'networkidle0' });
        await page.evaluate(async () => { try { await Promise.all([...document.fonts].map((f) => f.load().catch(() => {}))); await document.fonts.ready; } catch { /* no Font Loading API */ } });
        timing.loadMs += now() - t;

        const index = await page.evaluate(SLIDE_INDEX_PAGE);
        for (const s of index) {
          out.index.push({ ...s, slide: s.slide + offset });
          out.slideOwner.set(s.slide + offset, headers.get(s.header) ?? null);
        }
        const shift = (rows) => rows.map((r) => ({ ...r, slide: r.slide + offset }));

        t = now();
        out.overflow.push(...shift(await probeOverflow(page)));
        timing.overflowMs += now() - t;

        t = now();
        out.cardRows.push(...shift(await probeCardRows(page)));
        timing.cardRowMs += now() - t;

        if (axe) {
          t = now();
          out.axeViolations.push(...(await probeAxe(page)).map((v) => ({ ...v, slide: v.slide == null ? null : v.slide + offset })));
          timing.axeMs += now() - t;
        }

        if (sweepThemes) {
          t = now();
          const swept = await sweep(page, themes, paneClasses(fs.readFileSync(html, 'utf8')));
          timing.sweepMs += now() - t;
          for (const p of swept.palettes) {
            const agg = perTheme.get(p.theme);
            agg.rows += p.rows.length;
            agg.applied = agg.applied && p.applied;
            agg.signature.add(p.signature);
            agg.offenders.push(...offenders(p.rows, swept.unswept).map((r) => ({ ...r, page: String(Number(r.page) + offset) })));
          }
        }
        offset += index.length;
        timing.pages++;
        log(`page ${ci + 1}: ${group.length} components, ${index.length} slides`);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
  if (sweepThemes) {
    out.swept = {
      palettes: [...perTheme.values()].map((p) => ({ theme: p.theme, rows: p.rows, applied: p.applied })),
      // Distinct painted canvases, over the palettes: the check that a swap which silently failed
      // would leave every palette identical.
      distinctPaints: new Set([...perTheme.values()].map((p) => [...p.signature].sort().join('+'))).size,
      offenders: new Map([...perTheme.values()].map((p) => [p.theme, p.offenders])),
    };
  }
  return out;
}

/**
 * Fold a matrix run into per-component findings and the card-row trigger's hit and miss rate
 * against the hand-labeled corpus (§6.3 rule 6). Pure: takes the report, returns plain data.
 *
 * @param {Awaited<ReturnType<typeof runMatrix>>} r
 * @param {Record<string, boolean>} labels  component → has a card row (test/conformance/card-row-corpus.json)
 */
function summarize(r, labels = {}) {
  const per = new Map(r.files.map((f) => [f.name, {
    name: f.name, slides: 0, overflow: [], cardRowSlides: 0, axe: [], contrast: new Map(), worst: null,
  }]));
  const at = (slide) => per.get(r.slideOwner.get(slide));
  for (const s of r.index) { const o = at(s.slide); if (o) o.slides++; }
  const unowned = r.index.filter((s) => !r.slideOwner.get(s.slide)).map((s) => s.slide);
  for (const o of r.overflow) if (o.over) at(o.slide)?.overflow.push(o.slide);
  for (const c of r.cardRows) if (c.cardRow) { const o = at(c.slide); if (o) o.cardRowSlides++; }
  for (const v of r.axeViolations || []) at(v.slide)?.axe.push(v);
  if (r.swept) {
    for (const [theme, rows] of r.swept.offenders) {
      for (const row of rows) {
        const o = at(Number(row.page));
        if (!o) continue;
        o.contrast.set(theme, (o.contrast.get(theme) || 0) + 1);
        if (!o.worst || row.r < o.worst.r) o.worst = { r: row.r, theme, slide: Number(row.page), text: row.text, tag: row.tag };
      }
    }
  }
  const trigger = { tp: [], fn: [], fp: [], tn: [] };
  for (const o of per.values()) {
    if (!Object.hasOwn(labels, o.name)) continue;
    const hit = o.cardRowSlides > 0;
    trigger[labels[o.name] ? (hit ? 'tp' : 'fn') : (hit ? 'fp' : 'tn')].push(o.name);
  }
  const rate = (a, b) => (a + b ? a / (a + b) : null);
  return {
    components: [...per.values()],
    unowned,
    trigger: { ...trigger, hitRate: rate(trigger.tp.length, trigger.fn.length), falseAlarmRate: rate(trigger.fp.length, trigger.tn.length) },
  };
}

/** The nightly log: timing, then findings by component, then the card-row trigger's rates. */
function formatReport(r, summary) {
  const t = r.timing;
  const sec = (ms) => (ms == null ? 'skipped' : `${(ms / 1000).toFixed(1)} s`);
  const lines = [
    '── component conformance, render tier (report-only) ──',
    `slides ${r.index.length} · components ${r.files.length} · palettes ${t.themes ?? 'not swept'}`,
    `time   render ${sec(t.renderMs)} · load ${sec(t.loadMs)} · overflow ${sec(t.overflowMs)} · card-row ${sec(t.cardRowMs)} · axe ${sec(t.axeMs)} · palette sweep ${sec(t.sweepMs)}`,
  ];
  const flagged = summary.components.filter((c) => c.overflow.length || c.axe.length || c.contrast.size);
  lines.push(`findings in ${flagged.length} of ${summary.components.length} components:`);
  for (const c of flagged) {
    const bits = [];
    if (c.overflow.length) bits.push(`overflow on ${c.overflow.length} slide(s)`);
    if (c.axe.length) bits.push(`axe ${[...new Set(c.axe.map((v) => v.id))].join(', ')}`);
    if (c.contrast.size) bits.push(`contrast under AA in ${c.contrast.size} palette(s), worst ${c.worst.r}:1 (${c.worst.theme}, "${String(c.worst.text).slice(0, 28)}")`);
    lines.push(`  ${c.name.padEnd(20)} ${bits.join(' · ')}`);
  }
  const tr = summary.trigger;
  const pct = (x) => (x == null ? 'n/a' : `${Math.round(x * 100)}%`);
  lines.push(`card-row trigger vs corpus: hit ${pct(tr.hitRate)} (${tr.tp.length} of ${tr.tp.length + tr.fn.length}) · false alarm ${pct(tr.falseAlarmRate)} (${tr.fp.length} of ${tr.fp.length + tr.tn.length})`);
  if (tr.fn.length) lines.push(`  missed:  ${tr.fn.join(', ')}`);
  if (tr.fp.length) lines.push(`  extra:   ${tr.fp.join(', ')}`);
  return lines.join('\n');
}

module.exports = { runMatrix, chunkFiles, CHUNK_SLIDES, summarize, formatReport, renderHtmlOnly, galleryFiles, buildMatrixDeck, galleryBody, probeOverflow, probeCardRows, probeAxe, OVERFLOW_PAGE, CARD_ROW_PAGE };

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1];
  const list = (k) => (arg(k) ? arg(k).split(',').filter(Boolean) : null);
  const corpusFile = path.join(ROOT, 'test', 'conformance', 'card-row-corpus.json');
  const labels = fs.existsSync(corpusFile) ? JSON.parse(fs.readFileSync(corpusFile, 'utf8')).labels : {};
  runMatrix({ only: list('only'), themes: list('themes'), axe: !process.argv.includes('--no-axe'), sweepThemes: !process.argv.includes('--no-themes'), log: (m) => process.stderr.write(`  · ${m}\n`) })
    .then((r) => {
      const summary = summarize(r, list('only') ? {} : labels);
      process.stdout.write(`${formatReport(r, summary)}\n`);
      if (arg('json')) {
        fs.writeFileSync(arg('json'), JSON.stringify({ timing: r.timing, summary: { ...summary, components: summary.components.map((c) => ({ ...c, contrast: Object.fromEntries(c.contrast) })) }, overflow: r.overflow.filter((o) => o.over), axe: r.axeViolations, cardRows: r.cardRows }, null, 1));
      }
    })
    .catch((e) => { process.stderr.write(`${e.stack || e}\n`); process.exit(1); });
}
