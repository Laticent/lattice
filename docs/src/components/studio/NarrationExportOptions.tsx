// The narration half of the webpage-export panel — two independent switches, the
// narrator, and the bill.
//
// WHAT THE TWO SWITCHES ARE. Captions and audio are separate because they are separately
// useful and they cost wildly different amounts. The caption TRACK is the timing spine
// either way: it is what carries each sentence, its estimated span, its breath, and the
// word timeline the exported player's crawl highlights against. So there are four honest
// states, and the player already handles all four:
//
//   neither  → the player as it has always been, byte-for-byte.
//   captions → a teleprompter read-along on the player's own wall clock. Kilobytes.
//   audio    → the deck speaks, with no caption band. Megabytes.
//   both     → the rehearsed delivery, in the author's chosen voice.
//
// WHY THE BILL IS SHOWN BEFORE THE BUTTON. Turning audio on can synthesize hundreds of
// sentences against the author's own OpenRouter key. Every sentence they rehearsed is
// already on the device and costs nothing; the rest are billed. A "Bake" button that finds
// that out for you afterwards is not a choice you got to make, so the row states it first:
// how many are prepared, how many will be synthesized, roughly what it costs and how long.
//
// AND WHY THE VOICE MATTERS TO THAT NUMBER. Clips are keyed on rung, model, voice, speed
// and text, so choosing a narrator other than the one the deck was rehearsed in means
// NOTHING is cached and the whole deck is billed. That is a real and legitimate choice —
// a board deck may want a different reader than the author's own working voice — so the
// panel does not block it. It re-measures on every change and shows what it now costs.

import { AudioLines, Captions, Loader2, PlugZap } from 'lucide-react';
import * as React from 'react';
import { Switch } from '@/components/ui/switch';
import { formatBytes, formatDuration, formatUsd, type NarrationMeasure } from './narration-bake';
import { type BakeVoice, defaultBakeVoice, listTtsModels, type OrVoiceModel, onDeviceBakeVoice, previewTtsVoice, voiceAvailability } from './read-aloud';
import { TtsModelPicker } from './TtsModelPicker';
import { resolveVoice, voicesForModel } from './tts-voice-catalog';
import { VoicePicker } from './VoicePicker';

export type NarrationChoice = {
	captions: boolean;
	audio: boolean;
	voice: BakeVoice;
	/** Set ONLY by the author, and only after a refusal has named the sentences it could not
	 *  prepare. Ships those as captions with no sound. Never a default, never sticky. */
	allowPartial: boolean;
};

/** What the panel needs to render the deck once and project its narration — the same
 *  arguments `projectDeckSpeech` takes. */
export type ProjectDeck = () => Promise<string[]>;

