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

import { ChartLine, Code, Image as ImageIcon, Puzzle, Shapes, Sigma, Tag, UserRound } from 'lucide-react';
import type { EditorView } from 'prosemirror-view';
import * as React from 'react';
import { PanelBody, PanelHeader, PanelSheet } from '@/components/ui/panel';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { editImage, isImage, removeImage } from '@/lib/compose/image-objects';
import { closeObjectEditor, editObject, editObjectAsText, type InlineKernels, kindOf, leaveObject, type OpenObject } from '@/lib/compose/inline-objects';
import { editInlineMath, editRawBlock, type RawObjectKind, rawObjectKind, removeRaw } from '@/lib/compose/raw-objects';
import { hasFinePointer, useIsPhone } from '@/lib/use-breakpoint';
import { AvatarPanel } from './AvatarPanel';
import { IconPanel } from './IconPanel';
import { ImagePanel } from './ImagePanel';
import { PillPanel, readSlotColors } from './PillEditor';
import { PluginKindPanel } from './PluginKindPanel';
import { RawPanel } from './RawPanel';
import { SparkPanel } from './SparkPanel';

/** What a panel is handed. It reports one edit per change and never writes the document itself. */
export interface ObjectPanelProps {
	fields: unknown;
	/** The object's source as the document has it now: a panel that draws the object larger needs it. */
	src: string;
	kernels: InlineKernels;
	slotColors: (string | null)[];
	/** Returns whether the edit was written. A refusal is shown by the panel, never swallowed. */
	onEdit: (edit: never) => boolean;
	onEditAsText: () => void;
	onDone: () => void;
	/** A panel that opens a surface of its own (the icon grid) holds the editor open while it is up: focus moving into it is not the author leaving. */
	holdOpen: (held: boolean) => void;
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
	spark: {
		title: 'Edit spark',
		describe: "Change this spark's numbers, chart type, color, size and marks.",
		Panel: (p) => <SparkPanel {...(p as unknown as React.ComponentProps<typeof SparkPanel>)} />,
	},
	avatar: {
		title: 'Edit avatar',
		describe: "Change this avatar's name, tile, size, shape and face.",
		Panel: (p) => <AvatarPanel {...(p as unknown as React.ComponentProps<typeof AvatarPanel>)} />,
	},
	icon: {
		title: 'Edit icon',
		describe: "Change this icon's shape, color, size, frame and look.",
		Panel: (p) => <IconPanel {...(p as unknown as React.ComponentProps<typeof IconPanel>)} />,
	},
	plugin: {
		title: 'Edit plugin object',
		describe: "Change this plugin object's fields.",
		Panel: (p) => <PluginKindPanel {...(p as unknown as React.ComponentProps<typeof PluginKindPanel>)} />,
	},
};

/** The image's entry: its panel is not an inline object's, so the host renders it itself (the `image` branch below). */
const IMAGE_ENTRY: PanelEntry = {
	title: 'Edit image',
	describe: "Change this image's photo, description and placement.",
	Panel: () => <></>,
};

/** The header icon of each kind's sheet. */
const KIND_ICON: Record<string, React.ReactNode> = { pill: <Tag />, spark: <ChartLine />, avatar: <UserRound />, icon: <Shapes />, plugin: <Puzzle />, image: <ImageIcon />, 'inline-math': <Sigma />, math: <Sigma />, html: <Code /> };

/** The entry for a math span, a math block and a block of HTML: their panel is `RawPanel`, which the host renders itself. */
const RAW_ENTRY: Record<RawObjectKind, PanelEntry> = {
	'inline-math': { title: 'Edit math', describe: "Change this math's TeX and see it drawn.", Panel: () => <></> },
	math: { title: 'Edit math block', describe: "Change this math block's TeX and see it drawn.", Panel: () => <></> },
	html: { title: 'Edit HTML block', describe: "Change this block's HTML.", Panel: () => <></> },
};

