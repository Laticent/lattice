// The Print drawer — the pre-print step for "Print deck", a sub-view of the Share
// sheet (mirrors the PDF ExportOptionsPanel). It carries the on-brand boardroom look
// of the Print page it replaces — navy preview stage, white sheet with a dashed
// safe-margin, brass segmented controls — recomposed to the drawer's width.
//
// ON-DEMAND, NOT EAGER. The heavy work — rasterizing every slide into a PDF — happens
// ONLY when the user clicks Print or Download, never on a config change. The live
// preview is cheap engine HTML (re-rendered only on a colour change; paper/orientation
// just re-fit the same render via CSS), so flipping paper/orientation/colour is free.
// A built PDF is cached by (render, paper, orientation), so a second Print/Download with
// the same settings reuses it instead of re-rasterizing.
//
// PRINT IS PLATFORM-BEST:
//   · DESKTOP honors CSS `@page`, so Print prints the crisp VECTOR deck through a hidden
//     HTML iframe (a reliable dialog — a PDF-in-iframe won't auto-print in Chrome). This
//     needs NO PDF at all, so desktop Print is one instant tap.
//   · iOS ignores `@page` + forbids scripted printing, so Print needs the real PDF opened
//     for the native Share → Print. Two hard constraints collide: the rasterizer only runs
//     in a FOREGROUND tab (opening a tab backgrounds the opener and freezes it), and a
//     `window.open` AFTER an await is pop-up-blocked (the tap's activation is spent). You
//     can't build-then-open in one tap. So iOS Print is TWO taps: tap 1 builds the PDF in
//     the foreground (no tab open → no freeze); the button then arms to "Open PDF", and tap
//     2 opens the cached file synchronously, inside that gesture → never blocked.
// Download saves the (built-on-click) PDF on both. See engineering/decisions/2026-06-14-deck-print-styling.md.

import { ArrowLeft, Download, ExternalLink, Loader2, Printer } from 'lucide-react';
import * as React from 'react';
import type { SingleSlideOptions } from '@/lib/single-slide-render';
// Engine helpers (shared kernel, HARD RULE #1): the paper decision + slide placement
// + single-slide srcdoc + rendered-HTML splitter all live in the playground engine.
import { buildSrcdoc, fitSlideOnSheet, resolvePrintSheet, splitSections } from '@/playground/deck-preview.js';
import { mergeClassTokens } from './front-matter';
import { buildDeckRender, type DeckRender, type ExtraTheme } from './share-export';

type Paper = 'auto' | 'letter' | 'legal' | 'a4';
type Orient = 'auto' | 'landscape' | 'portrait';
type Color = 'color' | 'bw';
type Opts = { paper: Paper; orientation: Orient; color: Color };

const SHEET_LABEL: Record<Exclude<Paper, 'auto'>, string> = { letter: 'US Letter', legal: 'US Legal', a4: 'A4' };

function isIOSLike(): boolean {
	if (typeof navigator === 'undefined') return false;
	const ua = navigator.userAgent || '';
	// iPadOS 13+ reports as Mac; disambiguate with touch points.
	return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);
}

// Desktop print: mount the print-ready HTML in a hidden iframe and call its print().
// HTML-in-iframe printing RELIABLY opens the browser's print dialog — unlike a PDF blob
// in an iframe, which Chrome routinely refuses to print programmatically. Desktop honors
// CSS `@page`, so the vector deck prints one-slide-per-page at the chosen paper, crisp.
function printHtmlDoc(doc: string): void {
	const frame = document.createElement('iframe');
	frame.setAttribute('aria-hidden', 'true');
	// Off-screen at a real size (not 0×0/hidden) so fonts + layout actually render before
	// print; the @media print rules (not the on-screen size) drive the printed output.
	frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1024px;height:720px;border:0;';
	frame.srcdoc = doc;
	const reclaim = () => setTimeout(() => { try { frame.remove(); } catch { /* noop */ } }, 1000);
	frame.onload = () => {
		try {
			frame.contentWindow?.focus();
			frame.contentWindow?.addEventListener('afterprint', reclaim);
			// A beat for the FIT agent + web fonts to settle before the dialog captures the page.
			setTimeout(() => { try { frame.contentWindow?.print(); } catch { /* noop */ } }, 450);
		} catch { /* noop */ }
	};
	document.body.appendChild(frame);
	setTimeout(reclaim, 60_000); // safety reclaim if afterprint never fires
}

