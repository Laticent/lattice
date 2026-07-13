// Live read-aloud diagnostics overlay — a draggable on-screen readout for Present,
// the narration twin of the performance overlay (site/PerfOverlay.tsx). It wears the
// SAME on-brand surface (shadcn `popover` tokens, theme-aware), the same 6-dot drag
// grip, the same uppercase group separators + status dots, and the same × to close —
// so the two read as one system. On/off is the shared cross-surface pref
// (readaloud-overlay-prefs.ts): the Studio "Read-aloud diagnostics" switch and the
// `?readaloud-debug=1` URL param both flip it (the param the skips/races regression
// was pinned with). It renders nothing until enabled, and PARENT-fed: PresentOverlay
// owns the reader, so it passes the live snapshot + event trace down (this island
// can't measure them itself). Portaled to <body> so `position:fixed` is relative to
// the viewport regardless of a transformed ancestor.

import * as React from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { onCalibrationChange, resetCalibration } from '@/playground/readaloud-calibration';
import { setReadAloudOverlayEnabled } from '@/playground/readaloud-overlay-prefs';
import type { ReadAloudDebugEvent, ReadAloudDebugLive } from './read-aloud';

const POS_KEY = 'lattice-readaloud-overlay-pos';
// The SAME rating palette the perf overlay's MetricDetail uses, so green/amber/red
// mean the same thing across both overlays. Inline style (not CSS) — a diagnostics
// aid, not layout — mirroring PerfOverlay's own approach.
const TONE: Record<string, string> = { good: '#16a34a', warn: '#d97706', bad: '#dc2626' };
const GREY = '#8b949e';

type Tone = 'good' | 'warn' | 'bad' | 'none';
type Pos = { left: number; top: number } | null;

