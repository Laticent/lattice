// Live viewport-debug overlay — a small on-screen readout of the viewport geometry
// headless CI can never see: the layout viewport (`innerWidth/Height`), the visual
// viewport (`visualViewport` size + offset), what the CSS units `svh`/`dvh`/`lvh`
// actually resolve to on THIS device, the cinema stage height, and the live preview
// iframe's on-screen rect. Born from the cinema-morph landscape overflow (#1121):
// the only way to finally diagnose a fit/offset/URL-bar bug is to read these numbers
// on the REAL phone (HARD RULE #23 — emulation is not verification).
//
// Mirrors VizDiagnosticsOverlay.tsx / PerfOverlay.tsx: a React island that renders
// NOTHING (and measures nothing) until the shared pref is on (viewport-debug-prefs.ts
// — the Studio switch + the `?vvdebug` param), so a normal page view pays nothing. The
// draggable shell + the enable/singleton gate are the shared diagnostic-overlay chassis
// (diagnostic-overlay.tsx); this file is only the geometry read + the readout body.
// While mounted it polls the geometry (~300ms) and re-reads on every visualViewport
// resize/scroll.

import * as React from 'react';
import { DiagnosticPanel, type OverlayClaim, useDiagnosticGate } from '@/components/diagnostics/diagnostic-overlay';
import {
	applyViewportDebugUrlParam,
	onViewportDebugEnabledChange,
	setViewportDebugEnabled,
	VIEWPORT_DEBUG_AVAILABLE,
	viewportDebugEnabled,
} from '@/playground/viewport-debug-prefs';

// Per-overlay singleton token — a duplicate include of THIS overlay still shows one.
const claim: OverlayClaim = { held: false };

export default function ViewportDebugOverlay() {
	const active = useDiagnosticGate({
		available: VIEWPORT_DEBUG_AVAILABLE,
		isEnabled: viewportDebugEnabled,
		subscribe: onViewportDebugEnabledChange,
		applyUrlParam: applyViewportDebugUrlParam,
		claim,
	});
	if (!active) return null;
	return <Overlay />;
}

type Geom = {
	innerW: number;
	innerH: number;
	vv: { w: number; h: number; ol: number; ot: number } | null;
	svh: number;
	dvh: number;
	lvh: number;
	stageH: number | null;
	frame: { top: number; bottom: number; height: number } | null;
	// The hoisted preview HOST (position:fixed) vs the SLOT it should overlay. The host is
	// positioned from the slot's getBoundingClientRect WITHOUT the visualViewport offset
	// (use-shared-preview-slot.ts), so a keyboard/zoom/panel shift moves it off the slot —
	// the iPad "slide bleeds over the editor / overflows behind the keyboard" bug. This delta
	// is the smoking gun: 0 = tracking, non-0 = mispositioned by that many px.
	slot: { x: number; y: number; w: number; h: number } | null;
	host: { x: number; y: number; w: number; h: number } | null;
};

// host − slot, per edge, and the worst single-edge miss. null when either is absent.
function hostSlotDelta(g: Geom): { dx: number; dy: number; dw: number; dh: number; max: number } | null {
	if (!g.host || !g.slot) return null;
	const dx = g.host.x - g.slot.x;
	const dy = g.host.y - g.slot.y;
	const dw = g.host.w - g.slot.w;
	const dh = g.host.h - g.slot.h;
	return { dx, dy, dw, dh, max: Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dw), Math.abs(dh)) };
}

// ─── Derived relationships — the numbers a viewport debugger is actually FOR ──────────
// Raw geometry is only half the story; the deltas between the properties are what expose a
// bug. These three are the load-bearing ones (keyboard/URL-bar overlap, URL-bar height, and
// whether the slide fits its stage — the #1121 question), surfaced both in the verdict strip
// and inside each row's live "relationship" line.

