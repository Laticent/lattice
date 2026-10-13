import { LayoutGrid } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useOverlayBack } from '@/lib/overlay-back';
import { useIsPhone } from '@/lib/use-breakpoint';

export type GalleryItem = { id: string; label: string; slides: number };
/** One `examples/*.md` deck in the on-demand index (`galleries/index.json`). */
export type ExampleDeck = { id: string; title: string; slides: number };
export type GalleryGroup = { key: string; hint: string; items: GalleryItem[] };

/**
 * "Load a deck" — the galleries drawer, fully rebuilt as a shadcn Sheet
 * (replacing the vanilla pg-drawer + scrim and its open/close/Esc wiring, which
 * Radix Dialog now owns accessibly). Two sections: reset to the picked
 * component's example, and load a full showcase / family deck. Selecting either
 * closes the Sheet and hands the action up to the controller.
 *
 * "Insert blank skeleton" is deliberately GONE (2026-07-05 Specimen Book
 * decision §0.4): skeleton insertion is an authoring affordance the Studio does
 * properly; in a playground it produced an empty scaffold that renders badly
 * and teaches nothing.
 *
 * Reset names its target and arm-confirms over a dirty draft (`resetArm`): the
 * first press arms, the second replaces — and the controller parks a backup
 * with an undo toast either way.
 */
export function GalleriesSheet({
	groups,
	resetTarget,
	resetArm,
	onLoadGallery,
	loadExampleIndex,
	onLoadExample,
	onResetExample,
}: {
	groups: GalleryGroup[];
	resetTarget: string;
	resetArm: boolean;
	onLoadGallery: (id: string) => void;
	/** Fetches the every-example index; absent when the host staged none (the section hides). */
	loadExampleIndex?: () => Promise<ExampleDeck[] | null>;
	onLoadExample: (id: string) => void;
	onResetExample: () => void;
}) {
	const [open, setOpen] = React.useState(false);
	// Back closes this sheet instead of leaving the page (#1226 follow-up). Phone only.
	// Registering here is what makes the site's back behavior UNIFORM: `FeedbackSheet`
	// is a `PanelSheet` and so registered from the day the guard landed, while the raw
	// `Sheet`s around it did not — so back closed feedback but left the site from the
	// nav sheet underneath it. A mixed stack is worse than either rule applied evenly.
	const phone = useIsPhone();
	useOverlayBack(phone && open, React.useCallback(() => setOpen(false), []));
	const [armed, setArmed] = React.useState(false);
	const close = () => {
		setOpen(false);
		setArmed(false);
	};

	return (
		<Sheet open={open} onOpenChange={setOpen} modal={false}>
			<SheetTrigger asChild>
				<Button id="pg-galleries-trigger" variant="outline" size="sm" aria-label="Galleries" title="Galleries — load a showcase, family or example deck">
					<LayoutGrid />
					<span className="hidden sm:inline">Galleries</span>
				</Button>
			</SheetTrigger>
			<SheetContent overlay={false} className="w-[360px] max-w-[88vw] gap-0 overflow-y-auto overscroll-contain [touch-action:pan-y]">
				<SheetHeader className="border-b border-border">
					<SheetTitle className="flex items-center gap-2 text-[15px]"><LayoutGrid className="size-[18px] text-[var(--accent)]" />Load a deck</SheetTitle>
					<SheetDescription className="sr-only">
						Scaffold the selected component, or open a showcase, family survey or example deck.
					</SheetDescription>
				</SheetHeader>
				<div className="flex flex-col gap-5 px-4 pb-5">
					<section>
						<h3 className="m-0 mb-0.5 font-mono text-[11px] uppercase tracking-[0.12em] text-primary">This component</h3>
						<p className="m-0 mb-2 text-xs leading-snug text-muted-foreground">
							Scaffold the component selected in the bar.
						</p>
						<div className="flex flex-col gap-1.5">
							<DrawerAction
								disabled={!resetTarget}
								onClick={() => {
									if (resetArm && !armed) {
										setArmed(true);
										return;
									}
									onResetExample();
									close();
								}}
							>
								{armed
									? `Replace your draft with the ${resetTarget} example?`
									: resetTarget
										? `Reset to the ${resetTarget} example`
										: 'Reset to example'}
							</DrawerAction>
							{armed && (
								<button
									type="button"
									onClick={() => setArmed(false)}
									className="self-start px-2.5 text-xs text-muted-foreground hover:text-foreground"
								>
									Keep my draft
								</button>
							)}
						</div>
					</section>
					{groups.map((grp) => (
						<section key={grp.key}>
							<h3 className="m-0 mb-0.5 font-mono text-[11px] uppercase tracking-[0.12em] text-primary">{grp.key}</h3>
							<p className="m-0 mb-2 text-xs leading-snug text-muted-foreground">{grp.hint}</p>
							<ul className="m-0 flex list-none flex-col gap-1.5 p-0">
								{grp.items.map((g) => (
									<li key={g.id}>
										<button
											type="button"
											onClick={() => {
												onLoadGallery(g.id);
												close();
											}}
											className="flex w-full items-baseline justify-between gap-3 rounded-md border border-border bg-background px-2.5 py-2 text-left hover:border-primary hover:bg-accent"
										>
											<span className="text-sm font-semibold text-foreground">{g.label}</span>
											<span className="shrink-0 font-mono text-[10.5px] tracking-wide text-muted-foreground">
												{g.slides} {g.slides === 1 ? 'slide' : 'slides'}
											</span>
										</button>
									</li>
								))}
							</ul>
						</section>
					))}
					{loadExampleIndex && (
						<ExamplesSection
							open={open}
							loadIndex={loadExampleIndex}
							onPick={(id) => {
								onLoadExample(id);
								close();
							}}
						/>
					)}
				</div>
			</SheetContent>
		</Sheet>
	);
}

