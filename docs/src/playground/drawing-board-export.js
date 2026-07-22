// The Drawing Board — export (Phase 1, Slice 4 + the Phase-1-fixes rasterizer).
//
// Fidelity, honestly (the proposal's §6):
//   - Markdown : perfect — it is the source.
//   - PDF      : one-click image PDF — each rendered slide rasterized to a 2x PNG
//                and placed one-per-page via jsPDF. No print dialog. Trade-off:
//                text is an image, not selectable/searchable. For vector +
//                selectable text use "Print" (the browser's own PDF engine).
//   - PPTX     : image-slides — the same 2x PNGs, full-bleed via PptxGenJS.
//   - Print    : the browser print path — true vector, selectable, but a dialog.
//
// Rasterization uses html-to-image (toPng): it clones the slide, inlines the
// computed styles AND embeds the web fonts, then renders to a 2x canvas. The
// fonts are NOT left to html-to-image's own collection (it chased the engine
// CSS's cross-origin Google-Fonts @import and lost a lazy-load race — off-screen
// slides rasterized before their faces finished loading, so e.g. a `finish:
// sketch` deck's Shantell body font dropped to a system fallback). Instead we
// pass a precomputed `fontEmbedCSS` of vendored, data-URI'd faces (font-embed.js)
// to every call, so each clone is self-contained and every font embeds.
//
// IMPORTANT: do NOT pass a `backgroundColor` — a forced white overrides the
// solid dark canvas of the title/closing/divider slides
// (section.title { background: var(--surface-inverse) }), turning them white. Each slide
// paints its own background, so we let it. (Gradient-backed dark slides happened
// to survive the white because a background-image paints over background-color;
// solid-colour ones did not — hence title/closing went white on Cuoio.)
//
// jspdf / pptxgenjs / html-to-image are lazy-imported (own chunks).

import { themeImportNames } from '../lib/theme-fetch.ts';
import { notesCore } from './authoring-core.generated.js';
import { buildSrcdoc, handoutRegions, nUpCells } from './deck-preview.js';
import { embedComponentsInMarkdown } from './layout-core.generated.js';
import { addPageStickyNotes } from './pdf-sticky-notes.js';

function safeName(name) {
	return (name || 'deck').trim().replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'deck';
}

// ── Provenance metadata ───────────────────────────────────────────────────────
// Historical: this used to distinguish marp-core vs. lattice-engine exports,
// back when the Drawing Board offered a marp-core comparison mode (retired in
// P4 — `meta.engine`/`window.LatticePlayground.engine` is never set to
// anything but 'lattice' today, so `engineLabel`'s 'marp-core' branch is dead).
// Stamping each export with which engine + build produced it is still the only
// way to tie a PDF back to a specific markdown after the fact. FNV-1a over the
// deck source gives a short, dependency-free provenance hash for that.
function shortHash(str) {
	let h = 0x811c9dc5;
	for (let i = 0; i < str.length; i++) {
		h ^= str.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return (h >>> 0).toString(16).padStart(8, '0');
}

function engineLabel(engine) {
	return engine === 'lattice' ? 'lattice-engine' : 'marp-core';
}

// Derive the human-readable summary + machine-parseable keyword string the
// exporters write into standard PDF/PPTX document properties. (jsPDF exposes no
// public custom-/Info-key API, so the structured fields ride in `keywords`,
// which every viewer surfaces under Document Properties.)
function provenance(meta, slides) {
	const m = meta || {};
	const eng = engineLabel(m.engine);
	const ver = m.version ? `Lattice ${m.version}` : 'Lattice';
	const build = m.build ? ` (build ${m.build})` : '';
	const theme = m.palette ? `${m.palette}/${m.mode || 'light'}` : '';
	const src = m.source ? shortHash(m.source) : '';
	const summary =
		`Rendered by ${eng} · ${ver}${build}` +
		(theme ? ` · theme ${theme}` : '') +
		(slides ? ` · ${slides} slide${slides === 1 ? '' : 's'}` : '');
	const keywords = [
		`engine=${eng}`,
		m.version && `lattice=${m.version}`,
		m.build && `build=${m.build}`,
		m.palette && `theme=${m.palette}`,
		m.mode && `mode=${m.mode}`,
		slides && `slides=${slides}`,
		src && `src=${src}`,
	]
		.filter(Boolean)
		.join('; ');
	return { eng, summary, keywords };
}

function download(blob, filename) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Markdown ────────────────────────────────────────────────────────────────
// Self-contained embed for a Workbench *library* theme (export bridge — see
// engineering/decisions/2026-06-11-workbench-export-bridge.md). A library theme
// isn't a registered theme, so a bare `theme:<name>` directive
// renders palette-less for a CLI consumer. We keep the directive (a Drawing Board
// re-import resolves the theme by name) AND inline the saved CSS — which already
// carries `@import 'lattice';` — as a Marp global <style> right after the front
// matter, so a lattice-configured marp-cli run styles correctly off the block
// even when the directive name is unknown to it. Pure + DOM-free → unit-tested.
// `theme` is { name, css } for a library theme, or null/undefined for a built-in
// (whose `theme:` resolves from themeSet — nothing to embed).
export function embedThemeInMarkdown(source, theme) {
	const src = String(source || '');
	if (!theme?.css) return src;
	const block =
		'<style>\n' +
		'/* Lattice Workbench — embedded theme "' +
		String(theme.name || 'theme') +
		'" (self-contained: this deck keeps its palette\n' +
		'   even where the theme is not installed). Generated on export. */\n' +
		String(theme.css).trim() +
		'\n</style>\n';
	// Place the block just after the front matter (or at the top if there is none),
	// blank-line-separated so it reads as its own Marp directive scope.
	const fm = /^(---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$))/.exec(src);
	if (fm) return src.slice(0, fm[0].length) + '\n' + block + '\n' + src.slice(fm[0].length);
	return block + '\n' + src;
}

// `components` is the array of referenced library components ({ name, css }) the
// deck uses — vendored as global <style> blocks so the exported .md renders them
// across all three engine paths (the component bridge; see
// engineering/decisions/2026-06-12-workbench-component-bridge.md). Pairs with the
// theme embed: theme first, then components, both self-contained.
export function exportMarkdown(source, name, theme, components) {
	let md = embedThemeInMarkdown(source, theme);
	md = embedComponentsInMarkdown(md, components);
	download(new Blob([md], { type: 'text/markdown;charset=utf-8' }), safeName(name) + '.md');
}

