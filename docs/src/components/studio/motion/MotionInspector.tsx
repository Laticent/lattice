// THE SELECTED PART — how it arrives, and from where.
//
// Five controls, and every one maps to a verb that is PAINTED today (verified in
// `backends/svg-paint.ts` and `backends/drawable.ts`). Nothing here is a control that does not move
// something, which is why two obvious candidates are absent:
//
//  • `fill` — `compile.ts` computes `level` and NO backend reads it. A slider for it would be a lie.
//  • easing, per-part duration, a poster time — the frame model deleted all three as authored
//    surfaces. Motion is a finite ordered set of known frames; a beat is `k`.
//
// TWO GATES, and conflating them was a bug worth naming. DRAW needs an `SVGGeometryElement`, not
// merely a stroke: `createDrawable` stamps `pathLength="1000"` and normalized dash values on the
// node it is given, so on a `<g>` or `<text>` those values are inherited by children whose real
// lengths are in user units and the group FLASHES ON rather than drawing — without throwing, so
// nothing reports it. EMPHASIZE needs a stroke, because `highlight` scales stroke-width and nothing
// else, so on a fill-only shape it is inert.
//
// Both refusals are stated in words beside the disabled control, never by graying alone.

import { cn } from '@/lib/utils';
import { ROLE_LABEL } from './MotionParts';
import type { PartPlan, Role, SlideFrom } from './plan';
import type { IntakePart } from './svg-intake';

const ROLES: Role[] = ['draw', 'fade', 'slide', 'still'];
const FROMS: { value: SlideFrom; label: string }[] = [
	{ value: 'left', label: 'Left' },
	{ value: 'right', label: 'Right' },
	{ value: 'above', label: 'Above' },
	{ value: 'below', label: 'Below' },
];

export function MotionInspector({ part, plan, onChange }: { part: IntakePart; plan: PartPlan; onChange: (next: Partial<PartPlan>) => void }) {
	const drawReason = part.band || part.tag === 'g' ? 'groups cannot be drawn — a group flashes on instead. Split it to draw its shapes.' : part.tag === 'text' ? 'text cannot be drawn — it has no outline to trace.' : '';
	const emphasizeReason = part.strokeable ? '' : 'no outline to thicken — this shape is filled, not stroked.';

	return (
		<div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3">
			<div>
				<p className="truncate font-semibold text-[13px] text-[var(--text-heading)]">{part.label}</p>
				<p className="text-[11px] text-muted-foreground">
					{part.tag}
					{part.band ? ` · ${part.childCount} shapes` : ''}
					{part.strokeable ? ' · has an outline' : ' · filled, no outline'}
				</p>
			</div>

			<fieldset className="flex flex-col gap-1.5">
				<legend className="pb-1 font-mono text-[10.5px] uppercase tracking-widest text-muted-foreground">Arrives by</legend>
				<div className="grid grid-cols-2 gap-1.5">
					{ROLES.map((role) => {
						const blocked = role === 'draw' && !!drawReason;
						return (
							<button
								key={role}
								type="button"
								aria-pressed={plan.role === role}
								disabled={blocked}
								onClick={() => onChange({ role })}
								className={cn(
									'rounded-md border px-2 py-1 text-[12px] font-semibold',
									plan.role === role ? 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-[var(--accent)]' : 'border-border text-muted-foreground hover:border-[var(--text-muted)] hover:text-foreground',
									blocked && 'cursor-not-allowed opacity-50',
								)}
							>
								{ROLE_LABEL[role]}
							</button>
						);
					})}
				</div>
				{drawReason && <p className="text-[11px] leading-snug text-muted-foreground">Draws itself is unavailable: {drawReason}</p>}
			</fieldset>

			{plan.role === 'slide' && (
				<fieldset className="flex flex-col gap-1.5">
					<legend className="pb-1 font-mono text-[10.5px] uppercase tracking-widest text-muted-foreground">From</legend>
					<div className="grid grid-cols-4 gap-1.5">
						{FROMS.map((f) => (
							<button
								key={f.value}
								type="button"
								aria-pressed={plan.from === f.value}
								onClick={() => onChange({ from: f.value })}
								className={cn('rounded-md border px-1.5 py-1 text-[12px] font-medium', plan.from === f.value ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-border text-muted-foreground hover:text-foreground')}
							>
								{f.label}
							</button>
						))}
					</div>
				</fieldset>
			)}

			<div className="flex items-start justify-between gap-2">
				<label htmlFor={`emph-${part.pathRef}`} className="flex-1 text-[12px] text-[var(--text-heading)]">
					Emphasize
					{emphasizeReason && <span className="block text-[11px] leading-snug text-muted-foreground">Unavailable: {emphasizeReason}</span>}
				</label>
				<input
					id={`emph-${part.pathRef}`}
					type="checkbox"
					checked={plan.emphasize && part.strokeable}
					disabled={!part.strokeable}
					onChange={(e) => onChange({ emphasize: e.target.checked })}
					className="mt-0.5 size-4 shrink-0 accent-[var(--accent)] disabled:opacity-40"
				/>
			</div>

			<label className="flex items-center gap-2 text-[12px] text-muted-foreground">
				<span className="shrink-0">Beat</span>
				<input
					type="number"
					min={1}
					value={plan.beat}
					aria-label={`Beat for ${part.label}`}
					onChange={(e) => onChange({ beat: Math.max(1, Math.round(Number(e.target.value) || 1)) })}
					className="w-16 rounded border border-border bg-transparent px-1.5 py-0.5 text-right text-[12px] text-foreground outline-none focus:border-[var(--accent)]"
				/>
				<span className="text-[11px]">parts sharing a beat arrive together</span>
			</label>
		</div>
	);
}
