// THE ICON EDITOR — point and click, never type the syntax.
//
// The icon's panel in Compose's inline object editor (InlineObjectEditor.tsx): which icon, its color, size,
// frame, look and corners, and the name a screen reader says. Design:
// engineering/decisions/2026-10-21-compose-point-and-click.md.
//
//   · `IconPanel` is the controls and nothing else. It is handed the icon's fields and reports one change per
//     pick (`{ size: 'lg' }`); the host writes it through `edit` in lib/plugins/icons/icons.inline.js, which
//     replaces only the word that changed or writes nothing. An alias the author wrote (`db`) stays an alias.
//   · The option rows are drawn from the engine's schema (`kernels.icon.SPEC`), so an option the plugin gains
//     appears here with no edit.
//   · Picking an icon opens the same grid the pill's `icon=` axis uses (IconGrid.tsx), which lists what the
//     deck can write, drawn, searchable by name, alias or category. The host holds the editor open while it is
//     up (`holdOpen`): focus moving into the grid is not the author leaving.
//
// Lazy with the host: none of it is in the Studio's startup JavaScript.

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { type IconEdit, type IconFields, inSlideScope, onObjectsRepaint } from '@/lib/compose/inline-objects';
import { PILL_SCOPE } from '@/lib/compose/pill-sheet';
import { IconGrid } from './IconGrid';
import type { ObjectPanelProps } from './InlineObjectEditor';
import { ChoiceRow, ColorRow, Field, PanelFooter, TextRow } from './object-controls';

const SIZE_NAMES: Record<string, string> = { sm: 'Small', md: 'Standard', lg: 'Large' };
const FRAME_NAMES: Record<string, string> = { framed: 'Framed', bare: 'Bare' };
const LOOK_NAMES: Record<string, string> = { pigment: 'Pigment', etch: 'Etch', tone: 'Tone' };
const CORNER_NAMES: Record<string, string> = { square: 'Square', rounded: 'Rounded' };

/** The deck's color slots, `c1` … `c12`, from the schema's own `color` parameter. */
function slotsOf(spec: { prefix?: string; max?: number }): string[] {
	return Array.from({ length: spec.max ?? 12 }, (_, i) => `${spec.prefix ?? 'c'}${i + 1}`);
}

/** The icon, large, as the slide draws it. Empty until the pill sheet and the drawings are ready. */
function Preview({ src, kernels }: { src: string; kernels: ObjectPanelProps['kernels'] }) {
	const ref = React.useRef<HTMLDivElement>(null);
	// Redraws on a new source, and when the sheet or the plugin's drawings arrive (`repaintObjects`).
	const [tick, setTick] = React.useState(0);
	React.useEffect(() => onObjectsRepaint(() => setTick((n) => n + 1)), []);
	// biome-ignore lint/correctness/useExhaustiveDependencies: `tick` is the repaint signal; the effect reads no value from it.
	React.useLayoutEffect(() => {
		const host = ref.current;
		if (!host) return;
		host.replaceChildren();
		const big = kernels.icon.edit(src, { size: 'lg' }) ?? src;
		const drawn = kernels.icon.element(document, big);
		if (drawn) host.append(inSlideScope(drawn));
	}, [src, kernels, tick]);
	return <div ref={ref} aria-hidden="true" className={`${PILL_SCOPE} flex min-h-[4rem] items-center justify-center`} />;
}

export function IconPanel({ fields, src, kernels, slotColors, onEdit, onEditAsText, onDone, holdOpen }: ObjectPanelProps & { fields: IconFields }) {
	const [refused, setRefused] = React.useState<string | null>(null);
	const [gridOpen, setGridOpen] = React.useState(false);
	const labelId = React.useId();
	const params = kernels.icon.SPEC.params as Record<string, { values?: readonly string[]; prefix?: string; max?: number }>;
	const written = fields.written ?? {};
	const wordOf = (key: string): string | null => (typeof written[key] === 'string' ? (written[key] as string) : null);
	const send = (edit: IconEdit, what: string) => setRefused((onEdit as (e: IconEdit) => boolean)(edit) ? null : what);
	const openGrid = (v: boolean) => {
		holdOpen(v);
		setGridOpen(v);
	};

	const chips = (key: 'size' | 'frame' | 'look' | 'corners', names: Record<string, string>, label: string) => (
		<Field label={label} id={`${labelId}-${key}`} inline>
			<div className="min-w-0 flex-1">
				<ChoiceRow labeledBy={`${labelId}-${key}`} group={label} values={params[key].values ?? []} value={wordOf(key)} names={names} defaultValue={key === 'size' ? 'md' : undefined} onPick={(v) => send({ [key]: v }, `That ${key} cannot be written here. Use Edit as text.`)} />
			</div>
		</Field>
	);

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-3 text-[13px]">
			<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-0.5">
				<Preview src={src} kernels={kernels} />

				<Field label="Icon" id={`${labelId}-name`}>
					<div className="flex items-center gap-2">
						<span className="min-w-0 flex-1 truncate font-mono text-[12px]">{fields.name}</span>
						<Button type="button" variant="outline" size="sm" onClick={() => openGrid(true)}>
							Change icon
						</Button>
					</div>
				</Field>
				<IconGrid
					open={gridOpen}
					onOpenChange={openGrid}
					onPick={(name) => {
						send({ name }, 'That icon cannot be written here. Use Edit as text.');
						openGrid(false);
					}}
				/>

				<Field label="Color" id={`${labelId}-color`}>
					<ColorRow labeledBy={`${labelId}-color`} value={typeof written.color === 'number' ? `c${written.color}` : null} slotColors={slotColors} slots={slotsOf(params.color as { prefix?: string; max?: number })} onPick={(c) => send({ color: c }, 'That color cannot be written here. Use Edit as text.')} />
					<p className="text-[11px] text-muted-foreground">Colors follow your theme; a number is a place in it, not a meaning.</p>
				</Field>

				{chips('size', SIZE_NAMES, 'Size')}
				{chips('frame', FRAME_NAMES, 'Frame')}
				{chips('look', LOOK_NAMES, 'Look')}
				{chips('corners', CORNER_NAMES, 'Corners')}

				<Field label="Spoken name" id={`${labelId}-label`}>
					<TextRow id={`${labelId}-label-input`} label="Spoken name" value={typeof written.label === 'string' ? written.label : ''} placeholder={fields.name.replace(/-/g, ' ')} onCommit={(v) => send({ label: v.trim() || null }, 'That name cannot be written here. Use Edit as text.')} />
					<p className="text-[11px] text-muted-foreground">What a screen reader says for this icon. Left empty, it says the icon's own name.</p>
				</Field>
				{refused ? (
					<p role="alert" className="text-[12px] text-[var(--warn)]">
						{refused}
					</p>
				) : null}
			</div>
			<PanelFooter onEditAsText={onEditAsText} onDone={onDone} />
		</div>
	);
}
