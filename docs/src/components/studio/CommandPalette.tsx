import { Columns2, FileBox, FileText, Focus, MessageSquareHeart, MonitorPlay, Palette, PanelLeftClose, PanelLeftOpen, PanelRightClose, PencilRuler, Play, Plus, Settings2, Share2, Sparkles } from 'lucide-react';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import type { StudioDeck } from './decks';

// The "type what you want" spine (plan §2.2). Every bar action is also a command.
export function CommandPalette({
	open, onOpenChange, decks, palettes, onPickDeck, onPalette, onPresent, onShare, onFabricate, onReshape, onWatchDemo, onInsert, onFocus, onFeedback, onLibrary, onWorkspace,
	onCollapseEditor, onCollapsePreview, onExpandPane, onResetSplit,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	decks: StudioDeck[];
	palettes: string[];
	onPickDeck: (d: StudioDeck) => void;
	onPalette: (p: string) => void;
	onPresent: () => void;
	onShare: () => void;
	onFabricate: () => void;
	onReshape: () => void;
	onWatchDemo?: () => void;
	onInsert?: () => void;
	onFocus?: () => void;
	onFeedback?: () => void;
	// Library + Workspace open as overlays (not docked panels), so they render at
	// ANY stop — making "every faculty is one keystroke away from every stop" true
	// even where the activity bar isn't shown (Read/Write). (2026-07-17-studio-persona-dial.md)
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
	const run = (fn: () => void) => () => {
		onOpenChange(false);
		fn();
	};
	return (
		<CommandDialog open={open} onOpenChange={onOpenChange} title="Studio commands" description="Run a command or jump somewhere">
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
					{onFeedback && <CommandItem onSelect={run(onFeedback)}><MessageSquareHeart />Send feedback</CommandItem>}
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
				</CommandGroup>
				<CommandSeparator />
				<CommandGroup heading="Theme">
					{palettes.map((p) => (
						<CommandItem key={p} onSelect={run(() => onPalette(p))}><Palette /><span className="capitalize">{p}</span></CommandItem>
					))}
				</CommandGroup>
			</CommandList>
		</CommandDialog>
	);
}
