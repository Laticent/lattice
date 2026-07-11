// Live performance overlay — a draggable on-screen readout, now a React island
// so each row is a shadcn Popover/Sheet you can tap for a plain-language
// explanation (MetricDetail). Three groups:
//   • WEB VITALS (page-load, one-shot): LCP / CLS / INP / FCP / TTFB.
//   • RUNTIME (live while shown): FPS, MEM (Chrome heap), CPU≈ (Long Tasks proxy).
//   • RENDER (live per render): the Lattice edit→preview pipeline, fed by
//     render-metrics.js which single-slide-render.ts records into.
//
// All measured by the visitor's OWN browser (real-device numbers). On/off is the
// shared cross-surface pref (perf-overlay-prefs.js): the Studio switch, the
// Drawing Board switch, and the `?perf` URL param all flip it, and this island
// mounts/unmounts live in response. It renders NOTHING (and starts no loops)
// until enabled, so a normal page view pays nothing. Availability is GA-gated in
// perf-overlay-prefs.js. Included once per page via ResourceHints/Header/
// features; a module-level singleton claim makes extra includes no-ops.

import * as React from 'react';
import { createPortal } from 'react-dom';
import { onPerfOverlayEnabledChange, PERF_OVERLAY_AVAILABLE, perfOverlayEnabled, setPerfOverlayEnabled } from '@/playground/perf-overlay-prefs.js';
import { latestRenderSample, onRenderSample } from '@/playground/render-metrics.js';
import { type MetricDatum, MetricDetail } from './MetricDetail';
import { type MetricMeta, RENDER, RUNTIME, rateMetric, VITALS } from './perf-metrics';

const POS_KEY = 'lattice-perf-overlay-pos';

// Singleton claim — shared across island instances in the one bundle, so a page
// that includes the overlay twice (Header + features) still shows one.
let claimed = false;

const hasMem = () => typeof performance !== 'undefined' && !!(performance as unknown as { memory?: unknown }).memory;
const hasLongTasks = () => {
	try {
		return PerformanceObserver.supportedEntryTypes.includes('longtask');
	} catch {
		return false;
	}
};

type Pos = { left: number; top: number } | null;
type RenderSample = Record<string, number> & { raw?: Record<string, number> };

export default function PerfOverlay() {
	const [enabled, setEnabled] = React.useState(false);
	const [owner, setOwner] = React.useState(false);

	// Enabled state + the ?perf param + live pref subscription.
	React.useEffect(() => {
		if (!PERF_OVERLAY_AVAILABLE) return;
		try {
			const params = new URLSearchParams(location.search);
			if (params.has('perf')) setPerfOverlayEnabled(params.get('perf') !== 'off');
		} catch {}
		setEnabled(perfOverlayEnabled());
		const off = onPerfOverlayEnabledChange(setEnabled);
		return () => {
			off();
		};
	}, []);

	// Claim the singleton so duplicate includes don't stack overlays.
	React.useEffect(() => {
		if (!PERF_OVERLAY_AVAILABLE || claimed) return;
		claimed = true;
		setOwner(true);
		return () => {
			claimed = false;
			setOwner(false);
		};
	}, []);

	const active = PERF_OVERLAY_AVAILABLE && enabled && owner;

	if (!active) return null;
	return <Overlay />;
}

