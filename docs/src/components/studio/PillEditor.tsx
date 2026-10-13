// THE PILL EDITOR — point and click, never type the syntax.
//
// Opens on a pill chip in Compose (lib/compose/inline-notation.ts) and edits the pill's label,
// shape, color and size. Design and decisions: engineering/decisions/2026-10-13-compose-inline-
// notation-editors.md (owner, 2026-10-13: a popover on desktop and tablet, a sheet on the phone).
//
//   · `PillPanel` is the controls and nothing else: it is handed the pill's fields and reports
//     one `PillEdit` per change. The shape and color choices come from the ENGINE's vocabulary
//     (`kernels.pill.SHAPES` / `COLORS` / `SIZES`), so a value the engine gains shows up here
//     with no edit.
//   · `PillEditorHost` puts the panel where it belongs, writes each edit through the kernel
//     (`applyPillEdit`: only the changed word is replaced, or nothing is written), and keeps the
//     range of the pill it is editing as the document moves under it.
//
// THE DRAWING IS SCHEMATIC, AND SAYS SO. The Studio page does not carry the deck's pill CSS, so
// the shape thumbnails are outlines drawn here. The COLORS are the deck's own: read from the live
// preview frame when the editor opens (`readSlotColors`), because color slots are ordinals that
// mean different hues in different themes. The slide preview beside Compose shows the exact
// drawing, and it updates as each edit lands.
//
// Lazy: StudioShell/ComposeView load this with React.lazy, as IconGrid is, so none of it is in
// the Studio's startup JavaScript.

import { Tag } from 'lucide-react';
import type { EditorView } from 'prosemirror-view';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PanelBody, PanelHeader, PanelSheet } from '@/components/ui/panel';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { applyPillEdit, type InlineKernels, type PillEdit, type PillFields, pillAt, type SpanRange, selectPillText } from '@/lib/compose/inline-notation';
import { useIsPhone } from '@/lib/use-breakpoint';
import { cn } from '@/lib/utils';

/** The selected look for a toggle item: the repo's chip-row pattern (SlideContext.tsx), so the pressed one is plain to see. */
const ITEM =
	'border border-border text-muted-foreground hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--border))] data-[state=on]:border-[var(--accent)] data-[state=on]:bg-[var(--accent-soft)] data-[state=on]:text-[var(--accent)]';

/** What a person calls each shape. Anything the engine adds later falls back to its own name. */
const SHAPE_NAMES: Record<string, string> = {
	pill: 'Pill',
	chip: 'Chip',
	tag: 'Tag',
	'tag-bordered': 'Outlined tag',
	circle: 'Circle',
	'chevron-right': 'Arrow right',
	'chevron-left': 'Arrow left',
	diamond: 'Diamond',
};

const SIZE_NAMES: Record<string, string> = { sm: 'Small', md: 'Standard', lg: 'Large' };

/**
 * One outline per shape, in plain CSS. Exported so a test can hold it to the engine's list: a
 * shape the engine gains and this table lacks fails `PillEditor.test.tsx`, not a review.
 */
export const SHAPE_GLYPH: Record<string, React.CSSProperties> = {
	pill: { borderRadius: 999 },
	chip: { borderRadius: 4 },
	tag: { borderRadius: 1 },
	'tag-bordered': { borderRadius: 1, background: 'transparent', boxShadow: 'inset 0 0 0 1.5px currentColor' },
	circle: { borderRadius: 999, width: 16 },
	'chevron-right': { clipPath: 'polygon(0 0, 76% 0, 100% 50%, 76% 100%, 0 100%)' },
	'chevron-left': { clipPath: 'polygon(24% 0, 100% 0, 100% 100%, 24% 100%, 0 50%)' },
	diamond: { clipPath: 'polygon(50% 0, 100% 50%, 50% 100%, 0 50%)', width: 18, height: 18 },
};

function PillGlyph({ shape, fill }: { shape: string; fill?: string | null }) {
	return (
		<span
			aria-hidden="true"
			className="inline-block h-4 w-8 shrink-0 bg-current"
			style={{ ...SHAPE_GLYPH[shape], ...(fill ? { background: fill, color: fill } : null) }}
		/>
	);
}

/**
 * The deck's twelve color slots as the live preview paints them, or nulls when there is no
 * preview frame (a swatch is then a neutral numbered dot). Read when the editor opens, because
 * the theme can change between one open and the next.
 */
