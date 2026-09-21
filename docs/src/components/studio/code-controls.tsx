import { Check, Code2 } from 'lucide-react';
import type { EditorView } from 'prosemirror-view';
import * as React from 'react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useKeyboardInset } from '@/components/ui/panel';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { codeBlockAt, currentFenceTag, fenceClassHint, setFenceTag } from '@/lib/compose/code-commands';
import { type FenceOption, fenceAdvice, fenceGroups, type HljsManifest } from '@/lib/compose/fence-catalog';
import { loadHljsManifest } from '@/lib/ensure-hljs-language';
import { cn } from '@/lib/utils';

// The fence LANGUAGE PICKER — one component, mounted in two places (the design's
// Axis B): the chip on the code block itself, and the slide divider's pill while the
// caret is in a fence. Both render this; neither forks it (HARD RULE #15).
//
// Built on the real shadcn Command inside a Popover, so the search field, arrow-key
// navigation, Escape and outside-click are Radix's and cmdk's rather than ours —
// exactly the bargain `table-controls.tsx` makes next door.
//
// The CATALOG is lazy and the picker works without it: the Lattice group and the
// deck's own tags come from the source string, so the control opens and is usable
// before the grammar manifest has landed, and the long list fills in when it does.

/** The manifest, fetched once per page and shared by every picker instance. */
function useHljsManifest(open: boolean): HljsManifest | null {
	const [manifest, setManifest] = React.useState<HljsManifest | null>(null);
	React.useEffect(() => {
		if (!open || manifest) return;
		let live = true;
		loadHljsManifest()
			.then((m) => {
				if (live) setManifest(m);
			})
			.catch(() => {
				/* no catalog is a smaller list, never an error — see the module note */
			});
		return () => {
			live = false;
		};
	}, [open, manifest]);
	return manifest;
}

function Row({ option, active, onPick }: { option: FenceOption; active: boolean; onPick: (tag: string) => void }) {
	// `value` carries the aliases so cmdk's own matcher finds `javascript` when the
	// author types `js` — the spelling they are most likely to reach for.
	return (
		<CommandItem value={[option.tag, option.label, ...(option.aliases || [])].filter(Boolean).join(' ')} onSelect={() => onPick(option.tag)} className="items-start gap-2">
			<Check className={cn('mt-0.5 size-3.5 shrink-0', active ? 'opacity-100' : 'opacity-0')} aria-hidden />
			<span className="min-w-0 flex-1">
				<span className="flex items-baseline gap-2">
					<code className="font-mono text-[12px]">{option.tag}</code>
					{option.label && <span className="text-[11px] text-muted-foreground">{option.label}</span>}
				</span>
				{option.aliases?.length ? <span className="block truncate font-mono text-[10px] text-muted-foreground">{option.aliases.join(' · ')}</span> : null}
				{option.note && <span className="block text-[10.5px] leading-snug text-muted-foreground">{option.note}</span>}
			</span>
		</CommandItem>
	);
}

