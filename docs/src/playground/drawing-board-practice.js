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

import { createRehearsalPlanner, metasFromSections, metasFromSource, overBeat } from '../components/studio/present/rehearsal.js';
import { createVoiceModel } from '../components/studio/present/voice-model.js';
// Shared theme registration (WRAP, DON'T REINVENT): walks the transitive
// `@import` closure so a multi-level theme (a11y-* → a11y-base → onyx → lattice)
// registers fully — the one tested path, not a re-inlined copy.
import { sanitizeSlideHtml } from '../lib/sanitize-slide-html.js';
import { createThemeFetcher } from '../lib/theme-fetch.ts';
// notes-core is THE single source for the note/non-note boundary (HARD RULE #1) —
// read it through the canonical extractor, never re-derive. It rides the
// authoring-core bundle (esbuild → browser ESM) because Vite-dev can't serve the
// raw CJS module; see tools/build-authoring-core.js.
import { notesCore } from './authoring-core.generated.js';
import { A11Y_DEFS, KATEX_URL, MERMAID_URL, splitSections } from './deck-preview.js';
import { createChartInteract } from './drawing-board-chart-interact.js';
import { isCapableTier } from './drawing-board-chat.js';
import { initPracticeTour } from './drawing-board-practice-tour.js';
import { budgetStatus, readBudgetCap, readBudgetMode, readSpend, recordSpend } from './drawing-board-settings.js';
import { slideBox } from './frame-css.js';
import { toursAllowedHere } from './guided-tour.js';
import { toursEnabled } from './tour-prefs.js';

const { notesFromHtml } = notesCore;

const BEAT_LABEL = { pause: 'Pause', eye: 'Look up', breathe: 'Breathe', transition: 'Transition', emphasis: 'Emphasize', over: 'Over time' };

