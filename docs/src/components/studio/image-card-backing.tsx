import { Slider } from '@/components/ui/slider';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';

// The card's backing as a LEVEL, 0–100%. One control for the deck's Image tab and the slide's:
// a slider for any 5% step, and chips for the four steps that carry a name, so a person can
// say "soft" and a deck line can too (`image-card: soft`, or `image-card: 65%` between names).
// The words are the `image-card:` register's (lib/core/resolve-image-card.js); a unit test pins
// this table to it.

export const BACKING_STEPS = [
	{ word: 'solid', pct: 100, label: 'Solid' },
	{ word: 'soft', pct: 80, label: 'Soft' },
	{ word: 'sheer', pct: 55, label: 'Sheer' },
	{ word: 'clear', pct: 0, label: 'Clear' },
] as const;

/** A backing word as a percent: a named step's, or the number itself. */
export function backingPercent(word: string | null | undefined): number | undefined {
	if (!word) return undefined;
	const named = BACKING_STEPS.find((s) => s.word === word);
	if (named) return named.pct;
	const n = Number.parseFloat(word);
	return word.endsWith('%') && Number.isFinite(n) ? n : undefined;
}

/** A percent as the word the register takes: the step's name where it has one, else the number. */
export function backingWord(pct: number): string {
	return BACKING_STEPS.find((s) => s.pct === pct)?.word ?? `${pct}%`;
}

const AUTO = '__auto__';

// The chip look the pill editor's rows use, written out here: importing it from PillEditor would
// pull that whole editor into the shared Studio chunk for one class string.
const ITEM =
	'border border-border text-muted-foreground hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--border))] data-[state=on]:border-[var(--accent)] data-[state=on]:bg-[var(--accent-soft)] data-[state=on]:text-[var(--accent)]';

type Props = {
	/** The word set here (on the slide, or on the deck line); undefined when the control follows its parent. */
	word: string | undefined;
	/** What applies when none is set here: the deck's word, or the layout's own (solid). */
	inheritedWord: string | undefined;
	/** What the Auto chip says, e.g. "Auto · Soft" or "Solid (default)". */
	autoLabel: string;
	ariaLabel: string;
	/** `null` returns the control to Auto. */
	onChange: (word: string | null) => void;
	/** The photo behind the card has been read, so a thin step can pick its ink in the same edit. */
	inkReady?: boolean;
};

export function CardBackingControl({ word, inheritedWord, autoLabel, ariaLabel, onChange, inkReady }: Props) {
	const shown = backingPercent(word) ?? backingPercent(inheritedWord) ?? 100;
	return (
		<div className="flex w-full flex-col gap-2" data-ink-ready={inkReady === undefined ? undefined : String(inkReady)}>
			<div className="flex items-center gap-3">
				<Slider aria-label={ariaLabel} min={0} max={100} step={5} value={shown} onValueChange={(v) => onChange(backingWord(v))} />
				<span className="w-9 shrink-0 whitespace-nowrap text-right font-mono text-[11px] tabular-nums text-muted-foreground" aria-hidden="true">
					{shown}%
				</span>
			</div>
			<ToggleGroup
				type="single"
				value={word ? backingWord(backingPercent(word) ?? 100) : AUTO}
				onValueChange={(v) => {
					if (!v) return;
					onChange(v === AUTO ? null : v);
				}}
				aria-label={`${ariaLabel} steps`}
				className="grid w-full grid-cols-5 gap-1"
			>
				<ToggleGroupItem value={AUTO} aria-label={autoLabel} className={cn(ITEM, 'h-6 rounded-full px-1 text-[11px] font-normal')}>
					Auto
				</ToggleGroupItem>
				{BACKING_STEPS.map((s) => (
					<ToggleGroupItem key={s.word} value={s.word} aria-label={`${s.label}, ${s.pct}%`} className={cn(ITEM, 'h-6 rounded-full px-1 text-[11px] font-normal')}>
						{s.label}
					</ToggleGroupItem>
				))}
			</ToggleGroup>
		</div>
	);
}
