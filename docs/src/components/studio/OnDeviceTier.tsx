import { Check, Cpu, Download, Loader2 } from 'lucide-react';
import * as React from 'react';
import { Announce } from '@/lib/announce';
import { notify } from '@/lib/notify';
import { cn } from '@/lib/utils';
import { type ArchitectStatus, loadUniversalModel, setStudioTier, summonWebLLM, type TierProgress } from './architect';

// The on-device generation ladder — restored to the Workspace UI and made HONEST
// under Studio Policy B (connection ≠ active): a rung you pick actually becomes the
// active tier, even while OpenRouter stays connected (the engine honors the explicit
// pick — see architect-model.js `explicitTierWins`). So the "active" badge reflects
// the TRUE active tier (`status.generation`), never merely "loaded". Three tiers,
// each free + private (the deck never leaves the device):
//   • built-in   — the browser's Prompt API (Chrome/Edge), instant, no download
//   • WebLLM     — a stronger model on a desktop GPU (~1GB, WebGPU)
//   • universal  — Transformers.js on WASM (~350MB), runs everywhere

type Tier = 'prompt-api' | 'webllm' | 'universal';
type Phase = 'idle' | 'confirm' | 'loading' | 'error';
type RungState = { phase: Phase; pct: number; note?: string };

const RUNGS: { tier: Tier; title: string; detail: string; download?: string }[] = [
	{ tier: 'prompt-api', title: 'Browser built-in', detail: "The browser's own model (Chrome/Edge) — instant, no download." },
	{ tier: 'webllm', title: 'WebLLM', detail: 'A stronger model on your GPU.', download: '~1GB' },
	{ tier: 'universal', title: 'Universal (Transformers.js)', detail: 'Runs everywhere on WASM.', download: '~350MB' },
];

