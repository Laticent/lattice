// THE INTAKE RECEIPT — the screen this faculty exists for.
//
// Sanitizing is not a silent internal step here. Two of the commonest real exports come through the
// security boundary well-formed, still full of addressable ids, and painting NOTHING: an Illustrator
// "Style Elements" export loses the `<style>` that held every fill, and a `<symbol>` + `<use>` icon
// sheet loses the `<use>` that drew it. A faculty that handed back a blank stage without saying why
// would be indistinguishable from a broken one, and the user would blame the faculty.
//
// So intake diffs what it did and this reports it — each line naming the COST and the FIX.
//
// Severity is carried by the words REWRITTEN / REMOVED / KEPT AS-IS, never by color alone
// (WCAG 1.4.1).

import { ChevronDown } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';
import type { IntakeReceipt } from './svg-intake';

function Line({ children }: { children: React.ReactNode }) {
	return <li className="pl-3 -indent-3 text-[11.5px] leading-snug text-muted-foreground before:pr-1.5 before:text-[var(--text-muted)] before:content-['—']">{children}</li>;
}

export function MotionReceipt({ receipt, onReplace }: { receipt: IntakeReceipt; onReplace?: () => void }) {
	const [open, setOpen] = React.useState(true);
	const r = receipt;

	const rewritten: React.ReactNode[] = [];
	if (r.rewritten.usesExpanded) rewritten.push(<Line key="use">{r.rewritten.usesExpanded} reused symbol{r.rewritten.usesExpanded === 1 ? '' : 's'} expanded in place, so the drawing still paints.</Line>);
	if (r.rewritten.idsNamespaced) rewritten.push(<Line key="ns">{r.rewritten.idsNamespaced} name{r.rewritten.idsNamespaced === 1 ? '' : 's'} made unique, so two drawings on one deck cannot collide.</Line>);
	if (r.rewritten.duplicateIds) rewritten.push(<Line key="dup">{r.rewritten.duplicateIds} repeated name{r.rewritten.duplicateIds === 1 ? '' : 's'} separated — a repeat would have left one shape unreachable.</Line>);
	if (r.rewritten.bandsCreated) rewritten.push(<Line key="band">Grouped into {r.rewritten.bandsCreated} bands so the list stays readable. Open one to choreograph its shapes separately.</Line>);
	if (r.rewritten.viewBoxStamped) rewritten.push(<Line key="vb">Gave it a coordinate box, which it was missing.</Line>);

	const removed: React.ReactNode[] = [];
	if (r.removed.stylesheets) removed.push(<Line key="style">{r.removed.stylesheets} stylesheet — colors set by CSS classes are gone. Re-export with <strong className="text-[var(--text-heading)]">presentation attributes</strong> to keep them.</Line>);
	if (r.removed.images) removed.push(<Line key="img">{r.removed.images} embedded image — a motion asset carries vector only, and an image would have fetched from someone else's server in every copy of your deck.</Line>);
	if (r.removed.smil) removed.push(<Line key="smil">{r.removed.smil} built-in animation — this drawing's motion is the plan you write here.</Line>);
	if (r.removed.offOrigin) removed.push(<Line key="ext">{r.removed.offOrigin} link{r.removed.offOrigin === 1 ? '' : 's'} to another server — a drawing that loads from elsewhere would call that server from every copy of your deck.</Line>);
	if (r.removed.unresolvedUses) removed.push(<Line key="uu">{r.removed.unresolvedUses} reference{r.removed.unresolvedUses === 1 ? '' : 's'} to something outside the drawing.</Line>);
	if (r.removed.unsafe) removed.push(<Line key="unsafe">{r.removed.unsafe} unsafe node{r.removed.unsafe === 1 ? '' : 's'} (script or event handler).</Line>);

	const headline = `${r.parts} part${r.parts === 1 ? '' : 's'}${r.bands ? ` in ${r.bands} bands` : ''} · ${(r.artBytes / 1024).toFixed(1)} KB`;

	return (
		<section aria-label="What we did to your drawing" className="rounded-lg border border-border bg-card">
			<button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-2 px-2.5 py-2 text-left">
				<span className="font-mono text-[10.5px] uppercase tracking-widest text-muted-foreground">Intake</span>
				<span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-[var(--text-heading)]">{headline}</span>
				<ChevronDown className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
			</button>
			{open && (
				<div className="flex flex-col gap-2.5 border-t border-border px-2.5 py-2">
					{rewritten.length > 0 && (
						<div>
							<p className="pb-0.5 font-mono text-[10.5px] uppercase tracking-widest text-muted-foreground">Rewritten</p>
							<ul>{rewritten}</ul>
						</div>
					)}
					{removed.length > 0 && (
						<div>
							<p className="pb-0.5 font-mono text-[10.5px] uppercase tracking-widest text-muted-foreground">Removed</p>
							<ul>{removed}</ul>
						</div>
					)}
					{r.kept.fixedColors > 0 && (
						<div>
							<p className="pb-0.5 font-mono text-[10.5px] uppercase tracking-widest text-muted-foreground">Kept as-is</p>
							<ul>
								<Line>
									{r.kept.fixedColors} fixed color{r.kept.fixedColors === 1 ? '' : 's'} — this drawing will not recolor with the deck's theme. <strong className="text-[var(--text-heading)]">Match the theme</strong> rewrites them.
								</Line>
							</ul>
						</div>
					)}
					{r.notes.map((n) => (
						<p key={n} className="text-[11.5px] leading-snug text-muted-foreground">
							{n}
						</p>
					))}
					{onReplace && (
						<button type="button" onClick={onReplace} className="self-start rounded-md border border-border px-2 py-1 text-[12px] font-semibold text-muted-foreground hover:border-[var(--accent)] hover:text-[var(--accent)]">
							Replace the drawing
						</button>
					)}
				</div>
			)}
		</section>
	);
}
