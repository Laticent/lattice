// Export options — the pre-export step for PDF. The deck's notes + descriptions
// already ride into their native export homes automatically; COMMENTS are the
// deliberate choice: app-state review feedback that should enter a shared PDF only
// when the author says so (a board handout shouldn't silently carry private review
// notes; a reviewer handoff should). So tapping "PDF" lands here first — pick what
// rides along, then Download. See engineering/decisions/2026-07-04-comments-layer.md.

import { ArrowLeft, Download, Loader2, MessageSquare } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { type CommentScope, commentCount, type ExportOptions } from './export-options';

export function ExportOptionsPanel({
	deckId,
	busy,
	status,
	onBack,
	onExport,
}: {
	deckId?: string;
	busy?: boolean;
	status?: string | null;
	onBack: () => void;
	onExport: (opts: ExportOptions) => void;
}) {
	// Default OFF: comments are private review — including them in a shared PDF is a
	// deliberate opt-in, so the plain one-tap PDF never leaks review notes.
	const [commentsInPdf, setCommentsInPdf] = React.useState(false);
	const [commentScope, setCommentScope] = React.useState<CommentScope>('all');
	const total = commentCount(deckId, 'all');
	const inScope = commentCount(deckId, commentScope);

	return (
		<div className="space-y-5">
			<button type="button" onClick={onBack} disabled={busy} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground hover:text-[var(--text-heading)] disabled:opacity-50">
				<ArrowLeft className="size-3.5" />All formats
			</button>

			<section className="space-y-3">
				<div>
					<h3 className="text-[15px] font-semibold text-[var(--text-heading)]">Export PDF</h3>
					<p className="mt-0.5 text-[12px] text-muted-foreground">One slide per page, high-resolution. Choose what rides along before you download.</p>
				</div>

				{/* Comments → sticky notes. Only actionable when the deck has comments. */}
				<div className="rounded-xl border border-border bg-background p-3.5">
					<div className="flex items-start justify-between gap-3">
						<span className="flex items-start gap-2">
							<MessageSquare className="mt-0.5 size-4 text-[var(--accent)]" />
							<span>
								<span className="block text-[13px] font-semibold text-[var(--text-heading)]">Add comments as sticky notes</span>
								<span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">
									{total > 0
										? 'Each review comment becomes a PDF sticky note on its slide — click to read in any PDF viewer.'
										: 'No comments on this deck yet — add them in a slide’s Comments tab.'}
								</span>
							</span>
						</span>
						<button
							type="button"
							role="switch"
							aria-checked={commentsInPdf}
							aria-label="Add comments as sticky notes"
							disabled={busy || total === 0}
							onClick={() => setCommentsInPdf((v) => !v)}
							className={cn('relative mt-0.5 h-[22px] w-[38px] shrink-0 rounded-full transition-colors disabled:opacity-40', commentsInPdf && total > 0 ? 'bg-primary' : 'bg-border')}
						>
							<span className={cn('absolute top-[2px] size-[18px] rounded-full bg-white shadow transition-all', commentsInPdf && total > 0 ? 'left-[18px]' : 'left-[2px]')} />
						</button>
					</div>

					{commentsInPdf && total > 0 && (
						<div className="mt-3 flex items-center justify-between gap-2 border-t border-border/60 pt-3">
							<div role="radiogroup" aria-label="Which comments to include" className="inline-flex overflow-hidden rounded-md border border-border">
								{([
									{ label: 'All', value: 'all' as const },
									{ label: 'Open only', value: 'open' as const },
								]).map((o, i) => (
									// biome-ignore lint/a11y/useSemanticElements: segmented control — buttons in a radiogroup.
									<button
										key={o.value}
										type="button"
										role="radio"
										aria-checked={commentScope === o.value}
										onClick={() => setCommentScope(o.value)}
										className={cn('px-2.5 py-1 text-[12px] font-semibold transition-colors', i > 0 && 'border-l border-border', commentScope === o.value ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-[var(--accent-soft)]')}
									>
										{o.label}
									</button>
								))}
							</div>
							<span className="text-[11.5px] text-muted-foreground">{inScope} {inScope === 1 ? 'note' : 'notes'}</span>
						</div>
					)}
				</div>
			</section>

			<button
				type="button"
				disabled={busy}
				onClick={() => onExport({ commentsInPdf: commentsInPdf && total > 0, commentScope })}
				className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-3 text-[13.5px] font-semibold text-[var(--on-accent,#fff)] hover:opacity-90 disabled:opacity-60"
			>
				{busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
				{busy ? status || 'Exporting…' : 'Download PDF'}
			</button>
		</div>
	);
}
