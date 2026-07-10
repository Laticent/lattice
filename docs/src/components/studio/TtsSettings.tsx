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
	stopTtsPreview,
	ttsKokoroVoice,
	ttsOrModel,
	ttsOrVoice,
	ttsSpeed,
	type VoiceAvailability,
	voiceAvailability,
} from './read-aloud';
import { TtsModelPicker } from './TtsModelPicker';
import { KOKORO_MODEL_ID, NO_VOICES_HINT, resolveVoice, type Voice, voiceResetOnModelChange, voicesForModel } from './tts-voice-catalog';

// Read-aloud TTS settings — the Cloud/On-device counterpart of ModelPicker (text
// generation): each engine gets its own MODEL-SPECIFIC voice + speed, on the SAME
// shared voice-model instance useReadAloud plays through, so a pick here is live
// on the next play with no separate download. The voice ROSTER is fetched live
// from OpenRouter (tts-voice-catalog.ts/read-aloud.ts's listTtsModels) — never a
// free-text field, since every model OpenRouter lists has real, published voices;
// see the redesign section of
// engineering/decisions/2026-07-09-studio-cloud-ondevice-config-split.md.

type KokoroLoad = { phase: 'idle' | 'confirm' | 'loading' | 'error'; pct: number; note?: string };

function SpeedControl({ value, onChange, disabled }: { value: number; onChange: (n: number) => void; disabled?: boolean }) {
	return (
		<div className="flex items-center gap-2.5">
			<input
				type="range"
				min={0.75}
				max={1.5}
				step={0.05}
				value={value}
				onChange={(e) => onChange(Number(e.target.value))}
				disabled={disabled}
				aria-label="Speech speed"
				className="h-1.5 flex-1 accent-[var(--accent)] disabled:opacity-50"
			/>
			<span className="w-[42px] shrink-0 text-right font-mono text-[12px] text-muted-foreground">{value.toFixed(2)}×</span>
		</div>
	);
}

function PreviewButton({ onClick, busy, disabled, disabledHint, error }: { onClick: () => void; busy: boolean; disabled: boolean; disabledHint?: string; error: string | null }) {
	return (
		<div className="mt-2">
			<button
				type="button"
				onClick={onClick}
				disabled={busy || disabled}
				className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[12px] font-semibold text-[var(--accent)] disabled:opacity-50"
			>
				{busy ? <Loader2 className="size-3.5 animate-spin" /> : <PlayCircle className="size-3.5" />}
				{busy ? 'Playing…' : 'Play sample'}
			</button>
			{disabled && disabledHint && <p className="mt-1 text-[11px] text-muted-foreground">{disabledHint}</p>}
			{error && <p className="mt-1 text-[11px] text-[var(--fail,#b3261e)]">{error}</p>}
		</div>
	);
}

/** A model-specific voice picker — ALWAYS a curated dropdown, never a field the
 *  user types a voice id into: every model OpenRouter publishes has a real,
 *  live-fetched roster, so there's nothing to type. Picking a voice fires `onPick`
 *  immediately — the caller auto-previews it, so browsing the dropdown is itself
 *  "a way to hear it". When `voices` is empty (a model with no published roster —
 *  a theoretical case today, since every live TTS model has one), this renders a
 *  DISABLED, explained field instead of an editable one — guessing a voice id
 *  blind is worse than admitting we don't have one. */
