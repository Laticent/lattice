// Export options — the pre-export step for the self-contained Webpage (.html) player.
// Speaker notes ride into the player by default (they power its Present-mode notes
// sheet, exactly like the CLI --player). Stripping them is the deliberate PRIVACY
// choice: a deck shared as a webpage shouldn't carry the presenter's private speaker
// text unless the author says so — so "Strip speaker notes" scrubs the note text from
// EVERY copy in the file (the DOM asides AND the re-import envelope source), mirroring
// the CLI `--strip-notes`. Accessible slide descriptions are kept (they're the slide's
// text alternative, not private speaker copy). See share-export.ts › shareHtmlPlayer.

import { ArrowLeft, Globe, Layers, Loader2, MicOff, Monitor, Moon, Play, Sun, X } from 'lucide-react';
import * as React from 'react';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { sourceAnimatesCharts } from '../../../../lib/core/resolve-motion.mjs';
import { type NarrationChoice, NarrationExportOptions, type ProjectDeck } from './NarrationExportOptions';

type Scheme = 'light' | 'dark' | 'system' | 'inherited';

/** Everything this panel decides, handed to the exporter in one object rather than a
 *  growing positional list. */
export type WebpageExportChoice = {
	stripNotes: boolean;
	/** Whether the exported file carries the deck's chart motion. Suppression only — a deck
	 *  that never asked for motion cannot be made to move from here. */
	playerMotion: boolean;
	scheme: Scheme;
	narration: NarrationChoice;
};

