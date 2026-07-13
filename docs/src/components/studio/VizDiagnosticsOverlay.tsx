// Live viz diagnostics overlay — a small on-screen readout of dropped-to-black SVG
// chart paint on the slide being edited, the live twin of the CI guard shipped in
// #961 (tools/check-viz-render.js). It answers, on the author's REAL device, the
// question CI can only answer headless: did a themed chart colour resolve to black
// on the scoped render path (the #956 class)?
//
// Mirrors PerfOverlay.tsx: a React island that renders NOTHING (and subscribes to
// nothing) until the shared pref is on (viz-overlay-prefs.ts — the Studio switch +
// the `?viz` param), so a normal page view pays nothing; the render pipeline only
// scans while this is mounted (viz-findings.ts hasVizScanListeners gate). A
// module-level singleton claim makes a duplicate include a no-op. Findings are fed
// by single-slide-render.ts after each slide lands in the preview iframe.

import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import * as React from 'react';
import { createPortal } from 'react-dom';
import { latestVizScan, onVizScan, type VizScan } from '@/playground/viz-findings';
import { applyVizOverlayUrlParam, onVizOverlayEnabledChange, setVizOverlayEnabled, VIZ_OVERLAY_AVAILABLE, vizOverlayEnabled } from '@/playground/viz-overlay-prefs';

// Singleton claim — shared across island instances in the one bundle, so a page
// that includes the overlay twice still shows one.
let claimed = false;

const POS_KEY = 'lattice-viz-overlay-pos';
type Pos = { left: number; top: number } | null;

export default function VizDiagnosticsOverlay() {
	const [enabled, setEnabled] = React.useState(false);
	const [owner, setOwner] = React.useState(false);

	React.useEffect(() => {
		applyVizOverlayUrlParam();
		setEnabled(vizOverlayEnabled());
		const off = onVizOverlayEnabledChange(setEnabled);
		return off;
	}, []);

	React.useEffect(() => {
		if (!VIZ_OVERLAY_AVAILABLE || claimed) return;
		claimed = true;
		setOwner(true);
		return () => {
			claimed = false;
			setOwner(false);
		};
	}, []);

	if (!(VIZ_OVERLAY_AVAILABLE && enabled && owner)) return null;
	return <Overlay />;
}

