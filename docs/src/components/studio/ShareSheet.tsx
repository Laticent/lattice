import { Captions, ChevronRight, Download, FileArchive, FileText, Globe, Images, Link2, Loader2, Monitor, Package, Printer } from 'lucide-react';
import * as React from 'react';
import { PanelBody, PanelHeader, PanelSection, PanelSheet } from '@/components/ui/panel';
import { chunkLoadMessage, isChunkLoadError } from '@/lib/chunk-load';
import { deckColorMode } from '@/lib/deck-theme';
import type { SingleSlideOptions } from '@/lib/single-slide-render';
import { deckFilename } from './decks';
import { ExportOptionsPanel } from './ExportOptionsPanel';
import { buildCommentAnnotations, type ExportOptions } from './export-options';
import { mergeClassTokens, stripFrontMatter } from './front-matter';
import { ImageSetOptionsPanel } from './ImageSetOptionsPanel';
import { splitSlides } from './lint';
import { PrintOptionsPanel } from './PrintOptionsPanel';
import { type ImageSetOptions, shareCaptions, shareHtmlPlayer, shareImageSet, shareLattice, shareMarkdown, shareMarp, sharePdf, sharePptx, sharePrintSource } from './share-export';
import { WebpageOptionsPanel } from './WebpageOptionsPanel';

// Share belongs to the deck (plan §5): two clearly separated intents — hand off
// the rendered ARTIFACT vs hand off the SOURCE. Every row is REAL now: the source
// paths download/print the Markdown; the artifact paths run the engine export
// pipeline (image PDF/PPTX, vector Print, the Marp ZIP) — see share-export.ts.
function Row({ icon, title, desc, dev, busy, status, onClick }: { icon: React.ReactNode; title: string; desc: string; dev?: boolean; busy?: boolean; status?: string | null; onClick?: () => void }) {
	return (
		<button type="button" disabled={busy} onClick={onClick} className="flex w-full items-center gap-3 rounded-xl border border-border bg-background px-3 py-3 text-left hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--border))] hover:bg-[var(--accent-soft)] disabled:opacity-60">
			<span className={`grid size-9 place-items-center rounded-lg ${dev ? 'bg-card text-muted-foreground' : 'bg-[var(--accent-soft)] text-[var(--accent)]'}`}>{icon}</span>
			<span className="min-w-0"><span className="block text-[13.5px] font-semibold text-[var(--text-heading)]">{title}</span><span className={`block truncate text-[11.5px] ${busy && status ? 'text-[var(--accent)]' : 'text-muted-foreground'}`}>{busy && status ? status : desc}</span></span>
			{busy ? <Loader2 className="ml-auto size-4 animate-spin text-[var(--accent)]" /> : <ChevronRight className="ml-auto size-4 text-muted-foreground" />}
		</button>
	);
}