function fmt(s) {
  s = Math.max(0, Math.round(s));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

export function createPractice({ host, getSource, runtimeUrl, themeBase, bucketOf, model, voice: sharedVoice, openVoiceSettings }) {
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
  // Read-aloud: the voice ladder. It reuses the architect's OpenRouter key for the
  // hosted rung; falls back to in-browser Kokoro (summoned on demand) for no-key
  // users; never speechSynthesis in production. See voice-model.js.
  // One shared voice model across the page (Practice + the Settings Voice tab) so
  // prefs, the loaded Kokoro worker, and the download all stay in sync. Falls back
  // to its own instance when none is injected (older callers / tests).
  const voice = sharedVoice || createVoiceModel({ getOpenRouterKey: () => (model?.openRouterKey ? model.openRouterKey() : null) });
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
  let prepared = null; // { out, sections, metas, notes, bg } — one engine render, shared by the start screen + the run
  let cachedMetas = null; // the slide metas the read/plan run off (engine-derived, source as fallback)
  let cachedNotes = null; // per-slide speaker notes (index-aligned with the plan), for read-aloud
  let reading = false; // read-aloud is armed → it follows navigation, narrating each slide
  let speakCtl = null; // AbortController for the in-flight utterance (barge-in on nav)
  let voiceLoading = false; // a Kokoro summon (the ~80 MB local-voice download) is in flight
  let voiceProg = 0; // that download's 0–100 progress, shown on the button
  let voiceErr = false; // the last summon failed → button offers a retry
  let elRead = null; // the read-aloud button in the bottom HUD

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
    // Lift each slide's speaker note (the real talk track) for read-aloud, through
    // the canonical extractor. Index-aligned with the sections → the plan slides.
    const notes = sections.map((h) => { try { return notesFromHtml(h); } catch { return null; } });
    prepared = { out, sections, metas, notes, bg: mode === 'dark' ? '#0c0c0c' : '#15110d' };
    cachedMetas = metas;
    cachedNotes = notes;
    return prepared;
  }

  // The rehearsal iframe. ONE slide, centred, scaled uniformly to fit — the slide
  // box is pinned through frame-css (so container-query layouts resolve against the
  // real `@size`, just like the preview). A no-zoom viewport + touch-action kill
  // the iOS double-tap-to-zoom that used to jolt the stage.
  function frameDoc(html, css, bg, geom) {
    html = sanitizeSlideHtml(html); // #616 T-CONTENT — strip script before the same-origin rehearsal srcdoc
    const sw = geom?.width || 1280;
    const sh = geom?.height || 720;
    // Isolated stage (see Present): #latt-stage/#latt-fit (ID-scoped, out.css can't
    // clobber; wraps .lattice so the slide's transform can't trap our fixed box);
    // 100dvh flex-center → visual center on mobile Safari.
    const FIT =
      '(function(){' +
      'var stage=document.getElementById("latt-stage"),fitEl=document.getElementById("latt-fit");' +
      'function secs(){var m=document.querySelector(".lattice");return m?m.querySelectorAll(":scope>section"):[]}' +
      'var cur=0;' +
      'function fit(){var s=secs();if(!s.length||!stage||!fitEl)return;' +
      'var W=stage.clientWidth||window.innerWidth,H=stage.clientHeight||window.innerHeight;' +
      'var pad=Math.max(14,Math.min(W,H)*0.04);' +
      'var sc=Math.min((W-pad*2)/' + sw + ',(H-pad*2)/' + sh + ');if(!(sc>0))sc=1;' +
      'fitEl.style.width=(sc*' + sw + ')+"px";fitEl.style.height=(sc*' + sh + ')+"px";' +
      // Show/hide WITHOUT forcing display:block — that clobbers the section's CSS
      // display:flex (title/closing/divider center content with it). "" reverts.
      'for(var i=0;i<s.length;i++){var on=i===cur;s[i].style.display=on?"":"none";' +
      'if(on){s[i].style.transformOrigin="top left";s[i].style.transform="scale("+sc+")"}}}' +
      'function show(n){cur=n|0;fit()}' +
      'window.addEventListener("message",function(e){if(e.data&&e.data.pv!=null)show(e.data.pv)});' +
      'window.addEventListener("resize",fit);window.addEventListener("orientationchange",fit);' +
      'if(window.visualViewport){try{window.visualViewport.addEventListener("resize",fit)}catch(e){}}' +
      'if(typeof ResizeObserver!=="undefined"){try{new ResizeObserver(fit).observe(stage)}catch(e){}}' +
      '[60,300,1200].forEach(function(t){setTimeout(fit,t)});show(0);' +
      '})();';
    return (
      '<!doctype html><html><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">' +
      '<link rel="stylesheet" href="' + KATEX_URL + '">' +
      '<style>html,body{margin:0;padding:0;height:100%;background:' + bg + ';overflow:hidden;touch-action:manipulation;-webkit-text-size-adjust:100%;}' +
      '#latt-stage{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;overflow:hidden;visibility:hidden;}' +
      '#latt-fit{overflow:hidden;}' +
      '#latt-fit .lattice{margin:0;padding:0;}' +
      '#latt-fit .lattice>section{transform-origin:top left;box-shadow:0 18px 60px rgba(0,0,0,.45);border-radius:10px;}' +
      slideBox(sw, sh) +
      css + '</style></head><body>' +
      A11Y_DEFS + '<div id="latt-stage"><div id="latt-fit">' + html + '</div></div>' +
      '<scr' + 'ipt src="' + MERMAID_URL + '"></scr' + 'ipt>' +
      '<scr' + 'ipt src="' + runtimeUrl + '"></scr' + 'ipt>' +
      '<scr' + 'ipt>requestAnimationFrame(function(){var st=document.getElementById("latt-stage");if(st)st.style.visibility="visible"});</scr' + 'ipt>' +
      '<scr' + 'ipt>' + FIT + '</scr' + 'ipt></body></html>'
    );
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
    voice.stop();
    reading = false;
    if (speakCtl) { try { speakCtl.abort(); } catch {} speakCtl = null; }
    // Drop the run's state so a re-opened START screen is inert to nav keys: the
    // `!plan` guard in onKey only holds if `plan` is cleared here (close() runs
    // before open() rebuilds the chooser), and the handles below now point at
    // detached nodes — null them so nothing stale is touched.
    plan = null;
    if (chartInteract) { chartInteract.destroy(); chartInteract = null; }
    layer = elAuto = elFs = elReady = frame = runEl = null;
    elRead = null;
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
    else if (e.key === 'v' || e.key === 'V') { e.preventDefault(); toggleRead(); }
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
  // ── Read-aloud ────────────────────────────────────────────────────────────
  // The text to speak for a slide: its speaker note (the real talk track), falling
  // back to the rehearsal snippet so a note-less slide still reads something sane.
  function noteFor(i) {
    const n = cachedNotes?.[i];
    const snip = plan?.slides[i]?.snippet;
    return n?.trim() || snip?.trim() || '';
  }
  // Narrate the current slide. Aborts any in-flight utterance first (barge-in).
  function speakSlide() {
    if (speakCtl) { try { speakCtl.abort(); } catch {} }
    const text = noteFor(idx);
    if (!text) { updateRead(); return; }
    speakCtl = new AbortController();
    voice.speak({ text, signal: speakCtl.signal, onState: () => updateRead() });
    updateRead();
  }
  // No cloud key and no local model yet → summon Kokoro (the deliberate ~80 MB
  // download), then start reading. Progress rides on the button; a failed
  // download surfaces a retry state rather than silently resetting.
  function summonVoice() {
    if (voiceLoading) return;
    voiceLoading = true; voiceErr = false; voiceProg = 0; updateRead();
    voice
      .loadKokoro((p) => { voiceProg = Math.round((p?.progress || 0) * 100); updateRead(); })
      .then(() => { voiceLoading = false; reading = true; updateRead(); speakSlide(); })
      .catch(() => { voiceLoading = false; voiceErr = true; updateRead(); });
  }
  function toggleRead() {
    voice.unlock?.(); // resume the WebAudio context on the tap so iOS permits later playback
    if (voiceLoading) return;
    const avail = voice.availability();
    if (avail.rung === 'silent') {
      // Mobile: on-device voice is desktop-only, so there's nothing to download —
      // send the user to connect the cloud voice instead of summoning Kokoro.
      if (!avail.kokoroSupported) { openVoiceSettings?.(); return; }
      summonVoice(); return; // desktop: download the local model (also the retry path)
    }
    // While speaking, the button is a true pause/resume (keeps position); when
    // idle it (re)starts the current slide and arms read-along navigation.
    if (voice.speaking()) {
      if (voice.paused()) voice.resume(); else voice.pause();
      updateRead();
      return;
    }
    reading = true; speakSlide();
  }
  function updateRead() {
    if (!elRead) return;
    const speaking = voice.speaking();
    const paused = speaking && voice.paused();
    const avail = voice.availability();
    const silent = avail.rung === 'silent';
    // Mobile (on-device is desktop-only): no local download is possible, so a silent
    // rung means "connect the cloud voice". Desktop: a never-downloaded local model
    // with no cloud voice gets the download glyph (a cached-but-unloaded model isn't
    // a download — pressing just loads it from cache).
    const needsCloud = silent && !avail.kokoroSupported;
    const needsDownload = silent && avail.kokoroSupported && !avail.kokoroCached;
    elRead.classList.toggle('is-on', (reading || speaking) && !paused);
    elRead.classList.toggle('is-loading', voiceLoading);
    let ico; let title;
    if (voiceLoading) { ico = 'ico-loader'; title = 'Loading voice… ' + voiceProg + '%'; }
    else if (voiceErr) { ico = 'ico-alert'; title = 'Voice couldn’t load — tap to retry'; }
    else if (paused) { ico = 'ico-play'; title = 'Resume reading (V)'; }
    else if (speaking) { ico = 'ico-pause'; title = 'Pause reading (V)'; }
    else if (needsCloud) { ico = 'ico-volume2'; title = 'Connect a cloud voice to read aloud (Settings → Voice)'; }
    else if (needsDownload) { ico = 'ico-download'; title = 'Enable a voice (downloads a local model, ~80 MB)'; }
    else { ico = 'ico-volume2'; title = 'Read this slide aloud (V)'; }
    elRead.innerHTML = '<span class="ico ' + ico + (voiceLoading ? ' spin' : '') + '" aria-hidden="true"></span>';
    elRead.title = title;
    elRead.setAttribute('aria-label', title);
    elRead.setAttribute('aria-pressed', String((reading || speaking) && !paused));
  }

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
    // Read-aloud rides navigation: when armed, narrate the new slide (aborting the
    // old one); otherwise make sure no audio bleeds across the transition.
    if (reading) speakSlide();
    else { voice.stop(); updateRead(); }
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
    // Read-aloud toggle — leads the readout (left of the clock). Speaker when idle,
    // pause while reading, a cloud prompt when no voice is connected (mobile).
    elRead = el('button', 'db-pv-speak'); elRead.type = 'button';
    elRead.addEventListener('click', toggleRead);
    elClock = el('span', 'db-pv-clock', '0:00');
    gElapsed.append(elClock, el('span', 'db-pv-time-k', 'elapsed'));
    const gSlide = el('div', 'db-pv-time');
    elSlideTimeV = el('span', 'db-pv-slidetime-v', '0:00');
    gSlide.append(elSlideTimeV, el('span', 'db-pv-time-k', 'this slide'));
    elPace = el('span', 'db-pv-pace ok', 'on track');
    readout.append(elRead, gElapsed, el('span', 'db-pv-vr'), gSlide, el('span', 'db-pv-vr'), elPace);
    nav.append(readout);
    updateRead();
    // Re-probe the on-disk cache (it may have been downloaded via Settings since the
    // voice model was created) so the button reflects "ready", not "download".
    voice.probeKokoroCache?.().then(() => updateRead());

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
