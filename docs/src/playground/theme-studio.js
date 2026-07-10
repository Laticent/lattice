// The Workbench — Theme Studio (Faculty 1) controller.
//
// Turns a small author-facing ESSENTIAL SET into a complete, contrast-clean
// Lattice palette and shows it LIVE: edit a colour → re-derive the full
// ~100-token contract (lib/theme/derive.js) → register it with the in-browser
// engine (window.LatticePlayground, the same marp-cli path the Playground and
// Drawing Board use) → re-render a specimen deck → repaint the contrast meter
// (lib/theme/contrast.js, the gate's own predicate). Copy or download the
// result as a droppable themes/<name>.css.
//
// The studio is the PRODUCER; the engine is the pipe. All the colour maths is
// the pure repo core (lib/theme/*) — the SAME code the Node tooling and the
// WCAG contrast gate run, imported here via the CJS→ESM transform configured in
// docs/astro.config.mjs. No model is involved in Faculty 1's deterministic
// core; seeds come from the starter library.

// The SINGLE choke point every docs surface calls the engine's render()
// through — see render-engine.ts's header comment.
import { renderMarkdown } from '../lib/render-engine';
// Theme fetch + addThemes (the "ensureThemes" pattern) is shared — theme-fetch.ts.
import { createThemeFetcher } from '../lib/theme-fetch';
// The on-device / OpenRouter model ladder — the SAME adapter the Drawing Board
// Architect uses (connection persists in localStorage, so a model connected
// there works here too). complete() ALWAYS resolves: it floors to the
// deterministic core when no model is present.
import { createArchitectModel } from './architect-model.js';
import { deleteAsset, listAssets, putAsset } from './asset-store.js';
import { hashString, renderDeck } from './deck-preview.js';
import { mountStudioPreviewConfig } from './studio-preview-config.js';
// The pure theme core (lib/theme/*) is CommonJS and its modules require() each
// other, which Vite's dev server can't transform in arbitrary source files. So
// we consume it through the esbuild bundle (tools/build-theme-core.js →
// theme-core.generated.js): one ESM module, real named exports, the SAME maths
// as the Node tooling + the WCAG gate. Rebuild with `npm run theme-core:build`.
import {
  askMessages,
  auditBoth,
  coerceEssentials,
  deriveTheme,
  STARTERS,
  serializeTheme,
  themeAsset,
  validateEssentials,
} from './theme-core.generated.js';

const PREVIEW_THEME = 'studio-preview'; // fixed @theme name for the live render

// Author-facing grouping of the essential set (lib/theme ESSENTIAL_KEYS).
const FIELD_GROUPS = [
  { title: 'Surfaces', fields: [['bg', 'Canvas'], ['bgAlt', 'Card / alt surface']] },
  {
    title: 'Ink',
    fields: [['textHeading', 'Heading'], ['textBody', 'Body'], ['textMuted', 'Muted (decorative)']],
  },
  { title: 'Brand', fields: [['accent', 'Accent'], ['accentSoft', 'Accent soft (pale fill)']] },
  { title: 'Signals', fields: [['pass', 'Pass'], ['warn', 'Warn'], ['fail', 'Fail']] },
];

// A compact specimen deck spanning the contract: a dark title canvas, light
// surfaces + accent + ink tiers, the semantic signals, a categorical chart, a
// code block (hljs), and a diagram (the --diagram-* / --cat-* tokens). One screen of proof.
// Built from single-quoted lines (which hold backticks / ``` fences without
// escaping) joined by newlines — no String.raw needed.
const SPECIMEN = [
  '<!-- _class: title silent -->',
  '',
  '`theme studio`',
  '',
  '# The deck is already designed.',
  '',
  'A live specimen — surfaces, accent, signals, charts, code, diagrams.',
  '',
  '---',
  '',
  '## Surfaces, ink, and accent',
  '',
  'Body prose rides on the canvas in the body-ink tier, with an **accented**',
  'emphasis and muted secondary notes. Cards lift off the canvas on the',
  'alternate surface.',
  '',
  '- Heading ink reads AA on both surfaces',
  '  - Body ink carries the prose',
  '- The accent marks what matters',
  '  - Soft accent fills the recommended surface',
  '',
  '---',
  '',
  '<!-- _class: kpi -->',
  '',
  '## Signals read at a glance',
  '',
  '1. $4.2M',
  '   - Revenue',
  '   - +12% QoQ `On plan`',
  '2. 840ms',
  '   - Latency',
  '   - +5% QoQ `Watch`',
  '3. 2.1%',
  '   - Error rate',
  '   - +0.4% QoQ `Off plan`',
  '',
  '---',
  '',
  '## Categorical palette',
  '',
  '```mermaid',
  'pie showData',
  '  title Mix',
  '  "Alpha" : 38',
  '  "Bravo" : 26',
  '  "Charlie" : 20',
  '  "Delta" : 16',
  '```',
  '',
  '---',
  '',
  '## Code & diagram',
  '',
  '```js',
  'export function derive(essentials) {',
  '  const theme = fromTokens(essentials); // contrast-aware',
  '  return theme.ok ? theme : repair(theme);',
  '}',
  '```',
  '',
  '```mermaid',
  'flowchart LR',
  '  A[Essentials] --> B[Derive] --> C{AA?}',
  '  C -- yes --> D[Theme]',
  '  C -- no --> B',
  '```',
].join('\n');