export function ShareSheet({ open, onOpenChange, deckTitle, source, deckId, finishClass, finishExtraCss, options, palette, mode, extraTheme, extraCss, onPresent, notify }: { open: boolean; onOpenChange: (v: boolean) => void; deckTitle: string; source: string; deckId?: string; finishClass?: string; finishExtraCss?: string; options: SingleSlideOptions; palette: string; mode: 'light' | 'dark'; extraTheme?: { name: string; css: string }; extraCss?: string; onPresent: () => void; notify: (msg: string) => void }) {
	const close = () => onOpenChange(false);
	// The sheet has four views: the format MENU, and a pre-export OPTIONS step for
	// PDF (comments as sticky notes), the Webpage player (strip speaker notes), and
	// PRINT (paper / colour + live preview, prepares the PDF, then prints or saves).
	// Reset to the menu whenever the sheet re-opens so it never lands mid-flow.
	const [view, setView] = React.useState<'menu' | 'pdf' | 'html' | 'print' | 'imageset'>('menu');
	React.useEffect(() => { if (open) setView('menu'); }, [open]);
	// A saved finish renders via a `finish finish-<slug>` class the engine doesn't know
	// + its generated CSS. The two handoffs treat it differently:
	//   • ARTIFACT paths (PDF/PPTX/Print/Present) — bake the look in. Stamp the class
	//     onto every section (merged into any existing `class:`, no clobber) and ride
	//     the finish CSS in extraCss. The recipient gets pixels, so this is correct.
	//   • SOURCE paths (Markdown/Marp) — keep the editable source CLEAN (no phantom
	//     `class:` the deck-lint would flag, no slug that won't resolve elsewhere) and
	//     instead EMBED the finish's generated CSS as a <style> block, so the recipient
	//     renders the custom finish from the markup itself. The class is added to the
	//     embedded copy only (shareMarkdown/shareMarp do that), never the user's source.
	const artifactSource = finishClass ? mergeClassTokens(source, finishClass) : source;
	const [busy, setBusy] = React.useState<string | null>(null);
	// Live per-slide status for the heavy exports (PDF/PPTX), shown in the busy row.
	const [progress, setProgress] = React.useState<string | null>(null);

	// Run an async export with a busy spinner + honest success / failure toast. The
	// heavy artifact exports (PDF/PPTX) can take seconds, so `fn` is handed an
	// `onStatus` it can call to report progress ("Rendering slide 3 of 6…"), which
	// the row surfaces live instead of leaving the user staring at a bare spinner.
	const run = React.useCallback(
		async (key: string, label: string, fn: (onStatus: (m: string) => void) => Promise<void> | void) => {
			if (busy) return;
			setBusy(key);
			setProgress(null);
			try {
				await fn(setProgress);
				notify(`${label} ready.`);
			} catch (e) {
				// Every share row funnels through here, and each one lazy-imports its exporter.
				// A stale tab or a dropped connection failed BEFORE the export began, so echoing
				// the engine's raw text ("Failed to fetch dynamically imported module: /_astro/…")
				// blames the deck and leaks a hashed asset URL into boardroom-facing copy (#1242).
				notify(isChunkLoadError(e) ? chunkLoadMessage() : `${label} failed: ${(e as Error)?.message || 'unexpected error'}`);
			} finally {
				setBusy(null);
				setProgress(null);
			}
		},
		[busy, notify],
	);

	const name = deckFilename(deckTitle).replace(/\.md$/, '');

	// The deck's rendered slide count — the rail's basis (front matter stripped), so a
	// comment's anchor can be bounded to a slide that still exists (the panel count then
	// matches exactly what the export embeds).
	const slideCount = React.useMemo(() => splitSlides(stripFrontMatter(source)).length, [source]);

	// PDF export from the options step: build the comment sticky-note payload from
	// the chosen scope (only when the author opted in), then run the shared export.
	const exportPdf = (opts: ExportOptions) => {
		const annotations = opts.commentsInPdf ? buildCommentAnnotations(deckId, opts.commentScope, slideCount) : undefined;
		run('pdf', 'PDF', (onStatus) => sharePdf(options, artifactSource, name, palette, mode, extraTheme, onStatus, extraCss, annotations));
	};

	// Webpage (.html) export from its options step: notes ride by default; `stripNotes`
	// scrubs them from every copy in the shared file (see WebpageOptionsPanel).
	const exportHtml = (stripNotes: boolean, scheme: 'light' | 'dark' | 'system' | 'inherited') => {
		run('html', 'Webpage', (onStatus) => shareHtmlPlayer(options, artifactSource, name, palette, mode, extraTheme, onStatus, extraCss, deckTitle, stripNotes, scheme));
	};
	// Image set (.zip) export from its options step: format / resolution / thumbnails /
	// SVG extraction — the shared kernel fills perfect-fidelity defaults.
	const exportImages = (imageOpts: ImageSetOptions) => {
		run('images', 'Image set', (onStatus) => shareImageSet(options, artifactSource, name, palette, mode, imageOpts, extraTheme, onStatus, extraCss));
	};
	// The export defaults to the deck's authored `color-mode:` when it has one (so a
	// system/inherited deck's panel reflects that), else the current preview mode.
	// `print` is a paper medium, not a screen scheme — the .html player has no print
	// mode, so a print-authored deck falls back to the current light/dark for the web player.
	const deckCm = deckColorMode(artifactSource);
	const deckDefaultScheme = deckCm && deckCm !== 'print' ? deckCm : mode;

	return (
		<PanelSheet open={open} onOpenChange={onOpenChange} side="right" width="md">
			<PanelHeader
				icon={<Link2 />}
				title={`Share “${deckTitle}”`}
				srDescription="Hand off the rendered deck or the Markdown source."
			/>
			<PanelBody padded={false} className="space-y-6 p-5">
					{view === 'pdf' ? (
						<ExportOptionsPanel deckId={deckId} slideCount={slideCount} busy={busy === 'pdf'} status={progress} onBack={() => setView('menu')} onExport={exportPdf} />
					) : view === 'html' ? (
						<WebpageOptionsPanel busy={busy === 'html'} status={progress} defaultScheme={deckDefaultScheme} onBack={() => setView('menu')} onExport={exportHtml} />
					) : view === 'print' ? (
						<PrintOptionsPanel options={options} source={artifactSource} name={name} palette={palette} mode={mode} extraTheme={extraTheme} extraCss={extraCss} onBack={() => setView('menu')} notify={notify} />
					) : view === 'imageset' ? (
						<ImageSetOptionsPanel busy={busy === 'images'} status={progress} onBack={() => setView('menu')} onExport={exportImages} />
					) : (
						<>
							<PanelSection label="Hand off the deck">
								<p className="text-xs text-muted-foreground">The rendered, paginated deck — for your audience.</p>
								<Row icon={<Link2 className="size-4" />} title="Present link" desc="A live, themed link that opens in Present" onClick={() => { close(); onPresent(); }} />
								<Row busy={busy === 'pdf'} status={progress} icon={<Download className="size-4" />} title="PDF" desc="One slide per page — choose what rides along" onClick={() => setView('pdf')} />
								<Row busy={busy === 'pptx'} status={progress} icon={<Monitor className="size-4" />} title="PowerPoint" desc="PPTX, one slide per page" onClick={() => run('pptx', 'PowerPoint', (onStatus) => sharePptx(options, artifactSource, name, palette, mode, extraTheme, onStatus, extraCss))} />
								<Row busy={busy === 'images'} status={progress} icon={<Images className="size-4" />} title="Images (.zip)" desc="One image per slide — PNG/JPEG/WebP, thumbnails, chart SVGs" onClick={() => setView('imageset')} />
								<Row icon={<Printer className="size-4" />} title="Print deck" desc="Pick paper &amp; colour, preview, then print or save" onClick={() => setView('print')} />
								<Row busy={busy === 'html'} status={progress} icon={<Globe className="size-4" />} title="Webpage (.html)" desc="One self-contained file — opens in any browser, offline" onClick={() => setView('html')} />
								<Row busy={busy === 'captions'} status={progress} icon={<Captions className="size-4" />} title="Captions (.vtt)" desc="Read-along WebVTT from your speaker notes — no audio, no key" onClick={() => run('captions', 'Captions', (onStatus) => shareCaptions(options, artifactSource, name, palette, mode, extraTheme, onStatus))} />
							</PanelSection>
							<PanelSection label="Hand off the source">
								<p className="text-xs text-muted-foreground">The Markdown — for editing, review, or portability.</p>
								<Row busy={busy === 'lattice'} icon={<FileArchive className="size-4" />} title="Lattice project (.lattice)" desc="Deck + comments in one file — re-opens here" onClick={() => run('lattice', 'Lattice project', () => shareLattice(source, name, deckTitle, deckId, Date.now()))} />
								<Row dev busy={busy === 'md'} icon={<FileText className="size-4" />} title="Markdown" desc="Source with the theme embedded" onClick={() => run('md', 'Markdown', () => shareMarkdown(options, source, name, palette, extraTheme, finishClass, finishExtraCss))} />
								<Row dev busy={busy === 'marp'} icon={<Package className="size-4" />} title="Marp bundle" desc="Self-contained ZIP — renders anywhere" onClick={() => run('marp', 'Marp bundle', () => shareMarp(options, source, name, palette, finishClass, finishExtraCss))} />
								<Row dev icon={<Printer className="size-4" />} title="Print source" desc="The Markdown, monospace — for markup &amp; review" onClick={() => run('printsrc', 'Print source', () => sharePrintSource(source, name))} />
							</PanelSection>
						</>
					)}
			</PanelBody>
		</PanelSheet>
	);
}
