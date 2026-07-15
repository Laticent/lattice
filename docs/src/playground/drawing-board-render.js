// The Drawing Board — live render controller (extracted from drawing-board.astro).
//
// This is the render loop + the Drawing-Board-specific extras that ride on the
// shared filmstrip controller (deck-preview.js, exposed on window as
// LatticeDeckPreview). It was previously an `is:inline` <script> in the page;
// it now lives here as an importable vanilla module so a render fix lands once,
// and the page carries only a thin module bootstrap that calls
// `createRenderController(data)`.
//
// WHAT THIS OWNS (all DB-specific — the shared HOW lives in deck-preview.js):
//   - the 220ms-debounced render loop, render signature, patch-vs-rewrite gate
//     (delegated to LatticeDeckPreview.renderDeck)
//   - the cursor↔slide SYNC bridge: the postMessage sender (postToFrame) + the
//     message listeners (db-slide-click / -scrolled / -frame-ready). The in-iframe
//     SYNC agent itself is injected by deck-preview.js (sync:true); this is the
//     parent side it talks to.
//   - the slide-start cache (computeSlideStarts / idxForLine) for cursor mapping
//   - library-theme resolution (LIB) + the deck `theme:` ⟷ picker ⟷ Deck-setup
//     drawer sync (deckTheme / syncThemeControls / applyTheme), the window.__dbChrome
//     bus, the panel resizers + mobile pane tabs.
//
// THEME FETCH: the raw "fetch <themeBase><name>.css once, cache the Promise" is
// the shared createThemeFetcher (theme-fetch.ts).
//
// LOAD ORDER: this controller is fully order-independent — it guards the engine
// + deck-preview globals with a polling retry, drives the editor/store/architect
// through window globals + custom events (db-editor-ready, db-deck-loaded, …),
// and the pre-paint palette/mode seed is a separate <head> is:inline script that
// this module never touches. So running it as a deferred module (after parse)
// preserves the prior is:inline behaviour; the React islands (client:idle) pull
// __dbChrome/__dbExport on mount AND subscribe to db-chrome-ready/db-export-ready,
// so either ordering is handled.

import { createThemeFetcher } from '../lib/theme-fetch.ts';
import { createChartInteract } from './chart-interact.js';
import { applyDebug } from './debug-overlay.js';
import { getDebugOverride } from './debug-prefs.js';
import { createPaneTabs, DB_PANE_KEY } from './drawing-board-pane.js';

