import { Columns2, FileBox, FileText, Focus, MonitorPlay, Palette, PanelLeftClose, PanelLeftOpen, PanelRightClose, PencilRuler, Play, Plus, Search, Settings2, Share2, Sparkles } from 'lucide-react';
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import { PanelHeader, PanelSheet } from '@/components/ui/panel';
import { useBreakpoint } from '@/lib/use-breakpoint';
import type { StudioDeck } from './decks';
import { FeedbackIcon } from './icons';

// The "type what you want" spine (plan §2.2). Every bar action is also a command.
export function CommandPalette({
	open, onOpenChange, onRun, decks, palettes, onPickDeck, onNewDeck, onPalette, onPresent, onShare, onFabricate, onReshape, onWatchDemo, onInsert, onFocus, onFeedback, onLibrary, onWorkspace,
	onCollapseEditor, onCollapsePreview, onExpandPane, onResetSplit,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	/**
	 * Fired when the palette closes because the user RAN something, as opposed to
	 * dismissing it. `onOpenChange(false)` alone cannot tell those apart, and the caller
	 * sometimes needs to: the mobile StudioDrawer re-opens itself when a surface it
	 * launched goes away, and without this signal running any of ~31 commands from the
	 * drawer's own "Search / commands" row sprang the drawer back up on top of the result
	 * — including over a live guided tour, whose "click anywhere to take over" tap the
	 * drawer's modal overlay then ate. (Red team, PR #1198.)
	 */
	onRun?: () => void;
	decks: StudioDeck[];
	palettes: string[];
	onPickDeck: (d: StudioDeck) => void;
	// New deck — the slim Write header's switcher carries it too, but ⌘K is the
	// header's stated "reaches every feature" path, so it must be reachable here.
	onNewDeck: () => void;
	onPalette: (p: string) => void;
	onPresent: () => void;
	onShare: () => void;
	onFabricate: () => void;
	onReshape: () => void;
	onWatchDemo?: () => void;
	onInsert?: () => void;
	onFocus?: () => void;
	onFeedback?: () => void;
	// Workspace opens as an overlay at ANY stop; the Library is now a docked Build
	// panel, so its handler (like onReshape) first transiently reveals Build before
	// opening the slot — keeping "every faculty is one keystroke away from every stop"
	// true even from Read/Write where the activity bar isn't shown.
	// (2026-07-17-studio-persona-dial.md, 2026-07-17-panel-drawer-cohesion.md)
	onLibrary?: () => void;
	onWorkspace?: () => void;
	// The editor|preview split (2026-07-02 decision) — each handler is passed
	// only while it applies (e.g. no Expand without a collapsed pane), so the
	// palette never lists a dead command.
	onCollapseEditor?: () => void;
	onCollapsePreview?: () => void;
	onExpandPane?: () => void;
	onResetSplit?: () => void;
}) {
	// The palette is the surface where the keyboard bug was REPORTED: with the keyboard
	// up its list collapsed to a single row, with iOS's own accessory bar drawn over it.
	// On mobile it is now a PanelSheet, which owns the keyboard listener — so there is
	// nothing to mount here.
	const mobile = useBreakpoint() === 'mobile';
	const run = (fn: () => void) => () => {
		onRun?.();
		onOpenChange(false);
		fn();
	};
	// The palette body is identical on both transports — only the frame differs.
	const body = (
		<>
			<CommandInput placeholder="Search or run a command…" />
			<CommandList>
				<CommandEmpty>No matches.</CommandEmpty>
				<CommandGroup heading="Actions">
					<CommandItem onSelect={run(onPresent)}><Play />Present</CommandItem>
					<CommandItem onSelect={run(onShare)}><Share2 />Share…</CommandItem>
					<CommandItem onSelect={run(onReshape)}><Sparkles />Reshape for a reader</CommandItem>
					{onInsert && <CommandItem onSelect={run(onInsert)}><Plus />Insert a component…</CommandItem>}
					{onFocus && <CommandItem onSelect={run(onFocus)}><Focus />Focus mode — just editor &amp; preview</CommandItem>}
					<CommandItem onSelect={run(onFabricate)}><PencilRuler />Fabricate — Theme &amp; Component Studio</CommandItem>
					{onLibrary && <CommandItem onSelect={run(onLibrary)}><FileBox />Library — saved themes &amp; components</CommandItem>}
					{onWorkspace && <CommandItem onSelect={run(onWorkspace)}><Settings2 />Workspace settings</CommandItem>}
					{onWatchDemo && <CommandItem onSelect={run(onWatchDemo)}><MonitorPlay />Watch demo — the Studio drives itself</CommandItem>}
					{onFeedback && <CommandItem onSelect={run(onFeedback)}><FeedbackIcon />Send feedback</CommandItem>}
				</CommandGroup>
				{(onCollapseEditor || onCollapsePreview || onExpandPane || onResetSplit) && (
					<>
						<CommandSeparator />
						<CommandGroup heading="Layout">
							{onCollapseEditor && <CommandItem onSelect={run(onCollapseEditor)}><PanelLeftClose />Collapse editor pane</CommandItem>}
							{onCollapsePreview && <CommandItem onSelect={run(onCollapsePreview)}><PanelRightClose />Collapse preview pane</CommandItem>}
							{onExpandPane && <CommandItem onSelect={run(onExpandPane)}><PanelLeftOpen />Expand collapsed pane</CommandItem>}
							{onResetSplit && <CommandItem onSelect={run(onResetSplit)}><Columns2 />Reset split</CommandItem>}
						</CommandGroup>
					</>
				)}
				<CommandSeparator />
				<CommandGroup heading="Switch deck">
					{decks.map((d) => (
						<CommandItem key={d.id} onSelect={run(() => onPickDeck(d))}><FileText />{d.title}</CommandItem>
					))}
					<CommandItem onSelect={run(onNewDeck)}><Plus />New deck</CommandItem>
				</CommandGroup>
				<CommandSeparator />
				<CommandGroup heading="Theme">
					{palettes.map((p) => (
						<CommandItem key={p} onSelect={run(() => onPalette(p))}><Palette /><span className="capitalize">{p}</span></CommandItem>
					))}
				</CommandGroup>
			</CommandList>
		</>
	);

	// MOBILE: a PanelSheet, like every other overlay. This was a `CommandDialog` with
	// mobile overrides, and it was the last surface in the app on a different primitive
	// — which is precisely why it kept behaving differently. `DialogContent` will not
	// take a bottom offset at all: an inline `bottom: 336px` on it still computes to
	// `0px`, so with the keyboard up this sheet alone stayed pinned underneath while
	// every PanelSheet lifted clear (reported from a real iPhone). Rather than keep
	// fighting the primitive, it now uses the one that already works.
	if (mobile) {
		return (
			<PanelSheet open={open} onOpenChange={onOpenChange} tier="full">
				<PanelHeader icon={<Search />} title="Search / commands" srDescription="Run a command or jump somewhere in the Studio." />
				<Command className="flex min-h-0 flex-1 flex-col **:data-[slot=command-input-wrapper]:h-12 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]]:px-2 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5">
					{body}
				</Command>
			</PanelSheet>
		);
	}

	return (
		<CommandDialog
			open={open}
			onOpenChange={onOpenChange}
			title="Studio commands"
			description="Run a command or jump somewhere"
			// `DialogContent`'s close is absolutely positioned in the top-right corner,
			// which on this dialog lands ON the search input — the first row. Reserving
			// the corner keeps a click on the end of the field from dismissing the palette.
			className="[&_[data-slot=command-input-wrapper]]:pr-12"
		>
			{body}
		</CommandDialog>
	);
}
