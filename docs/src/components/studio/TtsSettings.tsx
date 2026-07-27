import { Check, ChevronDown, Download, Loader2, Mars, PlayCircle, Venus } from 'lucide-react';
import * as React from 'react';
import { Slider } from '@/components/ui/slider';
import { Tip } from '@/components/ui/tooltip';
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
import { countryName, flagSrc, groupVoices, KOKORO_MODEL_ID, NO_SPEED_HINT, NO_VOICES_HINT, resolveVoice, speedSupported, type Voice, voiceResetOnModelChange, voicesForModel } from './tts-voice-catalog';

// Read-aloud TTS settings — the Cloud/On-device counterpart of ModelPicker (text
// generation): each engine gets its own MODEL-SPECIFIC voice + speed, on the SAME
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

/** A model-specific voice picker — ALWAYS a curated dropdown, never a field the
 *  user types a voice id into: every model OpenRouter publishes has a real,
 *  live-fetched roster, so there's nothing to type. Picking a voice fires `onPick`
 *  immediately — the caller auto-previews it, so browsing the dropdown is itself
 *  "a way to hear it". When `voices` is empty (a model with no published roster —
 *  a theoretical case today, since every live TTS model has one), this renders a
 *  DISABLED, explained field instead of an editable one — guessing a voice id
 *  blind is worse than admitting we don't have one. */
// A ♀/♂ adornment for a voice row whose gender we know (Kokoro from its id; the other
// engines from the catalog's curated voiceGenders map). Absent — not a placeholder —
// where the gender is unknown, so the row stays clean. Lucide Venus/Mars icons (not a
// text glyph), tinted to match the voice name (inherits `currentColor`), to match the
// rest of the Studio's icon set.
function GenderMark({ gender }: { gender?: 'F' | 'M' }) {
	if (!gender) return null;
	const Icon = gender === 'F' ? Venus : Mars;
	const label = gender === 'F' ? 'Female' : 'Male';
	return <Icon role="img" aria-label={label} className="size-3.5 shrink-0" />;
}

// A country flag for a voice row whose language maps to a country (Kokoro/Voxtral/MAI/
// Zonos). Replaces the old "· US" text suffix — the flag sits next to the gender icon.
// A vendored SVG (flagSrc → /flags/<cc>.svg) rather than an emoji, so it renders
// identically on every platform (including Windows, which can't draw flag emoji). Only
// the flags actually shown are fetched; the rest are inert static assets. Absent for a
// language-agnostic engine (Gemini). Hidden on a load error rather than a broken image.
function FlagMark({ country }: { country?: string }) {
	const [failed, setFailed] = React.useState(false);
	const src = flagSrc(country);
	if (!src || failed) return null;
	const name = countryName(country);
	return <img src={src} alt={name} title={name} loading="lazy" onError={() => setFailed(true)} className="h-3 w-4 shrink-0 rounded-[1px] object-cover" />;
}

