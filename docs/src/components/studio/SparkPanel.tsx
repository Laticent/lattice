// THE SPARK EDITOR — point and click, never type the syntax.
//
// The spark's panel in Compose's inline object editor (InlineObjectEditor.tsx): its type, its
// numbers, and its size, color and marks. Design: engineering/decisions/2026-10-13-compose-inline-
// notation-editors.md (phase 2).
//
//   · `SparkPanel` is the controls and nothing else. It is handed the spark's fields and reports
//     one `SparkEdit` per change; the host writes it through `editSpark` (lib/plugins/sparks/sparks.inline.js),
//     which replaces only the words that changed or writes nothing.
//   · The type chips come from the ENGINE's vocabulary (`kernels.spark`), narrowed to the ones that go
//     with the data (a trend takes line, area, bar, step and win/loss; a ratio takes ring and bullet),
//     so the panel never offers what the engine would refuse. The marks (end dot, min and max, zero
//     baseline) are offered only where the engine draws them: line, area and step.
//   · The spark itself is drawn by the node view behind the panel, with the slide's own rules, and
//     redraws as each edit lands. The panel draws nothing of its own.
//
// Lazy with the host: none of it is in the Studio's startup JavaScript.

import { Minus, Plus } from 'lucide-react';
import * as React from 'react';
import { flushSync } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { InlineKernels, SparkEdit, SparkFields } from '@/lib/compose/inline-objects';
import { cn } from '@/lib/utils';
import { ITEM } from './PillEditor';

const LABEL = 'font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground';

/** What a person calls each type. Anything the engine adds later falls back to its own name. */
const TYPE_NAMES: Record<string, string> = {
	line: 'Line',
	area: 'Area',
	bar: 'Bars',
	step: 'Steps',
	winloss: 'Win / loss',
	ring: 'Ring',
	bullet: 'Bullet',
};
const SIZE_NAMES: Record<string, string> = { sm: 'Small', md: 'Standard', lg: 'Large' };
const MARK_NAMES: Record<string, string> = { end: 'End dot', minmax: 'Low and high' };

/** The types that draw a line through the points: the only ones that take marks and a zero baseline. */
const LINE_TYPES = ['line', 'area', 'step'];

/** What a "Ratio" switch writes when the spark was a trend, and the reverse. */
const SAMPLE_SERIES = '12 14 13 17 21';
const SAMPLE_RATIO = '72%';

const NUMBER = /^[+\-−]?(?:\d+(?:\.\d+)?|\.\d+)$/;

