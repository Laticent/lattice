// Component-page Specimen: a live preview that flips to an in-browser editor.
//
// One surface, two faces. The preview face renders the component's sample live
// through the playground engine and tracks the topbar (palette + light/dark).
// "Edit" flips the surface to a CodeMirror source face (auto-height, no inner
// scroll — the whole markdown is visible); typing re-renders the preview in the
// background so the flip back is instant. Edits are ephemeral (kept in
// sessionStorage so a reload survives, reset on demand); "Open in Playground"
// hands the current source off to the full playground.
//
// Reuses the shared single-slide renderer (../lib/single-slide-render.js) for the
// preview and createEditor (editor.js) for the source — the same engine + editor
// the playground uses.

import { createSingleSlideRenderer } from '../lib/single-slide-render';
import { createEditor } from './editor.js';

const FLIP_MS = 350; // keep in sync with @keyframes ll-flip in components.css
const SOURCE_KEY = 'lattice-docs-pg-source'; // shared handoff key the playground reads

const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function initSpecimen() {
  const dataEl = document.getElementById('specimen-data');
  const root = document.querySelector('.specimen');
  if (!dataEl || !root) return;
  const data = JSON.parse(dataEl.textContent);

  const stage = root.querySelector('.specimen-stage');
  const previewFace = root.querySelector('.specimen-face.preview');
  const sourceFace = root.querySelector('.specimen-face.source');
  const previewHost = root.querySelector('.specimen-preview-host');
  const editorHost = root.querySelector('.specimen-editor-host');
  const statusEl = root.querySelector('.specimen-status');
  const resetBtn = root.querySelector('.specimen-reset');
  const openBtn = root.querySelector('.specimen-open');
  const faceBtns = [...root.querySelectorAll('.specimen-face-btn')];
  const captionEl = root.querySelector('.specimen-variant-caption');

  // Variant map (key -> {sample, caption}); 'default' is the base layout. Each
  // variant can be previewed in place or opened in the playground.
  const variants = Array.isArray(data.variants) ? data.variants : [];
  const variantMap = Object.create(null);
  for (const v of variants) variantMap[v.key] = v;

  const storeKey = 'lattice-specimen-' + data.name;
  const read = (k) => {
    try {
      return sessionStorage.getItem(k);
    } catch {
      return null;
    }
  };
  const write = (k, v) => {
    try {
      sessionStorage.setItem(k, v);
    } catch {
      /* private mode / quota — non-fatal */
    }
  };
  const clear = (k) => {
    try {
      sessionStorage.removeItem(k);
    } catch {
      /* non-fatal */
    }
  };

  const saved = read(storeKey);
  // `base` = the markdown the current view started from (the selected variant's
  // sample); `source` may diverge from it once the user edits. Dirty/Reset are
  // measured against `base`, not the default, so they respect the variant.
  const state = {
    source: saved != null ? saved : data.sample,
    base: data.sample,
    variant: 'default',
    face: 'preview',
    editor: null,
  };

  const lr = createSingleSlideRenderer({ themeBase: data.themeBase, runtimeUrl: data.runtimeUrl, engineUrl: data.engineUrl });

  function setStatus(msg, isErr) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.classList.toggle('err', !!isErr);
  }

  function setDirty(dirty) {
    if (resetBtn) resetBtn.hidden = !dirty;
    root.classList.toggle('is-dirty', dirty);
  }

  let renderTimer = null;
  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(render, 200);
  }
  function render() {
    setStatus('Rendering…');
    lr.renderInto(previewHost, state.source, !!data.mermaid).then((r) => {
      if (r.ok) setStatus(r.slides + ' slide' + (r.slides === 1 ? '' : 's'));
      else setStatus(r.error || 'render failed', true);
    });
  }

  function ensureEditor() {
    if (state.editor) return state.editor;
    state.editor = createEditor({
      parent: editorHost,
      doc: state.source,
      autoHeight: true,
      // No catalog here, so proactive _class: type-ahead would be a no-op — skip it.
      typeahead: 'off',
      onChange: (v) => {
        state.source = v;
        const dirty = v !== state.base;
        setDirty(dirty);
        if (dirty) write(storeKey, v);
        else clear(storeKey);
        scheduleRender();
      },
    });
    return state.editor;
  }

  function showFace(face) {
    state.face = face;
    const isSource = face === 'source';
    if (isSource) ensureEditor();
    if (previewFace) previewFace.hidden = isSource;
    if (sourceFace) sourceFace.hidden = !isSource;
    faceBtns.forEach((b) => {
      const on = b.dataset.face === face;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.classList.toggle('is-active', on);
    });
    if (isSource && state.editor) state.editor.focus();
  }

  let flipping = false;
  function flipTo(face) {
    if (face === state.face || flipping) {
      if (face !== state.face) showFace(face);
      return;
    }
    if (prefersReducedMotion || !stage) {
      showFace(face);
      return;
    }
    flipping = true;
    stage.classList.add('flipping');
    // Swap faces at the edge-on midpoint so the change isn't visible.
    setTimeout(() => showFace(face), FLIP_MS / 2);
    setTimeout(() => {
      stage.classList.remove('flipping');
      flipping = false;
    }, FLIP_MS);
  }

  faceBtns.forEach((b) => {
    b.addEventListener('click', () => flipTo(b.dataset.face));
  });

  // Show the selected variant's caption (if any) under the variant bar.
  function setCaption(text) {
    if (!captionEl) return;
    captionEl.textContent = text || '';
    captionEl.hidden = !text;
  }

  // Switch the previewed variant: reseed source/base, re-render, and (if open)
  // update the editor. Reset/dirty now measure against this variant.
  function selectVariant(key) {
    const v = variantMap[key];
    if (!v) return;
    state.variant = key;
    state.base = v.sample;
    state.source = v.sample;
    if (state.editor) state.editor.setValue(v.sample);
    clear(storeKey);
    setDirty(false);
    setCaption(v.caption);
    for (const b of root.querySelectorAll('.specimen-variant')) {
      b.classList.toggle('is-active', b.dataset.variantSelect === key);
    }
    if (state.face === 'source') flipTo('preview');
    else render();
  }

  // Send a specific variant's markdown to the playground — via the ONE-SHOT
  // handoff key, never a direct source write (2026-07-05 Specimen Book decision
  // §4): the playground applies it when the draft is pristine, else parks it,
  // so a seed can no longer clobber unsaved work. Key + shape mirror
  // HANDOFF_KEY / makeHandoff in docs/src/lib/playground-controller.ts.
  function openInPlayground(markdown) {
    try {
      localStorage.setItem(
        'lattice-docs-pg-handoff',
        JSON.stringify({ md: markdown, from: 'the component reference', ts: Date.now() }),
      );
    } catch {
      /* non-fatal — playground falls back to its starter */
    }
    window.location.href = data.playgroundUrl;
  }

  // Delegated so the same actions work from the specimen's own variant pills
  // AND from the per-variant buttons in the docs below.
  //   [data-variant-select="<key>"]   → preview that variant in the specimen
  //   [data-open-playground="<key>"]  → open the playground seeded with it
  document.addEventListener('click', (e) => {
    const sel = e.target.closest('[data-variant-select]');
    if (sel) {
      const key = sel.dataset.variantSelect;
      if (variantMap[key]) {
        selectVariant(key);
        if (!sel.closest('.specimen')) root.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return;
    }
    const open = e.target.closest('[data-open-playground]');
    if (open) {
      e.preventDefault();
      const v = variantMap[open.dataset.openPlayground];
      openInPlayground(v ? v.sample : state.source);
    }
  });

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      state.source = state.base;
      if (state.editor) state.editor.setValue(state.base);
      clear(storeKey);
      setDirty(false);
      render();
      setStatus(state.variant === 'default' ? 'Reset to the example.' : `Reset to the ${state.variant} variant.`);
    });
  }

  if (openBtn) {
    openBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openInPlayground(state.source);
    });
  }

  // Initial paint + keep the preview live as the topbar palette/mode changes.
  // Kick the theme CSS fetch off in PARALLEL with the engine-bundle load (not
  // behind it) — same fix as DeckPreview.tsx's paint().
  lr.prefetchTheme();
  lr.whenReady().then(() => {
    render();
    lr.onThemeChange(() => {
      render();
      lr.scaleFrame(previewHost);
    });
  });

  setDirty(state.source !== data.sample);
}
