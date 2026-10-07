// Export options — the pre-export step for PDF and PowerPoint. The deck's notes +
// descriptions already ride into their native export homes automatically; two things are
// the author's deliberate choice, both default OFF:
//   · COMMENTS (PDF only) — app-state review feedback that should enter a shared PDF only
//     when the author says so (a board handout shouldn't silently carry private review
//     notes; a reviewer handoff should). engineering/decisions/2026-07-04-comments-layer.md.
//   · RE-OPENABLE — the deck's `.lattice` rides inside the file so the recipient can open
//     and edit it in the Studio. It carries speaker notes and hidden slides, never
//     comments. engineering/decisions/2026-10-05-reopenable-exports.md.
//   · EDITABLE TEXT (PowerPoint, LibreOffice) — every paragraph a real text box instead of
//     one picture per slide. Off by default: the picture is exact, and editable text depends
//     on the fonts the file embeds.
//     engineering/decisions/2026-10-06-calco-office-export-library.md.
// So tapping "PDF", "PowerPoint" or "LibreOffice" lands here first — pick what rides along,
// then Download.

import { ArrowLeft, Download, FileArchive, Loader2, MessageSquare, Type } from 'lucide-react';
import * as React from 'react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { type CommentScope, commentCount, type ExportOptions, loadEmbedSource, saveEmbedSource } from './export-options';

