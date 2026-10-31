/**
 * page — the fit harness's in-page half: one scorer every policy is judged by, and the
 * fit-first page builder. Injected into a rendered deck as a source string (`PAGE_SRC`), the
 * way lattice.js injects the overflow probes, so the logic is not duplicated in the page.
 *
 * The fit oracle is the export's own: `probeSectionOverflow`, then `probeContentClipped` when a
 * box clips (lib/core/overflow-probe.js), with the export's selectors and tolerance. A page
 * "fits" exactly when the export would not report it.
 *
 * engineering/decisions/2026-10-28-fit-everywhere-model.md §4.
 */

/* eslint-disable no-undef */
function install(cfg) {
  const probeSectionOverflow = new Function(`return (${cfg.probeSrc})`)();
  const probeContentClipped = new Function(`return (${cfg.ccSrc})`)();
  const deckSlideSections = new Function(`return (${cfg.slidesSrc})`)();
  // Chrome: never content, so never counted as content lost or as ink. The page number sits
  // outside `.cell-footer` on some frames (split-panel, title, closing), and the split's own
  // running head is chrome the same way the fit arms' is.
  const CHROME = 'section > header,.cell-footer,.lat-pagination,.marker-rail,.slide-edge,.fixme-tab,[aria-hidden="true"],.fit-runhead,.split-runhead,.lat-cont,.lat-split-label,footer';
  const HEADS = '.cell-masthead,.fit-runhead,.split-runhead';
  const shown = (el) => { for (let x = el; x; x = x.parentElement) if (getComputedStyle(x).display === 'none') return false; return true; };
  const norm = (t) => t.replace(/\s+/g, ' ').trim().toLowerCase();

  /** Does the page fit, by the export's oracle? `px` is the vertical excess when it does not;
   *  `chrome` says the only cut is in chrome (the probe's own `chromeOnly`: the footer band, a
   *  split-panel's header or footer). `forSplit` treats a chrome-only cut as fitting: splitting
   *  cannot fix chrome, so it must not drive a split decision. The report still records it. */
  function fits(s, forSplit = false) {
    const p = probeSectionOverflow(s, cfg.clipSel, cfg.tol, cfg.ignoreSel);
    if (p.over) return { ok: false, px: Math.round(p.scrollH - p.clientH), chrome: false };
    // Inside the frame is not the same as readable: a four-column card grid at a story box keeps
    // every word on the slide at five characters a line (§12). The hard rule is "readable", so a
    // page with crammed or clipped prose does not fit. Checked before the chrome-only exit below:
    // a slide whose only cut is its footer line must still be readable.
    if (p.clipSuspect) {
      const c = probeContentClipped(s, cfg.ignoreSel, cfg.tol, cfg.bearerSel);
      if (c.cut) {
        if (c.chromeOnly && !readable(s)) return { ok: false, px: 0, chrome: false, unreadable: true };
        if (forSplit && c.chromeOnly) return { ok: true, px: 0, chrome: false };
        return { ok: false, px: 1, first: c.first, chrome: !!c.chromeOnly };
      }
    }
    if (!readable(s)) return { ok: false, px: 0, chrome: false, unreadable: true };
    return { ok: true, px: 0, chrome: false };
  }

  /** Readable prose, the harness's third hard rule (2026-10-28-fit-everywhere-model.md §12):
   *  no body-size text cut off by an ancestor that hides its overflow, and no body-size prose of
   *  24+ characters set at fewer than 12 characters a line over three or more lines. Labels drawn
   *  inside a chart, a figure, a collage or a QR card, display type, and captions are left out:
   *  they are a drawing's or a title's own measure. Tuned on two hand-labeled samples (§12). */
  const NOT_PROSE = 'svg, canvas, math, .katex, [class*="chart-"], figure, figcaption, [class*="collage"], [class*="qr"]';
  // The block a text run belongs to: its nearest ancestor that is not inline. A paragraph broken
  // up by inline `code` or `strong` is ONE run for the cram check. Measured per text node, a
  // fragment that starts at the end of one line and ends at the start of the next counted as three
  // lines of a dozen characters inside a paragraph thirty characters wide (flowchart's and
  // pricing's "When NOT to" cards at story/hall, §13).
  // Only plain `inline` (and `contents`, which draws no box) pools with its parent: an
  // inline-block or inline-flex chip is its own box with its own lines, and pooled with the
  // paragraph around it a crammed chip would hide behind the paragraph's long lines.
  const blockOf = (el, s) => { for (let a = el; a && a !== s; a = a.parentElement) if (!/^(inline|contents)$/.test(getComputedStyle(a).display)) return a; return s; };
  // Lines are clusters of rects by vertical center, not distinct tops: an inline code chip's box
  // is taller than the text beside it and starts a few pixels higher on the same line.
  const lineCount = (rects) => {
    const cs = rects.map((x) => [(x.top + x.bottom) / 2, x.height]).sort((a, b) => a[0] - b[0]);
    let n = 0, last = -Infinity, h = 0;
    for (const [c, ht] of cs) { if (c - last > Math.min(h || ht, ht) * 0.5) { n++; last = c; h = ht; } }
    return n;
  };
  function readable(s) {
    const body = parseFloat(getComputedStyle(s).fontSize) || 16;
    const w = document.createTreeWalker(s, NodeFilter.SHOW_TEXT);
    const drawn = [];
    const blocks = new Map();
    let n;
    while ((n = w.nextNode())) {
      const el = n.parentElement;
      if (!el || !n.textContent.trim() || el.closest(CHROME) || el.closest(NOT_PROSE) || !shown(el)) continue;
      const r = document.createRange();
      r.selectNodeContents(n);
      const rects = [...r.getClientRects()].filter((x) => x.width > 1);
      for (const x of rects) if (x.width > 2 && x.height > 2) drawn.push({ x, n });
      for (let a = el; a && a !== s.parentElement; a = a.parentElement) {
        const acs = getComputedStyle(a);
        if (!/hidden|clip/.test(acs.overflowX) || acs.textOverflow === 'ellipsis') continue;
        const box = a.getBoundingClientRect();
        if (rects.some((x) => x.right > box.right + 2 || x.left < box.left - 2)) return false;
      }
      // Measure each block's text against its OWN lines: a card's short bold title in its own block
      // must not drag its body's average down (that flagged readable list-steps cards).
      // A block holding inline material the check leaves out (KaTeX, an inline svg) is measured
      // a text node at a time, as before the block grouping: the left-out material takes width on the line but no
      // characters, so the block's average would read short (math's inline-formula prose).
      const blk0 = blockOf(el, s);
      // So is a block broken by `<br>` (the engine sets `breaks: true`, so every soft newline in a
      // source paragraph is one): its short lines are the author's, not a cram, and pooled they
      // read as one run of a dozen characters a line.
      // Code gets no cram check at all: a `<pre>` block's line breaks are its author's, so a run
      // that ends one line, crosses a blank one and starts the next is not a cram (compare-code's
      // `pd` / `signals =` at story@laptop). It is still checked for cuts and overprints above and
      // below.
      if (el.closest('pre')) continue;
      const blk = blk0.querySelector(`${NOT_PROSE}, br`) ? n : blk0;
      // Body-size text only: display type and captions are left out. A block is body text when
      // MOST of its characters are body size, so a smaller inline run inside a paragraph (a code
      // chip) still counts its characters, and a block that is all label (an eyebrow set as
      // inline code) is still left out.
      const fs = parseFloat(getComputedStyle(el).fontSize);
      const bodySize = !(fs > body * 1.6 || fs < body * 0.85);
      const g = blocks.get(blk) || { text: '', rects: [], node: blk === n, bodyChars: 0 };
      g.text += n.textContent;
      if (bodySize) g.bodyChars += n.textContent.trim().length;
      g.rects.push(...rects);
      blocks.set(blk, g);
      // An inline-block chip is its own block (above), but it also sits ON its parent's lines:
      // its characters count toward the parent's average too, or a row of chips and words reads
      // as short lines ("`list` — declared statements — the `principles` variant"). Characters
      // only; the parent's lines come from its own text.
      if (blk === blk0 && /^inline-/.test(getComputedStyle(blk0).display) && blk0 !== s) {
        const host = blockOf(blk0.parentElement, s);
        const h = blocks.get(host) || { text: '', rects: [], node: false, bodyChars: 0 };
        h.text += n.textContent;
        blocks.set(host, h);
      }
    }
    for (const { text: raw, rects, node, bodyChars } of blocks.values()) {
      const text = raw.replace(/\s+/g, ' ').trim();
      if (text.length < 24 || bodyChars * 2 < text.replace(/\s/g, '').length) continue;
      const lines = lineCount(rects);
      if (lines <= 2) continue;
      if (!node) { if (text.length / lines < 12) return false; continue; }
      // A lone text node usually starts and ends mid-line (after an inline formula, before
      // another), so its first and last lines are partial. Its INTERIOR lines are whole: size
      // them in characters from their width and the run's own average advance.
      const width = rects.reduce((a, x) => a + x.width, 0);
      const top = Math.min(...rects.map((x) => x.top));
      const bottom = Math.max(...rects.map((x) => x.bottom));
      const inner = rects.filter((x) => x.top > top + 1 && x.bottom < bottom - 1);
      const advance = width / text.length;
      if (inner.length && advance > 0 && Math.max(...inner.map((x) => x.width)) / advance < 12) return false;
    }
    // Text drawn over other text reads as garbage however long its lines are: redline's split NEW
    // column at story/hall (§12). Two line boxes of DIFFERENT runs overlap when they share more
    // than 4px across and over half the shorter one's height; adjacent lines touch, never share.
    for (let i = 0; i < drawn.length; i++) {
      for (let j = i + 1; j < drawn.length; j++) {
        if (drawn[i].n === drawn[j].n) continue;
        const a = drawn[i].x;
        const b = drawn[j].x;
        const across = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const down = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (across > 4 && down > Math.min(a.height, b.height) * 0.5) return false;
      }
    }
    return true;
  }

  /** The content's natural height as a share of the content cell: the cell sized to its content
   *  for one read, then restored. An invisible spacer was tried first and is wrong for layouts that
   *  absorb it (a list measured 60% spare while its content filled 96% of the cell). */
  function contentShare(s) {
    const stage = s.querySelector('.cell-stage');
    // UNKNOWN (null) where natural height is not the content's need: no content cell (the section's
    // own children are positioned chrome), or a drawing (svg, canvas, a chart body), which sizes
    // from its width once the cell's height is released. The margin then falls back to plain fit.
    if (!stage || stage.querySelector('svg, canvas, [class*="chart-"]')) return null;
    const box = stage.clientHeight;
    const prev = stage.getAttribute('style');
    stage.style.setProperty('height', 'auto', 'important');
    stage.style.setProperty('min-height', '0', 'important');
    stage.style.setProperty('max-height', 'none', 'important');
    stage.style.setProperty('flex', 'none', 'important');
    const natural = stage.scrollHeight;
    if (prev === null) stage.removeAttribute('style'); else stage.setAttribute('style', prev);
    return box > 0 ? natural / box : null;
  }
  /** Would the slide still fit with `m` (a share of its content cell) more content? It must fit by
   *  the export's probe, and its natural content height must leave `m` of the cell free. This is
   *  the margin a stateless file can decide with: whole only with room to spare, so a small edit
   *  near the edge does not flip it. */
  function fitsWithMargin(s, m) {
    if (!fitsSplit(s).ok) return false;
    const share = contentShare(s);
    return share === null ? true : share <= 1 - m;
  }

  /** The clip rescue's question: does the slide fit whole once its spacing tightens? No type size
   *  changes, by the owner's ruling (font-scale-fit Amendment (3)). Two corrections to plain
   *  `compact`, measured in 2026-10-28-fit-everywhere-model.md §9:
   *  - `section.compact` redefines the `--sp-*` scale WITHOUT the box's `--canvas-scale`, so at
   *    square / portrait / story it cuts spacing to 0.455 / 0.385 / 0.342 instead of 0.75. The
   *    probe sets each of the slide's own resolved spacing tokens to 0.75 of itself instead,
   *    which is the rescue as intended at every box.
   *  - a component whose manifest excludes `compact` (cfg.noCompact) is never rescued.
   *  It returns the page the rescue would make (fits, fill, a footer-only cut), and leaves the
   *  slide as it found it. */
  const SP = ['--sp-3xs', '--sp-2xs', '--sp-xs', '--sp-sm', '--sp-md', '--sp-lg', '--sp-xl', '--sp-2xl'];
  function compactPage(s) {
    const plain = fits(s, true);
    if (plain.ok) return { ok: true, fits: true, cut: null, fill: fill(s) };
    if ((cfg.noCompact || []).some((c) => s.classList.contains(c))) return { ok: false };
    const cs = getComputedStyle(s);
    const prev = SP.map((t) => [t, s.style.getPropertyValue(t), s.style.getPropertyPriority(t)]);
    for (const t of SP) {
      const v = cs.getPropertyValue(t).trim();
      if (v) s.style.setProperty(t, `calc(0.75 * (${v}))`, 'important');
    }
    const f = fits(s, true);
    const full = fits(s);
    const out = f.ok ? { ok: true, fits: full.ok, cut: full.ok ? null : 'footer', fill: fill(s) } : { ok: false };
    for (const [t, v, pr] of prev) {
      if (v) s.style.setProperty(t, v, pr);
      else s.style.removeProperty(t);
    }
    return out;
  }
  const fitsCompact = (s) => compactPage(s).ok;

  /** The slide sections, as the export enumerates them. */
  const sections = () => deckSlideSections(document);
  /** Broken markup (an unclosed tag) can reparent slides inside one another; the export then sees
   *  fewer slides than the document holds. A batch where the two disagree is not scored. */
  function census() {
    const deck = sections().length;
    const all = document.querySelectorAll('section[data-lattice-slide]').length;
    return { ok: deck === all, deck, all };
  }
  const fitsSplit = (s) => fits(s, true);

  /** The text leaves of a slide's content (no chrome), normalized: what conservation checks. */
  function leaves(s) {
    const out = [];
    const w = document.createTreeWalker(s, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      const el = n.parentElement;
      if (!el || el.closest(CHROME) || !shown(el)) continue;
      const t = norm(n.textContent);
      if (t.length > 1) out.push(t);
    }
    return out;
  }

  /** The share of the content area the page's ink spans, top of content to the footer line. */
  function fill(s) {
    const sr = s.getBoundingClientRect();
    const foot = s.querySelector('.cell-footer');
    const limit = foot ? foot.getBoundingClientRect().top : sr.bottom;
    const head = [...s.querySelectorAll(HEADS)].filter(shown).pop();
    const top0 = head && shown(head) ? head.getBoundingClientRect().bottom : sr.top;
    let top = Infinity;
    let bot = -Infinity;
    const w = document.createTreeWalker(s, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      const el = n.parentElement;
      if (!n.textContent.trim() || !el || el.closest(`${CHROME},${HEADS}`) || !shown(el)) continue;
      const rg = document.createRange();
      rg.selectNodeContents(n);
      const r = rg.getBoundingClientRect();
      if (!r.height) continue;
      top = Math.min(top, r.top);
      bot = Math.max(bot, r.bottom);
    }
    for (const m of s.querySelectorAll('svg,img,canvas')) {
      if (m.closest(`${CHROME},${HEADS}`) || !shown(m)) continue;
      const r = m.getBoundingClientRect();
      if (r.height > 8) { top = Math.min(top, r.top); bot = Math.max(bot, r.bottom); }
    }
    const avail = limit - top0;
    return bot > top && avail > 0 ? Math.round(Math.min(1.5, (bot - top) / avail) * 100) / 100 : 0;
  }

  /** Facts about one finished page. */
  function page(s) {
    const f = fits(s);
    // Where the first cut lands: chrome (the footer band; galleries write long footers) or content.
    return { fits: f.ok, px: f.px, cut: f.ok ? null : f.chrome ? 'footer' : f.unreadable ? 'unreadable' : f.px > 1 ? 'overflow' : 'content', fill: fill(s), leaves: leaves(s) };
  }

  // ── the fit-first builder (policy arm) ─────────────────────────────────────────────────────
  const visible = (el) => el.getBoundingClientRect().height > 4 && getComputedStyle(el).display !== 'none';
  // Hide and restore WITHOUT losing an authored inline `display` (a QR svg's `display:block`,
  // a Mermaid label's): the builder hides children of the source slide itself.
  const prior = new WeakMap();
  const hide = (el) => {
    if (el.dataset.fitHidden) return;
    prior.set(el, [el.style.getPropertyValue('display'), el.style.getPropertyPriority('display')]);
    el.dataset.fitHidden = '1';
    el.style.setProperty('display', 'none', 'important');
  };
  const unhide = (el) => {
    if (!el.dataset.fitHidden) return;
    delete el.dataset.fitHidden;
    const [v, p] = prior.get(el) || ['', ''];
    if (v) el.style.setProperty('display', v, p); else el.style.removeProperty('display');
  };
  const kids = (c) => [...c.children].filter(visible);

  /** The container whose children stay whole: the slide fits with only its first child shown.
   *  Most children wins (the finest grain), then the shallowest. */
  function collection(s) {
    const stage = s.querySelector('.cell-stage') || s;
    const ok = [];
    for (const el of [stage, ...stage.querySelectorAll('*')]) {
      if (el.closest(`${CHROME},svg`)) continue;
      const k = kids(el);
      if (k.length < 2) continue;
      k.slice(1).forEach(hide);
      const f = fitsSplit(s).ok;
      k.slice(1).forEach(unhide);
      if (!f) continue;
      let depth = 0;
      for (let p = el; p && p !== s; p = p.parentElement) depth++;
      ok.push({ el, n: k.length, depth });
    }
    ok.sort((a, b) => b.n - a.n || a.depth - b.depth);
    return ok.length ? ok[0].el : null;
  }
  /** Material outside the collection: before it rides page 1, after it rides the last page. */
  function aside(coll, stage) {
    const pre = [];
    const post = [];
    for (let el = coll; el && el !== stage; el = el.parentElement) {
      let sib = el.previousElementSibling;
      while (sib) { pre.push(sib); sib = sib.previousElementSibling; }
      sib = el.nextElementSibling;
      while (sib) { post.push(sib); sib = sib.nextElementSibling; }
    }
    return { pre: pre.filter(visible), post: post.filter(visible) };
  }
  function runHead(pg, title, src) {
    const foot = src.querySelector('.cell-footer');
    const fcs = foot ? getComputedStyle(foot) : null;
    const d = document.createElement('div');
    d.className = 'fit-runhead';
    d.textContent = title;
    const fs = fcs ? parseFloat(fcs.fontSize) * 1.15 : 18;
    d.style.cssText = `font-size:${fs}px;letter-spacing:.06em;text-transform:uppercase;font-family:${fcs ? fcs.fontFamily : 'monospace'};color:${fcs ? fcs.color : '#555'};padding:0 0 ${fs * 0.8}px;flex:none;`;
    const mast = pg.querySelector('.cell-masthead');
    if (mast) { hide(mast); mast.before(d); } else pg.prepend(d);
  }
  /**
   * Build fit-first pages for one slide in place. The slide stays whole when it fits; otherwise
   * it is cut at the collection's children, as many a page as fit (greedy) or the same count
   * spread evenly (balanced). A cut that leaves any page not fitting is NOT taken: the slide
   * stays whole and the reason says why.
   */
  function build(s, policy) {
    const t0 = performance.now();
    const done = (pages, how) => ({ pages, how, ms: Math.round((performance.now() - t0) * 10) / 10 });
    if (fitsSplit(s).ok) return done([s], 'fits');
    const coll = collection(s);
    if (!coll) return done([s], 'no-cut');
    const path = [];
    for (let el = coll; el && el !== s; el = el.parentElement) path.unshift([...el.parentElement.children].indexOf(el));
    const locate = (pg) => path.reduce((el, ix) => el?.children[ix], pg);
    const title = (s.querySelector('h1,h2')?.textContent || '').replace(/\s+/g, ' ').trim();
    const n = kids(coll).length;
    const made = [];
    const newPage = () => {
      const pg = s.cloneNode(true);
      pg.removeAttribute('id');
      (made.length ? made[made.length - 1] : s).after(pg);
      const c = locate(pg);
      const atoms = kids(c);
      const { pre, post } = aside(c, pg.querySelector('.cell-stage') || pg);
      if (made.length) { runHead(pg, title, s); pre.forEach(hide); }
      post.forEach(hide);
      atoms.forEach(hide);
      pg.__fit = { atoms, post };
      made.push(pg);
      return pg;
    };
    // greedy first: it also tells the balanced pass how many pages it needs
    const counts = [];
    let i = 0;
    while (i < n) {
      const pg = newPage();
      const { atoms } = pg.__fit;
      let j = i;
      unhide(atoms[j]);
      j++;
      while (j < n) { unhide(atoms[j]); if (!fitsSplit(pg).ok) { hide(atoms[j]); break; } j++; }
      counts.push(j - i);
      i = j;
    }
    if (policy.pack === 'balanced' && made.length > 1) {
      const per = Math.ceil(n / made.length);
      let k = 0;
      made.forEach((pg, p) => {
        const { atoms } = pg.__fit;
        atoms.forEach(hide);
        const take = p === made.length - 1 ? n - k : Math.min(per, n - k);
        for (let a = k; a < k + take; a++) unhide(atoms[a]);
        k += take;
      });
      // If the even spread does not fit, keep the greedy cut: balance is not worth a clip.
      if (made.some((pg) => !fitsSplit(pg).ok)) {
        let g = 0;
        made.forEach((pg, p) => { const { atoms } = pg.__fit; atoms.forEach(hide); for (let a = g; a < g + counts[p]; a++) unhide(atoms[a]); g += counts[p]; });
      }
    }
    const last = made[made.length - 1];
    last.__fit.post.forEach(unhide);
    if (last.__fit.post.length && !fitsSplit(last).ok) {
      last.__fit.post.forEach(hide);
      const close = newPage();
      close.__fit.atoms.forEach(hide);
      close.__fit.post.forEach(unhide);
    }
    if (made.some((pg) => !fitsSplit(pg).ok)) {
      for (const pg of made) pg.remove();
      return done([s], 'cut-still-clips');
    }
    s.style.setProperty('display', 'none', 'important');
    return done(made, 'cut');
  }

  window.__fit = { fits, fitsWithMargin, fitsCompact, compactPage, contentShare, leaves, fill, page, build, sections, census };
}

module.exports = { PAGE_SRC: `(${install.toString()})` };
