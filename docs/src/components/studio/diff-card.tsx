import { Check, X } from 'lucide-react';
import * as React from 'react';
import { diffLines } from '@/components/studio/ai/architect-edits.js';
import { cn } from '@/lib/utils';
import type { DiffRow } from './architect';

// The before/after diff card, shared by the Chat and the Coach's per-finding fix. In its own
// module so the Coach, which loads with the Studio, does not pull the whole Chat panel in.
// Collapse long runs of unchanged context to keep a diff readable — keep CONTEXT lines
// around each change, replace the rest with a "⋯ N unchanged" marker.
function collapseContext(rows: DiffRow[], context = 2): (DiffRow | { type: 'gap'; text: string })[] {
	const keep = new Array(rows.length).fill(false);
	rows.forEach((r, i) => {
		if (r.type !== 'same') for (let j = Math.max(0, i - context); j <= Math.min(rows.length - 1, i + context); j++) keep[j] = true;
	});
	const out: (DiffRow | { type: 'gap'; text: string })[] = [];
	let run = 0;
	rows.forEach((r, i) => {
		if (keep[i]) {
			if (run > 0) {
				out.push({ type: 'gap', text: `⋯ ${run} unchanged line${run > 1 ? 's' : ''}` });
				run = 0;
			}
			out.push(r);
		} else {
			run++;
		}
	});
	if (run > 0) out.push({ type: 'gap', text: `⋯ ${run} unchanged line${run > 1 ? 's' : ''}` });
	return out;
}

// A compact line diff (real LCS from the engine — not a set-difference), context
// collapsed. Exported + reused by the Coach's per-finding fix, which passes before/after;
// the chat passes precomputed `rows` (the per-slide diff).
export function DiffCard({ before, after, rows, onApply, onDiscard }: { before?: string; after?: string; rows?: DiffRow[]; onApply?: () => void; onDiscard?: () => void }) {
	const diff = React.useMemo<DiffRow[]>(() => rows ?? (diffLines(before ?? '', after ?? '') as DiffRow[]), [before, after, rows]);
	const display = React.useMemo(() => collapseContext(diff), [diff]);
	return (
		<div className="overflow-hidden bg-background">
			<div className="max-h-[180px] overflow-auto px-2.5 py-1.5 font-mono text-[10.5px] leading-relaxed">
				{display.map((r, i) =>
					r.type === 'gap' ? (
						// biome-ignore lint/suspicious/noArrayIndexKey: static diff snapshot.
						<div key={i} className="select-none py-0.5 text-center text-[9.5px] uppercase tracking-wider text-muted-foreground">
							{r.text}
						</div>
					) : (
						// biome-ignore lint/suspicious/noArrayIndexKey: static diff snapshot.
						<div key={i} className={cn('whitespace-pre-wrap', r.type === 'add' ? 'text-[var(--pass)]' : r.type === 'del' ? 'text-[var(--fail,#b3261e)] line-through opacity-70' : 'text-muted-foreground')}>
							{r.type === 'add' ? '+ ' : r.type === 'del' ? '− ' : '  '}
							{r.text}
						</div>
					),
				)}
			</div>
			{(onApply || onDiscard) && (
				<div className="flex items-center gap-1.5 border-t border-border px-2 py-1.5">
					{onApply && (
						<button type="button" onClick={onApply} className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground">
							<Check className="size-3" />
							Apply
						</button>
					)}
					{onDiscard && (
						<button type="button" onClick={onDiscard} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-muted-foreground">
							<X className="size-3" />
							Discard
						</button>
					)}
				</div>
			)}
		</div>
	);
}