export function ExportOptionsPanel({
	format = 'pdf',
	deckId,
	slideCount,
	busy,
	status,
	onBack,
	onExport,
}: {
	/** Which export this step is for. Only the PDF takes sticky notes; only the office
	 *  formats take editable text; LibreOffice cannot carry the re-openable source. */
	format?: 'pdf' | 'pptx' | 'odp';
	deckId?: string;
	/** The deck's rendered slide count — bounds a comment's anchor so the count
	 *  shown here matches exactly what the export embeds (see export-options). */
	slideCount?: number;
	busy?: boolean;
	status?: string | null;
	onBack: () => void;
	onExport: (opts: ExportOptions) => void;
}) {
	// Default OFF: comments are private review — including them in a shared PDF is a
	// deliberate opt-in, so the plain one-tap PDF never leaks review notes.
	const [commentsInPdf, setCommentsInPdf] = React.useState(false);
	const [commentScope, setCommentScope] = React.useState<CommentScope>('all');
	// Remembered per deck (export-options.ts): the answer for THIS deck's audience.
	const [embedSource, setEmbedSource] = React.useState(() => loadEmbedSource(deckId));
	const [editable, setEditable] = React.useState(false);
	const isPdf = format === 'pdf';
	const isOffice = format === 'pptx' || format === 'odp';
	const label = isPdf ? 'PDF' : format === 'pptx' ? 'PowerPoint' : 'LibreOffice';
	const total = commentCount(deckId, 'all', slideCount);
	const inScope = commentCount(deckId, commentScope, slideCount);

	return (
		<div className="space-y-5">
			<button type="button" onClick={onBack} disabled={busy} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground hover:text-[var(--text-heading)] disabled:opacity-50">
				<ArrowLeft className="size-3.5" />All formats
			</button>

			<section className="space-y-3">
				<div>
					<h3 className="text-[15px] font-semibold text-[var(--text-heading)]">Export {label}</h3>
					<p className="mt-0.5 text-[12px] text-muted-foreground">{isPdf ? 'One slide per page, high-resolution.' : editable ? 'Real text boxes over a picture of each slide.' : 'One full-bleed picture per slide.'} Choose what rides along before you download.</p>
				</div>

				{/* Comments → sticky notes. Only actionable when the deck has comments. */}
				{isPdf && (
				<div className="rounded-xl border border-border bg-background p-3.5">
					<div className="flex items-start justify-between gap-3">
						<span className="flex items-start gap-2">
							<MessageSquare className="mt-0.5 size-4 shrink-0 text-[var(--accent)]" />
							<span>
								<span className="block text-[13px] font-semibold text-[var(--text-heading)]">Add comments as sticky notes</span>
								<span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">
									{total > 0
										? 'Each review comment becomes a PDF sticky note on its slide — click to read in any PDF viewer.'
										: 'No comments on this deck yet — add them in a slide’s Comments tab.'}
								</span>
							</span>
						</span>
						<Switch className="mt-0.5" aria-label="Add comments as sticky notes" checked={commentsInPdf && total > 0} disabled={busy || total === 0} onCheckedChange={setCommentsInPdf} />
					</div>

					{commentsInPdf && total > 0 && (
						<div className="mt-3 flex items-center justify-between gap-2 border-t border-border/60 pt-3">
							<RadioGroup aria-label="Which comments to include" className="overflow-hidden rounded-md border border-border" value={commentScope} onValueChange={(v) => setCommentScope(v as 'all' | 'open')}>
								{([
									{ label: 'All', value: 'all' as const },
									{ label: 'Open only', value: 'open' as const },
								]).map((o, i) => (
									<RadioGroupItem
										key={o.value}
										value={o.value}
										className={cn('px-2.5 py-1 text-[12px] text-foreground hover:bg-[var(--accent-soft)] data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground', i > 0 && 'border-l border-border')}
									>
										{o.label}
									</RadioGroupItem>
								))}
							</RadioGroup>
							<span className="text-[11.5px] text-muted-foreground">{inScope} {inScope === 1 ? 'note' : 'notes'}</span>
						</div>
					)}
				</div>
				)}

				{/* Editable text: the office formats only. */}
				{isOffice && (
					<div className="rounded-xl border border-border bg-background p-3.5">
						<div className="flex items-start justify-between gap-3">
							<span className="flex items-start gap-2">
								<Type className="mt-0.5 size-4 shrink-0 text-[var(--accent)]" />
								<span>
									<span className="block text-[13px] font-semibold text-[var(--text-heading)]">Editable text</span>
									<span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">
										Every paragraph becomes a text box you can edit, with the deck’s fonts built in. Charts and diagrams stay pictures.
									</span>
								</span>
							</span>
							<Switch className="mt-0.5" aria-label="Editable text" checked={editable} disabled={busy} onCheckedChange={setEditable} />
						</div>
					</div>
				)}

				{/* Re-openable: the deck's source rides inside the file. */}
				{format !== 'odp' && (
				<div className="rounded-xl border border-border bg-background p-3.5">
					<div className="flex items-start justify-between gap-3">
						<span className="flex items-start gap-2">
							<FileArchive className="mt-0.5 size-4 shrink-0 text-[var(--accent)]" />
							<span>
								<span className="block text-[13px] font-semibold text-[var(--text-heading)]">Re-openable in Lattice</span>
								<span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">
									Anyone you send this {label} to can import it in Lattice and edit the deck. It includes your speaker notes and hidden slides; comments stay out.
								</span>
							</span>
						</span>
						<Switch className="mt-0.5" aria-label="Re-openable in Lattice" checked={embedSource} disabled={busy} onCheckedChange={setEmbedSource} />
					</div>
				</div>
				)}
			</section>

			<button
				type="button"
				data-demo={isPdf ? 'pdf-download' : 'pptx-download'}
				disabled={busy}
				onClick={() => {
					const reopenable = format !== 'odp' && embedSource;
					if (format !== 'odp') saveEmbedSource(deckId, embedSource);
					onExport({ commentsInPdf: isPdf && commentsInPdf && total > 0, commentScope, embedSource: reopenable, editable: isOffice && editable });
				}}
				className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-3 text-[13.5px] font-semibold text-[var(--on-accent,#fff)] hover:opacity-90 disabled:opacity-60"
			>
				{busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
				{busy ? status || 'Exporting…' : `Download ${label}`}
			</button>
		</div>
	);
}
