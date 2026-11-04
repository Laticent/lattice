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

function measureFit(fitVerdict, cfg, deckSlides, remembered) {
  // `remembered`: slides a live surface last showed SPLIT. For one of those that now fits, the host
  // needs more than "fits": its content share (does it fit with 30% spare, the rejoin rule) and its
  // members (do the remembered pages still fit). Other slides that fit are not measured further.
  const keep = new Set((remembered || []).map(String));
  // SPLIT BEFORE HOLD (fit-everywhere-model.md §17). A table or card row whose narrow form would
  // overflow its slide is held in its wide form (`lat-reflow-held`, lib/core/table-reflow-fit.js).
  // The preview runtime runs that hold after fonts and a frame, so whether a surface measured before
  // or after it was timing: the CLI saw the narrow form and split a pricing slide, the Studio saw
  // the held row and did not. The measure releases every hold first, synchronously, so every surface
  // measures the narrow form and the split decides; the hold then acts only on what still does not
  // fit after the split (the CLI's explicit pass, the runtime on the split preview).
  for (const el of document.querySelectorAll('.lat-reflow-held')) el.classList.remove('lat-reflow-held');
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
  // The content cell's natural height as a share of the cell: the cell sized to its content for one
  // read, then restored (the harness's `contentShare`). Null where natural height is not the
  // content's need: no content cell, or a drawing, which sizes from its width.
  const contentShare = (s) => {
    const stage = s.querySelector('.cell-stage');
    if (!stage || stage.querySelector('svg, canvas, [class*="chart-"]')) return null;
    const box = stage.clientHeight;
    const prev = stage.getAttribute('style');
    for (const [k, v] of [['height', 'auto'], ['min-height', '0'], ['max-height', 'none'], ['flex', 'none']]) stage.style.setProperty(k, v, 'important');
    const need = stage.scrollHeight;
    if (prev === null) stage.removeAttribute('style');
    else stage.setAttribute('style', prev);
    return box > 0 ? need / box : null;
  };
  // The room a BODY page leaves for members: the section's content box, down to the footer band
  // when one sits in flow, less the member container's own padding and border. A body page carries
  // no masthead (the cover takes it) and no lede, note or insight (the cover and the closing page
  // take them), so this is the space members can use. It is an estimate the host checks: a body
  // page that still overflows tightens it and plans again.
  const roomOf = (s, m) => {
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
    return Math.floor(bottom - top - inset);
  };
  // The slide's trailing beats — the key insight and the below-note, which a split moves off the
  // body pages — as the height they would take below the last member (each one's box plus the
  // members' gap before it). 0 when there are none. The host folds them onto the last body page
  // when they fit there, instead of ending the run on a page that holds nothing else.
  const codaOf = (s, m) => {
    let h = 0;
    const gap = m.items.length > 1 ? Math.max(0, m.items[1].getBoundingClientRect().top - m.items[0].getBoundingClientRect().bottom) : 0;
    for (const el of s.querySelectorAll('blockquote, .cell-coda, .below-note')) {
      if (m.container.contains(el) || el.closest('.cell-coda') !== el && el.closest('.cell-coda')) continue;
      if (!(m.container.compareDocumentPosition(el) & 4) || !visible(el)) continue;
      h += Math.ceil(el.getBoundingClientRect().height) + gap;
    }
    return h;
  };
  const measureSlide = (s) => {
    const slide = s.getAttribute('data-lattice-slide');
    if (fits(s, true).ok) {
      if (!keep.has(slide)) return { slide, over: false };
      const m = members(s);
      return m ? { slide, over: false, share: contentShare(s), members: natural(m), capacity: roomOf(s, m) } : { slide, over: false, share: contentShare(s) };
    }
    const m = members(s);
    if (!m) return { slide, over: true, members: null };
    return { slide, over: true, members: natural(m), capacity: roomOf(s, m), coda: codaOf(s, m) };
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
  // The same release as `measureFit`: a body page is verified in the narrow form it was planned in.
  for (const el of document.querySelectorAll('.lat-reflow-held')) el.classList.remove('lat-reflow-held');
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

/**
 * The measured split's DECISIONS, shared by every surface that splits a deck: the CLI
 * export (lattice.js --fit-pack), the Studio and the Playground preview (HARD RULE #1). Pure and
 * fs-free: measured facts in (lib/core/fit-measure.js `measureFit`), a plan out, which `splitDoc`
 * builds through `{ plan }` (engineering/decisions/2026-10-28-fit-everywhere-model.md §16).
 *
 * Three calls:
 *
 * - `planFromFacts(facts, room, pack, packer, memory)` turns each slide's facts into its entry in the
 *   plan: `'whole'`, an array of page sizes, or nothing (today's split).
 * - `measuredSplit({ facts, pack, packer, memory, split, verify })` runs the whole loop for any host:
 *   plan, split, verify, and tighten a slide whose body page still does not fit, at most three
 *   rounds; a slide a tighter room cannot help goes back on today's split at once.
 * - `nextMemory(facts, plan)` is what a LIVE surface remembers between edits, so a split does
 *   not flicker while an author types (§11, the owner's pick, hysteresis-0-30 with fixes B and C):
 *   - no entry margin: a slide that stops fitting splits at once;
 *   - fix C, rejoin: a split slide goes back to one page only when the whole slide fits with 30% of
 *     its content area spare, so an edit that frees a line does not rejoin and re-split;
 *   - members a page are kept while they still fit, so a small edit does not move members between
 *     pages; when a page stops fitting the run keeps its page count if any packing still fits
 *     (`packInto`), and only a member added or removed, or a run that cannot fit its old page
 *     count, packs afresh.
 *   Fix B (the split decision rides the undo stack) is the host's: it stores the memory beside its
 *   history and restores it on undo, which is why the memory is a plain JSON value.
 *
 * The CLI renders once and passes no memory, so its plan is the stateless one the bake-off scored.
 */

const REJOIN_SPARE = 0.3;
/**
 * A FRESH pack fills a page to at most this share of its room; a page the memory keeps may fill
 * to all of it. The spare tenth is what lets a ±10% edit keep its pages: packed to the brim, every
 * page of a run overflowed on the next few words (§16, jank with memory: 7.3% of edits on split
 * slides changed their page count, all of them text growing into a full page).
 */
const HEADROOM = 0.9;

/** The page sizes `sizes` still place `heights` within `capacity` with `gap` between members. */
function sizesStillFit(sizes, heights, gap, capacity) {
  if (!Array.isArray(sizes) || sizes.reduce((a, b) => a + b, 0) !== heights.length) return false;
  let i = 0;
  for (const s of sizes) {
    if (!(s >= 1)) return false;
    let load = 0;
    for (let k = 0; k < s; k++) load += heights[i + k];
    load += gap * Math.max(0, s - 1);
    if (load > capacity) return false;
    i += s;
  }
  return true;
}

/**
 * The contiguous packing of `heights` into EXACTLY `pages` pages that fits `capacity` and keeps
 * the fullest page as low as it can, or null when none fits. A remembered split whose pages stop
 * fitting tries this first, so a small edit keeps the run's page count whenever it still can.
 */
function packInto(heights, gap, capacity, pages) {
  const n = heights.length;
  if (!(pages >= 1) || pages > n) return null;
  const pre = [0];
  for (const h of heights) pre.push(pre[pre.length - 1] + h);
  const load = (from, to) => pre[to] - pre[from] + gap * Math.max(0, to - from - 1);
  const best = Array.from({ length: pages + 1 }, () => new Array(n + 1).fill(Number.POSITIVE_INFINITY));
  const from = Array.from({ length: pages + 1 }, () => new Array(n + 1).fill(-1));
  best[0][0] = 0;
  for (let p = 1; p <= pages; p++) {
    for (let i = p; i <= n; i++) {
      for (let j = i - 1; j >= p - 1; j--) {
        const l = load(j, i);
        if (l > capacity) break;
        const worst = Math.max(best[p - 1][j], l);
        if (worst < best[p][i]) {
          best[p][i] = worst;
          from[p][i] = j;
        }
      }
    }
  }
  if (!Number.isFinite(best[pages][n])) return null;
  const sizes = [];
  for (let p = pages, i = n; p > 0; p--) {
    const j = from[p][i];
    sizes.unshift(i - j);
    i = j;
  }
  return sizes;
}

/** The page sizes a plan entry names: the entry itself, or its `sizes` when it also folds the coda. */
function sizesOf(entry) {
  if (Array.isArray(entry)) return entry;
  return entry && Array.isArray(entry.sizes) ? entry.sizes : null;
}

/**
 * A packing, and whether the slide's trailing beats (`f.coda`, the key insight and below-note)
 * ride its LAST body page rather than a closing page of their own: when the last page still
 * leaves them room. A run that ended on a page holding one short insight read as a blank page
 * (the owner's decks, §16).
 */
function withFold(sizes, f, capacity) {
  if (!(f.coda > 0)) return sizes;
  const { heights, gap } = f.members;
  const n = sizes[sizes.length - 1];
  let load = 0;
  for (let k = heights.length - n; k < heights.length; k++) load += heights[k];
  load += gap * Math.max(0, n - 1);
  return load + f.coda <= capacity ? { sizes, foldCoda: true } : sizes;
}

/**
 * The plan for every measured slide. `room` maps a slide to the room a body page leaves for its
 * members (the host may tighten it between rounds); `pack` is `@laticent/fluido`'s pack.
 * `memory`, when given, is `{ [slide]: { split: boolean, sizes?: number[] } }` from the last render.
 */
function planFromFacts(facts, room, pack, packer, memory) {
  // Seed the room from the facts the first time; a verify round tightens it in place.
  for (const f of facts) if (f.members && typeof f.capacity === 'number' && !Object.hasOwn(room, f.slide)) room[f.slide] = f.capacity;
  const plan = {};
  for (const f of facts) {
    const was = memory?.[f.slide];
    if (!f.over) {
      // Fits whole. A slide that was split rejoins only with 30% spare (fix C); without a share to
      // read (no content cell, a drawing) it rejoins as soon as it fits, as the stateless plan does.
      const keepSplit = was?.split && typeof f.share === 'number' && f.share > 1 - REJOIN_SPARE && Array.isArray(was.sizes);
      const cap = Object.hasOwn(room, f.slide) ? room[f.slide] : f.capacity;
      if (keepSplit && f.members && sizesStillFit(was.sizes, f.members.heights, f.members.gap, cap)) plan[f.slide] = was.sizes;
      else plan[f.slide] = 'whole';
      continue;
    }
    if (!f.members || !Object.hasOwn(room, f.slide)) continue;
    const { heights, gap } = f.members;
    // Memory applies to the SAME members only: an item added or removed packs afresh.
    const sameCount = was?.split && Array.isArray(was.sizes) && was.sizes.reduce((a, b) => a + b, 0) === heights.length;
    if (sameCount && sizesStillFit(was.sizes, heights, gap, room[f.slide])) {
      plan[f.slide] = withFold(was.sizes, f, room[f.slide]);
      continue;
    }
    // A remembered split whose pages stop fitting keeps its page count when some packing still can.
    const same = sameCount ? packInto(heights, gap, room[f.slide] * HEADROOM, was.sizes.length) || packInto(heights, gap, room[f.slide], was.sizes.length) : null;
    if (same) {
      plan[f.slide] = withFold(same, f, room[f.slide]);
      continue;
    }
    const sizes = pack({ heights, gap, capacity: room[f.slide] * HEADROOM }, packer) || pack({ heights, gap, capacity: room[f.slide] }, packer);
    if (sizes) plan[f.slide] = withFold(sizes, f, room[f.slide]);
  }
  return plan;
}

/**
 * The whole measured split, for any host: plan, split, verify, tighten, at most three rounds.
 * `split(plan)` builds the deck from a plan and resolves to `splitDoc`'s result (it must carry
 * `planned`); `verify()` resolves to `overflowBySlide`'s answer on the split it just built. A body
 * page that still does not fit tightens its slide's room; a slide a tighter room cannot help (it
 * packs the same pages) goes back on today's split at once, and so does every slide still failing
 * after the third round. A slide sent back stays back for the rest of the loop.
 * Resolves to `{ result, plan, rounds, fellBack, planMs }`.
 */
async function measuredSplit({ facts, pack, packer, memory, split, verify, foldable }) {
  const room = {};
  const dropped = new Set();
  let planMs = 0;
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const replan = () => {
    const t = now();
    const p = planFromFacts(facts, room, pack, packer, memory);
    for (const n of dropped) delete p[n];
    planMs += now() - t;
    return p;
  };
  let plan = replan();
  let result = await split(plan);
  let rounds = 1;
  for (let round = 0; round < 3; round++) {
    const over = (await verify()) || {};
    const used = new Set(result.planned || []);
    const tighten = Object.keys(over).filter((n) => used.has(n) && sizesOf(plan[n]) && Object.hasOwn(room, n));
    if (!tighten.length) break;
    // A known excess tightens by itself; a clip or a cram with no excess, by a tenth of the room.
    for (const n of tighten) room[n] -= over[n] > 0 ? over[n] + 2 : Math.ceil(room[n] * 0.1);
    const next = replan();
    for (const n of tighten) if (round >= 2 || JSON.stringify(next[n]) === JSON.stringify(plan[n])) dropped.add(n);
    for (const n of dropped) delete next[n];
    plan = next;
    result = await split(plan);
    rounds += 1;
    if (tighten.every((n) => dropped.has(n))) break;
  }
  // FOLD: a run that ends on a closing page holding only its beats, where the last body page has
  // room for them, folds them onto that page (`foldable()`, the host's `foldableBySlide` on the
  // split it just built). One more split; a fold that overflows its page is undone.
  if (typeof foldable === 'function') {
    const folds = ((await foldable()) || []).filter((n) => !dropped.has(n) && plan[n] !== 'whole');
    if (folds.length) {
      const before = {};
      for (const n of folds) {
        before[n] = plan[n];
        const sizes = sizesOf(plan[n]);
        plan[n] = sizes ? { sizes, foldCoda: true } : { foldCoda: true };
      }
      result = await split(plan);
      rounds += 1;
      const over = (await verify()) || {};
      const undo = folds.filter((n) => Object.hasOwn(over, n));
      if (undo.length) {
        for (const n of undo) {
          if (before[n] === undefined) delete plan[n];
          else plan[n] = before[n];
        }
        result = await split(plan);
        rounds += 1;
      }
    }
  }
  return { result, plan, rounds, fellBack: dropped.size, planMs };
}

/** What a live surface keeps for the next render: each measured slide's split decision and sizes. */
function nextMemory(facts, plan) {
  const out = {};
  for (const f of facts) {
    const p = sizesOf(plan[f.slide]);
    if (p) out[f.slide] = { split: true, sizes: p.slice() };
    else if (plan[f.slide] === 'whole') out[f.slide] = { split: false };
  }
  return out;
}

/**
 * Which split runs end on a closing page that holds only their trailing beats (the key insight,
 * the below-note) while the last body page before it has room for them: `[slide, …]`. Measured
 * on the split deck itself, so it serves every builder, including the recipes whose pages no list
 * packing predicts (compare-prose's read-across, a decision's options). The free room is the
 * space under the last body page's drawn content (its last line or picture, not its boxes, which a
 * stretched layout draws to the bottom), down to its footer line when one sits in flow; the beats
 * need their own height plus one gap. The host folds what this names and verifies again, and undoes
 * a fold whose page then overflows.
 */
function foldableBySlide(deckSlides) {
  const runs = {};
  for (const s of deckSlides(document)) {
    const n = (s.getAttribute('data-lattice-slide') || '').split('.')[0];
    (runs[n] ||= []).push(s);
  }
  const shown = (el) => el.getBoundingClientRect().height > 0 && getComputedStyle(el).display !== 'none';
  const out = [];
  for (const [n, pages] of Object.entries(runs)) {
    const at = pages.findIndex((p) => p.getAttribute('data-split-role') === 'closing');
    if (at < 1 || pages[at - 1].getAttribute('data-split-role') !== 'body') continue;
    const closing = pages[at];
    const beats = [...closing.querySelectorAll('blockquote, .cell-coda, .below-note')].filter((el) => shown(el) && !el.parentElement.closest('blockquote, .cell-coda, .below-note'));
    if (!beats.length) continue;
    // A closing page that also carries anything else (a list, a table, a figure) is not only beats.
    if (closing.querySelector('.cell-stage :is(ul, ol, table, figure, svg, img)')) continue;
    const last = pages[at - 1];
    const stage = last.querySelector('.cell-stage') || last;
    // Where the drawn content ENDS — its last line of text or picture — not its boxes, which a
    // layout that stretches its columns to the cell (compare-prose, a split panel) draws to the
    // bottom whatever they hold.
    let contentBottom = Number.NEGATIVE_INFINITY;
    let contentTop = Number.POSITIVE_INFINITY;
    const walk = document.createTreeWalker(stage, NodeFilter.SHOW_TEXT);
    for (let t = walk.nextNode(); t; t = walk.nextNode()) {
      if (!t.textContent.trim() || !t.parentElement || !shown(t.parentElement)) continue;
      const r = document.createRange();
      r.selectNodeContents(t);
      const b = r.getBoundingClientRect();
      if (b.height > 0) { contentBottom = Math.max(contentBottom, b.bottom); contentTop = Math.min(contentTop, b.top); }
    }
    for (const m of stage.querySelectorAll('img, svg, canvas, video')) {
      const b = m.getBoundingClientRect();
      if (b.height > 8) { contentBottom = Math.max(contentBottom, b.bottom); contentTop = Math.min(contentTop, b.top); }
    }
    if (!Number.isFinite(contentBottom)) continue;
    // A content page CENTERS its members (§16, the owner's card-alignment ruling), so the room is
    // split above and below them. Folding re-centers the group with the beats in it, so the room
    // that counts is both halves: the stage's top to the content's first line, and the content's
    // last line to the footer. Counting only the room below saw half of it and folded too rarely.
    const stageTop = stage.getBoundingClientRect().top + (Number.parseFloat(getComputedStyle(stage).paddingTop) || 0);
    const above = Math.max(0, contentTop - stageTop);
    const sr = last.getBoundingClientRect();
    let limit = sr.bottom - (Number.parseFloat(getComputedStyle(last).paddingBottom) || 0);
    const foot = last.querySelector('.cell-footer');
    if (foot && shown(foot) && !/absolute|fixed/.test(getComputedStyle(foot).position)) limit = Math.min(limit, foot.getBoundingClientRect().top);
    const gap = Number.parseFloat(getComputedStyle(stage).rowGap) || 16;
    const need = beats.reduce((h, el) => h + el.getBoundingClientRect().height + gap, 0);
    if (above + (limit - contentBottom) >= need) out.push(n);
  }
  return out;
}

module.exports = {
  foldableBySlide,
  FOLDABLE_SRC: foldableBySlide.toString(),
  HEADROOM,
  sizesOf,
  planFromFacts,
  packInto,
  measuredSplit,
  nextMemory,
  sizesStillFit,
  REJOIN_SPARE,
  fitVerdict,
  FIT_VERDICT_SRC: fitVerdict.toString(),
  measureFit,
  overflowBySlide,
  MEASURE_FIT_SRC: measureFit.toString(),
  OVERFLOW_BY_SLIDE_SRC: overflowBySlide.toString(),
};
