// THE INSERT MENU — one door for everything an author can put on a slide.
//
// It replaces four icon buttons (table, code, pill, spark) in the slide bar. At 390px the bar had room for
// eight 28px buttons and no ninth (engineering/decisions/2026-10-13-compose-inline-notation-editors.md §12b), and
// the list of things to insert had reached eleven: a table, a code block, a diagram, an equation, a plot, an
// image, a pill, a spark, an avatar and an icon. A button each would not fit a phone and would not teach a
// mouse-first author what exists. One menu names every one of them, with what it is for, and says WHY an item is
// unavailable where it is (a locked slide, a layout a table does not suit) instead of doing nothing.
//
// Design: engineering/decisions/2026-10-21-compose-point-and-click.md §5.
//
//   · It is a React island, mounted by ComposeView into the active slide's bar slot (as TableControls and the
//     code picker are), so it is the real shadcn DropdownMenu: arrow keys, typeahead, Escape, focus return.
//   · Every item runs the SAME command its old button ran (`insertStarterTable`, `insertFence`, `insertObject`),
//     so there is one write path. The blockers are read when the menu opens, from the live editor state.
//   · The two doors that open a surface of their own (an image from the Library) are handed in as callbacks.

import { Atom, Braces, ChartLine, Clapperboard, GitFork, Grid2x2Plus, Image as ImageIcon, LineChart, Shapes, SquareCode, Tag, UserRound } from 'lucide-react';
import { isInTable } from 'prosemirror-tables';
import type { EditorView } from 'prosemirror-view';
import * as React from 'react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { defaultFenceTag, insertFence, isInCode, type SlideFences, slideTakesCode } from '@/lib/compose/code-commands';
import { deckFenceTags, LATTICE_FENCES } from '@/lib/compose/fence-catalog';
import { insertImageBlocker } from '@/lib/compose/image-objects';
import { type InlineKernels, type InsertKind, insertBlocker, insertObject } from '@/lib/compose/inline-objects';
import { slideTakesTable } from '@/lib/compose/registers';
import { insertStarterTable } from '@/lib/compose/table-commands';
import { notify } from '@/lib/notify';
import { hasFinePointer } from '@/lib/use-breakpoint';

type Entry = {
	id: string;
	group: 'Blocks' | 'Inline';
	label: string;
	hint: string;
	Icon: React.ComponentType<{ 'aria-hidden'?: boolean | 'true' | 'false' }>;
	/** Why this cannot be done here, or null. Said under the item, never swallowed. */
	blocked: string | null;
	run: () => void;
};

const fenceStarter = (tag: string) => LATTICE_FENCES.find((f) => f.tag === tag)?.starter;

/** The blocker for a block that needs a place to sit: not locked, not in a table cell. */
function blockBlocker(view: EditorView, what: string): string | null {
	const { $from } = view.state.selection;
	if ($from.node(1)?.attrs.locked) return `This slide is edited in Markdown, so ${what} cannot be added here.`;
	return null;
}

