// THE MARKER PICKER — a click on a list item's state chip (`- [x] done`) opens the six answers, and a pick writes only the
// three marker bytes. It replaced a two-way toggle that turned any other answer into `[x]`, so one click on a `[!]` (no)
// silently made it a yes. The six, their order and their words are the check registry's, through table-controls' MARKERS,
// so a table cell's picker and this one never disagree.
// Design: engineering/decisions/2026-10-29-compose-links-markers-insert.md.

import { Check } from 'lucide-react';
import type { EditorView } from 'prosemirror-view';
import * as React from 'react';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { setListMarker } from '@/lib/compose/marker-commands';
import { hasFinePointer } from '@/lib/use-breakpoint';
import { cn } from '@/lib/utils';
import { MARKERS } from './table-controls';

/** What ComposeView has open: the document position of the marker's `[`, and a fresh id per opening. */
export interface MarkerEdit {
	id: number;
	pos: number;
	/** The marker as it read when the chip was clicked (`x`, ` `, `!` …). */
	marker: string;
}

export function MarkerPicker({ view, edit, onClose }: { view: EditorView; edit: MarkerEdit; onClose: () => void }) {
	const anchorRef = React.useRef({
		getBoundingClientRect: (): DOMRect => {
			if (view.isDestroyed) return new DOMRect();
			try {
				const a = view.coordsAtPos(edit.pos);
				const b = view.coordsAtPos(edit.pos + 3, -1);
				return new DOMRect(a.left, a.top, Math.max(1, b.right - a.left), a.bottom - a.top);
			} catch {
				return new DOMRect();
			}
		},
		contextElement: view.dom as Element,
	});
	const current = `[${edit.marker}]`;
	const pick = (token: string) => {
		if (token !== current) setListMarker(edit.pos, token)(view.state, view.dispatch);
		onClose();
		if (hasFinePointer()) view.focus();
	};
	return (
		<Popover open onOpenChange={(o) => !o && onClose()}>
			<PopoverAnchor virtualRef={anchorRef} />
			<PopoverContent align="start" collisionPadding={8} hideWhenDetached className="w-48 p-1" onCloseAutoFocus={(e) => e.preventDefault()}>
				<div role="menu" aria-label="Item state" className="flex flex-col">
					{MARKERS.map(({ token, Icon, label, cls }) => (
						<button
							key={token}
							type="button"
							role="menuitemradio"
							aria-checked={token === current}
							className="flex h-8 items-center gap-2 rounded-sm px-2 text-left text-[13px] outline-none hover:bg-accent focus-visible:bg-accent"
							onClick={() => pick(token)}
							onKeyDown={(e) => {
								// Arrow keys walk the six, as a menu's do.
								if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
								e.preventDefault();
								const items = [...(e.currentTarget.parentElement?.querySelectorAll('button') ?? [])];
								const i = items.indexOf(e.currentTarget);
								items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
							}}
						>
							<Icon aria-hidden className={cn('size-3.5 shrink-0', cls)} />
							<span className="flex-1">{label}</span>
							<span className="font-mono text-[11px] text-muted-foreground">{token}</span>
							{token === current ? <Check aria-hidden className="size-3.5 shrink-0" /> : <span className="size-3.5 shrink-0" />}
						</button>
					))}
				</div>
			</PopoverContent>
		</Popover>
	);
}