/** Lowercase slug or a safe fallback, for the export filename + @theme name. */
function slugify(name, fallback = 'studio') {
  const s = String(name || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  return /^[a-z][a-z0-9-]*$/.test(s) ? s : fallback;
}

export function initThemeStudio(config) {
  const { themeBase, runtimeUrl, finishes = [], modes = [] } = config;
  const root = document.querySelector('.studio');
  if (!root) return;

  const els = {
    fields: root.querySelector('.studio-fields'),
    starters: root.querySelector('.studio-starters'),
    name: root.querySelector('#studio-name'),
    preview: root.querySelector('.studio-preview-host'),
    meter: root.querySelector('.studio-meter'),
    status: root.querySelector('.studio-status'),
    summary: root.querySelector('.studio-meter-summary'),
    modeBtns: [...root.querySelectorAll('.studio-mode-btn')],
    copy: root.querySelector('.studio-copy'),
    download: root.querySelector('.studio-download'),
    code: root.querySelector('.studio-code'),
    save: root.querySelector('.studio-theme-save'),
    library: root.querySelector('.studio-theme-library'),
    // AI tier — one conversational box
    aiPrompt: root.querySelector('.studio-ai-prompt'),
    aiAsk: root.querySelector('.studio-ai-ask'),
    aiStatus: root.querySelector('.studio-ai-status'),
    aiConnect: root.querySelector('.studio-ai-connect'),
    aiHistory: root.querySelector('.studio-ai-history'),
    tabs: [...root.querySelectorAll('.studio-tab')],
  };

  const state = {
    essentials: { ...STARTERS[0].essentials },
    label: STARTERS[0].label,
    mode: 'light', // preview canvas
    css: '',
  };
  if (els.name) els.name.value = STARTERS[0].name;

  // Preview setup — a state-backed deck-config that applies a finish / size /
  // form to the specimen behind the scenes, so the theme can be auditioned
  // under sketch etc. `run` (hoisted below) re-renders on every change.
  const previewConfig = mountStudioPreviewConfig({
    root,
    body: () => SPECIMEN,
    onChange: () => run(),
    finishes,
    modes,
    storageKey: 'lattice-wb-theme-preview-fm',
  });

  // The model ladder — shared with the Drawing Board via localStorage. Floors
  // to the deterministic core when nothing is connected.
  const model = createArchitectModel({
    getSettings: () => {
      let on = true;
      try {
        on = localStorage.getItem('lattice-db-model') !== 'off';
      } catch {
        /* private mode */
      }
      return { modelEnabled: on };
    },
  });

  // Theme fetch + addThemes is shared (theme-fetch.ts). The studio registers its
  // OWN derived palettes (PREVIEW_THEME), so it only needs the base lattice.css
  // contract registered once — ensureBase().
  const themes = createThemeFetcher(themeBase);
  const ensureBaseTheme = () => themes.ensureBase();

  function setStatus(msg, isErr) {
    if (!els.status) return;
    els.status.textContent = msg;
    els.status.classList.toggle('err', !!isErr);
  }

  // ── Build the essentials form ───────────────────────────────────────────
  const inputs = {}; // key -> { color, hex }
  function buildFields() {
    if (!els.fields) return;
    els.fields.innerHTML = '';
    for (const group of FIELD_GROUPS) {
      const fs = document.createElement('div');
      fs.className = 'studio-group';
      fs.innerHTML = `<h3>${group.title}</h3>`;
      for (const [key, label] of group.fields) {
        const row = document.createElement('label');
        row.className = 'studio-field';
        const color = document.createElement('input');
        color.type = 'color';
        color.value = state.essentials[key];
        const hex = document.createElement('input');
        hex.type = 'text';
        hex.className = 'studio-hex';
        hex.value = state.essentials[key];
        hex.spellcheck = false;
        const span = document.createElement('span');
        span.className = 'studio-field-label';
        span.textContent = label;
        row.append(color, hex, span);
        fs.appendChild(row);
        inputs[key] = { color, hex };

        const onColor = v => {
          if (!/^#[0-9a-f]{6}$/i.test(v)) return;
          state.essentials[key] = v.toLowerCase();
          color.value = v.toLowerCase();
          hex.value = v.toLowerCase();
          schedule();
        };
        color.addEventListener('input', () => onColor(color.value));
        hex.addEventListener('input', () => {
          let v = hex.value.trim();
          if (/^[0-9a-f]{6}$/i.test(v)) v = '#' + v;
          if (/^#[0-9a-f]{6}$/i.test(v)) {
            state.essentials[key] = v.toLowerCase();
            color.value = v.toLowerCase();
            schedule();
          }
        });
      }
      els.fields.appendChild(fs);
    }
  }

  function syncFields() {
    for (const key of Object.keys(inputs)) {
      inputs[key].color.value = state.essentials[key];
      inputs[key].hex.value = state.essentials[key];
    }
  }

  // ── Starter picker ──────────────────────────────────────────────────────
  function buildStarters() {
    if (!els.starters) return;
    els.starters.innerHTML = '';
    for (const s of STARTERS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'studio-starter';
      b.dataset.starter = s.name;
      b.innerHTML =
        `<span class="studio-swatches">` +
        [s.essentials.bg, s.essentials.accent, s.essentials.accentSoft, s.essentials.textHeading]
          .map(c => `<i style="background:${c}"></i>`)
          .join('') +
        `</span><span class="studio-starter-name">${s.label}</span>`;
      b.addEventListener('click', () => {
        state.essentials = { ...s.essentials };
        state.label = s.label;
        if (els.name) els.name.value = s.name;
        syncFields();
        markStarter(s.name);
        schedule();
      });
      els.starters.appendChild(b);
    }
    markStarter(STARTERS[0].name);
  }
  function markStarter(name) {
    for (const b of els.starters?.querySelectorAll('.studio-starter') || []) {
      b.classList.toggle('is-active', b.dataset.starter === name);
    }
  }

  // ── Live preview ────────────────────────────────────────────────────────
  // The shared filmstrip-preview controller (deck-preview.js) owns the iframe
  // write/patch/fit — the visibility gate (anti-flash), the height clamp
  // (anti-gap) and size-awareness come for free. The token CSS bakes into the
  // document, so its hash rides in the sig: a palette edit forces a full rewrite,
  // not a section-only patch that would leave the stale theme. colorScheme forces
  // the canvas side so the theme's light-dark() pairs resolve as chosen.
  let previewState = { frameSig: '', lastSections: null };
  function writeFrame(html, css, geom) {
    let fr = els.preview.querySelector('iframe.studio-frame');
    if (!fr) {
      fr = document.createElement('iframe');
      fr.className = 'studio-frame';
      fr.setAttribute('title', 'Live theme preview');
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

  // ── Contrast meter ──────────────────────────────────────────────────────
  function paintMeter(map) {
    if (!els.meter) return;
    const both = auditBoth(map, { level: 'full' });
    els.meter.innerHTML = '';
    const rows = [];
    for (const mode of ['light', 'dark']) {
      for (const r of both[mode].results) {
        rows.push({ mode, ...r });
      }
    }
    // De-dupe identical pairs that pass in both modes into one row per mode is
    // noisy; show grouped by role, worst ratio across modes.
    const byPair = new Map();
    for (const r of rows) {
      const k = r.fill + '/' + r.ink;
      const prev = byPair.get(k);
      if (!prev || (r.ratio || 0) < (prev.ratio || 0)) byPair.set(k, r);
    }
    for (const r of byPair.values()) {
      const li = document.createElement('div');
      li.className = 'studio-pair ' + (r.status === 'pass' ? 'ok' : r.status === 'fail' ? 'bad' : 'na');
      const ratio = r.ratio ? r.ratio.toFixed(2) + ':1' : r.status;
      li.innerHTML =
        `<span class="studio-pair-role">${r.role}</span>` +
        `<span class="studio-pair-chip" style="background:${r.fillHex || '#ccc'};color:${r.inkHex || '#000'}">Aa</span>` +
        `<span class="studio-pair-ratio">${ratio}</span>`;
      els.meter.appendChild(li);
    }
    if (els.summary) {
      const fails = [...byPair.values()].filter(r => r.status === 'fail').length;
      els.summary.textContent = both.ok
        ? 'WCAG AA clean — both canvas modes ✓'
        : `${fails} pair${fails === 1 ? '' : 's'} below AA (advisory tier; the gate-critical contract is auto-repaired)`;
      els.summary.classList.toggle('ok', both.ok);
      els.summary.classList.toggle('bad', !both.ok);
    }
  }

  // ── Derive → register → render → audit ──────────────────────────────────
  function run() {
    const PG = window.LatticePlayground;
    if (!PG) {
      setStatus('Loading engine…');
      return;
    }
    let map;
    try {
      validateEssentials(state.essentials);
      map = deriveTheme(state.essentials);
    } catch (e) {
      setStatus(String(e.message || e), true);
      return;
    }
    paintMeter(map);

    const exportName = slugify(els.name ? els.name.value : 'studio');
    state.css = serializeTheme(map, { name: exportName, label: state.label });
    if (els.code) els.code.textContent = state.css;

    // Register the preview under a fixed name + render the specimen.
    setStatus('Rendering…');
    ensureBaseTheme()
      .then(async () => {
        const previewCss = serializeTheme(map, { name: PREVIEW_THEME, label: state.label });
        PG.addThemes([previewCss]);
        const out = await renderMarkdown(PG, previewConfig.composed(), PREVIEW_THEME);
        writeFrame(out.html, out.css, { w: out.width || 1280, h: out.height || 720 });
        const n = (out.html.match(/<\/section>/g) || []).length;
        setStatus(`Live · ${n} specimen slide${n === 1 ? '' : 's'} · ${exportName}.css`);
      })
      .catch(e => setStatus(String(e.message || e), true));
  }

  let timer = null;
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(run, 180);
  }

  // Expose a thin run handle so React chrome (the faculty Tabs + the mobile
  // pane Tabs) can re-fit the preview after revealing the stage — the same
  // `run()` the studio drives internally. Driving, not reimplementing.
  root.__themeStudio = { run };

  // ── AI tier (Phase 2) — seed from a description, refine conversationally ──
  // The model only PROPOSES an essential set; coerceEssentials + the
  // deterministic derivation + the contrast gate dispose. complete() floors to
  // the deterministic core when nothing is connected, so we gate on
  // availability and guide the author to connect rather than silently no-op.
  function setAiStatus(msg, isErr) {
    if (!els.aiStatus) return;
    els.aiStatus.textContent = msg;
    els.aiStatus.classList.toggle('err', !!isErr);
  }

  function modelConnected() {
    try {
      return model.availability().generation !== 'floor';
    } catch {
      return false;
    }
  }

  function refreshAiStatus() {
    const connected = modelConnected();
    let label = 'No model connected';
    if (connected) {
      const a = model.availability();
      label =
        a.generation === 'openrouter'
          ? `OpenRouter · ${model.openRouterModelName?.() || 'connected'}`
          : `On-device · ${a.generation}`;
    }
    setAiStatus(connected ? `AI: ${label}` : 'AI: connect a model to design with words');
    if (els.aiConnect) els.aiConnect.hidden = connected;
  }

  // Recent prompts (most-recent-first), shown as re-runnable chips.
  const history = [];
  function pushHistory(prompt) {
    const i = history.indexOf(prompt);
    if (i !== -1) history.splice(i, 1);
    history.unshift(prompt);
    history.length = Math.min(history.length, 5);
    renderHistory();
  }
  function renderHistory() {
    if (!els.aiHistory) return;
    els.aiHistory.innerHTML = '';
    els.aiHistory.hidden = history.length === 0;
    for (const p of history) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'studio-ai-chip';
      chip.textContent = p;
      chip.title = 'Run again: ' + p;
      chip.addEventListener('click', () => ask(p));
      els.aiHistory.appendChild(chip);
    }
  }

  let aiBusy = false;
  // ONE request handler — originate ("warm editorial") or adjust ("cooler"); the
  // model decides from the words, with the current palette as context.
  async function ask(prompt) {
    const text = String(prompt ?? (els.aiPrompt ? els.aiPrompt.value : '')).trim();
    if (aiBusy) return;
    if (!modelConnected()) {
      setAiStatus('Connect a model first (button below), then ask.', true);
      return;
    }
    if (!text) {
      setAiStatus('Describe a palette, or ask for a change — e.g. “navy accent”.', true);
      return;
    }
    aiBusy = true;
    if (els.aiAsk) els.aiAsk.disabled = true;
    setAiStatus('Asking the model…');
    try {
      const reply = await model.complete({
        messages: askMessages(state.essentials, text),
        json: true,
        fallback: state.essentials,
      });
      const { essentials, ok, filled } = coerceEssentials(reply, state.essentials);
      if (!ok) {
        setAiStatus('No usable palette came back — try rephrasing.', true);
        return;
      }
      state.essentials = essentials;
      syncFields();
      run();
      pushHistory(text);
      if (els.aiPrompt) els.aiPrompt.value = '';
      const note = filled.length ? ` (${filled.length} kept)` : '';
      setAiStatus(`Applied${note}.`);
    } catch (e) {
      setAiStatus('Request failed: ' + (e.message || e), true);
    } finally {
      aiBusy = false;
      if (els.aiAsk) els.aiAsk.disabled = false;
    }
  }

  async function connectModel() {
    try {
      const callback = location.origin + location.pathname; // return here after OAuth
      const url = await model.beginOpenRouterAuth(callback);
      if (url) location.href = url;
    } catch (e) {
      setAiStatus('Connect failed: ' + (e.message || e), true);
    }
  }

  // Resume an OpenRouter OAuth redirect (?code=) so the author can connect from
  // the Workbench itself, not only the Drawing Board.
  async function resumeAuthIfPending() {
    try {
      const u = new URL(location.href);
      const code = u.searchParams.get('code');
      if (code && model.hasPendingOpenRouterAuth?.()) {
        setAiStatus('Finishing connection…');
        await model.resumeOpenRouterAuth(code);
        u.searchParams.delete('code');
        u.searchParams.delete('scope');
        history.replaceState({}, '', u.pathname + u.search + u.hash);
      }
    } catch {
      /* non-fatal — stays on the deterministic floor */
    }
    refreshAiStatus();
  }

  // ── Library (Workbench asset store) ──────────────────────────────────────
  async function saveToLibrary() {
    const name = slugify(els.name ? els.name.value : 'studio');
    try {
      const asset = themeAsset({ name, label: state.label, essentials: state.essentials, css: state.css });
      await putAsset(asset);
      setStatus(`Saved “${name}” to your library.`);
      renderLibrary();
    } catch (e) {
      setStatus('Save failed: ' + (e.message || e), true);
    }
  }
  function loadAsset(asset) {
    if (asset.essentials) state.essentials = { ...asset.essentials };
    state.label = asset.label || asset.name;
    if (els.name) els.name.value = asset.name;
    syncFields();
    run();
    setStatus(`Loaded “${asset.name}” from library.`);
  }
  async function renderLibrary() {
    if (!els.library) return;
    let assets = [];
    try {
      assets = await listAssets('theme');
    } catch {
      els.library.innerHTML = '<p class="studio-lib-empty">Library unavailable (private mode?).</p>';
      return;
    }
    els.library.innerHTML = '';
    if (assets.length === 0) {
      els.library.innerHTML = '<p class="studio-lib-empty">No saved themes yet. Craft one, then “Save current”.</p>';
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

  // ── Actions ─────────────────────────────────────────────────────────────
  function wireActions() {
    els.save?.addEventListener('click', saveToLibrary);
    els.copy?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(state.css);
        setStatus('Theme CSS copied to clipboard.');
      } catch {
        setStatus('Copy failed — select the CSS panel and copy manually.', true);
      }
    });
    els.download?.addEventListener('click', () => {
      const name = slugify(els.name ? els.name.value : 'studio');
      const blob = new Blob([state.css], { type: 'text/css' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name + '.css';
      a.click();
      URL.revokeObjectURL(a.href);
      setStatus(`Downloaded ${name}.css — drop it in themes/ or PG.addThemes([…]).`);
    });
    els.name?.addEventListener('input', schedule);
    for (const b of els.modeBtns) {
      b.addEventListener('click', () => {
        state.mode = b.dataset.mode === 'dark' ? 'dark' : 'light';
        for (const x of els.modeBtns) x.classList.toggle('is-active', x === b);
        run();
      });
    }
    // AI tier — one box
    els.aiAsk?.addEventListener('click', () => ask());
    els.aiConnect?.addEventListener('click', connectModel);
    els.aiPrompt?.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        ask();
      }
    });
    // Mobile tabs (Design · Preview · Contrast) — toggle which pane shows.
    for (const t of els.tabs) {
      t.addEventListener('click', () => {
        root.dataset.tab = t.dataset.tab;
        for (const x of els.tabs) x.classList.toggle('is-active', x === t);
        if (t.dataset.tab === 'preview') run(); // re-fit after reveal
      });
    }
  }

  // ── Boot ────────────────────────────────────────────────────────────────
  buildFields();
  buildStarters();
  wireActions();
  renderLibrary();
  resumeAuthIfPending(); // also calls refreshAiStatus()

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
