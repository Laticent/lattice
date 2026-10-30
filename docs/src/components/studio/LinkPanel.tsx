// THE LINK PANEL — a link's address, edited by pointing at it.
//
// Opens three ways, all through ComposeView's one `linkEdit` state: a click on a link in the text (the panel shows the address
// and leaves the caret where the click put it, so the words stay editable in place), the selection bar's Link button (the
// address field takes focus), and Insert → Link (a placeholder word is written and selected; the field takes focus). There is
// no Mod-K: the Studio's command palette owns it.
// Every write goes through lib/compose/link-commands.ts, which refuses an address a slide cannot carry and says why.
//
// Lazy: ComposeView loads this with React.lazy, as it does the inline object editor, so none of it is in the Studio's startup
// JavaScript. Design: engineering/decisions/2026-10-29-compose-links-markers-insert.md.

import { ExternalLink, Link2Off } from 'lucide-react';
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { isOpenableHref, linkAt, linkBlocker, normalizeHref, removeLink, setLink } from '@/lib/compose/link-commands';
import { hasFinePointer } from '@/lib/use-breakpoint';

/** What ComposeView has open: the text range the link covers (or will cover), and whether the field takes focus. */
export interface LinkEdit {
	/** A fresh id per opening, so a second opening on the same range remounts the panel with a clean draft. */
	id: number;
	from: number;
	to: number;
	focus: boolean;
}

export interface LinkPanelProps {
	view: EditorView;
	edit: LinkEdit;
	onClose: () => void;
}

/** The link the range covers, read from the document as it stands now. */
function linkOf(view: EditorView, from: number, to: number) {
	const at = linkAt(view.state.doc, Math.min(from + 1, to));
	return at && at.from <= from && at.to >= to ? at : null;
}

export default function LinkPanel({ view, edit, onClose }: LinkPanelProps) {
	const existing = linkOf(view, edit.from, edit.to);
	const [draft, setDraft] = React.useState(existing?.href ?? '');
	const [refused, setRefused] = React.useState<string | null>(null);
	const inputRef = React.useRef<HTMLInputElement>(null);
	const id = React.useId();
	// ComposeView maps the range through every change while the panel is open; the anchor reads the latest.
	const editRef = React.useRef(edit);
	editRef.current = edit;

	// The anchor re-measures the range on every call, so the panel follows the text when the deck scrolls.
	const anchorRef = React.useRef({
		getBoundingClientRect: (): DOMRect => {
			if (view.isDestroyed) return new DOMRect();
			const size = view.state.doc.content.size;
			try {
				const { from, to } = editRef.current;
				const a = view.coordsAtPos(Math.min(from, size));
				const b = view.coordsAtPos(Math.min(to, size), -1);
				// A link that wraps onto a second line anchors on its first line.
				const right = b.top === a.top ? b.right : a.right;
				return new DOMRect(a.left, a.top, Math.max(1, right - a.left), a.bottom - a.top);
			} catch {
				return new DOMRect();
			}
		},
		contextElement: view.dom as Element,
	});

	const back = () => {
		onClose();
		if (hasFinePointer()) view.focus();
	};

	const apply = () => {
		// Done on an unchanged address closes: an address the deck already holds is never re-judged (it may predate these rules).
		if (existing && draft.trim() === existing.href) return back();
		const norm = normalizeHref(draft);
		if ('error' in norm) return setRefused(norm.error);
		const { doc } = view.state;
		const from = Math.min(edit.from, doc.content.size);
		const to = Math.min(edit.to, doc.content.size);
		view.dispatch(view.state.tr.setSelection(TextSelection.create(doc, from, to)));
		const why = linkBlocker(view.state);
		if (why) return setRefused(why);
		if (!setLink(norm.href, linkOf(view, from, to))(view.state, view.dispatch)) return setRefused('This link cannot be written here. Edit this slide in Markdown.');
		// The caret lands after the link, so the next keystroke does not extend it.
		const end = linkOf(view, from, to)?.to ?? view.state.selection.to;
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, end)));
		back();
	};

	const remove = () => {
		const target = linkOf(view, edit.from, edit.to);
		if (!target || !removeLink(target)(view.state, view.dispatch)) return setRefused('There is no link here to remove.');
		back();
	};

	const openable = existing && isOpenableHref(existing.href);

	return (
		<Popover open onOpenChange={(o) => !o && onClose()}>
			<PopoverAnchor virtualRef={anchorRef} />
			<PopoverContent
				align="start"
				collisionPadding={8}
				hideWhenDetached
				data-link-panel=""
				className="flex w-[min(22rem,86vw)] flex-col gap-2 p-3 text-[13px]"
				onOpenAutoFocus={(e) => {
					e.preventDefault();
					if (edit.focus) inputRef.current?.focus();
				}}
				// Escape and Done return to the text; a click elsewhere keeps its own focus.
				onEscapeKeyDown={(e) => {
					e.preventDefault();
					back();
				}}
			>
				<label htmlFor={`${id}-href`} className="text-[11px] font-medium text-muted-foreground">
					{existing ? 'Link address' : 'Link to'}
				</label>
				<div className="flex items-center gap-1.5">
					<Input
						ref={inputRef}
						id={`${id}-href`}
						aria-label="Link address"
						placeholder="https://example.com"
						value={draft}
						spellCheck={false}
						autoComplete="off"
						autoCapitalize="off"
						inputMode="url"
						aria-invalid={refused ? true : undefined}
						aria-describedby={refused ? `${id}-why` : undefined}
						onChange={(e) => {
							setDraft(e.target.value);
							setRefused(null);
						}}
						onKeyDown={(e) => {
							if (e.key === 'Enter') {
								e.preventDefault();
								apply();
							}
						}}
						className="h-8 min-w-0 flex-1 font-mono text-[12px]"
					/>
					{openable ? (
						<Button type="button" variant="ghost" size="icon" className="size-8 shrink-0" aria-label="Open link in a new tab" title="Open link in a new tab" onClick={() => window.open(existing.href, '_blank', 'noopener,noreferrer')}>
							<ExternalLink aria-hidden />
						</Button>
					) : null}
				</div>
				{refused ? (
					<p id={`${id}-why`} role="alert" className="text-[12px] text-destructive">
						{refused}
					</p>
				) : null}
				<div className="flex items-center justify-between gap-2 pt-1">
					{existing ? (
						<Button type="button" variant="ghost" size="sm" onClick={remove}>
							<Link2Off aria-hidden />
							Remove link
						</Button>
					) : (
						<span />
					)}
					<Button type="button" size="sm" onClick={() => (draft.trim() || !existing ? apply() : back())}>
						{existing ? 'Done' : 'Add link'}
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
}
