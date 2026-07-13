// The Drawing Board — Practice mode (the rehearsal stage).
//
// A full-screen presenter-rehearsal surface: it renders the deck ONE slide at a
// time (parity with the live preview — same engine, same slide box, no drift),
// paces you against a target talk length, and COACHES delivery with ambient,
// timed beats over the slide — when to pause, look up, breathe, signpost a
// section. The plan comes from drawing-board-rehearsal.js: a deterministic floor
// that's instant + offline, refined by the connected model (cloud/local) when
// one is available, and re-assessed whenever the deck changes.
//
// Render parity: this used to carry its OWN bespoke iframe renderer, which is
// exactly the drift deck-preview.js warns about (it rendered slides high and
// off from the preview). It now pins the slide box through frame-css's single
// source of truth and centres a single slide with flex + a uniform scale, so a
// rehearsal slide looks identical to the same slide in the preview.

// Shared theme registration (WRAP, DON'T REINVENT): walks the transitive
// `@import` closure so a multi-level theme (a11y-* → a11y-base → onyx → lattice)
// registers fully — the one tested path, not a re-inlined copy.
import { createThemeFetcher } from '../lib/theme-fetch.ts';
import { A11Y_DEFS, KATEX_URL, MERMAID_URL, splitSections } from './deck-preview.js';
import { createChartInteract } from './drawing-board-chart-interact.js';
import { isCapableTier } from './drawing-board-chat.js';
import { initPracticeTour } from './drawing-board-practice-tour.js';
import { createRehearsalPlanner, metasFromSections, metasFromSource, overBeat } from './drawing-board-rehearsal.js';
import { budgetStatus, readBudgetCap, readBudgetMode, readSpend, recordSpend } from './drawing-board-settings.js';
import { toursAllowedHere } from './guided-tour.js';
import { buildStageDoc } from './presenter-window.js';
import { toursEnabled } from './tour-prefs.js';

const BEAT_LABEL = { pause: 'Pause', eye: 'Look up', breathe: 'Breathe', transition: 'Transition', emphasis: 'Emphasize', over: 'Over time' };

