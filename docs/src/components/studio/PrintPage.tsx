// The Print page — a dedicated on-brand tab the Studio opens for "Print deck".
//
// Why a whole page (not a pop-up the opener fills): the render + PDF build must run in
// a FOREGROUND tab. Opening a tab marks the opener `document.hidden`, which pauses rAF
// and stalls html-to-image — so if the Studio built the PDF after opening a tab it would
// freeze. Here the print TAB does the work itself: the Studio opens this route in-gesture
// (no pop-up block), hands off the deck source + options over a postMessage handshake
// (mirrors presenter-window.js; trust rides on `e.source === opener`), and this page
// renders the preview and builds the PDF in its own foreground context. Fit is removed:
// the slide is ALWAYS scaled to fit, centered, never cropped.
// See engineering/decisions/2026-06-14-deck-print-styling.md § "the Print page".

import * as React from 'react';
import type { SingleSlideOptions } from '@/lib/single-slide-render';
// Engine helpers (shared kernel, HARD RULE #1): the paper decision + slide placement
// + single-slide srcdoc + rendered-HTML splitter all live in the playground engine.
import { buildSrcdoc, fitSlideOnSheet, resolvePrintSheet, splitSections } from '@/playground/deck-preview.js';
import { mergeClassTokens } from './front-matter';
import { LatticeMark } from './LatticeMark';
import { buildDeckRender, type DeckRender } from './share-export';

type Paper = 'auto' | 'letter' | 'legal' | 'a4';
type Orient = 'auto' | 'landscape' | 'portrait';
type Color = 'color' | 'bw';
type Opts = { paper: Paper; orientation: Orient; color: Color };
type Payload = { source: string; palette: string; mode: 'light' | 'dark'; extraTheme?: { name: string; css: string }; extraCss?: string; name: string };

const SHEET_LABEL: Record<Exclude<Paper, 'auto'>, string> = { letter: 'US Letter', legal: 'US Legal', a4: 'A4' };

function isIOSLike(): boolean {
	if (typeof navigator === 'undefined') return false;
	const ua = navigator.userAgent || '';
	// iPadOS 13+ reports as Mac; disambiguate with touch points.
	return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);
}

// Desktop print: mount the print-ready HTML in a hidden iframe and call its print().
// HTML-in-iframe printing RELIABLY opens the browser's print dialog — unlike a PDF blob
// in an iframe, which Chrome routinely refuses to print programmatically (the reported
// "generates the print but no dialog" bug). Desktop honors CSS `@page`, so the vector
// deck prints one-slide-per-page at the chosen paper, crisp. (iOS can't do this — it
// ignores @page — so there we open the real PDF for the native Share → Print instead.)
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

