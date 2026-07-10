import { Menu, MessageSquareHeart, Search } from 'lucide-react';
import * as React from 'react';
import { CommandMenu, GithubIcon, type NavLink } from '@/components/site/CommandMenu';
import { FeedbackSheet } from '@/components/site/FeedbackSheet';
import PaletteControls from '@/components/site/PaletteControls';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from '@/components/ui/sheet';

/**
 * The header's interactive right cluster — one island shared by every surface
 * (standalone routes + the Starlight docs zone), so the controls are byte-for-
 * byte identical site-wide:
 *
 *   • a search trigger (a pill ≥lg, an icon below) that opens the universal ⌘K
 *     command palette — the single findability surface everywhere;
 *   • the shared <PaletteControls> (theme <select> + light/dark toggle);
 *   • a GitHub link;
 *   • on standalone routes, the mobile hamburger → a Sheet carrying the full
 *     nav. In the docs zone (`mobileMenu={false}`) Starlight owns the mobile
 *     menu (it also needs the page TOC), so we render only the cluster.
 *
 * The ⌘K / `/` shortcut and the open state live here.
 */
export default function NavActions({
	palettes,
	links,
	content,
	tools,
	githubUrl,
	pagefindUrl,
	homeHref,
	mobileMenu = true,
}: {
	palettes: string[];
	links: NavLink[];
	content: NavLink[];
	tools: NavLink[];
	githubUrl: string;
	pagefindUrl: string;
	homeHref: string;
	mobileMenu?: boolean;
}) {
	const [open, setOpen] = React.useState(false);
	const [sheet, setSheet] = React.useState(false);
	const [feedbackOpen, setFeedbackOpen] = React.useState(false);

	React.useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
				e.preventDefault();
				setOpen((v) => !v);
				return;
			}
			// "/" opens search too — but never while typing in a field.
			if (e.key === '/' && !isEditable(e.target)) {
				e.preventDefault();
				setOpen(true);
			}
		};
		document.addEventListener('keydown', onKey);
		return () => document.removeEventListener('keydown', onKey);
	}, []);

	return (
		<div className="flex items-center gap-1.5 sm:gap-2">
			{/* Search — pill from lg, icon below it. Both open the same palette. */}
			<Button
				type="button"
				variant="outline"
				onClick={() => setOpen(true)}
				aria-label="Search (⌘K)"
				className="hidden h-8 w-56 justify-start gap-2 px-3 text-muted-foreground lg:inline-flex xl:w-64"
			>
				<Search className="size-4" />
				<span className="text-sm">Search the docs…</span>
				<kbd className="ml-auto inline-flex items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">
					⌘K
				</kbd>
			</Button>
			<Button
				type="button"
				variant="ghost"
				size="icon-sm"
				onClick={() => setOpen(true)}
				aria-label="Search (⌘K)"
				className="lg:hidden"
			>
				<Search className="size-4" />
			</Button>

			<PaletteControls palettes={palettes} compact />

			<Button
				type="button"
				variant="ghost"
				size="icon-sm"
				onClick={() => setFeedbackOpen(true)}
				aria-label="Send feedback"
				title="Send feedback"
				className="hidden lg:inline-flex"
			>
				<MessageSquareHeart className="size-4" />
			</Button>

			<Button asChild variant="ghost" size="icon-sm" aria-label="GitHub repository" className="hidden lg:inline-flex">
				<a href={githubUrl} target="_blank" rel="noreferrer noopener">
					<GithubIcon className="size-4" />
				</a>
			</Button>

			{mobileMenu && (
				<Sheet open={sheet} onOpenChange={setSheet}>
					<SheetTrigger asChild>
						<Button type="button" variant="outline" size="icon-sm" aria-label="Menu" className="lg:hidden">
							<Menu className="size-4" />
						</Button>
					</SheetTrigger>
					<SheetContent side="right" className="w-80 max-w-[85vw] gap-0 p-0">
						<SheetHeader className="border-b">
							<SheetClose asChild>
								<a href={homeHref} className="flex items-center gap-2">
									<img src={`${homeHref}lattice-mark-min.svg`} alt="" width={26} height={26} />
									<SheetTitle className="font-display text-xl">Lattice</SheetTitle>
								</a>
							</SheetClose>
						</SheetHeader>
						<nav className="flex flex-col gap-5 overflow-y-auto p-4" aria-label="Site">
							<SheetSection title="Browse" items={content} onNavigate={() => setSheet(false)} />
							<SheetSection title="Tools" items={tools} onNavigate={() => setSheet(false)} />
							<div className="flex flex-col gap-3 border-t pt-4">
								<span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Theme</span>
								<PaletteControls palettes={palettes} />
							</div>
							<button
								type="button"
								onClick={() => { setSheet(false); setFeedbackOpen(true); }}
								className="flex items-center gap-2 border-t pt-4 text-left text-sm font-medium text-foreground hover:text-primary"
							>
								<MessageSquareHeart className="size-4" /> Send feedback
							</button>
							<a
								href={githubUrl}
								target="_blank"
								rel="noreferrer noopener"
								className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary"
							>
								<GithubIcon className="size-4" /> GitHub
							</a>
						</nav>
					</SheetContent>
				</Sheet>
			)}

			<CommandMenu
				open={open}
				onOpenChange={setOpen}
				links={links}
				palettes={palettes}
				githubUrl={githubUrl}
				pagefindUrl={pagefindUrl}
			/>
			<FeedbackSheet open={feedbackOpen} onOpenChange={setFeedbackOpen} area="Docs site" />
		</div>
	);
}

function SheetSection({
	title,
	items,
	onNavigate,
}: {
	title: string;
	items: NavLink[];
	onNavigate: () => void;
}) {
	return (
		<div className="flex flex-col gap-1">
			<span className="px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</span>
			{items.map((l) => (
				<a
					key={l.href}
					href={l.href}
					onClick={onNavigate}
					aria-current={l.current ? 'page' : undefined}
					className="flex flex-col rounded-md px-2 py-2 text-[15px] font-medium text-foreground hover:bg-accent aria-[current=page]:bg-accent aria-[current=page]:text-primary"
				>
					<span className="flex items-center gap-1.5">
						{l.label}
						{l.badge && (
							<Badge className="border-transparent bg-primary/15 px-1.5 py-0 text-[10px] font-semibold tracking-wide text-primary uppercase">
								{l.badge}
							</Badge>
						)}
					</span>
					{l.desc && <span className="text-xs font-normal text-muted-foreground">{l.desc}</span>}
				</a>
			))}
		</div>
	);
}

function isEditable(el: EventTarget | null): boolean {
	if (!(el instanceof HTMLElement)) return false;
	const tag = el.tagName;
	return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}
