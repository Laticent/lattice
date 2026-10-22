// THE AVATAR EDITOR — point and click, never type the syntax.
//
// The avatar's panel in Compose's inline object editor (InlineObjectEditor.tsx): the person's name, the
// tile's color, size, shape and frame, and every trait of the face. Design:
// engineering/decisions/2026-10-21-compose-point-and-click.md.
//
//   · `AvatarPanel` is the controls and nothing else. It is handed the avatar's fields and reports one
//     change per pick (`{ hair: 'bob' }`); the host writes it through `edit` in
//     lib/plugins/avatars/avatars.inline.js, which replaces only the word that changed or writes nothing.
//   · THE CONTROLS ARE DRAWN FROM THE ENGINE'S SCHEMA (`kernels.avatar.SPEC`): the traits, their words and the
//     tile options. A trait the vocabulary gains appears here with no edit, and `AvatarPanel.test.tsx` holds
//     the panel to the list.
//   · THE NAME PICKS EVERY TRAIT THE AUTHOR DID NOT, so each trait's first chip is "From name", which writes
//     nothing and says what the name picked. Choosing a word pins that one trait.
//   · The large drawing at the top is the engine's own, in the slide's rules (the pill sheet), so the author
//     sees the face change as each pick lands. A drawing that has not loaded shows the person's name.
//
// Lazy with the host: none of it is in the Studio's startup JavaScript.

import * as React from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { type AvatarEdit, type AvatarFields, inSlideScope, onObjectsRepaint } from '@/lib/compose/inline-objects';
import { PILL_SCOPE } from '@/lib/compose/pill-sheet';
import type { ObjectPanelProps } from './InlineObjectEditor';
import { ChoiceRow, ColorRow, Field, PanelFooter, TextRow } from './object-controls';

const SIZE_NAMES: Record<string, string> = { sm: 'Small', md: 'Standard', lg: 'Large', xl: 'Extra large' };
const SHAPE_NAMES: Record<string, string> = { circle: 'Circle', rounded: 'Rounded', square: 'Square' };
const FRAME_NAMES: Record<string, string> = { framed: 'Framed', bare: 'Bare' };
const GENDER_NAMES: Record<string, string> = { neutral: 'Neutral', woman: 'Woman', man: 'Man' };

/** What a person calls each trait. */
const TRAIT_NAMES: Record<string, string> = {
	skin: 'Skin tone',
	hair: 'Hair',
	'hair-color': 'Hair color',
	face: 'Face shape',
	eyes: 'Eyes',
	'eye-color': 'Eye color',
	brows: 'Eyebrows',
	nose: 'Nose',
	mouth: 'Mouth',
	beard: 'Beard',
	glasses: 'Glasses',
	earrings: 'Earrings',
	headwear: 'Headwear',
	'headwear-color': 'Headwear color',
	top: 'Top color',
	clothing: 'Clothing',
};

type Palettes = {
	skin?: Record<string, { base: string }>;
	'hair-color'?: Record<string, { base: string }>;
	'eye-color'?: Record<string, string>;
	top?: Record<string, string>;
};

/** The colors of the traits that ARE colors, from the plugin's data script, or null while it has not loaded. */
function palettes(): Palettes | null {
	const all = (globalThis as unknown as { __latticePluginData?: { avatars?: { palettes?: Palettes } } }).__latticePluginData;
	return all?.avatars?.palettes ?? null;
}

/** The swatch for one value of a color trait, or null for a trait that is not a color (or no data yet). */
export function traitSwatch(trait: string, value: string, p: Palettes | null = palettes()): string | null {
	if (!p) return null;
	switch (trait) {
		case 'skin':
			return p.skin?.[value]?.base ?? null;
		case 'hair-color':
			return p['hair-color']?.[value]?.base ?? null;
		case 'eye-color':
			return p['eye-color']?.[value] ?? null;
		case 'top':
		case 'headwear-color':
			return p.top?.[value] ?? null;
		default:
			return null;
	}
}

/** The tile's color slots, `c1` … `c12`, from the schema's own `color` parameter. */
function slotsOf(spec: { prefix?: string; max?: number }): string[] {
	return Array.from({ length: spec.max ?? 12 }, (_, i) => `${spec.prefix ?? 'c'}${i + 1}`);
}

/** The avatar, large, as the slide draws it. Empty until the pill sheet and the drawings are ready. */
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
		const big = kernels.avatar.edit(src, { size: 'xl' }) ?? src;
		const drawn = kernels.avatar.element(document, big);
		if (drawn) host.append(inSlideScope(drawn));
	}, [src, kernels, tick]);
	return <div ref={ref} aria-hidden="true" className={`${PILL_SCOPE} flex min-h-[5.5rem] items-center justify-center`} />;
}

