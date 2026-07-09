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

// Read-aloud TTS settings — the Cloud/On-device counterpart of ModelPicker (text
// generation): each engine gets its own MODEL-SPECIFIC voice + speed, on the SAME
// shared voice-model instance useReadAloud plays through, so a pick here is live
// on the next play with no separate download. See engineering/decisions/2026-07-
// 09-studio-cloud-ondevice-config-split.md. Voice rosters aren't exposed by a live
// catalog (OpenRouter's /models doesn't enumerate a TTS model's voices; Kokoro has
// no such endpoint at all), so each picker is a curated, clearly-labeled subset +
// a free-text "Other" escape hatch — not a claim of completeness it can't back up.
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
// OpenAI's TTS voice set is a small, stable, publicly documented roster (unlike
// Kokoro's, it isn't the SAME list the on-device engine uses — OpenAI-family cloud
// models only).
const OPENAI_VOICES: { id: string; label: string }[] = [
	{ id: 'alloy', label: 'Alloy' },
	{ id: 'echo', label: 'Echo' },
	{ id: 'fable', label: 'Fable' },
	{ id: 'onyx', label: 'Onyx' },
	{ id: 'nova', label: 'Nova' },
	{ id: 'shimmer', label: 'Shimmer' },
];
export const OTHER = '__other__';

/** The curated voice roster for a cloud model id, or [] when the model is
 *  unrecognized (the picker then falls back to a plain free-text field — guessing
 *  a wrong roster is worse than admitting we don't know it). Kokoro is also the
 *  connect-time default, so an empty/unset model id resolves to its roster too.
 *  Exported for unit tests (pure, no Radix/jsdom interaction needed to cover it). */
export function voicesForModel(modelId: string): { id: string; label: string }[] {
	const id = (modelId || '').toLowerCase();
	if (!id || id.includes('kokoro')) return KOKORO_VOICES;
	if (id.startsWith('openai/')) return OPENAI_VOICES;
	return [];
}

/** The voice-reset decision for a cloud MODEL switch: if the new model's roster is
 *  non-empty and doesn't already contain the currently effective voice, returns the
 *  roster's default id to reset to; otherwise null (no reset). Deliberately null —
 *  not an empty-string reset — when the new roster is EMPTY (an unrecognized
 *  model): free text is valid for any model, so there's nothing to reset FROM/TO,
 *  and resetting there would blank the visible field without persisting the clear
 *  (a UI/storage desync where the old value silently reappears on next reload).
 *  Exported for unit tests (pure, no Radix/jsdom interaction needed to cover it). */
export function voiceResetOnModelChange(newModelId: string, currentVoice: string): string | null {
	const roster = voicesForModel(newModelId);
	if (roster.length && !roster.some((v) => v.id === currentVoice)) return roster[0].id;
	return null;
}

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

/** A model-specific voice picker: a curated dropdown (with each voice's name) + a
 *  free-text "Other" escape hatch for a voice id outside the curated roster. Picking
 *  a CURATED voice fires `onPick` immediately — the caller auto-previews it, so
 *  browsing the dropdown is itself "a way to hear it" (see the decision doc). The
 *  free-text path does not auto-preview (it fires on every keystroke otherwise);
 *  the shared Play-sample button covers it. When `voices` is empty (an
 *  unrecognized model), this renders a plain free-text field only. */