function fmt(s) {
  s = Math.max(0, Math.round(s));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

export function createPractice({ host, getSource, runtimeUrl, themeBase, bucketOf, model }) {
  if (!host) return { open() {} };
  const PG = () => window.LatticePlayground;
  const root = document.documentElement;
  // The cost/quality gate (same discipline as the chat): only strong tiers may
  // override the proven deterministic floor; cloud calls respect the session
  // budget cap; spend lands in the session tally. Built here so the planner module
  // stays pure (it never imports settings). Local tiers are free → no budget gate.
  const gate = model
    ? {
        capable: (gen) => isCapableTier(gen),
        allow: () => {
          const a = model.availability ? model.availability() : {};
          if (a.generation !== 'openrouter') return true;
          return !budgetStatus({ sessionSpend: readSpend().session, cap: readBudgetCap(), mode: readBudgetMode() }).blocked;
        },
        onUsage: (u) => recordSpend(u?.cost, u?.total_tokens ?? ((u?.prompt_tokens || 0) + (u?.completion_tokens || 0))),
      }
    : null;
  const planner = createRehearsalPlanner({ model, gate });
  const themeFetcher = createThemeFetcher(themeBase);

  let plan = null; // the live rehearsal plan (deterministic, possibly AI-refined)
  let idx = 0;
  let startedAt = 0;
  let slideEnteredAt = 0;
  let tick = null;
  let shownCoachKey = null;
  let playing = false; // autoplay — opt-in, off by default; auto-advances on each slide's target
  let ready = false; // the pre-roll "ready" gate: chrome is built, clock frozen at 0:00 until Start
  let hideTimer = null; // auto-hides the overlay arrows while autoplaying
  let practiceTour = null; // the driver.js walkthrough (lazy-init on first run; see drawing-board-practice-tour.js)
  let prepared = null; // { out, sections, metas, bg } — one engine render, shared by the start screen + the run
  let cachedMetas = null; // the slide metas the plan runs off (engine-derived, source as fallback)

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };


  // Render the deck through the engine ONCE and derive the slide metas from the
  // rendered <section> list — the AUTHORITATIVE segmentation (it honours `---`,
  // fenced code, AND `split: headings`, which a source-regex split cannot; that
  // mismatch is what made a big `split: headings` deck read as "1 slide"). The
  // same render feeds both the start-screen read and the run, so the plan's slide
  // count always equals what's on the stage. Cached on `prepared`.
  async function prepare() {
    let pg = PG();
    if (!pg) pg = await waitForPG();
    const source = getSource();
    // The deck's theme is the only palette axis — an a11y theme is just a theme.
    const palette = root.getAttribute('data-palette') || 'indaco';
    const mode = root.getAttribute('data-mode') === 'dark' ? 'dark' : 'light';
    await themeFetcher.ensure(palette, mode);
    const theme = mode === 'dark' && pg.hasTheme(palette + '-dark') ? palette + '-dark' : palette;
    const out = pg.render(source, theme);
    const sections = splitSections(out.html);
    const metas = sections.length ? metasFromSections(sections, { bucketOf }) : metasFromSource(source, { bucketOf });
    prepared = { out, sections, metas, bg: mode === 'dark' ? '#0c0c0c' : '#15110d' };
    cachedMetas = metas;
    return prepared;
  }

  // The rehearsal iframe. ONE slide, centred, scaled uniformly to fit — the slide
  // box is pinned through frame-css (so container-query layouts resolve against the
  // real `@size`, just like the preview). A no-zoom viewport + touch-action kill
  // the iOS double-tap-to-zoom that used to jolt the stage.
  function frameDoc(html, css, bg, geom) {
    const sw = geom?.width || 1280;
    const sh = geom?.height || 720;
    // The rehearsal stage IS the shared dual-screen stage (buildStageDoc, which
    // sanitizes internally — #616) with a bigger pad and a card shadow, NOT a forked
    // copy (P3b of 2026-07-07-html-lattice-player.md). The card look rides on the
    // `css` seam (appended after buildStageDoc's own `transform-origin:top left`).
    const cardCss = css + '#latt-fit .lattice>section{box-shadow:0 18px 60px rgba(0,0,0,.45);border-radius:10px;}';
    return buildStageDoc({
      html,
      width: sw,
      height: sh,
      bg,
      css: cardCss,
      runtimeUrl,
      katexUrl: KATEX_URL,
      mermaidUrl: MERMAID_URL,
      a11yDefs: A11Y_DEFS,
      pad: { factor: 0.04, floor: 14 },
    });
  }

  // ── UI handles ────────────────────────────────────────────────────────────
  let frame;
  let elClock; // elapsed since the run began
  let elSlide;
  let elPace;
  let elSlideTimeV; // the per-slide countdown — time LEFT on this slide (promoted from the old quiet "target")
  let elAi;
  let elSpine; // the per-slide progress spine (section breaks marked)
  let elSection; // the current section's name
  let elNext; // the next section, previewed top-right so transitions never surprise you
  let sections = []; // [{ start, title }] — a section opens at slide 0 and each divider
  let sectionOf = []; // slide index → section index
  let elCoach; // the single coaching pill (ambient guidance OR a timed beat)
  let runEl; // the .db-pv-run container — carries `chrome-show` so the top bar auto-hides in immersive
  let layer; // pointer-capture overlay over the stage — swipe, tap-to-reveal, and the edge arrows
  let chartInteract = null; // parent-hosted per-slice chart detail (interactive charts only)
  let elEdgePrev; // overlay prev arrow (auto-hiding)
  let elEdgeNext; // overlay next arrow (auto-hiding)
  let elAuto; // the top-bar Autoplay toggle (replaces the old centre play button)
  let elFs; // the top-bar full-screen toggle
  let elReady; // the "ready" pre-roll card on the stage (Start button + a one-line instruction)

  function close() {
    if (tick) { clearInterval(tick); tick = null; }
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    playing = false;
    ready = false;
    // Drop the run's state so a re-opened START screen is inert to nav keys: the
    // `!plan` guard in onKey only holds if `plan` is cleared here (close() runs
    // before open() rebuilds the chooser), and the handles below now point at
    // detached nodes — null them so nothing stale is touched.
    plan = null;
    if (chartInteract) { chartInteract.destroy(); chartInteract = null; }
    layer = elAuto = elFs = elReady = frame = runEl = null;
    exitFs();
    host.hidden = true;
    host.innerHTML = '';
    host.classList.remove('is-fs');
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('fullscreenchange', onFsChange);
    document.removeEventListener('webkitfullscreenchange', onFsChange);
    window.removeEventListener('orientationchange', onOrient);
  }
  // Rotating into immersive portrait would otherwise leave the top bar in a stale
  // hidden state — reveal it (it then auto-hides) so a rotation never strands you.
  function onOrient() { showControls(); }
  function onKey(e) {
    // While the walkthrough drives, let driver.js own the keys (Esc closes the
    // tour, arrows step it) — don't also exit practice or move the deck underneath.
    // driver.js flags an active tour with `driver-active` on <body> (not <html>).
    if (document.body.classList.contains('driver-active')) return;
    // A chart detail popover catches Esc first (parity with present); handleKey
    // only consumes Esc when one is open, so a bare Esc still steps out below.
    if (e.key === 'Escape' && chartInteract?.handleKey(e)) { e.preventDefault(); return; }
    // Esc steps out one level: leave full screen first, then (next press) exit.
    if (e.key === 'Escape') { if (fsElement()) { e.preventDefault(); exitFs(); } else { close(); } return; }
    if (!plan) return; // chooser screen: only Esc is live
    if (ready) {
      // Pre-roll: the clock is frozen; the only forward action is "begin".
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); beginRun(); }
      return;
    }
    // Interactive charts get first crack at number keys (reveal slice) / 0 (clear).
    if (chartInteract?.handleKey(e)) { e.preventDefault(); showControls(); return; }
    if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); go(idx + 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(idx - 1); }
    else if (e.key === 'p' || e.key === 'P' || e.key === 'k') { e.preventDefault(); togglePlay(); }
    else return;
    showControls();
  }

  // ── Overlay controls: reveal on intent, auto-hide while presenting ───────────
  // The auto-hiding set (edge arrows + the top bar) tracks one state, mirrored on
  // the layer (arrows) AND the run (the bar). It auto-hides while autoplaying, and
  // also in IMMERSIVE portrait (the slide fills the viewport; chrome floats in the
  // letterbox) so a tap clears to a clean slide. The bottom timing readout is NOT
  // in this set — it stays put (the at-a-glance clock you rely on). Never hides on
  // the ready pre-roll.
  function immersive() {
    try { return window.matchMedia('(orientation: portrait) and (max-width: 900px)').matches; } catch { return false; }
  }
  function setChrome(on) {
    if (layer) layer.classList.toggle('show', on);
    if (runEl) runEl.classList.toggle('chrome-show', on);
  }
  function showControls() {
    setChrome(true);
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    if (!ready && (playing || immersive())) hideTimer = setTimeout(() => setChrome(false), 2600);
  }
  function toggleControls() {
    if (!layer) return;
    if (layer.classList.contains('show')) { setChrome(false); if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; } }
    else showControls();
  }
  function setPlaying(on) {
    playing = on;
    if (elAuto) {
      elAuto.classList.toggle('is-on', on);
      elAuto.setAttribute('aria-pressed', on ? 'true' : 'false');
      elAuto.title = on ? 'Autoplay on — auto-advancing (p)' : 'Autoplay — auto-advance each slide (p)';
    }
    if (layer) layer.classList.toggle('playing', on);
    showControls();
  }
  function togglePlay() {
    // At the end of the deck, restart from the top so Auto never sits inert.
    if (!playing && !ready && idx >= slideCount() - 1) go(0);
    setPlaying(!playing);
  }
  // Leave the pre-roll: start the clock, drop the ready card, and run the tick.
  // Autoplay starts now IFF the Auto toggle was already flipped on the ready card.
  function beginRun() {
    if (!ready) return;
    ready = false;
    requestFs(); // Start is a user gesture — go full-screen as the presentation begins
    if (elReady) elReady.hidden = true;
    if (runEl) runEl.classList.remove('is-ready');
    startedAt = Date.now();
    slideEnteredAt = startedAt;
    refreshChrome();
    refreshTick();
    if (tick) clearInterval(tick);
    tick = setInterval(refreshTick, 250);
    showControls();
  }
  // The walkthrough — the shared driver.js tour, lazy-built on first need. A no-op
  // off production / when tours are disabled (the library returns inert stubs).
  function ensureTour() {
    if (!practiceTour) practiceTour = initPracticeTour();
    return practiceTour;
  }

  // ── Fullscreen ──────────────────────────────────────────────────────────────
  // Reclaim the browser chrome (the address bar costs a phone half its landscape
  // height). We fullscreen the ROOT — not the host — so the walkthrough's body-level
  // driver.js overlay still renders inside the fullscreen element. iOS iPhone Safari
  // has no element-fullscreen (silent no-op there); the landscape-compact chrome is
  // the fallback. Auto-requested on Start (a user gesture); a top-bar toggle + Esc
  // exit. `-webkit-` covers older Safari/iPad.
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
  const FS_ENTER = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';
  const FS_EXIT = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3v3a2 2 0 0 1-2 2H3M16 3v3a2 2 0 0 0 2 2h3M8 21v-3a2 2 0 0 0-2-2H3M16 21v-3a2 2 0 0 1 2-2h3"/></svg>';
  function onFsChange() {
    const on = !!fsElement();
    if (host) host.classList.toggle('is-fs', on);
    if (elFs) {
      elFs.innerHTML = on ? FS_EXIT : FS_ENTER;
      elFs.title = on ? 'Exit full screen (Esc)' : 'Full screen';
      elFs.setAttribute('aria-label', on ? 'Exit full screen' : 'Enter full screen');
      elFs.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  // Swipe + tap, on the capture layer. A horizontal flick advances (left → next,
  // right → prev); a flat tap on empty canvas toggles the controls; a tap that
  // lands on a control is left to that button. Pointer Events cover mouse, touch,
  // and pen with one path. Threshold/ratio keep a vertical scroll-ish drag from
  // stealing a page turn.
  function wireGestures(el2) {
    let x0 = 0, y0 = 0, onBtn = false, pid = null;
    el2.addEventListener('pointerdown', (e) => {
      if (pid !== null) return; // track only the first pointer — ignore a 2nd finger / pen
      pid = e.pointerId; onBtn = !!e.target.closest('button'); x0 = e.clientX; y0 = e.clientY;
    });
    el2.addEventListener('pointermove', (e) => { if (e.pointerId === pid) showControls(); });
    el2.addEventListener('pointercancel', (e) => { if (e.pointerId === pid) pid = null; });
    el2.addEventListener('pointerup', (e) => {
      if (e.pointerId !== pid) return;
      pid = null;
      const dx = e.clientX - x0, dy = e.clientY - y0;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3) { go(dx < 0 ? idx + 1 : idx - 1); return; }
      if (onBtn) return; // a real tap on an arrow / play — its own click handles it
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) toggleControls();
    });
  }
  function slideCount() { return plan ? plan.slides.length : 0; }
  // A section opens at the first slide and at every divider (the `section` role);
  // its name is the divider's title. Lets the bar show "where in the arc" you are.
  function computeSections(slides) {
    sections = [];
    sectionOf = [];
    for (let i = 0; i < slides.length; i++) {
      if (i === 0 || slides[i].role === 'section') {
        sections.push({ start: i, title: slides[i].title || (i === 0 ? 'Opening' : 'Section') });
      }
      sectionOf[i] = sections.length - 1;
    }
    // Each section spans [start, end) — its length drives the spine segment's
    // proportional width, so the spine stays a handful of clean segments whether
    // the deck is 6 slides or 78 (never one tick-per-slide, which barcodes + overflows).
    for (let s = 0; s < sections.length; s++) {
      sections[s].end = s + 1 < sections.length ? sections[s + 1].start : slides.length;
      sections[s].len = sections[s].end - sections[s].start;
    }
  }
  // The section after the one you're in — drives the top-right "next ·" preview.
  function nextSection(i) { return sections[sectionOf[i] + 1] || null; }

  function go(n) {
    if (ready) return; // pre-roll: nothing advances until Start
    idx = Math.max(0, Math.min(slideCount() - 1, n));
    if (frame?.contentWindow) frame.contentWindow.postMessage({ pv: idx }, '*');
    slideEnteredAt = Date.now();
    shownCoachKey = null;
    refreshChrome();
    refreshTick();
    showControls(); // surface where you are on every move (re-arms the auto-hide while playing)
    if (chartInteract) chartInteract.onSlide(idx);
  }
  function refreshChrome() {
    elSlide.textContent = (idx + 1) + ' / ' + slideCount();
    if (elSection) elSection.textContent = sections[sectionOf[idx]]?.title || '';
    if (elNext) {
      const ns = nextSection(idx);
      if (ns) {
        elNext.hidden = false;
        elNext.innerHTML = '';
        elNext.append(el('span', 'db-pv-next-k', 'next'), el('span', 'db-pv-next-n', ns.title));
      } else {
        elNext.hidden = true;
      }
    }
    if (elSpine) {
      // One segment per section; fill it left-to-right by progress WITHIN the
      // section (completed sections read full, the current one partially, ahead empty).
      const segs = elSpine.children;
      for (let i = 0; i < segs.length; i++) {
        const sec = sections[i];
        const cur = idx >= sec.start && idx < sec.end;
        const frac = idx >= sec.end ? 1 : idx < sec.start ? 0 : (idx - sec.start + 1) / sec.len;
        segs[i].classList.toggle('cur', cur);
        const fill = segs[i].firstChild;
        if (fill) fill.style.width = Math.round(frac * 100) + '%';
      }
    }
    if (elAi) elAi.hidden = !(plan && plan.source === 'ai');
  }

  // ONE pill. It carries the slide's ambient guidance by default and BECOMES the
  // timed beat (pause / look up / breathe / …) at its moment, then settles back —
  // so there's a single, calm focal point over the stage, not two stacked lines.
  function renderCoach(want) {
    if (want.key === shownCoachKey) return;
    shownCoachKey = want.key;
    if (!want.text) { elCoach.hidden = true; elCoach.classList.remove('show'); return; }
    elCoach.hidden = false;
    elCoach.dataset.kind = want.kind || '';
    elCoach.classList.toggle('is-beat', !!want.label);
    elCoach.innerHTML = '';
    if (want.label) elCoach.append(el('span', 'db-pv-coach-kind', want.label));
    elCoach.append(el('span', 'db-pv-coach-text', want.text));
    void elCoach.offsetWidth; // reflow → fade the swap in
    elCoach.classList.add('show');
  }

  function refreshTick() {
    const elapsed = (Date.now() - startedAt) / 1000;
    elClock.textContent = fmt(elapsed);
    const sp = plan?.slides[idx];
    const onSlide = (Date.now() - slideEnteredAt) / 1000;
    const tgt = sp?.target || 1;

    // The per-slide countdown — the promoted "target": how much time you have LEFT
    // on this slide, ticking down. Past the budget it flips to a warm "+0:12" overrun
    // so a lingering slide is unmissable (it used to be a near-invisible static line).
    if (elSlideTimeV) {
      const remain = tgt - onSlide;
      elSlideTimeV.textContent = remain >= 0 ? fmt(remain) : '+' + fmt(-remain);
      elSlideTimeV.classList.toggle('over', remain < 0);
    }
    // Pre-roll: the clock is frozen at zero and the readout previews the first
    // slide's budget; no pace verdict, no coaching pill until you actually begin.
    if (ready) {
      elClock.textContent = '0:00';
      if (elPace) { elPace.textContent = 'ready'; elPace.className = 'db-pv-pace ok'; }
      renderCoach({ key: 'ready' });
      return;
    }
    // Autoplay: when the slide's budget is spent, auto-advance (stopping cleanly at
    // the last slide). The dwell is the planner's per-slide target — reading-pace +
    // role-weighted, AI-refined when a model is wired (refined.then(adoptPlan)). Never
    // advances during the pre-roll (the clock isn't running yet).
    if (!ready && playing && sp && onSlide >= tgt) {
      if (idx < slideCount() - 1) { go(idx + 1); return; }
      setPlaying(false); // reached the end — stop, don't loop unasked
    }

    // pace: elapsed vs cumulative target through the current slide
    let due = 0;
    for (let i = 0; i <= idx && plan; i++) due += plan.slides[i].target || 0;
    const diff = elapsed - due;
    if (Math.abs(diff) < 8) { elPace.textContent = 'on track'; elPace.className = 'db-pv-pace ok'; }
    else if (diff > 0) { elPace.textContent = fmt(diff) + ' over'; elPace.className = 'db-pv-pace behind'; }
    else { elPace.textContent = fmt(-diff) + ' ahead'; elPace.className = 'db-pv-pace ahead'; }
    // The coaching pill: a timed beat if one is live (relative to time on THIS
    // slide — self-paced), otherwise the slide's ambient guidance. A pace-aware
    // "over time" nudge — keyed off ACTUAL dwell vs the slide's target — outranks
    // the authored delivery beats.
    if (!sp) { renderCoach({ key: 'none' }); return; }
    let active = null;
    if (sp.beats?.length) {
      for (const b of sp.beats) {
        const t = b.at * tgt;
        if (onSlide >= t && onSlide < t + (b.hold || 3)) active = b; // latest-wins
      }
    }
    const over = overBeat(onSlide, sp.target);
    if (over) active = over; // running over the slide's budget wins
    if (active) renderCoach({ key: idx + ':' + active.kind + ':' + active.at, kind: active.kind, label: BEAT_LABEL[active.kind] || active.kind, text: active.text });
    else renderCoach({ key: idx + ':ambient', kind: null, label: null, text: sp.why });
  }

  function waitForPG(tries = 60) {
    return new Promise((resolve, reject) => {
      const t = setInterval(() => {
        if (PG()) { clearInterval(t); resolve(PG()); }
        else if (--tries <= 0) { clearInterval(t); reject(new Error('engine not ready')); }
      }, 80);
    });
  }

  // Swap a refined (AI) plan in mid-rehearsal without disturbing where you are.
  function adoptPlan(next) {
    if (!next || host.hidden) return;
    plan = next;
    refreshChrome();
    refreshTick();
  }

  async function start(minutes) {
    // Reuse the render the start screen already did (same deck → same sections);
    // only render fresh if it isn't ready yet.
    let prep = prepared;
    if (!prep) { try { prep = await prepare(); } catch { close(); return; } }
    const { out, metas, bg } = prep;
    const { det, refined } = planner.plan(metas, minutes);
    plan = det;
    if (!plan.slides.length) { close(); return; }
    computeSections(plan.slides);
    idx = 0;

    // Build the running view: bar (top) · stage with the coaching scrim · nav.
    host.innerHTML = '';
    const run = el('div', 'db-pv-run');
    runEl = run;

    // The bar (top): a per-SECTION progress spine over a row that just LOCATES
    // you in the arc — current section + position (left), the next section
    // previewed + AI tag + close (right). No timing up here; the clock and pace
    // live in the bottom HUD, so the top stays a calm hairline and the slide gets
    // the height back. One segment per section (width ∝ its slide count) keeps the
    // spine a clean handful of bars at any deck size — never a per-slide barcode
    // that overflows the viewport on a long deck.
    const bar = el('div', 'db-pv-bar');
    elSpine = el('div', 'db-pv-spine');
    for (let i = 0; i < sections.length; i++) {
      const seg = el('span', 'db-pv-seg');
      seg.style.flexGrow = String(sections[i].len || 1);
      seg.append(el('span', 'db-pv-seg-fill'));
      elSpine.append(seg);
    }
    const row = el('div', 'db-pv-bar-row');
    const left = el('div', 'db-pv-bar-left');
    elSection = el('span', 'db-pv-section');
    elSlide = el('span', 'db-pv-slide');
    left.append(elSection, elSlide);
    const right = el('div', 'db-pv-bar-right');
    // Autoplay lives here now (not a centre overlay button): a persistent toggle so
    // hands-free pacing is one tap away and discoverable, on the ready card too.
    elAuto = el('button', 'db-pv-auto'); elAuto.type = 'button';
    elAuto.setAttribute('aria-pressed', 'false');
    elAuto.setAttribute('aria-label', 'Autoplay — auto-advance each slide');
    // A labelled MODE toggle, not a transport control — no play triangle (that's the
    // ready card's Start button; two play glyphs read as "which one begins?"). Off =
    // outlined pill, On = filled accent. The dot is a quiet active cue when running.
    elAuto.innerHTML = '<span class="db-pv-auto-dot" aria-hidden="true"></span><span class="db-pv-auto-label">Auto</span>';
    elAuto.addEventListener('click', togglePlay);
    // Full-screen toggle — only where the API exists (hidden on iPhone Safari, which
    // has no element fullscreen; the landscape-compact chrome carries it there).
    elFs = fsSupported() ? el('button', 'db-pv-fs') : null;
    if (elFs) {
      elFs.type = 'button';
      elFs.innerHTML = FS_ENTER;
      elFs.title = 'Full screen';
      elFs.setAttribute('aria-label', 'Enter full screen');
      elFs.setAttribute('aria-pressed', 'false');
      elFs.addEventListener('click', toggleFs);
    }
    elNext = el('span', 'db-pv-next-section'); elNext.hidden = true;
    elAi = el('span', 'db-pv-ai', '✦ AI‑tuned'); elAi.hidden = true; elAi.title = 'Pacing + cues tailored to this deck by your connected model';
    // A "?" that replays the walkthrough. The shared library's topbar button can't
    // reach this full-screen overlay, so the bar mounts its own (the tour is built
    // with mountTarget:null). Only shown where tours actually run.
    let tourBtn = null;
    if (toursAllowedHere() && toursEnabled()) {
      tourBtn = el('button', 'db-pv-help', '?'); tourBtn.type = 'button';
      tourBtn.title = 'Replay the walkthrough';
      tourBtn.setAttribute('aria-label', 'Replay the walkthrough');
      tourBtn.addEventListener('click', () => ensureTour().start());
    }
    const closeBtn = el('button', 'db-pv-x'); // glyph drawn by CSS: .db-pv-x::before
    closeBtn.type = 'button';
    closeBtn.title = 'Exit practice (Esc)';
    closeBtn.setAttribute('aria-label', 'Exit practice');
    closeBtn.addEventListener('click', close);
    right.append(elAuto);
    if (elFs) right.append(elFs);
    right.append(elNext, elAi);
    if (tourBtn) right.append(tourBtn);
    right.append(closeBtn);
    row.append(left, right);
    bar.append(elSpine, row);

    const stage = el('div', 'db-pv-stage');
    frame = el('iframe', 'db-pv-frame');
    frame.setAttribute('title', 'Practice slide');
    // Re-assert the current slide once the iframe's message listener is live — a
    // fast early Next/Arrow before load would otherwise leave the stage on slide 0.
    frame.addEventListener('load', () => {
      try { frame.contentWindow.postMessage({ pv: idx }, '*'); } catch { /* cross-origin guard */ }
      if (chartInteract) chartInteract.onSlide(idx);
    });
    const coach = el('div', 'db-pv-coach');
    elCoach = el('div', 'db-pv-coach-pill'); elCoach.hidden = true;
    coach.append(elCoach);

    // The interaction overlay. Cross-document touch events on the iframe never reach
    // the parent, so a transparent layer ABOVE the frame captures swipe + tap and
    // hosts the auto-hiding edge arrows (prev/next). Autoplay is no longer a centre
    // button — it's the top-bar Auto toggle. The coach scrim is pointer-transparent
    // and sits below it.
    layer = el('div', 'db-pv-layer');
    elEdgePrev = el('button', 'db-pv-edge db-pv-edge-prev'); elEdgePrev.type = 'button'; elEdgePrev.setAttribute('aria-label', 'Previous slide'); elEdgePrev.innerHTML = '<span class="ico ico-chevron-left" aria-hidden="true"></span>'; elEdgePrev.addEventListener('click', () => go(idx - 1));
    elEdgeNext = el('button', 'db-pv-edge db-pv-edge-next'); elEdgeNext.type = 'button'; elEdgeNext.setAttribute('aria-label', 'Next slide'); elEdgeNext.innerHTML = '<span class="ico ico-chevron-right" aria-hidden="true"></span>'; elEdgeNext.addEventListener('click', () => go(idx + 1));
    layer.append(elEdgePrev, elEdgeNext);
    wireGestures(layer);

    // The "ready" pre-roll — a calm card over a dimmed first slide. The clock stays
    // at 0:00 until Start, so you land, get oriented (and the walkthrough), then
    // begin on your terms. Pressing Start (or Space/Enter/→) calls beginRun().
    elReady = el('div', 'db-pv-ready');
    const readyCard = el('div', 'db-pv-ready-card');
    const startBtn = el('button', 'db-pv-ready-start'); startBtn.type = 'button';
    startBtn.setAttribute('aria-label', 'Start practice');
    startBtn.innerHTML = '<span class="db-pv-play-glyph" aria-hidden="true"></span>';
    startBtn.addEventListener('click', beginRun);
    readyCard.append(
      startBtn,
      el('h3', 'db-pv-ready-title', 'Ready when you are'),
      el('p', 'db-pv-ready-sub', 'Press play to start the clock. Swipe or use the arrows to move; flip Auto for hands‑free pacing.'),
    );
    elReady.append(readyCard);
    stage.append(frame, coach, layer, elReady);
    // Exploring a chart pauses autoplay so it doesn't advance off the detail.
    chartInteract = createChartInteract({
      stage, getFrame: () => frame,
      onReveal: () => { if (playing) togglePlay(); },
    });

    // The bottom HUD: a calm, legible readout in three zones — elapsed (dominant) ·
    // this slide's countdown · pace. No nav buttons live here anymore; advancing is
    // swipe + the overlay arrows + keys. The per-slide countdown is the promoted
    // "target": it now reads as loud as the elapsed clock instead of a grey footnote.
    const nav = el('div', 'db-pv-nav');
    const readout = el('div', 'db-pv-readout');
    const gElapsed = el('div', 'db-pv-time');
    elClock = el('span', 'db-pv-clock', '0:00');
    gElapsed.append(elClock, el('span', 'db-pv-time-k', 'elapsed'));
    const gSlide = el('div', 'db-pv-time');
    elSlideTimeV = el('span', 'db-pv-slidetime-v', '0:00');
    gSlide.append(elSlideTimeV, el('span', 'db-pv-time-k', 'this slide'));
    elPace = el('span', 'db-pv-pace ok', 'on track');
    readout.append(gElapsed, el('span', 'db-pv-vr'), gSlide, el('span', 'db-pv-vr'), elPace);
    nav.append(readout);

    run.append(bar, stage, nav);
    run.classList.add('is-ready'); // pre-roll: hide the edge arrows, show the ready card
    host.appendChild(run);
    ready = true;
    setPlaying(false); // paint the Auto toggle in its off state
    onFsChange(); // sync the full-screen toggle glyph (e.g. re-opening while already FS)

    frame.srcdoc = frameDoc(out.html, out.css, bg, { width: out.width, height: out.height });
    startedAt = Date.now();
    slideEnteredAt = startedAt;
    refreshChrome();
    refreshTick(); // paint 0:00 + the first slide's budget; the interval starts at beginRun()

    // First-time walkthrough, ON the ready screen — so a new presenter learns the
    // controls before the clock runs. Remembered via the library's seen flag (one
    // view, then it's quiet); the bar's ? button replays it. No-op off production.
    const t = ensureTour();
    if (toursAllowedHere() && toursEnabled() && t.seen && !t.seen()) {
      setTimeout(() => { if (!host.hidden && ready) { t.markSeen(); t.start(); } }, 500);
    }

    refined.then(adoptPlan).catch(() => {});
  }

  function open() {
    if (tick) { clearInterval(tick); tick = null; } // re-opening mid-run: don't leak the timer
    host.hidden = false;
    host.innerHTML = '';
    document.removeEventListener('keydown', onKey); // avoid a double-bound listener
    document.addEventListener('keydown', onKey);
    document.removeEventListener('fullscreenchange', onFsChange);
    document.removeEventListener('webkitfullscreenchange', onFsChange);
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    window.removeEventListener('orientationchange', onOrient);
    window.addEventListener('orientationchange', onOrient);

    const s = el('div', 'db-pv-start');
    s.append(
      el('h2', null, 'Practice run'),
      el('p', 'db-pv-sub', 'Rehearse full‑screen — swipe or use the arrows, flip Auto for hands‑free pacing, and I’ll cue when to pause, look up, and breathe.'),
    );
    const form = el('form', 'db-pv-len');
    const input = el('input');
    input.type = 'number'; input.min = '1'; input.max = '180'; input.value = '10'; input.setAttribute('aria-label', 'Talk length in minutes');
    const go2 = el('button', 'db-btn db-btn-primary'); go2.type = 'submit'; go2.innerHTML = 'Start <span class="ico ico-arrow-right" aria-hidden="true"></span>';
    form.append(input, el('span', 'db-pv-min', 'min'), go2);
    form.addEventListener('submit', (e) => { e.preventDefault(); start(Math.max(1, Number(input.value) || 10)); });
    s.append(form);

    // A deterministic suggested length + a whole-deck READ (the structural take:
    // time split, the ask, fit, front-loading) + a note when AI coaching is live.
    // It reads off the ENGINE-derived metas (so the slide count is correct even
    // for `split: headings` decks) via detOnly() — no billed call; only Start
    // fires the model. Re-computes live as you change the length.
    const read = el('div', 'db-pv-read');
    let seeded = false;
    const renderRead = (mins) => {
      read.innerHTML = '';
      if (!cachedMetas) { read.append(el('p', 'db-pv-read-summary', 'Reading your deck…')); return; }
      if (!cachedMetas.length) return;
      const det = planner.detOnly(cachedMetas, mins);
      const hint = el('button', 'db-pv-suggest'); hint.type = 'button';
      hint.textContent = `Suggested ${det.suggestMinutes} min for ${det.slides.length} slide${det.slides.length === 1 ? '' : 's'}`;
      hint.title = 'Set the input to the suggested length';
      hint.addEventListener('click', () => { input.value = String(det.suggestMinutes); renderRead(det.suggestMinutes); input.focus(); });
      read.append(hint);
      if (det.deck) {
        read.append(el('p', 'db-pv-read-summary', det.deck.summary));
        if (det.deck.flags.length) {
          const ul = el('ul', 'db-pv-read-flags');
          for (const f of det.deck.flags) {
            const li = el('li', 'db-pv-read-flag'); li.dataset.tone = f.tone || 'info';
            li.textContent = f.text;
            ul.append(li);
          }
          read.append(ul);
        }
      }
    };
    s.append(read);
    renderRead(Math.max(1, Number(input.value) || 10)); // shows "Reading your deck…" until prepare() lands
    input.addEventListener('input', () => { seeded = true; renderRead(Math.max(1, Number(input.value) || 10)); });
    // Engine render → authoritative metas; seed the suggested length, then the read.
    // Fall back to a source split only if the engine never comes up.
    prepared = null; cachedMetas = null;
    prepare()
      .catch(() => { cachedMetas = metasFromSource(getSource(), { bucketOf }); })
      .finally(() => {
        if (host.hidden) return; // closed while we were rendering
        if (!seeded && cachedMetas?.length) input.value = String(planner.detOnly(cachedMetas, 10).suggestMinutes);
        renderRead(Math.max(1, Number(input.value) || 10));
      });
    // The note only shows for tiers strong enough to actually tailor the plan
    // (the floor/tiny tiers keep the proven deterministic coaching).
    const avail = model?.availability ? model.availability() : null;
    if (avail?.modelOn && isCapableTier(avail.generation)) {
      s.append(el('p', 'db-pv-ainote', '✦ AI coaching on — pacing and cues will be tailored to this deck.'));
    }

    const cancel = el('button', 'db-pv-cancel', 'Cancel'); cancel.type = 'button'; cancel.addEventListener('click', close);
    s.append(cancel);
    host.appendChild(s);
    setTimeout(() => input.focus(), 0);
  }

  return { open };
}
