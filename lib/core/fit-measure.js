/* eslint-disable no-undef */
/**
 * fit-measure — read the facts the measured plan needs from a deck rendered WHOLE at its box and
 * venue: which authored slides overflow, and for each one that does, its members' heights and the
 * room a body page leaves for them. `@laticent/fluido`'s `pack` turns those facts into page sizes,
 * and `splitDoc` builds the pages (engineering/decisions/2026-10-28-fit-everywhere-model.md §16).
 *
 * `measureFit` is injected into the page as source (`MEASURE_FIT_SRC`), so everything it uses
 * travels inside it. "This slide does not fit" is the shared verdict (`fitVerdict` below, passed
 * in as source with its config): the overflow probe, a content clip outside chrome, or crammed prose.
 * The first full bake-off used the overflow probe alone and kept 115 slides whole that read as
 * crammed, and 35 that clipped (§16). A cut only in chrome (a long footer line) still counts as
 * fitting, because splitting cannot fix chrome.
 *
 * The members are the slide's first list's items, or its first table body's rows: the two seams
 * the plain envelope cuts at (`partitionAxis`). A slide whose builder counts a different set (a
 * recipe that re-reads its points) refuses a plan whose sizes do not sum to its own count, and
 * splits as it does today, so a wrong guess here costs a measured plan, never a member.
 */
/**
 * The fit verdict: one answer to "does this page fit?", shared by the export's measured split
 * (through lattice.js --fit-pack) and the fit harness that scores every
 * split policy (tools/lib/fit-harness/page.js). A page fits when the export's overflow probe
 * passes, no content is clipped outside chrome, and its prose is readable
 * (engineering/decisions/2026-10-28-fit-everywhere-model.md §12, §16). The harness grew this
 * verdict first; the measured split used only the overflow probe and kept slides whole that the
 * harness then scored as clipped or crammed (§16, the first full bake-off). One verdict, two
 * callers (HARD RULE #1).
 *
 * `fitVerdict(cfg)` is injected into a page as source (`FIT_VERDICT_SRC`), so everything it uses
 * travels inside it. `cfg` carries the probe sources and the export's selectors and tolerance:
 * `{ probeSrc, ccSrc, clipSel, ignoreSel, bearerSel, tol }`.
 */

function fitVerdict(cfg) {
  const probeSectionOverflow = new Function(`return (${cfg.probeSrc})`)();
  const probeContentClipped = new Function(`return (${cfg.ccSrc})`)();
  // Chrome: never content, so never counted as content lost or as ink. The page number sits
  // outside `.cell-footer` on some frames (split-panel, title, closing), and the split's own
  // running head is chrome the same way the fit arms' is.
  const CHROME = 'section > header,.cell-footer,.lat-pagination,.marker-rail,.slide-edge,.fixme-tab,[aria-hidden="true"],.fit-runhead,.split-runhead,.lat-cont,.lat-split-label,footer';
  const shown = (el) => { for (let x = el; x; x = x.parentElement) if (getComputedStyle(x).display === 'none') return false; return true; };

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

  return { fits, readable, shown, CHROME };
}

