// THE SHARED CONTROLS of Compose's inline object panels (InlineObjectEditor.tsx): a labeled row, a row
// of color swatches, a row of choice chips and a text field that writes when the author leaves it.
//
// The pill, avatar and icon panels all ask the same four questions (a color slot, one word of a
// vocabulary, a label, an icon), so the controls live here once (HARD RULE #15) and each panel
// arranges them. Every control reports one change and never writes the document: the host writes it
// through the kind's own kernel (`editObject`).
//
// Lazy with the host: none of it is in the Studio's startup JavaScript.

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';

/** The selected look for a toggle item: the repo's chip-row pattern (SlideContext.tsx), so the pressed one is plain to see. */
export const ITEM =
	'border border-border text-muted-foreground hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--border))] data-[state=on]:border-[var(--accent)] data-[state=on]:bg-[var(--accent-soft)] data-[state=on]:text-[var(--accent)]';

export const LABEL = 'font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground';

/** A control's label, and the id its control names itself by. */
export function Field({ label, id, children, inline }: { label: string; id: string; children: React.ReactNode; inline?: boolean }) {
	return (
		<div className={inline ? 'flex items-center gap-3' : 'flex flex-col gap-1.5'}>
			<span id={id} className={cn(LABEL, inline && 'w-12 shrink-0')}>
				{label}
			</span>
			{children}
		</div>
	);
}

/**
 * The deck's color slots as swatches, and "Default" for none. A slot is a place in the theme, so the
 * swatch is named by its number and carries no meaning of its own (the pill editor says so too).
 * `value` is the written word (`c4`) or null.
 */
export function ColorRow({ labeledBy, value, slotColors, slots, onPick, none = 'Default', noneLabel = 'Color: theme default' }: { labeledBy: string; value: string | null; slotColors: (string | null)[]; slots: readonly string[]; onPick: (color: string | null) => void; none?: string; noneLabel?: string }) {
	return (
		<ToggleGroup type="single" value={value ?? 'default'} onValueChange={(v) => v && onPick(v === 'default' ? null : v)} aria-labelledby={labeledBy} className="flex flex-wrap gap-1.5">
			<ToggleGroupItem value="default" aria-label={noneLabel} className={cn(ITEM, 'h-6 rounded-full px-2.5 text-[11px] font-normal')}>
				{none}
			</ToggleGroupItem>
			{slots.map((c, i) => (
				<ToggleGroupItem key={c} value={c} aria-label={`Color ${i + 1}`} className={cn(ITEM, 'size-6 rounded-full p-0 data-[state=on]:ring-2 data-[state=on]:ring-[var(--accent)]')}>
					<span aria-hidden="true" className={cn('block size-3.5 rounded-full border border-border', slotColors[i] ? '' : 'bg-muted')} style={slotColors[i] ? { background: slotColors[i] as string } : undefined} />
				</ToggleGroupItem>
			))}
		</ToggleGroup>
	);
}

/**
 * One vocabulary as chips, with a first chip for "not written": the engine's own default, or, for an avatar
 * trait, what the name picks. `value` is the written word or null; `effective` is what that chip stands for, and
 * is said on it so the author sees what leaving it alone means.
 *
 * `defaultValue` names the word that IS the default (a size of `md`): it is not listed twice, its chip is the
 * "not written" one, and picking it clears the word, because writing a word that changes nothing only lengthens
 * the span. With `noAuto` there is no separate chip at all: the default word is a chip like the others and shows
 * as chosen while nothing is written.
 */
