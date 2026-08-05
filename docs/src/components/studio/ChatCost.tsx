import * as React from 'react';
import { cn } from '@/lib/utils';
import { architectSpend, CHAT_OUTPUT_EST, type ChatGrounding, chatSystemTokens, estimateUsd, useArchitectStatus } from './architect';
import { type ReferenceDoc, refDocsTokens } from './reference-doc';

// The money readout: what this turn costs, and what the session has spent.
//
// It used to be a full-width strip of its own between the transcript and the composer —
// a whole row spent on two short numbers, in the panel where vertical space is scarcest.
// It now rides the PANEL HEADER, right-aligned opposite the title, which is otherwise
// dead space. Its own component because that header exists twice (the docked column in
// StudioShell and the mobile PanelSheet's `actions` slot) and one widget per surface is
// exactly what HARD RULE #15 forbids.
//
// Self-contained on purpose: it reads the spend gauge and the model status itself and
// re-reads on `lattice-spend-changed`, so a host can drop it into a header without
// threading any of that through. On the free on-device tier it renders NOTHING — no
// money UI at all, rather than a reassuring fake $0.

export function ChatCost({ source, grounding, docs, primed, className }: { source: string; grounding?: ChatGrounding; docs?: ReferenceDoc[] | null; primed?: boolean; className?: string }) {
	const [spend, setSpend] = React.useState(() => architectSpend());
	const [pulse, setPulse] = React.useState(0);
	const status = useArchitectStatus(pulse);
	React.useEffect(() => {
		const onSpend = () => {
			setSpend(architectSpend());
			setPulse((p) => p + 1);
		};
		globalThis.addEventListener?.('lattice-spend-changed', onSpend);
		return () => globalThis.removeEventListener?.('lattice-spend-changed', onSpend);
	}, []);

	const cloud = status.generation === 'openrouter';
	// Counts the SYSTEM turn, not just the deck — see chatSystemTokens. Memoized because
	// building the primer walks the whole component catalog.
	const promptExtra = React.useMemo(() => (cloud ? chatSystemTokens('openrouter', grounding, primed) + refDocsTokens(docs) : 0), [cloud, grounding, primed, docs]);
	const turnEst = React.useMemo(() => (cloud && status.price ? estimateUsd(source, status.price, CHAT_OUTPUT_EST, promptExtra) : null), [cloud, source, status.price, promptExtra]);

	if (!cloud) return null;
	return (
		<span className={cn('flex items-center gap-2 font-sans text-[10.5px] normal-case tracking-normal', className)}>
			{turnEst != null && (
				<span className="text-muted-foreground">
					≈ <span className="font-semibold text-foreground">${turnEst.toFixed(turnEst < 0.1 ? 3 : 2)}</span>/turn
				</span>
			)}
			{spend.cap > 0 && (
				<span className="h-[5px] w-10 overflow-hidden rounded-full bg-border" aria-hidden>
					<span
						className={cn('block h-full rounded-full', spend.status.level === 'over' ? 'bg-[var(--fail,#b3261e)]' : spend.status.level === 'warn' ? 'bg-[var(--warn,#9a6a00)]' : 'bg-primary')}
						style={{ width: `${Math.min(100, spend.cap ? (spend.session / spend.cap) * 100 : 0)}%` }}
					/>
				</span>
			)}
			<span className="text-muted-foreground">
				<span className="font-semibold text-foreground">${spend.session.toFixed(2)}</span>
				{spend.cap > 0 ? ` / $${spend.cap.toFixed(2)}` : ' session'}
			</span>
		</span>
	);
}
