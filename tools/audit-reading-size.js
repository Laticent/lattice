#!/usr/bin/env node
/**
 * audit-reading-size — what size is each component's READING text, at each venue?
 *
 * The venue sets the type step (typography.md §7), and every role scales by the same
 * factor, so a venue cannot make two components agree: if `list takeaway` sets its rows
 * in `--fs-message` and `list-tabular` sets them in `--fs-body-compact`, one deck at one
 * venue shows reading text at two sizes. This tool measures that directly.
 *
 * For every component it renders the manifest `sample` — bare, and once per declared
 * variant — through the real emulator, at each of the four venues (a per-slide
 * `venue-*` class, which wins over the deck's). In Chromium it walks every visible text
 * node on the slide and sums its characters by computed font-size, leaving out what is not
 * reading text by construction: the slide title (h1/h2), the eyebrow and subtitle, the running header
 * and footer, screen-reader-only labels, a Key Insight / below-note coda, and text inside an SVG (a chart's labels
 * scale with its viewBox, not with a role). `--fs-meta` is the chrome role, so the size that
 * carries the most characters at any other role is the slide's READING size (a slide with only
 * meta-size text is flagged META-ONLY). A SECOND SIZE section lists any other non-chrome size
 * carrying more than 10% of a reading slide's text, which the dominant size alone would hide; the role it lands on is found by rendering one probe per
 * `--fs-*` role on the same slide and matching within half a pixel.
 *
 * It does not decide what counts as reading text for the design: a statement or a big
 * number is BIGGER on purpose. `HERO` below names those, and the report sorts them apart.
 * The design and the exceptions are in
 * engineering/decisions/2026-09-29-one-reading-size-per-venue.md.
 *
 * Usage: node tools/audit-reading-size.js [--only=a,b] [--jobs=N] [--json] [--venues=laptop,huddle]
 * Exit 0 always (an audit, not a gate), unless the render fails. Skips loudly with no Chromium.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { resolveChrome } = require('./lib/resolve-chrome');
const { loadAll, manifestBucket } = require('../lib/components');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const opt = (k) => (args.find((a) => a.startsWith(`--${k}=`)) || '').slice(k.length + 3);
const only = opt('only').split(',').filter(Boolean);
const jobs = Math.max(1, Number(opt('jobs')) || Math.min(4, os.cpus().length));
const JSON_OUT = args.includes('--json');
const VENUES = (opt('venues') || 'laptop,huddle,conference,hall').split(',');
const VENUE_CLASS = { laptop: '', huddle: 'venue-huddle', conference: 'venue-conference', hall: 'venue-hall' };

// The roles a reading size can land on, smallest first.
const ROLES = ['meta', 'body-compact', 'body', 'message', 'h3', 'emphasis', 'h2', 'h1', 'hero'];

// Components whose main text is BIGGER on purpose: the slide IS the sentence or the number,
// or it is a cover/section page. Their text is display, not reading, and the one-reading-size
// rule does not apply to it. Named here so the report can sort them apart; the reasons are in
// the decision note.
// A slide with more than this share of its visible characters at `--fs-meta` is listed under
// MOSTLY AT THE CHROME SIZE.
const META_HEAVY = 0.4;
const HERO = new Set(['big-number', 'closing', 'divider', 'kpi', 'quote', 'stats', 'title', 'topic']);

// The owner-approved exceptions to one reading size (the decision note's §4), keyed by
// component, or by `component variant` for one register. Each reads at its own role on
// purpose; the report lists them apart, so the per-venue line counts only what the rule covers.
const EXCEPTIONS = {
  'list principles': 'E2 display register',
  'list-steps ghost': 'E2 display register',
  'q-and-a solo': 'E2 display register',
  'image statement': 'E2 display register',
  'citation-card margin': 'E2 display register',
  'citation-card pull-quote': 'E2 display register',
  scene: 'E3 one lead caption',
  video: 'E3 one lead caption',
  flowchart: 'E4 chart key',
  'state-chart': 'E4 chart text',
  journey: 'E4 chart key',
  kanban: 'E5 label board',
  'logo-wall': 'E5 label board',
  'obligation-matrix': 'E5 label board',
  contact: 'E6 fixed card',
  wifi: 'E6 fixed card',
  code: 'code keeps --fs-body-compact (owner, 2026-09-29)',
  'compare-code': 'code keeps --fs-body-compact (owner, 2026-09-29)',
};
// Support lines (E7, owner ruling 2026-09-29): a line under a row reads one step below it.
// The SECOND SIZES report marks these, since they are a second size on purpose.
const SUPPORT_LINES = new Set(['list', 'content', 'split-panel proof', 'split-panel capstone', 'timeline-list']);
const exceptionOf = (component, variant) => EXCEPTIONS[`${component} ${variant}`] || EXCEPTIONS[component] || null;

/** A component sample, as `{ tokens, body }`: the class tokens it already carries and the slide below them. */
function splitSample(md, name) {
  const first = String(md || '').split(/\n---\s*\n/)[0];
  const m = first.match(/<!--\s*_class:\s*([^>]*?)\s*-->/);
  const tokens = m ? m[1].split(/\s+/).filter(Boolean) : [name];
  const body = m ? first.replace(m[0], '') : first;
  return { tokens: tokens[0] === name ? tokens.slice(1) : tokens, body: body.trim() };
}