// How much of the layout viewport the visual viewport no longer covers — the software
// keyboard + any bottom browser UI. 0 on desktop / keyboard-down. (Same formula as
// use-visual-viewport.ts `--cs-kb-inset`.)
function insetPx(g: Geom): number {
	return g.vv ? Math.max(0, g.innerH - g.vv.h - g.vv.ot) : 0;
}
// The browser's retractable URL bar height = the gap between the largest and smallest
// viewport-height units. 0 when the browser has no collapsible chrome (most desktops).
function urlBarPx(g: Geom): number {
	return Math.max(0, g.lvh - g.svh);
}
// Does the preview frame fit inside the cinema stage? top ≥ 0 AND bottom ≤ stage height —
// the exact #1121 overflow check. Returns null when there's no stage (desktop / portrait).
function frameFit(g: Geom): { fits: boolean; over: number; slack: number } | null {
	if (!g.frame || g.stageH == null) return null;
	const over = Math.max(0, g.frame.bottom - g.stageH, -g.frame.top);
	return { fits: over <= 1, over: Math.round(over), slack: Math.round(g.stageH - g.frame.height) };
}

// The metric catalog — one entry per row. `what` is the plain-language definition (the
// hover/tap explanation the user asked for); `rel` is the LIVE relationship to the other
// properties, recomputed each render from the current geometry. Kept in one table so the
// docs live next to the value, not in scattered JSX.
type Metric = { key: string; label: string; value: (g: Geom) => string; what: string; rel: (g: Geom) => string | null };
const METRICS: Metric[] = [
	{
		key: 'inner',
		label: 'inner',
		value: (g) => `${g.innerW} × ${g.innerH}`,
		what: 'The CSS layout viewport — what 100vw/100vh and position:fixed resolve against. It does NOT shrink when the software keyboard opens, which is exactly why a fixed bottom bar hides behind the keyboard.',
		rel: (g) => (g.vv ? `the keyboard / URL bar covers ${insetPx(g)}px of it — that much of the layout viewport is no longer visible.` : null),
	},
	{
		key: 'visual',
		label: 'visual',
		value: (g) => (g.vv ? `${g.vv.w} × ${g.vv.h}` : 'none'),
		what: "What's actually visible right now (window.visualViewport) — it shrinks under the software keyboard and pinch-zoom. The only truthful 'how much can the user see' on iOS.",
		rel: (g) => {
			if (!g.vv) return 'window.visualViewport is unavailable on this browser.';
			const i = insetPx(g);
			return i > 0 ? `${i}px of the layout viewport is currently covered (keyboard / browser UI).` : 'nothing covering it — the full layout viewport is visible.';
		},
	},
	{
		key: 'offset',
		label: 'offset',
		value: (g) => (g.vv ? `${g.vv.ol}, ${g.vv.ot}` : '—'),
		what: 'How far the visual viewport is shifted from the layout viewport’s top-left (offsetLeft, offsetTop). position:fixed and getBoundingClientRect() are blind to this shift.',
		rel: (g) => {
			if (!g.vv) return null;
			return g.vv.ol || g.vv.ot ? `shifted — the visible area starts ${g.vv.ot}px down and ${g.vv.ol}px in (scrolled under the keyboard, or pinch-zoomed).` : 'no shift — the visual viewport is aligned to the layout viewport.';
		},
	},
	{
		key: 'svh',
		label: 'svh',
		value: (g) => `${g.svh}`,
		what: '100svh — the SMALL viewport height: the browser’s retractable UI (URL bar) treated as SHOWN. The smallest the viewport ever gets.',
		rel: (g) => (g.svh > g.dvh ? `⚠ svh (${g.svh}) > dvh (${g.dvh}) — this browser reports them inverted; do not assume svh is the always-visible height.` : `dvh ${g.dvh}, lvh ${g.lvh} — svh is the floor.`),
	},
	{
		key: 'dvh',
		label: 'dvh',
		value: (g) => `${g.dvh}`,
		what: '100dvh — the DYNAMIC viewport height: the CURRENT height, tracking the URL bar as it shows and hides. Usually the right unit for a full-height fill (it’s what the cinema stage uses).',
		rel: (g) => `= ${g.dvh}px now; ${g.dvh === g.innerH ? 'matches inner height.' : `inner height is ${g.innerH}.`}`,
	},
	{
		key: 'lvh',
		label: 'lvh',
		value: (g) => `${g.lvh}`,
		what: '100lvh — the LARGE viewport height: the URL bar treated as HIDDEN. The largest the viewport ever gets. Overflows the screen while the URL bar is still showing.',
		rel: (g) => `lvh − svh = ${urlBarPx(g)}px — that’s the URL bar’s height.`,
	},
	{
		key: 'stage h',
		label: 'stage h',
		value: (g) => (g.stageH == null ? '—' : `${g.stageH}`),
		what: 'The cinema stage ([data-cinema-stage]) height — the box the slide must fit inside on a landscape phone. Shows “—” when there’s no cinema stage (desktop / portrait).',
		rel: (g) => {
			const fit = frameFit(g);
			return fit ? `the preview frame leaves ${fit.slack}px of slack inside it.` : null;
		},
	},
	{
		key: 'frame',
		label: 'frame',
		value: (g) => (g.frame ? `top ${g.frame.top} · bot ${g.frame.bottom} · h ${g.frame.height}` : '—'),
		what: 'The live preview iframe’s on-screen rectangle (top / bottom / height). This is the slide the user sees.',
		rel: (g) => {
			const fit = frameFit(g);
			if (!fit) return g.frame ? 'no cinema stage to fit against on this surface.' : null;
			return fit.fits ? `fits: top ≥ 0 and bottom ≤ stage (${g.stageH}). ${fit.slack}px slack.` : `⚠ OVERFLOWS by ${fit.over}px — the slide spills past the visible band (the #1121 bug).`;
		},
	},
	{
		key: 'slot',
		label: 'slot',
		value: (g) => (g.slot ? `${g.slot.x},${g.slot.y} ${g.slot.w}×${g.slot.h}` : '—'),
		what: 'The preview ANCHOR box in the pane — where the slide SHOULD sit. The hoisted host tracks this rect. Shows “—” outside the Studio split/read preview.',
		rel: (g) => {
			const d = hostSlotDelta(g);
			return d ? (d.max <= 1 ? 'the host is on it (≤1px).' : `the host is OFF it by ${d.max}px.`) : null;
		},
	},
	{
		key: 'host',
		label: 'host',
		value: (g) => (g.host ? `${g.host.x},${g.host.y} ${g.host.w}×${g.host.h}` : '—'),
		what: 'The hoisted position:fixed preview host — where the slide ACTUALLY is. It is placed from the slot rect WITHOUT the visualViewport offset, so a keyboard / pinch-zoom / panel shift slides it off the slot.',
		rel: (g) => {
			const d = hostSlotDelta(g);
			if (!d) return null;
			if (d.max <= 1) return 'aligned to the slot.';
			return `⚠ ${d.max}px off (dx ${d.dx}, dy ${d.dy}, dw ${d.dw}, dh ${d.dh}); visualViewport offset is ${g.vv ? `${g.vv.ol},${g.vv.ot}` : 'n/a'}.`;
		},
	},
];