export function OnDeviceTier({ status }: { status: ArchitectStatus }) {
	const [state, setState] = React.useState<Record<Tier, RungState>>({
		'prompt-api': { phase: 'idle', pct: 0 },
		webllm: { phase: 'idle', pct: 0 },
		universal: { phase: 'idle', pct: 0 },
	});
	const aborts = React.useRef<Record<string, AbortController | null>>({ webllm: null, universal: null });
	const set = (tier: Tier, s: RungState) => setState((m) => ({ ...m, [tier]: s }));

	const isReady = (tier: Tier) =>
		tier === 'prompt-api' ? status.promptApi === 'available' : tier === 'webllm' ? status.webllmReady : status.universalReady;
	const isActive = (tier: Tier) => status.generation === tier;
	const disabledReason = (tier: Tier): string | null => {
		if (tier === 'prompt-api' && status.promptApi !== 'available' && status.generation !== 'prompt-api')
			return 'Not available in this browser — try Chrome or Edge, or the universal tier below.';
		if (tier === 'webllm' && !status.webgpu) return 'Needs WebGPU (a desktop browser with a GPU).';
		return null;
	};

	const activate = async (tier: Tier, title: string) => {
		await setStudioTier(tier);
		notify(`Now running on ${title} — on-device, private, $0.`);
	};

	const startLoad = async (tier: Tier, title: string, loader: (p: (x: TierProgress) => void, s: AbortSignal) => Promise<boolean>) => {
		const ctrl = new AbortController();
		aborts.current[tier] = ctrl;
		set(tier, { phase: 'loading', pct: 0 });
		const ok = await loader((p) => set(tier, { phase: 'loading', pct: Math.round((p.progress || 0) * 100) }), ctrl.signal);
		aborts.current[tier] = null;
		if (ok) {
			set(tier, { phase: 'idle', pct: 100 });
			await activate(tier, title); // a loaded tier becomes active immediately (that's why you loaded it)
		} else {
			// Distinguish a user cancel from a real failure.
			set(tier, ctrl.signal.aborted ? { phase: 'idle', pct: 0 } : { phase: 'error', pct: 0, note: `${title} could not load in this browser.` });
		}
	};
	const cancel = (tier: Tier) => {
		aborts.current[tier]?.abort();
		aborts.current[tier] = null;
		set(tier, { phase: 'idle', pct: 0 });
	};

	return (
		<div className="space-y-2.5">
			{RUNGS.map(({ tier, title, detail, download }) => {
				const s = state[tier];
				const ready = isReady(tier);
				const active = isActive(tier);
				const reason = disabledReason(tier);
				const loaderFor = tier === 'webllm' ? summonWebLLM : tier === 'universal' ? loadUniversalModel : null;
				return (
					<div key={tier} className={cn('rounded-xl border px-3 py-2.5', active ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-border')}>
						<div className="flex items-center gap-3">
							<span className={cn('grid size-[30px] shrink-0 place-items-center rounded-lg', active ? 'bg-primary text-primary-foreground' : 'bg-[var(--accent-soft)] text-[var(--accent)]')}>
								{active ? <Check className="size-4" /> : tier === 'prompt-api' ? <Cpu className="size-4" /> : <Download className="size-4" />}
							</span>
							<span className="min-w-0 flex-1">
								<span className="block text-[13px] font-semibold text-[var(--text-heading)]">{title}</span>
								<span className="block text-[11px] text-muted-foreground">
									{reason ? reason : active ? 'Running on this device' : ready ? 'Loaded — ready to use' : download ? `${detail} A one-time ${download} download.` : detail}
								</span>
							</span>
							{/* Action — reflects the TRUE state: active → badge; loaded → Use; else → Use / download. */}
							{active ? (
								<span className="shrink-0 font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]">active</span>
							) : s.phase === 'loading' ? (
								<button type="button" onClick={() => cancel(tier)} className="shrink-0 rounded-md border border-border px-2.5 py-1 text-[12px] font-semibold text-muted-foreground">
									<span className="flex items-center gap-1"><Loader2 className="size-3 animate-spin" />Cancel</span>
								</button>
							) : s.phase === 'confirm' ? (
								<span className="flex shrink-0 items-center gap-1.5">
									<button type="button" onClick={() => loaderFor && startLoad(tier, title, loaderFor)} className="rounded-md bg-primary px-2.5 py-1 text-[12px] font-semibold text-primary-foreground">Download {download}</button>
									<button type="button" onClick={() => set(tier, { phase: 'idle', pct: 0 })} className="rounded-md border border-border px-2 py-1 text-[12px] font-semibold text-muted-foreground">Cancel</button>
								</span>
							) : ready || !download ? (
								<button type="button" disabled={!!reason} onClick={() => activate(tier, title)} className="shrink-0 rounded-md border border-border px-2.5 py-1 text-[12px] font-semibold text-[var(--accent)] disabled:opacity-50">Use</button>
							) : (
								<button type="button" disabled={!!reason} onClick={() => set(tier, { phase: 'confirm', pct: 0 })} className="shrink-0 rounded-md border border-border px-2.5 py-1 text-[12px] font-semibold text-[var(--accent)] disabled:opacity-50">{`Get ${download}`}</button>
							)}
						</div>
						{s.phase === 'confirm' && <p className="mt-1.5 text-[11px] text-muted-foreground">Downloads {download} once, then runs entirely on your device.</p>}
						{s.phase === 'loading' && (
							<div className="mt-2 h-[5px] overflow-hidden rounded-full bg-border">
								<span className="block h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.max(4, s.pct)}%` }} />
							</div>
						)}
						{s.phase === 'error' && <p aria-hidden="true" className="mt-1.5 text-[11px] text-[var(--fail,#b3261e)]">{s.note ?? 'Could not load — try again.'}</p>}
						{/* Assertive: they asked for a download and are waiting on it. */}
						<Announce assertive message={s.phase === 'error' ? (s.note ?? 'Could not load — try again.') : null} />
					</div>
				);
			})}
			<p className="text-[11px] leading-relaxed text-muted-foreground">On-device tiers are free and private — your deck never leaves the browser. Ideal for cheap iteration; switch to Cloud for board-grade edits.</p>
		</div>
	);
}
