import { ChevronDown } from 'lucide-react';
import * as React from 'react';
import { shortName } from '@/components/studio/ai/or-catalog.js';
import { readLedger } from '@/components/studio/ai/spend.js';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { agentTurnUsd, architectSpend, type ChatGrounding, useArchitectStatus } from './architect';
import { approxTokens, modelText, SUMMARY_MAX_TOKENS, shouldSuggestCompaction, splitForCompaction } from './chat-compact';
import { ModelList, useModelCatalog } from './ModelPicker';
import { assetChoices, onAssetUrlsChanged } from './media-urls';
import { type ReferenceDoc, refDocsTokens } from './reference-doc';
import type { ChatMessage, ChatUsage } from './studio-store';

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
// THE METRICS DROPDOWN. The session figure is no longer a bare number: it is the trigger of a
// second dropdown ("Chat metrics") that answers the three budget questions without a trip to
// Settings — what this session, this deck and today have cost, how full the model's context
// window is, and what the last reply cost. Everything in it was already arriving in each
// response's `usage` block or in the spend tally; none of it adds a request or a charge.
//
// THE CHIP. The header used to carry two unlabeled numbers ("≈ $0.018–0.024  $6.08 session")
// and no way to change the model without leaving the chat for Workspace → AI. It is now one
// chip naming the model with a dropdown, and one figure for the session. The per-turn range
// moved INTO the dropdown, where it has room to say which end is a question and which an
// edit — the dropdown is also where you are when the price should change your choice.

export function ChatCost({ source, grounding, docs, primed, explicitCache = true, deckId, messages, compact, className }: { source: string; grounding?: ChatGrounding; docs?: ReferenceDoc[] | null; primed?: boolean; explicitCache?: boolean; deckId?: string; messages?: ChatMessage[]; compact?: CompactControls; className?: string }) {
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
	// The Library adds its list and three tools to a turn, so a photo added or removed re-prices the readout.
	const [libraryCount, setLibraryCount] = React.useState(() => assetChoices().length);
	React.useEffect(() => {
		setLibraryCount(assetChoices().length);
		return onAssetUrlsChanged(() => setLibraryCount(assetChoices().length));
	}, []);
	// A question and an edit, priced from the measured shape of each (agentTurnUsd): an edit
	// takes a second model call and costs about half again as much, so one figure would
	// mislead about one of them. Memoized because building the prompt walks the catalog.
	// biome-ignore lint/correctness/useExhaustiveDependencies: `agentReady` is the intentional re-price trigger once the lazy agent module lands.
	const turnEst = React.useMemo(() => (cloud && status.price ? agentTurnUsd(status.price, grounding, !!primed, source, refDocsTokens(docs), libraryCount, explicitCache) : null), [cloud, grounding, primed, explicitCache, docs, source, status.price, agentReady, libraryCount]);
	const usd = (n: number) => `$${n.toFixed(n < 0.1 ? 3 : 2)}`;

	if (!cloud) return null;
	const last = lastUsage(messages);
	return (
		<span className={cn('flex min-w-0 items-center gap-2 font-sans text-[11px] normal-case tracking-normal', className)}>
			<ModelChip status={status} turnEst={turnEst} usd={usd} spend={spend} onRefresh={() => setPulse((p) => p + 1)} />
			<MetricsMenu spend={spend} deckId={deckId} last={last} usd={usd} messages={messages} price={status.price} compact={compact} />
		</span>
	);
}

/** What the metrics dropdown needs to offer compaction: run it, whether a turn or a compaction is already in flight, and undo (null when there is nothing to undo). */
export type CompactControls = { run: () => void; busy: boolean; undo: (() => void) | null };

/** The newest reply's usage in a thread, or null when none has been recorded (a thread saved before usage was kept). */
export function lastUsage(messages: ChatMessage[] | undefined): ChatUsage | null {
	for (let i = (messages?.length ?? 0) - 1; i >= 0; i--) {
		const u = messages?.[i]?.usage;
		if (messages?.[i]?.role === 'assistant' && u) return u;
	}
	return null;
}

