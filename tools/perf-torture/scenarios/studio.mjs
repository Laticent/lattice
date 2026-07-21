// Scenario: the Lattice docs site (Studio · landing · Playground) — the first consumer of the
// reusable perf-torture engine (tools/perf-torture/engine.mjs). A scenario is pure app-knowledge:
// WHERE to drive (surfaces), WHAT a "user does X once" is (cycles), WHICH app-specific counters to
// observe (probes), and WHAT a leaked object looks like (retainerTarget). The engine owns the
// measurement discipline (CDP instrument, idle-calibrated Sen/Mann-Kendall verdict, retainer-path
// walk, and the OBSERVER-POLLUTION-safe driving helpers imported below — dispose every handle).
//
// Born from engineering/decisions/2026-07-20-studio-degradation-audit.md +
// 2026-07-20-studio-audit-instrument-fix.md (why the anti-pollution helpers matter).

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clickIn, clickNth, clickSel, countSel, exists, settle, wait } from '../engine.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
// The docs production build the harness serves (needs `cd docs && npm run build` first).
const DIST = join(HERE, '..', '..', '..', 'docs', 'dist');

// App-specific DOM helper (generic ones live in the engine).
const railCount = (page) => page.evaluate(() => document.querySelectorAll('nav[aria-label="Slide navigator"] > button').length);