/** One `● LABEL … value` row, status dot colored by tone (mirrors the perf overlay rows). */
function Row({ label, value, tone = 'none' }: { label: string; value: React.ReactNode; tone?: Tone }) {
	return (
		<div className="flex items-center gap-2 py-[1.5px]">
			<span aria-hidden className="inline-block size-[7px] shrink-0 rounded-full" style={{ background: tone === 'none' ? GREY : TONE[tone] }} />
			<span className="text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">{label}</span>
			<span className="h-px flex-1" />
			<span className="shrink-0 font-mono text-[12px] tabular-nums text-popover-foreground">{value}</span>
		</div>
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

/** Serialize one trace event to a line (also the copy-paste format). */
function fmtEvent(e: ReadAloudDebugEvent): string {
	if (e.kind === 'read') return `── ${e.label ?? 'read'} · ${e.voice || '—'} · spoken/cues ${e.spokenCount}/${e.cueCount}${e.spokenCount !== e.cueCount ? ' ⚠MISMATCH' : ''} · ctx ${e.ctxState}`;
	if (e.kind === 'timing') return `t#${e.index} on=${e.relOnsetMs} dur=${e.durationMs} ${e.ctxState} +${e.sincePlayMs}ms`;
	return `a#${e.index} ${e.ctxState} +${e.sincePlayMs}ms`;
}

export default function ReadAloudOverlay({ live, events, source }: { live: ReadAloudDebugLive | null; events: ReadAloudDebugEvent[]; source: string }) {
	const ref = React.useRef<HTMLDivElement>(null);
	const [copied, setCopied] = React.useState(false);
	// Re-render when a voice's calibration is reset/updated elsewhere, so the readout + the
	// reset affordance reflect the store live.
	const [, bumpCal] = React.useReducer((n: number) => n + 1, 0);
	React.useEffect(() => onCalibrationChange(() => bumpCal()), []);
	const [pos, setPos] = React.useState<Pos>(() => {
		try {
			const p = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
			return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? { left: p.x, top: p.y } : null;
		} catch {
			return null;
		}
	});

	// Keep a restored / dragged position on-screen (a panel saved near the edge of a
	// wide window would render offscreen on a narrower one). Clamp on mount + resize.
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

	// Drag the header. Move/up listen on document so the drag keeps tracking when the
	// pointer leaves the small header (mirrors PerfOverlay).
	const onHeaderPointerDown = (e: React.PointerEvent) => {
		if ((e.target as HTMLElement).closest('.ra-close')) return;
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

	const traceText = React.useMemo(() => {
		const head = live
			? `source=${source} voice=${live.voice || '—'} rung=${live.rung} mode=${live.mode} ctx=${live.ctxState} peakAhead=${live.peakAhead} spoken/cues=${live.spokenCount}/${live.cueCount}`
			: `source=${source} (idle)`;
		return `${head}\n${events.map(fmtEvent).join('\n')}`;
	}, [events, live, source]);

	const copyTrace = () => {
		try {
			navigator.clipboard?.writeText(traceText).then(
				() => {
					setCopied(true);
					window.setTimeout(() => setCopied(false), 1200);
				},
				() => {},
			);
		} catch {}
	};

	const style: React.CSSProperties = pos
		? { left: pos.left, top: pos.top, right: 'auto', bottom: 'auto' }
		: { left: 'max(8px, env(safe-area-inset-left))', top: 'max(8px, env(safe-area-inset-top))' };

	const mismatch = live && live.spokenCount > 0 && live.spokenCount !== live.cueCount;
	const ctxTone: Tone = !live ? 'none' : live.ctxState === 'running' ? 'good' : live.ctxState === 'suspended' ? 'warn' : 'none';

	const panel = (
		<div
			ref={ref}
			id="lattice-readaloud-overlay"
			role="status"
			className="lx-ui fixed z-[2147483646] flex max-h-[82vh] w-[264px] max-w-[86vw] select-none flex-col rounded-xl border border-border bg-popover/95 px-2.5 pt-2 pb-2.5 text-[12px] leading-[1.4] text-popover-foreground shadow-lg backdrop-blur-sm"
			style={style}
		>
			<div className="mb-1.5 flex cursor-grab touch-none items-center gap-2 active:cursor-grabbing" onPointerDown={onHeaderPointerDown}>
				<span aria-hidden className="grid grid-cols-2 gap-[2px] p-px opacity-60">
					{['a', 'b', 'c', 'd', 'e', 'f'].map((k) => (
						<i key={k} className="block size-[3px] rounded-full bg-muted-foreground" />
					))}
				</span>
				<span className="flex-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">read-aloud · live</span>
				<button
					type="button"
					className="ra-close -my-1 -mr-1 cursor-pointer rounded border-0 bg-transparent px-1 py-0.5 text-[14px] leading-none text-muted-foreground transition-colors hover:text-foreground"
					aria-label="Hide read-aloud overlay"
					onClick={() => setReadAloudOverlayEnabled(false)}
				>
					×
				</button>
			</div>

			<div className="min-h-0 flex-1 overflow-auto">
				<Sep label="voice" />
				<Row label="rung" value={live?.rung ?? '—'} tone={live && (live.rung === 'openrouter-tts' || live.rung === 'kokoro') ? 'good' : 'none'} />
				<Row label="mode" value={live?.mode ?? '—'} tone={live?.mode === 'audio' ? 'good' : 'none'} />
				<Row label="ctx" value={live?.ctxState ?? '—'} tone={ctxTone} />
				<div className="mt-0.5 break-words font-mono text-[11px] text-muted-foreground">{live?.voice || '—'}</div>

				<Sep label="sync" />
				<Row label="spoken / cues" value={live ? `${live.spokenCount} / ${live.cueCount}` : '—'} tone={mismatch ? 'bad' : live ? 'good' : 'none'} />
				<Row label="cue / word" value={live ? `${live.activeCue} / ${live.activeWord}` : '—'} />
				<Row label="ahead now / peak" value={live ? `${live.aheadCues} / ${live.peakAhead}` : '—'} tone={live && live.peakAhead > 0 ? 'warn' : live ? 'good' : 'none'} />

				<Sep label="clock" />
				<Row label="reader ms" value={live?.elapsedMs ?? '—'} />
				<Row label="audio ms" value={live?.audioClockMs ?? '—'} />

				<Sep label="pace calibration" />
				<Row
					label="voice k / n"
					value={live?.calVoiceKey ? `${live.calK.toFixed(2)}× / ${live.calN}` : '—'}
					tone={live && live.calN >= 5 ? 'good' : live?.calVoiceKey ? 'warn' : 'none'}
				/>
				{live?.calVoiceKey ? (
					<button
						type="button"
						onClick={() => resetCalibration(live.calVoiceKey)}
						className="mt-1 shrink-0 cursor-pointer self-start rounded-md border border-border bg-transparent px-2 py-[3px] font-mono text-[10.5px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
					>
						reset this voice
					</button>
				) : null}

				<Sep label={`source · trace (${events.length})`} />
				<div className="break-words font-mono text-[10.5px] text-muted-foreground">{source}</div>
				<div className="mt-1 max-h-[24vh] overflow-auto rounded border border-border/60 bg-background/40 p-1 font-mono text-[10px] leading-tight">
					{events.length === 0 ? (
						<div className="text-muted-foreground/70">no events yet — press play</div>
					) : (
						events.map((e, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: append-only diagnostic log; entries never reorder.
							<div key={i} className={cn(e.kind === 'read' ? 'mt-1 font-semibold text-[var(--accent)]' : e.kind === 'timing' ? 'text-popover-foreground/80' : 'text-muted-foreground')}>
								{fmtEvent(e)}
							</div>
						))
					)}
				</div>
			</div>

			<button
				type="button"
				onClick={copyTrace}
				className="mt-2 shrink-0 cursor-pointer rounded-md border border-border bg-transparent px-2 py-1 font-mono text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
			>
				{copied ? 'copied ✓' : 'copy trace'}
			</button>
		</div>
	);

	if (typeof document === 'undefined') return null;
	return createPortal(panel, document.body);
}
