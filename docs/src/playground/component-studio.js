// The Workbench — Layout Studio (Faculty 2) controller.
//
// The Form-layer sibling of theme-studio.js. Where the Theme Studio crafts a
// *style* (tokens), the Layout Studio crafts a *layout* — and the unit it
// yields is a CSS-only local *component* (design-system.md §6 term check). The
// author edits palette-blind CSS + a manifest + a skeleton; the studio renders
// the skeleton LIVE with that CSS injected, and a deterministic gate
// (lib/layout/*) holds the draft to the engine's own invariants — var(--…)
// only, .<name> selector scoping, manifest/skeleton coherence — exactly as the
// Theme Studio holds a palette to WCAG AA. The model proposes; the gates
// dispose. Copy/download the result as a graduation scaffold.
//
// All the gate + scaffold logic is the pure repo core (lib/layout/*), bundled
// to layout-core.generated.js — the SAME code the Node unit tests run. The
// preview palette is borrowed from the Theme Studio core so a component previews
// on a real, contrast-clean theme without the author choosing one.

// The SINGLE choke point every docs surface calls the engine's render()
// through — see render-engine.ts's header comment.
import { renderMarkdown } from '../lib/render-engine';
import { createThemeFetcher } from '../lib/theme-fetch';
import { deleteAsset, listAssets, putAsset } from './asset-store.js';
import { hashString, renderDeck } from './deck-preview.js';
import {
  collidesWithShipped,
  componentAsset,
  gateComponent,
  STARTERS,
  scaffoldFiles,
} from './layout-core.generated.js';
import { mountStudioPreviewConfig } from './studio-preview-config.js';
// Borrow a ready palette for the preview — the component is palette-blind, so
// any contrast-clean theme proves it obeyed the token rule.
import { deriveTheme, serializeTheme, STARTERS as THEME_STARTERS } from './theme-core.generated.js';

const PREVIEW_PALETTE = 'layout-preview'; // fixed @theme name for the live render

const FUNCTION_OPTS = ['anchor', 'statement', 'inventory', 'comparison', 'progression', 'evidence', 'imagery'];
const FORM_OPTS = ['bookend', 'divider', 'canvas', 'grid', 'stack', 'ledger', 'panel', 'matrix', 'scatter', 'spatial', 'timeline', 'split'];
// CSS-only studio: only the two no-transform substances are offered.
const SUBSTANCE_OPTS = ['prose', 'structure'];