// ── cycle bodies (real UI; each asserts its action or throws so a no-op can't read as clean) ──
async function COMPOSE(page) {
	await clickSel(page, 'button[aria-label="Compose — rich editor"]');
	await settle(page, '.ProseMirror', 6000); // dispose: an undisposed waitForSelector here pinned each cycle's editor (the fabricated compose leak)
	await page.evaluate(() => document.querySelector('.ProseMirror p, .ProseMirror h1, .ProseMirror')?.focus());
	await page.keyboard.type('x'); await wait(page, 200); await page.keyboard.press('Backspace'); await wait(page, 150);
	await clickSel(page, 'button[aria-label="Markdown source"]');
	await settle(page, '.cm-content', 5000); await wait(page, 250);
}
async function SLIDENAV(page) {
	const n = await railCount(page); if (n < 2) throw new Error('slidenav: <2 slides');
	for (const idx of [1, Math.min(2, n - 1), 0]) { await page.evaluate((i) => document.querySelectorAll('nav[aria-label="Slide navigator"] > button')[i]?.click(), idx); await wait(page, 220); }
}
async function INSERT(page) {
	// Exercise the add-slide gallery (SlidePicker) OPEN → render its live thumbnail iframes → CLOSE.
	// Deterministic; mutates no deck. Asserts the dialog actually closed (else stacked dialogs read
	// as an after-close leak — a harness artifact, not the app).
	const before = await railCount(page);
	await clickSel(page, 'button[aria-label="Add slide"]');
	await settle(page, 'button[aria-label^="Insert Blank"]', 5000); // dispose: the gallery's Insert buttons unmount on close
	await wait(page, 800); // let the gallery's thumbnail iframes render
	await page.keyboard.press('Escape'); await wait(page, 500);
	if (await exists(page, 'button[aria-label^="Insert Blank"]')) {
		await page.keyboard.press('Escape'); await wait(page, 300);
		await page.evaluate(() => document.querySelector('[role="dialog"] [aria-label="Close"], [role="dialog"] button')?.click()).catch(() => {});
		await wait(page, 300);
		if (await exists(page, 'button[aria-label^="Insert Blank"]')) throw new Error('insert-gallery: dialog did NOT close (would stack — measurement invalid)');
	}
	if (await railCount(page) !== before) throw new Error('insert-gallery: deck changed unexpectedly');
}
// Ensure a settings panel is OPEN (its toggle-button would CLOSE an already-open panel, so only
// click-to-open when the target switch is absent), select the tab, then flip the switch on+off.
async function ensureAndToggle(page, openSels, tabText, switchSel) {
	const clickTabByText = (t) => page.evaluate((txt) => { for (const b of document.querySelectorAll('[role="tab"]')) if (b.textContent.trim() === txt) { b.click(); return true; } return false; }, t);
	for (let attempt = 0; attempt < 3; attempt++) {
		if (await exists(page, switchSel)) break;
		for (const s of openSels) { if (await clickIn(page, s)) break; }
		await wait(page, 350);
		if (tabText) await clickTabByText(tabText).catch(() => {});
		await wait(page, 250);
	}
	await settle(page, switchSel, 4000);
	await clickIn(page, switchSel); await wait(page, 300); await clickIn(page, switchSel); await wait(page, 300);
}
// Target the CHROME tab's "Hide section rail" switch: it is UNCONDITIONAL for any editable slide,
// unlike the Look tab's "Compact spacing" (gated by `accepts('compact')`, absent on most slide classes →
// the old selector timed out whenever the active slide didn't accept it). 2026-07-21 scenario-drift fix.
async function SLIDESETTINGS(page) { await ensureAndToggle(page, ['button[aria-label="Slide settings"]'], 'Chrome', 'button[role="switch"][aria-label="Hide section rail"]'); }
async function DECKSETTINGS(page) { await ensureAndToggle(page, ['button[aria-label="Deck scope"]', 'button[aria-label="Settings"]'], 'Marks', 'button[role="switch"][aria-label="Page numbers"]'); }
async function DECKSWITCH(page) {
	if (!(await exists(page, 'button[data-demo="deck-switcher"]'))) { console.error('    deckswitch: switcher not present in this regime — SKIPPED (no signal)'); await wait(page, 200); return; }
	await clickIn(page, 'button[data-demo="deck-switcher"]'); await wait(page, 350);
	const nItems = await countSel(page, '[role="menuitem"]');
	if (nItems >= 2) { await clickNth(page, '[role="menuitem"]', 1); await wait(page, 500); }
	else { await page.keyboard.press('Escape'); await wait(page, 200); }
}
async function READALOUD(page) {
	const dlg = '[role="dialog"][aria-label="Present"]';
	await clickSel(page, `${dlg} button[aria-label="Play the presentation"]`, 4000);
	await wait(page, 1600); // let the reader transport + caption crawl run
	await page.click(`${dlg} button[aria-label="Pause"]`).catch(() => {});
	await wait(page, 200);
	await page.keyboard.press('ArrowRight'); await wait(page, 300); // next slide
}
async function LANDING_CYCLE(page) {
	// flip the hero Preview/Source tab (remounts the hero iframe — the leak lever) + flip palette
	// (MutationObserver on <html> re-renders ALL landing islands at once).
	await page.evaluate(() => { for (const t of document.querySelectorAll('[aria-label="Hero view"] [role="tab"]')) if (/source/i.test(t.textContent)) { t.click(); break; } }); await wait(page, 400);
	await page.evaluate(() => { for (const t of document.querySelectorAll('[aria-label="Hero view"] [role="tab"]')) if (/preview/i.test(t.textContent)) { t.click(); break; } }); await wait(page, 400);
	await page.evaluate(() => { const r = document.documentElement; r.setAttribute('data-palette', r.getAttribute('data-palette') === 'cuoio' ? 'indaco' : 'cuoio'); }); await wait(page, 500);
}
async function PG_SLIDE(page) {
	for (const idx of [2, 4, 0]) { await page.evaluate((i) => document.querySelector('#preview')?.contentWindow?.postMessage({ type: 'db-scroll-to', idx: i, smooth: false }, '*'), idx); await wait(page, 300); }
}
async function PG_VARIANT(page) {
	// swap the component via the ComponentPicker → full srcdoc rewrite (the heavy re-render torture)
	await clickSel(page, '#pg-template-trigger', 4000); await wait(page, 400);
	const nOpts = await countSel(page, '[role="option"]');
	if (!nOpts) { await page.keyboard.press('Escape'); throw new Error('pgvariant: no component options'); }
	await clickNth(page, '[role="option"]', Math.floor(nOpts / 3));
	await page.waitForFunction(() => /Rendered\s+\d+\s+slide/.test(document.querySelector('[role="status"].pg-status')?.textContent || ''), { timeout: 8000 }).catch(() => {});
	await wait(page, 400);
}
async function PG_SCROLL(page) {
	await page.evaluate(() => { document.querySelector('#editor-host .cm-scroller')?.scrollBy(0, 300); document.querySelector('#preview')?.contentWindow?.scrollBy?.(0, 300); }); await wait(page, 250);
	await page.evaluate(() => { document.querySelector('#editor-host .cm-scroller')?.scrollTo(0, 0); document.querySelector('#preview')?.contentWindow?.scrollTo?.(0, 0); }); await wait(page, 250);
}