export function readSlotColors(): (string | null)[] {
	const none = Array.from({ length: 12 }, () => null);
	try {
		const frame = document.querySelector<HTMLIFrameElement>('#studio-preview iframe.live') ?? document.querySelector<HTMLIFrameElement>('iframe.live');
		const doc = frame?.contentDocument;
		const win = frame?.contentWindow;
		const el = doc?.querySelector('section') ?? doc?.documentElement;
		if (!doc || !win || !el) return none;
		const cs = win.getComputedStyle(el);
		return none.map((_, i) => cs.getPropertyValue(`--cat-${i + 1}-fill`).trim() || null);
	} catch {
		return none;
	}
}

export function PillPanel({
	fields,
	kernels,
	slotColors,
	onEdit,
	onEditAsText,
	onDone,
}: {
	fields: PillFields;
	kernels: InlineKernels;
	slotColors: (string | null)[];
	/** Returns whether the edit was written. A refusal is shown, never swallowed. */
	onEdit: (edit: PillEdit) => boolean;
	onEditAsText: () => void;
	onDone: () => void;
}) {
	const [label, setLabel] = React.useState(fields.value);
	const [refused, setRefused] = React.useState<string | null>(null);
	const inputRef = React.useRef<HTMLInputElement>(null);
	// An icon-only pill has no label to edit: the engine reads its first bare word as an option.
	const iconOnly = fields.value === '' && Boolean(fields.icon);
	// The label can change under the field (an undo, an edit in the text): follow it, unless the
	// author is typing in it, when what they typed wins.
	React.useEffect(() => {
		if (document.activeElement !== inputRef.current) setLabel(fields.value);
	}, [fields.value]);
	// The label field keeps what the author typed; the fields it was seeded from only seed it.
	const labelId = React.useId();
	const { SHAPES, COLORS, SIZES } = kernels.pill;

	const send = (edit: PillEdit, what: string) => {
		setRefused(onEdit(edit) ? null : what);
	};
	const typed = (v: string) => {
		setLabel(v);
		if (!v.trim()) return setRefused('A pill needs a label.');
		send({ label: v.trim() }, 'That label cannot be written here. Use Edit as text.');
	};

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-3 text-[13px]">
			<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-0.5">
			<div className="flex flex-col gap-1.5">
				<label htmlFor={labelId} className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
					Label
				</label>
				<Input ref={inputRef} id={labelId} value={label} onChange={(e) => typed(e.target.value)} disabled={iconOnly} placeholder={iconOnly ? 'This pill shows an icon only' : undefined} autoComplete="off" spellCheck={false} aria-invalid={refused ? true : undefined} />
				{refused ? (
					<p role="alert" className="text-[12px] text-[var(--warn)]">
						{refused}
					</p>
				) : null}
			</div>

			<div className="flex flex-col gap-1.5">
				<span id={`${labelId}-shape`} className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
					Shape
				</span>
				<ToggleGroup
					type="single"
					value={fields.shape}
					onValueChange={(v) => v && send({ shape: v }, 'That shape cannot be written here. Use Edit as text.')}
					aria-labelledby={`${labelId}-shape`}
					className="grid w-full grid-cols-4 gap-1"
				>
					{SHAPES.map((s) => (
						<ToggleGroupItem key={s} value={s} aria-label={`Shape: ${SHAPE_NAMES[s] ?? s}`} className={cn(ITEM, 'flex h-auto flex-col gap-0.5 rounded-md px-1 py-1.5 text-[11px] font-normal')}>
							<PillGlyph shape={s} />
							<span>{SHAPE_NAMES[s] ?? s}</span>
						</ToggleGroupItem>
					))}
				</ToggleGroup>
			</div>

			<div className="flex flex-col gap-1.5">
				<span id={`${labelId}-color`} className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
					Color
				</span>
				<ToggleGroup
					type="single"
					value={fields.c ?? 'default'}
					onValueChange={(v) => v && send({ color: v === 'default' ? null : v }, 'That color cannot be written here. Use Edit as text.')}
					aria-labelledby={`${labelId}-color`}
					className="flex flex-wrap gap-1.5"
				>
					<ToggleGroupItem value="default" aria-label="Color: theme default" className={cn(ITEM, 'h-6 rounded-full px-2.5 text-[11px] font-normal')}>
						Default
					</ToggleGroupItem>
					{COLORS.map((c, i) => (
						<ToggleGroupItem key={c} value={c} aria-label={`Color ${i + 1}`} className={cn(ITEM, 'size-6 rounded-full p-0 data-[state=on]:ring-2 data-[state=on]:ring-[var(--accent)]')}>
							<span
								aria-hidden="true"
								className={cn('block size-3.5 rounded-full border border-border', slotColors[i] ? '' : 'bg-muted')}
								style={slotColors[i] ? { background: slotColors[i] as string } : undefined}
							/>
						</ToggleGroupItem>
					))}
				</ToggleGroup>
				{/* Slots are ordinals: the same number is a different hue in another theme. */}
				<p className="text-[11px] text-muted-foreground">Colors follow your theme; a number is a place in it, not a meaning.</p>
			</div>

			<div className="flex items-center gap-3">
				<span id={`${labelId}-size`} className="w-10 shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
					Size
				</span>
				<ToggleGroup
					type="single"
					value={fields.size ?? 'md'}
					onValueChange={(v) => v && send({ size: v === 'md' ? null : v }, 'That size cannot be written here. Use Edit as text.')}
					aria-labelledby={`${labelId}-size`}
					className="grid flex-1 grid-cols-3 gap-1"
				>
					{SIZES.map((s) => (
						<ToggleGroupItem key={s} value={s} aria-label={`Size: ${SIZE_NAMES[s] ?? s}`} className={cn(ITEM, 'h-7 rounded-md text-[12px] font-normal')}>
							{SIZE_NAMES[s] ?? s}
						</ToggleGroupItem>
					))}
				</ToggleGroup>
			</div>
			</div>
			<div className="flex shrink-0 items-center justify-between gap-2 border-t border-border pt-3">
				<Button type="button" variant="ghost" size="sm" onClick={onEditAsText}>
					Edit as text
				</Button>
				<Button type="button" size="sm" onClick={onDone}>
					Done
				</Button>
			</div>
		</div>
	);
}