export function SparkPanel({
	fields,
	kernels,
	slotColors,
	onEdit,
	onEditAsText,
	onDone,
}: {
	fields: SparkFields;
	kernels: InlineKernels;
	slotColors: (string | null)[];
	/** Returns whether the edit was written. A refusal is shown, never swallowed. */
	onEdit: (edit: SparkEdit) => boolean;
	onEditAsText: () => void;
	onDone: () => void;
}) {
	const { SERIES_TYPES, TYPES, SIZES, COLORS, MARKERS, MAX_POINTS } = kernels.spark;
	const series = fields.data.kind === 'series';
	const ratioTypes = TYPES.filter((t) => !SERIES_TYPES.includes(t));
	const types = series ? SERIES_TYPES : ratioTypes;
	const lineLike = LINE_TYPES.includes(fields.type);
	const id = React.useId();
	const [refused, setRefused] = React.useState<string | null>(null);

	// The numbers as the author wrote them: a cell edit keeps every other word byte for byte.
	const seed = React.useMemo(() => fields.dataText.split(/\s+/).filter(Boolean), [fields.dataText]);
	const [cells, setCells] = React.useState<string[]>(seed);
	const gridRef = React.useRef<HTMLFieldSetElement>(null);
	// The numbers can change under the grid (an undo, an edit in the text): follow them, unless the author is typing in it.
	React.useEffect(() => {
		if (!gridRef.current?.contains(document.activeElement)) setCells(seed);
	}, [seed]);

	const send = (edit: SparkEdit, what: string) => setRefused(onEdit(edit) ? null : what);

	const writeCells = (next: string[], focusAt?: number) => {
		// Rendered NOW (not after the click returns), so the new box can take focus inside the tap: iOS raises
		// the keyboard only for a focus() made in the gesture that asked for it.
		flushSync(() => setCells(next));
		if (focusAt !== undefined) {
			const box = gridRef.current?.querySelectorAll('input')[focusAt];
			box?.focus();
			// Everything selected, so the first keystroke replaces the copied value.
			box?.setSelectionRange(0, box.value.length);
		}
		if (next.some((c) => !NUMBER.test(c))) return setRefused('Numbers only: no units, commas or currency signs.');
		if (next.length < 2) return setRefused('A trend needs two or more numbers.');
		send({ data: next.join(' ') }, 'Those numbers cannot be written here. Use Edit as text.');
	};

	// The ratio: "72 of 80", or a percentage.
	const ratio = fields.data.kind === 'ratio' ? fields.data : null;
	const [ratioIn, setRatioIn] = React.useState<{ value: string; target: string }>({ value: String(ratio?.value ?? ''), target: String(ratio?.target ?? '') });
	React.useEffect(() => {
		if (ratio && !gridRef.current?.contains(document.activeElement)) setRatioIn({ value: String(ratio.value), target: String(ratio.target) });
	}, [ratio]);
	const writeRatio = (next: { value: string; target: string }) => {
		setRatioIn(next);
		if (!NUMBER.test(next.value) || (!ratio?.pct && !NUMBER.test(next.target))) return setRefused('Numbers only: no units, commas or currency signs.');
		if (!ratio?.pct && !(Number(next.target) > 0)) return setRefused('The total must be above 0.');
		send({ data: ratio?.pct ? `${next.value}%` : `${next.value}/${next.target}` }, 'Those numbers cannot be written here. Use Edit as text.');
	};

	const pickType = (type: string) => {
		const edit: SparkEdit = { type };
		// A type that draws no line cannot carry the marks: clear them in the same write, or the engine refuses.
		if (!LINE_TYPES.includes(type)) Object.assign(edit, { end: false, minmax: false, zero: false });
		send(edit, 'That chart type cannot be written here. Use Edit as text.');
	};

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-3 text-[13px]">
			<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-0.5">
				<div className="flex flex-col gap-1.5">
					<span id={`${id}-kind`} className={LABEL}>
						Shows
					</span>
					<ToggleGroup
						type="single"
						value={series ? 'series' : 'ratio'}
						onValueChange={(v) => {
							if (!v || v === (series ? 'series' : 'ratio')) return;
							// The marks go with the old data: a ratio carries none, and a ring refuses `fill`.
							send({ data: v === 'series' ? SAMPLE_SERIES : SAMPLE_RATIO, type: null, end: false, minmax: false, zero: false, fill: false }, 'That cannot be written here. Use Edit as text.');
						}}
						aria-labelledby={`${id}-kind`}
						className="grid w-full grid-cols-2 gap-1"
					>
						<ToggleGroupItem value="series" aria-label="Shows: a trend" className={cn(ITEM, 'h-7 rounded-md text-[12px] font-normal')}>
							A trend
						</ToggleGroupItem>
						<ToggleGroupItem value="ratio" aria-label="Shows: a share of a total" className={cn(ITEM, 'h-7 rounded-md text-[12px] font-normal')}>
							A share of a total
						</ToggleGroupItem>
					</ToggleGroup>
				</div>

				<div className="flex flex-col gap-1.5">
					<span id={`${id}-numbers`} className={LABEL}>
						Numbers
					</span>
					<fieldset ref={gridRef} aria-labelledby={`${id}-numbers`} className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0">
						{series ? (
							<>
								<div className="grid grid-cols-4 gap-1.5">
									{cells.map((c, i) => (
										// biome-ignore lint/suspicious/noArrayIndexKey: a cell IS its position in the series
										<Input key={i} value={c} inputMode="decimal" autoComplete="off" spellCheck={false} aria-label={`Point ${i + 1}`} aria-invalid={!NUMBER.test(c) ? true : undefined} className="h-8 px-2 text-center tabular-nums" onChange={(e) => writeCells(cells.map((x, j) => (j === i ? e.target.value.trim() : x)))} />
									))}
								</div>
								<div className="flex items-center gap-2">
									<Button type="button" variant="outline" size="sm" disabled={cells.length >= MAX_POINTS} onClick={() => writeCells([...cells, cells.at(-1) ?? '0'], cells.length)}>
										<Plus aria-hidden="true" /> Add a point
									</Button>
									<Button type="button" variant="outline" size="sm" disabled={cells.length <= 2} onClick={() => writeCells(cells.slice(0, -1))}>
										<Minus aria-hidden="true" /> Remove last
									</Button>
								</div>
							</>
						) : (
							<div className="flex items-center gap-2">
								<Input value={ratioIn.value} inputMode="decimal" autoComplete="off" spellCheck={false} aria-label={ratio?.pct ? 'Percent' : 'Value'} className="h-8 w-20 px-2 text-center tabular-nums" onChange={(e) => writeRatio({ ...ratioIn, value: e.target.value.trim() })} />
								{ratio?.pct ? (
									<span className="text-muted-foreground">%</span>
								) : (
									<>
										<span className="text-muted-foreground">of</span>
										<Input value={ratioIn.target} inputMode="decimal" autoComplete="off" spellCheck={false} aria-label="Total" className="h-8 w-20 px-2 text-center tabular-nums" onChange={(e) => writeRatio({ ...ratioIn, target: e.target.value.trim() })} />
									</>
								)}
							</div>
						)}
						{refused ? (
							<p role="alert" className="text-[12px] text-[var(--warn)]">
								{refused}
							</p>
						) : null}
					</fieldset>
				</div>

				<div className="flex flex-col gap-1.5">
					<span id={`${id}-type`} className={LABEL}>
						Chart
					</span>
					<ToggleGroup type="single" value={fields.type} onValueChange={(v) => v && v !== fields.type && pickType(v)} aria-labelledby={`${id}-type`} className="flex flex-wrap gap-1">
						{types.map((t) => (
							<ToggleGroupItem key={t} value={t} aria-label={`Chart: ${TYPE_NAMES[t] ?? t}`} className={cn(ITEM, 'h-7 rounded-md px-2.5 text-[12px] font-normal')}>
								{TYPE_NAMES[t] ?? t}
							</ToggleGroupItem>
						))}
					</ToggleGroup>
				</div>

				<div className="flex flex-col gap-1.5">
					<span id={`${id}-color`} className={LABEL}>
						Color
					</span>
					<ToggleGroup
						type="single"
						value={fields.c ?? 'default'}
						onValueChange={(v) => v && send({ color: v === 'default' ? null : v }, 'That color cannot be written here. Use Edit as text.')}
						aria-labelledby={`${id}-color`}
						className="flex flex-wrap gap-1.5"
					>
						<ToggleGroupItem value="default" aria-label="Color: theme default" className={cn(ITEM, 'h-6 rounded-full px-2.5 text-[11px] font-normal')}>
							Default
						</ToggleGroupItem>
						{COLORS.map((c, i) => (
							<ToggleGroupItem key={c} value={c} aria-label={`Color ${i + 1}`} className={cn(ITEM, 'size-6 rounded-full p-0 data-[state=on]:ring-2 data-[state=on]:ring-[var(--accent)]')}>
								<span aria-hidden="true" className={cn('block size-3.5 rounded-full border border-border', slotColors[i] ? '' : 'bg-muted')} style={slotColors[i] ? { background: slotColors[i] as string } : undefined} />
							</ToggleGroupItem>
						))}
					</ToggleGroup>
				</div>

				<div className="flex items-center gap-3">
					<span id={`${id}-size`} className={cn(LABEL, 'w-10 shrink-0')}>
						Size
					</span>
					<ToggleGroup
						type="single"
						value={fields.size}
						onValueChange={(v) => v && send({ size: v === 'md' ? null : v }, 'That size cannot be written here. Use Edit as text.')}
						aria-labelledby={`${id}-size`}
						className="grid flex-1 grid-cols-3 gap-1"
					>
						{SIZES.map((s) => (
							<ToggleGroupItem key={s} value={s} aria-label={`Size: ${SIZE_NAMES[s] ?? s}`} className={cn(ITEM, 'h-7 rounded-md text-[12px] font-normal')}>
								{SIZE_NAMES[s] ?? s}
							</ToggleGroupItem>
						))}
					</ToggleGroup>
				</div>

				{lineLike || fields.type !== 'ring' ? (
					<div className="flex flex-col gap-1.5">
						<span id={`${id}-marks`} className={LABEL}>
							Marks
						</span>
						<ToggleGroup
							type="multiple"
							value={[...(lineLike ? fields.markers : []), ...(lineLike && fields.zero ? ['zero'] : []), ...(fields.fill ? ['fill'] : [])]}
							onValueChange={(next) => {
								const on = new Set(next);
								const edit: SparkEdit = {};
								if (lineLike) {
									for (const m of MARKERS) edit[m as 'end' | 'minmax'] = on.has(m);
									edit.zero = on.has('zero');
								}
								edit.fill = on.has('fill');
								send(edit, 'That cannot be written here. Use Edit as text.');
							}}
							aria-labelledby={`${id}-marks`}
							className="flex flex-wrap gap-1"
						>
							{lineLike
								? [...MARKERS, 'zero'].map((m) => (
										<ToggleGroupItem key={m} value={m} aria-label={`Mark: ${m === 'zero' ? 'Zero line' : (MARK_NAMES[m] ?? m)}`} className={cn(ITEM, 'h-7 rounded-md px-2.5 text-[12px] font-normal')}>
											{m === 'zero' ? 'Zero line' : (MARK_NAMES[m] ?? m)}
										</ToggleGroupItem>
									))
								: null}
							<ToggleGroupItem value="fill" aria-label="Mark: Full width" className={cn(ITEM, 'h-7 rounded-md px-2.5 text-[12px] font-normal')}>
								Full width
							</ToggleGroupItem>
						</ToggleGroup>
					</div>
				) : null}
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