export function PrintOptionsPanel({
	options,
	source,
	name,
	palette,
	mode,
	extraTheme,
	extraCss,
	onBack,
	notify,
}: {
	options: SingleSlideOptions;
	source: string;
	name: string;
	palette: string;
	mode: 'light' | 'dark';
	extraTheme?: ExtraTheme;
	extraCss?: string;
	onBack: () => void;
	notify: (msg: string) => void;
}) {
	const [opts, setOpts] = React.useState<Opts>({ paper: 'auto', orientation: 'auto', color: 'color' });
	const [render, setRender] = React.useState<DeckRender | null>(null);
	const [sections, setSections] = React.useState<string[]>([]);
	const [slide, setSlide] = React.useState(0);
	const [status, setStatus] = React.useState('Rendering the deck…');
	// `rendering` = the deck is (re-)rendering (colour / source / theme change); readiness
	// drops the instant any render input changes so a stale preview is never treated fresh.
	const [rendering, setRendering] = React.useState(true);
	// Which action (if any) is mid-build — the button spinner + a re-entrancy guard.
	const [building, setBuilding] = React.useState<'print' | 'download' | null>(null);
	// The one built PDF, keyed by the exact inputs that change its bytes (the render identity
	// carries colour/theme; paper + orientation set the sheet). Kept in STATE so the iOS
	// button can flip to "Open PDF" the moment a build for the current settings exists; a
	// click reuses it when the key still matches, else rebuilds. Cleared implicitly by the
	// key check when any setting changes.
	const [builtPdf, setBuiltPdf] = React.useState<{ render: DeckRender; paper: Paper; orientation: Orient; url: string } | null>(null);
	// Platform is stable per device; decide the print path once.
	const ios = React.useMemo(() => isIOSLike(), []);

	const mountedRef = React.useRef(true);
	const builtUrlRef = React.useRef<string | null>(null);
	React.useEffect(() => { builtUrlRef.current = builtPdf?.url ?? null; }, [builtPdf]);
	React.useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
			if (builtUrlRef.current) { try { URL.revokeObjectURL(builtUrlRef.current); } catch { /* noop */ } }
		};
	}, []);

	// Measure the preview stage so the sheet fits it in BOTH dimensions (a wide landscape
	// sheet must not overflow the narrow drawer — height alone would blow past the width).
	const stageRef = React.useRef<HTMLDivElement>(null);
	const [box, setBox] = React.useState({ w: 0, h: 0 });
	React.useEffect(() => {
		const el = stageRef.current;
		if (!el || typeof ResizeObserver === 'undefined') return;
		const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
		const ro = new ResizeObserver(measure);
		ro.observe(el);
		measure();
		return () => ro.disconnect();
	}, []);

	// ── Render the deck whenever the colour changes (B&W remaps class tokens). This is the
	// only re-render; paper/orientation just re-fit the SAME render via the CSS math below. ──
	React.useEffect(() => {
		let alive = true;
		setRendering(true);
		setStatus('Rendering the deck…');
		const src = opts.color === 'bw' ? mergeClassTokens(source, 'print') : source;
		buildDeckRender(options, src, palette, mode, extraTheme, extraCss)
			.then((r) => {
				if (!alive) return;
				setRender(r);
				setSections(splitSections(r.html));
				setRendering(false);
			})
			.catch(() => { if (alive) { setStatus('Could not render the deck.'); setRendering(false); } });
		return () => { alive = false; };
	}, [options, source, palette, mode, extraTheme, extraCss, opts.color]);

	const gw = render?.geom?.w || 1280;
	const gh = render?.geom?.h || 720;
	const sheet = resolvePrintSheet(gw, gh, opts);
	const place = fitSlideOnSheet(gw, gh, sheet.pageW, sheet.pageH, 'page');
	// fit-rect as % of the sheet element (resolution-independent — no pixel measuring)
	const rect = {
		left: (place.x / sheet.pageW) * 100,
		top: (place.y / sheet.pageH) * 100,
		width: (place.w / sheet.pageW) * 100,
		height: (place.h / sheet.pageH) * 100,
	};
	const marginX = ((9 / 25.4) / (sheet.pageW / 96)) * 100; // 9mm as % of sheet width
	const marginY = ((9 / 25.4) / (sheet.pageH / 96)) * 100;
	const dims = `${SHEET_LABEL[sheet.paper as Exclude<Paper, 'auto'>]} · ${sheet.orientation} · ${Math.round((sheet.pageW / 96) * 72)} × ${Math.round((sheet.pageH / 96) * 72)} pt`;
	// Sheet pixel size: the largest sheet-aspect rect that fits the measured stage box.
	const aspect = sheet.pageW / sheet.pageH;
	const availW = box.w ? Math.max(60, box.w - 20) : 300;
	const availH = box.h ? Math.max(60, box.h - 20) : 170;
	const sheetH = Math.min(availH, availW / aspect);
	const sheetPx = { width: `${Math.round(sheetH * aspect)}px`, height: `${Math.round(sheetH)}px` };

	// The current slide as a self-contained preview document (screen, not print rules).
	const previewDoc = React.useMemo(() => {
		if (!render || !sections.length) return '';
		const i = Math.min(slide, sections.length - 1);
		return buildSrcdoc({
			// Re-wrap the single section in `.lattice` — splitSections returns a BARE
			// <section>, but the theme's `.lattice > section` rules need that parent.
			html: `<div class="lattice">${sections[i]}</div>`, css: render.css, mode: render.mode, geom: render.geom,
			runtimeUrl: render.runtimeUrl, fontCss: render.fontCss,
			...(render.mermaidUrl ? { mermaidUrl: render.mermaidUrl } : {}),
			// padding 0 + white ground so the slide fills the frame edge-to-edge (no dark
			// letterbox); center so the FIT-scaled slide sits flush. The frame is sized to
			// the slide's fit-rect, so there is nothing to scroll.
			padding: 0, background: (() => '#ffffff') as unknown as null, center: true,
			contentVisibility: false, cursor: false, sync: false, printRules: false,
		});
	}, [render, sections, slide]);

	const { paper, orientation } = opts;
	// Does the built PDF match the CURRENT settings? Drives the iOS button (build vs open).
	const cachedForCurrent = !!builtPdf && builtPdf.render === render && builtPdf.paper === paper && builtPdf.orientation === orientation;

	// Build the per-slide PDF for the current settings, or return the cached one when the
	// key still matches. The ONLY place rasterization happens — driven by a click, not a
	// config change — and only ever in the FOREGROUND (no tab is open during the build, so
	// the rasterizer never freezes). Revokes a superseded URL after a grace period (a tab
	// opened from it may still be loading — revoking the string won't unload a loaded blob).
	const buildPdf = React.useCallback(async (): Promise<string> => {
		if (!render) throw new Error('deck not ready');
		if (builtPdf && builtPdf.render === render && builtPdf.paper === paper && builtPdf.orientation === orientation) return builtPdf.url;
		const s = resolvePrintSheet(render.geom.w, render.geom.h, { paper, orientation });
		const ex = await import('@/playground/drawing-board-export.js');
		const blob = await ex.renderPdfBlob(render, name, (m: string) => { if (mountedRef.current) setStatus(m); }, { deck: name, engine: 'lattice' }, { sheet: { pageW: s.pageW, pageH: s.pageH } });
		const url = URL.createObjectURL(blob);
		const prevUrl = builtPdf?.url;
		if (prevUrl && prevUrl !== url) { setTimeout(() => { try { URL.revokeObjectURL(prevUrl); } catch { /* noop */ } }, 60_000); }
		if (mountedRef.current) setBuiltPdf({ render, paper, orientation, url });
		return url;
	}, [render, name, paper, orientation, builtPdf]);

	const triggerDownload = React.useCallback((url: string) => {
		const a = document.createElement('a');
		a.href = url;
		a.download = `${(name || 'deck').trim().replace(/[^\w.-]+/g, '-') || 'deck'}.pdf`;
		document.body.appendChild(a);
		a.click();
		a.remove();
	}, [name]);

	// The print-ready HTML (vector deck, one slide per page at the chosen paper) for the
	// DESKTOP print path — desktop honors CSS @page, so this prints crisp + correct.
	const printDoc = React.useCallback((): string => {
		if (!render) return '';
		return buildSrcdoc({
			html: render.html, css: render.css, mode: render.mode, geom: render.geom,
			runtimeUrl: render.runtimeUrl, fontCss: render.fontCss,
			...(render.mermaidUrl ? { mermaidUrl: render.mermaidUrl } : {}),
			printRules: true,
			printOpts: { paper: opts.paper, orientation: opts.orientation, fit: 'page' },
			contentVisibility: false, cursor: false, sync: false,
		});
	}, [render, opts.paper, opts.orientation]);

	const doDownload = React.useCallback(async () => {
		if (!render || building) return;
		setBuilding('download');
		try {
			triggerDownload(await buildPdf());
		} catch {
			notify('Could not build the PDF.');
		} finally {
			if (mountedRef.current) { setBuilding(null); setStatus(''); }
		}
	}, [render, building, buildPdf, triggerDownload, notify]);

	// Open the cached PDF in a new tab, synchronously inside the click (never pop-up-blocked
	// because nothing awaits first). iOS shows the PDF with the native Share → Print. If a
	// blocker still nulls the open, DOWNLOAD instead — never navigate the Studio away.
	const openPdfTab = React.useCallback((url: string) => {
		const w = window.open(url, '_blank');
		if (!w) { triggerDownload(url); notify('Pop-up blocked — the PDF was saved. Open it, then Share → Print.'); }
	}, [triggerDownload, notify]);

	const doPrint = React.useCallback(() => {
		if (!render || building) return;
		if (!ios) {
			// Desktop: print the vector deck via a hidden HTML iframe → reliable dialog, no PDF.
			printHtmlDoc(printDoc());
			return;
		}
		// iOS, tap 2 — the PDF for these settings is already built: open it in-gesture.
		if (cachedForCurrent && builtPdf) { openPdfTab(builtPdf.url); return; }
		// iOS, tap 1 — build the PDF in the FOREGROUND (no tab open → no freeze). When it
		// lands, `cachedForCurrent` flips true and the button arms to "Open PDF" for tap 2.
		setBuilding('print');
		buildPdf()
			.then(() => { if (mountedRef.current) notify('PDF ready — tap “Open PDF” to print.'); })
			.catch(() => notify('Could not build the PDF.'))
			.finally(() => { if (mountedRef.current) { setBuilding(null); setStatus(''); } });
	}, [render, building, ios, cachedForCurrent, builtPdf, printDoc, buildPdf, openPdfTab, notify]);

	// A fresh render (no re-render in flight) is all either action needs to START — the PDF
	// is built on click, not up front. Both drop the instant a colour change begins.
	const ready = !!render && !!sections.length && !rendering;
	// iOS Print is a two-step affordance: build (tap 1) → open (tap 2, once armed).
	const printReadyToOpen = ios && cachedForCurrent;
	const count = sections.length || 1;
	const seg = <K extends keyof Opts>(k: K, v: Opts[K]) => () => setOpts((o) => ({ ...o, [k]: v }));

	return (
		<div className="space-y-5">
			{/* biome-ignore lint/security/noDangerouslySetInnerHtml: static, self-authored panel CSS (no user data). */}
			<style dangerouslySetInnerHTML={{ __html: STYLE }} />
			<button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground hover:text-[var(--text-heading)] disabled:opacity-50">
				<ArrowLeft className="size-3.5" />All formats
			</button>

			<section className="space-y-1">
				<h3 className="text-[15px] font-semibold text-[var(--text-heading)]">Print deck</h3>
				<p className="text-[12px] text-muted-foreground">Every slide is scaled to fit its page, centered — never cropped. The PDF is built when you print or download.</p>
			</section>

			{/* Preview — the beloved navy stage + white sheet + dashed safe margin, compact. */}
			<div className="pod-stage" ref={stageRef}>
				{render && sections.length ? (
					<div className="pod-sheet" style={sheetPx}>
						<iframe title="Print preview" className="pod-frame" scrolling="no" srcDoc={previewDoc} style={{ left: `${rect.left}%`, top: `${rect.top}%`, width: `${rect.width}%`, height: `${rect.height}%` }} />
						<span className="pod-safe" style={{ inset: `${marginY}% ${marginX}%` }} />
					</div>
				) : (
					<div className="pod-prep"><div className="pod-bar"><i /></div></div>
				)}
			</div>
			<div className="pod-pager">
				<button type="button" onClick={() => setSlide((n) => (n + count - 1) % count)} aria-label="Previous slide" disabled={!render}>‹</button>
				<span>Slide {Math.min(slide, count - 1) + 1} / {count}</span>
				<button type="button" onClick={() => setSlide((n) => (n + 1) % count)} aria-label="Next slide" disabled={!render}>›</button>
				<span className="pod-dims">{dims}</span>
			</div>

			<div className="space-y-4">
				<Field label="Paper size" hint="Auto = least-wasteful fit">
					<Seg opts={[['auto', 'Auto'], ['letter', 'Letter'], ['legal', 'Legal'], ['a4', 'A4']]} value={opts.paper} onPick={(v) => seg('paper', v as Paper)()} />
				</Field>
				<Field label="Orientation" hint="Auto follows the deck">
					<Seg opts={[['auto', 'Auto'], ['landscape', 'Landscape'], ['portrait', 'Portrait']]} value={opts.orientation} onPick={(v) => seg('orientation', v as Orient)()} />
				</Field>
				<Field label="Color" hint="B&W is toner-safe">
					<Seg opts={[['color', 'Color'], ['bw', 'Black & white']]} value={opts.color} onPick={(v) => seg('color', v as Color)()} />
				</Field>
			</div>

			<div className="space-y-2.5">
				<button type="button" className="pod-btn pod-primary" disabled={!ready || !!building} onClick={doPrint}>
					{rendering || building === 'print' ? <Loader2 className="size-4 animate-spin" /> : printReadyToOpen ? <ExternalLink className="size-4" /> : <Printer className="size-4" />}
					{building === 'print' ? status || 'Preparing print…' : rendering ? 'Rendering…' : printReadyToOpen ? 'Open PDF to print' : 'Print'}
				</button>
				<button type="button" className="pod-btn pod-ghost" disabled={!ready || !!building} onClick={doDownload}>
					{building === 'download' ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
					{building === 'download' ? status || 'Building PDF…' : 'Download PDF'}
				</button>
				<p className="pod-plat"><span className="pod-dot">●</span> {ios ? 'On iPhone: tap Print to prepare the PDF, then Open — then tap Share → Print.' : 'Opens the print dialog on desktop.'}</p>
			</div>
		</div>
	);
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
	return (
		<div className="space-y-2">
			<div className="flex items-baseline justify-between gap-2">
				<span className="text-[12.5px] font-semibold text-[var(--text-heading)]">{label}</span>
				{hint && <span className="text-[10.5px] text-muted-foreground">{hint}</span>}
			</div>
			{children}
		</div>
	);
}

