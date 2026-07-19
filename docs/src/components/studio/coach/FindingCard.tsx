import { AlertTriangle, Check, Info, OctagonAlert, Sparkles, X } from 'lucide-react';
import type * as React from 'react';
import { cn } from '@/lib/utils';
import { DiffCard } from '../ArchitectChat';
import type { Finding } from '../architect';

// The per-finding fix lifecycle, owned by StudioShell and rendered here. A finding is
// either untouched (no entry), being drafted ('working', the pill cycles through the
// steps in place — no toast), or has a reviewable proposal ('proposed', the pill splits
// into Apply / Discard and the diff shows below). Keyed by finding identity in the
// shell so an open fix SURVIVES a re-lint ("if I'm on Fix, I stay on Fix").
export type FindingFixState =
	| { phase: 'working'; step: string }
	| { phase: 'proposed'; slide?: number; proposedSlice?: string; before: string; after: string; edit: unknown };

const sevColor = (sev: string) => (sev === 'error' ? 'var(--fail,#b3261e)' : sev === 'warning' ? 'var(--chart-2,#9c3f00)' : 'var(--text-muted)');
const sevIcon = (sev: string) => (sev === 'error' ? OctagonAlert : sev === 'warning' ? AlertTriangle : Info);

/**
 * One deterministic finding, as a full-width card (mirroring the Lenses panel's card
 * rhythm — no bullet, fills the column). Three rows so nothing competes for one line:
 * (1) meta — severity glyph · scope · rule, the rule truncating before it wraps;
 * (2) the message, full width; (3) the action, on its own row. The AI-fix affordance is
 * a single pill that cycles through its own progress in place and then SPLITS into
 * Apply / Discard — the diff renders below for review (Apply/Discard live in the pill,
 * so DiffCard here is display-only).
 */
export function FindingCard({
	finding,
	state,
	canFix,
	costLabel,
	onFix,
	onApply,
	onDiscard,
}: {
	finding: Finding;
	state?: FindingFixState;
	canFix: boolean;
	costLabel: string;
	onFix: () => void;
	onApply: () => void;
	onDiscard: () => void;
}): React.ReactElement {
	const deckLevel = !finding.slide;
	const SevIcon = sevIcon(finding.severity);
	const working = state?.phase === 'working' ? state : null;
	const proposed = state?.phase === 'proposed' ? state : null;
	const active = !!(working || proposed);
	return (
		<li className={cn('rounded-lg border bg-background', active ? 'border-[var(--accent)]' : 'border-border')}>
			<div className="px-2.5 py-2">
				{/* Row 1 — meta. Single line: the rule truncates rather than wrapping under the glyph. */}
				<div className="flex items-center gap-1.5">
					<span className="shrink-0" style={{ color: sevColor(finding.severity) }}>
						<SevIcon className="size-3.5" />
					</span>
					<span className="shrink-0 text-[11px] font-semibold text-[var(--text-heading)]">{deckLevel ? 'Deck' : `Slide ${finding.slide}`}</span>
					<span className="min-w-0 flex-1 truncate font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground" title={finding.rule}>
						{finding.rule}
					</span>
				</div>
				{/* Row 2 — the message, full width. */}
				<p className="mt-1 text-[12px] leading-snug text-foreground">{finding.message}</p>
				{/* Row 3 — the action, its own row so the rule label never shares space with the pill. */}
				{canFix && (
					<div className="mt-2 flex flex-wrap items-center gap-1.5">
						{working ? (
							<span aria-live="polite" className="inline-flex items-center gap-1.5 rounded-full border border-[var(--accent)] bg-[var(--accent-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--accent)]">
								<Sparkles className="size-3 animate-pulse" />
								{working.step}
							</span>
						) : proposed ? (
							<>
								<button type="button" onClick={onApply} className="inline-flex items-center gap-1 rounded-full bg-[var(--accent)] px-2.5 py-1 text-[11px] font-semibold text-[var(--on-accent)]">
									<Check className="size-3" />
									Apply
								</button>
								<button type="button" onClick={onDiscard} className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
									<X className="size-3" />
									Discard
								</button>
							</>
						) : (
							<button type="button" onClick={onFix} className="inline-flex items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--accent)_22%,transparent)] bg-[var(--accent-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--accent)]">
								{costLabel}
							</button>
						)}
					</div>
				)}
			</div>
			{/* The proposed diff — display-only; Apply / Discard are the pills above. */}
			{proposed && (
				<div className="border-t border-border">
					<DiffCard before={proposed.before} after={proposed.after} />
				</div>
			)}
		</li>
	);
}
