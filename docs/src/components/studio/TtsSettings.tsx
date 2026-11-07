import { Download, Loader2, PlayCircle } from 'lucide-react';
import * as React from 'react';
import { Slider } from '@/components/ui/slider';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Announce } from '@/lib/announce';
import { readVoiceSelection, selectVoice } from '@/lib/model-selection.js';
import { notify } from '@/lib/notify';
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
	ttsSpeed,
	type VoiceAvailability,
	voiceAvailability,
} from './read-aloud';
import { TtsModelPicker } from './TtsModelPicker';
import { KOKORO_MODEL_ID, NO_SPEED_HINT, resolveVoice, speedSupported, voiceResetOnModelChange, voicesForModel } from './tts-voice-catalog';
import { VoicePicker } from './VoicePicker';

// Read-aloud TTS settings. Which engine speaks is the author's VOICE SELECTION
// (lib/model-selection.js), independent of the chat model: the Cloud / On-device switch here
// SELECTS (active at once), it is never a view of the chat tier
// (engineering/decisions/2026-11-07-studio-model-spine.md). Each engine has its own
// MODEL-SPECIFIC voice + speed, on the SAME
// shared voice-model instance useReadAloud plays through, so a pick here is live
// on the next play with no separate download. The voice ROSTER is fetched live
// from OpenRouter (tts-voice-catalog.ts/read-aloud.ts's listTtsModels) — never a
// free-text field, since every model OpenRouter lists has real, published voices;
// see the redesign section of
// engineering/decisions/2026-07-09-studio-cloud-ondevice-config-split.md.

type KokoroLoad = { phase: 'idle' | 'confirm' | 'loading' | 'error'; pct: number; note?: string };

// Reuses the shared Slider primitive (@/components/ui/slider — already the
// Studio's established control, see FinishStudio.tsx's wash/texture/edge
// sliders) rather than a one-off native <input type="range"> — HARD RULE #15,
// don't fork a widget per surface. min/max/step below are the ONLY thing that
// constrains which values are selectable; both this primitive and a raw range
// input clamp identically to whatever bounds they're given, so "only viable
// values" is enforced by speedSupported() gating whether this renders AT ALL
// (SpeedSection, below) plus this fixed 0.75-1.5 range being live-tested safe
// for every engine that DOES support speed (see the decision doc) — not by
// which slider widget draws the track.
function SpeedControl({ value, onChange, disabled }: { value: number; onChange: (n: number) => void; disabled?: boolean }) {
	return (
		<div className="flex items-center gap-2.5">
			<Slider aria-label="Speech speed" min={0.75} max={1.5} step={0.05} value={value} onValueChange={onChange} disabled={disabled} className="flex-1" />
			<span className="w-[42px] shrink-0 text-right font-mono text-[12px] text-muted-foreground">{value.toFixed(2)}×</span>
		</div>
	);
}

/** The Speed section for one tier — a real, live slider when the ACTIVE model's
 *  `speed` param is verified to do something (speedSupported), or, when it
 *  isn't, no slider at all: a plain fixed-pace note in its place. A disabled-
 *  but-visible slider stuck at an arbitrary value would look like a broken
 *  control (drag it, hit Play, nothing changes) rather than an honest "this
 *  voice has no speed control" — the same reasoning VoicePicker already
 *  applies to a model with no voice roster (NO_VOICES_HINT, above). `disabled`
 *  is the ORTHOGONAL reason (tier not connected/downloaded yet) — still
 *  applies to the slider when speed IS supported. */
