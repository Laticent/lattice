// Export options — the pre-export step for the self-contained Webpage (.html) player.
// Speaker notes ride into the player by default (they power its Present-mode notes
// sheet, exactly like the CLI --player). Stripping them is the deliberate PRIVACY
// choice: a deck shared as a webpage shouldn't carry the presenter's private speaker
// text unless the author says so — so "Strip speaker notes" scrubs the note text from
// EVERY copy in the file (the DOM asides AND the re-import envelope source), mirroring
// the CLI `--strip-notes`. Accessible slide descriptions are kept (they're the slide's
// text alternative, not private speaker copy). See share-export.ts › shareHtmlPlayer.

import { ArrowLeft, Globe, Loader2, MicOff, Monitor, Moon, Sun } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';

type Scheme = 'light' | 'dark' | 'system';

export function WebpageOptionsPanel({
	busy,
	status,
	mode,
	onBack,
	onExport,
}: {
	busy?: boolean;
	status?: string | null;
	// The Studio's current preview mode — the default color mode the export opens in,
	// so the shared file is WYSIWYG unless the author chooses otherwise.
	mode: 'light' | 'dark';
	onBack: () => void;
	onExport: (stripNotes: boolean, scheme: Scheme) => void;
}) {
	// Default OFF: notes ride (matching the CLI player default). Stripping is opt-in.
	const [stripNotes, setStripNotes] = React.useState(false);
	// The exported player's default color mode. Initialized from the current preview so the
	// download matches what the author sees; 'system' defers to the receiver's OS. The panel
	// remounts each time the export step is opened (ShareSheet renders it conditionally), so
	// this mount-time default already re-syncs to the live mode — no effect needed, and none
	// added, so an explicit user pick is never silently clobbered by a background mode flip.
	const [scheme, setScheme] = React.useState<Scheme>(mode);

	const SCHEMES: { value: Scheme; label: string; icon: React.ReactNode }[] = [
		{ value: 'light', label: 'Light', icon: <Sun className="size-3.5" /> },
		{ value: 'dark', label: 'Dark', icon: <Moon className="size-3.5" /> },
		{ value: 'system', label: 'System', icon: <Monitor className="size-3.5" /> },
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
				    mode on every device; System defers to the receiver's OS. The in-player
				    toggle still lets any viewer override for themselves. */}
				<div className="rounded-xl border border-border bg-background p-3.5">
					<span className="block text-[13px] font-semibold text-[var(--text-heading)]">Color mode</span>
					<span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">
						{scheme === 'system'
							? 'The player opens in the viewer’s OS mode — light or dark follows their device. A viewer can still toggle.'
							: `The player always opens in ${scheme} mode, on every device. A viewer can still toggle.`}
					</span>
					<div className="mt-2.5 grid grid-cols-3 gap-1.5 rounded-lg bg-[var(--accent-soft)] p-1">
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
						<button
							type="button"
							role="switch"
							aria-checked={stripNotes}
							aria-label="Strip speaker notes"
							disabled={busy}
							onClick={() => setStripNotes((v) => !v)}
							className={cn('relative mt-0.5 h-[22px] w-[38px] shrink-0 rounded-full transition-colors disabled:opacity-40', stripNotes ? 'bg-primary' : 'bg-border')}
						>
							<span className={cn('absolute top-[2px] size-[18px] rounded-full bg-white shadow transition-all', stripNotes ? 'left-[18px]' : 'left-[2px]')} />
						</button>
					</div>
				</div>
			</section>

			<button
				type="button"
				disabled={busy}
				onClick={() => onExport(stripNotes, scheme)}
				className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-3 text-[13.5px] font-semibold text-[var(--on-accent,#fff)] hover:opacity-90 disabled:opacity-60"
			>
				{busy ? <Loader2 className="size-4 animate-spin" /> : <Globe className="size-4" />}
				{busy ? status || 'Exporting…' : 'Download webpage'}
			</button>
		</div>
	);
}