// The voice picker: an inline, expand-in-place search panel grouped as ★ Featured +
// language groups (where the id encodes language) or a single "All voices" list, with
// a gender badge per row. Replaces the old flat <Select> — a 30–54-voice roster needs
// search + curation, not one long scroll. It mirrors TtsModelPicker's proven inline
// pattern (a collapsed summary → search input + scrollable grouped list) RATHER than a
// Popover+cmdk combobox: a Radix Popover portaled inside the Workspace Sheet's modal
// dialog left the search field un-typeable on real iOS Safari (2026-07-13 device
// report — see engineering/decisions/2026-07-13-tts-picker-ia.md § iOS fix; HARD RULE
// #15, don't fork a widget per surface). `modelId` drives the grouping (groupVoices).
function VoicePicker({
	label,
	ariaLabel,
	modelId,
	voices,
	value,
	onPick,
	onPreview,
	previewingId,
	disabled,
}: {
	label: string;
	ariaLabel: string;
	modelId: string;
	voices: Voice[];
	value: string;
	onPick: (voiceId: string) => void;
	/** Audition a row's voice without selecting it (the ▶ button). Omit to hide it. */
	onPreview?: (voiceId: string) => void;
	/** The voice id currently auditioning (spinner on its ▶), or null. */
	previewingId?: string | null;
	disabled?: boolean;
}) {
	const [open, setOpen] = React.useState(false);
	const [query, setQuery] = React.useState('');
	const searchRef = React.useRef<HTMLInputElement>(null);
	const { featured, groups } = React.useMemo(() => groupVoices(modelId, voices), [modelId, voices]);
	const selected = React.useMemo(() => voices.find((v) => v.id === value), [voices, value]);

	// Manual substring filter (name + id + the group's language name, so typing
	// "japanese"/"spanish" narrows to that language) — the cmdk equivalent of the old
	// combobox, minus the iOS-hostile Popover.
	const q = query.trim().toLowerCase();
	const match = (row: { id: string; label: string }, lang = '') => !q || `${row.label} ${row.id} ${lang}`.toLowerCase().includes(q);
	const fFeatured = featured.filter((r) => match(r));
	const fGroups = groups.map((g) => ({ ...g, voices: g.voices.filter((r) => match(r, g.label)) })).filter((g) => g.voices.length > 0);
	const nothing = fFeatured.length === 0 && fGroups.length === 0;

	if (!voices.length) {
		return (
			<div>
				<div className="mb-1.5 text-[13px] font-semibold leading-normal text-[var(--text-heading)]">{label}</div>
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

	const choose = (id: string) => {
		onPick(id);
		setOpen(false);
		setQuery('');
	};
	// A row is a wrapper div holding the selectable option-button (flex-1) and, when
	// onPreview is given, a SIBLING ▶ button — siblings, not nested (a <button> inside a
	// <button> is invalid HTML). The hover/selected tint lives on the wrapper.
	const Row = (row: { id: string; label: string; country?: string; gender?: 'F' | 'M' }) => {
		const sel = row.id === value;
		const busy = previewingId === row.id;
		return (
			<div key={row.id} className={cn('flex items-center gap-1 rounded-md pr-1', sel ? 'bg-[var(--accent-soft)]' : 'hover:bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]')}>
				<button
					type="button"
					role="option"
					aria-selected={sel}
					onClick={() => choose(row.id)}
					// text-heading on the button, so the name AND the gender icon (currentColor) share one color.
					className="flex min-w-0 flex-1 items-center gap-2 bg-transparent px-2 py-2 text-left text-[13px] text-[var(--text-heading)]"
				>
					<Check className={cn('size-3.5 shrink-0', sel ? 'opacity-100 text-[var(--accent)]' : 'opacity-0')} />
					<span className="min-w-0 flex-1 truncate">{row.label}</span>
					<FlagMark country={row.country} />
					<GenderMark gender={row.gender} />
				</button>
				{onPreview && (
					<Tip label="Hear this voice"><button
						type="button"
						onClick={() => onPreview(row.id)}
						disabled={busy}
						aria-label={`Preview ${row.label}`}
						className="shrink-0 rounded-md bg-transparent p-1.5 text-[var(--accent)] hover:bg-[var(--accent-soft)] disabled:opacity-60"
					>
						{busy ? <Loader2 className="size-4 animate-spin" /> : <PlayCircle className="size-4" />}
					</button></Tip>
				)}
			</div>
		);
	};

	return (
		<div>
			<div className="mb-1.5 text-[13px] font-semibold leading-normal text-[var(--text-heading)]">{label}</div>
			<div className={cn('rounded-lg border', open ? 'border-[var(--accent)]' : 'border-border')}>
				<button
					type="button"
					role="combobox"
					aria-label={ariaLabel}
					aria-expanded={open}
					aria-haspopup="listbox"
					disabled={disabled}
					onClick={() => {
						const next = !open;
						setOpen(next);
						if (next) requestAnimationFrame(() => searchRef.current?.focus());
					}}
					className="flex w-full items-center gap-2 bg-transparent px-3 py-2 text-left text-[13px] text-foreground disabled:opacity-50"
				>
					<span className="min-w-0 flex-1 truncate">{selected?.label ?? 'Choose a voice…'}</span>
					<ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
				</button>
				{open && !disabled && (
					<div className="border-t border-border p-2">
						<input
							ref={searchRef}
							type="search"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder="Search voices…"
							aria-label={`Search ${ariaLabel}`}
							className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-[13px] text-foreground outline-none focus:border-[var(--accent)]"
						/>
						<div role="listbox" aria-label={ariaLabel} className="mt-2 max-h-[280px] overflow-y-auto">
							{nothing ? (
								<p className="px-2 py-3 text-[12.5px] text-muted-foreground">No voice found.</p>
							) : (
								<>
									{fFeatured.length > 0 && (
										<div>
											<div className="px-2 pb-1 pt-1.5 text-[12.5px] font-semibold text-[var(--text-muted)]">★ Featured</div>
											{fFeatured.map(Row)}
										</div>
									)}
									{fGroups.map((g) => (
										<div key={g.key}>
											<div className="px-2 pb-1 pt-2 text-[12.5px] font-semibold text-[var(--text-muted)]">{g.label}</div>
											{g.voices.map(Row)}
										</div>
									))}
								</>
							)}
						</div>
					</div>
				)}
			</div>
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
	const [voicePreview, setVoicePreview] = React.useState<string | null>(null);
	// Distinguishes "the stored voice hasn't loaded yet" (orVoice === '' only
	// because the mount fetch below hasn't resolved) from "loaded and genuinely
	// unset" — the reconciliation effect further down must never run before this
	// is true, or it would overwrite a real stored pick with the roster's default
	// while the real value is still in flight (a data-loss race).
	const [prefsLoaded, setPrefsLoaded] = React.useState(false);
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
			setPrefsLoaded(true);
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

	// Reconcile a stored voice pick against the LIVE roster once both the stored
	// prefs AND the roster have actually loaded (prefsLoaded — see its own
	// comment above; a roster arriving before the stored value would otherwise
	// silently overwrite a real pick with the roster's default). Catches a voice
	// id stranded by a catalog migration (this same redesign renamed Grok's
	// voices, e.g. "Eve" -> "eve") or one OpenRouter has since dropped — without
	// this, the picker shows an unset-looking dropdown and "Play sample" sends
	// the stale id straight to the live API, which errors.
	// biome-ignore lint/correctness/useExhaustiveDependencies: orVoice intentionally excluded — this effect reacts to the ROSTER becoming available/changing, not to every voice pick (pickOrVoice already persists those); including it would re-fire on its own write.
	React.useEffect(() => {
		if (!prefsLoaded || !orModelVoices.length) return;
		const resolved = resolveVoice(orModelVoices, orVoice);
		if (resolved !== orVoice) {
			setOrVoiceState(resolved);
			setTtsOrVoice(resolved);
		}
	}, [prefsLoaded, orModelVoices]);
	// biome-ignore lint/correctness/useExhaustiveDependencies: kokoroVoice intentionally excluded, same reasoning as the cloud reconciliation effect above.
	React.useEffect(() => {
		if (!prefsLoaded || !kokoroVoices.length) return;
		const resolved = resolveVoice(kokoroVoices, kokoroVoice);
		if (resolved !== kokoroVoice) {
			setKokoroVoiceState(resolved);
			setTtsKokoroVoice(resolved);
		}
	}, [prefsLoaded, kokoroVoices]);

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
		[orModel, speed, notify],
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

	if (!avail) return null;

	if (tier === 'cloud') {
		return (
			<div>
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
						value={orVoice}
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
					modelId={KOKORO_MODEL_ID}
					voices={kokoroVoices}
					value={kokoroVoice}
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
