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
import { formatBytes, formatDuration, formatUsd, type NarrationMeasure, PAYLOAD_MAX_BYTES, PAYLOAD_WARN_BYTES } from './narration-bake';
import { type BakeVoice, defaultBakeVoice, listTtsCatalog, type OrVoiceModel, onDeviceBakeVoice, previewTtsVoice, voiceAvailability } from './read-aloud';
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
	// null = the catalog answer has not arrived yet; false = it never will.
	const [catalogReachable, setCatalogReachable] = React.useState<boolean | null>(null);
	const [cloudReady, setCloudReady] = React.useState<boolean | null>(null);
	// The on-device narrator identity, resolved once. Offered whenever the rung is usable —
	// see `pickNarrator`; it is a first-class choice now, not a no-key fallback.
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
			// `kokoroReady`, NOT `kokoroReady || kokoroCached`. "Cached" means the model is on disk
			// but not loaded, and `synthBakeClip` refuses in that state — so offering the narrator
			// there advertises "Free — no key, no request" and then terminally refuses the export.
			// That is the same shape as the defect this picker was built to fix: an option the
			// panel cannot honor. A deck that is FULLY recorded would still bake, but the panel
			// cannot know that before measuring, and a dead end is worse than a missing option.
			if (a.kokoroReady) setOnDevice(od);
		});
		defaultBakeVoice().then((v) => {
			if (!live) return;
			const { value: current, onChange: emit } = seedRef.current;
			if (!current.voice.model && !current.voice.voice) emit({ ...current, voice: v });
		});
		listTtsCatalog().then((c) => {
			if (!live) return;
			setModels(c.models);
			setCatalogReachable(c.reachable);
		});
		return () => {
			live = false;
		};
	}, []);

	const voices = React.useMemo(() => voicesForModel(value.voice.model, models?.find((m) => m.id === value.voice.model)?.voices ?? []), [models, value.voice.model]);
	// TTS models bill per input CHARACTER, published per million (voice-model.js's
	// orPricePerM). A model the catalog has no price for quotes nothing at all.
	// NULL for the on-device narrator, whatever the catalog says. The on-device identity
	// deliberately shares hosted Kokoro's model id, so a price lookup by model alone found the
	// CLOUD price and the bill printed "about $0.12" two lines under "nothing is billed".
	// Nothing on-device is billed, so the honest price is no price at all.
	const pricePerM = React.useMemo(
		() => (value.voice?.rung === 'kokoro' ? null : (models?.find((m) => m.id === value.voice.model)?.promptPerM ?? null)),
		[models, value.voice.model, value.voice?.rung],
	);
	/** We never heard back — offline, firewalled, blackholed, or OpenRouter down. Taken from
	 *  `listTtsCatalog`'s own answer rather than inferred from an empty array: a live catalog
	 *  that genuinely lists no speech models is ALSO empty, and telling that author "couldn't
	 *  reach the voice catalog" would be false in exactly the way this whole fix exists to
	 *  prevent. `null` still means "in flight" and must not trigger the copy. */
	const catalogUnreachable = catalogReachable === false;

	// WHICH NARRATOR THIS EXPORT USES — an explicit choice, not a fallback.
	//
	// This used to be `cloudReady === false && !!onDevice`: the on-device rung was reachable
	// ONLY by an author with no cloud key. So an author who had a key AND had rehearsed the
	// whole deck on-device was measured against the CLOUD voice, quoted for 100% of a deck
	// already on their disk, and told — by this panel — that they could "pick the voice you
	// rehearsed in, to pay nothing". They could not. The pickers were fed the OpenRouter
	// catalog only, and the on-device identity was unreachable from this branch. The panel gave
	// advice the panel made impossible to take, and the consequence was money (#1462 item 2).
	//
	// THE NARRATOR IS READ FROM `value.voice`, NEVER FROM COMPONENT STATE. `value.voice` is the
	// only thing `bakeNarration` ever sees, so any second place that decides "which narrator"
	// is a source of truth that can disagree with the one that spends money — and the first
	// version of this fix did exactly that. The pick lived in local state and fed only the
	// pre-flight, so an author who turned audio on (defaulting to cloud) and then chose
	// "This device" was measured against the device voice, told "nothing is billed", and then
	// baked with the CLOUD voice: every sentence a cache miss, the whole deck synthesized and
	// charged. Quoted $0, billed in full — the exact quote-vs-bill split this panel exists to
	// close, reintroduced by the fix for it. Found by the adversarial trio before merge.
	//
	// So the pick WRITES the identity, and everything else reads it back. There is one value.
	const canPickDevice = !!onDevice;
	const useOnDevice = canPickDevice && value.voice?.rung === 'kokoro';
	/** The cloud identity to restore when switching back — the author's model/voice choice must
	 *  survive a detour through the on-device narrator. */
	const cloudVoiceRef = React.useRef(value.voice);
	if (value.voice?.rung !== 'kokoro') cloudVoiceRef.current = value.voice;
	/** With no cloud key, the on-device narrator is the only one that can produce anything, so
	 *  it is what turning audio on selects. */
	const defaultsToDevice = canPickDevice && cloudReady === false;
	const pickNarrator = (next: 'cloud' | 'device') => {
		if (next === 'device' && onDevice) set({ voice: onDevice });
		else if (next === 'cloud') set({ voice: cloudVoiceRef.current });
	};
	/** What the file is expected to gain: what the device already holds, plus what will be made. */
	const projectedBytes = (measure?.cachedBytes ?? 0) + (measure?.missingBytes ?? 0);

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
			// ALWAYS the identity the bake will actually run. Measuring one voice and baking
			// another is how a quote and a bill come apart: quoting the cloud voice's coverage for
			// a deck rehearsed on-device reports "nothing prepared" for a deck that is in fact
			// complete, which is exactly backwards.
			// `value.voice` — THE SAME OBJECT THE BAKE RECEIVES, never a locally-derived one.
			// Measuring anything else is how a quote and a bill come apart.
			return measureNarration(source, projected, value.voice, pricePerM);
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
	}, [on, blockedReason, source, project, value.voice, pricePerM]);

	const blocked = !!blockedReason;
	const nothingToSay = !!measure && measure.total === 0;
	const fullyOnDevice = useOnDevice && !!measure?.total && measure.missing === 0;
	// Can this export actually produce audio? The on-device rung can now SYNTHESIZE what is
	// missing (free, no key) whenever its model is loaded, so the only dead end left is having
	// neither a cloud key nor a usable on-device narrator.
	// `cloudReady === null` means the local availability check has not answered yet, and turning
	// audio on now WRITES a narrator identity (see setAudio). A keyless author who clicks in that
	// window gets the cloud voice written, is quoted dollars against a rung they cannot use, and
	// the free on-device narrator is not offered — because the picker hides itself when
	// cloudReady is false, which it becomes a moment later. The old derived form self-corrected
	// when availability landed; a written identity does not, and nothing tells the author to
	// toggle off and on again. So the switch waits for the answer. It is a local check, never a
	// network one, so the wait is milliseconds.
	const audioUnavailable = blocked || cloudReady === null || (cloudReady === false && !canPickDevice);

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
			// With no cloud key the on-device narrator is the only one that can produce anything,
			// so turning audio on selects it — and WRITES it, rather than merely displaying it.
			set(defaultsToDevice && onDevice ? { audio: true, captions: true, voice: onDevice } : { audio: true, captions: true });
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
							{/* NOTHING HERE MAY ASSERT A MEASUREMENT THAT HAS NOT BEEN TAKEN. `measure` only
							    runs once a switch is on, and the old copy claimed at rest that "part of this
							    deck has not been rehearsed yet" — a statement about coverage nobody had
							    counted, and false for the very author it was shown to. Worse, flipping the
							    unrelated Captions switch started the measurement and silently reversed it,
							    which reads as the panel changing its mind (#1462 item 2). So the un-measured
							    case describes what the option IS, and says nothing about this deck. */}
							{blocked
								? 'Unavailable while speaker notes are stripped.'
								: cloudReady === false && !canPickDevice
									? 'Connect a cloud voice in the Workspace, or summon the on-device voice — either way the audio has to ship inside the file, because the recipient has no key of their own.'
									: fullyOnDevice
										? 'Every sentence is already recorded on this device, so this ships with no cloud connection at all — nothing is synthesized and nothing is billed.'
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
							{/* WHERE the voice comes from, before WHICH voice it is. Offered whenever both are
							    available, because "the voice I rehearsed in" is a legitimate and often
							    cheaper answer that this panel used to recommend and then withhold. */}
							{canPickDevice && cloudReady !== false && (
								<div className="space-y-2">
									<div className="text-[13px] font-semibold leading-normal text-[var(--text-heading)]">Narrator</div>
									<div className="grid grid-cols-2 gap-2">
										{(
											[
												{ id: 'device' as const, label: 'This device', hint: 'Free — no key, no request' },
												{ id: 'cloud' as const, label: 'Cloud voice', hint: 'Billed per character' },
											]
										).map((opt) => {
											const active = (opt.id === 'device') === useOnDevice;
											return (
												<button
													key={opt.id}
													type="button"
													disabled={disabled}
													aria-pressed={active}
													onClick={() => pickNarrator(opt.id)}
													className={`rounded-lg border px-3 py-2 text-left transition-colors ${active ? 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]' : 'border-border bg-background hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--border))]'}`}
												>
													<span className="block text-[12.5px] font-semibold text-[var(--text-heading)]">{opt.label}</span>
													<span className="mt-0.5 block text-[11px] text-muted-foreground">{opt.hint}</span>
												</button>
											);
										})}
									</div>
									{useOnDevice && (
										<p className="text-[11px] leading-snug text-muted-foreground">
											Narrated by the on-device voice you rehearse with —{' '}
											<span className="font-mono text-[var(--text-heading)]">{onDevice?.voice || 'the workspace default'}</span>. Nothing leaves this machine and nothing is billed, whatever the deck still needs.
										</p>
									)}
								</div>
							)}

							{/* The narrator. Two pickers rather than one because a voice belongs to a MODEL —
							    OpenAI-style names only work on an OpenAI model, Kokoro has its own roster —
							    and both are the Workspace's own widgets, not a second copy (HARD RULE #15). */}
							<div className={`space-y-2 ${useOnDevice ? 'hidden' : ''}`}>
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
								{/* CATALOG UNREACHABLE is a different thing from "this model has no voices", and
								    the picker cannot tell them apart — it is handed a roster and an empty one
								    looks the same either way. Offline, behind a firewall, or with OpenRouter
								    down, the catalog answer never arrives, and the picker then
								    said "This model hasn't published a voice list on OpenRouter yet", which
								    blames the model for what the network did. Worse, it is false in the one
								    way that matters here: the bake identity comes from the SAVED PREFS, not
								    from the catalog, so a bake in this state succeeds in the author's own
								    voice while the panel tells them it has none. Say what is actually true.
								    Caught by driving the panel in a browser that could not reach the
								    catalog — every automated assertion passed, because they checked the
								    picker EXISTED rather than that it had anything in it. */}
								{catalogUnreachable ? (
									<p className="rounded-lg border border-border px-3 py-2 text-[11.5px] leading-snug text-muted-foreground">
										Couldn't reach the voice catalog, so there is no list to choose from. This export will use your saved voice —{' '}
										<span className="font-mono text-[var(--text-heading)]">{value.voice.voice || 'the workspace default'}</span> on{' '}
										<span className="font-mono text-[var(--text-heading)]">{value.voice.model || 'the default model'}</span>.
										{measure && measure.missing === 0
											? ' Every sentence is already on this device, so the export needs no connection at all.'
											: ' The sentences that still need recording DO need a connection, so this export may not complete until it is back.'}
									</p>
								) : (
									<VoicePicker
										label=""
										ariaLabel="Narration voice"
										modelId={value.voice.model}
										voices={voices}
										value={value.voice.voice}
										disabled={disabled}
										onPick={(v) => set({ voice: { ...value.voice, voice: v } })}
									/>
								)}
							</div>

							{/* The bill. Stated before the button, always. */}
							<dl className="space-y-1 rounded-lg bg-[var(--accent-soft)] px-3 py-2.5 text-[11.5px]">
								{/* "Free and instant" was true only while a cached clip was shipped byte-for-byte.
								    Compression now happens when the file is BUILT, so for a voice this codebase
								    encodes itself, every cached clip is still re-encoded on the way out — free,
								    but measured in tens of seconds for a long deck. Promising "instant" above a
								    button that then works for half a minute is the panel telling the author
								    something it knows to be false. Say free, and put the time in its own line. */}
								<Line term="Already prepared" detail={`${measure.cached} of ${measure.total} sentence${measure.total === 1 ? '' : 's'} — ${measure.transcoded ? 'no charge' : 'free and instant'}`} />
								{measure.missing > 0 ? (
									<>
										<Line
											term="To synthesize"
											// The price comes from the same catalog as the roster, so an unreachable one leaves
											// `estCostUsd` null — and "this model publishes no price" would then be the SECOND
											// false statement in this panel, sitting directly above a button that spends money.
											// Say which of the two it is.
											detail={`${measure.missing} sentence${measure.missing === 1 ? '' : 's'} · ${
												measure.estCostUsd != null ? `about ${formatUsd(measure.estCostUsd)}` : catalogUnreachable ? 'cost unknown until the catalog is reachable' : 'this model publishes no price'
											}`}
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
								{/* The wait, stated for EVERY deck that has one — not just an unrehearsed one.
								    This line used to hang off the synthesis line, so a fully-rehearsed deck in a
								    transcoded voice showed no time at all while being the case that spends the
								    most of it on a bill of zero. `estSeconds` already counts both halves. */}
								{measure.estSeconds > 0 && (
									<Line
										term="Takes about"
										detail={`${formatDuration(measure.estSeconds)}${measure.missing > 0 && measure.transcoded ? ' — recording, then compressing every sentence' : measure.transcoded ? ' — compressing every sentence into the file' : ''}`}
									/>
								)}
								{/* `complete` is FALSE when the measurement was taken without the deck's speech
							    projection, and `measureNarration` documents what that means: the counts are a
							    floor, not a figure, and "the caller must not present them as a price". Nothing
							    read the flag — it was computed, documented as load-bearing, and ignored
							    (#1462 item 7). A floor shown as a size is the exact failure the projection
							    requirement exists to prevent, so the size line is withheld rather than guessed. */}
							{measure.complete ? (
								<Line term="Adds to the file" detail={`about ${formatBytes(projectedBytes)}`} />
							) : (
								<Line term="Adds to the file" detail="not yet known — this deck could not be fully read, so the counts above are a minimum rather than a total" />
							)}
							</dl>

							{/* SIZE, said before the button like the bill is. Nothing capped this at all
							    before (#1462 item 4), and the number an author actually collides with is
							    the mail-server one — a file over ~25 MB is not one they can send the way
							    they were probably about to. Past the hard ceiling it is not a warning:
							    the browser holds the payload five or six times over while assembling, so
							    the honest answer is that it will not finish. */}
							{/* The remedy applies to ANY deck now. Compression happens when the file is
							    built, from whatever the device holds, so lowering Audio quality shrinks a
							    fully rehearsed deck exactly as much as an unrecorded one. (It was
							    conditional while compression happened at record time, where it could not
							    touch a clip already on disk.) */}
							{measure.complete && projectedBytes > PAYLOAD_MAX_BYTES ? (
								<p className="rounded-lg border border-[var(--fail,#b3261e)] px-3 py-2 text-[11.5px] leading-snug text-[var(--fail,#b3261e)]">
									At about {formatBytes(projectedBytes)} this is past the {formatBytes(PAYLOAD_MAX_BYTES)} ceiling, and assembling it would most likely run this tab out of memory before producing anything. Ship it with captions only, lower <strong>Audio quality</strong> in the Workspace, or split the deck.
								</p>
							) : measure.complete && projectedBytes > PAYLOAD_WARN_BYTES ? (
								<p className="rounded-lg border border-border px-3 py-2 text-[11.5px] leading-snug text-muted-foreground">
									At about {formatBytes(projectedBytes)} this is larger than most mail servers accept as an attachment (~25 MB). It still exports — share it as a link or a file transfer, or lower <strong>Audio quality</strong> in the Workspace to shrink it.
								</p>
							) : null}

							<p className="text-[11px] leading-snug text-muted-foreground">
								{measure.missing > 0
									? 'The file is written only if every sentence succeeds — a deck that goes quiet halfway through is worse than one that never spoke. Anything synthesized is kept and this deck\u2019s existing audio is held back from the cache\u2019s size limit while the export runs, so a second attempt pays only for what is left.'
									: measure.transcoded
										? 'Every sentence is already on this device, so nothing is synthesized and nothing is billed. The export still compresses each one as it writes the file, which is where the time above goes.'
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