// Export to Marp — the SAME self-contained bundle as `npm run export:marp`,
// assembled in the browser: bake the slide splits into literal `---`, fetch the
// staged static assets (minified stylesheet / runtime / mermaid) + the
// palette CSS, then zip + download. The bundle spec (templates + the asset
// manifest) and the split baker come from the playground engine
// (window.LatticePlayground.marp), shared with the CLI so the two can't drift.
// `themeBase` is the hashed `…/playground/v/<hash>/themes/` URL the Drawing Board
// already fetches palettes from; the static assets sit beside it under export/.
export async function exportMarp(source, name, palette, themeBase, { includeAgent = true, version } = {}) {
	const PG = typeof window !== 'undefined' ? window.LatticePlayground : undefined;
	const marp = PG?.marp;
	if (!marp) throw new Error('engine not ready — try again in a moment');
	const { bakeSplits, STATIC_ASSETS, AGENT_ASSETS, MARP_CONFIG_CJS, withRuntimeScripts, packageJson, vscodeSettings, readme, agentsMd } = marp;
	const slug = safeName(name);
	const baseName = (p) => p.split('/').pop();

	const { default: JSZip } = await import('jszip');
	const zip = new JSZip();
	const dir = zip.folder(slug);

	// deck.md — splits baked + the runtime <script> tags appended.
	dir.file(`${slug}.md`, withRuntimeScripts(bakeSplits(source)));

	// palette CSS (+ dark), fetched from the staged theme dir. Fall back to the
	// default palette if the deck's theme isn't a served built-in (e.g. a
	// Workbench library theme), so the bundle is always renderable.
	const exportBase = themeBase.replace(/themes\/$/, 'export/');
	let chosen = (palette || 'indaco').toLowerCase();
	let bundledThemes = [];
	for (const cand of [chosen, 'indaco']) {
		bundledThemes = [];
		// Bundle the palette, its -dark companion, AND the transitive theme-name
		// @import closure (a11y-* → a11y-base → onyx), so the recipient's marp-cli
		// can resolve every link. `lattice` ships via STATIC_ASSETS, so its
		// imports need nothing extra.
		const seen = new Set();
		const queue = [`${cand}.css`, `${cand}-dark.css`];
		while (queue.length) {
			const tf = queue.shift();
			if (seen.has(tf)) continue;
			seen.add(tf);
			const r = await fetch(themeBase + tf).catch(() => null);
			if (!r?.ok) continue;
			const text = await r.text();
			dir.file(`themes/${tf}`, text);
			bundledThemes.push(`themes/${tf}`);
			// Bundle the transitive theme-name @import closure (shared scan helper —
			// handles the minified no-space form + strips comments so a banner's
			// literal `@import '<self>'` prose isn't treated as a dep).
			for (const dep of themeImportNames(text)) {
				if (dep !== 'lattice') queue.push(`${dep}.css`);
			}
		}
		if (bundledThemes.length) { chosen = cand; break; }
	}

	// static assets — minified stylesheet (→ lattice.css), runtime, mermaid.
	await Promise.all(STATIC_ASSETS.map(async ({ from, to }) => {
		const r = await fetch(exportBase + baseName(from)).catch(() => null);
		if (r?.ok) dir.file(to, await r.blob());
	}));

	// the agent kit (default on): the component catalog under agent/ + a
	// bundle-tailored AGENTS.md, so a recipient's AI agent can extend the deck
	// with full Lattice knowledge (capacity included). Fetched from the SAME
	// staged export/ dir as the static assets (sync-playground-assets.mjs stages
	// components.json there too). If the catalog can't be fetched, the bundle is
	// still emitted without the kit rather than failing the whole export.
	let agentOk = false;
	if (includeAgent && Array.isArray(AGENT_ASSETS) && agentsMd) {
		// All-or-nothing: fetch every kit asset FIRST, then add them only if all
		// succeeded — so a partial fetch never yields an AGENTS.md referencing a
		// file that 404'd. (Mirrors the CLI's up-front validation.)
		const fetched = await Promise.all(AGENT_ASSETS.map(async ({ from, to }) => {
			const r = await fetch(exportBase + baseName(from)).catch(() => null);
			return r?.ok ? { to, blob: await r.blob() } : null;
		}));
		if (fetched.length && fetched.every(Boolean)) {
			for (const f of fetched) dir.file(f.to, f.blob);
			dir.file('AGENTS.md', agentsMd({ name: slug, version }));
			agentOk = true;
		}
	}

	// generated text files (the shared bundle spec).
	const themesList = ['lattice.css', ...bundledThemes];
	dir.file('marp.config.cjs', MARP_CONFIG_CJS);
	dir.file('package.json', `${JSON.stringify(packageJson(slug), null, 2)}\n`);
	dir.file('.vscode/settings.json', vscodeSettings(themesList));
	dir.file('README.md', readme({ name: slug, palette: chosen, themes: themesList, agent: agentOk }));

	const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
	download(blob, `${slug}.zip`);
}

// ── Dedicated capture host ─────────────────────────────────────────────────────
// Export does NOT rasterize the live preview iframe. That iframe is tuned for
// on-screen performance: it virtualizes off-screen slides (`content-visibility`),
// gates the deck behind `.lattice{visibility:hidden}` until the in-iframe FIT agent
// reveals it, and on a phone its pane is `display:none` in the Edit tab. A slide
// read straight out of it rasterizes blank (hidden → transparent) or collapsed
// (no layout box → container-query `cqi/cqh` typography resolves to 0). So the
// export REUSES the engine render (html + css — identical to the preview, produced
// by the controller's `__dbExportRender`) and pours it into its OWN throwaway
// iframe that is fully laid out and ungated, making every capture correct no
// matter what the preview is doing. See the export-render design note.
//
// Scroll-safety: the host is a 0×0, `position:fixed`, `overflow:hidden`, behind-
// everything box, so it can never grow the page's scroll area / show a scrollbar
// or intercept input; the iframe inside still lays out at the full slide width
// (a parent's overflow clip does not change an iframe's internal layout), which is
// all the capture needs.
// Resolve when `p` settles OR after `ms`, whichever is first — so a capture-prelude
// await can never hang the whole export on a wedged load/font promise.
function withTimeout(p, ms) {
	return Promise.race([Promise.resolve(p), new Promise((res) => setTimeout(res, ms))]);
}

async function createCaptureFrame({ html, css, mode, geom, runtimeUrl, fontCss, mermaidUrl }) {
	const gw = geom?.w || 1280;
	const gh = geom?.h || 720;
	const host = document.createElement('div');
	host.setAttribute('aria-hidden', 'true');
	host.dataset.latticeExport = 'capture';
	host.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;overflow:hidden;opacity:0;pointer-events:none;z-index:-1;';
	const frame = document.createElement('iframe');
	frame.title = 'Export render';
	frame.style.cssText = `width:${gw}px;height:${gh}px;border:0;`;
	host.appendChild(frame);
	document.body.appendChild(host);
	const dispose = () => host.remove();
	try {
		// contentVisibility:false → no virtualization (every slide is laid out); no
		// cursor / sync / print chrome. The FIT agent still scales + reveals against
		// the real width; rasterizeSection undoes the scale (transform:none) per slide.
		const srcdoc = buildSrcdoc({ html, css, mode, geom: { w: gw, h: gh }, runtimeUrl, fontCss,
			...(mermaidUrl ? { mermaidUrl } : {}),
			contentVisibility: false, cursor: false, sync: false, printRules: false });
		// Every settle await below is BOUNDED — an unbounded wait could hang the
		// export forever (a srcdoc whose load never fires, or a `fonts.ready` that
		// stalls on a slow/failed face), leaving the mobile progress card stuck with
		// no error and no Retry. A slightly-early capture is safe: sectionsOf →
		// ensureFontsLoaded re-waits afterward with the embedded data-URI faces.
		await withTimeout(new Promise((res) => { frame.addEventListener('load', () => res(), { once: true }); frame.srcdoc = srcdoc; }), 10000);
		const win = frame.contentWindow;
		const doc = frame.contentDocument;
		if (!doc) throw new Error('Could not prepare the export render.');
		if (win?.__latticeFit) win.__latticeFit();
		// Let fonts, layout, and any async diagrams (Mermaid) settle before capture.
		try { if (doc.fonts?.ready) await withTimeout(doc.fonts.ready, 8000); } catch (_e) {}
		// Settle one more paint — but rAF is PAUSED in a backgrounded tab, and the print
		// export runs with the Studio tab backgrounded behind the new PDF tab it just
		// opened. A bare double-rAF would hang the whole export there, so race it against
		// a short timer fallback (timers only throttle, never pause). Foreground exports
		// still settle on the rAF (fires first, ~32ms); a backgrounded one proceeds on the
		// fallback. Capture reads layout + computed styles, which stay valid while hidden.
		await new Promise((res) => {
			let settled = false;
			const finish = () => { if (!settled) { settled = true; res(); } };
			requestAnimationFrame(() => requestAnimationFrame(finish));
			setTimeout(finish, 500);
		});
		await waitForDiagrams(doc);
		if (win?.__latticeFit) win.__latticeFit();
	} catch (e) {
		dispose();
		throw e;
	}
	return { frame, dispose };
}

