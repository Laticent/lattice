#!/usr/bin/env node
/**
 * check-modifier-effects — does a `_class:` modifier actually CHANGE the slide on
 * the components the editor offers it on, and ONLY there?
 *
 * The editor's `_class:` completion offers a modifier where the component has the
 * SURFACE it acts on (lib/components/surfaces.js derives those from anatomy,
 * stylesheets and transforms). A derivation is a claim; this is the proof. For every
 * component it renders the component's own `sample` and `stressDoc.sample` through
 * the real emulator — once bare, and once per probe token — then fingerprints the
 * rendered slide in Chromium: every element's computed style (custom properties
 * excluded, so a token that only SETS a variable nobody reads counts as no effect)
 * plus its box (to within half a pixel). A surface is MEASURED on a component when any token acting on it
 * changes the fingerprint of either sample.
 *
 * The chart-marks surface is behavior, not style (the motion host reads the class
 * at play time), so it is measured by asking the render for the host's own target:
 * `svg [data-mark]` or a `data-scene-spec`.
 *
 * PROBED: the surfaces whose answer is DERIVED here — heading, eyebrow, table,
 * card-row, card-surface, card-rail, chart-marks. The key-insight / below-note /
 * insight-label surfaces come from the render's own coda kernel already
 * (lib/core/authoring-blocks.js), and a `slide` modifier is valid everywhere by
 * definition, so neither is re-proved here.
 *
 * A CONTROL guards the fingerprint: two identical bare slides must fingerprint the
 * same, or the run fails — a noisy fingerprint would otherwise report an effect for
 * every token.
 *
 * DECLARED VARIANTS are re-probed for the surfaces the component's own rendering
 * owns (card row, card lift, card rail): `kpi` reads the card lift only under
 * `ops`, so `lifted` is offered after `kpi ops` and not after plain `kpi`.
 *
 * The result is committed as lib/core/modifier-effects.generated.json, and it is the
 * SOURCE for the probed surfaces: tools/build-docs-portal.js publishes it to the
 * editor, falling back to the derivation (lib/components/surfaces.js) for a
 * component not measured yet. On-demand, not CI (a full run renders every component).
 *
 * Usage: node tools/check-modifier-effects.js [--bless] [--only=a,b] [--jobs=N]
 * Exit 1 when the measurement disagrees with the committed oracle (or, with
 * --bless, rewrites it). Skips loudly with no Chromium.
 * See engineering/decisions/2026-09-24-positional-class-completion.md.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { resolveChrome } = require('./lib/resolve-chrome');
const { loadAll, manifestBucket, MODIFIER_GROUPS, surfaceOf } = require('../lib/components');
const { componentSurfaces, CONTENT_SURFACES } = require('../lib/components/surfaces');

const ROOT = path.join(__dirname, '..');
const ORACLE = path.join(ROOT, 'lib/core/modifier-effects.generated.json');
const PROBED = ['heading', 'eyebrow', 'table', 'card-row', 'card-surface', 'card-rail', 'chart-marks'];
const STYLE_PROBED = PROBED.filter((s) => s !== 'chart-marks');
// The surfaces a component's own rendering owns — re-probed under each declared
// variant, because a variant can switch one on (`kpi ops` reads the card lift;
// plain `kpi` does not).
const VARIANT_PROBED = ['card-row', 'card-surface', 'card-rail'];

const args = process.argv.slice(2);
const bless = args.includes('--bless');
const only = (args.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const jobs = Math.max(1, Number((args.find((a) => a.startsWith('--jobs=')) || '').slice(7)) || Math.min(4, os.cpus().length));

/** Every token acting on a probed surface, grouped by surface. */
function probeTokens() {
  const out = Object.fromEntries(STYLE_PROBED.map((s) => [s, []]));
  for (const g of MODIFIER_GROUPS) for (const t of g.tokens) {
    const s = surfaceOf(g, t);
    if (out[s]) out[s].push(t);
  }
  return out;
}

/** A component sample, as `{ tokens, body }`: the class tokens it already carries and the slide below them. */
function splitSample(md, name) {
  const first = String(md || '').split(/\n---\s*\n/)[0];
  const m = first.match(/<!--\s*_class:\s*([^>]*?)\s*-->/);
  const tokens = m ? m[1].split(/\s+/).filter(Boolean) : [name];
  const body = m ? first.replace(m[0], '') : first;
  return { tokens: tokens[0] === name ? tokens.slice(1) : tokens, body: body.trim() };
}