// The mounted overlay — subscribes to scans only while shown (mount = subscribe,
// unmount = the render path stops scanning).
function Overlay() {
	const [scan, setScan] = React.useState<VizScan | null>(() => latestVizScan());
	React.useEffect(() => onVizScan(setScan), []);

	const findings = scan?.findings ?? [];
	const clean = !!scan && findings.length === 0;

	// Header pattern mirrors PerfOverlay: a drag-grip + label + close, portaled to
	// <body> and draggable, so it shares the on-brand surface AND the "grab the
	// header to reposition" affordance the other diagnostics overlays have.
	const header = (
		<>
			<span aria-hidden className="grid grid-cols-2 gap-[2px] p-px opacity-60">
				{['a', 'b', 'c', 'd', 'e', 'f'].map((k) => (
					<i key={k} className="block size-[3px] rounded-full bg-muted-foreground" />
				))}
			</span>
			<span className="flex-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">viz diagnostics · live</span>
			<button
				type="button"
				aria-label="Hide viz diagnostics"
				onClick={() => setVizOverlayEnabled(false)}
				className="vz-close -my-1 -mr-1 cursor-pointer rounded border-0 bg-transparent px-1 py-0.5 text-muted-foreground transition-colors hover:text-foreground"
			>
				<X className="size-3.5" aria-hidden />
			</button>
		</>
	);

	return (
		<PanelPortal header={header}>
			{scan == null ? (
				<div className="flex items-center gap-1.5 text-muted-foreground">
					<span className="text-[11px]">Edit a chart slide to scan…</span>
				</div>
			) : clean ? (
				<div className="flex items-center gap-1.5">
					<CheckCircle2 className="size-3.5 shrink-0 text-[color:var(--pass,#3c6a40)]" aria-hidden />
					<span className="text-[11px]">No dropped chart colors</span>
				</div>
			) : (
				<div>
					<div className="mb-1 flex items-center gap-1.5">
						<AlertTriangle className="size-3.5 shrink-0 text-[color:var(--fail,#9e2222)]" aria-hidden />
						<span className="text-[11px] font-semibold">
							{findings.length} black chart {findings.length === 1 ? 'fill' : 'fills'}
						</span>
					</div>
					<ul className="m-0 max-h-[168px] list-none space-y-0.5 overflow-y-auto p-0">
						{findings.map((f) => (
							<li key={`${f.component}/${f.selector}/${f.property}`} className="flex items-baseline gap-1 text-[10.5px] text-muted-foreground">
								<span className="text-popover-foreground">{f.component}</span>
								<span className="opacity-60">·</span>
								<span className="truncate">{f.selector}</span>
								<span className="opacity-60">·</span>
								<span className="text-[color:var(--fail,#9e2222)]">{f.property}</span>
							</li>
						))}
					</ul>
					<p className="mt-1.5 mb-0 text-[9.5px] leading-[1.3] text-muted-foreground">A themed color resolved to black — a scoping / token break (cf. #956).</p>
				</div>
			)}
		</PanelPortal>
	);
}

// The draggable panel, portaled to <body> so `position:fixed` is relative to the
// viewport regardless of a transformed ancestor at the include site. Drag the
// header to reposition (persisted); clamped on-screen on mount + resize. The same
// pattern PerfOverlay uses — kept in parallel deliberately (a shared helper would
// couple two independently-evolving overlays for ~30 lines).
function PanelPortal({ header, children }: { header: React.ReactNode; children: React.ReactNode }) {
	const ref = React.useRef<HTMLDivElement>(null);
	const [pos, setPos] = React.useState<Pos>(() => {
		try {
			const p = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
			return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? { left: p.x, top: p.y } : null;
		} catch {
			return null;
		}
	});

	// Keep a restored / dragged position on-screen across a resize to a narrower
	// viewport (else a panel saved near a wide edge renders offscreen, ungrabbable).
	React.useEffect(() => {
		const clamp = () => {
			const el = ref.current;
			if (!el) return;
			setPos((p) => {
				if (!p) return p;
				const left = Math.max(4, Math.min(p.left, window.innerWidth - el.offsetWidth - 4));
				const top = Math.max(4, Math.min(p.top, window.innerHeight - el.offsetHeight - 4));
				return left === p.left && top === p.top ? p : { left, top };
			});
		};
		clamp();
		window.addEventListener('resize', clamp);
		return () => window.removeEventListener('resize', clamp);
	}, []);

	// Drag the header. Move/up listen on document for the drag's duration so it
	// keeps tracking when the pointer leaves the small header.
	const onHeaderPointerDown = (e: React.PointerEvent) => {
		if ((e.target as HTMLElement).closest('.vz-close')) return;
		const el = ref.current;
		if (!el) return;
		const r = el.getBoundingClientRect();
		const ox = r.left;
		const oy = r.top;
		const sx = e.clientX;
		const sy = e.clientY;
		const onMove = (ev: PointerEvent) => {
			const nx = Math.max(4, Math.min(ox + ev.clientX - sx, window.innerWidth - el.offsetWidth - 4));
			const ny = Math.max(4, Math.min(oy + ev.clientY - sy, window.innerHeight - el.offsetHeight - 4));
			setPos({ left: nx, top: ny });
		};
		const onUp = () => {
			document.removeEventListener('pointermove', onMove);
			const r2 = el.getBoundingClientRect();
			try {
				localStorage.setItem(POS_KEY, JSON.stringify({ x: r2.left, y: r2.top }));
			} catch {}
		};
		document.addEventListener('pointermove', onMove);
		document.addEventListener('pointerup', onUp, { once: true });
		e.preventDefault();
	};

	const style: React.CSSProperties = pos
		? { left: pos.left, top: pos.top, right: 'auto', bottom: 'auto' }
		: { left: 'max(8px, env(safe-area-inset-left))', bottom: 'max(8px, env(safe-area-inset-bottom))' };

	const panel = (
		<div
			ref={ref}
			data-testid="viz-diagnostics-overlay"
			role="status"
			aria-live="polite"
			className="lx-ui fixed z-[2147483646] max-w-[280px] select-none rounded-xl border border-border bg-popover/95 px-2.5 pt-2 pb-2.5 font-mono text-[12px] leading-[1.4] text-popover-foreground shadow-lg backdrop-blur-sm"
			style={style}
		>
			<div className="mb-1.5 flex cursor-grab touch-none items-center gap-2 active:cursor-grabbing" onPointerDown={onHeaderPointerDown}>
				{header}
			</div>
			{children}
		</div>
	);

	return createPortal(panel, document.body);
}
