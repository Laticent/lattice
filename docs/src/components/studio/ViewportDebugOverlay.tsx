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
// — the Studio switch + the `?vvdebug` param), so a normal page view pays nothing. A
// module-level singleton claim makes a duplicate include a no-op. While mounted it
// polls the geometry (~300ms) and re-reads on every visualViewport resize/scroll.

import { X } from 'lucide-react';
import * as React from 'react';
import { createPortal } from 'react-dom';
import {
	applyViewportDebugUrlParam,
	onViewportDebugEnabledChange,
	setViewportDebugEnabled,
	VIEWPORT_DEBUG_AVAILABLE,
	viewportDebugEnabled,
} from '@/playground/viewport-debug-prefs';

// Singleton claim — shared across island instances in the one bundle, so a page
// that includes the overlay twice still shows one.
let claimed = false;

const POS_KEY = 'lattice-viewport-debug-pos';
type Pos = { left: number; top: number } | null;

export default function ViewportDebugOverlay() {
	const [enabled, setEnabled] = React.useState(false);
	const [owner, setOwner] = React.useState(false);

	React.useEffect(() => {
		applyViewportDebugUrlParam();
		setEnabled(viewportDebugEnabled());
		const off = onViewportDebugEnabledChange(setEnabled);
		return off;
	}, []);

	React.useEffect(() => {
		if (!VIEWPORT_DEBUG_AVAILABLE || claimed) return;
		claimed = true;
		setOwner(true);
		return () => {
			claimed = false;
			setOwner(false);
		};
	}, []);

	if (!(VIEWPORT_DEBUG_AVAILABLE && enabled && owner)) return null;
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
};

// The mounted overlay — measures the live geometry only while shown (mount = poll,
// unmount = the interval + listeners are torn down).
function Overlay() {
	const [geom, setGeom] = React.useState<Geom | null>(null);

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
			const f = document.querySelector('iframe')?.getBoundingClientRect();
			const stage = document.querySelector('[data-cinema-stage]')?.getBoundingClientRect();
			setGeom({
				innerW: window.innerWidth,
				innerH: window.innerHeight,
				vv: vv ? { w: Math.round(vv.width), h: Math.round(vv.height), ol: Math.round(vv.offsetLeft), ot: Math.round(vv.offsetTop) } : null,
				svh: probe('100svh'),
				dvh: probe('100dvh'),
				lvh: probe('100lvh'),
				stageH: stage ? Math.round(stage.height) : null,
				frame: f ? { top: Math.round(f.top), bottom: Math.round(f.bottom), height: Math.round(f.height) } : null,
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

	// Header pattern mirrors VizDiagnosticsOverlay / PerfOverlay: a drag-grip + label +
	// close, portaled to <body> and draggable, so it shares the on-brand surface AND the
	// "grab the header to reposition" affordance the other diagnostics overlays have.
	const header = (
		<>
			<span aria-hidden className="grid grid-cols-2 gap-[2px] p-px opacity-60">
				{['a', 'b', 'c', 'd', 'e', 'f'].map((k) => (
					<i key={k} className="block size-[3px] rounded-full bg-muted-foreground" />
				))}
			</span>
			<span className="flex-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">viewport · live</span>
			<button
				type="button"
				aria-label="Hide viewport debug"
				onClick={() => setViewportDebugEnabled(false)}
				className="vp-close -my-1 -mr-1 cursor-pointer rounded border-0 bg-transparent px-1 py-0.5 text-muted-foreground transition-colors hover:text-foreground"
			>
				<X className="size-3.5" aria-hidden />
			</button>
		</>
	);

	return (
		<PanelPortal header={header}>
			{geom == null ? (
				<div className="text-[11px] text-muted-foreground">Measuring…</div>
			) : (
				<dl className="m-0 grid grid-cols-[auto_1fr] gap-x-2.5 gap-y-0.5 text-[11px]">
					<Row k="inner" v={`${geom.innerW} × ${geom.innerH}`} />
					<Row k="visual" v={geom.vv ? `${geom.vv.w} × ${geom.vv.h}` : 'none'} />
					<Row k="offset" v={geom.vv ? `${geom.vv.ol}, ${geom.vv.ot}` : '—'} />
					<Row k="svh" v={`${geom.svh}`} />
					<Row k="dvh" v={`${geom.dvh}`} />
					<Row k="lvh" v={`${geom.lvh}`} />
					<Row k="stage h" v={geom.stageH == null ? '—' : `${geom.stageH}`} />
					<Row k="frame" v={geom.frame ? `top ${geom.frame.top} · bot ${geom.frame.bottom} · h ${geom.frame.height}` : '—'} />
				</dl>
			)}
		</PanelPortal>
	);
}

// One label→value line in the readout. The value is the live number; the label is the
// dimmed key. Kept tabular so the numbers scan cleanly on a small phone panel.
function Row({ k, v }: { k: string; v: string }) {
	return (
		<>
			<dt className="text-muted-foreground">{k}</dt>
			<dd className="m-0 tabular-nums text-popover-foreground">{v}</dd>
		</>
	);
}

// The draggable panel, portaled to <body> so `position:fixed` is relative to the
// viewport regardless of a transformed ancestor at the include site. Drag the
// header to reposition (persisted); clamped on-screen on mount + resize. The same
// pattern VizDiagnosticsOverlay / PerfOverlay use — kept in parallel deliberately (a
// shared helper would couple independently-evolving overlays for ~30 lines).
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
		if ((e.target as HTMLElement).closest('.vp-close')) return;
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
		: { left: 'max(8px, env(safe-area-inset-left))', top: 'max(8px, env(safe-area-inset-top))' };

	const panel = (
		<div
			ref={ref}
			data-testid="viewport-debug-overlay"
			role="status"
			aria-live="off"
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