// Bounded wait for runtime-rendered diagrams (Mermaid) to finish in the capture
// host, so a diagram deck doesn't rasterize mid-render. Charts are server-rendered
// SVG (already in the html); only Mermaid streams in async. No-op when absent.
async function waitForDiagrams(doc) {
	if (!doc.querySelector('.mermaid, pre.mermaid, code.language-mermaid')) return;
	const start = Date.now();
	while (Date.now() - start < 4000) {
		let pending = 0;
		doc.querySelectorAll('.mermaid, pre.mermaid').forEach((c) => { if (!c.querySelector('svg')) pending++; });
		if (!pending) break;
		await new Promise((r) => setTimeout(r, 120));
	}
}

async function sectionsOf(frame) {
	const doc = frame?.contentDocument;
	if (!doc) throw new Error('Preview not ready yet.');
	const sections = doc.querySelectorAll('.lattice>section');
	if (!sections.length) throw new Error('Nothing to export yet.');
	// Build the data-URI font sheet once, inject it into the preview doc, and wait
	// for every face — so off-screen slides (forced visible mid-loop) rasterize
	// with their fonts already resolved instead of racing the lazy loader.
	// Lazy-imported (its bundled .woff2 imports are not Node-loadable, so the pure
	// markdown kernels above stay unit-testable) — same split as jspdf/pptxgenjs.
	const { buildFontEmbedCss, ensureFontsLoaded } = await import('./font-embed.js');
	const fontEmbedCSS = await buildFontEmbedCss();
	await ensureFontsLoaded(doc, fontEmbedCSS);
	await flattenChartSvgs(frame, sections);
	return { sections, fontEmbedCSS };
}

// Bake every stylesheet-styled chart <svg> into a self-styled twin before the
// rasterizer runs. html-to-image inlines computed styles onto HTMLElements
// only — nested SVGElements keep just their attributes/classes, so in the
// serialized clone a chart loses ALL its CSS: fills fall to SVG-default BLACK,
// the CSS-sized root (viewBox, no width/height attrs) rescales, and label
// font-sizes vanish — the black-pentagon / giant-label PDFs found on-device.
// Fix by REUSE (HARD RULE #15): flattenSvgStyles (standalone-svg.js — the same
// kernel behind "download chart as SVG") walks the LIVE rendered svg, inlines
// the browser's already-computed paint/text props (incl. gradient stops via a
// probe), and returns a styled clone; we swap it in place and pin the root's
// layout box. The capture frame is a throwaway srcdoc, so the swap needs no
// restore, and one pass here covers the PDF (both lanes) AND PPTX rasterizers.
// SVGs that carry their own <style> (Mermaid, function-plot) are self-styled —
// the block survives cloneNode — so they're skipped. Any per-svg failure leaves
// that svg as-is: better one unstyled chart than a lost export.
async function flattenChartSvgs(frame, sections) {
	const win = frame.contentWindow;
	if (!win) return;
	const { flattenSvgStyles } = await import('./standalone-svg.generated.js');
	for (const sec of sections) {
		for (const svg of Array.from(sec.querySelectorAll('svg'))) {
			if (svg.querySelector('style')) continue; // self-styled (Mermaid, function-plot)
			try {
				// Used layout size (unaffected by the FIT transform) — the flattened
				// clone keeps paint/text only, so pin its box explicitly or the
				// viewBox would rescale it in the style-less serialization.
				const cs = win.getComputedStyle(svg);
				const w = parseFloat(cs.width);
				const h = parseFloat(cs.height);
				if (!w || !h) continue;
				const flat = flattenSvgStyles(svg, win);
				flat.setAttribute('width', String(w));
				flat.setAttribute('height', String(h));
				flat.style.width = `${w}px`;
				flat.style.height = `${h}px`;
				svg.replaceWith(flat);
			} catch (_e) { /* leave this svg vector-unstyled rather than fail the export */ }
		}
	}
}

// The slide's true box (px) from its own layout, NOT a hardcoded 1280×720 — a
// `size: 4K` deck lays out a 3840×2160 section, and capturing it at 1280 cropped
// the export to the top-left ninth. `offsetWidth/Height` are the untransformed
// layout box (the FIT scale doesn't affect them); HD is the fallback.
function slideGeom(section) {
	const w = section?.offsetWidth || 1280;
	const h = section?.offsetHeight || 720;
	return { w, h };
}

// Open BOTH preview-performance gates on a slide for the duration of a capture,
// returning a thunk that restores the prior inline values.
//
// The filmstrip preview is deliberately lazy: off-screen slides get
// `content-visibility:auto` (subtree rendering skipped) and the whole `.lattice`
// starts `visibility:hidden`, revealed by the in-iframe FIT agent only once the
// preview has a non-zero width — i.e. once it has actually been SHOWN. Neither
// state survives an export: html-to-image clones the section and copies its
// COMPUTED styles, so a skipped or hidden slide rasterizes to a blank page. That
// is exactly what happens when you export straight from the Drawing Board's Edit
// tab on a phone — the preview pane is `display:none`, FIT never runs, every
// section inherits `visibility:hidden`, and every exported page comes out blank
// (visiting Preview once is the user-visible workaround). Force both gates open
// for the capture so an export never depends on whether the preview was shown.
// DOM-only + pure (no html-to-image) → unit-tested directly under jsdom.
export function forceSectionVisibleForCapture(section) {
	const prev = {
		contentVisibility: section.style.contentVisibility,
		visibility: section.style.visibility,
	};
	section.style.contentVisibility = 'visible';
	section.style.visibility = 'visible';
	return function restore() {
		section.style.contentVisibility = prev.contentVisibility;
		section.style.visibility = prev.visibility;
	};
}

