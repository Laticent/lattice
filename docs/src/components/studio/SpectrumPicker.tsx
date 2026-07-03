import { Check } from 'lucide-react';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { activeSpectrum, SPECTRA } from './spectrum-catalog';

// The Studio spectrum picker — the deck's white-label BRAND BAR (rainbow / none / solid
// accent), the sibling of the Mode (rendering) and Finish (backdrop) pickers. Applied by
// writing the `spectrum:` front-matter register; per-slide overrides use
// `_class: spectrum-off` / `spectrum-solid`. REUSE (#15): same DropdownMenu primitives +
// swatch grammar as the theme / mode / finish pickers.

function Swatch({ background, backgroundSize }: { background: string; backgroundSize?: string }) {
	return (
		<span
			className="size-4 shrink-0 rounded-[3px] border border-[color-mix(in_srgb,var(--text-heading)_18%,transparent)]"
			style={{ background, backgroundSize }}
		/>
	);
}

/** The spectrum list, rendered inside any `<DropdownMenuContent>`: rainbow / none / solid.
 *  `spectrum` is the active register value. */
export function SpectrumMenuItems({ spectrum, onPick }: { spectrum: string; onPick: (name: string) => void }) {
	const active = activeSpectrum(spectrum).name;
	return (
		<>
			{SPECTRA.map((s) => (
				<DropdownMenuItem key={s.name} onSelect={() => onPick(s.name)} className={cn('gap-2', s.name === active && 'font-semibold')} title={s.blurb}>
					<Swatch background={s.swatch.background} backgroundSize={s.swatch.backgroundSize} />
					<span className="truncate">{s.label}</span>
					{s.name === active && <Check className="ml-auto size-3.5 text-[var(--accent)]" />}
				</DropdownMenuItem>
			))}
		</>
	);
}

/** Label + swatch for the active spectrum (for a trigger button). */
export function activeSpectrumLabel(spectrum: string): { label: string; swatch: string; backgroundSize?: string } {
	const e = activeSpectrum(spectrum);
	return { label: e.label, swatch: e.swatch.background, backgroundSize: e.swatch.backgroundSize };
}