const CYCLES = {
	// ── controls (MUST stay flat — they calibrate the noise floor) ──
	async idle(page) { await wait(page, 900); }, // do nothing but let the same time pass
	async typing(page) { await page.evaluate(() => document.querySelector('.cm-content')?.focus()); for (let i = 0; i < 20; i++) await page.keyboard.type('x'); await wait(page, 500); for (let i = 0; i < 20; i++) await page.keyboard.press('Backspace'); await wait(page, 500); },
	// ── studio surface ──
	async present(page) { if (await clickIn(page, '[aria-label="Present"]')) { await wait(page, 500); await page.keyboard.press('ArrowRight').catch(() => {}); await wait(page, 200); await page.keyboard.press('Escape'); await wait(page, 400); } },
	async overview(page) { if (await clickIn(page, '[aria-label="Present"]')) { await wait(page, 500); await page.keyboard.press('g').catch(() => {}); await wait(page, 900); await page.keyboard.press('Escape'); await wait(page, 300); await page.keyboard.press('Escape'); await wait(page, 400); } },
	async palette(page) { await page.evaluate(() => { const r = document.documentElement; r.setAttribute('data-mode', r.getAttribute('data-mode') === 'dark' ? 'light' : 'dark'); }); await wait(page, 500); await clickIn(page, '[data-demo="mode"]'); await wait(page, 400); },
	async fullwrite(page) { await page.evaluate(() => { const r = document.documentElement; r.setAttribute('data-mode', r.getAttribute('data-mode') === 'dark' ? 'light' : 'dark'); }); await wait(page, 350); await clickIn(page, '[data-demo="mode"]'); await wait(page, 350); },
	async compose(page) { await COMPOSE(page); },
	async slidenav(page) { await SLIDENAV(page); },
	async insert(page) { await INSERT(page); },
	async slidesettings(page) { await SLIDESETTINGS(page); },
	async decksettings(page) { await DECKSETTINGS(page); },
	async deckswitch2(page) { await DECKSWITCH(page); },
	async readaloud(page) { await READALOUD(page); },
	async mixed(page) { await CYCLES.typing(page); await CYCLES.present(page); await CYCLES.palette(page); },
	// ── landing surface ──
	async landing(page) { await LANDING_CYCLE(page); },
	// ── playground surface ──
	async pgslide(page) { await PG_SLIDE(page); },
	async pgvariant(page) { await PG_VARIANT(page); },
	async pgscroll(page) { await PG_SCROLL(page); },
};

// Optional ONE-TIME setup per cycle, run after navigation, before the K-loop.
// HARD RULE #24: the TTS key is read from a NEUTRAL operator env var (never the server key name) —
// the "drive the Playground on the user's own key" pattern the gate explicitly allows.
const PREP = {
	async readaloud(page, opts) {
		const key = process.env.TORTURE_TTS_KEY;
		if (opts.tts && key) { await page.evaluate((k) => { try { localStorage.setItem('lattice-db-or-key', k); } catch {} }, key); console.error('    readaloud: VOICED (operator key via TORTURE_TTS_KEY — spends budget)'); }
		else console.error('    readaloud: captions-only (muted; no synth, no spend)');
		await clickSel(page, 'button[aria-label="Present"]'); await wait(page, 900);
		if (opts.tts && key) { await page.click('button[aria-label^="Voice off"]').catch(() => {}); await wait(page, 300); }
	},
	async landing(page) {
		for (let y = 0; y < 8; y++) { await page.evaluate(() => window.scrollBy(0, 700)); await wait(page, 350); }
		await wait(page, 2600); // one RestyleShowcase cycle
		await page.evaluate(() => window.scrollTo(0, 0)); await wait(page, 400);
	},
};