// Apply every capture-time fixup a slide needs (spectrum-ribbon repaint, opaque
// finish face, lazy-render gates forced open), run `capture(width, height,
// pixelRatio)`, and restore — shared by the PNG (PPTX) and canvas (PDF worker)
// rasterizers so the fixups can never drift apart.
async function withCaptureFixups(section, capture, pixelRatioOverride) {
	// The spectrum ribbon is a `border-top` whose `border-image-source` is a
	// linear-gradient. html-to-image inlines that computed border-image and
	// MIS-RENDERS it — filling the gradient across the whole element instead of
	// the border strip. So:
	//   - Bookend slides (title/closing/divider) carry the spectrum as an INERT
	//     border (`border-top:none`) over a solid canvas — html-to-image would
	//     fill it and bury the canvas. Just drop the border-image.
	//   - Content slides carry a REAL ~12px ribbon — left alone it fills the whole
	//     slide with rainbow, burying the content. Repaint it as a top background
	//     strip (html-to-image renders gradient BACKGROUNDS correctly) and make the
	//     now-blank border transparent. Layout is unchanged (the border keeps its
	//     width), so this is invisible in the preview and faithful in the export.
	const cs = getComputedStyle(section);
	const borderless = parseFloat(cs.borderTopWidth) === 0 || cs.borderTopStyle === 'none';
	const hasGradientBorder = cs.borderImageSource && cs.borderImageSource !== 'none';
	const prev = {
		borderImageSource: section.style.borderImageSource,
		borderTopColor: section.style.borderTopColor,
		backgroundImage: section.style.backgroundImage,
		backgroundRepeat: section.style.backgroundRepeat,
		backgroundPosition: section.style.backgroundPosition,
		backgroundSize: section.style.backgroundSize,
	};
	if (hasGradientBorder && borderless) {
		section.style.borderImageSource = 'none';
	} else if (hasGradientBorder) {
		const grad = cs.borderImageSource;
		const tw = cs.borderTopWidth;
		// Layer the ribbon gradient as a top strip OVER the slide's own background
		// (preserved — a canvas colour rides on background-color, untouched here; an
		// image canvas is kept as the second layer).
		const baseImg = cs.backgroundImage && cs.backgroundImage !== 'none' ? cs.backgroundImage : '';
		section.style.backgroundImage = baseImg ? `${grad}, ${baseImg}` : grad;
		section.style.backgroundRepeat = baseImg ? `no-repeat, ${cs.backgroundRepeat}` : 'no-repeat';
		section.style.backgroundPosition = baseImg ? `top left, ${cs.backgroundPosition}` : 'top left';
		section.style.backgroundSize = baseImg ? `100% ${tw}, ${cs.backgroundSize}` : `100% ${tw}`;
		section.style.borderImageSource = 'none';
		section.style.borderTopColor = 'transparent';
	}
	// Force the finish OPAQUE (export-safe) face for the raster. A finish shows its
	// RICH screen face by default — directional alpha fades the browser composites
	// fine, but html-to-image can mis-serialize (color-mix / fade-to-transparent), and
	// the rich face isn't PDF/PPTX-clean anyway. `.lattice-exporting` flips every
	// finish slot to its opaque mirror (base.finish.css). It must sit ON the section:
	// html-to-image clones the section + its descendants only (NOT its ancestors), so
	// a root-only class would be dropped in the clone. Removed in the finally.
	const hadExporting = section.classList.contains('lattice-exporting');
	if (!hadExporting) section.classList.add('lattice-exporting');
	// Defeat the preview's lazy-render gates (content-visibility virtualization +
	// the `.lattice` visibility reveal) so html-to-image rasterizes a laid-out,
	// painted slide even when the preview was never shown (phone Edit-tab export).
	const restoreVisibility = forceSectionVisibleForCapture(section);
	const { w, h } = slideGeom(section);
	// Cap the device-pixel multiplier so a 4K box (3840) rasterizes near its
	// native 3840 rather than a 7680 canvas that risks an OOM in the browser;
	// HD keeps the 2× retina capture it always had. The image-set export passes an
	// explicit ratio (its size preset / thumbnail scale, already OOM-capped by the
	// shared kernel), which wins over this default.
	const pixelRatio = pixelRatioOverride != null ? pixelRatioOverride : (w > 2048 ? 1 : 2);
	try {
		return await capture(w, h, pixelRatio);
	} finally {
		section.style.borderImageSource = prev.borderImageSource;
		section.style.borderTopColor = prev.borderTopColor;
		section.style.backgroundImage = prev.backgroundImage;
		section.style.backgroundRepeat = prev.backgroundRepeat;
		section.style.backgroundPosition = prev.backgroundPosition;
		section.style.backgroundSize = prev.backgroundSize;
		restoreVisibility();
		if (!hadExporting) section.classList.remove('lattice-exporting');
	}
}

// The html-to-image options shared by both capture flavors. transform:none
// undoes the live FIT scale; no backgroundColor (see header).
function captureOptions(w, h, pixelRatio, fontEmbedCSS) {
	return {
		width: w,
		height: h,
		pixelRatio,
		cacheBust: true,
		fontEmbedCSS,
		style: { transform: 'none', margin: '0', boxShadow: 'none', outline: 'none', borderRadius: '0' },
		filter: (n) => !(n.classList?.contains('db-active')),
	};
}

// Rasterize one rendered slide to a PNG data URL at its native box. `fontEmbedCSS`
// (the vendored, data-URI'd faces) is handed to html-to-image so the clone embeds
// every font itself rather than chasing the cross-origin Google-Fonts @import.
// The data-URL flavor — PPTX and chart export consume it directly. The PDF path
// uses rasterizeSectionToBitmap below so the PNG encode never runs on this thread.
async function rasterizeSection(section, fontEmbedCSS) {
	const { toPng } = await import('html-to-image');
	return withCaptureFixups(section, (w, h, pixelRatio) => toPng(section, captureOptions(w, h, pixelRatio, fontEmbedCSS)));
}

// Rasterize one rendered slide to a transferable ImageBitmap. Same clone + draw
// as rasterizeSection (that part needs the DOM and stays here), but it stops at
// the canvas: the expensive PNG deflate (canvas.toDataURL) and jsPDF's re-encode
// move to the export worker, which receives the bitmap zero-copy.
async function rasterizeSectionToBitmap(section, fontEmbedCSS) {
	const { toCanvas } = await import('html-to-image');
	return withCaptureFixups(section, async (w, h, pixelRatio) => {
		const canvas = await toCanvas(section, captureOptions(w, h, pixelRatio, fontEmbedCSS));
		return await createImageBitmap(canvas);
	});
}

// ── PDF (one-click image PDF) ─────────────────────────────────────────────────
// `render` is the engine result for the deck ({ html, css, mode, geom, runtimeUrl,
// fontCss }) — see the controller's `__dbExportRender`. We rasterize a dedicated
// capture host built from it, never the live preview.
//
// Two lanes to the same bytes-shape:
//   - WORKER (default): the main thread only clones + draws each slide
//     (rasterizeSectionToBitmap) and transfers the bitmap; the PNG deflate,
//     jsPDF page embedding, and the final serialization all run in
//     pdf-export-worker.js. On a large deck the old single-lane path froze the
//     page for the whole export (each slide's toDataURL + addImage re-encode is
//     synchronous, and output() at the end is one long block); this keeps the
//     UI painting and the progress line live.
//   - LEGACY (fallback): the original all-main-thread jsPDF build, kept for
//     browsers without OffscreenCanvas/module workers and as the safety net if
//     the worker fails for any reason.

function pdfPageGeom(boxW, boxH) {
	const PAGE_H = 720;
	return { pageW: Math.round((boxW * PAGE_H) / boxH), pageH: PAGE_H };
}

function pdfProps(name, meta, slideCount) {
	const { eng, summary, keywords } = provenance(meta, slideCount);
	return { title: (name || 'deck').trim(), subject: summary, author: 'Lattice Drawing Board', keywords, creator: `Lattice · ${eng}` };
}

function canUsePdfWorker() {
	return typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap !== 'undefined';
}

// Worker lane: returns the PDF bytes as a Blob. Any worker-side failure rejects
// so the caller can fall back to the legacy lane.
// At most this many slides may sit transferred-but-unprocessed in the worker's
// message queue. Each one is a full UNCOMPRESSED page bitmap (~15 MB at 2× HD),
// so an unbounded queue grows with however far the worker's encode falls behind
// the main thread's clone+draw — on a ~60-slide deck that's hundreds of MB,
// which blows iOS Safari's per-tab memory ceiling and crashes the export
// mid-deck. A window of 2 keeps the pipeline overlapped (main draws slide N+1
// while the worker encodes slide N) with bounded memory; 1 would serialize the
// lanes and give back part of the speed win.
const PDF_WORKER_MAX_IN_FLIGHT = 2;

