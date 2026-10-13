// THE INLINE OBJECT EDITOR HOST — one editor for every inline object in Compose.
//
// Opens on the object the notation plugin has open (lib/compose/inline-objects.ts): a popover
// anchored to the drawn object on desktop and tablet, a bottom sheet on a phone (owner, 2026-10-13).
// The host knows nothing about pills. It looks up the object's kind, hands the matching PANEL the
// object's fields, and writes each edit the panel reports through the kind's own kernel
// (`editObject`: only the changed word is replaced, or nothing is written). A spark or an avatar adds
// a panel to `PANELS` below; the anchor, the sheet, the close rules and the undo do not change.
//
// Design: engineering/decisions/2026-10-13-compose-inline-notation-editors.md (§12).
//
// Lazy: ComposeView loads this with React.lazy, as IconGrid is, so none of it is in the Studio's
// startup JavaScript.

import { Tag } from 'lucide-react';
import type { EditorView } from 'prosemirror-view';
import * as React from 'react';
import { PanelBody, PanelHeader, PanelSheet } from '@/components/ui/panel';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { editObject, editObjectAsText, type InlineKernels, kindOf, leaveObject, type OpenObject } from '@/lib/compose/inline-objects';
import { hasFinePointer, useIsPhone } from '@/lib/use-breakpoint';
import { PillPanel, readSlotColors } from './PillEditor';

/** What a panel is handed. It reports one edit per change and never writes the document itself. */
export interface ObjectPanelProps {
	fields: unknown;
	kernels: InlineKernels;
	slotColors: (string | null)[];
	/** Returns whether the edit was written. A refusal is shown by the panel, never swallowed. */
	onEdit: (edit: never) => boolean;
	onEditAsText: () => void;
	onDone: () => void;
}

interface PanelEntry {
	title: string;
	describe: string;
	Panel: (props: ObjectPanelProps) => React.JSX.Element;
}

/** One panel per kind id (`OBJECT_KINDS` in inline-objects.ts). */
const PANELS: Record<string, PanelEntry> = {
	pill: {
		title: 'Edit pill',
		describe: "Change this pill's label, shape, color and size.",
		Panel: (p) => <PillPanel {...(p as unknown as React.ComponentProps<typeof PillPanel>)} />,
	},
};

/** A virtual anchor that finds the object's place in the page again on every measurement. */
type Anchor = { getBoundingClientRect: () => DOMRect; contextElement?: Element };

export function InlineObjectEditorHost({
	view,
	kernels,
	open,
	onClose,
}: {
	view: EditorView;
	kernels: InlineKernels;
	/** The object as the document stands NOW: the plugin maps it through every edit. */
	open: OpenObject;
	onClose: () => void;
}) {
	const phone = useIsPhone();
	// The preview frame is read once per open: the theme can differ between two opens.
	const slotColors = React.useMemo(() => readSlotColors(), []);
	const owner = kindOf(open.src, kernels);
	const entry = owner ? PANELS[owner.kind.id] : undefined;
	const openRef = React.useRef(open);
	openRef.current = open;

	// On a touch device the editor lowers the keyboard: the sheet is the thing being typed in now, and
	// the keyboard would cover its lower half. The selection stays; only focus leaves the text.
	React.useEffect(() => {
		if (!hasFinePointer()) (document.activeElement as HTMLElement | null)?.blur?.();
	}, []);

	// An object the document no longer reads as one (an undo, an edit elsewhere) closes the editor.
	React.useEffect(() => {
		if (!entry) onClose();
	}, [entry, onClose]);

	const anchorRef = React.useRef<Anchor>({
		getBoundingClientRect: () => {
			// The object's live element: ProseMirror hands back the node view's DOM for a position.
			try {
				const el = view.nodeDOM(openRef.current.pos);
				if (el instanceof HTMLElement && el.isConnected) return el.getBoundingClientRect();
				const c = view.coordsAtPos(Math.min(openRef.current.pos, view.state.doc.content.size));
				return new DOMRect(c.left, c.top, Math.max(1, c.right - c.left), c.bottom - c.top);
			} catch {
				return new DOMRect(0, 0, 0, 0);
			}
		},
		contextElement: view.dom as Element,
	});

	// Done: caret after the object (a selected object would be replaced by the next keystroke), and
	// the text keeps focus only where a keyboard is a thing the author has.
	const close = React.useCallback(() => {
		leaveObject(view);
		onClose();
		if (hasFinePointer()) view.focus();
	}, [onClose, view]);

	const onEdit = React.useCallback((edit: unknown) => editObject(view, openRef.current.pos, edit, kernels), [view, kernels]);

	const onEditAsText = React.useCallback(() => {
		onClose();
		editObjectAsText(view, openRef.current.pos);
	}, [onClose, view]);

	if (!owner || !entry) return null;
	const panel = <entry.Panel fields={owner.fields} kernels={kernels} slotColors={slotColors} onEdit={onEdit as ObjectPanelProps['onEdit']} onEditAsText={onEditAsText} onDone={close} />;

	if (phone) {
		return (
			<PanelSheet open onOpenChange={(o) => !o && close()} width="md">
				<PanelHeader icon={<Tag />} title={entry.title} srDescription={entry.describe} />
				<PanelBody>{panel}</PanelBody>
			</PanelSheet>
		);
	}
	return (
		<Popover open onOpenChange={(o) => !o && close()}>
			<PopoverAnchor virtualRef={anchorRef} />
			<PopoverContent
				align="start"
				collisionPadding={8}
				hideWhenDetached
				aria-label={entry.title}
				className="flex w-[min(21rem,90vw)] flex-col overflow-hidden max-h-[max(220px,calc(var(--radix-popover-content-available-height)-12px))]"
				onOpenAutoFocus={(e) => e.preventDefault()}
			>
				{panel}
			</PopoverContent>
		</Popover>
	);
}

export default InlineObjectEditorHost;