/** A virtual anchor that finds the object's place in the page again on every measurement. */
type Anchor = { getBoundingClientRect: () => DOMRect; contextElement?: Element };

export function InlineObjectEditorHost({
	view,
	kernels,
	open,
	onClose,
	onOpenLibrary,
}: {
	view: EditorView;
	kernels: InlineKernels;
	/** The object as the document stands NOW: the plugin maps it through every edit. */
	open: OpenObject;
	onClose: () => void;
	/** Open the Library panel, for an image whose photo is not there yet. */
	onOpenLibrary?: () => void;
}) {
	const phone = useIsPhone();
	// The preview frame is read once per open: the theme can differ between two opens.
	const slotColors = React.useMemo(() => readSlotColors(), []);
	// An image is not an inline object: it has no source text, and its panel is its own (ImagePanel.tsx).
	const imageNode = view.state.doc.nodeAt(open.pos);
	const image = isImage(imageNode);
	// A math span, a math block and a block of HTML are not inline objects either: they have text, not a source a kernel reads.
	const rawKind = rawObjectKind(imageNode);
	const owner = image || rawKind ? null : kindOf(open.src, kernels);
	const entry = image ? IMAGE_ENTRY : rawKind ? RAW_ENTRY[rawKind] : owner ? PANELS[owner.kind.id] : undefined;
	const held = React.useRef(false);
	const holdOpen = React.useCallback((v: boolean) => {
		held.current = v;
	}, []);
	const openRef = React.useRef(open);
	openRef.current = open;

	// On a touch device the editor lowers the keyboard: the sheet is the thing being typed in now, and
	// the keyboard would cover its lower half. The selection stays; only focus leaves the text.
	React.useEffect(() => {
		if (!hasFinePointer()) (document.activeElement as HTMLElement | null)?.blur?.();
	}, []);

	// An object the document no longer reads as one (an undo, an edit elsewhere) closes the editor.
	React.useEffect(() => {
		if (!entry) {
			// Close the plugin's open state too, or the node stays selected with nothing open on it.
			closeObjectEditor(view);
			onClose();
		}
	}, [entry, onClose, view]);

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

	if (!entry || (!owner && !image && !rawKind)) return null;
	const panel =
		rawKind ? (
			<RawPanel
				kind={rawKind}
				text={open.src}
				onEdit={(text) => (rawKind === 'inline-math' ? editInlineMath(view, openRef.current.pos, text) : editRawBlock(view, openRef.current.pos, text))}
				onRemove={() => {
					const removed = removeRaw(view, openRef.current.pos);
					if (!removed) return false;
					onClose();
					if (hasFinePointer()) view.focus();
					return true;
				}}
				onDone={close}
			/>
		) : image && imageNode ? (
			<ImagePanel
				fields={{ src: imageNode.attrs.src as string, alt: (imageNode.attrs.alt as string | null) ?? null }}
				onEdit={(edit) => editImage(view, openRef.current.pos, edit)}
				onRemove={() => {
					const removed = removeImage(view, openRef.current.pos);
					if (!removed) return false;
					onClose();
					if (hasFinePointer()) view.focus();
					return true;
				}}
				onDone={close}
				holdOpen={holdOpen}
				onOpenLibrary={onOpenLibrary}
			/>
		) : owner ? (
			<entry.Panel fields={owner.fields} src={open.src} kernels={kernels} slotColors={slotColors} onEdit={onEdit as ObjectPanelProps['onEdit']} onEditAsText={onEditAsText} onDone={close} holdOpen={holdOpen} />
		) : null;
	const kindId = image ? 'image' : (rawKind ?? owner?.kind.id ?? 'pill');

	if (phone) {
		return (
			<PanelSheet open onOpenChange={(o) => !o && !held.current && close()} width="md">
				<PanelHeader icon={KIND_ICON[kindId]} title={entry.title} srDescription={entry.describe} />
				<PanelBody>{panel}</PanelBody>
			</PanelSheet>
		);
	}
	return (
		<Popover open onOpenChange={(o) => !o && !held.current && close()}>
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