/** 1234 -> "1.2K", 1_200_000 -> "1.2M". */
export function fmtTok(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
	if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}K`;
	return String(Math.round(n));
}

/** How full the window is, 0..1, or null when either number is unknown. */
export function contextFill(last: ChatUsage | null): number | null {
	if (!last?.window || !last.prompt) return null;
	return Math.min(1, last.prompt / last.window);
}

const level = (f: number | null) => (f == null ? 'ok' : f >= 0.9 ? 'over' : f >= 0.7 ? 'warn' : 'ok');
const levelColor = (l: string) => (l === 'over' ? 'text-[var(--fail,#b3261e)]' : l === 'warn' ? 'text-[var(--warn,#9a6a00)]' : 'text-foreground');
const levelBar = (l: string) => (l === 'over' ? 'bg-[var(--fail,#b3261e)]' : l === 'warn' ? 'bg-[var(--warn,#9a6a00)]' : 'bg-primary');

/** The session figure and the dropdown behind it. */
function MetricsMenu({ spend, deckId, last, usd, messages, price, compact }: { spend: Spend; deckId?: string; last: ChatUsage | null; usd: (n: number) => string; messages?: ChatMessage[]; price: { promptPerM: number | null; completionPerM: number | null } | null; compact?: CompactControls }) {
	const [open, setOpen] = React.useState(false);
	// Read when the menu opens and whenever a charge lands: the ledger is localStorage, not state.
	const [tick, setTick] = React.useState(0);
	React.useEffect(() => {
		const on = () => setTick((t) => t + 1);
		globalThis.addEventListener?.('lattice-spend-changed', on);
		return () => globalThis.removeEventListener?.('lattice-spend-changed', on);
	}, []);
	// biome-ignore lint/correctness/useExhaustiveDependencies: `tick` and `open` are the re-read triggers.
	const ledger = React.useMemo(() => readLedger(deckId ?? ''), [deckId, tick, open]);
	const sessionFmt = `$${spend.session.toFixed(2)}`;
	const over = spend.status.level === 'over';
	const warn = spend.status.level === 'warn';
	const fill = contextFill(last);
	const ctxLevel = level(fill);
	const pct = fill == null ? null : Math.round(fill * 100);
	const cachedPct = last?.prompt ? Math.min(100, Math.round((last.cached / last.prompt) * 100)) : null;
	// Compaction: what cutting the older messages would save each turn, and what the one summarizing call costs. Both are estimates
	// (4 characters a token), shown as such; the real cost is reported when it is done.
	const split = React.useMemo(() => (messages ? splitForCompaction(messages) : null), [messages]);
	const suggest = !!messages && shouldSuggestCompaction(messages, fill);
	const plan = React.useMemo(() => {
		if (!split) return null;
		const was = split.older.reduce((n, m) => n + approxTokens(modelText(m)), 0);
		const cost = price?.promptPerM != null && price.completionPerM != null ? (was / 1e6) * price.promptPerM + (SUMMARY_MAX_TOKENS / 1e6) * price.completionPerM : null;
		return { messages: split.older.length, saved: Math.max(0, was - 300), cost };
	}, [split, price]);
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					aria-label={`Chat metrics: ${sessionFmt} spent this session${pct != null ? `, context ${pct}% full` : ''}`}
					title={spend.cap > 0 ? `This session: ${sessionFmt} of your $${spend.cap.toFixed(2)} cap` : `This session: ${sessionFmt}`}
					className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1 py-0.5 text-muted-foreground hover:text-foreground data-[state=open]:text-foreground"
				>
					{fill != null && <ContextRing fill={fill} level={ctxLevel} />}
					<span className={cn('font-semibold', over ? 'text-[var(--fail,#b3261e)]' : warn ? 'text-[var(--warn,#9a6a00)]' : 'text-foreground')}>{sessionFmt}</span>
					{suggest && <span className="size-1.5 shrink-0 rounded-full bg-[var(--warn,#9a6a00)]" title="This conversation is long enough that compacting may pay off" />}
					<ChevronDown className="size-3 shrink-0" />
				</button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-[min(92vw,20rem)] p-3 text-[12px]" data-testid="chat-metrics">
				<div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Spend</div>
				<Row label="This session">
					<span className={cn('font-semibold', over ? 'text-[var(--fail,#b3261e)]' : warn ? 'text-[var(--warn,#9a6a00)]' : 'text-foreground')}>
						{usd(spend.session)}
						{spend.cap > 0 ? ` of $${spend.cap.toFixed(2)}` : ''}
					</span>
				</Row>
				{spend.cap > 0 && <Bar value={spend.session / spend.cap} tone={over ? 'over' : warn ? 'warn' : 'ok'} />}
				{deckId && (
					<Row label="This deck" hint={`last ${ledger.keepDays} days`}>
						<span className="font-semibold">{usd(ledger.deck)}</span>
					</Row>
				)}
				<Row label="Today" hint="every deck">
					<span className="font-semibold">{usd(ledger.today)}</span>
				</Row>
				<div className="mt-3 mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Context window</div>
				{last ? (
					<>
						<Row label="Used">
							<span className={cn('font-semibold', levelColor(ctxLevel))}>
								{last.estimated ? '≈ ' : ''}
								{fmtTok(last.prompt)}
								{last.window ? ` of ${fmtTok(last.window)}` : ''}
								{pct != null ? ` · ${pct}%` : ''}
							</span>
						</Row>
						{fill != null && <Bar value={fill} tone={ctxLevel} />}
						<Row label="Read from cache" hint="billed at a fraction of normal input">
							<span className="font-semibold">{cachedPct == null ? '—' : `${cachedPct}%`}</span>
						</Row>
						<div className="mt-3 mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Last reply</div>
						<Row label="Cost">
							<span className="font-semibold">{usd(last.cost)}</span>
						</Row>
						<Row label="Model calls">
							<span className="font-semibold">{last.rounds}</span>
						</Row>
						<Row label="Written">
							<span className="font-semibold">{fmtTok(last.completion)} tokens{last.reasoning ? ` (${fmtTok(last.reasoning)} thinking)` : ''}</span>
						</Row>
					</>
				) : (
					<p className="text-muted-foreground">Send a message and the window fills in here.</p>
				)}
				{compact && (
					<>
						<div className="mt-3 mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Conversation</div>
						{plan ? (
							<>
								{suggest && <p className="mb-1.5 rounded-md bg-[var(--accent-soft)] px-2 py-1.5 leading-snug">This conversation is getting long. Compacting would shrink what is re-sent every turn.</p>}
								<Row label="Would compact" hint="the older messages become a short briefing; the latest six stay word for word">
									<span className="font-semibold">{plan.messages} messages</span>
								</Row>
								<Row label="Saves about" hint="estimated from text length">
									<span className="font-semibold">{fmtTok(plan.saved)} tokens a turn</span>
								</Row>
								<Row label="Costs once" hint="one model call to write the briefing">
									<span className="font-semibold">{plan.cost == null ? '—' : `≈ ${usd(plan.cost)}`}</span>
								</Row>
							</>
						) : (
							<p className="text-muted-foreground">Too short to compact. It becomes useful once a thread has a dozen or so messages.</p>
						)}
						<div className="mt-2 flex gap-2">
							<button
								type="button"
								disabled={!plan || compact.busy}
								onClick={() => {
									compact.run();
									setOpen(false);
								}}
								className="rounded-md border border-border px-2 py-1 font-medium hover:border-[var(--accent)] disabled:pointer-events-none disabled:opacity-50"
							>
								{compact.busy ? 'Working…' : 'Compact conversation'}
							</button>
							{compact.undo && (
								<button type="button" onClick={compact.undo} className="rounded-md px-2 py-1 font-medium text-muted-foreground hover:text-foreground">
									Undo
								</button>
							)}
						</div>
					</>
				)}
				<p className="mt-3 text-[10.5px] leading-snug text-muted-foreground">Figures come from the usage OpenRouter reports with each reply. Reading them costs nothing.</p>
			</PopoverContent>
		</Popover>
	);
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
	return (
		<div className="flex items-baseline justify-between gap-3 py-0.5" title={hint}>
			<span className="text-muted-foreground">{label}</span>
			{children}
		</div>
	);
}

function Bar({ value, tone }: { value: number; tone: string }) {
	return (
		<span className="my-1 block h-[5px] overflow-hidden rounded-full bg-border" aria-hidden>
			<span className={cn('block h-full rounded-full', levelBar(tone))} style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />
		</span>
	);
}

/** A 12px ring that fills as the context window does. Shape from us, color from the token. */
function ContextRing({ fill, level: l }: { fill: number; level: string }) {
	const r = 5;
	const c = 2 * Math.PI * r;
	return (
		<svg viewBox="0 0 12 12" className={cn('size-3 shrink-0 -rotate-90', levelColor(l))} aria-hidden>
			<title>Context window fill</title>
			<circle cx="6" cy="6" r={r} fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
			<circle cx="6" cy="6" r={r} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray={`${(c * fill).toFixed(2)} ${c.toFixed(2)}`} />
		</svg>
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