async function buildPdfBlobViaWorker(sections, fontEmbedCSS, name, onStatus, meta, pageFormat, annotations) {
	const worker = new Worker(new URL('./pdf-export-worker.js', import.meta.url), { type: 'module' });
	try {
		const total = sections.length;
		let acked = 0;
		let wake = null;
		const done = new Promise((resolve, reject) => {
			worker.onmessage = (e) => {
				const m = e.data;
				if (m.type === 'progress') {
					acked = m.index + 1;
					if (wake) { wake(); wake = null; }
					if (onStatus) onStatus('Rendering slide ' + (m.index + 1) + ' of ' + total + '…', { current: m.index + 1, total });
				} else if (m.type === 'done') resolve(new Blob([m.bytes], { type: 'application/pdf' }));
				else if (m.type === 'error') reject(new Error(m.message));
			};
			worker.onerror = (e) => reject(new Error(e.message || 'PDF worker failed'));
		});
		// A worker error can land while the loop is between awaits; pre-attach a
		// no-op handler so the browser never flags an unhandled rejection (the
		// real `await done` below still observes the original rejection).
		done.catch(() => {});
		const { w: boxW, h: boxH } = slideGeom(sections[0]);
		const { pageW, pageH } = pdfPageGeom(boxW, boxH);
		worker.postMessage({ type: 'init', pageW, pageH, total, pageFormat, props: pdfProps(name, meta, total), annotations });
		for (let i = 0; i < total; i++) {
			// Backpressure: wait for the worker's ack before growing the in-flight
			// window. Raced against `done` so a worker-side error breaks the wait
			// (rejects) instead of deadlocking the loop.
			while (i - acked >= PDF_WORKER_MAX_IN_FLIGHT) {
				await Promise.race([done, new Promise((r) => { wake = r; })]);
			}
			if (onStatus) onStatus('Rendering slide ' + (i + 1) + ' of ' + total + '…', { current: i, total });
			const bitmap = await rasterizeSectionToBitmap(sections[i], fontEmbedCSS);
			worker.postMessage({ type: 'slide', index: i, bitmap }, [bitmap]);
			// Yield a macrotask between slides so the clone/draw work (which must stay
			// on this thread) never runs back-to-back without a paint.
			await new Promise((r) => setTimeout(r));
		}
		worker.postMessage({ type: 'finish' });
		return await done;
	} finally {
		worker.terminate();
	}
}

// The legacy lane's JPEG flavor: same clone + draw, composited over a white
// underlay (JPEG has no alpha; a bare encode composites stray transparency onto
// BLACK), encoded on this thread. NOT html-to-image's toJpeg — its
// `backgroundColor` option overrides the slide's own background (see the header
// warning), so we composite ourselves, exactly like the worker lane does.
async function rasterizeSectionToDataUrl(section, fontEmbedCSS, pageFormat) {
	if (pageFormat !== 'jpeg') return rasterizeSection(section, fontEmbedCSS);
	const { toCanvas } = await import('html-to-image');
	return withCaptureFixups(section, async (w, h, pixelRatio) => {
		const canvas = await toCanvas(section, captureOptions(w, h, pixelRatio, fontEmbedCSS));
		const out = document.createElement('canvas');
		out.width = canvas.width;
		out.height = canvas.height;
		const ctx = out.getContext('2d');
		ctx.fillStyle = '#fff';
		ctx.fillRect(0, 0, out.width, out.height);
		ctx.drawImage(canvas, 0, 0);
		return out.toDataURL('image/jpeg', 0.95);
	});
}

// Legacy lane: the original all-main-thread jsPDF build — the full-bleed colour PDF
// (slide-sized MediaBox, one slide per page), used when the worker lane is unavailable
// or fails. The print `sheet` mode does NOT come through here anymore: it is the
// rasterize → assemble split below (rasterizeDeckImages + assembleSheetPdf), so a
// paper/orientation change re-places cached images instead of re-rasterizing.
async function buildPdfBlobOnMainThread(sections, fontEmbedCSS, name, onStatus, meta, pageFormat, annotations) {
	const { jsPDF } = await import('jspdf');
	const { w: boxW, h: boxH } = slideGeom(sections[0]);
	const { pageW, pageH } = pdfPageGeom(boxW, boxH);
	const orientation = 'landscape';
	const pdf = new jsPDF({ orientation, unit: 'px', format: [pageW, pageH], compress: true });
	pdf.setProperties(pdfProps(name, meta, sections.length));
	for (let i = 0; i < sections.length; i++) {
		if (onStatus) onStatus('Rendering slide ' + (i + 1) + ' of ' + sections.length + '…', { current: i, total: sections.length });
		const img = await rasterizeSectionToDataUrl(sections[i], fontEmbedCSS, pageFormat);
		if (i > 0) pdf.addPage([pageW, pageH], orientation);
		pdf.addImage(img, pageFormat === 'jpeg' ? 'JPEG' : 'PNG', 0, 0, pageW, pageH);
		// Review comments for this slide → sticky notes on the page just drawn (same
		// helper + placement the worker lane uses, so the two lanes stay identical).
		if (annotations) addPageStickyNotes(pdf, annotations[i], pageW);
		// Yield a macrotask between slides so the browser can PAINT the progress
		// line and service input — the per-slide rasterize + PNG-deflate are
		// synchronous, and without this break a multi-slide export blocks the main
		// thread in one long freeze. The bytes are identical; only the pacing changes.
		await new Promise((r) => setTimeout(r));
	}
	return pdf.output('blob');
}

// ── Print `sheet` mode — the rasterize → assemble split ───────────────────────
// The Studio "Print deck" builds a chosen paper-size MediaBox with each slide fit +
// centered on a white page, so the PDF's own page geometry — which iOS honors exactly,
// unlike CSS @page — gives reliable one-slide-per-page at the right size. That split
// into two halves (HARD RULE #1 — the shared kernel both the drawer and the CLI use):
//   (a) rasterizeDeckImages — the EXPENSIVE half (html-to-image, one clone/draw per
//       slide). Its output depends ONLY on the render (html/css/mode/fonts) + the image
//       format, NEVER on paper/orientation — a slide is captured at its native box and
//       jsPDF scales it into the fit-rect. So the images are cacheable across sheet flips.
//   (b) assembleSheetPdf — the CHEAP, DOM-free half (pure jsPDF geometry). A paper or
//       orientation change re-runs ONLY this, re-placing the SAME cached images with no
//       re-rasterize. This is also the seam N-up (N images per sheet) and the speaker-
//       notes handout (slide + its notes per page) build on.

// (a) Rasterize every slide of a deck to a data-URL image at its native box, keyed
// conceptually by (render, pageFormat). The images are self-contained (fonts embedded)
// and paper-blind, so a caller can cache them and re-assemble onto any sheet. Returns
// `{ images, geom, pageFormat }`; the caller disposes nothing (the capture host is
// created + torn down here).
export async function rasterizeDeckImages(render, onStatus, opts) {
	const pageFormat = opts?.pageFormat === 'jpeg' ? 'jpeg' : 'png';
	const { frame, dispose } = await createCaptureFrame(render);
	try {
		const { sections, fontEmbedCSS } = await sectionsOf(frame);
		const { w, h } = slideGeom(sections[0]);
		const images = [];
		for (let i = 0; i < sections.length; i++) {
			if (onStatus) onStatus('Rendering slide ' + (i + 1) + ' of ' + sections.length + '…', { current: i, total: sections.length });
			images.push(await rasterizeSectionToDataUrl(sections[i], fontEmbedCSS, pageFormat));
			// Yield a macrotask between slides so the progress line paints (see the note
			// in buildPdfBlobOnMainThread) — the per-slide clone + PNG-deflate is synchronous.
			await new Promise((r) => setTimeout(r));
		}
		return { images, geom: { w, h }, pageFormat };
	} finally {
		dispose();
	}
}

