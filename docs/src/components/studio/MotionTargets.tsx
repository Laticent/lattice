import { AlertTriangle, Check, CircleSlash, EyeOff } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { activeMotionSpeed, activeMotionStyle } from './motion-catalog';
import { type MotionTarget, type Provenance, tally, type Verdict } from './motion-sheet';

// WHAT THIS DECK ACTUALLY ANIMATES — the deck Inspector's Motion tab, below Play/Style/Speed.
//
// The three controls above it state the deck's INTENT. This states the CONSEQUENCE: which slides
// the engine can actually animate, what each one resolves to, which scope decided it, and whether
// the motion carries information a still cannot.
//
// It lives in the Inspector rather than in Fabricate deliberately. Fabricate is for CRAFTING —
// each of its tabs brings a named, reusable asset into existence that did not exist before (a
// theme, a component, a finish). This is a property editor: it inspects and adjusts things the
// engine already draws, and adjusting a property is the Inspector's job. An earlier revision of
// this work put it in Fabricate as a fourth tab, which put controls where a workshop belongs.
//
// It writes only the Inspector's own vocabulary — the same `motion-on` / `motion-off` slide token
// through the same `setGroupToken` writer — so nothing here can drift from the cascade above it.

const VERDICT: Record<Verdict, { label: string; Icon: typeof Check; tone: string }> = {
	// Status never rides on color alone — each verdict carries its own silhouette and a word, so a
	// row survives total color loss (WCAG 1.4.1), the rule the shipped intent tags follow.
	carries: { label: 'Carries', Icon: Check, tone: 'text-[var(--pass)]' },
	review: { label: 'Review', Icon: AlertTriangle, tone: 'text-[var(--warn)]' },
	still: { label: 'Still', Icon: EyeOff, tone: 'text-muted-foreground' },
	'no-roles': { label: 'No roles', Icon: CircleSlash, tone: 'text-muted-foreground' },
	'no-painter': { label: 'Not yet', Icon: CircleSlash, tone: 'text-muted-foreground' },
};

/** Only an OVERRIDE is worth naming in a 300px rail. `built-in` is the value nobody chose, so
 *  spelling it out spends the widest string in the row on the least information. */
const overrideOf = (p: { play: Provenance; style: Provenance; speed: Provenance }): string => {
	const named = (['play', 'style', 'speed'] as const).filter((k) => p[k] === 'slide');
	return named.length ? `${named.join('/')} set on this slide` : '';
};

export function MotionTargets({
	targets,
	onGoToSlide,
	onTurnOff,
	onTurnOffAllFlagged,
}: {
	targets: MotionTarget[];
	onGoToSlide: (slide: number) => void;
	onTurnOff: (target: MotionTarget) => void;
	onTurnOffAllFlagged: () => void;
}) {
	const counts = tally(targets);

	if (!targets.length) {
		return (
			<div className="mt-3 rounded-lg border border-dashed border-border p-3">
				<p className="text-[12px] font-semibold text-[var(--text-heading)]">Nothing here can animate yet.</p>
				<p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
					Motion attaches to what the engine already draws — a chart or a diagram. Add one and it appears here.
				</p>
			</div>
		);
	}

	return (
		<div className="mt-3 border-t border-border pt-3">
			<p className="font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">What this animates</p>
			<p className="mt-1 text-[11px] leading-snug text-muted-foreground">
				{counts.total} target{counts.total === 1 ? '' : 's'} · {counts.on} will move
				{counts.blocked > 0 && ` · ${counts.blocked} the engine cannot reach`}
			</p>

			<ul className="mt-2 space-y-1.5">
				{targets.map((t) => {
					const v = VERDICT[t.verdict];
					const override = overrideOf(t.provenance);
					return (
						<li key={t.chunk} className={cn('rounded-md border bg-background p-2', t.verdict === 'review' ? 'border-[color-mix(in_srgb,var(--warn)_35%,var(--border))]' : 'border-border')}>
							<button
								type="button"
								onClick={() => onGoToSlide(t.slide)}
								className="flex w-full items-center gap-1.5 text-left"
								aria-label={`Go to slide ${t.slide}, ${t.title || t.component}`}
							>
								<span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">{t.slide}</span>
								<span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-[var(--text-heading)]">{t.title || t.component}</span>
								<span className={cn('inline-flex shrink-0 items-center gap-0.5 text-[10.5px] font-semibold', v.tone)}>
									<v.Icon className="size-3" aria-hidden />
									{v.label}
								</span>
							</button>
							{/* Wraps rather than truncates: in a 300px rail the provenance suffix is exactly
							    what clipped ("play set he…"), and provenance is the half a reader cannot get
							    from the controls above. Two short lines beat one clipped one. */}
							<p className="mt-0.5 font-mono text-[10.5px] leading-snug text-muted-foreground">
								{t.component}
								{t.play && ` · ${activeMotionStyle(t.style).label.toLowerCase()} · ${activeMotionSpeed(t.speed).label.toLowerCase()}`}
								{override && ` · ${override}`}
							</p>
							{t.note && (
								<p className="mt-1 text-[11px] leading-relaxed text-[var(--text-body)]">
									{t.note}
									{t.verdict === 'review' && (
										<button type="button" onClick={() => onTurnOff(t)} className="ml-1 font-semibold text-[var(--accent)] underline underline-offset-2">
											Turn it off
										</button>
									)}
								</p>
							)}
						</li>
					);
				})}
			</ul>

			{counts.review > 1 && (
				<Button variant="outline" size="sm" className="mt-2 w-full text-[12px]" onClick={onTurnOffAllFlagged}>
					Turn off the {counts.review} that carry nothing
				</Button>
			)}
		</div>
	);
}