export default function PrintPage({ options }: { options: SingleSlideOptions }) {
	const [payload, setPayload] = React.useState<Payload | null>(null);
	const [opts, setOpts] = React.useState<Opts>({ paper: 'auto', orientation: 'auto', color: 'color' });
	const [render, setRender] = React.useState<DeckRender | null>(null);
	const [sections, setSections] = React.useState<string[]>([]);
	const [slide, setSlide] = React.useState(0);
	const [status, setStatus] = React.useState('Waiting for the deck…');
	const [busy, setBusy] = React.useState(false);
	const [noOpener, setNoOpener] = React.useState(false);
	const autoPrinted = React.useRef(false);
	// Measure the stage so the sheet fits it in BOTH dimensions (a wide landscape sheet
	// must not overflow a narrow phone — height alone would blow past the viewport width).
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

	// ── 1. Handshake: announce ready, receive the deck (trust only the opener). ──
	const lastSig = React.useRef('');
	React.useEffect(() => {
		function onMsg(e: MessageEvent) {
			// Same-origin only (opener is our Studio); + the exact opener handle.
			if (e.origin !== window.location.origin || e.source !== window.opener) return;
			const d = e.data as { __latticePrint?: string } & Partial<Payload>;
			if (!d || d.__latticePrint !== 'init') return;
			// Dedupe: the opener may push the same deck twice (fresh reply + proactive
			// post); only (re-)render when the deck actually changed — so a reused tab
			// re-renders for a NEW/edited deck but a duplicate is ignored.
			const sig = JSON.stringify([d.source, d.palette, d.mode, d.name, d.extraCss, d.extraTheme?.css]);
			if (sig === lastSig.current) return;
			lastSig.current = sig;
			setPayload({ source: d.source || '', palette: d.palette || 'indaco', mode: d.mode === 'dark' ? 'dark' : 'light', extraTheme: d.extraTheme, extraCss: d.extraCss, name: d.name || 'deck' });
		}
		window.addEventListener('message', onMsg);
		try {
			window.opener?.postMessage({ __latticePrint: 'ready' }, window.location.origin);
		} catch { /* opener gone */ }
		// Opened directly (no Studio opener) → nothing will arrive; tell the user.
		if (!window.opener) setNoOpener(true);
		return () => window.removeEventListener('message', onMsg);
	}, []);

	// ── 2. Render the deck whenever the payload or colour changes. ──
	React.useEffect(() => {
		if (!payload) return;
		let alive = true;
		setStatus('Rendering the deck…');
		const src = opts.color === 'bw' ? mergeClassTokens(payload.source, 'print') : payload.source;
		buildDeckRender(options, src, payload.palette, payload.mode, payload.extraTheme, payload.extraCss)
			.then((r) => {
				if (!alive) return;
				setRender(r);
				setSections(splitSections(r.html));
				setStatus('');
			})
			.catch(() => { if (alive) setStatus('Could not render the deck. Close this tab and try again.'); });
		return () => { alive = false; };
	}, [payload, opts.color, options]);

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
	// Sheet pixel size: the largest sheet-aspect rect that fits the measured stage box,
	// leaving room for the pager below. Falls back to a sane default before the first measure.
	const aspect = sheet.pageW / sheet.pageH;
	const availW = box.w ? Math.max(60, box.w - 24) : 320;
	const availH = box.h ? Math.max(60, box.h - 24 - 52) : 240;
	const sheetH = Math.min(availH, availW / aspect);
	const sheetPx = { width: `${Math.round(sheetH * aspect)}px`, height: `${Math.round(sheetH)}px` };

	// The current slide as a self-contained preview document (screen, not print rules).
	const previewDoc = React.useMemo(() => {
		if (!render || !sections.length) return '';
		const i = Math.min(slide, sections.length - 1);
		return buildSrcdoc({
			// Re-wrap the single section in `.lattice` — splitSections returns a BARE
			// <section>, but the theme's `.lattice > section` rules (cover/divider
			// backgrounds, the whole visual contract) need that parent to apply.
			html: `<div class="lattice">${sections[i]}</div>`, css: render.css, mode: render.mode, geom: render.geom,
			runtimeUrl: render.runtimeUrl, fontCss: render.fontCss,
			...(render.mermaidUrl ? { mermaidUrl: render.mermaidUrl } : {}),
			// padding 0 + white ground so the slide fills the frame edge-to-edge (no dark
			// letterbox band); center so the FIT-scaled slide sits flush. The frame itself
			// is sized to the slide's 16:9 fit-rect, so there's nothing to scroll.
			padding: 0, background: (() => '#ffffff') as unknown as null, center: true,
			contentVisibility: false, cursor: false, sync: false, printRules: false,
		});
	}, [render, sections, slide]);

	// ── 3. Build the PDF (foreground → no freeze) — for Download (both platforms) and
	// for iOS Print (where CSS @page is ignored, so only a real PDF prints right). ──
	const buildPdf = React.useCallback(async (): Promise<string> => {
		if (!render || !payload) throw new Error('not ready');
		const s = resolvePrintSheet(render.geom.w, render.geom.h, opts);
		const ex = await import('@/playground/drawing-board-export.js');
		const blob = await ex.renderPdfBlob(render, payload.name, (m: string) => setStatus(m), { deck: payload.name, engine: 'lattice' }, { sheet: { pageW: s.pageW, pageH: s.pageH } });
		return URL.createObjectURL(blob);
	}, [render, payload, opts]);

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
	}, [render, opts]);

	const doPrint = React.useCallback(async () => {
		if (!render) return;
		if (isIOSLike()) {
			// iOS: show the real PDF (only a real PDF prints right — iOS ignores @page); the
			// native viewer's Share → Print does the print. Building the PDF is async, so a
			// new-tab open would be pop-up-blocked (the tap's activation expired mid-render) —
			// that's the "builds but nothing opens" bug. So try a new tab, and if it's blocked
			// NAVIGATE this tab to the PDF instead (navigation isn't activation-gated). The
			// deck source lives with the Studio opener, so returning is a back-tap away.
			if (busy) return;
			setBusy(true);
			try {
				const url = await buildPdf();
				setStatus('');
				const w = window.open(url, '_blank');
				if (!w) {
					window.location.href = url; // pop-up blocked → view the PDF here
					return; // page unloads; leave the blob for the viewer
				}
				setTimeout(() => { try { URL.revokeObjectURL(url); } catch { /* noop */ } }, 60_000);
			} catch {
				setStatus('Could not open the PDF.');
			} finally {
				setBusy(false);
			}
		} else {
			// Desktop: print the vector deck via a hidden HTML iframe → reliable print dialog.
			printHtmlDoc(printDoc());
		}
	}, [busy, render, buildPdf, printDoc]);

	const doDownload = React.useCallback(async () => {
		if (busy || !render || !payload) return;
		setBusy(true);
		try {
			const url = await buildPdf();
			setStatus('');
			const a = document.createElement('a');
			a.href = url;
			a.download = `${(payload.name || 'deck').trim().replace(/[^\w.-]+/g, '-') || 'deck'}.pdf`;
			document.body.appendChild(a);
			a.click();
			a.remove();
			setTimeout(() => { try { URL.revokeObjectURL(url); } catch { /* noop */ } }, 60_000);
		} catch {
			setStatus('Could not build the PDF.');
		} finally {
			setBusy(false);
		}
	}, [busy, render, payload, buildPdf]);

	// ── 4. Auto-print once on desktop when the deck first becomes ready. ──
	// biome-ignore lint/correctness/useExhaustiveDependencies: fire exactly once on first render; busy/doPrint are read fresh and must NOT re-trigger.
	React.useEffect(() => {
		if (autoPrinted.current || !render || busy || isIOSLike()) return;
		autoPrinted.current = true;
		doPrint();
	}, [render]);

	const ready = !!render && !!sections.length;
	const count = sections.length || 1;
	const seg = <K extends keyof Opts>(k: K, v: Opts[K]) => () => setOpts((o) => ({ ...o, [k]: v }));

	return (
		<div className="lpr-app">
			{/* biome-ignore lint/security/noDangerouslySetInnerHtml: static, self-authored page CSS (no user data). */}
			<style dangerouslySetInnerHTML={{ __html: STYLE }} />
			<header className="lpr-top">
				<span className="lpr-brand"><LatticeMark mode="dark" className="lpr-mark" /><span className="lpr-name">Lattice</span></span>
				<span className="lpr-sep" />
				<span className="lpr-doc"><span className="lpr-k">Print</span><span className="lpr-t">{payload?.name || 'deck'}</span></span>
				<span className="lpr-spacer" />
				<button type="button" className="lpr-icon" title="Close" aria-label="Close" onClick={() => window.close()}>
					<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
				</button>
			</header>

			<div className="lpr-body">
				<section className="lpr-stage" ref={stageRef}>
					{ready ? (
						<div className="lpr-wrap">
							<div className="lpr-sheet" style={sheetPx}>
								<iframe title="Print preview" className="lpr-frame" scrolling="no" srcDoc={previewDoc} style={{ left: `${rect.left}%`, top: `${rect.top}%`, width: `${rect.width}%`, height: `${rect.height}%` }} />
								<span className="lpr-safe" style={{ inset: `${marginY}% ${marginX}%` }} />
							</div>
							<div className="lpr-pager">
								<button type="button" onClick={() => setSlide((n) => (n + count - 1) % count)} aria-label="Previous slide">‹</button>
								<span>Slide {Math.min(slide, count - 1) + 1} / {count}</span>
								<button type="button" onClick={() => setSlide((n) => (n + 1) % count)} aria-label="Next slide">›</button>
								<span className="lpr-dims">{dims}</span>
							</div>
						</div>
					) : (
						<div className="lpr-prep">
							<div className="lpr-lbl">{noOpener ? 'Open “Print deck” from the Studio' : status || 'Preparing…'}</div>
							{!noOpener && <div className="lpr-bar"><i /></div>}
						</div>
					)}
				</section>

				<aside className="lpr-rail">
					<div className="lpr-scroll">
						<Field label="Paper size" hint="Auto = least-wasteful fit">
							<Seg opts={[['auto', 'Auto'], ['letter', 'Letter'], ['legal', 'Legal'], ['a4', 'A4']]} value={opts.paper} onPick={(v) => seg('paper', v as Paper)()} />
						</Field>
						<Field label="Orientation" hint="Auto follows the deck">
							<Seg opts={[['auto', 'Auto'], ['landscape', 'Landscape'], ['portrait', 'Portrait']]} value={opts.orientation} onPick={(v) => seg('orientation', v as Orient)()} />
						</Field>
						<Field label="Color" hint="B&W is toner-safe">
							<Seg opts={[['color', 'Color'], ['bw', 'Black & white']]} value={opts.color} onPick={(v) => seg('color', v as Color)()} />
						</Field>
						<p className="lpr-note">Every slide is <b>scaled to fit its page, centered — never cropped</b>. The PDF is built when you print or download, one slide per page.</p>
					</div>
					<div className="lpr-actions">
						<button type="button" className="lpr-btn lpr-primary" disabled={!ready || busy} onClick={doPrint}>
							{busy ? <Spinner /> : <PrinterIcon />}
							{busy ? status || 'Building the PDF…' : 'Print'}
						</button>
						<button type="button" className="lpr-btn lpr-ghost" disabled={!ready || busy} onClick={doDownload}>
							<DownloadIcon />Download PDF
						</button>
						<p className="lpr-plat"><span className="lpr-dot">●</span> Opens the print dialog automatically on desktop. On iPhone the PDF opens — tap Share, then Print.</p>
					</div>
				</aside>
			</div>
		</div>
	);
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
	return (
		<div className="lpr-field">
			<div className="lpr-head"><span className="lpr-flbl">{label}</span>{hint && <span className="lpr-hint">{hint}</span>}</div>
			{children}
		</div>
	);
}

