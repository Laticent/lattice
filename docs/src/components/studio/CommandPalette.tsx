import { Columns2, FileBox, FileText, Focus, MonitorPlay, Palette, PanelLeftClose, PanelLeftOpen, PanelRightClose, PencilRuler, Play, Plus, Search, Settings as SettingsCog, Share2, Sparkles } from 'lucide-react';
import * as React from 'react';
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import { Kbd } from '@/components/ui/kbd';
import { PanelDock, PanelHeader, PanelSheet } from '@/components/ui/panel';
import { useBreakpoint } from '@/lib/use-breakpoint';
import { cn } from '@/lib/utils';
import type { StudioDeck } from './decks';
import { FeedbackIcon } from './icons';

// The "type what you want" spine (plan §2.2). Every bar action is also a command.
export function CommandPalette({
	open, onOpenChange, onRun, decks, palettes, onPickDeck, onNewDeck, onPalette, onPresent, onShare, onFabricate, onReshape, onWatchDemo, onInsert, onFocus, onFeedback, onLibrary, onWorkspace,
	onCollapseEditor, onCollapsePreview, onExpandPane, onResetSplit, inline,
}: {
	/**
	 * THE THIRD TRANSPORT (2026-08-16). `inline` renders the palette as a header-resident
	 * combobox rather than an overlay: the ⌘K pill IS the field, it grows into the row's
	 * free space when opened, and the list drops beneath it anchored to the input.
	 *
	 * It is a third presentation of ONE command list, not a second list — the `field` and
	 * `list` below are shared by all three, which is the whole reason this file already
	 * split them. That split existed because mobile docks the field at the bottom; inline
	 * is the same trick again.
	 *
	 * DESKTOP ONLY, and the caller enforces it. The pill only renders at ≥1100; tablet
	 * reaches search through the ⋯ menu and mobile through the drawer, and neither has an
	 * inline field to grow. So the caller mounts exactly one instance per tier — inline at
	 * desktop, overlay below it — which keeps "one action, one home" true at every width
	 * even though the presentation differs. That is the same tier-split this file already
	 * makes for `PanelSheet` vs `CommandDialog`, not a new pattern.
	 *
	 * CLOSED, IT MUST BE THE PILL, byte-for-byte. `studio-shell-parity.spec.ts` compares
	 * every control's box against the pre-paint skeleton, which draws a plain pill button —
	 * so the idle branch below reproduces that markup exactly. Change its padding, border or
	 * label here and the shell has to change in the same commit.
	 */
	inline?: boolean;
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
	// Workspace opens as an overlay at ANY stop; the Library is now a docked Craft
	// panel, so its handler (like onReshape) first transiently reveals Craft before
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
	// DISMISSAL for the inline transport. The overlays get this free — a dialog and a sheet
	// both own a backdrop — but a header-resident combobox has none, so without this the
	// dropdown stays open until Escape and follows you around the app. Capture phase, so a
	// click on some other control closes this BEFORE that control runs and the two do not
	// both fire on one press. Inert unless inline AND open.
	const inlineRef = React.useRef<HTMLDivElement | null>(null);
	React.useEffect(() => {
		if (!inline || !open) return;
		const onDown = (e: PointerEvent) => {
			if (inlineRef.current && !inlineRef.current.contains(e.target as Node)) onOpenChange(false);
		};
		document.addEventListener('pointerdown', onDown, true);
		return () => document.removeEventListener('pointerdown', onDown, true);
	}, [inline, open, onOpenChange]);
	const run = (fn: () => void) => () => {
		onRun?.();
		onOpenChange(false);
		fn();
	};
	// The FIELD and the LIST are separate, because the two transports order them
	// differently: desktop keeps the classic field-on-top palette; mobile docks the
	// field at the BOTTOM, above the keyboard (see the mobile branch below). cmdk does
	// not care about DOM order — filtering is by context, not by sibling position — so
	// this costs nothing but the split.
	// `data-focus-ring="container"` — the box paints the focus ring, so the input must
	// not paint a second one inside it. See native-widgets.css for why a class cannot do
	// this job.
	// A FACTORY, not a constant, purely so the inline transport can autofocus. The dialog and
	// the sheet must NOT: `CommandDialog` focuses its own field, and autofocusing the mobile
	// sheet would raise the keyboard before the sheet finished animating in.
	const mkField = (autoFocus?: boolean) => <CommandInput autoFocus={autoFocus} data-focus-ring="container" placeholder="Search or run a command…" />;
	const field = mkField();
	const list = (
		<>
			<CommandList>
				<CommandEmpty>No matches.</CommandEmpty>
				<CommandGroup heading="Actions">
					<CommandItem onSelect={run(onPresent)}><Play />Present</CommandItem>
					<CommandItem onSelect={run(onShare)}><Share2 />Share…</CommandItem>
					<CommandItem onSelect={run(onReshape)}><Sparkles />Reshape for a reader</CommandItem>
					{onInsert && <CommandItem onSelect={run(onInsert)}><Plus />Add a slide…</CommandItem>}
					{onFocus && <CommandItem onSelect={run(onFocus)}><Focus />Focus mode — just editor &amp; preview</CommandItem>}
					<CommandItem onSelect={run(onFabricate)}><PencilRuler />Fabricate — Theme &amp; Component Studio</CommandItem>
					{onLibrary && <CommandItem onSelect={run(onLibrary)}><FileBox />Library — saved themes &amp; components</CommandItem>}
					{onWorkspace && <CommandItem onSelect={run(onWorkspace)}><SettingsCog />Workspace settings</CommandItem>}
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

	// INLINE (desktop): the header's own combobox. Closed it is the pill; open it is the
	// field, grown into the row's free space with the list hanging beneath it.
	if (inline) {
		if (!open) {
			// The idle pill, reproduced EXACTLY — `studio-shell-parity` measures this against
			// the skeleton's copy, and `shrink-0 whitespace-nowrap` is the row's contract (the
			// deck switcher is the one item that gives). `aria-expanded` is what makes this a
			// combobox trigger rather than a button that happens to open something.
			return (
				<button
					type="button"
					onClick={() => onOpenChange(true)}
					aria-label="Search or run a command"
					aria-expanded={false}
					// `h-8` NOT `py-1.5` — #1687 normalized every header control to one 32px
					// height (`BAR_CONTROL` in chrome-parts.tsx) and the skeleton draws the pill
					// at that height. Padding-derived heights are what the alignment pass removed.
					className="hidden h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-md border border-border bg-card px-2 text-[13px] text-[var(--text-body)] hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--border))] lg:flex xl:px-3"
				>
					<Search className="size-4 shrink-0" />
					<span className="hidden xl:inline">Search or run…</span>
					<Kbd className="ml-2 hidden xl:inline-block">⌘K</Kbd>
				</button>
			);
		}
		return (
			// `min-w-0 flex-1` is the expansion: the field takes the flex spacer's slack rather
			// than pushing anything, so at 1440 it grows into ~144px of dead space and at 1920
			// into ~624px. `min-w-[320px]` is the FLOOR, and it is load-bearing: the row still
			// carries its `flex-1` spacer, so without a floor the field and the spacer split the
			// slack and the field opened NARROWER THAN THE PILL — measured 101px at 1440 against
			// a 180px idle pill. 320 is what the pill's own width plus the 1440 gap can pay
			// (180 + 144), so at the tightest desktop width the field is usable and the deck
			// title still does not have to give. `max-w-[720px]` is the stop — past that the
			// field stops growing and
			// the row keeps its balance instead of the input running the full width of a wide
			// display. The deck title is NOT allowed to pay for this: the pill next door is the
			// row's shock absorber, so without a ceiling the field would eat the title on the
			// way out. Measured before the ceiling went in: `Markdown for the boardroom` fell to
			// `Mar…` at 1920.
			<Command
				ref={inlineRef}
				label="Search or run a command"
				className={cn(
					// NO `isolate` here. It was tried and it is exactly wrong: `isolate` opens a new
					// stacking context, which traps the dropdown's `z-50` INSIDE this control — so the
					// card rendered but painted underneath the editor pane below the bar. The z-index
					// has to resolve against an ancestor that actually sits above the content.
					'relative min-w-[320px] max-w-[720px] flex-[1_1_720px]',
					// The field has to read as a HEADER control, not a dialog field: cmdk ships its
					// input wrapper with a `border-b` meant for a palette sitting on its own card.
					// Left alone that draws a single underline across the row. These spellings are
					// literal for the same reason the mobile branch's are — Tailwind scans source
					// text, so an interpolated class name generates no rule at all.
					// h-8 = the one 32px control height #1687 normalized the row to. The open
					// field is a header control like every other, so it takes the same height —
					// this was `h-[34px]` when the WIP was written, before that pass landed.
					'[&_[data-slot=command-input-wrapper]]:h-8 [&_[data-slot=command-input-wrapper]]:rounded-md [&_[data-slot=command-input-wrapper]]:border [&_[data-slot=command-input-wrapper]]:border-[color-mix(in_srgb,var(--accent)_55%,var(--border))] [&_[data-slot=command-input-wrapper]]:bg-card [&_[data-slot=command-input-wrapper]]:px-2',
					'[&_[data-slot=command-input]]:h-auto [&_[data-slot=command-input]]:text-[13px] [&_[data-slot=command-input]]:text-[var(--text-heading)]',
					'[&_[data-slot=command-input-wrapper]>svg]:size-4 [&_[data-slot=command-input-wrapper]>svg]:opacity-100 [&_[data-slot=command-input-wrapper]>svg]:text-[var(--text-body)]',
					// The dropdown is a fixed, scrollable band — tall enough to be worth opening,
					// short enough that it never runs off a laptop viewport.
					'[&_[data-slot=command-list]]:max-h-[min(60vh,420px)]',
				)}
				// Escape closes and hands focus back; the caller re-renders the pill, which is
				// where the eye already is. cmdk owns arrow keys and Enter within the list.
				// The handler sits on the Command ROOT rather than a wrapper `div`: a bare div
				// carrying a key handler is a static interactive element
				// (`lint/a11y/noStaticElementInteractions`), and the root is the widget container
				// anyway — so this is where a key listener belongs, not a lint dodge.
				onKeyDown={(e) => {
					if (e.key === 'Escape') {
						e.stopPropagation();
						onOpenChange(false);
					}
				}}
			>
				{mkField(true)}
				{/* The card hangs from this Command's own box, so it tracks the field's width and
				    left edge with no measuring and no portal.
				    It only escapes the bar because the HEADER drops its clip while this is open:
				    the header is `overflow-x-auto` (so a squeezed row stays reachable) and
				    `overflow-x: auto` computes `overflow-y` to `auto` too, which clipped the first
				    cut to the 54px band — the list drew INSIDE the bar, scrolled, with the field
				    hidden behind it. StudioShell swaps that class while the field is open; see the
				    note there for why that is safe.
				    A Radix `Popover` would also escape the clip, and was tried — but it portals the
				    list out of the Command's DOM subtree, and while cmdk's context still reaches it,
				    its items stopped responding to clicks under jsdom, taking three unit tests with
				    them. This keeps one DOM tree and one source of truth for the anchor. */}
				<div className="absolute inset-x-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-xl border border-border bg-[var(--bg)] shadow-[0_12px_32px_rgba(0,0,0,0.18)]">
					{list}
				</div>
			</Command>
		);
	}

	// MOBILE: a PanelSheet, like every other overlay. This was a `CommandDialog` with
	// mobile overrides, and it was the last surface in the app on a different primitive
	// — which is precisely why it kept behaving differently. `DialogContent` will not
	// take a bottom offset at all: an inline `bottom: 336px` on it still computes to
	// `0px`, so with the keyboard up this sheet alone stayed pinned underneath while
	// every PanelSheet lifted clear (reported from a real iPhone). Rather than keep
	// fighting the primitive, it now uses the one that already works.
	if (mobile) {
		return (
			<PanelSheet open={open} onOpenChange={onOpenChange}>
				<PanelHeader icon={<Search />} title="Search / commands" srDescription="Run a command or jump somewhere in the Studio." />
				{/* The field is DOCKED AT THE BOTTOM, directly above the keyboard, with the
				    list above it. It used to sit under the header — the far end of the screen
				    from the thumb that is typing, with the results running away from the
				    keyboard filtering them. Chat's composer already had this right, so this
				    is that one idiom shared rather than a second arrangement.
				    The field wears `PANEL_SEARCH_BOX` — byte-identical to `PanelSearch`, which
				    the Library and Add a slide use. cmdk owns its own input element so it
				    cannot use the component, but it CAN use the box, and the three parts that
				    made it look different are all neutralized here: cmdk's wrapper `border-b`,
				    the input's own `rounded-md`, and the input's own focus outline. Left alone,
				    a focused palette field drew a second rounded box INSIDE the first — 44px
				    inside 46px — visible only while focused, i.e. only with the keyboard up.
				    Reported from a real Android phone. */}
				<Command
					className={cn(
						'flex min-h-0 flex-1 flex-col',
						// Spelled out, NOT built from PANEL_SEARCH_BOX by interpolation. Tailwind's
						// scanner reads source text, so an interpolated class name generates no rule
						// at all — the same trap that shipped every panel at content height earlier
						// in this branch. `panel-search.test.tsx` asserts these stay in step.
						'[&_[data-slot=command-input-wrapper]]:flex [&_[data-slot=command-input-wrapper]]:min-w-0 [&_[data-slot=command-input-wrapper]]:items-center [&_[data-slot=command-input-wrapper]]:gap-2',
						'[&_[data-slot=command-input-wrapper]]:rounded-lg [&_[data-slot=command-input-wrapper]]:border [&_[data-slot=command-input-wrapper]]:border-border [&_[data-slot=command-input-wrapper]]:bg-background',
						'[&_[data-slot=command-input-wrapper]]:px-3 [&_[data-slot=command-input-wrapper]]:py-2',
						'[&_[data-slot=command-input-wrapper]]:focus-within:border-[color-mix(in_srgb,var(--accent)_55%,var(--border))] [&_[data-slot=command-input-wrapper]]:focus-within:ring-2 [&_[data-slot=command-input-wrapper]]:focus-within:ring-[var(--accent-soft)]',
						'[&_[data-slot=command-input]]:h-auto [&_[data-slot=command-input]]:rounded-none [&_[data-slot=command-input]]:text-[13.5px] [&_[data-slot=command-input]]:outline-none',
						'[&_[data-slot=command-input-wrapper]>svg]:size-4 [&_[data-slot=command-input-wrapper]>svg]:opacity-100 [&_[data-slot=command-input-wrapper]>svg]:text-muted-foreground',
						'[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground',
						'[&_[cmdk-group]]:px-2 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5',
						'[&_[data-slot=command-list]]:min-h-0 [&_[data-slot=command-list]]:flex-1 [&_[data-slot=command-list]]:max-h-none',
					)}
				>
					{list}
					<PanelDock>{field}</PanelDock>
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
			{field}
			{list}
		</CommandDialog>
	);
}