function measureFit(fitVerdict, cfg, deckSlides) {
  const { fits } = fitVerdict(cfg);
  const num = (v) => {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };
  const visible = (el) => el.getBoundingClientRect().height > 0 && getComputedStyle(el).display !== 'none';
  const members = (s) => {
    const stage = s.querySelector('.cell-stage') || s;
    const list = stage.querySelector('ul, ol');
    if (list) {
      const items = [...list.children].filter((el) => el.tagName === 'LI' && visible(el));
      if (items.length >= 2) return { container: list, items };
    }
    const body = stage.querySelector('table > tbody');
    if (body) {
      const rows = [...body.children].filter((el) => el.tagName === 'TR' && visible(el));
      if (rows.length >= 2) return { container: body.parentElement, items: rows };
    }
    return null;
  };
  // Release what stretches or squeezes a member, read, then put every inline style back exactly.
  // A member's height on a page is its NATURAL height: a layout that stretches rows to fill the
  // stage (the agenda's tracks, cards-stretch) hands it the stage's spare room, and one that
  // shrinks flex items to fit (the checklist) hands it less than its text needs. Neither is what
  // a body page will give it.
  const RELEASE_ITEM = ['flex', '0 0 auto', 'height', 'auto', 'min-height', '0', 'max-height', 'none', 'align-self', 'start'];
  const RELEASE_BOX = ['height', 'auto', 'max-height', 'none', 'align-items', 'start', 'align-content', 'start', 'grid-auto-rows', 'auto', 'grid-template-rows', 'none'];
  const release = (el, pairs, saved) => {
    saved.push([el, el.getAttribute('style')]);
    for (let i = 0; i < pairs.length; i += 2) el.style.setProperty(pairs[i], pairs[i + 1], 'important');
  };
  const natural = (m) => {
    const saved = [];
    release(m.container, RELEASE_BOX, saved);
    for (const el of m.items) if (el.tagName === 'LI') release(el, RELEASE_ITEM, saved);
    const heights = m.items.map((el) => {
      // The box after release, and the extent of everything inside it, text included (a Range
      // sees text nodes; an element walk does not, and missed a wrapped line after a <strong>).
      const r = el.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(el);
      const c = range.getBoundingClientRect();
      const ecs = getComputedStyle(el);
      const content = c.height > 0 ? c.bottom - r.top + num(ecs.paddingBottom) + num(ecs.borderBottomWidth) : 0;
      return Math.ceil(Math.max(r.height, content, el.scrollHeight));
    });
    const rects = m.items.map((el) => el.getBoundingClientRect());
    const gaps = [];
    for (let i = 1; i < rects.length; i++) gaps.push(Math.max(0, rects[i].top - rects[i - 1].bottom));
    for (const [el, style] of saved.reverse()) {
      if (style === null) el.removeAttribute('style');
      else el.setAttribute('style', style);
    }
    gaps.sort((a, b) => a - b);
    return { heights, gap: gaps.length ? Math.ceil(gaps[Math.floor(gaps.length / 2)]) : 0 };
  };
  const measureSlide = (s) => {
    const slide = s.getAttribute('data-lattice-slide');
    if (fits(s, true).ok) return { slide, over: false };
    const m = members(s);
    if (!m) return { slide, over: true, members: null };
    // The room a BODY page leaves for members: the section's content box, down to the footer
    // band when one sits in flow, less the member container's own padding and border. A body
    // page carries no masthead (the cover takes it) and no lede, note or insight (the cover and
    // the closing page take them), so this is the space members can use. It is an estimate the
    // host checks: a body page that still overflows tightens it and plans again.
    const sr = s.getBoundingClientRect();
    const cs = getComputedStyle(s);
    const top = sr.top + num(cs.paddingTop);
    let bottom = sr.bottom - num(cs.paddingBottom);
    const foot = s.querySelector('.cell-footer');
    if (foot && visible(foot)) {
      const fs = getComputedStyle(foot);
      if (fs.position !== 'absolute' && fs.position !== 'fixed') bottom = Math.min(bottom, foot.getBoundingClientRect().top);
    }
    const cc = getComputedStyle(m.container);
    const inset = num(cc.paddingTop) + num(cc.paddingBottom) + num(cc.borderTopWidth) + num(cc.borderBottomWidth);
    return { slide, over: true, members: natural(m), capacity: Math.floor(bottom - top - inset) };
  };
  // The deck's OWN slides (lib/core/deck-slides.js): a section an author pasted inside a slide
  // carries a slide number too, and must not overwrite the real slide's facts.
  const out = [];
  for (const s of deckSlides(document)) {
    if (/^\d+$/.test(s.getAttribute('data-lattice-slide') || '')) out.push(measureSlide(s));
  }
  return out;
}

/**
 * Which BODY pages of the split deck still do not fit, by the same verdict, by authored slide:
 * `{ [slide]: px }`, the deepest vertical excess among that slide's body pages, or 0 when a page
 * fails without one (a clip inside the frame, crammed prose) and the host must pick the step.
 * Only body pages count: packing fewer members cannot fix a cover or a closing page.
 */
function overflowBySlide(fitVerdict, cfg, deckSlides) {
  const { fits } = fitVerdict(cfg);
  const out = {};
  for (const s of deckSlides(document)) {
    if (s.getAttribute('data-split-role') !== 'body') continue;
    const n = (s.getAttribute('data-lattice-slide') || '').split('.')[0];
    const f = fits(s, true);
    if (f.ok) continue;
    const depth = f.px > 1 ? Math.ceil(f.px) : 0;
    out[n] = Math.max(out[n] ?? 0, depth);
  }
  return out;
}

module.exports = {
  fitVerdict,
  FIT_VERDICT_SRC: fitVerdict.toString(),
  measureFit,
  overflowBySlide,
  MEASURE_FIT_SRC: measureFit.toString(),
  OVERFLOW_BY_SLIDE_SRC: overflowBySlide.toString(),
};