export function NarrationExportOptions({
	source,
	project,
	value,
	onChange,
	disabled,
	blockedReason,
	failures,
	onExportAnyway,
}: {
	source: string;
	/** Render + project the deck to per-slide narration. Called ONLY once a switch is on —
	 *  it is a full deck render, and an author who never wants narration should never pay it. */
	project: ProjectDeck;
	value: NarrationChoice;
	onChange: (next: NarrationChoice) => void;
	disabled?: boolean;
	/** Non-null when narration cannot be offered at all (today: notes are being stripped). */
	blockedReason?: string | null;
	/** The sentences a previous attempt could not prepare, so the refusal names them. */
	failures?: { slide: number; text: string; reason: string }[] | null;
	/** Re-run the export accepting those sentences as silent. Rendered only alongside a
	 *  refusal that already named them. */
	onExportAnyway?: () => void;
}) {
	const on = value.captions || value.audio;
	const [models, setModels] = React.useState<OrVoiceModel[] | null>(null);
	const [cloudReady, setCloudReady] = React.useState<boolean | null>(null);
	// The on-device fallback identity, resolved once. Offered only when the cloud rung is
	// unavailable AND this device turns out to hold the whole deck already — see `onDeviceOnly`.
	const [onDevice, setOnDevice] = React.useState<BakeVoice | null>(null);
	/** The model id currently auditioning, so its row shows a spinner rather than nothing. */
	const [auditioning, setAuditioning] = React.useState<string | null>(null);
	const [measure, setMeasure] = React.useState<NarrationMeasure | null>(null);
	const [measuring, setMeasuring] = React.useState(false);
	const [measureError, setMeasureError] = React.useState<string | null>(null);
	// The projection is a whole deck render. Cache it for this panel's lifetime, keyed on the
	// source, so flipping a switch or auditioning three voices does not re-render three times.
	const projectionRef = React.useRef<{ source: string; value: Promise<string[]> } | null>(null);

	// The workspace's own cloud voice is the default narrator, so a deck ships sounding like
	// the rehearsal unless the author says otherwise.
	//
	// Read through a ref rather than through the dependency array, and that is the point
	// rather than a lint dodge: this effect SEEDS a default exactly once. Depending on
	// `value` would re-run it after every pick and overwrite the author's own choice with the
	// workspace default a tick later — the data-loss race the Workspace's own TTS panel
	// documents at `prefsLoaded`.
	const seedRef = React.useRef({ value, onChange });
	seedRef.current = { value, onChange };
	React.useEffect(() => {
		let live = true;
		// Resolved SEPARATELY, not as one Promise.all. `listTtsModels` is a network fetch to
		// OpenRouter's public catalog; on a slow or blocked connection it can hang, and joined
		// into one await it held `cloudReady` at null — which left the audio switch ENABLED with
		// no key behind it, pointing at a bake that could only fail. Availability is local and
		// must never wait on the network. Caught by driving the real panel, where it happened.
		Promise.all([voiceAvailability(), onDeviceBakeVoice()]).then(([a, od]) => {
			if (!live) return;
			setCloudReady(a.openRouterReady);
			if (a.kokoroReady || a.kokoroCached) setOnDevice(od);
		});
		defaultBakeVoice().then((v) => {
			if (!live) return;
			const { value: current, onChange: emit } = seedRef.current;
			if (!current.voice.model && !current.voice.voice) emit({ ...current, voice: v });
		});
		listTtsModels().then((m) => {
			if (live) setModels(m);
		});
		return () => {
			live = false;
		};
	}, []);

	const voices = React.useMemo(() => voicesForModel(value.voice.model, models?.find((m) => m.id === value.voice.model)?.voices ?? []), [models, value.voice.model]);
	// TTS models bill per input CHARACTER, published per million (voice-model.js's
	// orPricePerM). A model the catalog has no price for quotes nothing at all.
	const pricePerM = React.useMemo(() => models?.find((m) => m.id === value.voice.model)?.promptPerM ?? null, [models, value.voice.model]);

	// The one case where a bake is possible with no cloud key at all: this deck was rehearsed
	// on-device and every sentence is already stored. A cache read needs no key and cannot
	// spend, so withholding the switch here would deny an author a deck they have ALREADY
	// synthesized in full — 100% of the bytes on their own disk, 0% of the feature.
	const onDeviceOnly = cloudReady === false && !!onDevice;

	// Measure whenever the answer could have changed: a switch, the voice, or the deck.
	React.useEffect(() => {
		if (!on || blockedReason) {
			setMeasure(null);
			setMeasureError(null);
			return;
		}
		let live = true;
		setMeasuring(true);
		setMeasureError(null);
		(async () => {
			if (projectionRef.current?.source !== source) projectionRef.current = { source, value: project() };
			const projected = await projectionRef.current.value;
			const { measureNarration } = await import('./narration-bake');
			// With no cloud key, the only identity worth measuring is the on-device one — quoting
			// the cloud voice's coverage would report "nothing prepared" for a deck that is in
			// fact complete, which is exactly backwards.
			return measureNarration(source, projected, onDeviceOnly && onDevice ? onDevice : value.voice, pricePerM);
		})()
			.then((m) => {
				if (!live) return;
				setMeasure(m);
				setMeasuring(false);
			})
			.catch((e) => {
				if (!live) return;
				// A projection that cannot run is not a reason to quote a number anyway — the count
				// without it is a floor, not a figure. Say so and withhold the option.
				projectionRef.current = null;
				setMeasure(null);
				setMeasureError((e as Error)?.message || 'could not read this deck');
				setMeasuring(false);
			});
		return () => {
			live = false;
		};
	}, [on, blockedReason, source, project, value.voice, pricePerM, onDeviceOnly, onDevice]);

	const blocked = !!blockedReason;
	const nothingToSay = !!measure && measure.total === 0;
	const fullyOnDevice = onDeviceOnly && !!measure?.total && measure.missing === 0;
	const audioUnavailable = blocked || (cloudReady === false && !fullyOnDevice);

	const set = (patch: Partial<NarrationChoice>) => onChange({ ...value, ...patch });

	// Turning audio on turns the captions on with it, because that is what the author almost
	// always means by "include narration" and it costs nothing extra — the track is already
	// baked. Turning it back OFF restores whatever captions were before, rather than leaving
	// them on: an author who flips audio on, reads the bill, and flips it back off must not be
	// silently opted into shipping the caption band — which for most decks is their speaker
	// notes rendered as words on screen. That is the same leak the strip-notes veto exists to
	// prevent, arriving through a door the veto cannot see (they never touched strip-notes).
	const captionsBeforeAudio = React.useRef(value.captions);
	const setAudio = (next: boolean) => {
		if (next) {
			captionsBeforeAudio.current = value.captions;
			// Adopt the identity the pre-flight was actually measured against, so the bill the
			// author read and the bake that runs can never be for different voices.
			set(onDeviceOnly && onDevice ? { audio: true, captions: true, voice: onDevice } : { audio: true, captions: true });
		} else {
			set({ audio: false, captions: captionsBeforeAudio.current });
		}
	};


	return (
		<div className="rounded-xl border border-border bg-background p-3.5">
			<div className="flex items-start justify-between gap-3">
				<span className="flex items-start gap-2">
					<Captions className="mt-0.5 size-4 text-[var(--accent)]" />
					<span>
						<span className="block text-[13px] font-semibold text-[var(--text-heading)]">Captions</span>
						<span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">
							{blocked
								? blockedReason
								: 'A teleprompter read-along — the line being read stays centered and its words light as they are spoken. Adds kilobytes.'}
						</span>
					</span>
				</span>
				<Switch className="mt-0.5" aria-label="Include captions" checked={value.captions} disabled={disabled || blocked} onCheckedChange={(v) => set({ captions: v })} />
			</div>

			<div className="mt-3.5 flex items-start justify-between gap-3 border-t border-border pt-3.5">
				<span className="flex items-start gap-2">
					<AudioLines className="mt-0.5 size-4 text-[var(--accent)]" />
					<span>
						<span className="block text-[13px] font-semibold text-[var(--text-heading)]">Narration audio</span>
						<span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">
							{blocked
								? 'Unavailable while speaker notes are stripped.'
								: fullyOnDevice
									? 'This deck is fully rehearsed on this device, so it can ship its voice with no cloud connection at all — nothing is synthesized and nothing is billed.'
									: cloudReady === false
										? onDeviceOnly
											? 'No cloud voice is connected, so only what this device already prepared can ship — and part of this deck has not been rehearsed yet. Rehearse it in Present, or connect OpenRouter in the Workspace.'
											: 'Connect a cloud voice in the Workspace, or rehearse the deck with the on-device voice — either way the audio has to ship inside the file, because the recipient has no key of their own.'
										: 'The deck speaks for itself — the voice ships inside the file, so it plays with no key and no network, on a machine with no Lattice.'}
						</span>
					</span>
				</span>
				<Switch className="mt-0.5" aria-label="Include narration audio" checked={value.audio} disabled={disabled || audioUnavailable} onCheckedChange={setAudio} />
			</div>

			{on && !blocked && (
				<div className="mt-3.5 space-y-3 border-t border-border pt-3.5">
					{measuring && (
						<p className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
							<Loader2 className="size-3.5 animate-spin" />
							Reading the deck and checking what this device has already prepared…
						</p>
					)}
					{measureError && <p className="text-[11.5px] text-[var(--fail,#b3261e)]">Could not measure this deck: {measureError}. Narration is unavailable for this export.</p>}
					{nothingToSay && !measuring && <p className="text-[11.5px] text-muted-foreground">This deck has nothing to narrate — add speaker notes or captions, or give its slides some prose.</p>}

					{/* Captions alone still cost something and still have a count — saying so is what
					    keeps the section from being an empty box under a divider. */}
					{!value.audio && !!measure?.total && !measuring && (
						<dl className="space-y-1 rounded-lg bg-[var(--accent-soft)] px-3 py-2.5 text-[11.5px]">
							<Line term="Ships" detail={`${measure.total} sentence${measure.total === 1 ? '' : 's'}, word by word`} />
							<Line term="Adds to the file" detail={`about ${formatBytes(captionBytes(measure))}`} />
						</dl>
					)}

					{value.audio && !!measure?.total && (
						<>
							{/* The narrator. Two pickers rather than one because a voice belongs to a MODEL —
							    OpenAI-style names only work on an OpenAI model, Kokoro has its own roster —
							    and both are the Workspace's own widgets, not a second copy (HARD RULE #15). */}
							<div className="space-y-2">
								<div className="text-[13px] font-semibold leading-normal text-[var(--text-heading)]">Voice</div>
								<TtsModelPicker
									models={models}
									selectedId={value.voice.model}
									playingId={auditioning}
									disabled={disabled}
									onPick={(m) => {
										// A voice from the old model is meaningless on the new one, so resolve it
										// against the new roster rather than carrying a name that will 400.
										const next = voicesForModel(m.id, m.voices);
										set({ voice: { ...value.voice, model: m.id, voice: resolveVoice(next, value.voice.voice) } });
									}}
									// Wired, not a stub. The row's play button is offered on the surface where the
									// author is about to spend real money on a voice; offering to play it and then
									// doing nothing is the worst possible answer here.
									onPlay={(m) => {
										setAuditioning(m.id);
										previewTtsVoice({ rung: 'openrouter', model: m.id, voice: m.voices[0], speed: value.voice.speed }).finally(() => setAuditioning(null));
									}}
								/>
								<VoicePicker
									label=""
									ariaLabel="Narration voice"
									modelId={value.voice.model}
									voices={voices}
									value={value.voice.voice}
									disabled={disabled}
									onPick={(v) => set({ voice: { ...value.voice, voice: v } })}
								/>
							</div>

							{/* The bill. Stated before the button, always. */}
							<dl className="space-y-1 rounded-lg bg-[var(--accent-soft)] px-3 py-2.5 text-[11.5px]">
								<Line term="Already prepared" detail={`${measure.cached} of ${measure.total} sentence${measure.total === 1 ? '' : 's'} — free and instant`} />
								{measure.missing > 0 ? (
									<>
										<Line
											term="To synthesize"
											detail={`${measure.missing} sentence${measure.missing === 1 ? '' : 's'} · ${measure.estCostUsd == null ? 'this model publishes no price' : `about ${formatUsd(measure.estCostUsd)}`} · about ${formatDuration(measure.estSeconds)}`}
										/>
										{measure.cached === 0 && (
											<p className="pt-1 leading-snug text-muted-foreground">
												Nothing on this device matches this voice — either the deck has not been rehearsed, or it was rehearsed in a different one. Clips are stored per voice, so this
												export bills the whole deck. Rehearse in Present first, or pick the voice you rehearsed in, to pay nothing.
											</p>
										)}
									</>
								) : (
									<Line term="To synthesize" detail="nothing — this deck is fully prepared in this voice" />
								)}
								<Line term="Adds to the file" detail={`about ${formatBytes(measure.cachedBytes + measure.missingBytes)}`} />
							</dl>

							<p className="text-[11px] leading-snug text-muted-foreground">
								{measure.missing > 0
									? 'The file is written only if every sentence succeeds — a deck that goes quiet halfway through is worse than one that never spoke. Anything synthesized is kept, so a second attempt pays only for what is left.'
									: 'Every sentence is already on this device, so nothing is synthesized and nothing is billed.'}
							</p>
						</>
					)}

					{!!failures?.length && (
						<div className="rounded-lg border border-[var(--fail,#b3261e)] px-3 py-2.5 text-[11.5px]">
							<p className="font-semibold text-[var(--fail,#b3261e)]">
								Nothing was exported — {failures.length} sentence{failures.length === 1 ? '' : 's'} could not be prepared:
							</p>
							<ul className="mt-1.5 space-y-1 text-muted-foreground">
								{failures.slice(0, 5).map((f) => (
									<li key={`${f.slide}:${f.text}`}>
										<span className="font-mono">Slide {f.slide}</span> — “{truncate(f.text)}” ({f.reason})
									</li>
								))}
								{failures.length > 5 && <li>…and {failures.length - 5} more.</li>}
							</ul>
							{/* The override. Offered only HERE — after a refusal has named the sentences —
							    because "complete or nothing" is the right default and the wrong only option:
							    a sentence a model deterministically refuses would otherwise make narration
							    permanently unreachable for this deck. Those sentences ship captioned and
							    silent; the player holds their beat and moves on. */}
							{onExportAnyway && (
								<button
									type="button"
									disabled={disabled}
									onClick={onExportAnyway}
									className="mt-2.5 rounded-lg border border-border px-2.5 py-1.5 text-[11.5px] font-semibold text-[var(--text-heading)] hover:bg-[var(--accent-soft)] disabled:opacity-50"
								>
									Export anyway — ship {failures.length === 1 ? 'it' : 'them'} captioned and silent
								</button>
							)}
						</div>
					)}

					{value.audio && cloudReady === false && (
						<p className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
							<PlugZap className="size-3.5" />
							Connect OpenRouter in the Workspace to synthesize the sentences this device has not prepared.
						</p>
					)}
				</div>
			)}
		</div>
	);
}

function Line({ term, detail }: { term: string; detail: string }) {
	return (
		<div className="flex items-baseline justify-between gap-3">
			<dt className="shrink-0 font-semibold text-[var(--text-heading)]">{term}</dt>
			<dd className="text-right text-muted-foreground">{detail}</dd>
		</div>
	);
}

/**
 * What the caption track adds: the spoken text plus its word timeline. Each word ships as a
 * compact `[display, startMs, endMs]` triple, so the overhead is roughly the text again in
 * punctuation and integers — measured at ~2.2x the characters across this repository's own
 * narrated examples. Kilobytes either way; the point of the line is that it is not megabytes.
 */
function captionBytes(m: NarrationMeasure): number {
	return Math.round(m.totalChars * 2.2);
}

function truncate(s: string, n = 60): string {
	return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