// (b) Assemble a print PDF from PRE-RASTERIZED slide images placed on a chosen paper
// sheet — the DOM-free half, so a paper/orientation change re-runs only this (no
// re-rasterize). `opts.sheet` = { pageW, pageH, fit } in px @96dpi; `opts.pageFormat`
// matches how `images` were encoded; `opts.nup` (1|2|4) packs multiple slides per sheet
// in a grid (default 1 → one fit+centered slide per page); `opts.handout` (with
// `opts.notes` — one string per slide) prints the speaker-notes handout instead (slide on
// top, its notes below, one slide per page). Annotations (comment sticky notes) are
// intentionally OUT of scope here — the Print drawer never carries them; the colour-PDF/
// legacy lanes own that path.
export async function assembleSheetPdf(images, geom, name, meta, opts) {
	const pageFormat = opts?.pageFormat === 'jpeg' ? 'jpeg' : 'png';
	const sheet = opts?.sheet;
	if (!sheet) throw new Error('assembleSheetPdf needs opts.sheet ({ pageW, pageH, fit }).');
	const onStatus = opts?.onStatus;
	const handout = !!opts?.handout;
	// Handout is always one slide + its notes per page; N-up (grid) is otherwise 1|2|4.
	const nup = handout ? 1 : [1, 2, 4].includes(opts?.nup) ? opts.nup : 1;
	const notes = Array.isArray(opts?.notes) ? opts.notes : [];
	const { jsPDF } = await import('jspdf');
	const boxW = geom?.w || 1280;
	const boxH = geom?.h || 720;
	const { pageW, pageH } = sheet;
	// The `nup` cell placements for one sheet (shared kernel geometry — nup=1 collapses to
	// exactly fitSlideOnSheet). Image i lands in cell i % nup; every `nup` images = one page.
	// In handout mode the slide sits in the top band, its notes in the band below.
	const cells = nUpCells(boxW, boxH, pageW, pageH, nup, sheet.fit);
	const regions = handout ? handoutRegions(boxW, boxH, pageW, pageH, sheet.fit) : null;
	// Orientation derives from the chosen page so a portrait sheet isn't forced landscape.
	const orientation = pageW >= pageH ? 'landscape' : 'portrait';
	// A PHYSICALLY correct MediaBox (so iOS/print shows "US Legal", not a giant custom
	// size): the `px_scaling` hotfix makes jsPDF treat px as 96dpi (1px = 0.75pt), so
	// pageW=1344px → 1008pt = 14in.
	const pdf = new jsPDF({ orientation, unit: 'px', format: [pageW, pageH], compress: true, hotfixes: ['px_scaling'] });
	pdf.setProperties(pdfProps(name, meta, images.length));
	const pages = handout ? images.length : Math.ceil(images.length / nup) || 1;
	for (let p = 0; p < pages; p++) {
		if (p > 0) pdf.addPage([pageW, pageH], orientation);
		// White page under the fit+centered slides so the letterbox bands print white, not
		// transparent (a transparent PNG over nothing composites to black on some viewers).
		pdf.setFillColor(255, 255, 255);
		pdf.rect(0, 0, pageW, pageH, 'F');
		if (handout) {
			if (onStatus) onStatus('Placing slide ' + (p + 1) + ' of ' + images.length + '…', { current: p, total: images.length });
			pdf.addImage(images[p], pageFormat === 'jpeg' ? 'JPEG' : 'PNG', regions.slide.x, regions.slide.y, regions.slide.w, regions.slide.h);
			drawHandoutNotes(pdf, regions.notes, notes[p]);
		} else {
			for (let k = 0; k < nup; k++) {
				const idx = p * nup + k;
				if (idx >= images.length) break;
				if (onStatus) onStatus('Placing slide ' + (idx + 1) + ' of ' + images.length + '…', { current: idx, total: images.length });
				const cell = cells[k];
				pdf.addImage(images[idx], pageFormat === 'jpeg' ? 'JPEG' : 'PNG', cell.x, cell.y, cell.w, cell.h);
			}
		}
		// Yield a macrotask between pages — LOAD-BEARING for the re-place path. A
		// paper/orientation change reuses cached images, so this loop is the ENTIRE build:
		// run synchronously it blocks the main thread, and React batches a caller's
		// `building=true` → done into one commit, so the button's loading state never
		// paints (it snaps straight to the finished state). The yield lets React paint the
		// loading state first and keeps the UI responsive on a large deck. (The legacy
		// sheet lane yielded here too; the rasterize half yields per slide separately.)
		await new Promise((r) => setTimeout(r));
	}
	return pdf.output('blob');
}

// Draw a slide's speaker notes into the handout's notes band: a hairline rule at the top,
// then the note text wrapped to the band width and clipped to its height (a very long note
// is truncated with an ellipsis rather than spilling onto the slide above or off the page).
// px doc units (px_scaling): font size is points, so px → pt is ×0.75. Empty note → just
// a faint "No notes for this slide." placeholder so the page still reads as a handout.
function drawHandoutNotes(pdf, region, note) {
	pdf.setDrawColor(210, 210, 210);
	pdf.setLineWidth(1);
	pdf.line(region.x, region.y, region.x + region.w, region.y);
	const text = (note || '').trim();
	const FONT_PX = 15;
	const lineH = FONT_PX * 1.4;
	pdf.setFont('helvetica', 'normal');
	pdf.setFontSize(FONT_PX * 0.75); // px → pt
	const padTop = Math.round(lineH * 0.9);
	if (!text) {
		pdf.setTextColor(170, 170, 170);
		pdf.setFont('helvetica', 'italic');
		pdf.text('No notes for this slide.', region.x, region.y + padTop);
		return;
	}
	pdf.setTextColor(40, 40, 40);
	const lines = pdf.splitTextToSize(text, region.w);
	const maxLines = Math.max(1, Math.floor((region.h - padTop) / lineH) + 1);
	let shown = lines;
	if (lines.length > maxLines) {
		// Re-wrap the last visible line WITH the ellipsis appended so it can't overrun the
		// band width (a bare slice + '…' could push one glyph into the right safe margin).
		const last = pdf.splitTextToSize(`${String(lines[maxLines - 1] || '')}…`, region.w)[0];
		shown = [...lines.slice(0, maxLines - 1), last];
	}
	pdf.text(shown, region.x, region.y + padTop, { lineHeightFactor: 1.4 });
}

// The shared core of exportPdf (which downloads) and renderPdfBlob (which hands
// the bytes to a caller — e.g. the Library's theme-zip showcase).
async function buildPdfBlob(render, name, onStatus, meta, opts) {
	const pageFormat = opts?.pageFormat === 'jpeg' ? 'jpeg' : 'png';
	// Per-page comment sticky notes (opt-in via the export panel); absent → none.
	const annotations = opts?.annotations || null;
	// Print `sheet` mode → the rasterize → assemble split. A one-shot renderPdfBlob
	// rasterizes then assembles in one go; the Print drawer instead calls the two halves
	// directly so it can CACHE the images across a paper/orientation change.
	const sheet = opts?.sheet || null;
	if (sheet) {
		const { images, geom, pageFormat: fmt } = await rasterizeDeckImages(render, onStatus, opts);
		return assembleSheetPdf(images, geom, name, meta, { sheet, pageFormat: fmt });
	}
	const { frame, dispose } = await createCaptureFrame(render);
	try {
		const { sections, fontEmbedCSS } = await sectionsOf(frame);
		if (canUsePdfWorker()) {
			try {
				return await buildPdfBlobViaWorker(sections, fontEmbedCSS, name, onStatus, meta, pageFormat, annotations);
			} catch (e) {
				// The deck must never be lost to the fast lane — rebuild on-thread.
				console.warn('[lattice-export] PDF worker failed (' + (e?.message || e) + ') — falling back to the main-thread build.');
			}
		}
		return await buildPdfBlobOnMainThread(sections, fontEmbedCSS, name, onStatus, meta, pageFormat, annotations);
	} finally {
		dispose();
	}
}

/** Render a deck to PDF bytes (Blob) without downloading — for embedding (zips). */
export async function renderPdfBlob(render, name, onStatus, meta, opts) {
	if (onStatus) onStatus('Rendering PDF…');
	return buildPdfBlob(render, name, onStatus, meta, opts);
}

/** `opts.pageFormat`: 'png' (default, lossless) or 'jpeg' (faster, smaller —
 *  the Studio Workspace › General preference rides in here). */