export function AvatarPanel({ fields, src, kernels, slotColors, onEdit, onEditAsText, onDone }: ObjectPanelProps & { fields: AvatarFields }) {
	const [refused, setRefused] = React.useState<string | null>(null);
	const [faceOpen, setFaceOpen] = React.useState(false);
	const labelId = React.useId();
	const { SPEC, TRAIT_ORDER } = kernels.avatar;
	const params = SPEC.params as Record<string, { values?: readonly string[]; prefix?: string; max?: number }>;
	const written = fields.written;
	const pal = palettes();
	// What "From name" stands for on each trait: the value the name picks when the trait is not written. For a trait
	// the author wrote, that is read from the same span with the word taken off, never from the current value.
	const picked = React.useMemo(() => {
		const out: Record<string, string> = {};
		for (const t of TRAIT_ORDER) {
			out[t] = t in written ? (kernels.avatar.read(kernels.avatar.edit(src, { [t]: null }) ?? src)?.traits[t] ?? fields.traits[t]) : fields.traits[t];
		}
		return out;
	}, [src, kernels, TRAIT_ORDER, written, fields.traits]);

	const send = (edit: AvatarEdit, what: string) => setRefused((onEdit as (e: AvatarEdit) => boolean)(edit) ? null : what);
	const wordOf = (key: string): string | null => (typeof written[key] === 'string' ? (written[key] as string) : null);
	const colorOf = (key: string): string | null => (typeof written[key] === 'number' ? `c${written[key]}` : null);

	const chips = (key: 'size' | 'shape' | 'frame', names: Record<string, string>, label: string) => (
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

				<Field label="Name" id={`${labelId}-name`}>
					<TextRow
						id={`${labelId}-name-input`}
						label="Name"
						value={fields.name}
						onCommit={(v) => (v.trim() ? send({ name: v.trim() }, 'That name cannot be written here. Use Edit as text.') : setRefused('An avatar needs a name. It also picks the face.'))}
					/>
					{refused ? (
						<p role="alert" className="text-[12px] text-[var(--warn)]">
							{refused}
						</p>
					) : (
						<p className="text-[11px] text-muted-foreground">The name picks a face. The same name draws the same face everywhere.</p>
					)}
				</Field>

				<Field label="Tile" id={`${labelId}-color`}>
					<ColorRow labeledBy={`${labelId}-color`} value={colorOf('color')} slotColors={slotColors} slots={slotsOf(params.color)} onPick={(c) => send({ color: c }, 'That color cannot be written here. Use Edit as text.')} none="From name" noneLabel="Tile color: from name" />
				</Field>

				{chips('size', SIZE_NAMES, 'Size')}
				{chips('shape', SHAPE_NAMES, 'Shape')}
				{chips('frame', FRAME_NAMES, 'Frame')}

				<Collapsible open={faceOpen} onOpenChange={setFaceOpen} className="flex flex-col gap-3 rounded-md border border-border p-2">
					<CollapsibleTrigger className="flex items-center justify-between text-left text-[12px] font-medium">
						<span>Face and clothes</span>
						<span aria-hidden="true" className="text-muted-foreground">
							{faceOpen ? 'Hide' : 'Show'}
						</span>
					</CollapsibleTrigger>
					<CollapsibleContent className="flex flex-col gap-3">
						<Field label="Look" id={`${labelId}-gender`}>
							<ChoiceRow labeledBy={`${labelId}-gender`} group="Look" values={params.gender.values ?? []} value={wordOf('gender')} names={GENDER_NAMES} defaultValue="neutral" noAuto onPick={(v) => send({ gender: v }, 'That cannot be written here. Use Edit as text.')} />
							<p className="text-[11px] text-muted-foreground">Sets the hair, beard and brow styles a name picks from. A trait you choose below always wins.</p>
						</Field>
						{TRAIT_ORDER.map((t) => (
							<Field key={t} label={TRAIT_NAMES[t] ?? t} id={`${labelId}-${t}`}>
								<ChoiceRow labeledBy={`${labelId}-${t}`} group={TRAIT_NAMES[t] ?? t} values={params[t].values ?? []} value={wordOf(t)} autoLabel="From name" effective={picked[t]} swatch={(v) => traitSwatch(t, v, pal)} onPick={(v) => send({ [t]: v }, 'That cannot be written here. Use Edit as text.')} />
							</Field>
						))}
					</CollapsibleContent>
				</Collapsible>
			</div>
			<PanelFooter onEditAsText={onEditAsText} onDone={onDone} />
		</div>
	);
}