/**
 * The first sample with canonical content for each content surface it lacks, so a
 * surface is only called inert after it was EXERCISED: an eyebrow line directly
 * above the first heading (the position the eyebrow CSS matches), a heading, and
 * a small table at the end. Returns null when the sample already has all three.
 */
function exercised(sample) {
  let body = sample.body;
  const lines = body.split('\n');
  const hasHeading = lines.some((l) => /^#{1,6}\s+\S/.test(l));
  const hasTable = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/m.test(body);
  const eyebrowAboveHeading = lines.some((l, i) => /^\s*`[^`]+`\s*$/.test(l) && /^#{1,6}\s/.test(lines.slice(i + 1).find((x) => x.trim()) || ''));
  if (hasHeading && hasTable && eyebrowAboveHeading) return null;
  if (!hasHeading) body = `## Probe heading\n\n${body}`;
  if (!eyebrowAboveHeading) body = body.replace(/^(#{1,6}\s+\S)/m, '`PROBE · EYEBROW`\n\n$1');
  if (!hasTable) body = `${body}\n\n| Probe | Value |\n|---|---|\n| One | 1 |\n`;
  return { tokens: sample.tokens, body };
}

/** The probe deck for one component, plus the slide roster (1-based). */
function probeDeck(m, probes) {
  const samples = [m.sample, m.stressDoc?.sample].filter(Boolean).map((s) => splitSample(s, m.name));
  const roster = [];
  const slides = [];
  const add = (sample, si, token) => {
    const cls = [m.name, ...sample.tokens, ...(token ? [token] : [])].join(' ');
    slides.push(`<!-- _class: ${cls} -->\n\n${sample.body}\n`);
    roster.push({ sample: si, token });
  };
  samples.forEach((s, si) => {
    add(s, si, null);
    add(s, si, null); // the control twin
    for (const surf of STYLE_PROBED) for (const t of probes[surf]) if (!s.tokens.includes(t)) add(s, si, t);
  });
  // The exercised sample: canonical content surfaces injected, content tokens only.
  const ex = samples[0] && exercised(samples[0]);
  if (ex) {
    add(ex, 'x', null);
    add(ex, 'x', null);
    for (const surf of CONTENT_SURFACES) for (const t of probes[surf]) if (!ex.tokens.includes(t)) add(ex, 'x', t);
  }
  // Each declared variant the first sample does not already carry, re-probed for the
  // component-owned surfaces. The variant slide is its own baseline.
  const first = samples[0];
  if (first) {
    for (const v of (m.variants || []).flatMap((x) => x.split(/\s+/))) {
      if (first.tokens.includes(v)) continue;
      const withV = { tokens: [...first.tokens, v], body: first.body };
      const key = `v:${v}`;
      add(withV, key, null);
      add(withV, key, null); // the variant's own control twin
      for (const surf of VARIANT_PROBED) for (const t of probes[surf]) add(withV, key, t);
    }
  }
  return { src: `---\ntheme: indaco\n---\n\n${slides.join('\n---\n\n')}`, roster };
}

function render(src, tag, assetDir) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mfx-'));
  // The samples reference their own assets by relative path (image, logo-wall,
  // team-profile); without them an image slide renders a different composition.
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

// Runs in the page: one fingerprint per slide, plus whether it draws motion marks.
function measureInPage() {
  const probe = getComputedStyle(document.documentElement);
  const props = [];
  // Properties that never change what the slide shows are left out.
  const quiet = /^(cursor|pointer-events|user-select|-webkit-user-select|transition.*|animation.*|will-change|caret-color|touch-action|scroll-.*|overscroll-.*)$/;
  for (let i = 0; i < probe.length; i++) if (!probe[i].startsWith('--') && !quiet.test(probe[i])) props.push(probe[i]);
  const hash = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
  // A fragment reference names a per-slide id (`url("#cart-fill-bar-fill-1-2-1")`),
  // which differs between identical twins — the reference is kept, the id is not.
  const norm = (v) => v.replace(/url\("?#[^")]*"?\)/g, 'url(#)');
  const out = {};
  for (const sec of document.querySelectorAll('section[data-lattice-slide]')) {
    const parts = [];
    const boxes = [];
    // Boxes relative to the slide: slides stack down the page, so absolute
    // positions would differ between identical twins.
    const origin = sec.getBoundingClientRect();
    const walk = (el, isRoot) => {
      parts.push(`${el.tagName}.${isRoot ? '' : el.getAttribute('class') || ''}`);
      const cs = getComputedStyle(el);
      for (const p of props) parts.push(norm(cs.getPropertyValue(p)));
      for (const pe of ['::before', '::after']) {
        const ps = getComputedStyle(el, pe);
        if (ps.content && ps.content !== 'none' && ps.content !== 'normal') for (const p of props) parts.push(norm(ps.getPropertyValue(p)));
      }
      const r = el.getBoundingClientRect();
      // A box that does not render (display: none) reports 0×0 at the page origin.
      // Boxes are compared with a tolerance, not hashed: layout jitters by ~1e-4px
      // between identical renders, and a hash of rounded values flips whenever a
      // value sits on a rounding boundary.
      if (r.width || r.height) boxes.push(r.x - origin.x, r.y - origin.y, r.width, r.height);
      else boxes.push(-1, -1, -1, -1);
      for (const ch of el.children) walk(ch, false);
    };
    walk(sec, true);
    out[sec.getAttribute('data-lattice-slide')] = {
      fp: hash(parts.join('|')),
      boxes,
      marks: !!sec.querySelector('svg [data-mark]') || sec.hasAttribute('data-scene-spec') || !!sec.querySelector('[data-scene-spec]'),
    };
  }
  return out;
}

async function measureComponent(browser, m, probes) {
  const { src, roster } = probeDeck(m, probes);
  if (!roster.length) return { measured: [], inert: [], variants: {}, note: 'no sample' };
  const { html, dir } = await render(src, m.name, path.join(ROOT, 'lib/components', manifestBucket(m), m.name));
  const page = await browser.newPage();
  try {
    await page.goto(`file://${html}`, { waitUntil: 'networkidle0', timeout: 180000 });
    const slides = await page.evaluate(measureInPage);
    // A heading split or an auto-split would shift every slide after it.
    if (Object.keys(slides).length !== roster.length) throw new Error(`${m.name}: rendered ${Object.keys(slides).length} slides for a roster of ${roster.length} — the probe deck split`);
    const at = (i) => slides[String(i + 1)];
    const same = (a, b) => a.fp === b.fp && a.boxes.length === b.boxes.length && a.boxes.every((v, k) => Math.abs(v - b.boxes[k]) <= 0.5);
    const measured = new Set();
    const exercisedEffect = new Set();
    const unmeasurable = new Set();
    const base = {};
    roster.forEach((r, i) => {
      if (r.token) return;
      if (!at(i)) throw new Error(`${m.name}: slide ${i + 1} missing from the render`);
      if (base[r.sample] === undefined) base[r.sample] = at(i);
      else if (!same(base[r.sample], at(i))) {
        // A variant that renders differently on every slide (a running section
        // number, a counter) cannot be measured this way: skip it, and say so.
        if (r.sample === 'x') throw new Error(`${m.name}: exercised control twins fingerprint differently — the fingerprint is noisy`);
        if (typeof r.sample === 'string') { unmeasurable.add(r.sample.slice(2)); return; }
        throw new Error(`${m.name}: control twins fingerprint differently — the fingerprint is noisy, so no effect can be trusted`);
      }
      if (at(i).marks && typeof r.sample === 'number') measured.add('chart-marks');
    });
    const tokenSurface = new Map(STYLE_PROBED.flatMap((s) => probes[s].map((t) => [t, s])));
    const byVariant = {};
    roster.forEach((r, i) => {
      if (!r.token || !at(i) || same(at(i), base[r.sample])) return;
      const surf = tokenSurface.get(r.token);
      if (r.sample === 'x') { exercisedEffect.add(surf); return; }
      if (typeof r.sample === 'string' && unmeasurable.has(r.sample.slice(2))) return;
      if (typeof r.sample === 'string') (byVariant[r.sample.slice(2)] ||= new Set()).add(surf);
      else measured.add(surf);
    });
    // A variant records only what it ADDS over the bare component.
    const variants = {};
    for (const [v, set] of Object.entries(byVariant)) {
      const extra = [...set].filter((x) => !measured.has(x)).sort();
      if (extra.length) variants[v] = extra;
    }
    // A content surface is INERT only when no modifier on it changed EITHER the
    // natural sample or the exercised one (canonical content injected): the editor
    // then keeps it hidden even when an author's slide contains one. A surface that
    // works once the content is there, and that the component's anatomy has, is
    // offered outright.
    const derived = componentSurfaces(m, { dir: path.join(ROOT, 'lib/components', manifestBucket(m), m.name) });
    for (const s of exercisedEffect) if (derived.includes(s)) measured.add(s);
    const inert = CONTENT_SURFACES.filter((x) => !measured.has(x) && !exercisedEffect.has(x) && (derived.includes(x) || roster.some((r) => r.sample === 'x'))).sort();
    return { measured: [...measured].sort(), inert, variants, unmeasurable: [...unmeasurable].sort() };
  } finally {
    await page.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  let chrome;
  try { chrome = resolveChrome(); } catch { chrome = null; }
  if (!chrome) { console.error('check-modifier-effects: SKIPPED — no Chromium (set CHROME_PATH).'); process.exit(0); }
  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch({ executablePath: chrome, args: ['--no-sandbox'] });
  const probes = probeTokens();
  const manifests = loadAll().filter((m) => !only.length || only.includes(m.name));
  const result = {};
  const queue = [...manifests];
  const t0 = Date.now();
  try {
    await Promise.all(Array.from({ length: jobs }, async () => {
      while (queue.length) {
        const m = queue.shift();
        const r = await measureComponent(browser, m, probes);
        const entry = { surfaces: r.measured, ...(r.inert.length ? { inert: r.inert } : {}), ...(Object.keys(r.variants).length ? { variants: r.variants } : {}), ...(r.unmeasurable?.length ? { unmeasurable: r.unmeasurable } : {}) };
        result[m.name] = entry;
        const vs = Object.entries(r.variants).map(([v, x]) => ` +${v}:${x.join(',')}`).join('');
        process.stdout.write(`  ${m.name.padEnd(24)} ${r.measured.join(' ') || '—'}${r.inert.length ? `  inert:${r.inert.join(',')}` : ''}${vs}${r.unmeasurable?.length ? `  unmeasurable:${r.unmeasurable.join(',')}` : ''}${r.note ? `  (${r.note})` : ''}\n`);
      }
    }));
  } finally {
    await browser.close();
  }
  console.log(`measured ${manifests.length} components in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const prior = fs.existsSync(ORACLE) ? JSON.parse(fs.readFileSync(ORACLE, 'utf8')) : { components: {} };
  // Carry prior entries forward (an `--only` run measures a subset), but never one for a
  // component that no longer exists: a merge alone could not drop a retired component, so
  // the "re-bless" that test/unit/components/modifier-effects.test.js asks for kept it.
  const live = new Set(loadAll().map((m) => m.name));
  const next = { ...prior.components, ...result };
  const sorted = Object.fromEntries(Object.keys(next).filter((k) => live.has(k)).sort().map((k) => [k, next[k]]));
  if (bless) {
    const doc = {
      $comment: 'Generated by tools/check-modifier-effects.js --bless — do not edit by hand. Per component: `surfaces` — the probed surfaces on which at least one `_class:` modifier measurably changes the render of its sample; `inert` — content surfaces whose modifiers changed neither the natural sample nor one with canonical content injected; `variants` — surfaces a declared variant adds. tools/build-docs-portal.js publishes these to the editor. See engineering/decisions/2026-09-24-positional-class-completion.md.',
      probed: PROBED,
      components: sorted,
    };
    fs.writeFileSync(ORACLE, `${JSON.stringify(doc, null, 2)}\n`);
    console.log(`blessed ${path.relative(ROOT, ORACLE)}`);
    return;
  }
  const drift = Object.keys(result).filter((k) => JSON.stringify(result[k]) !== JSON.stringify(prior.components[k] || null));
  if (drift.length) {
    for (const k of drift) console.error(`  drift ${k}: oracle ${JSON.stringify(prior.components[k] || null)} → measured ${JSON.stringify(result[k])}`);
    console.error('check-modifier-effects: the render disagrees with the committed oracle. Read the drift, then re-run with --bless.');
    process.exit(1);
  }
  console.log('check-modifier-effects: render matches the committed oracle.');
}

main().catch((e) => { console.error(e.stack || String(e)); process.exit(1); });