/** Lowercase slug or a safe fallback. */
function slugify(name, fallback = 'component') {
  const s = String(name || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  return /^[a-z][a-z0-9-]*$/.test(s) ? s : fallback;
}

export function initLayoutStudio(config) {
  const { themeBase, runtimeUrl, shippedNames = [], finishes = [], modes = [] } = config;
  const root = document.querySelector('.studio-layout');
  if (!root) return;

  const els = {
    starters: root.querySelector('.lstudio-starters'),
    name: root.querySelector('.lstudio-name'),
    fn: root.querySelector('.lstudio-function'),
    form: root.querySelector('.lstudio-form'),
    substance: root.querySelector('.lstudio-substance'),
    tags: root.querySelector('.lstudio-tags'),
    description: root.querySelector('.lstudio-description'),
    css: root.querySelector('.lstudio-css-editor'),
    skeleton: root.querySelector('.lstudio-skeleton-editor'),
    preview: root.querySelector('.studio-preview-host'),
    findings: root.querySelector('.lstudio-findings'),
    summary: root.querySelector('.lstudio-findings-summary'),
    status: root.querySelector('.studio-status'),
    modeBtns: [...root.querySelectorAll('.studio-mode-btn')],
    copyCss: root.querySelector('.lstudio-copy-css'),
    copyManifest: root.querySelector('.lstudio-copy-manifest'),
    download: root.querySelector('.lstudio-download'),
    save: root.querySelector('.lstudio-save'),
    library: root.querySelector('.lstudio-library'),
    tabs: [...root.querySelectorAll('.studio-tab')],
  };

  const first = STARTERS[0];
  const state = {
    name: first.name,
    function: first.function,
    form: first.form,
    substance: first.substance,
    tags: first.tags.join(', '),
    description: first.description,
    css: first.css,
    skeleton: first.skeleton,
    mode: 'light',
  };

  // Preview setup — apply a finish / size / form to the skeleton preview
  // behind the scenes (so a component can be auditioned under sketch, etc.),
  // without it leaking into the saved component. `run` (hoisted) re-renders.
  const previewConfig = mountStudioPreviewConfig({
    root,
    body: () => state.skeleton,
    onChange: () => run(),
    finishes,
    modes,
    storageKey: 'lattice-wb-layout-preview-fm',
  });

  // ── Preview palette (borrowed from the Theme Studio core) ─────────────────
  // Theme fetch + addThemes is shared (theme-fetch.ts). This studio registers its
  // OWN borrowed palette (PREVIEW_PALETTE), so it only needs base lattice.css.
  const themes = createThemeFetcher(themeBase);
  const ensureBaseTheme = () => themes.ensureBase();
  let paletteRegistered = false;
  function ensurePalette() {
    const PG = window.LatticePlayground;
    if (!paletteRegistered) {
      const map = deriveTheme(THEME_STARTERS[0].essentials);
      PG.addThemes([serializeTheme(map, { name: PREVIEW_PALETTE, label: 'Layout preview' })]);
      paletteRegistered = true;
    }
  }

  function setStatus(msg, isErr) {
    if (!els.status) return;
    els.status.textContent = msg;
    els.status.classList.toggle('err', !!isErr);
  }

  // ── Fields ────────────────────────────────────────────────────────────────
  function fillSelect(sel, opts, value) {
    if (!sel) return;
    sel.innerHTML = '';
    for (const o of opts) {
      const opt = document.createElement('option');
      opt.value = o;
      opt.textContent = o;
      if (o === value) opt.selected = true;
      sel.appendChild(opt);
    }
  }
  function syncFields() {
    if (els.name) els.name.value = state.name;
    fillSelect(els.fn, FUNCTION_OPTS, state.function);
    fillSelect(els.form, FORM_OPTS, state.form);
    fillSelect(els.substance, SUBSTANCE_OPTS, state.substance);
    if (els.tags) els.tags.value = state.tags;
    if (els.description) els.description.value = state.description;
    if (els.css) els.css.value = state.css;
    if (els.skeleton) els.skeleton.value = state.skeleton;
  }
  function readFields() {
    if (els.name) state.name = els.name.value;
    if (els.fn) state.function = els.fn.value;
    if (els.form) state.form = els.form.value;
    if (els.substance) state.substance = els.substance.value;
    if (els.tags) state.tags = els.tags.value;
    if (els.description) state.description = els.description.value;
    if (els.css) state.css = els.css.value;
    if (els.skeleton) state.skeleton = els.skeleton.value;
  }

  /** The manifest object the gate + scaffold consume. */
  function currentManifest() {
    const name = slugify(state.name);
    const tags = state.tags.split(',').map(t => slugify(t, '')).filter(Boolean);
    return {
      name,
      function: state.function,
      bucket: state.function,
      form: state.form,
      substance: state.substance,
      tags,
      description: state.description,
      skeleton: state.skeleton,
    };
  }

  // ── Starters ────────────────────────────────────────────────────────────
  function buildStarters() {
    if (!els.starters) return;
    els.starters.innerHTML = '';
    for (const s of STARTERS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'studio-starter';
      btn.innerHTML = `<span class="studio-starter-name">${s.label}</span>`;
      btn.title = s.description;
      btn.addEventListener('click', () => {
        state.name = s.name;
        state.function = s.function;
        state.form = s.form;
        state.substance = s.substance;
        state.tags = s.tags.join(', ');
        state.description = s.description;
        state.css = s.css;
        state.skeleton = s.skeleton;
        syncFields();
        markActiveStarter(s.name);
        run();
      });
      els.starters.appendChild(btn);
    }
    markActiveStarter(state.name);
  }
  function markActiveStarter(name) {
    if (!els.starters) return;
    const btns = [...els.starters.querySelectorAll('.studio-starter')];
    STARTERS.forEach((s, i) => {
      btns[i]?.classList.toggle('is-active', s.name === name);
    });
  }

  // ── Gate findings ─────────────────────────────────────────────────────────
  function paintFindings(gate) {
    if (!els.findings) return;
    els.findings.innerHTML = '';
    const items = [...gate.errors, ...gate.warnings];
    for (const f of items) {
      const li = document.createElement('div');
      li.className = 'lstudio-finding ' + (f.level === 'error' ? 'bad' : 'warn');
      const where = f.line ? ` (line ${f.line})` : '';
      li.innerHTML = `<span class="lstudio-finding-rule">${f.rule}</span>` +
        `<span class="lstudio-finding-msg">${escapeHtml(f.message)}${where}</span>`;
      els.findings.appendChild(li);
    }
    if (els.summary) {
      els.summary.textContent = gate.ok
        ? items.length
          ? `Gate clean — ${gate.warnings.length} advisory${gate.warnings.length === 1 ? '' : 's'} ✓`
          : 'Gate clean — ready to graduate ✓'
        : `${gate.errors.length} error${gate.errors.length === 1 ? '' : 's'} block rendering`;
      els.summary.classList.toggle('ok', gate.ok);
      els.summary.classList.toggle('bad', !gate.ok);
    }
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  }

  // ── Live preview ──────────────────────────────────────────────────────────
  // Shared filmstrip-preview controller (deck-preview.js): visibility gate
  // (anti-flash), height clamp (anti-gap), size-awareness and section patching
  // for free. The component CSS bakes into the document, so its hash rides in the
  // sig — a CSS edit forces a full rewrite; a skeleton-only edit patches sections.
  let previewState = { frameSig: '', lastSections: null };
  function writeFrame(html, css, geom) {
    let fr = els.preview.querySelector('iframe.studio-frame');
    if (!fr) {
      fr = document.createElement('iframe');
      fr.className = 'studio-frame';
      fr.setAttribute('title', 'Live component preview');
      els.preview.appendChild(fr);
    }
    const mode = state.mode === 'dark' ? 'dark' : 'light';
    const sig = mode + '|' + geom.w + 'x' + geom.h + '|' + hashString(css);
    previewState = renderDeck({
      frame: fr, html, css, mode, geom, sig, state: previewState,
      runtimeUrl, gap: 18, colorScheme: mode, center: true,
    }).state;
    // Drop the loading skeleton (landing.css) once the preview has rendered.
    els.preview.classList.add('is-live');
  }

  // ── Gate → render ─────────────────────────────────────────────────────────
  function run() {
    readFields();
    const manifest = currentManifest();
    const gate = gateComponent({ css: state.css, manifest, skeleton: state.skeleton });
    paintFindings(gate);

    const PG = window.LatticePlayground;
    if (!PG) {
      setStatus('Loading engine…');
      return;
    }
    // Preview even with advisory findings, as long as we have a scoping name +
    // a skeleton — the author wants to SEE the work while fixing it.
    if (!/^[a-z][a-z0-9-]*$/.test(manifest.name) || !state.skeleton.trim()) {
      setStatus('Add a valid name and a skeleton to preview.', true);
      return;
    }
    setStatus('Rendering…');
    ensureBaseTheme()
      .then(async () => {
        ensurePalette();
        // Resolve a sample deck's `![bg](sample-image-*.svg)` against the staged
        // samples/ dir (sibling of themes/ under the hashed asset root). Absolute
        // base — themeBase is root-relative, the engine's URL resolver needs an
        // absolute base.
        const samplesBase = new URL(themeBase.replace(/themes\/$/, 'samples/'), location.href).href;
        const out = await renderMarkdown(PG, previewConfig.composed(), PREVIEW_PALETTE, { baseUrl: samplesBase });
        // The component CSS is palette-blind; append it after the theme CSS.
        writeFrame(out.html, out.css + '\n/* component */\n' + state.css, { w: out.width || 1280, h: out.height || 720 });
        const n = (out.html.match(/<\/section>/g) || []).length;
        setStatus(gate.ok
          ? `Live · ${n} slide${n === 1 ? '' : 's'} · .${manifest.name} · gate clean`
          : `Live · ${gate.errors.length} gate error${gate.errors.length === 1 ? '' : 's'} to fix`, !gate.ok);
      })
      .catch(e => setStatus(String(e.message || e), true));
  }

  let timer = null;
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(run, 220);
  }

  // ── Actions ─────────────────────────────────────────────────────────────
  async function copyText(text, okMsg) {
    try {
      await navigator.clipboard.writeText(text);
      setStatus(okMsg);
    } catch {
      setStatus('Copy failed — select the editor and copy manually.', true);
    }
  }
  function downloadFile(name, text, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  // ── Library (Workbench asset store) ──────────────────────────────────────
  async function saveToLibrary() {
    readFields();
    // Collision guard (component bridge): a local component must not take the
    // name of a shipped component class — otherwise the deck author can't tell
    // which they got, and an export would double-define the selector. Block it
    // at save time and ask for a rename. See the component-bridge decision note.
    const slug = slugify(state.name);
    if (collidesWithShipped(slug, shippedNames)) {
      setStatus(`“${slug}” is a built-in component — pick a different name for your local one.`, true);
      els.name?.focus();
      return;
    }
    try {
      await putAsset(componentAsset({ css: state.css, manifest: currentManifest(), skeleton: state.skeleton }));
      setStatus(`Saved “${slug}” to your library.`);
      renderLibrary();
    } catch (e) {
      setStatus('Save failed: ' + (e.message || e), true);
    }
  }
  function loadAsset(asset) {
    const m = asset.manifest || {};
    state.name = asset.name;
    state.function = m.function || state.function;
    state.form = m.form || state.form;
    state.substance = m.substance || state.substance;
    state.tags = Array.isArray(m.tags) ? m.tags.join(', ') : state.tags;
    state.description = m.description || '';
    state.css = asset.text || '';
    state.skeleton = asset.skeleton || m.skeleton || '';
    syncFields();
    markActiveStarter(asset.name);
    run();
    setStatus(`Loaded “${asset.name}” from library.`);
  }
  async function renderLibrary() {
    if (!els.library) return;
    let assets = [];
    try {
      assets = await listAssets('component');
    } catch {
      els.library.innerHTML = '<p class="studio-lib-empty">Library unavailable (private mode?).</p>';
      return;
    }
    els.library.innerHTML = '';
    if (assets.length === 0) {
      els.library.innerHTML = '<p class="studio-lib-empty">No saved components yet. Author one, then “Save current”.</p>';
      return;
    }
    for (const a of assets) {
      const row = document.createElement('div');
      row.className = 'studio-lib-item';
      const load = document.createElement('button');
      load.type = 'button';
      load.className = 'studio-lib-load';
      load.textContent = a.name;
      load.title = `Load ${a.name}`;
      load.addEventListener('click', () => loadAsset(a));
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'studio-lib-del';
      del.textContent = '×';
      del.title = `Delete ${a.name}`;
      del.addEventListener('click', async () => {
        await deleteAsset(a.id);
        renderLibrary();
      });
      row.append(load, del);
      els.library.appendChild(row);
    }
  }

  function wireActions() {
    els.save?.addEventListener('click', saveToLibrary);
    els.copyCss?.addEventListener('click', () => copyText(state.css, 'Component CSS copied.'));
    els.copyManifest?.addEventListener('click', () => {
      const files = scaffoldFiles({ css: state.css, manifest: currentManifest(), skeleton: state.skeleton });
      const name = slugify(state.name);
      copyText(files[`${name}.manifest.json`], 'Manifest JSON copied.');
    });
    els.download?.addEventListener('click', () => {
      const manifest = currentManifest();
      const gate = gateComponent({ css: state.css, manifest, skeleton: state.skeleton });
      if (!gate.ok) {
        setStatus('Fix the gate errors before downloading the scaffold.', true);
        return;
      }
      const files = scaffoldFiles({ css: state.css, manifest, skeleton: state.skeleton });
      for (const [fname, text] of Object.entries(files)) {
        downloadFile(fname, text, fname.endsWith('.json') ? 'application/json' : 'text/plain');
      }
      setStatus(`Downloaded scaffold for lib/components/${manifest.bucket}/${manifest.name}/.`);
    });

    for (const el of [els.name, els.tags, els.description, els.css, els.skeleton]) {
      el?.addEventListener('input', schedule);
    }
    for (const el of [els.fn, els.form, els.substance]) {
      el?.addEventListener('change', run);
    }
    for (const b of els.modeBtns) {
      b.addEventListener('click', () => {
        state.mode = b.dataset.mode === 'dark' ? 'dark' : 'light';
        for (const x of els.modeBtns) x.classList.toggle('is-active', x === b);
        run();
      });
    }
    for (const t of els.tabs) {
      t.addEventListener('click', () => {
        root.dataset.tab = t.dataset.tab;
        for (const x of els.tabs) x.classList.toggle('is-active', x === t);
        if (t.dataset.tab === 'preview') run();
      });
    }
  }

  // Expose the current draft as an asset record (for the Phase-2 store wiring).
  root.__layoutStudio = {
    run,
    asset: () => componentAsset({ css: state.css, manifest: currentManifest(), skeleton: state.skeleton }),
  };

  // ── Boot ────────────────────────────────────────────────────────────────
  buildStarters();
  syncFields();
  wireActions();
  renderLibrary();

  function whenReady(cb) {
    if (window.LatticePlayground) return cb();
    const t = setInterval(() => {
      if (window.LatticePlayground) {
        clearInterval(t);
        cb();
      }
    }, 50);
  }
  whenReady(run);
}