// The mounted overlay — measures the live geometry only while shown (mount = poll,
// unmount = the interval + listeners are torn down).
function Overlay() {
	const [geom, setGeom] = React.useState<Geom | null>(null);
	// Which row's explanation is PINNED open (tap / click). Touch has no hover, so a tap must
	// latch the detail; a second tap closes it. Single-open keeps the small phone panel calm.
	const [open, setOpen] = React.useState<string | null>(null);
	// Which row is hover-previewed (desktop only). Gated to fine+hover pointers so a touch tap
	// never triggers a stuck hover state — on a phone the tap-to-pin path is the only one.
	const [hover, setHover] = React.useState<string | null>(null);
	const canHover = React.useRef(false);
	React.useEffect(() => {
		canHover.current = typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
	}, []);

	React.useEffect(() => {
		const vv = typeof window !== 'undefined' ? window.visualViewport : null;
		// Probe what the CSS viewport units actually resolve to on THIS device (svh/dvh/lvh
		// can differ from innerHeight — that's the whole question). One hidden probe per unit.
		const probe = (h: string) => {
			const d = document.createElement('div');
			d.style.cssText = `position:fixed;top:0;left:0;width:0;height:${h};visibility:hidden;pointer-events:none`;
			document.body.appendChild(d);
			const v = d.getBoundingClientRect().height;
			d.remove();
			return Math.round(v);
		};
		const read = () => {
			// `iframe.live` — the shell's own class for the shared engine preview
			// (StudioShell reads it the same way). A bare `iframe` selector would grab the
			// FIRST iframe in the document (e.g. a print-panel `pod-frame`), making the
			// fit verdict judge the wrong box.
			const iframeEl = document.querySelector('iframe.live');
			const f = iframeEl?.getBoundingClientRect();
			const stage = document.querySelector('[data-cinema-stage]')?.getBoundingClientRect();
			// The anchor SLOT (the deck-ratio box in the preview pane) and the hoisted HOST (the
			// nearest position:fixed ancestor of the live iframe). Both read via
			// getBoundingClientRect, so their delta is a like-for-like on-screen comparison.
			const R4 = (el: Element | null | undefined) => {
				if (!el) return null;
				const r = el.getBoundingClientRect();
				return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
			};
			const slotEl = document.querySelector('#studio-pane-preview [style*="aspect-ratio"]');
			let hostEl: HTMLElement | null = iframeEl?.parentElement ?? null;
			while (hostEl && getComputedStyle(hostEl).position !== 'fixed') hostEl = hostEl.parentElement;
			setGeom({
				innerW: window.innerWidth,
				innerH: window.innerHeight,
				vv: vv ? { w: Math.round(vv.width), h: Math.round(vv.height), ol: Math.round(vv.offsetLeft), ot: Math.round(vv.offsetTop) } : null,
				svh: probe('100svh'),
				dvh: probe('100dvh'),
				lvh: probe('100lvh'),
				stageH: stage ? Math.round(stage.height) : null,
				frame: f ? { top: Math.round(f.top), bottom: Math.round(f.bottom), height: Math.round(f.height) } : null,
				slot: R4(slotEl),
				host: R4(hostEl),
			});
		};
		read();
		const id = window.setInterval(read, 300);
		vv?.addEventListener('resize', read);
		vv?.addEventListener('scroll', read);
		return () => {
			window.clearInterval(id);
			vv?.removeEventListener('resize', read);
			vv?.removeEventListener('scroll', read);
		};
	}, []);

	const fit = geom ? frameFit(geom) : null;

	return (
		<DiagnosticPanel
			posKey="lattice-viewport-debug-pos"
			label="viewport · live"
			onClose={() => setViewportDebugEnabled(false)}
			closeLabel="Hide viewport debug"
			testId="viewport-debug-overlay"
			ariaLive="off"
			corner="top-left"
			panelClassName="max-w-[280px] font-mono"
		>
			{geom == null ? (
				<div className="text-[11px] text-muted-foreground">Measuring…</div>
			) : (
				<div className="max-h-[62svh] overflow-y-auto overscroll-contain">
					{/* Verdict strip — the computed at-a-glance answers, so the numbers below rarely
					    need reading. The frame-fit chip goes green (fits) / red (overflows). */}
					<div className="mb-1.5 flex flex-wrap gap-1">
						<Chip label="keyboard / UI" value={`${insetPx(geom)}px`} tone={insetPx(geom) > 0 ? 'warn' : 'muted'} />
						<Chip label="URL bar" value={`${urlBarPx(geom)}px`} tone="muted" />
						{fit == null ? <Chip label="fit" value="no stage" tone="muted" /> : <Chip label="fit" value={fit.fits ? '✓' : `overflow ${fit.over}px`} tone={fit.fits ? 'pass' : 'fail'} />}
						{(() => {
							const d = hostSlotDelta(geom);
							return d ? <Chip label="host↔slot" value={d.max <= 1 ? '✓' : `off ${d.max}px`} tone={d.max <= 1 ? 'pass' : 'fail'} /> : null;
						})()}
					</div>
					<div className="flex flex-col">
						{METRICS.map((m) => (
							<Row
								key={m.key}
								metric={m}
								geom={geom}
								expanded={open === m.key || (canHover.current && hover === m.key)}
								pinned={open === m.key}
								onToggle={() => setOpen((o) => (o === m.key ? null : m.key))}
								onHover={(on) => canHover.current && setHover(on ? m.key : (h) => (h === m.key ? null : h))}
							/>
						))}
					</div>
					<p className="mb-0 mt-1.5 text-[9.5px] leading-[1.35] text-muted-foreground">Tap a row for what it means + how it relates. Live on this device — the numbers headless CI can’t see.</p>
				</div>
			)}
		</DiagnosticPanel>
	);
}

