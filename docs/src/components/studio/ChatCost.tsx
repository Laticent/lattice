import * as React from 'react';
import { cn } from '@/lib/utils';
import { agentTurnUsd, architectSpend, type ChatGrounding, useArchitectStatus } from './architect';
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
	// The cloud chat's prompt builders load on demand (architect.ts `loadChatAgent`); until
	// they land the readout prices an approximation, so re-price once they arrive.
	const [agentReady, setAgentReady] = React.useState(0);
	React.useEffect(() => {
		const on = () => setAgentReady((n) => n + 1);
		globalThis.addEventListener?.('lattice-chat-agent-ready', on);
		// Re-price once on subscribe too: the module may have landed between the first render
		// (which started the load) and this effect, and that event would be lost.
		on();
		return () => globalThis.removeEventListener?.('lattice-chat-agent-ready', on);
	}, []);
	// A question and an edit, priced from the measured shape of each (agentTurnUsd): an edit
	// takes a second model call and costs about half again as much, so one figure would
	// mislead about one of them. Memoized because building the prompt walks the catalog.
	// biome-ignore lint/correctness/useExhaustiveDependencies: `agentReady` is the intentional re-price trigger once the lazy agent module lands.
	const turnEst = React.useMemo(() => (cloud && status.price ? agentTurnUsd(status.price, grounding, !!primed, source, refDocsTokens(docs)) : null), [cloud, grounding, primed, docs, source, status.price, agentReady]);
	const usd = (n: number) => `$${n.toFixed(n < 0.1 ? 3 : 2)}`;

	if (!cloud) return null;
	return (
		<span className={cn('flex items-center gap-2 font-sans text-[10.5px] normal-case tracking-normal', className)}>
			{turnEst != null && (
				// A RANGE, question to edit, and no "/turn": the docked column is ~200px wide, and
				// "ask · edit" with two figures wrapped there while "/turn" pushed the session total
				// off the edge. The low end is a question, the high end an edit; the title and a
				// screen-reader line say so in words.
				<span
					className="whitespace-nowrap text-muted-foreground"
					title={`About ${usd(turnEst.question)} to ask a question (one model call), about ${usd(turnEst.edit)} for an edit (it reads the layout, then edits). Estimates; the spend tally records the exact cost.`}
				>
					≈ <span className="font-semibold text-foreground">{usd(turnEst.question)}–{usd(turnEst.edit).slice(1)}</span>
					<span className="sr-only"> per turn: the lower figure for a question, the higher for an edit</span>
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