export function FencePicker({
	view,
	source,
	trigger,
	anchorRect,
	open: openProp,
	onOpenChange,
	align = 'center',
}: {
	view: EditorView;
	/** The deck source, for the "In this deck" group. */
	source: string;
	/** Pill mode: the button the popover hangs off. Mutually exclusive with `anchor`. */
	trigger?: React.ReactNode;
	/**
	 * Chip mode: WHERE the clicked chip was, with `open` driven by the caller.
	 *
	 * A RECT, deliberately, not the element. The chip lives in a ProseMirror NodeView,
	 * and that node view is rebuilt whenever the caret moves into or out of the fence
	 * and again when the editor blurs — which the picker's own search field causes the
	 * instant it opens. Measured on the real Studio: anchored to the element, the button
	 * was detached before the popover could paint and nothing ever appeared. A rect
	 * captured at click time cannot be detached, and the document does not move
	 * underneath an open popover.
	 *
	 * ONE picker for the whole document, moved to wherever the last chip was clicked,
	 * rather than a React root per fence.
	 */
	anchorRect?: DOMRect | null;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	align?: 'start' | 'center' | 'end';
}) {
	const [openState, setOpenState] = React.useState(false);
	const controlled = openProp !== undefined;
	const open = controlled ? !!openProp : openState;
	const setOpen = React.useCallback(
		(next: boolean) => {
			if (!controlled) setOpenState(next);
			onOpenChange?.(next);
		},
		[controlled, onOpenChange],
	);
	const [query, setQuery] = React.useState('');
	// THE REPO'S ONE ANSWER to "how much of the viewport is left" (ui/panel.tsx). It
	// publishes `--vvh` / `--kb`; the height cap below reads Radix's own visual-viewport
	// measurement rather than re-deriving either. Mounting a second `visualViewport`
	// listener here is the duplication HARD RULE #15 forbids, and — per that file's
	// history — how the keyboard bugs got written twice.
	useKeyboardInset(open);
	const manifest = useHljsManifest(open);
	const current = currentFenceTag(view.state);
	// A NEW QUERY STARTS AT THE TOP. Re-ranking leaves `scrollTop` where the previous
	// list left it, so a search run after scrolling shows the tail of the results with
	// the best answer off-screen — and with the list capped to the band above a
	// keyboard, that is most of what the author can see.
	const [listEl, setListEl] = React.useState<HTMLDivElement | null>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: keyed on what makes the RESULT SET new — the query — not on the derived groups. Same reasoning as ComponentPicker's twin.
	React.useLayoutEffect(() => {
		if (listEl) listEl.scrollTop = 0;
	}, [listEl, query]);
	const groups = React.useMemo(() => fenceGroups({ source, manifest, query }), [source, manifest, query]);
	// A STABLE Measurable whose rect is read at position time — Radix keeps the ref
	// object, so it must not be rebuilt each render, and the live rect rides in a second
	// ref beside it.
	const rectRef = React.useRef<DOMRect | null>(anchorRect ?? null);
	rectRef.current = anchorRect ?? null;
	const anchorRef = React.useRef({ getBoundingClientRect: () => rectRef.current ?? new DOMRect(0, 0, 0, 0) });

	const block = codeBlockAt(view.state);
	const body = block?.node.textContent || '';
	const directives = (block && view.state.selection.$from.node(1)?.attrs.directives) || [];
	const advice = fenceAdvice(current, body, manifest);
	// The layout hint is separate from the grammar advice on purpose: one is about
	// whether the fence will COLOR, the other about whether it will RENDER where the
	// author put it. Both coach; neither refuses.
	const hint = fenceClassHint(current, directives as string[]);

	const pick = (tag: string) => {
		setOpen(false);
		setQuery('');
		setFenceTag(tag)(view.state, view.dispatch);
		view.focus();
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			{trigger ? (
				<PopoverTrigger asChild onMouseDown={(e) => e.preventDefault()}>
					{trigger}
				</PopoverTrigger>
			) : (
				<PopoverAnchor virtualRef={anchorRef} />
			)}
			{/* THE CAP IS RADIX'S OWN MEASUREMENT, and the shape is `ComponentPicker`'s —
			    the surface that already solved this on a real phone, rather than a fourth
			    arrangement. `--radix-popover-content-available-height` is the room below the
			    anchor computed from the VISUAL viewport, so the keyboard is already in it
			    (measured there: a 336px iPhone keyboard took it 500px → 164px). Hand-written
			    `--vvh` arithmetic here would DOUBLE-SUBTRACT, which is the mistake that file
			    records making twice.
			    `max(140px, …)` is a floor: a cap below it is worse than overflowing, because
			    two rows and a scrollbar still work and one clipped row does not. The 12px is
			    the panel's borders plus enough that the last row is never tangent to the
			    keyboard's top edge. And the WIDTH is viewport-relative — a flat 19rem ran off
			    the right edge of a 390px screen, which is the clipping in the report. */}
			<PopoverContent
				align={align}
				collisionPadding={8}
				className="flex w-[min(22rem,86vw)] flex-col overflow-hidden p-0 max-h-[max(140px,min(388px,calc(var(--radix-popover-content-available-height)-12px)))]"
				onOpenAutoFocus={(e) => e.preventDefault()}
			>
				<Command
					shouldFilter={false}
					className={cn(
						// THE FIELD WEARS `PANEL_SEARCH_BOX`, like the Studio's palette and the
						// component picker. Without it the site-wide `:focus-visible` glow —
						// `outline: 2px solid var(--accent); outline-offset: 2px` from
						// native-widgets.css — lands 4px OUTSIDE the input's border box and the
						// popover's `overflow-hidden` clips it along the top edge. That is the
						// ragged focus ring in the report; same rule, same symptom, third surface.
						//
						// SPELLED OUT, NOT INTERPOLATED from the constant. Tailwind's scanner reads
						// source text, so `cn(PANEL_SEARCH_BOX)` inside a variant prefix generates no
						// rule at all; `code-controls.search-box.test.ts` pins this copy against it.
						'[&_[data-slot=command-input-wrapper]]:flex [&_[data-slot=command-input-wrapper]]:min-w-0 [&_[data-slot=command-input-wrapper]]:items-center [&_[data-slot=command-input-wrapper]]:gap-2',
						'[&_[data-slot=command-input-wrapper]]:rounded-lg [&_[data-slot=command-input-wrapper]]:border [&_[data-slot=command-input-wrapper]]:border-border [&_[data-slot=command-input-wrapper]]:bg-background',
						'[&_[data-slot=command-input-wrapper]]:px-3 [&_[data-slot=command-input-wrapper]]:py-2',
						'[&_[data-slot=command-input-wrapper]]:focus-within:border-[color-mix(in_srgb,var(--accent)_55%,var(--border))] [&_[data-slot=command-input-wrapper]]:focus-within:ring-2 [&_[data-slot=command-input-wrapper]]:focus-within:ring-[var(--accent-soft)]',
						'[&_[data-slot=command-input]]:h-auto [&_[data-slot=command-input]]:rounded-none [&_[data-slot=command-input]]:outline-none',
						'[&_[data-slot=command-input-wrapper]>svg]:size-4 [&_[data-slot=command-input-wrapper]>svg]:opacity-100 [&_[data-slot=command-input-wrapper]>svg]:text-muted-foreground',
						// ROOM FOR THE RING inside a panel that clips: `focus-within:ring-2` paints
						// 2px beyond the wrapper, so it cannot sit flush against the clipped edge.
						'p-1.5',
						'flex min-h-0 flex-col',
					)}
				>
					{/* `data-focus-ring="container"` is the opt-out native-widgets.css ships for
					    exactly this: the BOX paints the affordance and the input paints none.
					    Without it a phone shows a second rounded box drawn inside the first. */}
					<CommandInput data-focus-ring="container" placeholder="Language…" value={query} onValueChange={setQuery} autoFocus />
					{/* `min-h-0 flex-1` so the panel's cap can shrink the LIST rather than the
					    popover growing past it. */}
					<CommandList ref={setListEl} className="min-h-0 flex-1">
						<CommandEmpty className="px-3 py-4 text-[12px] text-muted-foreground">No language matches “{query}”.</CommandEmpty>
						{groups.map((group) => (
							<CommandGroup key={group.key} heading={group.label}>
								{group.options.map((option) => (
									<Row key={option.tag} option={option} active={option.tag === current} onPick={pick} />
								))}
							</CommandGroup>
						))}
					</CommandList>
				</Command>
				{(advice || hint) && (
					<div className="border-t px-3 py-2 text-[10.5px] leading-snug text-muted-foreground">
						{advice && <p>{advice}</p>}
						{hint && <p className={cn(advice && 'mt-1')}>{hint}</p>}
					</div>
				)}
			</PopoverContent>
		</Popover>
	);
}

/**
 * The picker as the divider pill hosts it while the caret is in a fence — the
 * Format group's third mode, beside the register buttons and the table controls.
 */
export function CodeControls({ view, source }: { view: EditorView; source: string }) {
	const tag = currentFenceTag(view.state);
	return (
		<div className="cs-codec">
			<FencePicker
				view={view}
				source={source}
				trigger={
					<button type="button" className="cs-codec-trigger" aria-label={`Fence language: ${tag || 'none'} — change`} title="Fence language">
						<Code2 aria-hidden />
						<span className="cs-codec-tag">{tag || 'plain'}</span>
					</button>
				}
			/>
		</div>
	);
}
