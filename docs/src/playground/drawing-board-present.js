// The Drawing Board — Present mode (the live presentation player).
//
// Practice's calmer sibling. Where Practice REHEARSES (a coaching brain: pacing,
// timed beats, read-aloud, a talk-length plan), Present just PRESENTS: a clean
// full-screen player you drive in front of an audience — navigate, full-screen,
// glance at your speaker notes, and (on a desktop with a projector) run a
// dual-screen presenter view. No clock pressure, no coaching scrim, no model.
//
// It is the in-app home of the player designed for the self-contained `.html`
// export (engineering/decisions/2026-06-16-lattice-export-format.md §2c/§2d):
// three capability tiers (desktop dual-screen · desktop single-screen · mobile),
// a UNIVERSAL slide-up notes sheet, and the reveal.js-style dual-screen presenter
// (window.open + postMessage on the held handle — file-safe). When the export
// player lands, the pure transport/notes facts get extracted into a shared kernel
// (that ADR's §4); for now this is its behavioural ancestor, exactly as
// drawing-board-practice.js is for the rehearsal brain.
//
// Render parity (the thing CLAUDE.md cares most about): like Practice, this pins
// the slide box through frame-css's single source of truth and centres one
// uniformly-scaled slide, so a presented slide is pixel-identical to the same
// slide in the live preview. notes-core is THE note/non-note boundary (HARD
// RULE #1) — notes are read through the canonical extractor, never re-derived.

import { buildStageDoc, createPresenterController } from '../components/studio/present/presenter-window.js';
// The same authoritative section read Practice uses (pure, engine-derived): it
// turns the rendered <section> list into per-slide metas with a `role` ('section'
// on a divider) + a title — the basis for the per-section progress spine.
import { metasFromSections } from '../components/studio/present/rehearsal.js';
// Shared theme registration (WRAP, DON'T REINVENT): walks the transitive
// `@import` closure so a multi-level theme (a11y-* → a11y-base → onyx → lattice)
// registers fully — the one tested path, not a re-inlined copy.
import { createThemeFetcher } from '../lib/theme-fetch.ts';
import { notesCore } from './authoring-core.generated.js';
import { A11Y_DEFS, KATEX_URL, MERMAID_URL, splitSections } from './deck-preview.js';
import { createChartInteract } from './drawing-board-chart-interact.js';

const { notesFromHtml } = notesCore;

// Full-screen enter/exit glyphs (inline so the player is self-contained, matching
// Practice's FS toggle). Lucide-style corner brackets.
const FS_ENTER = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';
const FS_EXIT = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3v3a2 2 0 0 1-2 2H3M16 3v3a2 2 0 0 0 2 2h3M8 21v-3a2 2 0 0 0-2-2H3M16 21v-3a2 2 0 0 1 2-2h3"/></svg>';
// Notes (file-text) and presenter (two-screens) glyphs.
const NOTES_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v5h5"/><path d="M8 13h8M8 17h6"/></svg>';
const PRESENTER_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="3" width="14" height="10" rx="2"/><path d="M8 17v4M5 21h6"/><path d="M18 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-2"/></svg>';

