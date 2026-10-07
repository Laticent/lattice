import { Captions, ChevronRight, Download, FileArchive, FileText, Globe, Images, Link2, Loader2, Monitor, Package, Presentation, Printer, UsersRound } from 'lucide-react';
import type * as React from 'react';

// The Share sheet's menu: its header, its two sections and every row's icon, title and
// description. The real sheet (`ShareSheet.tsx`, loaded on first open) and its loading shell
// (`panel-shells.tsx`, at startup) both render from this list, so the shell shows exactly the
// menu that is about to appear and cannot drift from it. Keep this module light: it loads
// with the Studio, and anything it imports does too.

export const SHARE_HEADER = {
	icon: <Link2 />,
	title: (deckTitle: string) => `Share “${deckTitle}”`,
	srDescription: 'Hand off the rendered deck or the Markdown source.',
} as const;

export type ShareRowId = 'live' | 'present' | 'pdf' | 'pptx' | 'odp' | 'images' | 'print' | 'html' | 'captions' | 'lattice' | 'md' | 'marp' | 'printsrc';

type ShareRowDef = { id: ShareRowId; icon: React.ReactNode; title: string; desc: string; dev?: boolean };

export const SHARE_MENU: ReadonlyArray<{ label: string; blurb: string; rows: ReadonlyArray<ShareRowDef> }> = [
	{
		label: 'Work on it together',
		blurb: 'Edit live with up to three others, browser to browser.',
		rows: [{ id: 'live', icon: <UsersRound className="size-4" />, title: 'Collaborate live', desc: 'Share a link — people knock, you let them in' }],
	},
	{
		label: 'Hand off the deck',
		blurb: 'The rendered, paginated deck — for your audience.',
		rows: [
			{ id: 'present', icon: <Link2 className="size-4" />, title: 'Present link', desc: 'A live, themed link that opens in Present' },
			{ id: 'pdf', icon: <Download className="size-4" />, title: 'PDF', desc: 'One slide per page — choose what rides along' },
			{ id: 'pptx', icon: <Monitor className="size-4" />, title: 'PowerPoint', desc: 'PPTX — pictures or editable text' },
			{ id: 'odp', icon: <Presentation className="size-4" />, title: 'LibreOffice', desc: 'ODP for Impress — pictures or editable text' },
			{ id: 'images', icon: <Images className="size-4" />, title: 'Images (.zip)', desc: 'One image per slide — PNG/JPEG/WebP, thumbnails, chart SVGs' },
			{ id: 'print', icon: <Printer className="size-4" />, title: 'Print deck', desc: 'Pick paper & color, preview, then print or save' },
			{ id: 'html', icon: <Globe className="size-4" />, title: 'Webpage (.html)', desc: 'One self-contained file — opens in any browser, offline' },
			{ id: 'captions', icon: <Captions className="size-4" />, title: 'Captions (.vtt)', desc: 'Read-along WebVTT from your slide content — no audio, no key' },
		],
	},
	{
		label: 'Hand off the source',
		blurb: 'The Markdown — for editing, review, or portability.',
		rows: [
			{ id: 'lattice', icon: <FileArchive className="size-4" />, title: 'Lattice project (.lattice)', desc: 'Deck, comments and its saved assets in one file — re-opens here' },
			{ id: 'md', icon: <FileText className="size-4" />, title: 'Markdown', desc: 'Source with the theme embedded', dev: true },
			{ id: 'marp', icon: <Package className="size-4" />, title: 'Marp bundle', desc: 'Self-contained ZIP — renders anywhere', dev: true },
			{ id: 'printsrc', icon: <Printer className="size-4" />, title: 'Print source', desc: 'The Markdown, monospace — for markup & review', dev: true },
		],
	},
];

/**
 * One menu row. `pending` is the loading shell's state (`panel-shells.tsx`): the row is drawn
 * exactly as it will be, but its arrow is a spinner, so a tap that cannot act yet does not look
 * like a tap that was ignored. The spinner is the arrow's size, so nothing moves when it goes.
 */
export function ShareRow({ icon, title, desc, dev, busy, status, pending, onClick, demo }: { icon: React.ReactNode; title: string; desc: string; dev?: boolean; busy?: boolean; status?: string | null; pending?: boolean; onClick?: () => void; demo?: string }) {
	return (
		<button type="button" data-demo={demo} disabled={busy} onClick={onClick} className="flex w-full items-center gap-3 rounded-xl border border-border bg-background px-3 py-3 text-left hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--border))] hover:bg-[var(--accent-soft)] disabled:opacity-60">
			<span className={`grid size-9 place-items-center rounded-lg ${dev ? 'bg-card text-muted-foreground' : 'bg-[var(--accent-soft)] text-[var(--accent)]'}`}>{icon}</span>
			<span className="min-w-0"><span className="block text-[13.5px] font-semibold text-[var(--text-heading)]">{title}</span><span className={`block truncate text-[11.5px] ${busy && status ? 'text-[var(--accent)]' : 'text-muted-foreground'}`}>{busy && status ? status : desc}</span></span>
			{busy ? <Loader2 className="ml-auto size-4 animate-spin text-[var(--accent)]" /> : pending ? <Loader2 className="ml-auto size-4 animate-spin text-muted-foreground" /> : <ChevronRight className="ml-auto size-4 text-muted-foreground" />}
		</button>
	);
}