export function ChoiceRow({
	labeledBy,
	group,
	values,
	value,
	names = {},
	autoLabel = 'Default',
	effective,
	defaultValue,
	noAuto,
	onPick,
	swatch,
	columns,
}: {
	labeledBy: string;
	/** The accessible-name prefix: "Hair" gives "Hair: Curly". */
	group: string;
	values: readonly string[];
	value: string | null;
	names?: Record<string, string>;
	autoLabel?: string;
	effective?: string;
	defaultValue?: string;
	noAuto?: boolean;
	onPick: (v: string | null) => void;
	/** A color to show beside a value, for the traits that are colors (skin, hair color). */
	swatch?: (v: string) => string | null;
	columns?: number;
}) {
	const nice = (v: string) => names[v] ?? v.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
	const shown = defaultValue && !noAuto ? values.filter((v) => v !== defaultValue) : values;
	const auto = defaultValue && !noAuto ? nice(defaultValue) : autoLabel;
	// A default word the author wrote out (`md`) stands for the same chip as no word at all.
	const selected = (value === defaultValue && !noAuto ? null : value) ?? (noAuto && defaultValue ? defaultValue : '__auto');
	const pick = (v: string) => onPick(v === '__auto' || v === defaultValue ? null : v);
	return (
		<ToggleGroup type="single" value={selected} onValueChange={(v) => v && pick(v)} aria-labelledby={labeledBy} className={columns ? 'grid gap-1' : 'flex flex-wrap gap-1'} style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}>
			{noAuto ? null : (
				<ToggleGroupItem value="__auto" aria-label={`${group}: ${auto}${effective ? `, ${nice(effective)}` : ''}`} className={cn(ITEM, 'h-7 rounded-md px-2 text-[12px] font-normal')}>
					{auto}
					{effective ? <span className="ml-1 text-[11px] opacity-70">· {nice(effective)}</span> : null}
				</ToggleGroupItem>
			)}
			{shown.map((v) => {
				const fill = swatch?.(v) ?? null;
				return (
					<ToggleGroupItem key={v} value={v} aria-label={`${group}: ${nice(v)}`} className={cn(ITEM, 'h-7 gap-1.5 rounded-md px-2 text-[12px] font-normal')}>
						{fill ? <span aria-hidden="true" className="block size-3 shrink-0 rounded-full border border-border" style={{ background: fill }} /> : null}
						{nice(v)}
					</ToggleGroupItem>
				);
			})}
		</ToggleGroup>
	);
}

/**
 * A text field that writes when the author leaves it or presses Enter, not on every key, so a
 * half-typed name is never the document's name. It follows the value under it (an undo, an edit in
 * the text) unless the author is typing in it.
 */
export function TextRow({ id, value, placeholder, disabled, onCommit, label }: { id: string; value: string; placeholder?: string; disabled?: boolean; onCommit: (v: string) => void; label?: string }) {
	const [text, setText] = React.useState(value);
	const ref = React.useRef<HTMLInputElement>(null);
	React.useEffect(() => {
		if (document.activeElement !== ref.current) setText(value);
	}, [value]);
	const commit = () => {
		if (text !== value) onCommit(text);
	};
	// A panel dismissed while the author is still in the field (Escape, a click outside, a swipe on the phone's sheet) unmounts the
	// input with no blur before it, which would drop what they typed. What was typed is written then, as it is on blur.
	const latest = React.useRef({ text, value, onCommit });
	latest.current = { text, value, onCommit };
	React.useEffect(
		() => () => {
			const { text: t, value: v, onCommit: c } = latest.current;
			if (t !== v) c(t);
		},
		[],
	);
	return (
		<Input
			ref={ref}
			id={id}
			aria-label={label}
			value={text}
			disabled={disabled}
			placeholder={placeholder}
			autoComplete="off"
			spellCheck={false}
			onChange={(e) => setText(e.target.value)}
			onBlur={commit}
			onKeyDown={(e) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					commit();
				}
			}}
		/>
	);
}

/** The panel's footer: the text door and Done. Every panel ends the same way. */
export function PanelFooter({ onEditAsText, onDone, children }: { onEditAsText?: () => void; onDone: () => void; children?: React.ReactNode }) {
	return (
		<div className="flex shrink-0 items-center justify-between gap-2 border-t border-border pt-3">
			<div className="flex items-center gap-1">
				{onEditAsText ? (
					<Button type="button" variant="ghost" size="sm" onClick={onEditAsText}>
						Edit as text
					</Button>
				) : null}
				{children}
			</div>
			<Button type="button" size="sm" onClick={onDone}>
				Done
			</Button>
		</div>
	);
}