// A verdict chip — one computed answer. The status tones (pass/fail/warn) are FILLED solid
// pills with white text, backed by the dedicated `--pass-fill/--warn-fill/--fail-fill` chrome
// tokens: a white-text FILL needs a color dark enough for white text in BOTH modes, which the
// FOREGROUND --pass/--warn/--fail are NOT (they go bright in dark mode → ~2:1 on white). The
// -fill tokens are the status hue darkened to clear AA on white — one value per palette, emitted
// identically into both mode blocks so the chip never flips color — so the chip is theme-aware
// AND colorblind-safe (an a11y palette gets blue/amber/gray, not red/green)
// instead of a hardcoded hex. The hex fallback covers the pre-resolution / SSR frame. `muted`
// stays outlined (--border / --muted-foreground chrome tokens are safe).
function Chip({ label, value, tone }: { label: string; value: string; tone: 'pass' | 'fail' | 'warn' | 'muted' }) {
	const filled =
		tone === 'pass'
			? 'border-transparent bg-[var(--pass-fill,#1f7a3d)] text-white'
			: tone === 'fail'
				? 'border-transparent bg-[var(--fail-fill,#b3261e)] text-white'
				: tone === 'warn'
					? 'border-transparent bg-[var(--warn-fill,#8a6100)] text-white'
					: 'border-border text-muted-foreground';
	return (
		<span className={`inline-flex items-baseline gap-1 rounded-md border px-1.5 py-0.5 text-[10px] ${filled}`}>
			<span className={tone === 'muted' ? 'opacity-70' : 'opacity-80'}>{label}</span>
			<span className="font-semibold tabular-nums">{value}</span>
		</span>
	);
}

