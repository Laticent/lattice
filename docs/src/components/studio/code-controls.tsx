import { Check, Code2 } from 'lucide-react';
import type { EditorView } from 'prosemirror-view';
import * as React from 'react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
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
	anchor,
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
	 * Chip mode: the live chip element to hang off, with `open` driven by the caller.
	 *
	 * The chip lives in a ProseMirror NodeView — vanilla DOM that React does not own and
	 * must not — so the picker anchors to it through Radix's `virtualRef` (any object
	 * with `getBoundingClientRect`, which an element trivially is) rather than being
	 * rendered around it. ONE picker for the whole document, moved to whichever chip was
	 * clicked, instead of a React root per fence.
	 */
	anchor?: HTMLElement | null;
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
	const manifest = useHljsManifest(open);
	const current = currentFenceTag(view.state);
	const groups = React.useMemo(() => fenceGroups({ source, manifest, query }), [source, manifest, query]);
	const anchorRef = React.useRef<HTMLElement | null>(null);
	anchorRef.current = anchor ?? null;

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
				<PopoverAnchor virtualRef={anchorRef as React.RefObject<HTMLElement>} />
			)}
			<PopoverContent align={align} className="w-[19rem] p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
				<Command shouldFilter={false}>
					<CommandInput placeholder="Language…" value={query} onValueChange={setQuery} autoFocus />
					<CommandList className="max-h-[16rem]">
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