function Seg({ opts, value, onPick }: { opts: [string, string][]; value: string; onPick: (v: string) => void }) {
	return (
		<div className="lpr-seg" role="radiogroup">
			{opts.map(([v, l]) => (
				// biome-ignore lint/a11y/useSemanticElements: segmented control — buttons in a radiogroup.
				<button type="button" key={v} role="radio" aria-checked={value === v} onClick={() => onPick(v)}>{l}</button>
			))}
		</div>
	);
}

const Spinner = () => <svg aria-hidden="true" className="lpr-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 3a9 9 0 1 0 9 9" /></svg>;
const PrinterIcon = () => <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" /><path d="M6 14h12v8H6z" /></svg>;
const DownloadIcon = () => <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>;

const STYLE = `
.lpr-app{--g:#0b1c33;--surf:#10264494;--rail:#0e2141;--ink:#eaf0f8;--dim:#b7c6dc;--muted:#7f96b6;--accent:#d0a94f;--acink:#1a1205;--line:#24406b;--soft:#1b3358;--paper:#fff;--good:#4bbd8b;--serif:Georgia,'Iowan Old Style',ui-serif,serif;--sans:system-ui,-apple-system,'Segoe UI',sans-serif;--mono:ui-monospace,'SF Mono',Menlo,monospace;
min-height:100vh;display:grid;grid-template-rows:auto 1fr;grid-template-columns:minmax(0,1fr);background:var(--g);color:var(--ink);font-family:var(--sans);overflow-x:clip;-webkit-font-smoothing:antialiased;}
:root[data-mode="light"] .lpr-app,:root[data-palette] .lpr-app{}
.lpr-top{display:flex;align-items:center;gap:14px;padding:14px 20px;border-bottom:1px solid var(--soft);position:sticky;top:0;z-index:6;background:var(--g);}
.lpr-brand{display:flex;align-items:center;gap:10px;}
.lpr-mark{width:28px;height:28px;flex:0 0 auto;}
.lpr-name{font-family:var(--serif);font-size:17px;}
.lpr-sep{width:1px;height:22px;background:var(--line);}
.lpr-doc{display:flex;align-items:baseline;gap:8px;min-width:0;flex:0 1 auto;overflow:hidden;}
.lpr-k{font-family:var(--mono);font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);}
.lpr-t{font-family:var(--serif);font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.lpr-spacer{flex:1;}
.lpr-icon{border:1px solid var(--line);background:transparent;color:var(--dim);width:34px;height:34px;border-radius:8px;cursor:pointer;display:grid;place-items:center;}
.lpr-icon:hover{background:var(--surf);color:var(--ink);border-color:var(--accent);}
.lpr-body{display:grid;grid-template-columns:minmax(0,1fr) 336px;min-height:0;overflow:hidden;}
/* Mobile: the page SCROLLS (so the actions are always reachable). The app becomes the
   scroll container, the stage takes a fixed slice, controls flow below, and the action
   bar is pinned to the bottom of the viewport so Print/Download never scroll out of reach. */
@media(max-width:860px){
  .lpr-app{height:100dvh;overflow-y:auto;grid-template-rows:auto auto;}
  .lpr-body{display:block;overflow:visible;}
  .lpr-stage{height:44vh;}
  .lpr-rail{display:block;}
  .lpr-scroll{overflow:visible;}
  .lpr-actions{position:sticky;bottom:0;z-index:5;}
}
.lpr-stage{position:relative;min-height:0;min-width:0;padding:30px;display:grid;place-items:center;background:radial-gradient(120% 90% at 50% -10%,color-mix(in srgb,var(--accent) 8%,transparent),transparent 60%),var(--g);overflow:hidden;}
@media(max-width:860px){.lpr-stage{padding:16px;}}
.lpr-wrap{display:flex;flex-direction:column;align-items:center;gap:16px;max-width:100%;max-height:100%;}
.lpr-sheet{background:var(--paper);box-shadow:0 18px 50px -12px rgba(0,0,0,.55);border-radius:3px;position:relative;max-width:100%;max-height:100%;outline:1px solid rgba(0,0,0,.05);transition:width .3s ease,height .3s ease;}
.lpr-frame{position:absolute;border:0;background:#fff;border-radius:2px;overflow:hidden;box-shadow:0 6px 18px -8px rgba(20,35,56,.35);transition:left .3s,top .3s,width .3s,height .3s;}
.lpr-safe{position:absolute;border:1px dashed color-mix(in srgb,#142338 22%,transparent);border-radius:2px;pointer-events:none;}
.lpr-pager{display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:6px 12px;padding:0 10px;color:var(--muted);font-family:var(--mono);font-size:11px;}
.lpr-pager>span{white-space:nowrap;}
.lpr-pager button{border:1px solid var(--line);background:var(--surf);color:var(--dim);width:30px;height:30px;border-radius:50%;cursor:pointer;font-size:14px;}
.lpr-pager button:hover{border-color:var(--accent);color:var(--ink);}
.lpr-dims{color:var(--dim);}
.lpr-prep{text-align:center;}
.lpr-lbl{font-family:var(--mono);font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);}
.lpr-bar{width:190px;height:4px;border-radius:4px;background:var(--soft);overflow:hidden;margin:14px auto 0;}
.lpr-bar i{display:block;height:100%;width:30%;background:var(--accent);border-radius:4px;animation:lprslide 1.1s ease-in-out infinite;}
@keyframes lprslide{0%{transform:translateX(-120%);}100%{transform:translateX(430%);}}
@media(prefers-reduced-motion:reduce){.lpr-bar i{animation:none;width:100%;}.lpr-sheet,.lpr-frame{transition:none;}}
.lpr-rail{border-left:1px solid var(--soft);background:var(--rail);display:flex;flex-direction:column;min-height:0;min-width:0;}
@media(max-width:860px){.lpr-rail{border-left:0;border-top:1px solid var(--soft);}}
.lpr-scroll{padding:20px;display:flex;flex-direction:column;gap:20px;overflow:auto;}
.lpr-field{display:flex;flex-direction:column;gap:8px;}
.lpr-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;}
.lpr-flbl{font-size:12.5px;font-weight:650;}
.lpr-hint{font-size:10.5px;color:var(--muted);}
.lpr-seg{display:inline-flex;width:100%;border:1px solid var(--line);border-radius:8px;overflow:hidden;background:var(--surf);}
.lpr-seg button{flex:1;border:0;background:transparent;color:var(--dim);padding:7px 4px;font:inherit;font-size:12px;font-weight:600;cursor:pointer;border-left:1px solid var(--soft);}
.lpr-seg button:first-child{border-left:0;}
.lpr-seg button[aria-checked="true"]{background:var(--accent);color:var(--acink);}
.lpr-seg button:not([aria-checked="true"]):hover{color:var(--ink);background:color-mix(in srgb,var(--accent) 12%,transparent);}
.lpr-seg button:focus-visible{outline:2px solid var(--accent);outline-offset:-2px;}
.lpr-note{font-size:11px;line-height:1.5;color:var(--muted);border-left:2px solid var(--line);padding-left:10px;}
.lpr-note b{color:var(--dim);font-weight:650;}
.lpr-actions{border-top:1px solid var(--soft);padding:16px 20px;display:flex;flex-direction:column;gap:10px;background:var(--rail);}
@media(max-width:860px){.lpr-actions{box-shadow:0 -8px 20px -8px rgba(0,0,0,.45);}}
.lpr-btn{border:1px solid transparent;border-radius:8px;cursor:pointer;font:inherit;font-weight:650;font-size:13.5px;padding:12px 14px;display:inline-flex;align-items:center;justify-content:center;gap:9px;}
.lpr-btn:disabled{opacity:.55;cursor:default;}
.lpr-primary{background:var(--accent);color:var(--acink);}
.lpr-primary:not(:disabled):hover{filter:brightness(1.06);}
.lpr-ghost{background:transparent;color:var(--ink);border-color:var(--line);}
.lpr-ghost:not(:disabled):hover{border-color:var(--accent);background:var(--surf);}
.lpr-btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px;}
.lpr-plat{font-size:10.5px;color:var(--muted);text-align:center;line-height:1.5;}
.lpr-dot{color:var(--good);}
.lpr-spin{animation:lprspin .8s linear infinite;}
@keyframes lprspin{to{transform:rotate(360deg);}}
@media(prefers-reduced-motion:reduce){.lpr-spin{animation-duration:2s;}}
`;