/** The probe deck: the sample bare and under each declared variant, at every venue. */
function probeDeck(m) {
  const s = m.sample && splitSample(m.sample, m.name);
  if (!s) return { src: '', roster: [] };
  const variants = [null, ...(m.variants || []).filter((v) => !s.tokens.includes(v))];
  const roster = [];
  const slides = [];
  for (const v of variants) {
    for (const venue of VENUES) {
      const cls = [m.name, ...s.tokens, ...(v ? v.split(/\s+/) : []), VENUE_CLASS[venue]].filter(Boolean).join(' ');
      slides.push(`<!-- _class: ${cls} -->\n\n${s.body}\n`);
      roster.push({ variant: v, venue });
    }
  }
  return { src: `---\ntheme: indaco\n---\n\n${slides.join('\n---\n\n')}`, roster };
}

function render(src, tag, assetDir) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ars-'));
  // Samples reference their own assets by relative path (image, logo-wall, team-profile).
  if (assetDir && fs.existsSync(assetDir)) {
    for (const f of fs.readdirSync(assetDir)) {
      const from = path.join(assetDir, f);
      if (fs.statSync(from).isFile() && !/\.(md|css|js|mjs|json|pdf)$/.test(f)) fs.copyFileSync(from, path.join(dir, f));
    }
  }
  const md = path.join(dir, `${tag}.md`);
  const html = path.join(dir, `${tag}.html`);
  fs.writeFileSync(md, src);
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [path.join(ROOT, 'lattice-emulator.js'), md, html, 'indaco', '-q', '--no-split'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => (code === 0 && fs.existsSync(html) ? resolve({ html, dir }) : reject(new Error(`emulator exited ${code} for ${tag}:\n${err.slice(0, 600)}`))));
  });
}

