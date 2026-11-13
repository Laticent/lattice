/**
 * Every page and section mark agrees with the deck it is drawn on.
 *
 * Six separate counts answer "where is this slide?" and "where does each section start?": the page stamp, the
 * divider's `k / N` marker, the `divider numbered` numeral, the section rail's lit dot, the topic eyebrow, the agenda's
 * page references, and the proof color, plus the split's k-of-N rail and the `data-lattice-slide` stamps
 * (engineering/decisions/2026-11-08-dynamic-components.md §Dynamic marks). Most are written twice, once per render
 * path: an HTML-string arm (the engine, the CLI export, the Playground) and a live-DOM arm (`applyToDom`, which runs in
 * the runtime bundle). Nothing in the code makes them agree. On 2026-11-09 a scratch measurement found them agreeing on
 * every committed deck, and a divider with focus steps where four of them did not. This test makes "they agree" a
 * checked fact instead of a lucky one.
 *
 * HOW IT KNOWS THE ANSWER. The ground truth comes from the SOURCE, through a reader written here that shares no code
 * with any mark: it splits on `---` outside code fences (and at each heading under `split: headings`) and reads each
 * slide's `_class:` and `hide` comments. Every mark is then READ FROM THE RENDER and compared with it.
 *
 * BOTH ARMS. The string arm is the engine render plus `structuralSplit`, exactly as the CLI composes them. The DOM arm
 * takes that document into jsdom, strips every mark the string arm drew, and lets each mark's own `applyToDom` draw it
 * again; the same checks then read the result.
 *
 * PRESENCE. A check that only compares the marks it finds passes when a mark is deleted. So each mark has a rule for
 * when it MUST be there, and the failing arm at the bottom deletes and corrupts each one to prove a finding follows.
 *
 * THE ONE SANCTIONED EXCEPTION: the proof color counts hidden proof slides; every other mark counts shown slides only.
 * A color is the slide's identity, so hiding one slide for a lens must not recolor the slides a reader already saw; a
 * page number is a position, so it follows what is shown (the note's finding 1, `sequenceProofPanels`).
 *
 * Integration tier, because it renders every committed deck (HARD RULE #32: no clock, no network, no randomness).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..', '..', '..');
const { createEngine } = require(path.join(ROOT, 'lib/engine'));
const ss = require(path.join(ROOT, 'lib/engine/structural-split'));
const { resolveSize } = require(path.join(ROOT, 'lib/engine/css'));
const { splitSections } = require('@laticent/markup');
const { slideClassSpans } = require(path.join(ROOT, 'lib/core/slide-class-spans'));
const sectionIndex = require(path.join(ROOT, 'lib/core/section-index'));
const progress = require(path.join(ROOT, 'lib/forms/tile/progress/progress.transform'));
const topicTrack = require(path.join(ROOT, 'lib/transformers/topic-track'));
const splitPanels = require(path.join(ROOT, 'lib/transformers/split-panels'));

const CAPACITY = ss.splitCapacityFrom(require(path.join(ROOT, 'lib/components')).loadAll(path.join(ROOT, 'lib/components')));
const FIXTURES = path.join(__dirname, 'mark-agreement', 'fixtures');

// The committed decks: the same set the 2026-11-09 measurement rendered.
const CORPUS = execFileSync('git', ['ls-files', '--', 'examples/*.md', 'exemplars/**/*.md', 'test/fixtures/*.md',
  'test/integration/baseline-decks/*.md', 'lib/**/*.gallery.md', 'design/*.gallery.md'], { cwd: ROOT, encoding: 'utf8' })
  .trim().split('\n').filter(Boolean).map((rel) => path.join(ROOT, rel))
  // A deck has front matter; a README in a deck folder is not one.
  .filter((p) => fs.existsSync(p) && /^\uFEFF?---\r?\n/.test(fs.readFileSync(p, 'utf8')));

// KNOWN findings: defects already logged, each with its follow-up. The test fails when one STOPS occurring too, so a
// fix cannot leave a stale entry here.
const KNOWN = {
  'g-h1-divider.md': { check: 'topic eyebrow has no section name', why: 'followups.d/3096-p6-topic-eyebrow-h1-divider.md' },
};

// ── the independent source reader ──────────────────────────────────────────────────────────────────────────────
const FRONT = /^---\n[\s\S]*?\n---\n/;
function frontValue(front, key) {
  const m = new RegExp(`^${key}:\\s*(.*)$`, 'm').exec(front);
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : null;
}
function sourceDeck(md) {
  const text = md.replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '');
  const fm = FRONT.exec(text);
  const front = fm ? fm[0] : '';
  // WHERE the slides break comes from `slideClassSpans`, the source-side slide reader the band and the Mermaid bake
  // use, which test/unit/core/slide-class-span-parity.test.js holds equal to the engine's split over the whole corpus
  // (`---`, and the heading split a `split: headings` deck or a separator-less deck gets). It is not a mark: it counts
  // no page and no section. WHAT each slide is (its class, hidden or not, its heading) is read here.
  const { spans } = slideClassSpans(text);
  const slides = spans.map((sp) => {
    const outside = text.slice(sp.start, sp.end).replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, '');
    const hides = [...outside.matchAll(/^<!--\s*_?hide(?::\s*([^>]*?))?\s*-->/gm)];
    const last = hides.pop();
    const hidden = !!last && !/^(false|no|off|0)$/i.test((last[1] || '').trim());
    const head = (/^#{1,6}\s+(.*?)\s*#*\s*$/m.exec(outside) || [])[1] || '';
    const unnumbered = /^<!--\s*_?paginate\s*:\s*(false|skip|hold)\s*-->/m.test(outside);
    return { unnumbered, tok: String(sp.slideClass || '').replace(/["']/g, '').split(/\s+/).filter(Boolean), hidden, head };
  });
  return {
    slides,
    paginate: /^(true|yes|on)$/i.test(frontValue(front, 'paginate') || ''),
    size: frontValue(front, 'size') || 'hd',
    // A panes slide the engine splits becomes one slide per pane, a question about measured fits this reader does
    // not answer, so a deck with pane markers is not held to the authored-slide count (every mark still is).
    panes: /<!--\s*_?panes?\s*:/.test(text),
  };
}

// ── the two arms ───────────────────────────────────────────────────────────────────────────────────────────────
const ENGINE = createEngine();
function stringArm(md, size) {
  const g = resolveSize(size);
  const html = ENGINE.render(md).html;
  return ss.structuralSplit(html, { deckSource: md, width: parseFloat(g.width), height: parseFloat(g.height), capacity: CAPACITY }).html;
}
// Strip what each mark's string arm drew, then let its DOM arm draw it again. A proof slide keeps a `cat-N` the
// author pinned; the one the engine sequenced comes off.
function domArm(html, src) {
  const dom = new JSDOM(`<!doctype html><body><div class="lattice">${html}</div></body>`);
  const doc = dom.window.document;
  for (const sel of ['.tile-progress', '.divider-marker', '.agenda-rail', '[data-agenda-page]', 'p[data-derived="section"]']) {
    for (const n of doc.querySelectorAll(sel)) n.remove();
  }
  for (const h of doc.querySelectorAll('[data-lat-section]')) h.removeAttribute('data-lat-section');
  const pinned = src.slides.filter(isProof).map((s) => s.tok.find((t) => /^cat-[1-8]$/.test(t)) || null);
  const proofs = [...doc.querySelectorAll('section[data-lattice-slide]')].filter((s) => isProof({ tok: [...s.classList] }) && !s.getAttribute('data-lattice-slide').includes('.'));
  proofs.forEach((s, k) => { if (!pinned[k]) for (const c of [...s.classList]) if (/^cat-[1-8]$/.test(c)) s.classList.remove(c); });
  sectionIndex.applyToDom(doc);
  progress.applyToDom(doc);
  topicTrack.applyToDom(doc);
  splitPanels.applyToDom(doc);
  return doc.querySelector('.lattice').innerHTML;
}

// ── the checks ─────────────────────────────────────────────────────────────────────────────────────────────────
const strip = (h) => {
  let o = '';
  let t = false;
  for (const c of String(h)) { if (c === '<') t = true; else if (c === '>') t = false; else if (!t) o += c; }
  // `&amp;` decodes LAST, so an escaped entity (`&amp;lt;`) reads as its text (`&lt;`), never as `<`.
  return o.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
};
const noDot = (t) => (/[^.]\.$/.test(t) ? t.slice(0, -1) : t);
const plain = (t) => noDot(strip(String(t).replace(/`([^`]*)`/g, '$1').replace(/\*\*?|__?/g, '')));
const isProof = (s) => s.tok.includes('split-panel') && (s.tok.includes('proof') || s.tok.includes('capstone'));
const RAIL_OFF = ['no-progress', 'silent', 'progress-rail-off'];
// The anchor components (title, divider, topic, closing) frame the deck and carry no page number by design. The
// catalog's own bucket says which they are.
const ANCHORS = fs.readdirSync(path.join(ROOT, 'lib/components/anchor'), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);

/** Every disagreement between the marks in `html` and the deck `src`, as `{ check, page, got, want }`. */
function check(html, src) {
  const out = [];
  const bad = (check, page, got, want) => out.push({ check, page, got: String(got), want: String(want) });
  const srcDividers = src.slides.filter((s) => s.tok.includes('divider') && !s.hidden);
  const total = srcDividers.length;
  const secs = splitSections(html).filter((p) => p.type === 'section').map((p) => {
    const tok = p.cls.split(/\s+/).filter(Boolean);
    const attr = (n) => (p.openTag.match(new RegExp(`\\s${n}="([^"]*)"`)) || [])[1];
    return { tok, inner: p.inner, hidden: attr('data-lattice-hidden') === 'true', stamp: attr('data-lattice-pagination'), stampTotal: attr('data-lattice-pagination-total'), slide: attr('data-lattice-slide'), divider: tok.includes('divider') };
  });

  // data-lattice-slide: every section carries one; its whole part counts the AUTHORED slides, and a split page
  // carries `.k`, in order. The source counts the authored slides.
  let authored = 0;
  let runK = 0;
  secs.forEach((s, i) => {
    if (s.slide === undefined) { bad('data-lattice-slide MISSING', i + 1, 'none', 'a stamp'); return; }
    const [whole, part] = s.slide.split('.');
    if (part === undefined) { authored += 1; runK = 1; } else runK += 1;
    s.authored = authored;
    s.runK = runK;
    if (Number(whole) !== authored || (part !== undefined && Number(part) !== runK)) bad('data-lattice-slide', i + 1, s.slide, part === undefined ? authored : `${authored}.${runK}`);
  });
  if (!src.panes && authored !== src.slides.length) bad('authored slide count: source vs render', '-', authored, src.slides.length);
  for (const s of secs) s.runN = secs.filter((t) => t.authored === s.authored).length;

  // Page and section of each shown section, walked from the render. A split page keeps its slide's page.
  const shown = secs.filter((s) => !s.hidden);
  run('section count: source vs render');
  const renderDividers = shown.filter((s) => s.divider && s.runK === 1);
  if (renderDividers.length !== total) bad('section count: source vs render', '-', renderDividers.length, total);
  let page = 0;
  let sec = 0;
  for (const s of shown) {
    if (s.runK === 1) page += 1;
    if (s.divider && s.runK === 1) sec += 1;
    s.page = page;
    s.sec = sec;
  }
  const shownSlides = page;
  const firstPage = [];
  for (const s of shown) if (s.divider && firstPage[s.sec - 1] === undefined) firstPage[s.sec - 1] = s.page;
  const paginated = shown.some((s) => s.stamp !== undefined);
  const runStamp = (s) => (s.runK === 1 ? String(s.page) : `${s.page}.${s.runK}`);

  // Page stamp. Presence: in a deck that paginates, every shown slide carries one unless it is an anchor, switches
  // its number off (`no-pagination`, `silent`), or says `_paginate: false|skip|hold`.
  for (const s of shown) {
    if (!src.paginate || s.stamp !== undefined) continue;
    const own = src.slides[s.authored - 1];
    // A split page answers for the slide it came from: a closing `index` that splits keeps the closing's
    // unnumbered bookend, though its cover's own class is `split-cover-closing` (fit-everywhere §21).
    const tok = [...s.tok, ...(own?.tok || [])];
    if (ANCHORS.some((a) => tok.includes(a)) || tok.includes('no-pagination') || tok.includes('silent') || own?.unnumbered) continue;
    bad('page number MISSING', s.page, 'none', runStamp(s));
  }
  for (const s of shown) {
    if (s.stamp === undefined) continue;
    run('page number');
    if (s.stamp !== runStamp(s)) bad('page number', s.page, s.stamp, runStamp(s));
    if (s.stampTotal !== undefined && Number(s.stampTotal) !== shownSlides) bad('page total', s.page, s.stampTotal, shownSlides);
  }

  for (const s of shown) {
    const has = (t) => s.tok.includes(t);
    const railOn = has('with-progress') || !RAIL_OFF.some(has);
    // The rail and the marker are FORCED on in a `progress-rail: on` deck of two sections or more, so there they must
    // be present. Elsewhere the rail's own policy (deck length) decides, and only what is drawn is checked.
    const forced = has('progress-rail-on') && total >= 2 && railOn;
    const mk = s.inner.match(/divider-marker-count">\s*(\d+)\s*\/\s*(\d+)\s*</);
    if (s.divider && forced && !mk) bad('divider marker MISSING', s.page, 'none', `${s.sec} / ${total}`);
    if (mk) { run('divider k / N'); if (Number(mk[1]) !== s.sec || Number(mk[2]) !== total) bad('divider k / N', s.page, `${mk[1]} / ${mk[2]}`, `${s.sec} / ${total}`); }
    if (s.divider && has('numbered')) {
      run('divider numeral');
      const num = (s.inner.match(/<h[1-6]\b[^>]*data-lat-section="(\d+)"/) || [])[1];
      if (num === undefined) bad('divider numeral MISSING', s.page, 'none', s.sec);
      else if (Number(num) !== s.sec) bad('divider numeral', s.page, num, s.sec);
    }
    const rail = s.inner.match(/<div class="tile-progress[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    // A split page carries the k-of-N rail in the section rail's berth instead, by design (railRun).
    if (!rail && forced && has('form') && !s.divider && s.sec > 0 && s.runN === 1) bad('section rail MISSING', s.page, 'none', `dot ${s.sec} of ${total}`);
    if (rail) {
      run('section rail');
      const dots = [...rail[1].matchAll(/class="dot( on)?"/g)];
      const on = dots.findIndex((d) => d[1]);
      // Up to 8 sections one dot per section; past that the rail buckets its dots, so check the count only.
      if (total <= 8 ? dots.length !== total || on !== s.sec - 1 : dots.length > total) bad('section rail', s.page, `dot ${on + 1} of ${dots.length}`, `dot ${s.sec} of ${total}`);
    }
    // Topic eyebrow. Presence: a topic slide inside a section of a two-section deck, with the rail on.
    const eb = s.inner.match(/<p data-derived="section"><code>(\d+)(?: · ([^<]*))?<\/code>/);
    // The author's own eyebrow (a code-only first paragraph) stands in for the derived one.
    const firstP = (s.inner.match(/<p\b[^>]*>([\s\S]*?)<\/p>/) || [])[1];
    const ownEyebrow = firstP !== undefined && /^\s*<code\b[^>]*>[^<]*<\/code>\s*$/.test(firstP);
    if (has('topic') && s.sec > 0 && total >= 2 && railOn && !eb && !ownEyebrow) bad('topic eyebrow MISSING', s.page, 'none', s.sec);
    if (eb) {
      run('topic eyebrow');
      if (Number(eb[1]) !== s.sec) bad('topic eyebrow number', s.page, eb[1], s.sec);
      else if (eb[2] === undefined) bad('topic eyebrow has no section name', s.page, eb[1], srcDividers[s.sec - 1]?.head);
    }
    // Agenda page references. Present EXACTLY when the deck paginates, has two sections or more, and the list
    // names the shown dividers in order (the by-name rule); then each is the page its section starts on.
    if (has('agenda-pages') && s.runK === 1) {
      const refs = [...s.inner.matchAll(/class="agenda-page"[^>]*>p\.(\d+)</g)].map((m) => Number(m[1]));
      const items = [...s.inner.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((m) => plain(m[1].replace(/<code class="agenda-page"[\s\S]*?<\/code>/, '').replace(/<span class="agenda-rail[\s\S]*?<\/span>/, '')));
      const want = srcDividers.map((d) => plain(d.head));
      const owed = paginated && total >= 2 && items.join('|') === want.join('|');
      run('agenda page refs');
      if (owed && refs.join() !== firstPage.join()) bad('agenda page refs', s.page, refs.join(',') || 'none', firstPage.join(','));
      if (!owed && refs.length) bad('agenda page refs where none are owed', s.page, refs.join(','), 'none');
    }
    // The split's k-of-N rail: every page of a run of two or more, lit through its own page.
    if (s.runN >= 2) {
      run('split k-of-N rail');
      const sr = s.inner.match(/<div class="lat-split-rail"[^>]*>([\s\S]*?)<\/div>/);
      if (!sr) bad('split rail MISSING', runStamp(s), 'none', `${s.runK} of ${s.runN}`);
      else {
        const count = sr[1].match(/seg-count">(\d+)\/(\d+)</);
        const segs = [...sr[1].matchAll(/class="seg( on)?"/g)];
        const got = count ? `${count[1]} of ${count[2]}` : `${segs.filter((x) => x[1]).length} of ${segs.length}`;
        if (got !== `${s.runK} of ${s.runN}`) bad('split rail', runStamp(s), got, `${s.runK} of ${s.runN}`);
      }
    }
  }

  // Proof color: the authored-order slot, hidden proof slides included (the sanctioned exception above).
  const srcProofs = src.slides.filter(isProof);
  secs.filter((s) => isProof(s) && s.runK === 1).forEach((s, k) => {
    run('proof color');
    const cat = (s.tok.find((t) => /^cat-\d+$/.test(t)) || '').slice(4);
    const pin = (srcProofs[k]?.tok.find((t) => /^cat-\d+$/.test(t)) || '').slice(4);
    const want = pin || String((k % 8) + 1);
    if (cat !== want) bad('proof color', s.page ?? '(hidden)', cat || 'none', want);
  });
  return out;
}

const RAN = {};
function run(k) { RAN[k] = (RAN[k] || 0) + 1; }

/** Both arms' findings for one deck. */
function measure(file, mutate) {
  const md = fs.readFileSync(file, 'utf8');
  const src = sourceDeck(md);
  let html = stringArm(md, src.size);
  if (mutate) html = mutate(html);
  const str = check(html, src).map((f) => ({ ...f, arm: 'string' }));
  const dom = mutate ? [] : check(domArm(html, src), src).map((f) => ({ ...f, arm: 'dom' }));
  return [...str, ...dom];
}
const fmt = (file, f) => `${path.relative(ROOT, file)} [${f.arm}] ${f.check} · p.${f.page} · got ${f.got} · want ${f.want}`;

describe('mark agreement', () => {
  test('the corpus and the fixtures are there (a walk that finds nothing proves nothing)', () => {
    assert.ok(CORPUS.length > 400, `expected the committed corpus, found ${CORPUS.length}`);
    assert.ok(fs.readdirSync(FIXTURES).length >= 14);
  });

  test('every committed deck: every mark agrees with the source, on both arms', () => {
    const findings = [];
    for (const file of CORPUS) for (const f of measure(file)) findings.push(fmt(file, f));
    assert.deepEqual(findings, []);
  });

  for (const name of fs.readdirSync(FIXTURES).filter((n) => n.endsWith('.md')).sort()) {
    test(`fixture ${name}: every mark agrees, on both arms`, () => {
      const file = path.join(FIXTURES, name);
      const all = measure(file);
      const known = KNOWN[name];
      const unexpected = all.filter((f) => !known || f.check !== known.check).map((f) => fmt(file, f));
      assert.deepEqual(unexpected, []);
      if (known) assert.ok(all.some((f) => f.check === known.check), `${name}: the known finding "${known.check}" no longer occurs; fixed? Drop it from KNOWN (${known.why})`);
    });
  }

  test('a divider with focus steps is ONE section: its marker reads 1/2, then 2/2 (steps-as-a-behavior)', () => {
    const src = sourceDeck(fs.readFileSync(path.join(FIXTURES, 'focus-divider.md'), 'utf8'));
    const html = stringArm(fs.readFileSync(path.join(FIXTURES, 'focus-divider.md'), 'utf8'), src.size);
    const markers = [...html.matchAll(/divider-marker-count">\s*(\d+)\s*\/\s*(\d+)/g)].map((m) => `${m[1]}/${m[2]}`);
    assert.deepEqual(markers, ['1/2', '2/2']);
    const numerals = [...html.matchAll(/data-lat-section="(\d+)"/g)].map((m) => m[1]);
    assert.deepEqual(numerals.map(Number), [1, 2]);
  });

  // THE `--steps` ARM. A page-per-step export (the CLI's `--steps`, the Studio's "One page per step") copies each
  // stepping slide once per step (lib/core/step-pages.mjs `expandStepPages`). A copy is the SAME slide at another
  // step, so every mark on it must be its first page's: the page stamp, the slide stamp, the divider marker, the rail,
  // the eyebrow. Only the step paint may differ. Checked by stripping the paint and comparing each copy whole.
  const STEP_DECKS = [...CORPUS, ...fs.readdirSync(FIXTURES).filter((n) => n.endsWith('.md')).map((n) => path.join(FIXTURES, n))]
    .filter((f) => /<!--\s*_?(?:build|focusSteps)\b/.test(fs.readFileSync(f, 'utf8')));
  async function stepPages(file, mutate) {
    const { expandStepPages } = await import(path.join(ROOT, 'lib/core/step-pages.mjs'));
    const { applyStepAt } = await import(path.join(ROOT, 'lib/core/step-state.mjs'));
    const md = fs.readFileSync(file, 'utf8');
    const html = stringArm(md, sourceDeck(md).size);
    const dom = new JSDOM(`<!doctype html><body><div class="lattice">${html}</div></body>`);
    const root = dom.window.document.querySelector('.lattice');
    const counts = expandStepPages(root, applyStepAt);
    // The string twin (step-rescope.js `expandStepPagesHtml`, the CLI's bookkeeping for the PDF's notes) must expand
    // the same slides by the same amount: the same (slide, step page) sequence, page for page.
    const { expandStepPagesHtml } = require(path.join(ROOT, 'lib/core/step-rescope'));
    const seq = (r) => [...r.querySelectorAll('section')].filter((n) => !n.parentElement?.closest('section')).map((n) => `${n.getAttribute('data-lattice-slide')}#${n.getAttribute('data-step-page') || ''}`).join(' ');
    const twin = new JSDOM(`<!doctype html><body><div class="lattice">${expandStepPagesHtml(html)}</div></body>`).window.document.querySelector('.lattice');
    const twinOut = seq(twin) === seq(root) ? [] : [`${path.relative(ROOT, file)} · the string expander disagrees: ${seq(twin)} vs ${seq(root)}`];
    if (mutate) mutate(root);
    const unpaint = (sec) => {
      const c = sec.cloneNode(true);
      for (const n of [c, ...c.querySelectorAll('*')]) {
        for (const a of ['data-step-at', 'data-build-at', 'data-step-page', 'data-focus-axis', 'data-focus-style']) n.removeAttribute(a);
        n.classList.remove('lat-focus', 'lat-recede', 'lat-built');
        if (n.getAttribute('class') === '') n.removeAttribute('class');
      }
      return c.outerHTML;
    };
    const secs = [...root.querySelectorAll('section')].filter((n) => !n.parentElement?.closest('section'));
    const out = [];
    let at = 0;
    for (const n of counts) {
      const first = secs[at];
      for (let k = 1; k < n; k++) {
        const copy = secs[at + k];
        if (copy.getAttribute('data-step-page') !== String(k + 1)) out.push(`${path.relative(ROOT, file)} · page ${at + k + 1}: not step page ${k + 1}`);
        else if (unpaint(copy) !== unpaint(first)) out.push(`${path.relative(ROOT, file)} · page ${at + k + 1}: step ${k + 1} of slide ${first.getAttribute('data-lattice-slide')} differs from its first page beyond the step paint`);
      }
      at += n;
    }
    return { out: [...twinOut, ...out], added: at - counts.length };
  }

  test('--steps: every step page carries its slide\'s marks exactly, on every deck that steps', async () => {
    assert.ok(STEP_DECKS.length >= 3, `expected the stepping decks, found ${STEP_DECKS.length}`);
    const findings = [];
    let added = 0;
    for (const file of STEP_DECKS) {
      const r = await stepPages(file);
      findings.push(...r.out);
      added += r.added;
    }
    assert.ok(added > 0, 'no deck gained a step page, so the arm compared nothing');
    assert.deepEqual(findings, []);
  });

  test('--steps, the failing arm: a step page with a shifted page stamp is caught', async () => {
    const file = path.join(FIXTURES, 'focus-divider.md');
    const r = await stepPages(file, (root) => {
      const copy = root.querySelector('section[data-step-page="2"]');
      copy.setAttribute('data-lattice-pagination', String(Number(copy.getAttribute('data-lattice-pagination') || 0) + 1));
    });
    assert.ok(r.out.length > 0, 'a shifted stamp on a step page produced no finding');
  });

  test('every check ran, on the corpus or a fixture', () => {
    for (const k of ['section count: source vs render', 'page number', 'divider k / N', 'divider numeral', 'section rail', 'topic eyebrow', 'agenda page refs', 'proof color', 'split k-of-N rail']) {
      assert.ok(RAN[k] > 0, `the "${k}" check never ran, so it proves nothing`);
    }
  });

  // THE FAILING ARM. Each mutation breaks one mark in the rendered document; each must produce a finding. Without
  // this, a check that compares nothing passes.
  const MUTATIONS = [
    ['every page stamp deleted', 'a-hidden-between.md', (h) => h.replace(/\sdata-lattice-pagination="[^"]*"/g, '')],
    ['a page stamp shifted', 'a-hidden-between.md', (h) => h.replace(/data-lattice-pagination="(\d+)"/, (_, n) => `data-lattice-pagination="${Number(n) + 5}"`)],
    ['every divider marker deleted', 'b-progress-override.md', (h) => h.replace(/<div class="divider-marker[\s\S]*?<\/span><\/span><\/div>|<div class="divider-marker[\s\S]*?<\/div>/g, '')],
    ['a divider k changed', 'b-progress-override.md', (h) => h.replace(/divider-marker-count">\s*2/, 'divider-marker-count">3')],
    ['a numeral deleted', 'a-hidden-between.md', (h) => h.replace(/\sdata-lat-section="[^"]*"/, '')],
    ['a numeral changed', 'a-hidden-between.md', (h) => h.replace(/data-lat-section="(\d+)"/, (_, n) => `data-lat-section="${Number(n) + 1}"`)],
    ['every section rail deleted', 'b-progress-override.md', (h) => h.replace(/<div class="tile-progress[\s\S]*?<\/div>/g, '')],
    ['a lit dot moved', 'b-progress-override.md', (h) => h.replace(/(<div class="tile-progress[^>]*>[\s\S]*?)class="dot on"/, '$1class="dot"')],
    ['an eyebrow number changed', 'hidden-divider.md', (h) => h.replace(/<p data-derived="section"><code>02/, '<p data-derived="section"><code>01')],
    ['every eyebrow deleted', 'hidden-divider.md', (h) => h.replace(/<p data-derived="section">[\s\S]*?<\/p>/g, '')],
    ['an agenda reference changed', 'a-hidden-between.md', (h) => h.replace(/(class="agenda-page"[^>]*>p\.)(\d+)/, (_, a, n) => `${a}${Number(n) + 1}`)],
    ['every agenda reference deleted', 'a-hidden-between.md', (h) => h.replace(/<code class="agenda-page"[^>]*>[^<]*<\/code>/g, '')],
    ['a proof color changed', 'proof-hidden.md', (h) => h.replace(/(<section\b[^>]*\bclass="[^"]*)\bcat-3\b/, '$1cat-5')],
    ['a split rail deleted', 'split-run.md', (h) => h.replace(/<div class="lat-split-rail"[\s\S]*?<\/div>/, '')],
    ['a data-lattice-slide stamp changed', 'split-run.md', (h) => h.replace(/data-lattice-slide="2\.2"/, 'data-lattice-slide="2.3"')],
  ];
  for (const [what, fixture, mutate] of MUTATIONS) {
    test(`the failing arm: ${what} is caught`, () => {
      const file = path.join(FIXTURES, fixture);
      const before = fs.readFileSync(file, 'utf8');
      const src = sourceDeck(before);
      const html = stringArm(before, src.size);
      assert.notEqual(mutate(html), html, `the mutation "${what}" changed nothing, so it tests nothing`);
      const known = KNOWN[fixture];
      const found = measure(file, mutate).filter((f) => !known || f.check !== known.check);
      assert.ok(found.length > 0, `${what}: no finding`);
    });
  }
});