function VoicePicker({
	label,
	ariaLabel,
	voices,
	selectValue,
	otherValue,
	onPick,
	onOtherChange,
	disabled,
}: {
	label: string;
	ariaLabel: string;
	voices: { id: string; label: string }[];
	selectValue: string;
	otherValue: string;
	onPick: (voiceId: string) => void;
	onOtherChange: (text: string) => void;
	disabled?: boolean;
}) {
	if (!voices.length) {
		return (
			<div>
				<div className="mb-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
				<input
					type="text"
					value={otherValue}
					onChange={(e) => onOtherChange(e.target.value)}
					disabled={disabled}
					placeholder="e.g. alloy"
					aria-label={ariaLabel}
					className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none focus:border-[var(--accent)] disabled:opacity-50"
				/>
				<p className="mt-1 text-[11px] text-muted-foreground">Unrecognized model — enter its voice id directly (check the model's OpenRouter page).</p>
			</div>
		);
	}
	return (
		<div>
			<div className="mb-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
			<Select value={selectValue} onValueChange={(v) => (v === OTHER ? onOtherChange(otherValue) : onPick(v))} disabled={disabled}>
				<SelectTrigger className="w-full" aria-label={ariaLabel}>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{voices.map((v) => (
						<SelectItem key={v.id} value={v.id}>
							{v.label}
						</SelectItem>
					))}
					<SelectItem value={OTHER}>Other (enter a voice id)…</SelectItem>
				</SelectContent>
			</Select>
			{selectValue === OTHER && (
				<input
					type="text"
					value={otherValue}
					onChange={(e) => onOtherChange(e.target.value)}
					disabled={disabled}
					placeholder="e.g. jf_alpha"
					aria-label={`Custom ${ariaLabel.toLowerCase()}`}
					className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none focus:border-[var(--accent)] disabled:opacity-50"
				/>
			)}
		</div>
	);
}

/** Resolve a stored voice id against a curated roster: either the id itself (known)
 *  or the OTHER sentinel (unknown — the free text holds the real value). Exported
 *  for unit tests. */
export function resolveVoice(voices: { id: string; label: string }[], stored: string): { select: string; other: string } {
	if (!stored) return { select: voices[0]?.id ?? OTHER, other: '' };
	if (voices.some((v) => v.id === stored)) return { select: stored, other: '' };
	return { select: OTHER, other: stored };
}

export function TtsSettings({ tier, notify }: { tier: 'cloud' | 'ondevice'; notify: (msg: string) => void }) {
	const [avail, setAvail] = React.useState<VoiceAvailability | null>(null);
	const [models, setModels] = React.useState<OrVoiceModel[] | null>(null);
	const [orModel, setOrModelState] = React.useState('');
	const [orVoiceSelect, setOrVoiceSelect] = React.useState('');
	const [orVoiceOther, setOrVoiceOther] = React.useState('');
	const [kokoroVoiceSelect, setKokoroVoiceSelect] = React.useState('');
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
			const or = resolveVoice(voicesForModel(m), ov);
			setOrVoiceSelect(or.select);
			setOrVoiceOther(or.other);
			const kok = resolveVoice(KOKORO_VOICES, kv);
			setKokoroVoiceSelect(kok.select);
			setKokoroOther(kok.other);
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

	const orVoiceEffective = orVoiceSelect === OTHER ? orVoiceOther : orVoiceSelect;
	const kokoroVoiceEffective = kokoroVoiceSelect === OTHER ? kokoroOther : kokoroVoiceSelect;

	const playPreview = React.useCallback(
		async (rung: 'openrouter' | 'kokoro', voiceOverride?: string) => {
			setPreview({ busy: true, error: null });
			const voice = voiceOverride ?? (rung === 'openrouter' ? orVoiceEffective : kokoroVoiceEffective);
			const res = await previewTtsVoice({ rung, voice, speed });
			setPreview({ busy: false, error: res.ok ? null : res.error || 'Could not play a sample.' });
		},
		[orVoiceEffective, kokoroVoiceEffective, speed],
	);

	// Picking a MODEL resets the voice to that model's default when the current
	// pick isn't on its roster — a Kokoro voice id is meaningless for an OpenAI
	// model, and vice versa (see voiceResetOnModelChange).
	const pickOrModel = async (id: string) => {
		setOrModelState(id);
		await setTtsOrModel(id);
		const next = voiceResetOnModelChange(id, orVoiceEffective);
		if (next) {
			setOrVoiceSelect(next);
			setOrVoiceOther('');
			await setTtsOrVoice(next);
		}
		notify('TTS model updated.');
	};
	const pickOrVoice = async (v: string) => {
		setOrVoiceSelect(v);
		await setTtsOrVoice(v);
		if (avail?.openRouterReady) playPreview('openrouter', v);
	};
	const changeOrVoiceOther = async (v: string) => {
		setOrVoiceOther(v);
		if (v.trim()) await setTtsOrVoice(v.trim());
	};
	const pickKokoroVoice = async (v: string) => {
		setKokoroVoiceSelect(v);
		await setTtsKokoroVoice(v);
		if (avail?.kokoroReady) playPreview('kokoro', v);
	};
	const changeKokoroOther = async (v: string) => {
		setKokoroOther(v);
		if (v.trim()) await setTtsKokoroVoice(v.trim());
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
				<Select value={orModel} onValueChange={pickOrModel} disabled={!avail.openRouterReady}>
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
				<p className="mt-1.5 text-[11px] text-muted-foreground">
					{avail.openRouterReady
						? `${models === null ? 'Loading the OpenRouter voice catalog…' : `${models.length} speech model${models.length === 1 ? '' : 's'} available.`} Defaults to hosted Kokoro — by far the cheapest.`
						: 'Connect OpenRouter above to configure the cloud voice.'}
				</p>

				<div className="mt-3">
					<VoicePicker
						label="Voice"
						ariaLabel="Cloud TTS voice"
						voices={voicesForModel(orModel)}
						selectValue={orVoiceSelect}
						otherValue={orVoiceOther}
						onPick={pickOrVoice}
						onOtherChange={changeOrVoiceOther}
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
					voices={KOKORO_VOICES}
					selectValue={kokoroVoiceSelect}
					otherValue={kokoroOther}
					onPick={pickKokoroVoice}
					onOtherChange={changeKokoroOther}
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