/** @type {import('../engine.mjs').Scenario} */
export default {
	name: 'studio',
	distDir: DIST,
	// idle first (the CONTROL); the rest in a stable order.
	defaultCycles: ['idle', 'typing', 'present', 'overview', 'palette', 'fullwrite', 'compose', 'slidenav', 'insert', 'slidesettings', 'decksettings', 'deckswitch2', 'readaloud', 'landing', 'pgslide', 'pgvariant', 'pgscroll', 'mixed'],
	surfaces: {
		studio: {
			// NB: drive the PRODUCTION surface `/studio`, NOT `/studio?perf` (2026-07-21-studio-compose-
			// listener-leak-is-a-perf-overlay-artifact.md, #32). `?perf` mounts PerfOverlay, which dynamically
			// imports `web-vitals`; web-vitals arms a `visibilitychange` listener on `document` per metric
			// report (INP re-arms on every interaction) and never unsubscribes — so under `?perf` the
			// `listeners` metric carried ~1 phantom add PER INTERACTING CYCLE that no real user hits, which is
			// exactly what fooled #1139 into "confirming" a compose leak. The torture engine reads all metrics
			// over CDP, never through the overlay, so `?perf` bought nothing but contamination. The overlay is
			// gated on the `lattice-perf-overlay` pref (default off), so a bare `/studio` never loads
			// web-vitals. Selector determinism comes from the BUILD-posture `setup` below, not from `?perf`.
			// Confirm the honest surface with: `npm run torture -- --scenario studio --cycle idle,compose --listeners`.
			url: '/studio', ready: '.cm-content', settle: 1500,
			// dial to the BUILD posture so the full UI (activity bar, op rail, both editor toggles)
			// is present + selectors deterministic; every studio cycle shares this → matched floors.
			setup: async (page) => { await page.click('button[aria-label="Build — every panel"]').catch(() => {}); await wait(page, 700); },
		},
		landing: { url: '/', ready: '[role="tablist"][aria-label="Hero view"]', settle: 2000 },
		playground: { url: '/playground', ready: '#editor-host .cm-editor', settle: 2000 },
	},
	cycleSurface: { landing: 'landing', pgslide: 'playground', pgvariant: 'playground', pgscroll: 'playground' },
	cycles: CYCLES,
	prep: PREP,
	// App-specific observables layered onto the engine's universal metrics. Each returns a number;
	// the engine trends them alongside heap/nodes/listeners and rates them against `probeFloors`.
	probes: (page) => page.evaluate(() => {
		const q = (s) => { try { return document.querySelectorAll(s).length; } catch { return -1; } };
		let themeCount = -1;
		try { const PG = window.LatticePlayground || window.PG; if (PG?.themes) themeCount = (PG.themes.size ?? PG.themes.length ?? Object.keys(PG.themes).length); } catch {}
		return { liveIframes: q('iframe.live'), cmEditors: q('.cm-editor'), themeCount };
	}),
	// Absolute per-cycle noise floors for the UNIVERSAL heap/DOM metrics, calibrated to the docs site
	// (a heavy app: CodeMirror + srcdoc iframes + ~560KB theme strings) from its idle control. Owned
	// here rather than inherited from the engine's built-in defaults, so a lighter app writing its own
	// scenario is forced to set its own (or gets warned) instead of silently reusing Studio's.
	universalFloors: { retainedHeap: 40000, peakHeap: 60000, heapTotal: 60000, nodes: 0.4, listeners: 0.4, documents: 0.1, frames: 0.1 },
	probeFloors: { liveIframes: 0.1, cmEditors: 0.1, themeCount: 0.4 },
	// What a leaked object looks like for the `--retainers` walk: the big (~560KB) retained theme-CSS
	// / engine-scaffold strings. (Detached-realm targeting via `--realm` is generic, in the engine.)
	retainerTarget: (name, self) => self >= 200000 && /lattice\.min\.css|lattice-engine scaffold|<div class="lattice">/.test(name),
};
