// One labeled single-choice dropdown for the export panels: each row is a title and a one-line explanation,
// the closed control shows only the title. Pictures, Resolution and Fonts all use it, so the three read alike
// and each takes one row of the panel instead of a stack of cards.
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export type Choice<V extends string> = { value: V; title: string; blurb: string };

/** Radix Select cannot hold '' as an item value, so an empty choice travels as this sentinel. */
const NONE = '__none__';

export function ChoiceSelect<V extends string>({
	label,
	value,
	choices,
	onChange,
	disabled,
}: {
	label: string;
	value: V;
	choices: Choice<V>[];
	onChange: (v: V) => void;
	disabled?: boolean;
}) {
	const toItem = (v: string) => (v === '' ? NONE : v);
	const shown = choices.find((c) => c.value === value) ?? choices[0];
	return (
		<span className="mt-2 flex flex-col gap-1 text-[11.5px] text-muted-foreground">
			{label}
			<Select value={toItem(value)} disabled={disabled} onValueChange={(v) => onChange((v === NONE ? '' : v) as V)}>
				<SelectTrigger aria-label={label} className="h-auto w-full min-w-0 whitespace-normal py-1.5 text-left text-[12.5px] text-[var(--text-heading)]">
					<SelectValue>{shown.title}</SelectValue>
				</SelectTrigger>
				<SelectContent position="popper" className="max-w-[min(92vw,26rem)]">
					{choices.map((c) => (
						<SelectItem key={c.value} value={toItem(c.value)} className="items-start py-2">
							<span className="flex flex-col gap-0.5">
								<span className="text-[12.5px] font-semibold text-[var(--text-heading)]">{c.title}</span>
								<span className="whitespace-normal text-[11px] font-normal leading-snug text-muted-foreground">{c.blurb}</span>
							</span>
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<span className="text-[11px] leading-snug">{shown.blurb}</span>
		</span>
	);
}