function VoicePicker({
	label,
	ariaLabel,
	voices,
	value,
	onPick,
	disabled,
}: {
	label: string;
	ariaLabel: string;
	voices: Voice[];
	value: string;
	onPick: (voiceId: string) => void;
	disabled?: boolean;
}) {
	if (!voices.length) {
		return (
			<div>
				<div className="mb-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
				<input
					type="text"
					value=""
					disabled
					placeholder="No published voices"
					aria-label={ariaLabel}
					className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-muted-foreground outline-none disabled:opacity-50"
				/>
				<p className="mt-1 text-[11px] text-muted-foreground">{NO_VOICES_HINT}</p>
			</div>
		);
	}
	return (
		<div>
			<div className="mb-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
			<Select value={value} onValueChange={onPick} disabled={disabled}>
				<SelectTrigger className="w-full" aria-label={ariaLabel}>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{voices.map((v) => (
						<SelectItem key={v.id} value={v.id}>
							{v.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}

export function TtsSettings({ tier, notify }: { tier: 'cloud' | 'ondevice'; notify: (msg: string) => void }) {
	const [avail, setAvail] = React.useState<VoiceAvailability | null>(null);
	const [models, setModels] = React.useState<OrVoiceModel[] | null>(null);
	const [orModel, setOrModelState] = React.useState('');
	const [orVoice, setOrVoiceState] = React.useState('');
	const [kokoroVoice, setKokoroVoiceState] = React.useState('');
	const [speed, setSpeedState] = React.useState(1);
	const [kokoroLoad, setKokoroLoad] = React.useState<KokoroLoad>({ phase: 'idle', pct: 0 });
	const [preview, setPreview] = React.useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
	const [modelPreview, setModelPreview] = React.useState<string | null>(null);
	const abortRef = React.useRef<AbortController | null>(null);

	React.useEffect(() => {
		let live = true;
		Promise.all([voiceAvailability(), ttsOrModel(), ttsOrVoice(), ttsKokoroVoice(), ttsSpeed()]).then(([a, m, ov, kv, sp]) => {
			if (!live) return;
			setAvail(a);
			setOrModelState(m);
			setOrVoiceState(ov);
			setKokoroVoiceState(kv);
			setSpeedState(sp);
		});
		return () => {
			live = false;
		};
	}, []);

	// Re-fetch availability whenever it changes ELSEWHERE in the same open Workspace
	// sheet — e.g. clicking Disconnect in the Model section above, or a tier/voice
	// summon completing. Without this, `avail` is a one-time snapshot from mount
	// and the TTS controls can sit enabled against a connection that's since died
	// (a live contradiction with the Model/Spend sections, which DO re-render).
	// Mirrors useArchitectStatus's own `db-model-changed` listener in architect.ts.
	React.useEffect(() => {
		const onChange = () => {
			voiceAvailability().then(setAvail);
		};
		window.addEventListener('db-model-changed', onChange);
		window.addEventListener('db-voice-changed', onChange);
		return () => {
			window.removeEventListener('db-model-changed', onChange);
			window.removeEventListener('db-voice-changed', onChange);
		};
	}, []);

	// Stop any in-flight preview on unmount (Workspace sheet closing, tab switch) —
	// mirrors useReadAloud's own unmount cleanup; without it a sample started just
	// before close keeps playing to the end of its fixed sentence.
	React.useEffect(() => {
		return () => {
			stopTtsPreview();
		};
	}, []);

	// The live TTS catalog (id/name/pricing/published voices) is fetched regardless
	// of tier — it's public and unauthenticated, and BOTH tiers need it: the cloud
	// picker for its model list, the on-device picker for Kokoro's own published
	// roster (the SAME catalog entry, hexgrad/kokoro-82m, backs both the on-device
	// engine's fixed model id and its optional hosted-cloud selection).
	React.useEffect(() => {
		if (models) return;
		let live = true;
		listTtsModels().then((l) => {
			if (live) setModels(l);
		});
		return () => {
			live = false;
		};
	}, [models]);

	// An unset orModel means "the connect-time default" (Kokoro), not a literal
	// empty-string model id — resolve it before looking the model up in the fetched
	// catalog, or the lookup misses and the roster comes back empty.
	const effectiveOrModel = orModel || KOKORO_MODEL_ID;
	const orModelVoices = React.useMemo(
		() => voicesForModel(effectiveOrModel, models?.find((m) => m.id === effectiveOrModel)?.voices ?? []),
		[effectiveOrModel, models],
	);
	const kokoroVoices = React.useMemo(
		() => voicesForModel(KOKORO_MODEL_ID, models?.find((m) => m.id === KOKORO_MODEL_ID)?.voices ?? []),
		[models],
	);

	const playPreview = React.useCallback(
		async (rung: 'openrouter' | 'kokoro', voiceOverride?: string) => {
			setPreview({ busy: true, error: null });
			const voice = voiceOverride ?? (rung === 'openrouter' ? orVoice : kokoroVoice);
			// `model` lets previewTtsVoice check for a cached, pre-generated sample first
			// (local, free, instant) before falling back to a live API call — see
			// read-aloud.ts's cachedSampleUrl.
			const model = rung === 'openrouter' ? orModel : KOKORO_MODEL_ID;
			const res = await previewTtsVoice({ rung, voice, model, speed });
			setPreview({ busy: false, error: res.ok ? null : res.error || 'Could not play a sample.' });
		},
		[orModel, orVoice, kokoroVoice, speed],
	);

	// Picking a MODEL resets the voice to that model's default when the current
	// pick isn't on its roster — a Kokoro voice id is meaningless for an OpenAI
	// model, and vice versa (see voiceResetOnModelChange).
	const pickOrModel = async (m: OrVoiceModel) => {
		setOrModelState(m.id);
		await setTtsOrModel(m.id);
		const roster = voicesForModel(m.id, m.voices);
		const next = voiceResetOnModelChange(roster, orVoice);
		if (next) {
			setOrVoiceState(next);
			await setTtsOrVoice(next);
		}
		notify('TTS model updated.');
	};
	// The model-row Play button (in TtsModelPicker) previews that model's CURRENT
	// (or, if switching, its default) voice without requiring a separate model-pick
	// + voice-pick + Play round trip first.
	const playModelRow = async (m: OrVoiceModel) => {
		const roster = voicesForModel(m.id, m.voices);
		const voice = (m.id === orModel ? orVoice : null) ?? resolveVoice(roster, '');
		if (!voice) return;
		setModelPreview(m.id);
		const res = await previewTtsVoice({ rung: 'openrouter', voice, model: m.id, speed });
		setModelPreview(null);
		if (!res.ok) notify(res.error || 'Could not play a sample.');
	};
	const pickOrVoice = async (v: string) => {
		setOrVoiceState(v);
		await setTtsOrVoice(v);
		if (avail?.openRouterReady) playPreview('openrouter', v);
	};
	const pickKokoroVoice = async (v: string) => {
		setKokoroVoiceState(v);
		await setTtsKokoroVoice(v);
		if (avail?.kokoroReady) playPreview('kokoro', v);
	};
	const changeSpeed = async (n: number) => {
		setSpeedState(n);
		await setTtsSpeed(n);
	};

	const startKokoroLoad = async () => {
		const ctrl = new AbortController();
		abortRef.current = ctrl;
		setKokoroLoad({ phase: 'loading', pct: 0 });
		const ok = await loadTtsKokoro((p) => setKokoroLoad({ phase: 'loading', pct: Math.round((p.progress || 0) * 100) }), ctrl.signal);
		abortRef.current = null;
		if (ok) {
			setKokoroLoad({ phase: 'idle', pct: 100 });
			const a = await voiceAvailability();
			setAvail(a);
			notify('On-device voice ready.');
			if (a.kokoroReady) playPreview('kokoro'); // hear the default voice the moment it's ready
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
				<TtsModelPicker
					models={models}
					selectedId={orModel}
					onPick={pickOrModel}
					onPlay={playModelRow}
					playingId={modelPreview}
					disabled={!avail.openRouterReady}
				/>
				<p className="mt-1.5 text-[11px] text-muted-foreground">
					{avail.openRouterReady
						? 'Defaults to hosted Kokoro — by far the cheapest.'
						: 'Connect OpenRouter above to configure the cloud voice.'}
				</p>

				<div className="mt-3">
					<VoicePicker
						label="Voice"
						ariaLabel="Cloud TTS voice"
						voices={orModelVoices}
						value={orVoice}
						onPick={pickOrVoice}
						disabled={!avail.openRouterReady}
					/>
				</div>

				<div className="mt-3">
					<div className="mb-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Speed</div>
					<SpeedControl value={speed} onChange={changeSpeed} disabled={!avail.openRouterReady} />
				</div>

				<PreviewButton
					onClick={() => playPreview('openrouter')}
					busy={preview.busy}
					disabled={!avail.openRouterReady}
					disabledHint="Connect OpenRouter above to hear a sample or use this voice for read-aloud."
					error={preview.error}
				/>
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
				<VoicePicker
					label="Voice"
					ariaLabel="On-device TTS voice"
					voices={kokoroVoices}
					value={kokoroVoice}
					onPick={pickKokoroVoice}
					disabled={!ready}
				/>
				{!ready && <p className="mt-1 text-[11px] text-muted-foreground">Download the voice above to configure it.</p>}
			</div>

			<div className="mt-3">
				<div className="mb-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Speed</div>
				<SpeedControl value={speed} onChange={changeSpeed} disabled={!ready} />
			</div>

			<PreviewButton
				onClick={() => playPreview('kokoro')}
				busy={preview.busy}
				disabled={!ready}
				disabledHint="Download the voice above to hear a sample."
				error={preview.error}
			/>
			<p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">On-device voice is free and private — narration never leaves the browser.</p>
		</div>
	);
}
