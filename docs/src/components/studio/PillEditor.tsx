// THE PILL EDITOR — point and click, never type the syntax.
//
// The pill's panel in Compose's inline object editor (InlineObjectEditor.tsx): its label, shape,
// color and size. Design and decisions: engineering/decisions/2026-10-13-compose-inline-
// notation-editors.md (owner, 2026-10-13: a popover on desktop and tablet, a sheet on the phone).
//
//   · `PillPanel` is the controls and nothing else: it is handed the pill's fields and reports
//     one `PillEdit` per change. The shape and color choices come from the ENGINE's vocabulary
//     (`kernels.pill.SHAPES` / `COLORS` / `SIZES`), so a value the engine gains shows up here
//     with no edit.
//   · `InlineObjectEditorHost` puts the panel where it belongs and writes each edit through the
//     kernel (`editObject`: only the changed word is replaced, or nothing is written).
//
// THE DRAWING IS SCHEMATIC, AND SAYS SO. The Studio page does not carry the deck's pill CSS, so
// the shape thumbnails are outlines drawn here. The COLORS are the deck's own: read from the live
// preview frame when the editor opens (`readSlotColors`), because color slots are ordinals that
// mean different hues in different themes. The slide preview beside Compose shows the exact
// drawing, and it updates as each edit lands.
//
// Lazy with the host: none of it is in the Studio's startup JavaScript.

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { InlineKernels, PillEdit, PillFields } from '@/lib/compose/inline-objects';
import { cn } from '@/lib/utils';
import { IconGrid } from './IconGrid';

/** The selected look for a toggle item: the repo's chip-row pattern (SlideContext.tsx), so the pressed one is plain to see. */
export const ITEM =
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
	holdOpen,
}: {
	fields: PillFields;
	kernels: InlineKernels;
	slotColors: (string | null)[];
	/** Returns whether the edit was written. A refusal is shown, never swallowed. */
	onEdit: (edit: PillEdit) => boolean;
	onEditAsText: () => void;
	onDone: () => void;
	/** Keep the editor up while the icon grid is. Optional: a panel rendered without a host needs no hold. */
	holdOpen?: (held: boolean) => void;
}) {
	const [iconsOpen, setIconsOpen] = React.useState(false);
	const openIcons = (v: boolean) => {
		holdOpen?.(v);
		setIconsOpen(v);
	};
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
				{/* The linter's `pill-shape-crowded`, said where the author can act on it. */}
				{!refused && kernels.pill.crowded(fields) ? (
					<p role="status" className="text-[12px] text-[var(--warn)]">
						A {fields.shape} fits one character or a two-digit number. This label stretches it. Shorten the label, or pick Tag.
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
				<span id={`${labelId}-icon`} className="w-10 shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
					Icon
				</span>
				<fieldset className="m-0 flex min-w-0 flex-1 flex-wrap items-center gap-1.5 border-0 p-0" aria-labelledby={`${labelId}-icon`}>
					<Button type="button" variant="outline" size="sm" onClick={() => openIcons(true)}>
						{fields.icon ? `Change icon (${fields.icon})` : 'Add an icon'}
					</Button>
					{fields.icon && !iconOnly ? (
						<Button type="button" variant="ghost" size="sm" onClick={() => send({ icon: null }, 'That icon cannot be taken off here. Use Edit as text.')}>
							Remove
						</Button>
					) : null}
				</fieldset>
			</div>
			<IconGrid
				open={iconsOpen}
				onOpenChange={openIcons}
				onPick={(name) => {
					send({ icon: name }, 'That icon cannot be written here. Use Edit as text.');
					openIcons(false);
				}}
			/>

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