// Runs in the page: per slide, the role sizes and the character count per font-size.
function measureInPage(roles) {
  const out = {};
  // The eyebrow and the subtitle are positional: a paragraph holding one inline `code`,
  // directly above a heading (eyebrow) or directly below one (subtitle). Both are heading
  // furniture, not reading text.
  const isEyebrow = (el) => {
    const p = el.closest('p');
    if (!p || p.children.length !== 1 || p.firstElementChild.tagName !== 'CODE' || p.textContent.trim() !== p.firstElementChild.textContent.trim()) return false;
    const heading = (n) => !!n && /^H[1-6]$/.test(n.tagName);
    return heading(p.nextElementSibling) || heading(p.previousElementSibling);
  };
  const SKIP = 'header, footer, h1, h2, svg, [aria-hidden="true"], .eyebrow, [class*="eyebrow"], blockquote[class*="insight"], [class*="insight-"], .below-note, .lattice-pagination, [data-lattice-chrome]';
  for (const sec of document.querySelectorAll('section[data-lattice-slide]')) {
    const rolepx = {};
    for (const r of roles) {
      const probe = document.createElement('span');
      probe.style.cssText = `position:absolute;visibility:hidden;font-size:var(--fs-${r})`;
      probe.textContent = 'x';
      sec.appendChild(probe);
      rolepx[r] = Number.parseFloat(getComputedStyle(probe).fontSize);
      probe.remove();
    }
    const bySize = {};
    const samples = {};
    const walker = document.createTreeWalker(sec, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.nodeValue.replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const el = n.parentElement;
      if (!el || el.closest(SKIP) || isEyebrow(el)) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const rect = el.getBoundingClientRect();
      // Screen-reader-only text is clipped to a 1px box: it is read aloud, never seen.
      if (rect.width <= 1 || rect.height <= 1 || /inset\(50%/.test(cs.clipPath) || /rect\(0/.test(cs.clip)) continue;
      const px = Math.round(Number.parseFloat(cs.fontSize) * 100) / 100;
      bySize[px] = (bySize[px] || 0) + text.length;
      if (!samples[px]) samples[px] = `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/)[0]}` : ''}: ${text.slice(0, 32)}`;
    }
    out[sec.getAttribute('data-lattice-slide')] = { rolepx, bySize, samples };
  }
  return out;
}

// Points at the 1280×720 slide the emulator renders, the unit typography.md's tables use.
const pt = (px) => (px * 0.75).toFixed(1);

const nearestRole = (px, rolepx) => {
  let best = null;
  for (const [r, v] of Object.entries(rolepx)) if (Math.abs(v - px) <= 0.5 && (!best || Math.abs(v - px) < Math.abs(rolepx[best] - px))) best = r;
  return best;
};

async function measureComponent(browser, m) {
  const { src, roster } = probeDeck(m);
  if (!roster.length) return [];
  const { html, dir } = await render(src, m.name, path.join(ROOT, 'lib/components', manifestBucket(m), m.name));
  const page = await browser.newPage();
  try {
    await page.goto(`file://${html}`, { waitUntil: 'networkidle0', timeout: 180000 });
    const slides = await page.evaluate(measureInPage, ROLES);
    if (Object.keys(slides).length !== roster.length) throw new Error(`${m.name}: rendered ${Object.keys(slides).length} slides for a roster of ${roster.length} — the probe deck split`);
    return roster.map((r, i) => {
      const s = slides[String(i + 1)];
      const total = Object.values(s.bySize).reduce((a, b) => a + b, 0);
      const sizes = Object.entries(s.bySize).map(([px, chars]) => ({ px: Number(px), chars, share: total ? chars / total : 0, role: nearestRole(Number(px), s.rolepx), sample: s.samples[px] })).sort((a, b) => b.chars - a.chars);
      // `--fs-meta` is the chrome role (labels, pills, captions), so the reading size is the size
      // carrying the most characters at any OTHER role. By role, not by size: at `hall` the label
      // lift puts meta above body-compact. A slide whose only text is at meta is flagged:
      // either it has no reading text, or its reading text sits at the chrome size.
      const reading = sizes.filter((x) => x.role !== 'meta');
      const main = reading[0] || sizes[0] || null;
      const metaOnly = !reading.length && !!sizes.length;
      // A second reading size on the same slide: any other non-chrome size carrying more than
      // 10% of the visible characters. The dominant size alone cannot show it.
      const second = main ? reading.filter((x) => x.px !== main.px && x.share > 0.1) : [];
      // The blind spot that leaving meta out opens: reading text SET at the chrome size never
      // shows as a second size. `authority-chain branching` (its branch lines) and `list-steps
      // timeline` (its step text) both hid there. A slide with most of its characters at meta
      // is reported apart, so a reader can tell chrome from reading text at the wrong size.
      const metaShare = sizes.filter((x) => x.role === 'meta').reduce((a, x) => a + x.share, 0);
      return { component: m.name, variant: r.variant, venue: r.venue, kind: HERO.has(m.name) ? 'hero' : exceptionOf(m.name, r.variant) ? 'exception' : 'reading', exception: exceptionOf(m.name, r.variant), px: main?.px ?? null, role: main?.role ?? null, share: main?.share ?? 0, metaOnly, metaShare, second, sizes, bodyPx: s.rolepx.body };
    });
  } finally {
    await page.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  let chrome;
  try { chrome = resolveChrome(); } catch { chrome = null; }
  if (!chrome) { console.error('audit-reading-size: SKIPPED — no Chromium (set CHROME_PATH).'); process.exit(0); }
  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch({ executablePath: chrome, args: ['--no-sandbox'] });
  const manifests = loadAll().filter((m) => !only.length || only.includes(m.name));
  const rows = [];
  const queue = [...manifests];
  try {
    await Promise.all(Array.from({ length: jobs }, async () => {
      while (queue.length) {
        const m = queue.shift();
        try { rows.push(...await measureComponent(browser, m)); }
        catch (e) { rows.push({ component: m.name, error: String(e.message || e).split('\n')[0] }); }
      }
    }));
  } finally {
    await browser.close();
  }
  rows.sort((a, b) => a.component.localeCompare(b.component) || String(a.variant).localeCompare(String(b.variant)));
  if (JSON_OUT) { process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`); return; }

  // The matrix: one line per component (+variant), one column per venue, the reading size in pt
  // and the role it lands on.
  const key = (r) => `${r.component}${r.variant ? ` ${r.variant}` : ''}`;
  const lines = new Map();
  for (const r of rows) {
    if (r.error) { lines.set(r.component, { kind: '?', cells: {}, error: r.error }); continue; }
    const k = key(r);
    if (!lines.has(k)) lines.set(k, { kind: r.kind, cells: {}, why: r.exception });
    lines.get(k).cells[r.venue] = r.px == null ? '—' : `${pt(r.px)} ${r.role || '(off-role)'}${r.metaOnly ? ' META-ONLY' : ''}`;
  }
  const w = Math.max(...[...lines.keys()].map((k) => k.length)) + 2;
  const head = `${'component'.padEnd(w)}kind     ${VENUES.map((v) => v.padEnd(26)).join('')}`;
  for (const kind of ['reading', 'exception', 'hero', '?']) {
    const ks = [...lines.entries()].filter(([, l]) => l.kind === kind);
    if (!ks.length) continue;
    const title = { reading: 'READING TEXT', exception: 'NAMED EXCEPTIONS (decision note §4)', hero: 'HERO TEXT (bigger on purpose)', '?': 'NOT MEASURED' }[kind];
    console.log(`\n${title}\n${head}`);
    for (const [k, l] of ks) console.log(l.error ? `${k.padEnd(w)}${l.error}` : `${k.padEnd(w)}${kind.slice(0, 8).padEnd(9)}${VENUES.map((v) => String(l.cells[v] ?? '—').padEnd(26)).join('')}${l.why ? `  ${l.why}` : ''}`);
  }
  // Second sizes on reading rows (laptop only; every venue scales them by the same factor).
  const mixed = rows.filter((r) => !r.error && r.kind === 'reading' && r.venue === VENUES[0] && r.second?.length);
  if (mixed.length) {
    console.log(`\nSECOND SIZES ON READING ROWS (${VENUES[0]}; a non-chrome size carrying >10% of the text)`);
    for (const r of mixed) console.log(`  ${key(r).padEnd(w)}${SUPPORT_LINES.has(key(r)) ? '(E7 support line) ' : ''}${r.second.map((x) => `${pt(x.px)}pt ${x.role || 'off-role'} ${Math.round(x.share * 100)}% [${(x.sample || '').slice(0, 40)}]`).join('  ·  ')}`);
  }
  // Slides that carry most of their text at the chrome size (laptop; the share barely moves by
  // venue). Chrome-heavy components (a chart's keys, a label board) belong here by design; a
  // component whose rows or descriptions sit here is reading text at the wrong role.
  const heavy = rows.filter((r) => !r.error && r.venue === 'laptop' && r.kind !== 'hero' && r.metaShare > META_HEAVY);
  if (heavy.length) {
    console.log(`\nMOSTLY AT THE CHROME SIZE (over ${Math.round(META_HEAVY * 100)}% of the characters at --fs-meta, laptop)`);
    for (const r of heavy) console.log(`  ${key(r).padEnd(w)}${Math.round(r.metaShare * 100)}%${r.exception ? `  (${r.exception})` : ''}`);
  }
  // Per venue: the distinct reading sizes, and how many component rows sit at each.
  console.log('\nDISTINCT READING SIZES PER VENUE (reading rows only; exceptions and hero text left out)');
  for (const v of VENUES) {
    const tally = {};
    for (const r of rows) if (!r.error && r.kind === 'reading' && r.venue === v && r.px != null) { const k = `${pt(r.px)}pt ${r.role || 'off-role'}`; tally[k] = (tally[k] || 0) + 1; }
    console.log(`  ${v.padEnd(11)} ${Object.entries(tally).sort((a, b) => Number.parseFloat(a[0]) - Number.parseFloat(b[0])).map(([s, n]) => `${s} ×${n}`).join('   ')}`);
  }
}

main().catch((e) => { console.error(e.stack || String(e)); process.exit(1); });