// The mounted overlay — all measurement loops live here, so they exist ONLY
// while the panel is shown (mount = start, unmount = full teardown).
function Overlay() {
	const memSupported = React.useMemo(hasMem, []);
	const ltSupported = React.useMemo(hasLongTasks, []);

	const [vitals, setVitals] = React.useState<Record<string, number>>({});
	const [runtime, setRuntime] = React.useState<{ FPS?: number; MEM?: number; memFrac?: number; CPU?: number }>({});
	const [sample, setSample] = React.useState<RenderSample | null>(() => latestRenderSample() as RenderSample | null);

	// ── WEB VITALS: lazy-imported only now that the overlay is shown ──
	React.useEffect(() => {
		let cancelled = false;
		import('web-vitals')
			.then(({ onLCP, onCLS, onINP, onFCP, onTTFB }) => {
				if (cancelled) return;
				const opts = { reportAllChanges: true };
				const sink = (m: { name: string; value: number }) => setVitals((v) => ({ ...v, [m.name]: m.value }));
				onLCP(sink, opts);
				onCLS(sink, opts);
				onINP(sink, opts);
				onFCP(sink, opts);
				onTTFB(sink, opts);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, []);

	// ── RUNTIME: FPS (rAF, sampled 1/sec), MEM (1/sec), CPU≈ (Long Tasks, 1/sec) ──
	React.useEffect(() => {
		let rafId = 0;
		let frames = 0;
		let last = performance.now();
		const tick = (t: number) => {
			frames++;
			if (t - last >= 1000) {
				const fps = Math.round((frames * 1000) / (t - last));
				frames = 0;
				last = t;
				setRuntime((r) => ({ ...r, FPS: fps }));
			}
			rafId = requestAnimationFrame(tick);
		};
		rafId = requestAnimationFrame(tick);

		let memTimer = 0;
		if (memSupported) {
			const mem = () => (performance as unknown as { memory: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
			const sampleMem = () => {
				const m = mem();
				setRuntime((r) => ({ ...r, MEM: Math.round(m.usedJSHeapSize / 1048576), memFrac: m.usedJSHeapSize / m.jsHeapSizeLimit }));
			};
			sampleMem();
			memTimer = window.setInterval(sampleMem, 1000);
		}

		let cpuTimer = 0;
		let ltObserver: PerformanceObserver | null = null;
		let blockedMs = 0;
		if (ltSupported) {
			try {
				ltObserver = new PerformanceObserver((list) => {
					for (const e of list.getEntries()) blockedMs += e.duration;
				});
				ltObserver.observe({ type: 'longtask', buffered: true });
			} catch {}
			cpuTimer = window.setInterval(() => {
				const pct = Math.min(100, Math.round((blockedMs / 1000) * 100));
				blockedMs = 0;
				setRuntime((r) => ({ ...r, CPU: pct }));
			}, 1000);
		}

		return () => {
			cancelAnimationFrame(rafId);
			if (memTimer) clearInterval(memTimer);
			if (cpuTimer) clearInterval(cpuTimer);
			if (ltObserver) {
				try {
					ltObserver.disconnect();
				} catch {}
			}
		};
	}, [memSupported, ltSupported]);

	// ── RENDER: live per-render samples from the pipeline ──
	React.useEffect(() => {
		const off = onRenderSample((s: RenderSample) => setSample(s));
		return () => {
			off();
		};
	}, []);

	// Build the {value, rating, raw} a row needs from current state.
	const datumFor = React.useCallback(
		(m: MetricMeta): MetricDatum => {
			if (m.group === 'vitals') {
				const value = vitals[m.key] ?? null;
				return { value, rating: value == null ? null : rateMetric(m, value) };
			}
			if (m.group === 'runtime') {
				const value = (runtime as Record<string, number | undefined>)[m.key] ?? null;
				const frac = m.key === 'MEM' ? runtime.memFrac : undefined;
				return { value, rating: value == null ? null : rateMetric(m, value, frac), extra: frac };
			}
			const value = sample ? (sample[m.key] ?? null) : null;
			const raw = sample?.raw ? (sample.raw[m.key] ?? null) : null;
			return { value, rating: value == null ? null : rateMetric(m, value), raw };
		},
		[vitals, runtime, sample],
	);

	const runtimeRows = RUNTIME.filter((m) => (m.key === 'MEM' ? memSupported : m.key === 'CPU' ? ltSupported : true));

	return (
		<PanelPortal>
			<Group rows={VITALS} datumFor={datumFor} />
			<Sep label="runtime" />
			<Group rows={runtimeRows} datumFor={datumFor} />
			<Sep label="render" />
			<Group rows={RENDER} datumFor={datumFor} />
		</PanelPortal>
	);
}

function Group({ rows, datumFor }: { rows: MetricMeta[]; datumFor: (m: MetricMeta) => MetricDatum }) {
	return (
		<>
			{rows.map((m) => (
				<MetricDetail key={m.key} meta={m} datum={datumFor(m)} />
			))}
		</>
	);
}

function Sep({ label }: { label: string }) {
	return (
		<div className="mt-[7px] mb-1 flex items-center gap-2">
			<span className="text-[9px] uppercase tracking-[0.1em] text-[#71717a]">{label}</span>
			<span className="h-px flex-1 bg-white/10" />
		</div>
	);
}

// The draggable dark-glass panel, portaled to <body> so `position:fixed` is
// relative to the viewport regardless of any transformed ancestor at the include
// site — matching the old script that appended straight to document.body.
function PanelPortal({ children }: { children: React.ReactNode }) {
	const ref = React.useRef<HTMLDivElement>(null);
	const [pos, setPos] = React.useState<Pos>(() => {
		try {
			const p = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
			return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? { left: p.x, top: p.y } : null;
		} catch {
			return null;
		}
	});

	// Drag the header. Move/up listen on document for the drag's duration so it
	// keeps tracking when the pointer leaves the small header.
	const onHeaderPointerDown = (e: React.PointerEvent) => {
		if ((e.target as HTMLElement).closest('.pf-close')) return;
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
			id="lattice-perf-overlay"
			role="status"
			className="lx-ui fixed z-[2147483646] min-w-[158px] select-none rounded-[10px] border border-white/15 bg-[rgba(15,17,21,0.92)] px-[10px] pt-[7px] pb-[9px] font-mono text-[12px] leading-[1.4] text-[#f4f4f5] shadow-[0_6px_20px_rgba(0,0,0,0.4)] backdrop-blur-[6px]"
			style={style}
		>
			<div className="mb-1.5 flex cursor-grab touch-none items-center gap-2 active:cursor-grabbing" onPointerDown={onHeaderPointerDown}>
				<span aria-hidden className="grid grid-cols-2 gap-[2px] p-px opacity-45">
					{['a', 'b', 'c', 'd', 'e', 'f'].map((k) => (
						<i key={k} className="block size-[3px] rounded-full bg-[#d4d4d8]" />
					))}
				</span>
				<span className="flex-1 text-[10px] uppercase tracking-[0.08em] text-[#a1a1aa]">performance · live</span>
				<button
					type="button"
					className="pf-close cursor-pointer border-0 bg-transparent px-0.5 text-[14px] leading-none text-[#a1a1aa] hover:text-white"
					aria-label="Hide performance overlay"
					onClick={() => setPerfOverlayEnabled(false)}
				>
					×
				</button>
			</div>
			{children}
		</div>
	);

	if (typeof document === 'undefined') return null;
	return createPortal(panel, document.body);
}