function DrawerAction({
	children,
	disabled,
	onClick,
}: {
	children: React.ReactNode;
	disabled?: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			disabled={disabled}
			onClick={onClick}
			className="rounded-md border border-border bg-background px-2.5 py-2 text-left text-sm text-foreground hover:border-primary hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
		>
			{children}
		</button>
	);
}

/**
 * "All examples": a searchable list of every `examples/*.md` deck, A–Z by title with its
 * slide count. Inline in the sheet rather than a popover — the sheet is non-modal, and a
 * portaled popover would count as an outside click and dismiss it. The index is fetched when
 * the sheet first opens (never on page load) and a failed fetch is retried on the next open.
 */
function ExamplesSection({
	open,
	loadIndex,
	onPick,
}: {
	open: boolean;
	loadIndex: () => Promise<ExampleDeck[] | null>;
	onPick: (id: string) => void;
}) {
	const [decks, setDecks] = React.useState<ExampleDeck[] | null>(null);
	const [failed, setFailed] = React.useState(false);
	React.useEffect(() => {
		if (!open || decks) return;
		let live = true;
		setFailed(false);
		void loadIndex().then((list) => {
			if (!live) return;
			if (list) setDecks(list);
			else setFailed(true);
		});
		return () => {
			live = false;
		};
	}, [open, decks, loadIndex]);

	return (
		<section>
			<h3 className="m-0 mb-0.5 font-mono text-[11px] uppercase tracking-[0.12em] text-primary">All examples</h3>
			<p className="m-0 mb-2 text-xs leading-snug text-muted-foreground">
				Every per-feature demo deck in the repo{decks ? ` (${decks.length})` : ''}. Search by title.
			</p>
			{failed ? (
				<p className="m-0 text-xs text-muted-foreground">Examples unavailable. Close and reopen to retry.</p>
			) : (
				<Command className="h-auto rounded-md border border-border bg-background focus-within:border-primary focus-within:ring-1 focus-within:ring-primary">
					<CommandInput aria-label="Search examples" placeholder={decks ? 'Search examples…' : 'Loading examples…'} disabled={!decks} />
					<CommandList className="max-h-64">
						<CommandEmpty>No example matches.</CommandEmpty>
						{(decks ?? []).map((d) => (
							<CommandItem key={d.id} value={`${d.title} ${d.id}`} onSelect={() => onPick(d.id)} className="justify-between gap-3">
								<span className="flex min-w-0 flex-col">
									<span className="truncate text-sm">{d.title}</span>
									<span className="truncate font-mono text-[10.5px] text-muted-foreground">{d.id}</span>
								</span>
								<span className="shrink-0 font-mono text-[10.5px] tracking-wide text-muted-foreground">
									{d.slides} {d.slides === 1 ? 'slide' : 'slides'}
								</span>
							</CommandItem>
						))}
					</CommandList>
				</Command>
			)}
		</section>
	);
}