export function createPresent({ host, getSource, runtimeUrl, themeBase }) {
  if (!host) return { open() {} };
  const PG = () => window.LatticePlayground;
  const root = document.documentElement;
  const themeFetcher = createThemeFetcher(themeBase);

  let idx = 0;
  let fullHtml = ''; // the whole rendered lattice (all <section>s) — the stage renders this
  let sections = []; // split <section> HTML, one per slide — for per-slide notes only
  let notes = []; // per-slide speaker note (index-aligned), via notes-core
  let metas = []; // per-slide { role, title, … } from metasFromSections (for the spine)
  let secList = []; // [{ start, end, len, title }] — one entry per section (divider-bounded)
  let sectionOf = []; // slide index → section index
  let geom = { width: 1280, height: 720 };
  let css = '';
  let bg = '#15110d';
  let hideTimer = null;

  // ── UI handles ──────────────────────────────────────────────────────────────
  let frame; // the single-slide stage iframe
  let runEl;
  let layer; // pointer-capture overlay (swipe + tap-to-reveal + edge arrows)
  let chartInteract = null; // parent-hosted per-slice chart detail (interactive charts only)
  let elCounter; // "n / N"
  let elSpine; // the per-section progress spine (one segment per section)
  let elEdgePrev;
  let elEdgeNext;
  let elFs;
  let elNotesBtn;
  let elPresenterBtn;
  let elSheet; // the slide-up notes sheet
  let elSheetBody;
  let notesOpen = false;

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };

  function waitForPG(tries = 60) {
    return new Promise((resolve, reject) => {
      const t = setInterval(() => {
        if (PG()) { clearInterval(t); resolve(PG()); }
        else if (--tries <= 0) { clearInterval(t); reject(new Error('engine not ready')); }
      }, 80);
    });
  }

  // Render the deck through the engine ONCE; split into the authoritative
  // <section> list (honours `---`, fenced code, AND `split: headings`); lift each
  // slide's speaker note through the canonical extractor (index-aligned).
  async function prepare() {
    let pg = PG();
    if (!pg) pg = await waitForPG();
    // The deck's theme is the only palette axis — an a11y theme is just a theme.
    const palette = root.getAttribute('data-palette') || 'indaco';
    const mode = root.getAttribute('data-mode') === 'dark' ? 'dark' : 'light';
    await themeFetcher.ensure(palette, mode);
    const theme = mode === 'dark' && pg.hasTheme(palette + '-dark') ? palette + '-dark' : palette;
    const out = pg.render(getSource(), theme);
    fullHtml = out.html;
    sections = splitSections(out.html);
    metas = metasFromSections(sections);
    notes = sections.map((h) => { try { return notesFromHtml(h) || ''; } catch { return ''; } });
    css = out.css;
    geom = { width: out.width || 1280, height: out.height || 720 };
    bg = mode === 'dark' ? '#0c0c0c' : '#15110d';
  }

  // The single-slide stage doc — now the shared kernel (presenter-window.js's
  // buildStageDoc), the SAME builder the dual-screen presenter feeds its current/
  // next iframes: ONE slide centred + uniformly scaled, the slide box pinned
  // through frame-css for `@size` parity, `show(n)` driven by postMessage. The
  // Present-specific bits are just the inputs — this deck's geometry/css/bg + the
  // engine's KaTeX/Mermaid/a11y assets.
  function frameDoc(allHtml) {
    return buildStageDoc({
      html: allHtml,
      width: geom.width,
      height: geom.height,
      bg,
      css,
      runtimeUrl,
      katexUrl: KATEX_URL,
      mermaidUrl: MERMAID_URL,
      a11yDefs: A11Y_DEFS,
    });
  }

  function count() { return sections.length; }

  // The dual-screen presenter (reveal.js speaker-view pattern, file-safe) — the
  // shared kernel manages the window.open + postMessage handshake; we feed it this
  // deck's stage doc, live position + note, and relay its navigation into go().
  const presenter = createPresenterController({
    buildDoc: () => frameDoc(fullHtml),
    getState: () => ({ index: idx, total: count(), note: notes[idx] || '' }),
    onGo: (delta) => go(idx + delta),
    onToggle: (on) => {
      if (!elPresenterBtn) return;
      elPresenterBtn.classList.toggle('is-on', on);
      elPresenterBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      elPresenterBtn.title = on ? 'Close presenter view' : 'Open presenter view (second screen)';
    },
  });

  // A section opens at slide 0 and at every divider (role 'section'); its name is
  // the divider's title. One spine segment per section, width ∝ its slide count —
  // so the spine stays a clean handful of bars whether the deck is 6 slides or 78
  // (never a per-slide barcode that overflows). Mirrors Practice's computeSections.
  function computeSections() {
    secList = [];
    sectionOf = [];
    const n = count();
    for (let i = 0; i < n; i++) {
      const role = metas[i]?.role;
      if (i === 0 || role === 'section') {
        secList.push({ start: i, title: metas[i]?.title || (i === 0 ? 'Opening' : 'Section') });
      }
      sectionOf[i] = secList.length - 1;
    }
    for (let s = 0; s < secList.length; s++) {
      secList[s].end = s + 1 < secList.length ? secList[s + 1].start : n;
      secList[s].len = secList[s].end - secList[s].start;
    }
  }

  function go(n) {
    idx = Math.max(0, Math.min(count() - 1, n));
    if (frame?.contentWindow) frame.contentWindow.postMessage({ pv: idx }, '*');
    refreshChrome();
    presenter.sync();
    showControls();
    if (chartInteract) chartInteract.onSlide(idx);
  }

  function refreshChrome() {
    if (elCounter) elCounter.textContent = (idx + 1) + ' / ' + count();
    if (elSpine) {
      // One segment per section; fill it left-to-right by progress WITHIN the
      // section (completed sections read full, the current one partially, ahead
      // empty). Identical scheme to Practice's top-HUD spine.
      const segs = elSpine.children;
      for (let i = 0; i < segs.length; i++) {
        const sec = secList[i];
        if (!sec) continue;
        const cur = idx >= sec.start && idx < sec.end;
        const frac = idx >= sec.end ? 1 : idx < sec.start ? 0 : (idx - sec.start + 1) / sec.len;
        segs[i].classList.toggle('cur', cur);
        const fill = segs[i].firstChild;
        if (fill) fill.style.width = Math.round(frac * 100) + '%';
      }
    }
    if (elEdgePrev) elEdgePrev.disabled = idx <= 0;
    if (elEdgeNext) elEdgeNext.disabled = idx >= count() - 1;
    if (notesOpen) renderNote();
  }

  // ── Speaker-notes slide-up sheet (universal across every tier) ───────────────
  function renderNote() {
    if (!elSheetBody) return;
    const note = (notes[idx] || '').trim();
    elSheetBody.innerHTML = '';
    if (note) {
      // Notes ride as plain text; preserve authored line breaks as paragraphs.
      for (const para of note.split(/\n{2,}/)) {
        const p = el('p', 'db-pp-note-p');
        p.textContent = para.trim();
        elSheetBody.append(p);
      }
    } else {
      elSheetBody.append(el('p', 'db-pp-note-empty', 'No speaker notes on this slide.'));
    }
  }
  function setNotes(on) {
    notesOpen = on;
    if (elSheet) elSheet.classList.toggle('is-open', on);
    if (elNotesBtn) {
      elNotesBtn.classList.toggle('is-on', on);
      elNotesBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    if (on) renderNote();
  }
  function toggleNotes() { setNotes(!notesOpen); }

  // ── Overlay controls: reveal on intent, auto-hide while presenting ───────────
  function setChrome(show) {
    if (layer) layer.classList.toggle('show', show);
    if (runEl) runEl.classList.toggle('chrome-show', show);
  }
  function showControls() {
    setChrome(true);
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    hideTimer = setTimeout(() => { if (!notesOpen) setChrome(false); }, 2600);
  }
  function toggleControls() {
    if (!layer) return;
    if (layer.classList.contains('show')) { setChrome(false); if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; } }
    else showControls();
  }

  // ── Fullscreen (real API on desktop; CSS viewport-fill is the floor on mobile) ─
  // We fullscreen the ROOT (parity with Practice). iOS iPhone Safari has no
  // element-fullscreen → silent no-op; the overlay's position:fixed + dvh fill is
  // the degraded "fullscreen" there (handled in CSS).
  function fsElement() { return document.fullscreenElement || document.webkitFullscreenElement || null; }
  function fsSupported() { return !!(root.requestFullscreen || root.webkitRequestFullscreen); }
  function requestFs() {
    if (fsElement()) return;
    const fn = root.requestFullscreen || root.webkitRequestFullscreen;
    if (!fn) return;
    try { const p = fn.call(root); if (p?.catch) p.catch(() => {}); } catch { /* gesture/permission */ }
  }
  function exitFs() {
    if (!fsElement()) return;
    const fn = document.exitFullscreen || document.webkitExitFullscreen;
    if (!fn) return;
    try { const p = fn.call(document); if (p?.catch) p.catch(() => {}); } catch { /* not active */ }
  }
  function toggleFs() { if (fsElement()) exitFs(); else requestFs(); }
  function onFsChange() {
    const on = !!fsElement();
    if (host) host.classList.toggle('is-fs', on);
    if (elFs) {
      elFs.innerHTML = on ? FS_EXIT : FS_ENTER;
      elFs.title = on ? 'Exit full screen (Esc)' : 'Full screen (F)';
      elFs.setAttribute('aria-label', on ? 'Exit full screen' : 'Enter full screen');
      elFs.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }


  // ── Gestures: swipe to turn, flat tap to reveal/hide controls ────────────────
  function wireGestures(target) {
    let x0 = 0, y0 = 0, onBtn = false, pid = null;
    target.addEventListener('pointerdown', (e) => {
      if (pid !== null) return;
      pid = e.pointerId; onBtn = !!e.target.closest('button'); x0 = e.clientX; y0 = e.clientY;
    });
    target.addEventListener('pointermove', (e) => { if (e.pointerId === pid) showControls(); });
    target.addEventListener('pointercancel', (e) => { if (e.pointerId === pid) pid = null; });
    target.addEventListener('pointerup', (e) => {
      if (e.pointerId !== pid) return;
      pid = null;
      const dx = e.clientX - x0, dy = e.clientY - y0;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3) { go(dx < 0 ? idx + 1 : idx - 1); return; }
      if (onBtn) return;
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) toggleControls();
    });
  }

  function onKey(e) {
    // Interactive charts get first crack: number keys reveal a slice, 0/Esc
    // clear. handleKey only consumes Esc when a detail is actually open, so a
    // bare Esc still exits present.
    if (chartInteract?.handleKey(e)) { e.preventDefault(); showControls(); return; }
    if (e.key === 'Escape') {
      if (notesOpen) { setNotes(false); return; }
      if (fsElement()) { e.preventDefault(); exitFs(); return; }
      close();
      return;
    }
    if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); go(idx + 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(idx - 1); }
    else if (e.key === 'Home') { e.preventDefault(); go(0); }
    else if (e.key === 'End') { e.preventDefault(); go(count() - 1); }
    else if (e.key === 'f' || e.key === 'F') { e.preventDefault(); toggleFs(); }
    else if (e.key === 'n' || e.key === 'N') { e.preventDefault(); toggleNotes(); }
    else if (e.key === 's' || e.key === 'S') { e.preventDefault(); presenter.toggle(); }
    else return;
    showControls();
  }

  function build() {
    host.innerHTML = '';
    const run = el('div', 'db-pp-run');
    runEl = run;

    const stage = el('div', 'db-pp-stage');
    frame = el('iframe', 'db-pp-frame');
    frame.setAttribute('title', 'Presented slide');
    frame.addEventListener('load', () => {
      try { frame.contentWindow.postMessage({ pv: idx }, '*'); } catch { /* cross-origin */ }
      // Re-detect the interactive chart after a (re)load — covers initial render
      // and full srcdoc rewrites (palette/mode change).
      if (chartInteract) chartInteract.onSlide(idx);
    });

    // Pointer-capture overlay above the iframe (cross-document touch never reaches
    // the parent) — swipe, tap-to-reveal, and the auto-hiding edge arrows.
    layer = el('div', 'db-pp-layer');
    elEdgePrev = el('button', 'db-pp-edge db-pp-edge-prev'); elEdgePrev.type = 'button';
    elEdgePrev.setAttribute('aria-label', 'Previous slide');
    elEdgePrev.innerHTML = '<span class="ico ico-chevron-left" aria-hidden="true"></span>';
    elEdgePrev.addEventListener('click', () => go(idx - 1));
    elEdgeNext = el('button', 'db-pp-edge db-pp-edge-next'); elEdgeNext.type = 'button';
    elEdgeNext.setAttribute('aria-label', 'Next slide');
    elEdgeNext.innerHTML = '<span class="ico ico-chevron-right" aria-hidden="true"></span>';
    elEdgeNext.addEventListener('click', () => go(idx + 1));
    layer.append(elEdgePrev, elEdgeNext);
    wireGestures(layer);

    // Top HUD — a persistent per-section progress spine over an auto-hiding
    // locator row (counter · icon-only controls). The spine stays put so the
    // audience always reads where they are in the arc; the controls reveal on
    // intent and fade while presenting. One spine segment per section, width ∝
    // its slide count (the same scheme as Practice's top HUD).
    const bar = el('div', 'db-pp-bar');
    computeSections();
    elSpine = el('div', 'db-pp-spine');
    for (let i = 0; i < secList.length; i++) {
      const seg = el('span', 'db-pp-seg');
      seg.style.flexGrow = String(secList[i].len || 1);
      seg.title = secList[i].title;
      seg.append(el('span', 'db-pp-seg-fill'));
      elSpine.append(seg);
    }
    const row = el('div', 'db-pp-bar-row');
    elCounter = el('span', 'db-pp-counter', '1 / 1');
    const tools = el('div', 'db-pp-tools');
    elNotesBtn = el('button', 'db-pp-tool'); elNotesBtn.type = 'button';
    elNotesBtn.innerHTML = NOTES_ICON; elNotesBtn.title = 'Speaker notes (N)';
    elNotesBtn.setAttribute('aria-label', 'Toggle speaker notes'); elNotesBtn.setAttribute('aria-pressed', 'false');
    elNotesBtn.addEventListener('click', toggleNotes);
    // Presenter view — desktop enhancement (needs window.open + a real second
    // screen to shine). Hidden on touch-primary mobile/tablet. We gate on the
    // ABSENCE of a coarse primary pointer (not the presence of a fine one):
    // headless/odd desktops can fail `(pointer: fine)` yet are perfectly capable,
    // whereas phones reliably report `(pointer: coarse)`.
    const canPresent = (() => { try { return !window.matchMedia('(pointer: coarse)').matches; } catch { return true; } })();
    if (canPresent) {
      elPresenterBtn = el('button', 'db-pp-tool'); elPresenterBtn.type = 'button';
      elPresenterBtn.innerHTML = PRESENTER_ICON; elPresenterBtn.title = 'Open presenter view (second screen)';
      elPresenterBtn.setAttribute('aria-label', 'Open presenter view'); elPresenterBtn.setAttribute('aria-pressed', 'false');
      elPresenterBtn.addEventListener('click', () => presenter.toggle());
    }
    elFs = fsSupported() ? el('button', 'db-pp-tool') : null;
    if (elFs) {
      elFs.type = 'button'; elFs.innerHTML = FS_ENTER; elFs.title = 'Full screen (F)';
      elFs.setAttribute('aria-label', 'Enter full screen'); elFs.setAttribute('aria-pressed', 'false');
      elFs.addEventListener('click', toggleFs);
    }
    const closeBtn = el('button', 'db-pp-tool db-pp-close'); closeBtn.type = 'button';
    closeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
    closeBtn.title = 'Exit present (Esc)'; closeBtn.setAttribute('aria-label', 'Exit present');
    closeBtn.addEventListener('click', close);
    tools.append(elNotesBtn);
    if (elPresenterBtn) tools.append(elPresenterBtn);
    if (elFs) tools.append(elFs);
    tools.append(closeBtn);
    row.append(elCounter, tools);
    bar.append(elSpine, row);

    stage.append(frame, layer, bar);
    chartInteract = createChartInteract({ stage, getFrame: () => frame });

    // The slide-up speaker-notes sheet — universal across tiers. Drag handle +
    // swipe-down dismiss; scrollable body.
    elSheet = el('div', 'db-pp-sheet');
    const grip = el('button', 'db-pp-sheet-grip'); grip.type = 'button';
    grip.setAttribute('aria-label', 'Close speaker notes');
    grip.addEventListener('click', () => setNotes(false));
    const sheetHead = el('div', 'db-pp-sheet-head');
    sheetHead.append(el('span', 'db-pp-sheet-title', 'Speaker notes'));
    elSheetBody = el('div', 'db-pp-sheet-body');
    elSheet.append(grip, sheetHead, elSheetBody);
    wireSheetDismiss(elSheet);

    run.append(stage, elSheet);
    host.appendChild(run);
  }

  // Swipe-down on the sheet dismisses it (drag handle is the explicit affordance).
  function wireSheetDismiss(sheet) {
    let y0 = 0, pid = null;
    sheet.addEventListener('pointerdown', (e) => {
      if (pid !== null || !e.target.closest('.db-pp-sheet-grip, .db-pp-sheet-head')) return;
      pid = e.pointerId; y0 = e.clientY;
    });
    sheet.addEventListener('pointerup', (e) => {
      if (e.pointerId !== pid) return;
      pid = null;
      if (e.clientY - y0 > 40) setNotes(false);
    });
    sheet.addEventListener('pointercancel', () => { pid = null; });
  }

  function open() {
    host.hidden = false;
    idx = 0;
    notesOpen = false;
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('fullscreenchange', onFsChange);
    document.removeEventListener('webkitfullscreenchange', onFsChange);
    document.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);

    // Go full-screen NOW, synchronously in the click task — full-screen needs a
    // live user activation, and `prepare()` below is async (theme fetches + the
    // engine render), so requesting it in the `.then()` would be detached from the
    // gesture and silently blocked. We fullscreen the root, so it's content-
    // independent; the deck renders into it a beat later.
    requestFs();

    // A brief loading card while the engine render lands.
    host.innerHTML = '';
    const loading = el('div', 'db-pp-loading');
    loading.append(el('div', 'db-pp-spinner'), el('p', null, 'Preparing your deck…'));
    host.appendChild(loading);

    prepare()
      .then(() => {
        if (host.hidden) return;
        if (!count()) { close(); return; }
        build();
        onFsChange();
        frame.srcdoc = frameDoc(fullHtml);
        refreshChrome();
        showControls();
      })
      .catch(() => { close(); });
  }

  function close() {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    presenter.close();
    exitFs();
    if (chartInteract) { chartInteract.destroy(); chartInteract = null; }
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('fullscreenchange', onFsChange);
    document.removeEventListener('webkitfullscreenchange', onFsChange);
    frame = layer = runEl = elCounter = elSpine = null;
    elEdgePrev = elEdgeNext = elFs = elNotesBtn = elPresenterBtn = elSheet = elSheetBody = null;
    host.hidden = true;
    host.innerHTML = '';
    host.classList.remove('is-fs');
  }

  return { open };
}
