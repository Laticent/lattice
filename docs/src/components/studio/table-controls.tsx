import { AlignCenter, AlignLeft, AlignRight, ArrowDownToLine, ArrowLeftToLine, ArrowRightToLine, ArrowUpToLine, Columns3, Rows3, Table, Trash2 } from 'lucide-react';
import type { Command } from 'prosemirror-state';
import { addColumnAfter, addColumnBefore, addRowAfter, addRowBefore, deleteColumn, deleteRow, deleteTable } from 'prosemirror-tables';
import type { EditorView } from 'prosemirror-view';
import * as React from 'react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { type ColAlign, currentColumnAlign, setColumnAlign } from '@/lib/compose/table-commands';
import { cn } from '@/lib/utils';

// The table controls that live IN the slide's context-sensitive divider bar when the caret is in a
// table (mounted into a pill slot by ComposeView). Quick insert-row/column inline on desktop, and a
// table-icon dropdown — the real shadcn DropdownMenu (Radix a11y: focus, arrow keys, Escape,
// outside-click, roles) — holding the full action set with icons. No hand-rolled popover.
// 2026-07-19-compose-table-editing.md (chrome).

export function TableControls({ view }: { view: EditorView }) {
	const [align, setAlign] = React.useState<ColAlign>(null);
	// Run a table command against the live editor, keeping focus in the editor.
	const run = React.useCallback(
		(cmd: Command) => {
			cmd(view.state, view.dispatch);
			view.focus();
		},
		[view],
	);
	// On open, read the caret column's current alignment for the pressed L/C/R state.
	const onOpenChange = React.useCallback(
		(open: boolean) => {
			if (open) setAlign(currentColumnAlign(view.state));
		},
		[view],
	);
	const setCol = (a: Exclude<ColAlign, null>) => {
		run(setColumnAlign(align === a ? null : a)); // click the active alignment to clear it
		setAlign((cur) => (cur === a ? null : a));
	};

	return (
		<div className="cs-tblc">
			<button type="button" className="cs-tblc-quick" aria-label="Insert row below" title="Insert row below" onMouseDown={(e) => e.preventDefault()} onClick={() => run(addRowAfter)}>
				<ArrowDownToLine aria-hidden />
			</button>
			<button type="button" className="cs-tblc-quick" aria-label="Insert column right" title="Insert column right" onMouseDown={(e) => e.preventDefault()} onClick={() => run(addColumnAfter)}>
				<ArrowRightToLine aria-hidden />
			</button>
			<DropdownMenu modal={false} onOpenChange={onOpenChange}>
				<DropdownMenuTrigger asChild>
					<button type="button" className="cs-tblc-more" aria-label="Table actions" title="Table actions" onMouseDown={(e) => e.preventDefault()}>
						<Table aria-hidden />
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="center" sideOffset={6} className="w-48">
					<DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">Insert</DropdownMenuLabel>
					<DropdownMenuItem onSelect={() => run(addRowBefore)}>
						<ArrowUpToLine /> Row above
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={() => run(addRowAfter)}>
						<ArrowDownToLine /> Row below
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={() => run(addColumnBefore)}>
						<ArrowLeftToLine /> Column left
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={() => run(addColumnAfter)}>
						<ArrowRightToLine /> Column right
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">Align column</DropdownMenuLabel>
					{(
						[
							['left', AlignLeft, 'Left'],
							['center', AlignCenter, 'Center'],
							['right', AlignRight, 'Right'],
						] as const
					).map(([a, Icon, label]) => (
						<DropdownMenuItem
							key={a}
							// Keep the menu open so you can retarget L→C→R; refresh the pressed state.
							onSelect={(e) => {
								e.preventDefault();
								setCol(a);
							}}
							className={cn(align === a && 'bg-accent text-accent-foreground')}
						>
							<Icon /> {label}
						</DropdownMenuItem>
					))}
					<DropdownMenuSeparator />
					<DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">Delete</DropdownMenuLabel>
					<DropdownMenuItem variant="destructive" onSelect={() => run(deleteRow)}>
						<Rows3 /> Delete row
					</DropdownMenuItem>
					<DropdownMenuItem variant="destructive" onSelect={() => run(deleteColumn)}>
						<Columns3 /> Delete column
					</DropdownMenuItem>
					<DropdownMenuItem variant="destructive" onSelect={() => run(deleteTable)}>
						<Trash2 /> Delete table
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