export async function exportPdf(render, name, onStatus, meta, opts) {
	if (onStatus) onStatus('Preparing PDF…');
	const blob = await buildPdfBlob(render, name, onStatus, meta, opts);
	if (onStatus) onStatus('Saving PDF…');
	download(blob, safeName(name) + '.pdf');
}

// ── PPTX (image-slides) ───────────────────────────────────────────────────────
// Each image's alt text is the slide's accessibility description — the WCAG
// SC 1.1.1 alternative an image-per-slide deck otherwise lacks. It is read from
// the SAME rendered `<section>` that is rasterized (via the engine's
// `descriptionFromHtml`, the single note/description boundary — HARD RULE #1), so
// the alt can never drift onto the wrong slide: no source re-split, no
// front-matter phantom, no auto-split (`split: headings`) misalignment. Mirrors
// lib/export/pptx-export.js, which extracts from the same rendered slides it paints.
export async function exportPptx(render, name, onStatus, meta) {
	if (onStatus) onStatus('Preparing PowerPoint…');
	const { frame, dispose } = await createCaptureFrame(render);
	try {
	const { sections, fontEmbedCSS } = await sectionsOf(frame);
	const { default: PptxGenJS } = await import('pptxgenjs');
	const pptx = new PptxGenJS();
	const { eng, summary } = provenance(meta, sections.length);
	pptx.title = (name || 'deck').trim();
	pptx.subject = summary;
	pptx.author = 'Lattice Drawing Board';
	pptx.company = `Lattice · ${eng}`;
	// Slide aspect from the deck's @size geometry (mirrors lib/export/pptx-export.js
	// pptxLayout). 16:9 keeps the built-in LAYOUT_WIDE; portrait/square get a custom
	// layout at the same aspect, normalized to a 13.333in longest edge so the PNG
	// full-bleeds without a ~20in sheet. Without this a portrait deck letterboxed.
	const { w: boxW, h: boxH } = slideGeom(sections[0]);
	if (boxW > 0 && boxH > 0 && Math.abs(boxW / boxH - 16 / 9) >= 0.01) {
		const longest = Math.max(boxW, boxH);
		const r = (n) => Math.round((n / longest) * 13.333 * 1000) / 1000;
		pptx.defineLayout({ name: 'LATTICE', width: r(boxW), height: r(boxH) });
		pptx.layout = 'LATTICE';
	} else {
		pptx.layout = 'LAYOUT_WIDE'; // 13.333 x 7.5in, 16:9 — the PNG full-bleeds it
	}
	for (let i = 0; i < sections.length; i++) {
		if (onStatus) onStatus('Rendering slide ' + (i + 1) + ' of ' + sections.length + '…', { current: i, total: sections.length });
		const png = await rasterizeSection(sections[i], fontEmbedCSS);
		// Alt text: the slide's own `describe:` description, read from the very
		// section being rasterized, else a neutral "Slide N" (never let pptxgenjs
		// default `descr` to the image filename — junk a screen reader reads).
		const altText = (notesCore.descriptionFromHtml(sections[i].outerHTML) || '').trim() || `Slide ${i + 1}`;
		pptx.addSlide().addImage({ data: png, x: 0, y: 0, w: '100%', h: '100%', altText });
		// Yield between slides so the progress paints and input stays live (see the
		// matching note in buildPdfDoc) — the per-slide rasterize is synchronous.
		await new Promise((r) => setTimeout(r));
	}
	if (onStatus) onStatus('Building .pptx…', { current: sections.length, total: sections.length });
	await pptx.writeFile({ fileName: safeName(name) + '.pptx' });
	} finally { dispose(); }
}

// ── Print (vector, selectable — the browser's own PDF engine) ─────────────────
export function exportPrint(frame, meta) {
	const win = frame?.contentWindow;
	if (!win) throw new Error('Preview not ready yet.');
	// Chromium's print-to-PDF carries only one document-property field we can set:
	// the title (it hard-sets Producer/Creator itself). Encode the engine into it
	// so a vector Print PDF is still tellable apart — it also becomes the suggested
	// filename in the dialog, which is the behaviour authors expect.
	const doc = frame.contentDocument;
	if (doc && meta) doc.title = `${(meta.deck || 'deck').trim()} · ${engineLabel(meta.engine)}`;
	win.focus();
	win.print();
}

// ── Standalone chart SVG ──────────────────────────────────────────────────────
// Lift each keyed chart (pie/radar/map/cohort quadrant) out of the deck as a
// self-contained .svg — the diagram, spine, and key are already one <svg>, so
// the export flattens its COMPUTED colours to literals (no theme CSS needed) and
// embeds the fonts it uses. Shares the core (lib/.../standalone-svg.js) with the
// CLI sibling tools/export-chart-svg.js — in the browser via the esbuild ESM
// bundle standalone-svg.generated.js (the raw CJS module can't be imported in
// `astro dev`, same as the theme/layout/authoring cores).

// Keep only the @font-face blocks for families the chart actually uses, so the
// downloaded chart carries 2–3 faces, not all 17.
function subsetFontFaceCss(css, families) {
	if (!families?.length) return '';
	const want = new Set(families.map((f) => String(f).toLowerCase()));
	return (css.match(/@font-face\{[^}]*\}/g) || [])
		.filter((block) => {
			const m = block.match(/font-family:\s*'([^']+)'/i);
			return m && want.has(m[1].toLowerCase());
		})
		.join('\n');
}

// The chart `<svg>` on the slide the editor cursor is in, or null. The controller
// The cursor's slide is marked `.db-active` in the preview (cursor↔slide sync),
// so these gate the export to "the chart you're looking at" and drive the Export
// menu's "Export chart" entry. `CLEAN_SVG_LAYOUTS` are the charts that render as a
// SINGLE self-contained <svg> (diagram + in-svg legend) → exported as crisp
// standalone vector. Every OTHER chart-frame slide (gantt/kanban/progress/journey/
// state-chart/roadmap/timeline/word-cloud) is HTML/CSS or mixed → exported as a
// high-res PNG, rasterized in-browser by the SAME html-to-image path the
// one-click PDF/PPTX uses (it renders these charts faithfully).
const CLEAN_SVG_LAYOUTS = ['piechart', 'radar', 'map', 'quadrant', 'funnel'];

// The cursor's active chart slide (ANY `chart-frame` section), or null — drives
// the "Export chart" menu visibility.
export function activeChartSection(frame) {
	const sec = frame?.contentDocument?.querySelector('.lattice > section.db-active');
	return sec?.classList.contains('chart-frame') ? sec : null;
}

// The keyed single-`<svg>` chart on the cursor's active slide, or null (SVG tier).
export function activeChartSvg(frame) {
	const sec = activeChartSection(frame);
	if (!sec || !CLEAN_SVG_LAYOUTS.some((c) => sec.classList.contains(c))) return null;
	return sec.querySelector('svg[viewBox]');
}

function dataUrlToBlob(dataUrl) {
	const [head, b64] = dataUrl.split(',');
	const mime = head.match(/data:([^;]+)/)?.[1] || 'image/png';
	const bin = atob(b64);
	const arr = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
	return new Blob([arr], { type: mime });
}

