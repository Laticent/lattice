import { ChevronDown } from 'lucide-react';
import * as React from 'react';
import { shortName } from '@/components/studio/ai/or-catalog.js';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { agentTurnUsd, architectSpend, type ChatGrounding, useArchitectStatus } from './architect';
import { ModelList, useModelCatalog } from './ModelPicker';
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
//
// THE CHIP. The header used to carry two unlabeled numbers ("≈ $0.018–0.024  $6.08 session")
// and no way to change the model without leaving the chat for Workspace → AI. It is now one
// chip naming the model with a dropdown, and one figure for the session. The per-turn range
// moved INTO the dropdown, where it has room to say which end is a question and which an
// edit — the dropdown is also where you are when the price should change your choice.

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
	const sessionFmt = `$${spend.session.toFixed(2)}`;
	return (
		<span className={cn('flex min-w-0 items-center gap-2 font-sans text-[11px] normal-case tracking-normal', className)}>
			<ModelChip status={status} turnEst={turnEst} usd={usd} spend={spend} onRefresh={() => setPulse((p) => p + 1)} />
			<span className="shrink-0 whitespace-nowrap text-muted-foreground" title={spend.cap > 0 ? `This session: ${sessionFmt} of your $${spend.cap.toFixed(2)} cap` : `This session: ${sessionFmt}`}>
				<span className={cn('font-semibold', spend.status.level === 'over' ? 'text-[var(--fail,#b3261e)]' : spend.status.level === 'warn' ? 'text-[var(--warn,#9a6a00)]' : 'text-foreground')}>{sessionFmt}</span>
				<span className="sr-only"> spent this session</span>
			</span>
		</span>
	);
}

/** A model's name from its id alone — the catalog loads only when the dropdown first opens, and
 *  the chip is on screen before that. `~anthropic/claude-sonnet-latest` reads "Claude Sonnet
 *  (latest)", never the raw alias. */
export function readableModelId(id: string | null | undefined): string {
	if (!id) return 'Choose a model';
	const slug = id.replace(/^~/, '').split('/').pop() ?? id;
	const latest = /-latest$/.test(slug);
	const words = slug
		.replace(/-latest$/, '')
		.split(/[-_:]/)
		.filter(Boolean)
		.map((w) => (/^\d/.test(w) ? w : w[0].toUpperCase() + w.slice(1)));
	return `${words.join(' ')}${latest ? ' (latest)' : ''}`;
}

type Spend = ReturnType<typeof architectSpend>;
type TurnEst = { question: number; edit: number } | null;

/** The model's name with a dropdown: the cost of a turn on THIS model, the session against its
 *  cap, and the same picker the Workspace sheet has. The catalog loads when it first opens. */
function ModelChip({ status, turnEst, usd, spend, onRefresh }: { status: ReturnType<typeof useArchitectStatus>; turnEst: TurnEst; usd: (n: number) => string; spend: Spend; onRefresh: () => void }) {
	const [open, setOpen] = React.useState(false);
	const searchRef = React.useRef<HTMLInputElement>(null);
	const catalog = useModelCatalog(status, { enabled: open, onPicked: () => {
		setOpen(false);
		// The status (name, price) is read on demand, so a pick has to ask for a fresh one.
		onRefresh();
	} });
	// The model's price comes from the catalog, which loads when the dropdown first opens; the
	// status is read on demand, so ask for a fresh one once the catalog lands or the per-turn
	// figures above the list stay empty.
	const loaded = catalog.models !== null;
	// biome-ignore lint/correctness/useExhaustiveDependencies: `onRefresh` is a fresh closure each render; `loaded` is the trigger.
	React.useEffect(() => {
		if (loaded) onRefresh();
	}, [loaded]);
	const name = catalog.current ? shortName(catalog.current) : readableModelId(status.modelName ?? status.modelId);
	const over = spend.status.level === 'over';
	const warn = spend.status.level === 'warn';
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button type="button" aria-label={`Model: ${name}. Change model`} className="flex min-w-0 max-w-[10.5rem] items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-left hover:border-[var(--accent)] data-[state=open]:border-[var(--accent)]">
					<span className="truncate font-semibold text-foreground">{name}</span>
					<ChevronDown className="size-3 shrink-0 text-muted-foreground" />
				</button>
			</PopoverTrigger>
			<PopoverContent
				align="end"
				className="w-[min(92vw,22rem)] p-3"
				onOpenAutoFocus={(e) => {
					e.preventDefault();
					requestAnimationFrame(() => searchRef.current?.focus({ preventScroll: true }));
				}}
			>
				<div className="mb-3 flex flex-col gap-1.5 rounded-lg bg-[var(--accent-soft)] px-2.5 py-2 text-[12px]">
					{turnEst != null && (
						<>
							<div className="flex items-baseline justify-between gap-3">
								<span className="text-muted-foreground">Ask a question</span>
								<span className="font-semibold text-foreground">≈ {usd(turnEst.question)}</span>
							</div>
							<div className="flex items-baseline justify-between gap-3" title="An edit reads the layout first, then edits: a second model call.">
								<span className="text-muted-foreground">Make an edit</span>
								<span className="font-semibold text-foreground">≈ {usd(turnEst.edit)}</span>
							</div>
						</>
					)}
					<div className="flex items-baseline justify-between gap-3">
						<span className="text-muted-foreground">This session</span>
						<span className={cn('font-semibold', over ? 'text-[var(--fail,#b3261e)]' : warn ? 'text-[var(--warn,#9a6a00)]' : 'text-foreground')}>
							${spend.session.toFixed(2)}
							{spend.cap > 0 ? ` of $${spend.cap.toFixed(2)}` : ''}
						</span>
					</div>
					{spend.cap > 0 && (
						<span className="h-[5px] overflow-hidden rounded-full bg-border" aria-hidden>
							<span className={cn('block h-full rounded-full', over ? 'bg-[var(--fail,#b3261e)]' : warn ? 'bg-[var(--warn,#9a6a00)]' : 'bg-primary')} style={{ width: `${Math.min(100, (spend.session / spend.cap) * 100)}%` }} />
						</span>
					)}
					<span className="text-[10.5px] leading-snug text-muted-foreground">Estimates for the selected model; the spend tally records the exact cost.</span>
				</div>
				<ModelList catalog={catalog} searchRef={searchRef} maxHeight={260} />
			</PopoverContent>
		</Popover>
	);
}