/** A virtual anchor that finds the pill's place in the page again on every measurement. */
export type ChipAnchor = { getBoundingClientRect: () => DOMRect; contextElement?: Element };

export function PillEditorHost({
	view,
	kernels,
	range,
	onClose,
}: {
	view: EditorView;
	kernels: InlineKernels;
	/** The pill's range as the document stands NOW: the notation plugin maps it through every edit. */
	range: SpanRange;
	onClose: () => void;
}) {
	const phone = useIsPhone();
	// The preview frame is read once per open: the theme can differ between two opens.
	const slotColors = React.useMemo(() => readSlotColors(), []);
	const span = pillAt(view.state.doc, range, kernels);

	// A pill the document no longer has (an undo, an edit elsewhere) closes the editor.
	React.useEffect(() => {
		if (!span) onClose();
	}, [span, onClose]);

	const rangeRef = React.useRef(range);
	rangeRef.current = range;
	const anchorRef = React.useRef({
		getBoundingClientRect: () => {
			// The pill's live place on the page, found by the position stamped on its widget (a drawn
			// pill or its tag button): the widget is rebuilt whenever the text changes, so an element
			// held across an edit would be detached. Coordinates are the fallback.
			try {
				const el = view.dom.querySelector<HTMLElement>(`[data-pill-from="${rangeRef.current.from}"]`);
				if (el?.isConnected) return el.getBoundingClientRect();
				const at = Math.min(rangeRef.current.from, view.state.doc.content.size);
				const c = view.coordsAtPos(at);
				return new DOMRect(c.left, c.top, Math.max(1, c.right - c.left), c.bottom - c.top);
			} catch {
				return new DOMRect(0, 0, 0, 0);
			}
		},
		contextElement: view.dom as Element,
	});

	const close = React.useCallback(() => {
		onClose();
		view.focus();
	}, [onClose, view]);

	const onEdit = React.useCallback(
		(edit: PillEdit) => {
			// The new range reaches this component as the `range` prop, mapped by the plugin.
			return applyPillEdit(view, rangeRef.current, edit, kernels) !== null;
		},
		[view, kernels],
	);

	const onEditAsText = React.useCallback(() => {
		const r = rangeRef.current;
		onClose();
		selectPillText(view, r);
	}, [onClose, view]);

	if (!span) return null;
	const panel = <PillPanel fields={span.fields} kernels={kernels} slotColors={slotColors} onEdit={onEdit} onEditAsText={onEditAsText} onDone={close} />;

	if (phone) {
		return (
			<PanelSheet open onOpenChange={(o) => !o && close()} width="md">
				<PanelHeader icon={<Tag />} title="Edit pill" srDescription="Change this pill's label, shape, color and size." />
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
				aria-label="Edit pill"
				className="flex w-[min(21rem,90vw)] flex-col overflow-hidden max-h-[max(220px,calc(var(--radix-popover-content-available-height)-12px))]"
				onOpenAutoFocus={(e) => e.preventDefault()}
			>
				{panel}
			</PopoverContent>
		</Popover>
	);
}

export default PillEditorHost;
