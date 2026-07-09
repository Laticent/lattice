import { Download, Loader2, PlayCircle } from 'lucide-react';
import * as React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
	listTtsModels,
	loadTtsKokoro,
	type OrVoiceModel,
	previewTtsVoice,
	setTtsKokoroVoice,
	setTtsOrModel,
	setTtsOrVoice,
	setTtsSpeed,
	ttsKokoroVoice,
	ttsOrModel,
	ttsOrVoice,
	ttsSpeed,
	type VoiceAvailability,
	voiceAvailability,
} from './read-aloud';

// Read-aloud TTS settings — the Cloud/On-device counterpart of ModelPicker (text
// generation): each engine gets its own voice + speed, on the SAME shared voice-
// model instance useReadAloud plays through, so a pick here is live on the next
// play with no separate download. See engineering/decisions/2026-07-09-studio-
// cloud-ondevice-config-split.md. Kokoro doesn't expose a live voice catalog, so
// its picker is a curated, clearly-labeled subset + a free-text "Other" escape
// hatch — not a claim of completeness it can't back up.
const KOKORO_VOICES: { id: string; label: string }[] = [
	{ id: 'af_heart', label: 'Heart · US, warm (default)' },
	{ id: 'af_bella', label: 'Bella · US' },
	{ id: 'af_nova', label: 'Nova · US' },
	{ id: 'af_sarah', label: 'Sarah · US' },
	{ id: 'am_adam', label: 'Adam · US' },
	{ id: 'am_michael', label: 'Michael · US' },
	{ id: 'am_puck', label: 'Puck · US' },
	{ id: 'bf_emma', label: 'Emma · UK' },
	{ id: 'bm_george', label: 'George · UK' },
	{ id: 'bm_lewis', label: 'Lewis · UK' },
];
const KOKORO_OTHER = '__other__';

type KokoroLoad = { phase: 'idle' | 'confirm' | 'loading' | 'error'; pct: number; note?: string };

function SpeedControl({ value, onChange }: { value: number; onChange: (n: number) => void }) {
	return (
		<div className="flex items-center gap-2.5">
			<input
				type="range"
				min={0.75}
				max={1.5}
				step={0.05}
				value={value}
				onChange={(e) => onChange(Number(e.target.value))}
				aria-label="Speech speed"
				className="h-1.5 flex-1 accent-[var(--accent)]"
			/>
			<span className="w-[42px] shrink-0 text-right font-mono text-[12px] text-muted-foreground">{value.toFixed(2)}×</span>
		</div>
	);
}

function PreviewButton({ onClick, busy, error }: { onClick: () => void; busy: boolean; error: string | null }) {
	return (
		<div className="mt-2">
			<button
				type="button"
				onClick={onClick}
				disabled={busy}
				className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[12px] font-semibold text-[var(--accent)] disabled:opacity-50"
			>
				{busy ? <Loader2 className="size-3.5 animate-spin" /> : <PlayCircle className="size-3.5" />}
				{busy ? 'Playing…' : 'Play sample'}
			</button>
			{error && <p className="mt-1 text-[11px] text-[var(--fail,#b3261e)]">{error}</p>}
		</div>
	);
}