function Seg({ opts, value, onPick }: { opts: [string, string][]; value: string; onPick: (v: string) => void }) {
	return (
		<div className="pod-seg" role="radiogroup">
			{opts.map(([v, l]) => (
				// biome-ignore lint/a11y/useSemanticElements: segmented control — buttons in a radiogroup.
				<button type="button" key={v} role="radio" aria-checked={value === v} onClick={() => onPick(v)}>{l}</button>
			))}
		</div>
	);
}

// Scoped to the drawer. The preview stage + segmented controls carry the Print page's
// brass-on-navy identity; `var(--accent)` resolves to the Studio's brass, so the drawer
// matches both the tab it replaces AND the rest of the Share sheet. Colors that are a
// presentation SURFACE (the navy stage, the white paper) are literal, exactly as the
// tab page's scoped CSS was — docs/src component styles are outside the layout hex gate.
const STYLE = `
.pod-stage{position:relative;height:180px;border-radius:12px;padding:16px;display:grid;place-items:center;overflow:hidden;background:radial-gradient(120% 90% at 50% -10%,color-mix(in srgb,var(--accent) 10%,transparent),transparent 60%),#0b1c33;box-shadow:inset 0 0 0 1px color-mix(in srgb,#ffffff 6%,transparent);}
.pod-sheet{background:#fff;box-shadow:0 14px 38px -12px rgba(0,0,0,.6);border-radius:3px;position:relative;max-width:100%;max-height:100%;outline:1px solid rgba(0,0,0,.06);transition:width .3s ease,height .3s ease;}
.pod-frame{position:absolute;border:0;background:#fff;border-radius:2px;overflow:hidden;box-shadow:0 5px 14px -8px rgba(20,35,56,.35);transition:left .3s,top .3s,width .3s,height .3s;}
.pod-safe{position:absolute;border:1px dashed color-mix(in srgb,#142338 24%,transparent);border-radius:2px;pointer-events:none;}
.pod-prep{width:70%;display:grid;place-items:center;}
.pod-bar{width:100%;max-width:190px;height:4px;border-radius:4px;background:color-mix(in srgb,#ffffff 12%,transparent);overflow:hidden;}
.pod-bar i{display:block;height:100%;width:30%;background:var(--accent);border-radius:4px;animation:podslide 1.1s ease-in-out infinite;}
@keyframes podslide{0%{transform:translateX(-120%);}100%{transform:translateX(430%);}}
.pod-pager{display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:6px 12px;color:var(--muted-foreground);font-family:ui-monospace,'SF Mono',Menlo,monospace;font-size:11px;}
.pod-pager>span{white-space:nowrap;}
.pod-pager button{border:1px solid var(--border);background:var(--card);color:var(--muted-foreground);width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:14px;line-height:1;}
.pod-pager button:not(:disabled):hover{border-color:var(--accent);color:var(--text-heading);}
.pod-pager button:disabled{opacity:.5;cursor:default;}
.pod-dims{color:var(--muted-foreground);}
.pod-seg{display:inline-flex;width:100%;border:1px solid var(--border);border-radius:8px;overflow:hidden;background:var(--card);}
.pod-seg button{flex:1;border:0;background:transparent;color:var(--muted-foreground);padding:7px 4px;font:inherit;font-size:12px;font-weight:600;cursor:pointer;border-left:1px solid var(--border);}
.pod-seg button:first-child{border-left:0;}
.pod-seg button[aria-checked="true"]{background:var(--accent);color:var(--on-accent,#fff);}
.pod-seg button:not([aria-checked="true"]):hover{color:var(--text-heading);background:var(--accent-soft);}
.pod-seg button:focus-visible{outline:2px solid var(--accent);outline-offset:-2px;}
.pod-btn{width:100%;border:1px solid transparent;border-radius:10px;cursor:pointer;font:inherit;font-weight:650;font-size:13.5px;padding:12px 14px;display:inline-flex;align-items:center;justify-content:center;gap:9px;}
.pod-btn:disabled{opacity:.55;cursor:default;}
.pod-primary{background:var(--accent);color:var(--on-accent,#fff);}
.pod-primary:not(:disabled):hover{filter:brightness(1.06);}
.pod-ghost{background:transparent;color:var(--text-heading);border-color:var(--border);}
.pod-ghost:not(:disabled):hover{border-color:var(--accent);background:var(--accent-soft);}
.pod-btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px;}
.pod-plat{font-size:10.5px;color:var(--muted-foreground);text-align:center;line-height:1.5;}
.pod-dot{color:#4bbd8b;}
@media(prefers-reduced-motion:reduce){.pod-bar i{animation:none;width:100%;}.pod-sheet,.pod-frame{transition:none;}}
`;