function SpeedSection({ modelId, value, onChange, disabled }: { modelId: string; value: number; onChange: (n: number) => void; disabled?: boolean }) {
	const ok = speedSupported(modelId);
	return (
		<div>
			<div className="mb-1.5 text-[13px] font-semibold leading-normal text-[var(--text-heading)]">Speed</div>
			{ok ? <SpeedControl value={value} onChange={onChange} disabled={disabled} /> : <p className="text-[12px] text-muted-foreground">{NO_SPEED_HINT}</p>}
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

/** The voice prefs as the stored selection holds them — read synchronously, so the first frame is final. */
function storedVoicePrefs() {
	const s = readVoiceSelection();
	const or = s.provider === 'openrouter' ? { model: s.model, voice: s.voice } : (s.last.openrouter ?? { model: '', voice: '' });
	const kokoro = s.provider === 'kokoro' ? s.voice : (s.last.kokoro?.voice ?? '');
	return { tier: (s.source === 'device' ? 'ondevice' : 'cloud') as 'cloud' | 'ondevice', orModel: or.model, orVoice: or.voice, kokoroVoice: kokoro || KOKORO_DEFAULT_VOICE };
}
const KOKORO_DEFAULT_VOICE = 'af_heart';
/** Until the voice module answers: nothing ready, nothing supported claimed — controls render in place, disabled. */
const PENDING_AVAIL: VoiceAvailability = { rung: 'silent', openRouterReady: false, kokoroReady: false, kokoroCached: false, kokoroSupported: true, webgpu: false, speechAllowed: false };

export function TtsSettings() {
	const initial = React.useMemo(storedVoicePrefs, []);
	const [avail, setAvail] = React.useState<VoiceAvailability>(PENDING_AVAIL);
	const [models, setModels] = React.useState<OrVoiceModel[] | null>(null);
	const [tier, setTier] = React.useState<'cloud' | 'ondevice'>(initial.tier);
	const [orModel, setOrModelState] = React.useState(initial.orModel);
	const [orVoice, setOrVoiceState] = React.useState(initial.orVoice);
	const [kokoroVoice, setKokoroVoiceState] = React.useState(initial.kokoroVoice);
	const [speed, setSpeedState] = React.useState(1);
	const [kokoroLoad, setKokoroLoad] = React.useState<KokoroLoad>({ phase: 'idle', pct: 0 });
	const [preview, setPreview] = React.useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
	const [modelPreview, setModelPreview] = React.useState<string | null>(null);
	const [voicePreview, setVoicePreview] = React.useState<string | null>(null);
	const abortRef = React.useRef<AbortController | null>(null);

	// Follow the stored selection and the engine's readiness: on mount, and whenever either
	// changes anywhere (this sheet, the export panel, another tab via the storage listener).
	// Sequence-guarded so an older answer never paints over a newer one.
	const seq = React.useRef(0);
	React.useEffect(() => {
		let live = true;
		const sync = () => {
			const p = storedVoicePrefs();
			setTier(p.tier);
			setOrModelState(p.orModel);
			setOrVoiceState(p.orVoice);
			setKokoroVoiceState(p.kokoroVoice);
			const mine = ++seq.current;
			Promise.all([voiceAvailability(), ttsSpeed()]).then(([a, sp]) => {
				if (!live || mine !== seq.current) return;
				setAvail(a);
				setSpeedState(sp);
			});
		};
		sync();
		window.addEventListener('db-model-changed', sync);
		window.addEventListener('db-voice-changed', sync);
		return () => {
			live = false;
			window.removeEventListener('db-model-changed', sync);
			window.removeEventListener('db-voice-changed', sync);
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

	// A stored voice id the live roster no longer lists (a catalog rename, a dropped voice) is
	// SHOWN as the roster's default, but never written back: only the author's pick writes the
	// selection (model spine). Picking a voice, or the model, stores it.
	const shownOrVoice = orModelVoices.length ? resolveVoice(orModelVoices, orVoice) : orVoice;
	const shownKokoroVoice = kokoroVoices.length ? resolveVoice(kokoroVoices, kokoroVoice) : kokoroVoice;

	const playPreview = React.useCallback(
		async (rung: 'openrouter' | 'kokoro', voiceOverride?: string) => {
			setPreview({ busy: true, error: null });
			const voice = voiceOverride ?? (rung === 'openrouter' ? shownOrVoice : shownKokoroVoice);
			// `model` lets previewTtsVoice check for a cached, pre-generated sample first
			// (local, free, instant) before falling back to a live API call — see
			// read-aloud.ts's cachedSampleUrl.
			const model = rung === 'openrouter' ? orModel : KOKORO_MODEL_ID;
			const res = await previewTtsVoice({ rung, voice, model, speed });
			setPreview({ busy: false, error: res.ok ? null : res.error || 'Could not play a sample.' });
		},
		[orModel, shownOrVoice, shownKokoroVoice, speed],
	);

	// Picking a MODEL resets the voice to that model's default when the current
	// pick isn't on its roster — a Kokoro voice id is meaningless for an OpenAI
	// model, and vice versa (see voiceResetOnModelChange).
	const pickOrModel = async (m: OrVoiceModel) => {
		setOrModelState(m.id);
		await setTtsOrModel(m.id);
		const roster = voicesForModel(m.id, m.voices);
		const next = voiceResetOnModelChange(roster, orVoice) || resolveVoice(roster, '');
		if (next) {
			setOrVoiceState(next);
			await setTtsOrVoice(next);
		}
		notify('Voice model updated — it reads aloud from now on.');
	};
	// The model-row Play button (in TtsModelPicker) previews that model's CURRENT
	// (or, if switching, its default) voice without requiring a separate model-pick
	// + voice-pick + Play round trip first.
	const playModelRow = async (m: OrVoiceModel) => {
		const roster = voicesForModel(m.id, m.voices);
		const voice = (m.id === orModel && orVoice) || resolveVoice(roster, '');
		if (!voice) return;
		setModelPreview(m.id);
		const res = await previewTtsVoice({ rung: 'openrouter', voice, model: m.id, speed });
		setModelPreview(null);
		if (!res.ok) notify(res.error || 'Could not play a sample.');
	};
	// The per-row ▶ in the voice dropdown: audition a voice WITHOUT selecting it (so you
	// can browse the list and hear each one before committing) — distinct from clicking
	// the row, which selects + closes + auto-previews. Uses the same cached-first path.
	const previewVoiceRow = React.useCallback(
		async (rung: 'openrouter' | 'kokoro', voice: string) => {
			const model = rung === 'openrouter' ? orModel : KOKORO_MODEL_ID;
			setVoicePreview(voice);
			const res = await previewTtsVoice({ rung, voice, model, speed });
			setVoicePreview((cur) => (cur === voice ? null : cur));
			if (!res.ok) notify(res.error || 'Could not play a sample.');
		},
		[orModel, speed],
	);
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

	// Choosing the engine IS selecting it: the voice reads from it at once (no "selected but not
	// active" state). The author's last pick on that engine comes back with it.
	const chooseTier = (next: string) => {
		if (next !== 'cloud' && next !== 'ondevice') return;
		setTier(next);
		selectVoice({ provider: next === 'cloud' ? 'openrouter' : 'kokoro' });
	};
	const r = avail.readiness;
	const badge = !r ? null : r.state === 'ready' ? 'active' : r.state === 'warming' ? 'loading' : r.state === 'needs-key' ? 'needs a key' : 'not loaded';
	const header = (
		<div className="mb-3 flex items-center gap-2">
			<ToggleGroup
				type="single"
				value={tier}
				onValueChange={chooseTier}
				aria-label="Voice engine"
				className="overflow-hidden rounded-md border border-border"
			>
				<ToggleGroupItem value="cloud" className="px-3 py-1 text-[12px] data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
					Cloud
				</ToggleGroupItem>
				<ToggleGroupItem value="ondevice" className="px-3 py-1 text-[12px] data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
					On-device
				</ToggleGroupItem>
			</ToggleGroup>
			{/* Readiness changes in place, as a badge: it never reflows the panel. */}
			<span data-testid="voice-readiness" className="min-w-[88px] font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]">
				{badge ?? '\u00a0'}
			</span>
		</div>
	);

	if (tier === 'cloud') {
		return (
			<div>
				{header}
				<div className="mb-2 text-[13px] font-semibold leading-normal text-[var(--text-heading)]">Voice model</div>
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
						modelId={effectiveOrModel}
						voices={orModelVoices}
						value={shownOrVoice}
						onPick={pickOrVoice}
						onPreview={(v) => previewVoiceRow('openrouter', v)}
						previewingId={voicePreview}
						disabled={!avail.openRouterReady}
					/>
				</div>

				<div className="mt-3">
					<SpeedSection modelId={effectiveOrModel} value={speed} onChange={changeSpeed} disabled={!avail.openRouterReady} />
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
			{header}
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
					{kokoroLoad.phase === 'error' && <p aria-hidden="true" className="mt-1.5 text-[11px] text-[var(--fail,#b3261e)]">{kokoroLoad.note}</p>}
					{/* Assertive: they asked for a download and are waiting on it. */}
					<Announce assertive message={kokoroLoad.phase === 'error' ? kokoroLoad.note : null} />
				</div>
			)}

			<div className="mt-3">
				<VoicePicker
					label="Voice"
					ariaLabel="On-device TTS voice"
					modelId={KOKORO_MODEL_ID}
					voices={kokoroVoices}
					value={shownKokoroVoice}
					onPick={pickKokoroVoice}
					onPreview={(v) => previewVoiceRow('kokoro', v)}
					previewingId={voicePreview}
					disabled={!ready}
				/>
				{!ready && <p className="mt-1 text-[11px] text-muted-foreground">Download the voice above to configure it.</p>}
			</div>

			<div className="mt-3">
				<SpeedSection modelId={KOKORO_MODEL_ID} value={speed} onChange={changeSpeed} disabled={!ready} />
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