export function WebpageOptionsPanel({
	busy,
	status,
	defaultScheme,
	source,
	project,
	narrationFailures,
	onBack,
	onExport,
	onCancel,
}: {
	busy?: boolean;
	status?: string | null;
	// The color mode the export defaults to — the deck's authored `color-mode:` when it has
	// one, else the current preview mode. So the panel reflects a system/inherited deck, and
	// a plain deck is WYSIWYG. The author can still override for this one export.
	defaultScheme: Scheme;
	/** The deck source, so the narration row can measure what it would cost. */
	source: string;
	/** Render + project the deck to narration — called only once a narration switch is on. */
	project: ProjectDeck;
	/** The sentences the last attempt could not prepare, so the refusal names them. */
	/** The last refusal AND the voice it was earned under — the override is scoped to that
	 *  identity, so changing the narrator withdraws it. */
	narrationFailures?: { failures: { slide: number; text: string; reason: string }[]; voice: { model: string; voice: string; speed: number; rung?: string } } | null;
	onBack: () => void;
	onExport: (choice: WebpageExportChoice) => void;
	/** Stop a bake in progress. Owned by the sheet, not this panel — see `launch`. */
	onCancel: () => void;
}) {
	// Default OFF: notes ride (matching the CLI player default). Stripping is opt-in.
	const [stripNotes, setStripNotes] = React.useState(false);
	// Default ON: the export inherits what the deck already asked for, so a deck that
	// animates in the Playground animates for whoever opens the file. The row only appears
	// when the deck HAS motion to carry — offering "keep the motion" on a deck with no
	// animated chart is a switch that does nothing, which teaches the reader to distrust the
	// panel.
	const [playerMotion, setPlayerMotion] = React.useState(true);
	// The SHARED rule, not a fourth hand-rolled regex. An earlier draft of this line had its
	// own — case-sensitive, and treating the style tokens as opt-ins — so the same deck got
	// three different answers from the panel, the exporter and the live cascade.
	const deckHasMotion = React.useMemo(() => sourceAnimatesCharts(source), [source]);
	// Narration is opt-in too, and for a different reason: it is the only option here that
	// can spend money and add megabytes. See NarrationExportOptions for the bill.
	const [narration, setNarration] = React.useState<NarrationChoice>({ captions: false, audio: false, allowPartial: false, voice: { model: '', voice: '', speed: 1 } });

	// STRIPPING NOTES NO LONGER TOUCHES NARRATION, because narration no longer reads the
	// note. This used to be `const narrationBlocked = stripNotes`, vetoing both switches on
	// the reasoning that "the narration the author rehearsed IS their speaker notes, so
	// either switch would hand them back" — true of the old ladder, where a note outranked
	// the slide's own content. The note rung is gone (lib/core/read-along-build.js,
	// narration-resolve.ts): captions and audio are generated from slide CONTENT, which
	// `--strip-notes` does not touch.
	//
	// Leaving the veto in place was not a harmless leftover. The CLI had already been made
	// orthogonal, so the same deck and the same intent produced a caption track through
	// `lattice-emulator.js --strip-notes --captions` and NO caption track through this
	// panel — the two render paths disagreeing about one user intent, which is the shape
	// HARD RULE #1 exists to prevent. It also cost a stripped deck the caption track a
	// recipient needs for accessibility, for a privacy reason that no longer applied.
	// (2026-08-24-stage-console-split.md §10.)

	// One launcher for both buttons, so `allowPartial` can never leak from an override into the
	// NEXT ordinary export — it is passed for this call only and never written into state.
	//
	// The abort controller deliberately does NOT live here. This panel unmounts whenever the
	// sheet is closed or the author steps back to the format menu, and a controller held in a
	// ref went with it: closing the sheet mid-bake left three workers synthesizing and billing
	// with nothing left to stop them, and reopening it re-mounted a Cancel button whose ref was
	// null — the only stop control in the feature, dead. It belongs to the owner of the run.
	const launch = (choice: NarrationChoice) => onExport({ stripNotes, scheme, narration: choice, playerMotion });
	// The exported player's default color mode. The panel remounts each time the export step
	// is opened (ShareSheet renders it conditionally), so this mount-time default already
	// re-syncs — no effect needed, so an explicit user pick is never silently clobbered.
	const [scheme, setScheme] = React.useState<Scheme>(defaultScheme);

	const SCHEMES: { value: Scheme; label: string; icon: React.ReactNode }[] = [
		{ value: 'light', label: 'Light', icon: <Sun className="size-3.5" /> },
		{ value: 'dark', label: 'Dark', icon: <Moon className="size-3.5" /> },
		{ value: 'system', label: 'System', icon: <Monitor className="size-3.5" /> },
		{ value: 'inherited', label: 'Match site', icon: <Layers className="size-3.5" /> },
	];

	return (
		<div className="space-y-5">
			<button type="button" onClick={onBack} disabled={busy} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground hover:text-[var(--text-heading)] disabled:opacity-50">
				<ArrowLeft className="size-3.5" />All formats
			</button>

			<section className="space-y-3">
				<div>
					<h3 className="text-[15px] font-semibold text-[var(--text-heading)]">Export webpage</h3>
					<p className="mt-0.5 text-[12px] text-muted-foreground">One self-contained <code>.html</code> file — three views, Present mode, fonts and styles baked in. Opens in any browser, offline.</p>
				</div>

				{/* Color mode — the document-fidelity choice. Light/Dark PIN the export to that
				    mode on every device; System and Match-site both defer to the reader's OS in a
				    standalone file. The in-player toggle still lets any viewer override themselves. */}
				<div className="rounded-xl border border-border bg-background p-3.5">
					<span className="block text-[13px] font-semibold text-[var(--text-heading)]">Color mode</span>
					<span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">
						{scheme === 'system' || scheme === 'inherited'
							? 'The player follows the reader’s device — light or dark tracks their OS. (Match site and System are the same in a downloaded file, which has no host to inherit from.) A viewer can still toggle.'
							: `The player always opens in ${scheme} mode, on every device. A viewer can still toggle.`}
					</span>
					<div className="mt-2.5 grid grid-cols-2 gap-1.5 rounded-lg bg-[var(--accent-soft)] p-1">
						{SCHEMES.map((s) => (
							<button
								key={s.value}
								type="button"
								aria-pressed={scheme === s.value}
								disabled={busy}
								onClick={() => setScheme(s.value)}
								className={cn(
									'inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-40',
									scheme === s.value ? 'bg-background text-[var(--text-heading)] shadow-sm' : 'text-muted-foreground hover:text-[var(--text-heading)]',
								)}
							>
								{s.icon}{s.label}
							</button>
						))}
					</div>
				</div>

				{/* Strip speaker notes — a privacy opt-in for a shared file. */}
				<div className="rounded-xl border border-border bg-background p-3.5">
					<div className="flex items-start justify-between gap-3">
						<span className="flex items-start gap-2">
							<MicOff className="mt-0.5 size-4 text-[var(--accent)]" />
							<span>
								<span className="block text-[13px] font-semibold text-[var(--text-heading)]">Strip speaker notes</span>
								<span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">
									{stripNotes
										? 'Speaker-note text is removed from every copy — the DOM and the re-import source. (The file still embeds the deck’s editable Markdown for re-opening here, so this removes notes, not everything.)'
										: 'Speaker notes ride into the player’s Present-mode notes sheet. Turn on to remove them from the shared file.'}
								</span>
							</span>
						</span>
						<Switch className="mt-0.5" aria-label="Strip speaker notes" checked={stripNotes} disabled={busy} onCheckedChange={setStripNotes} />
					</div>
				</div>

				{/* Chart motion — only when the deck actually has some to carry. */}
				{deckHasMotion ? (
					<div className="rounded-xl border border-border bg-background p-3.5">
						<div className="flex items-start justify-between gap-3">
							<span className="flex items-start gap-2">
								<Play className="mt-0.5 size-4 text-[var(--accent)]" />
								<span>
									<span className="block text-[13px] font-semibold text-[var(--text-heading)]">Animate charts</span>
									<span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">
										{playerMotion
											? 'Charts build the way they do here, for whoever opens the file. Adds about 22 KB.'
											: 'The file shows the finished charts, still. Your deck still animates while you present — this only changes the copy you send.'}
									</span>
								</span>
							</span>
							<Switch className="mt-0.5" aria-label="Animate charts" checked={playerMotion} disabled={busy} onCheckedChange={setPlayerMotion} />
						</div>
					</div>
				) : null}

				<NarrationExportOptions
					source={source}
					project={project}
					value={narration}
					onChange={setNarration}
					disabled={busy}
					blockedReason={null}
					// Withdrawn the moment the narrator changes: the refusal named sentences in ONE
					// voice, and a different voice is a different bake with a different failure set.
					failures={
						narrationFailures &&
						narrationFailures.voice.model === narration.voice.model &&
						narrationFailures.voice.voice === narration.voice.voice &&
						narrationFailures.voice.speed === narration.voice.speed &&
						(narrationFailures.voice.rung ?? 'openrouter') === (narration.voice.rung ?? 'openrouter')
							? narrationFailures.failures
							: null
					}
					onExportAnyway={() => launch({ ...narration, allowPartial: true })}
				/>
			</section>

			<div className="flex gap-2">
				<button
					type="button"
					disabled={busy}
					onClick={() => launch(narration)}
					className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-3 text-[13.5px] font-semibold text-[var(--on-accent,#fff)] hover:opacity-90 disabled:opacity-60"
				>
					{busy ? <Loader2 className="size-4 animate-spin" /> : <Globe className="size-4" />}
					{busy ? status || 'Exporting…' : 'Download webpage'}
				</button>
				{/* Cancel exists because a bake can run for minutes on an unrehearsed deck, and the
				    only thing worse than a long wait is one you cannot stop. Everything already
				    synthesized stays banked, so canceling costs nothing that was paid for. */}
				{busy && (
					<button
						type="button"
						aria-label="Cancel export"
						onClick={onCancel}
						className="inline-flex shrink-0 items-center justify-center rounded-xl border border-border px-3.5 text-[13.5px] font-semibold text-muted-foreground hover:text-[var(--text-heading)]"
					>
						<X className="size-4" />
					</button>
				)}
			</div>
		</div>
	);
}
