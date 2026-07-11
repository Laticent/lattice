// Live performance overlay — a draggable on-screen readout, now a React island
// so each row is a shadcn Popover/Sheet you can tap for a plain-language
// explanation (MetricDetail). Three groups:
//   • WEB VITALS (page-load, one-shot): LCP / CLS / INP / FCP / TTFB.
//   • RUNTIME (live while shown): FPS, MEM (Chrome heap), CPU≈ (Long Tasks proxy).
//   • RENDER (live per render): the Lattice edit→preview pipeline, fed by
//     render-metrics.ts which single-slide-render.ts records into.
//
// All measured by the visitor's OWN browser (real-device numbers). On/off is the
// shared cross-surface pref (perf-overlay-prefs.ts): the Studio switch, the
// Drawing Board switch, and the `?perf` URL param all flip it, and this island
// mounts/unmounts live in response. It renders NOTHING (and starts no loops)
// until enabled, so a normal page view pays nothing. Availability is GA-gated in
// perf-overlay-prefs.ts. Included once per page via ResourceHints/Header/
// features; a module-level singleton claim makes extra includes no-ops.

import * as React from 'react';
import { createPortal } from 'react-dom';
import { onPerfOverlayEnabledChange, PERF_OVERLAY_AVAILABLE, perfOverlayEnabled, setPerfOverlayEnabled } from '@/playground/perf-overlay-prefs';
import { latestRenderSample, onRenderSample, type RenderSample } from '@/playground/render-metrics';
import { type MetricDatum, MetricDetail } from './MetricDetail';
import { type MetricMeta, RENDER, RUNTIME, rateMetric, VITALS } from './perf-metrics';

const POS_KEY = 'lattice-perf-overlay-pos';

// Singleton claim — shared across island instances in the one bundle, so a page
// that includes the overlay twice (Header + features) still shows one.
let claimed = false;

// ── Web Vitals: registered ONCE per page at module scope ──────────────────────
// web-vitals exposes no unsubscribe, and its one-shot metrics (LCP/FCP/TTFB) only
// fire at load — so registering inside the mounted overlay would (a) never tear
// down, (b) re-register a fresh observer set on every toggle-off→on, and (c) show
// those one-shots blank after a re-enable. Registering once here, caching values,
// and letting the mounted overlay subscribe + seed from the cache fixes all three.
let vitalsStarted = false;
const vitalsCache: Record<string, number> = {};
const vitalsSubs = new Set<(cache: Record<string, number>) => void>();
function startVitals() {
	if (vitalsStarted) return;
	vitalsStarted = true;
	import('web-vitals')
		.then(({ onLCP, onCLS, onINP, onFCP, onTTFB }) => {
			const opts = { reportAllChanges: true };
			const sink = (m: { name: string; value: number }) => {
				vitalsCache[m.name] = m.value;
				for (const fn of vitalsSubs) fn(vitalsCache);
			};
			onLCP(sink, opts);
			onCLS(sink, opts);
			onINP(sink, opts);
			onFCP(sink, opts);
			onTTFB(sink, opts);
		})
		.catch(() => {});
}

const hasMem = () => typeof performance !== 'undefined' && !!(performance as unknown as { memory?: unknown }).memory;
const hasLongTasks = () => {
	try {
		return PerformanceObserver.supportedEntryTypes.includes('longtask');
	} catch {
		return false;
	}
};

type Pos = { left: number; top: number } | null;

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

	const [vitals, setVitals] = React.useState<Record<string, number>>(() => ({ ...vitalsCache }));
	const [runtime, setRuntime] = React.useState<{ FPS?: number; MEM?: number; memFrac?: number; CPU?: number }>({});
	const [sample, setSample] = React.useState<RenderSample | null>(() => latestRenderSample());

	// ── WEB VITALS: start the once-per-page collector (lazy) and subscribe. Seeds
	// from the cache so one-shot metrics survive a toggle-off→on. ──
	React.useEffect(() => {
		startVitals();
		const fn = (cache: Record<string, number>) => setVitals({ ...cache });
		vitalsSubs.add(fn);
		setVitals({ ...vitalsCache });
		return () => {
			vitalsSubs.delete(fn);
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
				// No `buffered` — replaying long tasks from before the overlay opened
				// would inflate the first CPU≈ sample past the real current load.
				ltObserver.observe({ type: 'longtask' });
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
			const asRec = sample as unknown as Record<string, number> | null;
			const value = asRec ? (asRec[m.key] ?? null) : null;
			const rawRec = sample?.raw as unknown as Record<string, number> | undefined;
			const raw = rawRec ? (rawRec[m.key] ?? null) : null;
			// The RENDER row drills into the engine's per-stage breakdown (item 1).
			const breakdown = m.key === 'engineMs' ? sample?.stats : undefined;
			return { value, rating: value == null ? null : rateMetric(m, value), raw, breakdown };
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
			<span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</span>
			<span className="h-px flex-1 bg-border" />
		</div>
	);
}

// The draggable panel, portaled to <body> so `position:fixed` is relative to
// the viewport regardless of any transformed ancestor at the include site. It
// wears the SAME on-brand surface as the detail card (shadcn `popover` tokens,
// theme-aware) so the compact readout and the tapped detail read as one system.
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

	// Keep a restored / previously-dragged position on-screen: a panel saved near
	// the edge of a wide window would otherwise render fully offscreen on a
	// narrower viewport (or after a resize) with no way to grab it back. Clamp on
	// mount and on every resize, using the panel's measured size.
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
			className="lx-ui fixed z-[2147483646] min-w-[168px] select-none rounded-xl border border-border bg-popover/95 px-2.5 pt-2 pb-2.5 font-mono text-[12px] leading-[1.4] text-popover-foreground shadow-lg backdrop-blur-sm"
			style={style}
		>
			<div className="mb-1.5 flex cursor-grab touch-none items-center gap-2 active:cursor-grabbing" onPointerDown={onHeaderPointerDown}>
				<span aria-hidden className="grid grid-cols-2 gap-[2px] p-px opacity-60">
					{['a', 'b', 'c', 'd', 'e', 'f'].map((k) => (
						<i key={k} className="block size-[3px] rounded-full bg-muted-foreground" />
					))}
				</span>
				<span className="flex-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">performance · live</span>
				<button
					type="button"
					className="pf-close -my-1 -mr-1 cursor-pointer rounded border-0 bg-transparent px-1 py-0.5 text-[14px] leading-none text-muted-foreground transition-colors hover:text-foreground"
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