// Export the chart on slide `activeIndex` (the cursor's slide — its index is read
// from the live preview by the caller, since the capture host has no cursor). SVG
// tier: a single self-contained <svg> (piechart/radar/map/quadrant/funnel) flattens
// to a standalone, theme-free vector. PNG tier: every other chart-frame slide
// rasterizes via the shared html-to-image path. Both run against the dedicated
// capture host (laid out + ungated), so a chart exports correctly even from the
// phone Edit tab. `render` is the engine result (see exportPdf).
export async function exportChart(render, activeIndex, name, onStatus) {
	const { frame, dispose } = await createCaptureFrame(render);
	try {
		const doc = frame.contentDocument;
		const win = frame.contentWindow;
		const sec = doc.querySelectorAll('.lattice>section')[activeIndex];
		if (!sec?.classList.contains('chart-frame')) throw new Error('Put the cursor in a slide that has a chart.');
		const svg = CLEAN_SVG_LAYOUTS.some((c) => sec.classList.contains(c)) ? sec.querySelector('svg[viewBox]') : null;
		if (svg) {
			const [core, fontMod] = await Promise.all([
				import('./standalone-svg.generated.js'),
				import('./font-embed.js'),
			]);
			const { flattenSvgStyles, collectFontFamilies, finalizeStandaloneSvg } = core;
			const { buildFontEmbedCss, ensureFontsLoaded } = fontMod;
			// Embed the faces + wait for them, so the nodes lay out with the real font
			// before we read computed styles (mirrors the PDF/PPTX path).
			const fontCssAll = await buildFontEmbedCss();
			await ensureFontsLoaded(doc, fontCssAll);
			const markup = new XMLSerializer().serializeToString(flattenSvgStyles(svg, win));
			const fontFaceCss = subsetFontFaceCss(fontCssAll, collectFontFamilies(markup));
			const out = finalizeStandaloneSvg(markup, { fontFaceCss });
			download(new Blob([out], { type: 'image/svg+xml;charset=utf-8' }), `${safeName(name)}-chart.svg`);
			if (onStatus) onStatus('Chart downloaded as SVG.');
			return;
		}
		// PNG tier — rasterize the chart slide via the shared html-to-image path.
		if (onStatus) onStatus('Rasterizing chart…');
		const { fontEmbedCSS } = await sectionsOf(frame);
		const dataUrl = await rasterizeSection(sec, fontEmbedCSS);
		download(dataUrlToBlob(dataUrl), `${safeName(name)}-chart.png`);
		if (onStatus) onStatus('Chart downloaded as PNG.');
	} finally { dispose(); }
}

// ── Image set (a .zip of one image per slide) ─────────────────────────────────
// Rasterize one slide to a Blob in the chosen format at a chosen device-pixel
// ratio. Uses toCanvas (not toPng/toJpeg) so PNG / JPEG / WebP all go through the
// one canvas.toBlob encode — html-to-image has no toWebp, and canvas covers all
// three with a quality arg. The pixelRatio is the image-set size preset (or the
// thumbnail scale), already OOM-capped by the shared kernel.
async function rasterizeSectionToBlob(section, fontEmbedCSS, format, quality, pixelRatio, FORMAT_META) {
	const { toCanvas } = await import('html-to-image');
	return withCaptureFixups(section, async (w, h, pr) => {
		const canvas = await toCanvas(section, captureOptions(w, h, pr, fontEmbedCSS));
		const meta = FORMAT_META[format] || FORMAT_META.png;
		const q = meta.lossy ? Math.min(1, Math.max(0.01, quality / 100)) : undefined;
		return await new Promise((resolve, reject) =>
			canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas.toBlob returned null'))), meta.mime, q));
	}, pixelRatio);
}

// Export the whole deck as an image set — a .zip of one raster per slide plus
// opt-in thumbnails and standalone chart/diagram SVGs. The zip layout, naming,
// size-preset math, and manifest come from the SHARED kernel (image-set-core,
// generated from lib/export/image-set.js), the same contract the CLI's `.zip`
// output uses — so the Studio and CLI emit the same set. `render` is the engine
// result (see exportPdf); `opts` is the raw tuning config from the options panel.
export async function exportImageSet(render, name, opts, onStatus) {
	const core = await import('./image-set-core.generated.js');
	const options = core.normalizeImageSetOptions(opts);
	const { frame, dispose } = await createCaptureFrame(render);
	try {
		const { sections, fontEmbedCSS } = await sectionsOf(frame);
		if (!sections.length) throw new Error('Nothing to export — the deck rendered no slides.');
		const win = frame.contentWindow;
		const { w, h } = slideGeom(sections[0]);
		const scale = core.resolveRasterScale(options.size, w, h);
		const thumbScale = core.resolveThumbScale(options.thumbWidth, w);

		// (1) Standalone vector assets — charts (keyed single-svg layouts) + Mermaid
		// diagrams — flattened to theme-free, font-embedded standalone .svg. Reuses the
		// chart-SVG core (the same "download chart as SVG" path), extended to diagrams.
		const svgs = [];
		if (options.extractSvg) {
			const [svgCore, fontMod] = await Promise.all([
				import('./standalone-svg.generated.js'),
				import('./font-embed.js'),
			]);
			const { flattenSvgStyles, collectFontFamilies, finalizeStandaloneSvg } = svgCore;
			const { buildFontEmbedCss, ensureFontsLoaded } = fontMod;
			const fontCssAll = await buildFontEmbedCss();
			await ensureFontsLoaded(frame.contentDocument, fontCssAll);
			sections.forEach((sec, si) => {
				const targets = [];
				// Mermaid renders differently per surface: the engine pre-renders to a
				// `.mermaid-svg` wrapper (the CLI path), while in the browser the runtime
				// renders client-side into a `.mermaid` div (lib/runtime/index.js). Match
				// BOTH so the Studio extracts the same diagrams the CLI does — otherwise the
				// two surfaces would emit different sets (the `.mermaid-error` sibling has no
				// <svg>, so it's never matched). See waitForDiagrams above, which waits on
				// exactly these wrappers.
				sec.querySelectorAll('.mermaid-svg svg, .mermaid svg').forEach((s) => { targets.push([s, 'diagram']); });
				if (sec.classList.contains('chart-frame') && CLEAN_SVG_LAYOUTS.some((c) => sec.classList.contains(c))) {
					sec.querySelectorAll('svg[viewBox]').forEach((s) => { targets.push([s, 'chart']); });
				}
				for (const [svg, kind] of targets) {
					try {
						const markup = new XMLSerializer().serializeToString(flattenSvgStyles(svg, win));
						const fontFaceCss = subsetFontFaceCss(fontCssAll, collectFontFamilies(markup));
						svgs.push({ slide: si + 1, kind, svg: finalizeStandaloneSvg(markup, { fontFaceCss }) });
					} catch (_e) { /* skip one un-flattenable svg rather than fail the export */ }
				}
			});
		}

		// (2) Full raster per slide, at the size preset.
		const images = [];
		for (let i = 0; i < sections.length; i++) {
			if (onStatus) onStatus('Rendering slide ' + (i + 1) + ' of ' + sections.length + '…', { current: i, total: sections.length });
			images.push(await rasterizeSectionToBlob(sections[i], fontEmbedCSS, options.format, options.quality, scale, core.FORMAT_META));
			await new Promise((r) => setTimeout(r)); // yield so the progress line paints
		}

		// (3) Thumbnails — the same slides at the small thumbnail scale.
		const thumbs = [];
		if (options.thumbnails) {
			for (let i = 0; i < sections.length; i++) {
				if (onStatus) onStatus('Rendering thumbnail ' + (i + 1) + ' of ' + sections.length + '…', { current: i, total: sections.length });
				thumbs.push(await rasterizeSectionToBlob(sections[i], fontEmbedCSS, options.format, options.quality, thumbScale, core.FORMAT_META));
				await new Promise((r) => setTimeout(r));
			}
		}

		// (4) Pack via the shared kernel → a single .zip.
		if (onStatus) onStatus('Building .zip…', { current: sections.length, total: sections.length });
		const { default: JSZip } = await import('jszip');
		const plan = core.assembleImageSetPlan({
			name, options, geom: { w, h }, scale, images, thumbs, svgs, generator: 'studio',
		});
		const zip = new JSZip();
		core.addPlanToZip(zip, plan);
		const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
		download(blob, plan.slug + '.zip');
		if (onStatus) onStatus('Image set downloaded.');
	} finally { dispose(); }
}
