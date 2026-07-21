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
import { DiagnosticPanel, type OverlayClaim, useDiagnosticGate } from '@/components/diagnostics/diagnostic-overlay';
import { onPerfOverlayEnabledChange, PERF_OVERLAY_AVAILABLE, perfOverlayEnabled, setPerfOverlayEnabled } from '@/playground/perf-overlay-prefs';
import { latestRenderSample, onRenderSample, type RenderSample } from '@/playground/render-metrics';
import { type MetricDatum, MetricDetail } from './MetricDetail';
import { type MetricMeta, RENDER, RUNTIME, rateMetric, VITALS } from './perf-metrics';

// Per-overlay singleton token — a duplicate include (Header + features) still shows one.
const claim: OverlayClaim = { held: false };

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

export default function PerfOverlay() {
	const active = useDiagnosticGate({
		available: PERF_OVERLAY_AVAILABLE,
		isEnabled: perfOverlayEnabled,
		subscribe: onPerfOverlayEnabledChange,
		// The `?perf` param honors `?perf` / `?perf=off` (writes the shared pref).
		applyUrlParam: () => {
			const params = new URLSearchParams(location.search);
			if (params.has('perf')) setPerfOverlayEnabled(params.get('perf') !== 'off');
		},
		claim,
	});
	if (!active) return null;
	return <Overlay />;
}

// The mounted overlay — all measurement loops live here, so they exist ONLY
// while the panel is shown (mount = start, unmount = full teardown).
function Overlay() {
	const memSupported = React.useMemo(hasMem, []);
	const ltSupported = React.useMemo(hasLongTasks, []);

	const [vitals, setVitals] = React.useState<Record<string, number>>(() => ({ ...vitalsCache }));
	const [runtime, setRuntime] = React.useState<{ FPS?: number; fpsFrac?: number; MEM?: number; memFrac?: number; CPU?: number }>({});
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
		let maxFps = 0; // the display's serviced-rAF ceiling (30Hz panel / throttle / 60Hz), learned live
		const tick = (t: number) => {
			frames++;
			if (t - last >= 1000) {
				const fps = Math.round((frames * 1000) / (t - last));
				frames = 0;
				last = t;
				maxFps = Math.max(maxFps, fps);
				// fpsFrac = current / ceiling, so FPS is rated against THIS device's ceiling
				// (perf-metrics FPS.rate) — a steady 30 on a 30Hz/throttled panel reads healthy.
				setRuntime((r) => ({ ...r, FPS: fps, fpsFrac: maxFps ? fps / maxFps : undefined }));
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
				const frac = m.key === 'MEM' ? runtime.memFrac : m.key === 'FPS' ? runtime.fpsFrac : undefined;
				return { value, rating: value == null ? null : rateMetric(m, value, frac), extra: frac };
			}
			const asRec = sample as unknown as Record<string, number> | null;
			const value = asRec ? (asRec[m.key] ?? null) : null;
			const rawRec = sample?.raw as unknown as Record<string, number> | undefined;
			const raw = rawRec ? (rawRec[m.key] ?? null) : null;
			// The RENDER row drills into the engine's per-stage breakdown (item 1).
			const breakdown = m.key === 'engineMs' ? sample?.stats : undefined;
			// FRAME/TOTAL are rated + labeled by the live render regime (patch vs rebuild),
			// so a full rebuild isn't judged against a single-frame budget it can't meet.
			const regime = m.regimeBands ? sample?.writePath : undefined;
			return { value, rating: value == null ? null : rateMetric(m, value, regime), raw, breakdown, regime };
		},
		[vitals, runtime, sample],
	);

	const runtimeRows = RUNTIME.filter((m) => (m.key === 'MEM' ? memSupported : m.key === 'CPU' ? ltSupported : true));

	return (
		<DiagnosticPanel
			posKey="lattice-perf-overlay-pos"
			label="performance · live"
			onClose={() => setPerfOverlayEnabled(false)}
			closeLabel="Hide performance overlay"
			id="lattice-perf-overlay"
			panelClassName="min-w-[168px] font-mono"
		>
			<Group rows={VITALS} datumFor={datumFor} />
			<Sep label="runtime" />
			<Group rows={runtimeRows} datumFor={datumFor} />
			<Sep label="render" />
			<Group rows={RENDER} datumFor={datumFor} />
		</DiagnosticPanel>
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