export function createRenderController(data) {
	var THEME_BASE = data.themeBase;
	var RUNTIME_URL = data.runtimeUrl;
	// Resolve a deck's relative image refs (e.g. a gallery deck's
	// `![bg](image/sample-photo-wide.svg)`) against the staged samples/ base —
	// the same base the component studio uses. Absolute, since the engine's
	// WHATWG-URL resolver needs one. THEME_BASE ends in `themes/`.
	var SAMPLES_BASE = (() => {
		try { return new URL(String(THEME_BASE).replace(/themes\/$/, 'samples/'), location.href).href; }
		catch { return undefined; }
	})();
	var PREVIEW_FONT_CSS = data.previewFontCss || '';
	// The a11y texture <defs> are now injected by the shared renderDeck itself
	// (deck-preview.js owns A11Y_DEFS from the kernel) — no per-caller plumbing.
	// Shared raw theme fetch+cache (fetch <base><name>.css once).
	var themeFetcher = createThemeFetcher(THEME_BASE);
	// The deck's live slide box (px), resolved per render from the engine's
	// `@size` geometry (PG.render → { width, height }). Defaults to HD until
	// the first render; a `size:` edit refreshes it (and forces a full srcdoc
	// rewrite, since the box bakes into the frame — see render()).
	var curGeom = { w: 1280, h: 720 };
	// The token vocabulary is universal everywhere (the canonical flip is
	// complete — the engine + themes declare only the new role-based names), so
	// the deck always renders against the engine as shipped. The former
	// `tokens: current|universal` A/B and its client-side flip/namespace
	// machinery are retired now that there is a single vocabulary.
	var root = document.documentElement;
	var frame = document.getElementById('db-frame');
	// Live in-preview chart interaction: hover a pie slice in the editing preview
	// to reveal its authored detail, AS YOU EDIT — no entering Present + paging to
	// the slide. Parent-hosted (the iframe stays a paint surface); preview-only, so
	// the exported SVG/PDF is untouched. Re-bound on every srcdoc rewrite below.
	// Stage = the preview's panel body (position:relative; wraps the iframe), so the
	// parent overlay maps to the iframe's box and the popover stays within the preview.
	var previewStage = document.querySelector('#db-preview .db-panel-body');
	var chartInteract = (previewStage && frame)
		? createChartInteract({ stage: previewStage, getFrame: () => frame, hoverAny: true })
		: null;
	var statusEl = document.getElementById('db-status');
	var paletteSel = document.getElementById('palette');
	var modeBtn = document.getElementById('mode-toggle');

	// ── Slide <-> source mapping (Slice 2: cursor <-> slide sync) ─────────
	var slideStartsCache = [1]; // 1-based source line where each slide begins
	var activeIdx = 0;
	var totalSlides = 0;
	// Slides split on standalone `---` rules, skipping the front-matter block
	// and fenced code (where `---` is literal). Matches Marp's page-break
	// semantics closely enough for index<->line mapping.
	function computeSlideStarts(src) {
		var lines = src.split('\n');
		var starts = [1]; // slide 0 also covers any front matter
		var i = 0, n = lines.length;
		if (lines[0] !== undefined && lines[0].trim() === '---') {
			i = 1;
			while (i < n && lines[i].trim() !== '---') i++;
			i++; // step past the closing front-matter delimiter
		}
		var fence = false;
		for (; i < n; i++) {
			const ts = lines[i].trim();
			if (/^(```|~~~)/.test(ts)) { fence = !fence; continue; }
			if (!fence && /^---\s*$/.test(ts)) starts.push(i + 2);
		}
		return starts;
	}
	function recomputeStarts() { slideStartsCache = computeSlideStarts(getSource()); }
	function idxForLine(line) {
		var idx = 0;
		for (let k = 0; k < slideStartsCache.length; k++) {
			if (line >= slideStartsCache[k]) idx = k; else break;
		}
		return idx;
	}
	function postToFrame(msg) { if (frame.contentWindow) frame.contentWindow.postMessage(msg, '*'); }
	function setSlideStatus() {
		if (totalSlides <= 0) { setStatus('Ready.'); return; }
		statusEl.classList.remove('err');
		statusEl.textContent = 'Slide ' + Math.min(activeIdx + 1, totalSlides) + ' of ' + totalSlides;
	}

	// ── Source accessors (CodeMirror adapter, textarea fallback) ──────────
	function getSource() {
		if (window.__dbEditor) return window.__dbEditor.getValue();
		var ta = document.getElementById('db-editor-ta');
		return ta ? ta.value : '';
	}
	function setSource(text) {
		if (window.__dbEditor) { window.__dbEditor.setValue(text); return; }
		var ta = document.getElementById('db-editor-ta');
		if (ta) ta.value = text;
	}
	// Persistence is owned by the store module (IndexedDB, Slice 3): the
	// controller pushes edits to it via window.__dbStore.saveActive and
	// receives deck loads via the db-deck-loaded event below.

	if (paletteSel) paletteSel.value = root.getAttribute('data-palette');
	var engineReady = null; // the engine registration promise (registered once)

	function setStatus(msg, isErr) {
		statusEl.textContent = msg;
		statusEl.classList.toggle('err', !!isErr);
	}
	// Fetch a theme file by its base name (fetch + cache once via the shared
	// createThemeFetcher). One vocabulary now — the engine ships universal.
	function fetchTheme(name) {
		return themeFetcher.fetch(name);
	}
	function ensureThemes(palette, mode) {
		var PG = window.LatticePlayground;
		// Engine registered once (the `lattice` base CSS); each palette theme
		// @imports it.
		if (!engineReady) engineReady = fetchTheme('lattice').then((css) => { PG.addThemes([css]); });
		var jobs = [engineReady];
		// Library theme: one saved file (light-dark() pairs), already in memory.
		// Register after lattice (the CSS @imports it); no -dark variant.
		if (LIB[palette]) {
			return engineReady.then(() => { if (!PG.hasTheme(palette)) PG.addThemes([LIB[palette]]); });
		}
		// Register the palette + its transitive theme-name @import closure
		// (a11y-* → a11y-base → onyx → lattice) via the shared fetcher, so a
		// multi-level theme isn't left with a dead @import → stripped render.
		jobs.push(themeFetcher.ensure(palette, mode));
		return Promise.all(jobs);
	}


	// The slide preview is the shared filmstrip controller (deck-preview.js) —
	// ONE persistent iframe, patched per edit (only the changed <section>s)
	// behind a visibility gate, with content-visibility virtualizing off-screen
	// slides and a clamped height (no dead trailing scroll). The Drawing Board's
	// extras ride on opts: the cursor↔slide SYNC agent, the db-active outline,
	// the print page, the vendored @font-face CSS, and the library-theme forced
	// color-scheme. The cursor-sync MESSAGE LISTENERS (db-slide-scrolled /
	// -click / -frame-ready) and the postToFrame() sender stay in this
	// controller; the module only injects the in-iframe SYNC agent they talk to.
	// Exposed on window.LatticeDeckPreview by the bundled bridge module below;
	// render() guards on it the same way it guards on the engine.
	var previewState = { frameSig: '', lastSections: null };

	var timer = null;
	function scheduleRender() { clearTimeout(timer); timer = setTimeout(render, 220); }
	function render() {
		var PG = window.LatticePlayground;
		var DP = window.LatticeDeckPreview;
		if (!PG || !DP) { setStatus('Loading engine…'); return setTimeout(render, 60); }
		// The deck's `theme:` (mirrored onto data-palette by syncThemeControls) is
		// the only palette axis — an a11y theme is just a theme like any other.
		var palette = root.getAttribute('data-palette') || 'indaco';
		var mode = root.getAttribute('data-mode') === 'dark' ? 'dark' : 'light';
		setStatus('Rendering…');
		ensureThemes(palette, mode).then(() => {
			var theme = (mode === 'dark' && PG.hasTheme(palette + '-dark') ? palette + '-dark' : palette);
			try {
				// Component bridge: vendor referenced library components into the
				// source before render (the SAME embed the .md export uses, so live
				// === export). The referenced set is folded into sig so a
				// newly-referenced component triggers a full rebuild — its CSS lands
				// in out.css, which the section-only patch path doesn't refresh.
				const raw = getSource();
				const DBC = window.__dbComponents;
				const src = DBC ? DBC.embed(raw) : raw;
				const ckey = DBC ? DBC.key(raw) : '';
				const out = PG.render(src, theme, { baseUrl: SAMPLES_BASE });
				// The resolved `@size` box rides on the render; fold it into sig so a
				// `size:` edit (which changes the baked box) forces a full srcdoc
				// rewrite rather than a section-only patch with stale geometry.
				curGeom = { w: out.width || 1280, h: out.height || 720 };
				// Active-slide outline tint, read live so it tracks the palette/mode.
				const ACCENT = (getComputedStyle(root).getPropertyValue('--accent') || '').trim() || '#b0492e';
				const r = DP.renderDeck({
					frame: frame,
					html: out.html, css: out.css, mode: mode, geom: curGeom,
					sig: theme + '|' + mode + '|' + ckey + '|' + curGeom.w + 'x' + curGeom.h,
					state: previewState,
					runtimeUrl: RUNTIME_URL, padding: 22, gap: 22,
					fontCss: PREVIEW_FONT_CSS,
					// (a11y texture <defs> are injected by renderDeck itself now.)
					// Single-file library themes resolve light/dark via light-dark();
					// force the canvas scheme so dark renders dark (built-in paired
					// -dark themes don't need it).
					colorScheme: LIB[palette] ? mode : null,
					contentVisibility: true, cursor: true, activeOutline: ACCENT,
					printRules: true, sync: true,
				});
				previewState = r.state;
				totalSlides = r.count;
				// Debug overlay: follow the deck's `debug:` (the shared session override
				// can force it). Re-applies here for the section-PATCH path (live doc); a
				// full srcdoc rewrite re-applies on `db-frame-ready` below.
				applyDebug(frame, { force: getDebugOverride() });
				recomputeStarts();
				setSlideStatus();
			} catch (e) {
				setStatus(String(e.message || e), true);
			}
		}).catch((e) => { setStatus(String(e.message || e), true); });
	}

	// Export render: hand the export its OWN engine result so it can rasterize a
	// dedicated, fully-laid-out capture host instead of the on-screen preview iframe
	// (which virtualizes + visibility-gates slides and is display:none in the phone
	// Edit tab — sources of blank / collapsed exports). Mirrors render()'s engine
	// path (component bridge + theme resolution) but RETURNS the result instead of
	// painting the preview. Consumed by drawing-board-export.js via createCaptureFrame.
	window.__dbExportRender = function exportRender() {
		var PG = window.LatticePlayground;
		if (!PG) return Promise.reject(new Error('engine not ready — try again in a moment'));
		var palette = root.getAttribute('data-palette') || 'indaco';
		var mode = root.getAttribute('data-mode') === 'dark' ? 'dark' : 'light';
		return ensureThemes(palette, mode).then(() => {
			var theme = (mode === 'dark' && PG.hasTheme(palette + '-dark') ? palette + '-dark' : palette);
			var raw = getSource();
			var DBC = window.__dbComponents;
			var src = DBC ? DBC.embed(raw) : raw;
			var out = PG.render(src, theme, { baseUrl: SAMPLES_BASE });
			return {
				html: out.html, css: out.css, mode: mode,
				geom: { w: out.width || 1280, h: out.height || 720 },
				runtimeUrl: RUNTIME_URL, fontCss: PREVIEW_FONT_CSS,
			};
		});
	};

	function onEdit() {
		recomputeStarts();
		syncThemeControls(); // a valid `theme:` edit drives the picker + page chrome
		scheduleRender();
		if (window.__dbStore) window.__dbStore.saveActive(getSource());
		if (window.__dbArchitect) window.__dbArchitect.update(getSource());
		if (window.__dbConfig) window.__dbConfig.syncTrigger(); // light the chip when front matter is present
	}
	// The store loads a deck (switch / restore / initial) -> swap the editor
	// source and re-render. setSource fires onChange, but the store guards its
	// own autosave during a load, so this doesn't echo back.
	var paneBooted = false; // the FIRST deck load is the initial (re)load, not a user switch
	window.addEventListener('db-deck-loaded', (e) => {
		var src = e.detail?.source;
		if (src == null) return;
		setSource(src);
		recomputeStarts();
		previewState.frameSig = ''; // a new deck → fresh srcdoc (resets runtime/Mermaid state)
		syncThemeControls(); // adopt the loaded deck's theme before rendering it
		render();
		if (window.__dbArchitect) window.__dbArchitect.update(src);
		if (window.__dbConfig) window.__dbConfig.syncTrigger(); // refresh the config cue for the loaded deck
		// A user-initiated switch (rail pick / restore) lands you in the editor
		// on narrow layouts. The INITIAL load after a (re)load does NOT — it
		// restores your last pane (see below), so a refresh or an iOS tab discard
		// during a long model download doesn't dump you into Edit. An onboarding
		// start stays on the Architect (its `say` sets the pane).
		if (paneBooted && !window.__dbOnboardingStart && window.matchMedia('(max-width: 1024px)').matches) setPane('editor');
		paneBooted = true;
	});
	// Cursor moved in the editor -> if it crossed into a different slide,
	// scroll the filmstrip to it (smooth). Same-slide moves don't scroll, so
	// typing within a slide stays put.
	function onCursorMove(line) {
		var idx = idxForLine(line);
		if (idx === activeIdx) return;
		activeIdx = idx;
		setSlideStatus();
		postToFrame({ type: 'db-scroll-to', idx: idx, smooth: true });
	}
	// Messages from the in-iframe sync agent: a slide click -> move the
	// cursor to that slide's first line; frame-ready -> restore the preview to
	// the active slide after a re-render (so editing slide 7 doesn't snap to
	// the top on every keystroke).
	window.addEventListener('message', (e) => {
		var d = e.data || {};
		if (d.type === 'db-slide-click') {
			const i = d.idx | 0;
			activeIdx = i;
			setSlideStatus();
			if (window.__dbEditor && slideStartsCache[i] != null) window.__dbEditor.goToLine(slideStartsCache[i]);
			postToFrame({ type: 'db-set-active', idx: i });
		} else if (d.type === 'db-slide-scrolled') {
			// Pure scroll in the filmstrip — track the centred slide in the
			// status (and keep activeIdx so a re-render restores here), but
			// don't move the editor cursor; scrolling to read isn't editing.
			const j = d.idx | 0;
			if (j === activeIdx) return;
			activeIdx = j;
			setSlideStatus();
		} else if (d.type === 'db-frame-ready') {
			postToFrame({ type: 'db-scroll-to', idx: activeIdx, smooth: false });
			// A srcdoc rewrite replaced the iframe document — re-bind the hover layer
			// to the new doc (its old listeners + section refs died with the old one).
			if (chartInteract) chartInteract.rebind();
			applyDebug(frame, { force: getDebugOverride() });
		}
	});
	function wireEditor() {
		if (!window.__dbEditor) return;
		window.__dbEditor.onChange(onEdit);
		window.__dbEditor.onCursor(onCursorMove);
		recomputeStarts();
		syncThemeControls(); // adopt the initial deck's declared theme on first wire
		render();
		if (window.__dbArchitect) window.__dbArchitect.update(getSource());
	}
	if (window.__dbEditor) wireEditor();
	else window.addEventListener('db-editor-ready', wireEditor);
	var taEl = document.getElementById('db-editor-ta');
	if (taEl) taEl.addEventListener('input', onEdit);

	// ── Theme sync (deck `theme:` ⟷ palette picker ⟷ Deck setup drawer) ───
	// The deck's `theme:` front matter is the single source of truth; the
	// top-bar picker and the drawer's theme select are synced views of it, and
	// the value is written EXPLICITLY into the deck (transparent + portable),
	// not forced on at render time the way the old picker did. Only a
	// registered palette propagates — a typo or unknown theme is left in the
	// source but never applied, so the deck can't render unstyled.
	var PALETTES = (data.palettes || []).slice();
	// Workbench library themes (export bridge): name -> saved CSS. Merged into
	// the PALETTES vocabulary + the picker so a saved theme is selectable, and
	// registered with the engine on demand (ensureThemes). Loaded async from
	// IndexedDB by the loader module above; refreshed on its event. See
	// engineering/decisions/2026-06-11-workbench-export-bridge.md.
	var LIB = {};
	function refreshLibraryThemes() {
		var themes = window.__dbLibraryThemes || [];
		for (let i = 0; i < themes.length; i++) {
			const t = themes[i];
			if (!t?.name || !t.css) continue;
			const fresh = !LIB[t.name];
			LIB[t.name] = t.css;
			if (PALETTES.indexOf(t.name) === -1) PALETTES.push(t.name);
			if (fresh && paletteSel && !paletteSel.querySelector('option[value="' + t.name + '"]')) {
				const opt = document.createElement('option');
				opt.value = t.name;
				opt.textContent = (t.label || t.name) + ' (saved)';
				paletteSel.appendChild(opt);
			}
		}
		// A deck whose `theme:` names a now-known library theme can finally apply.
		if (syncThemeControls()) render();
		if (paletteSel) paletteSel.value = root.getAttribute('data-palette');
		if (window.__dbChrome) emitChromeSync(); // new saved themes → topbar select
	}
	window.addEventListener('db-library-themes', refreshLibraryThemes);
	if (window.__dbLibraryThemes) refreshLibraryThemes();
	function deckTheme() {
		var fm = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---/.exec(getSource());
		if (!fm) return null;
		var m = /^[ \t]*theme:[ \t]*(.+?)[ \t]*$/im.exec(fm[1]);
		if (!m) return null;
		var name = m[1].replace(/^["']|["']$/g, '').trim();
		return PALETTES.indexOf(name) !== -1 ? name : null; // null = absent OR invalid → don't propagate
	}
	// Pull the picker + page chrome into line with the deck's declared theme
	// (read-only — never writes the source). Persists the valid palette as the
	// default for new decks. Returns true when the palette actually changed.
	function syncThemeControls() {
		var t = deckTheme();
		if (!t) return false; // no/invalid theme → leave the chrome on its current palette
		var changed = root.getAttribute('data-palette') !== t;
		if (changed) root.setAttribute('data-palette', t);
		if (paletteSel && paletteSel.value !== t) paletteSel.value = t;
		try { localStorage.setItem('lattice-docs-palette', t); } catch (_e) {}
		if (changed && window.__dbChrome) emitChromeSync(); // reflect onto the React topbar
		return changed;
	}
	// Write a (valid) theme into the deck source — the single mutation point the
	// picker and the drawer share. setSource fires onEdit → syncThemeControls +
	// render, so the chrome and preview follow from the one source edit.
	function applyTheme(name) {
		if (PALETTES.indexOf(name) === -1) return; // guard: never propagate a nonexistent theme
		try { localStorage.setItem('lattice-docs-palette', name); } catch (_e) {}
		if (window.__dbConfig?.writeFrontMatter && window.__dbEditor) {
			setSource(window.__dbConfig.writeFrontMatter(getSource(), 'theme', name));
		} else {
			root.setAttribute('data-palette', name); // editor/config not mounted yet → live-only fallback
			render();
		}
	}

	// ── Palette / mode ────────────────────────────────────────────────────
	// The legacy native controls (#palette, #mode-toggle) are gone — the shared
	// React PaletteControls island owns them now (the same global theme dropdown
	// every surface mounts). It drives this controller through window.__dbChrome
	// (below), preserving the exact deck-theme-writing semantics on this route: a
	// palette pick WRITES the deck's `theme:`
	// front matter (applyTheme → writeFrontMatter), and the chrome mirrors
	// the deck's theme back onto data-palette (syncThemeControls). The
	// guarded references keep this working even before the island hydrates.
	if (paletteSel) paletteSel.addEventListener('change', () => { applyTheme(paletteSel.value); });
	function toggleMode() {
		var next = root.getAttribute('data-mode') === 'dark' ? 'light' : 'dark';
		root.setAttribute('data-mode', next);
		try { localStorage.setItem('lattice-docs-mode', next); } catch (_e) {}
		render();
		return next;
	}
	if (modeBtn) modeBtn.addEventListener('click', toggleMode);
	// The chrome bus the React topbar island drives. Mirrors the deck-theme
	// authoring semantics 1:1 — applyTheme writes the deck's front matter,
	// syncThemeControls (run on every edit/load) reflects the deck's theme
	// back to the island via the db-chrome-sync event it listens for.
	function emitChromeSync() {
		try {
			window.dispatchEvent(new CustomEvent('db-chrome-sync', { detail: {
				palette: root.getAttribute('data-palette') || 'indaco',
				mode: root.getAttribute('data-mode') === 'dark' ? 'dark' : 'light',
				palettes: PALETTES.slice(),
			} }));
		} catch (_e) {}
	}
	window.__dbChrome = {
		getPalette: () => root.getAttribute('data-palette') || 'indaco',
		getMode: () => root.getAttribute('data-mode') === 'dark' ? 'dark' : 'light',
		getPalettes: () => PALETTES.slice(),
		applyTheme: applyTheme,
		toggleMode: toggleMode,
	};
	window.dispatchEvent(new Event('db-chrome-ready'));
	window.addEventListener('pageshow', () => {
		try {
			const p = localStorage.getItem('lattice-docs-palette');
			const m = localStorage.getItem('lattice-docs-mode');
			let changed = false;
			if (p && p !== root.getAttribute('data-palette')) { root.setAttribute('data-palette', p); changed = true; }
			if ((m === 'light' || m === 'dark') && m !== root.getAttribute('data-mode')) { root.setAttribute('data-mode', m); changed = true; }
			if (syncThemeControls()) changed = true; // the deck's own theme wins over the stored palette
			if (paletteSel) paletteSel.value = root.getAttribute('data-palette');
			if (changed) { render(); if (window.__dbChrome) emitChromeSync(); }
		} catch (_e) {}
	});

	// ── Resizers: drag to set the Architect + preview column widths ───────
	var workspace = document.getElementById('db-workspace');
	function loadWidth(key, prop) {
		try { const v = localStorage.getItem(key); if (v) workspace.style.setProperty(prop, v + 'px'); } catch (_e) {}
	}
	loadWidth('lattice-db-arch', '--db-arch');
	loadWidth('lattice-db-preview', '--db-preview');
	function makeResizer(el, target) {
		var prop = target === 'arch' ? '--db-arch' : '--db-preview';
		var key = target === 'arch' ? 'lattice-db-arch' : 'lattice-db-preview';
		el.addEventListener('pointerdown', (e) => {
			e.preventDefault();
			el.setPointerCapture(e.pointerId);
			el.setAttribute('data-dragging', 'true');
			var startX = e.clientX;
			var box = workspace.getBoundingClientRect();
			var startW = target === 'arch'
				? document.getElementById('db-architect').getBoundingClientRect().width
				: document.getElementById('db-preview').getBoundingClientRect().width;
			function move(ev) {
				// arch grows when dragging right; preview grows when dragging left.
				var dx = ev.clientX - startX;
				var w = target === 'arch' ? startW + dx : startW - dx;
				w = Math.max(240, Math.min(box.width - 420, w));
				workspace.style.setProperty(prop, w + 'px');
			}
			function up(_ev) {
				el.releasePointerCapture(e.pointerId);
				el.removeAttribute('data-dragging');
				document.removeEventListener('pointermove', move);
				document.removeEventListener('pointerup', up);
				try { localStorage.setItem(key, String(Math.round(parseFloat(getComputedStyle(workspace).getPropertyValue(prop)) || 0))); } catch (_x) {}
			}
			document.addEventListener('pointermove', move);
			document.addEventListener('pointerup', up);
		});
	}
	makeResizer(document.getElementById('db-resize-left'), 'arch');
	makeResizer(document.getElementById('db-resize-right'), 'preview');

	// ── Mobile pane tabs ──────────────────────────────────────────────────
	// The pane state machine is the shared createPaneTabs (drawing-board-pane.js)
	// — one tested source of truth so body[data-pane], the tab aria-selected
	// flags, the persisted pane, and the preview render can't drift apart (the
	// same divergence class the Playground's pane-sync fix closed). It wires the
	// tab clicks and hands back the single setPane the rest of this controller and
	// the onboarding use.
	var setPane = createPaneTabs({ tabs: document.querySelectorAll('.db-mobile-tab'), render }).setPane;
	// Let the onboarding (a separate module script) drive the pane on a deck start.
	window.__dbSetPane = setPane;
	// Restore the last pane on (re)load so a refresh — or an iOS tab discard
	// during a long model download — returns you where you were, not to Edit.
	if (window.matchMedia('(max-width: 1024px)').matches) {
		try { const savedPane = localStorage.getItem(DB_PANE_KEY); if (savedPane) setPane(savedPane); } catch (_e) {}
	}

	render();
}