export function InsertControls({
	view,
	getKernels,
	getSource,
	getFences,
	onInsertImage,
	onInsertMotion,
}: {
	view: EditorView;
	getKernels: () => InlineKernels | null;
	getSource: () => string;
	getFences: () => SlideFences | undefined;
	/** Open the Library photo picker for the caret. Absent when the Library is not available. */
	onInsertImage?: () => void;
	/** Open the Library on its Motion scenes; a pick there adds the scene as a slide after this one. Absent when the Library is not available. */
	onInsertMotion?: () => void;
}) {
	const [open, setOpen] = React.useState(false);

	/** Rebuild every entry from the editor as it stands now, so a blocker is never one the caret has left behind. */
	const build = React.useCallback((): Entry[] => {
		const kernels = getKernels();
		const literal = kernels?.isLiteralFromSource(getSource()) ?? false;
		const directives = ((view.state.selection.$from.node(1)?.attrs.directives as string[]) || []).slice();
		const run = (fn: () => void) => fn;
		const fence = (id: string, label: string, hint: string, Icon: Entry['Icon'], tag: string | null): Entry => {
			const locked = blockBlocker(view, label.toLowerCase());
			const blocked = locked ?? (isInCode(view.state) ? 'The cursor is already in a code block.' : isInTable(view.state) ? 'A table cell cannot hold a block. Move the cursor out of the table.' : !slideTakesCode(directives) ? 'This layout draws its own figure, so a block does not belong on it.' : null);
			return {
				id,
				group: 'Blocks',
				label,
				hint,
				Icon,
				blocked,
				run: run(() => {
					const t = tag ?? defaultFenceTag(directives, getFences(), deckFenceTags(getSource()));
					insertFence(t, fenceStarter(t))(view.state, view.dispatch);
				}),
			};
		};
		const inline = (id: InsertKind, label: string, hint: string, Icon: Entry['Icon']): Entry => ({
			id,
			group: 'Inline',
			label,
			hint,
			Icon,
			blocked: insertBlocker(view.state, kernels, literal, id),
			run: () => {
				const why = insertBlocker(view.state, kernels, literal, id);
				if (why) notify(why);
				else insertObject(() => kernels, { getDeckLiteral: () => literal, kind: id })(view.state, view.dispatch);
			},
		});
		const imageBlocked = insertImageBlocker(view.state);
		return [
			{
				id: 'table',
				group: 'Blocks',
				label: 'Table',
				hint: 'Rows and columns',
				Icon: Grid2x2Plus,
				blocked: blockBlocker(view, 'a table') ?? (isInTable(view.state) ? 'The cursor is already in a table.' : !slideTakesTable(directives) ? 'A table does not suit this layout.' : null),
				run: run(() => {
					insertStarterTable(view.state, view.dispatch);
				}),
			},
			fence('code', 'Code', 'A code block, colored for its language', SquareCode, null),
			fence('diagram', 'Diagram', 'A flowchart, sequence or state chart', GitFork, 'mermaid'),
			fence('equation', 'Equation', 'Math, typeset', Atom, 'math'),
			fence('plot', 'Plot', 'A function graph', LineChart, 'functionplot'),
			...(onInsertImage
				? [
						{
							id: 'image',
							group: 'Blocks' as const,
							label: 'Image',
							hint: 'A photo from your Library',
							Icon: ImageIcon,
							blocked: imageBlocked,
							run: () => onInsertImage(),
						},
					]
				: []),
			...(onInsertMotion
				? [
						{
							id: 'motion',
							group: 'Blocks' as const,
							label: 'Motion',
							hint: 'A scene from your Library, on a new slide',
							Icon: Clapperboard,
							blocked: null,
							run: () => onInsertMotion(),
						},
					]
				: []),
			inline('pill', 'Pill', 'A status label or tag', Tag),
			inline('spark', 'Spark', 'A word-sized chart', ChartLine),
			inline('avatar', 'Avatar', 'A person, drawn from their name', UserRound),
			inline('icon', 'Icon', 'A small picture from the icon set', Braces),
		];
	}, [view, getKernels, getSource, getFences, onInsertImage, onInsertMotion]);

	// Read from the editor as it stands when the menu OPENS, in the same render that mounts the items, so the first arrow key
	// finds them all. (Built in an effect after the open, the first keys landed while the list was still being filled.)
	const entries = React.useMemo(() => (open ? build() : []), [open, build]);

	/**
	 * The chosen item waits here until the menu has let go of focus (`onCloseAutoFocus`, below), and only then runs. An item that
	 * opens an editor (a pill's popover, an avatar's sheet) must open AFTER the menu is gone: while the menu is still closing it moves
	 * focus about, the editor reads that as the author leaving, and it closes the moment it opens. Measured on the real Studio: the pill
	 * editor was mounted for 23 ms and dismissed. The menu has no exit animation (below), so the wait is one frame.
	 */
	const pending = React.useRef<Entry | null>(null);
	const flush = () => {
		const entry = pending.current;
		pending.current = null;
		// Focus goes back to the text first, so the document selection the command sets is the one the editor shows. On a touch
		// device the keyboard stays down.
		if (hasFinePointer()) view.focus();
		entry?.run();
	};

	return (
		<DropdownMenu modal={false} open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger asChild>
				<button type="button" className="cs-pill-btn cs-insert-menu" aria-label="Insert" title="Insert" onMouseDown={(e) => e.preventDefault()}>
					<Shapes aria-hidden />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" sideOffset={6} className="w-64 data-[state=closed]:animate-none!" onCloseAutoFocus={(e) => {
					// When an item was chosen, the dropdown's own return of focus to its button is declined and `flush` puts it on the text,
					// where the caret is. When the menu was dismissed instead (Escape, a click elsewhere) the default stands: Escape returns
					// to the Insert button, and a click into another field keeps its focus.
					if (!pending.current) return;
					e.preventDefault();
					flush();
				}}>
				{(['Blocks', 'Inline'] as const).map((group, gi) => (
					<React.Fragment key={group}>
						{gi > 0 ? <DropdownMenuSeparator /> : null}
						<DropdownMenuLabel>{group === 'Blocks' ? 'Add to the slide' : 'Add to a line of text'}</DropdownMenuLabel>
						{entries
							.filter((e) => e.group === group)
							.map((e) => (
								<DropdownMenuItem
									key={e.id}
									// Not Radix's `disabled`: that takes the item out of the arrow-key order, so a keyboard or screen-reader user could
									// never land on it to hear why it is unavailable. It stays focusable, says so, and a choice is declined.
									aria-disabled={e.blocked !== null ? true : undefined}
									data-disabled={e.blocked !== null ? '' : undefined}
									onSelect={(ev) => {
										if (e.blocked !== null) {
											ev.preventDefault();
											return;
										}
										pending.current = e;
									}} className="items-start gap-2.5 py-1.5">
									<e.Icon aria-hidden />
									<span className="flex min-w-0 flex-col">
										<span className="text-[13px]">{e.label}</span>
										<span className="text-[11px] font-normal text-muted-foreground">{e.blocked ?? e.hint}</span>
									</span>
								</DropdownMenuItem>
							))}
					</React.Fragment>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
