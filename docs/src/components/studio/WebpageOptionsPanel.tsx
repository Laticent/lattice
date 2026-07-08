// Export options — the pre-export step for the self-contained Webpage (.html) player.
// Speaker notes ride into the player by default (they power its Present-mode notes
// sheet, exactly like the CLI --player). Stripping them is the deliberate PRIVACY
// choice: a deck shared as a webpage shouldn't carry the presenter's private speaker
// text unless the author says so — so "Strip speaker notes" scrubs the note text from
// EVERY copy in the file (the DOM asides AND the re-import envelope source), mirroring
// the CLI `--strip-notes`. Accessible slide descriptions are kept (they're the slide's
// text alternative, not private speaker copy). See share-export.ts › shareHtmlPlayer.

import { ArrowLeft, Globe, Loader2, MicOff } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';

export function WebpageOptionsPanel({
	busy,
	status,
	onBack,
	onExport,
}: {
	busy?: boolean;
	status?: string | null;
	onBack: () => void;
	onExport: (stripNotes: boolean) => void;
}) {
	// Default OFF: notes ride (matching the CLI player default). Stripping is opt-in.
	const [stripNotes, setStripNotes] = React.useState(false);

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

				{/* Strip speaker notes — a privacy opt-in for a shared file. */}
				<div className="rounded-xl border border-border bg-background p-3.5">
					<div className="flex items-start justify-between gap-3">
						<span className="flex items-start gap-2">
							<MicOff className="mt-0.5 size-4 text-[var(--accent)]" />
							<span>
								<span className="block text-[13px] font-semibold text-[var(--text-heading)]">Strip speaker notes</span>
								<span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">
									{stripNotes
										? 'Speaker notes will be removed from every copy in the file — the shared webpage carries no private speaker text.'
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
				onClick={() => onExport(stripNotes)}
				className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-3 text-[13.5px] font-semibold text-[var(--on-accent,#fff)] hover:opacity-90 disabled:opacity-60"
			>
				{busy ? <Loader2 className="size-4 animate-spin" /> : <Globe className="size-4" />}
				{busy ? status || 'Exporting…' : 'Download webpage'}
			</button>
		</div>
	);
}