// One metric row: label + live value, tappable (touch) / hoverable (desktop) to reveal its
// definition + a live relationship line. A real <button> so it's keyboard-focusable and
// announces aria-expanded; the caret rotates when open.
function Row({ metric, geom, expanded, pinned, onToggle, onHover }: { metric: Metric; geom: Geom; expanded: boolean; pinned: boolean; onToggle: () => void; onHover: (on: boolean) => void }) {
	const rel = metric.rel(geom);
	const warn = !!rel && rel.startsWith('⚠');
	return (
		<div className="border-b border-border/40 last:border-b-0">
			<button
				type="button"
				aria-expanded={expanded}
				onClick={onToggle}
				onPointerEnter={() => onHover(true)}
				onPointerLeave={() => onHover(false)}
				className="flex w-full items-baseline gap-2.5 rounded px-0.5 py-1 text-left text-[11px] hover:bg-muted/40"
			>
				<span aria-hidden className={`shrink-0 self-center text-[8px] text-muted-foreground transition-transform ${expanded ? 'rotate-90' : ''}`}>▶</span>
				<span className="w-[52px] shrink-0 text-muted-foreground">{metric.label}</span>
				<span className={`flex-1 tabular-nums ${warn && !expanded ? 'text-[color:var(--fail,#c0392b)]' : 'text-popover-foreground'}`}>{metric.value(geom)}</span>
			</button>
			{expanded && (
				<div className="pb-1.5 pl-[68px] pr-1 text-[10.5px] leading-[1.4]">
					<p className="m-0 text-muted-foreground">{metric.what}</p>
					{rel && <p className={`m-0 mt-1 ${warn ? 'font-semibold text-[color:var(--fail,#c0392b)]' : 'text-popover-foreground'}`}>{rel}</p>}
					{pinned && <span className="sr-only">(pinned — tap again to close)</span>}
				</div>
			)}
		</div>
	);
}