export function TtsSettings({ tier, notify }: { tier: 'cloud' | 'ondevice'; notify: (msg: string) => void }) {
	const [avail, setAvail] = React.useState<VoiceAvailability | null>(null);
	const [models, setModels] = React.useState<OrVoiceModel[] | null>(null);
	const [orModel, setOrModelState] = React.useState('');
	const [orVoice, setOrVoiceState] = React.useState('');
	const [kokoroVoice, setKokoroVoiceState] = React.useState('');
	const [kokoroOther, setKokoroOther] = React.useState('');
	const [speed, setSpeedState] = React.useState(1);
	const [kokoroLoad, setKokoroLoad] = React.useState<KokoroLoad>({ phase: 'idle', pct: 0 });
	const [preview, setPreview] = React.useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
	const abortRef = React.useRef<AbortController | null>(null);

	React.useEffect(() => {
		let live = true;
		Promise.all([voiceAvailability(), ttsOrModel(), ttsOrVoice(), ttsKokoroVoice(), ttsSpeed()]).then(([a, m, ov, kv, sp]) => {
			if (!live) return;
			setAvail(a);
			setOrModelState(m);
			setOrVoiceState(ov);
			const known = KOKORO_VOICES.some((v) => v.id === kv);
			setKokoroVoiceState(known || !kv ? kv || 'af_heart' : KOKORO_OTHER);
			if (!known && kv) setKokoroOther(kv);
			setSpeedState(sp);
		});
		return () => {
			live = false;
		};
	}, []);

	React.useEffect(() => {
		if (tier !== 'cloud' || models) return;
		let live = true;
		listTtsModels().then((l) => {
			if (live) setModels(l);
		});
		return () => {
			live = false;
		};
	}, [tier, models]);

	const pickOrModel = async (id: string) => {
		setOrModelState(id);
		await setTtsOrModel(id);
		notify('TTS model updated.');
	};
	const pickOrVoice = async (v: string) => {
		setOrVoiceState(v);
		await setTtsOrVoice(v);
	};
	const pickKokoroVoice = async (v: string) => {
		setKokoroVoiceState(v);
		if (v !== KOKORO_OTHER) await setTtsKokoroVoice(v);
		else if (kokoroOther) await setTtsKokoroVoice(kokoroOther);
	};
	const commitKokoroOther = async (v: string) => {
		setKokoroOther(v);
		if (v.trim()) await setTtsKokoroVoice(v.trim());
	};
	const changeSpeed = async (n: number) => {
		setSpeedState(n);
		await setTtsSpeed(n);
	};

	const playPreview = async (rung: 'openrouter' | 'kokoro') => {
		setPreview({ busy: true, error: null });
		const voice = rung === 'openrouter' ? orVoice : kokoroVoice === KOKORO_OTHER ? kokoroOther : kokoroVoice;
		const res = await previewTtsVoice({ rung, voice, speed });
		setPreview({ busy: false, error: res.ok ? null : res.error || 'Could not play a sample.' });
	};

	const startKokoroLoad = async () => {
		const ctrl = new AbortController();
		abortRef.current = ctrl;
		setKokoroLoad({ phase: 'loading', pct: 0 });
		const ok = await loadTtsKokoro((p) => setKokoroLoad({ phase: 'loading', pct: Math.round((p.progress || 0) * 100) }), ctrl.signal);
		abortRef.current = null;
		if (ok) {
			setKokoroLoad({ phase: 'idle', pct: 100 });
			voiceAvailability().then(setAvail);
			notify('On-device voice ready.');
		} else {
			setKokoroLoad(ctrl.signal.aborted ? { phase: 'idle', pct: 0 } : { phase: 'error', pct: 0, note: 'Could not load in this browser.' });
		}
	};
	const cancelKokoroLoad = () => {
		abortRef.current?.abort();
		abortRef.current = null;
		setKokoroLoad({ phase: 'idle', pct: 0 });
	};

	if (!avail) return null;

	if (tier === 'cloud') {
		return (
			<div>
				<div className="mb-2 font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Voice model</div>
				<Select value={orModel} onValueChange={pickOrModel}>
					<SelectTrigger className="w-full" aria-label="Cloud TTS model">
						<SelectValue placeholder="hexgrad/kokoro-82m (default, cheapest)" />
					</SelectTrigger>
					<SelectContent>
						{(models ?? []).map((m) => (
							<SelectItem key={m.id} value={m.id}>
								{m.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<p className="mt-1.5 text-[11px] text-muted-foreground">{models === null ? 'Loading the OpenRouter voice catalog…' : `${models.length} speech model${models.length === 1 ? '' : 's'} available.`} Defaults to hosted Kokoro — by far the cheapest.</p>

				<div className="mt-3">
					<label htmlFor="tts-or-voice" className="mb-1.5 block font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Voice id</label>
					<input
						id="tts-or-voice"
						type="text"
						value={orVoice}
						onChange={(e) => pickOrVoice(e.target.value)}
						placeholder="af_heart"
						className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none focus:border-[var(--accent)]"
					/>
					<p className="mt-1 text-[11px] text-muted-foreground">Voice ids are model-specific (Kokoro's own af_*/am_* ids; an OpenAI-style model uses alloy/nova/…) — check the model's OpenRouter page.</p>
				</div>

				<div className="mt-3">
					<div className="mb-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Speed</div>
					<SpeedControl value={speed} onChange={changeSpeed} />
				</div>

				<PreviewButton onClick={() => playPreview('openrouter')} busy={preview.busy} error={preview.error} />
				{!avail.openRouterReady && <p className="mt-2 text-[11px] text-muted-foreground">Connect OpenRouter above to hear a sample or use this voice for read-aloud.</p>}
			</div>
		);
	}

	// on-device (Kokoro)
	const ready = avail.kokoroReady;
	const cached = avail.kokoroCached;
	return (
		<div>
			{!avail.kokoroSupported ? (
				<p className="text-[11px] text-muted-foreground">On-device voice needs a desktop browser — this device uses the cloud voice for read-aloud instead.</p>
			) : (
				<div>
					<div className={cn('flex items-center gap-3 rounded-xl border px-3 py-2.5', ready ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-border')}>
						<span className={cn('grid size-[30px] shrink-0 place-items-center rounded-lg', ready ? 'bg-primary text-primary-foreground' : 'bg-[var(--accent-soft)] text-[var(--accent)]')}>
							<Download className="size-4" />
						</span>
						<span className="min-w-0 flex-1">
							<span className="block text-[13px] font-semibold text-[var(--text-heading)]">Kokoro (on-device)</span>
							<span className="block text-[11px] text-muted-foreground">{ready ? 'Loaded — ready to use' : cached ? 'Downloaded — loads fast from cache' : 'A one-time ~80MB download, then runs entirely on this device.'}</span>
						</span>
						{kokoroLoad.phase === 'loading' ? (
							<button type="button" onClick={cancelKokoroLoad} className="shrink-0 rounded-md border border-border px-2.5 py-1 text-[12px] font-semibold text-muted-foreground">
								<span className="flex items-center gap-1"><Loader2 className="size-3 animate-spin" />Cancel</span>
							</button>
						) : kokoroLoad.phase === 'confirm' ? (
							<span className="flex shrink-0 items-center gap-1.5">
								<button type="button" onClick={startKokoroLoad} className="rounded-md bg-primary px-2.5 py-1 text-[12px] font-semibold text-primary-foreground">Download</button>
								<button type="button" onClick={() => setKokoroLoad({ phase: 'idle', pct: 0 })} className="rounded-md border border-border px-2 py-1 text-[12px] font-semibold text-muted-foreground">Cancel</button>
							</span>
						) : ready ? (
							<span className="shrink-0 font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]">ready</span>
						) : (
							<button type="button" onClick={() => setKokoroLoad({ phase: 'confirm', pct: 0 })} className="shrink-0 rounded-md border border-border px-2.5 py-1 text-[12px] font-semibold text-[var(--accent)]">{cached ? 'Load' : 'Get ~80MB'}</button>
						)}
					</div>
					{kokoroLoad.phase === 'loading' && (
						<div className="mt-2 h-[5px] overflow-hidden rounded-full bg-border">
							<span className="block h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.max(4, kokoroLoad.pct)}%` }} />
						</div>
					)}
					{kokoroLoad.phase === 'error' && <p className="mt-1.5 text-[11px] text-[var(--fail,#b3261e)]">{kokoroLoad.note}</p>}
				</div>
			)}

			<div className="mt-3">
				<div className="mb-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Voice</div>
				<Select value={kokoroVoice} onValueChange={pickKokoroVoice}>
					<SelectTrigger className="w-full" aria-label="On-device TTS voice">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{KOKORO_VOICES.map((v) => (
							<SelectItem key={v.id} value={v.id}>
								{v.label}
							</SelectItem>
						))}
						<SelectItem value={KOKORO_OTHER}>Other (enter a voice id)…</SelectItem>
					</SelectContent>
				</Select>
				{kokoroVoice === KOKORO_OTHER && (
					<input
						type="text"
						value={kokoroOther}
						onChange={(e) => commitKokoroOther(e.target.value)}
						placeholder="e.g. jf_alpha"
						aria-label="Custom Kokoro voice id"
						className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none focus:border-[var(--accent)]"
					/>
				)}
			</div>

			<div className="mt-3">
				<div className="mb-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Speed</div>
				<SpeedControl value={speed} onChange={changeSpeed} />
			</div>

			{ready && <PreviewButton onClick={() => playPreview('kokoro')} busy={preview.busy} error={preview.error} />}
			<p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">On-device voice is free and private — narration never leaves the browser.</p>
		</div>
	);
}
