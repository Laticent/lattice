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
    if (p.clipSuspect) {
      const c = probeContentClipped(s, cfg.ignoreSel, cfg.tol, cfg.bearerSel);
      if (c.cut) {
        if (forSplit && c.chromeOnly) return { ok: true, px: 0, chrome: false };
        return { ok: false, px: 1, first: c.first, chrome: !!c.chromeOnly };
      }
    }
    return { ok: true, px: 0, chrome: false };
  }

  /** Would the slide still fit with `m` (a share of its content area) more content? An invisible
   *  block that tall joins the end of the content cell and the export's probe asks again. This is
   *  the margin a stateless file can decide with: whole only with room to spare, so a small edit
   *  near the edge does not flip it. */
  function fitsWithMargin(s, m) {
    if (!fitsSplit(s).ok) return false;
    const stage = s.querySelector('.cell-stage') || s;
    const spacer = document.createElement('div');
    spacer.className = 'fit-margin-probe';
    spacer.style.cssText = `height:${Math.round(m * stage.clientHeight)}px;flex:none;width:1px;`;
    stage.appendChild(spacer);
    const ok = fitsSplit(s).ok;
    spacer.remove();
    return ok;
  }

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
    return { fits: f.ok, px: f.px, cut: f.ok ? null : f.chrome ? 'footer' : f.px > 1 ? 'overflow' : 'content', fill: fill(s), leaves: leaves(s) };
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

  window.__fit = { fits, fitsWithMargin, leaves, fill, page, build, sections, census };
}

module.exports = { PAGE_SRC: `(${install.toString()})` };
