// The Studio chat agent's wiring — the cloud-tier half of `chatComplete`.
//
// Its own module so the agent (the loop, the tools, the doc shelf, the prompt builders) is
// not startup JavaScript: `architect.ts` imports it on the first chat turn (route budget,
// studio eagerJsGz). The pure kernel is `architect-agent.ts`; this file binds it to the
// model, the spend gate and the Studio's prompt voice.
// See engineering/decisions/2026-10-05-studio-chat-agent.md.

// ONLY LAZY-ONLY MODULES ARE IMPORTED HERE. Vite writes every chunk a lazily imported
// module statically needs into the IMPORTER's preload map — and the importer is the eager
// `architect` chunk. Importing `architect.ts`, `front-matter` or the palettes from here put
// ~95 chunk names (the whole Studio) into startup JavaScript, ~2KB gz on a route already
// over its soft budget; importing them DYNAMICALLY instead made the bundler re-split shared
// chunks and cost more. So everything the startup code already holds is passed in through
// `init(deps)` by `architect.ts`, and only this feature's own modules are imported.
import { agentLibrary } from './agent-library';
import type { ArchitectModel, ChatGrounding, ChatOptions, ChatResult, ChatTurn, ProposedEdit } from './architect';
import { AGENT_TOOLS, type AgentComplete, type AgentComponent, type AgentRawEdit, bindKernel, buildAgentSystem, createToolbox, deckBrief, deckForTurn, describeEdit, type KernelDeps, runAgentLoop, type ToolCall } from './architect-agent';
import { FRONT_MATTER_KEYS } from './front-matter-keys';
import type { ContentPart, MsgContent, ReferenceDoc } from './reference-doc';

type Arch = typeof import('./architect');
type Spend = typeof import('@/components/studio/ai/spend.js');
type Core = typeof import('@/playground/authoring-core.generated.js');
type Ref = typeof import('./reference-doc');

/** What `architect.ts` hands over: everything the agent needs that startup code already loaded. */
export type ChatAgentDeps = KernelDeps &
	Pick<Spend, 'adjustSpend' | 'recordSpend'> &
	Pick<Core, 'deckCanon' | 'deckProfiles'> &
	Pick<Arch, 'applyEditsChecked' | 'CHAT_MAX_TOKENS' | 'cloudBudgetBlock' | 'estimateUsd' | 'estTokens' | 'FACT_GUARD' | 'TRUNCATION_NOTE' | 'withStudioVoice'> &
	Pick<Ref, 'groundMessages' | 'refDocsTokens'> & {
		FINISHES: typeof import('./finish-catalog')['FINISHES'];
		BUILTIN_PALETTES: typeof import('./palettes')['BUILTIN_PALETTES'];
		deckOutputLang: typeof import('./studio-language')['deckOutputLang'];
	};

let adjustSpend: Spend['adjustSpend'];
let recordSpend: Spend['recordSpend'];
let deckCanon: Core['deckCanon'];
let deckProfiles: Core['deckProfiles'];
let applyEditsChecked: Arch['applyEditsChecked'];
let CHAT_MAX_TOKENS: Arch['CHAT_MAX_TOKENS'];
let cloudBudgetBlock: Arch['cloudBudgetBlock'];
let estimateUsd: Arch['estimateUsd'];
let estTokens: Arch['estTokens'];
let FACT_GUARD: Arch['FACT_GUARD'];
let TRUNCATION_NOTE: Arch['TRUNCATION_NOTE'];
let withStudioVoice: Arch['withStudioVoice'];
let FINISHES: ChatAgentDeps['FINISHES'];
let BUILTIN_PALETTES: ChatAgentDeps['BUILTIN_PALETTES'];
let groundMessages: Ref['groundMessages'];
let refDocsTokens: Ref['refDocsTokens'];
let deckOutputLang: ChatAgentDeps['deckOutputLang'];

let ready: Promise<void> | null = null;
/** Bind the dependencies. `architect.ts` awaits this before any other use. */
export function init(d: ChatAgentDeps): Promise<void> {
	if (!ready) {
		bindKernel(d);
		({ adjustSpend, recordSpend, deckCanon, deckProfiles, applyEditsChecked, CHAT_MAX_TOKENS, cloudBudgetBlock, estimateUsd, estTokens, FACT_GUARD, TRUNCATION_NOTE, withStudioVoice, FINISHES, BUILTIN_PALETTES, groundMessages, refDocsTokens, deckOutputLang } = d);
		ready = Promise.resolve();
	}
	return ready;
}

// The agent's static system prompt, memoized on the catalog it indexes: the catalog
// arrives once per page (or once more when a local component is saved), and a byte-stable
// prefix is what lets the 1h cache breakpoint hit turn after turn.
let agentSystemMemo: { catalog: unknown[]; text: string } | null = null;
function agentSystem(catalog: unknown[]): string {
	if (agentSystemMemo?.catalog === catalog) return agentSystemMemo.text;
	const text = buildAgentSystem({
		canon: deckCanon.DECK_CANON,
		catalog: catalog as AgentComponent[],
		frontMatterKeys: FRONT_MATTER_KEYS,
		themes: [...BUILTIN_PALETTES],
		finishes: FINISHES.filter((f) => f.name !== 'none'),
	});
	agentSystemMemo = { catalog, text };
	return text;
}

/** The deck's per-slide word budget and the profile it comes from, read off the Coach's
 *  scorecard so the agent and the Coach hold the deck to the same bar. */
function agentBudget(grounding?: ChatGrounding): { slideWordBudget: number; profileLabel: string } {
	const prof = grounding?.scorecard?.profile as { key?: string; label?: string } | undefined;
	const rec = (deckProfiles.getProfile?.(prof?.key ?? 'general') ?? deckProfiles.PROFILES?.general) as { slideWords?: number; label?: string } | null;
	return { slideWordBudget: rec?.slideWords ?? 70, profileLabel: prof?.label ?? rec?.label ?? 'General' };
}

/** The agent's two system halves — exported so the cost readout prices the same prompt. */
export function agentSystemParts(source: string, grounding?: ChatGrounding, factGuard = ''): { staticPrefix: string; dynamicTail: string } {
	const budget = agentBudget(grounding);
	const brief = deckBrief(source, { ...budget, findings: grounding?.findings, diagrams: grounding?.diagrams });
	return { staticPrefix: agentSystem(grounding?.catalog ?? []), dynamicTail: `\n\n${brief}${factGuard}` };
}

export async function chatAgent(model: ArchitectModel, history: ChatTurn[], source: string, docs: ReferenceDoc[] | undefined, opts: ChatOptions | undefined): Promise<ChatResult | null> {
	const grounding = opts?.grounding;
	const last = history[history.length - 1];
	const { staticPrefix, dynamicTail } = agentSystemParts(source, grounding, opts?.constrainFacts ? FACT_GUARD : '');
	const systemContent = [
		{ type: 'text', text: staticPrefix },
		{ type: 'text', text: dynamicTail },
	] as ContentPart[];
	const ground = groundMessages(
		withStudioVoice(
			[{ role: 'system', content: systemContent }, ...history.slice(0, -1), { role: 'user', content: `${last?.content ?? ''}\n\n${deckForTurn(source)}` }],
			'openrouter',
			deckOutputLang(source),
		),
		docs,
		true,
	);
	const toolbox = createToolbox({
		source,
		catalog: (grounding?.catalog ?? []) as AgentComponent[],
		frontMatterKeys: FRONT_MATTER_KEYS,
		library: agentLibrary,
		check: grounding?.check,
		slideWordBudget: agentBudget(grounding).slideWordBudget,
	});
	const systemTokens = estTokens(staticPrefix) + estTokens(dynamicTail);
	const docTokens = refDocsTokens(docs);
	// Prose per FINISHED round, and the round in flight. Kept apart so a Stop charges an
	// estimate for the aborted round only — earlier rounds already reported their exact cost
	// through onUsage, and estimating over them double-charged (checker).
	const done: string[] = [];
	let streamed = '';
	let roundPrompt = '';
	let genId: string | null = null;
	// A request is in flight: set when a round is sent, cleared when it returns. A Stop
	// prices only an open round — a finished one already reported its exact cost.
	let roundOpen = false;
	let rounds = 0;
	let blockedNote: string | null = null;
	const soFar = () => [...done, streamed].map((t) => t.trim()).filter(Boolean).join('\n\n');
	const complete: AgentComplete = async (msgs, { tools, onToken }) => {
		// The budget gate prices EVERY round, not just the first: a tool round re-sends the
		// whole conversation so far, and a hard-stop cap has to hold across all of them.
		const convo = msgs
			.slice(1)
			.map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '')) + (m.tool_calls ? JSON.stringify(m.tool_calls) : ''))
			.join('\n');
		if (streamed.trim()) done.push(streamed);
		streamed = '';
		genId = null;
		roundPrompt = convo;
		const blk = cloudBudgetBlock(model, convo, systemTokens + docTokens, CHAT_MAX_TOKENS);
		if (blk) {
			blockedNote = blk;
			const e = new Error(blk);
			e.name = 'BudgetBlock';
			throw e;
		}
		let calls: ToolCall[] = [];
		let finish: string | null = null;
		roundOpen = true;
		const text = await model.complete({
			messages: msgs as { role: string; content: MsgContent }[],
			plugins: ground.plugins,
			fallback: '',
			cacheTtl: '1h',
			cacheTail: true,
			maxTokens: CHAT_MAX_TOKENS,
			tools: AGENT_TOOLS,
			toolChoice: tools ? 'auto' : 'none',
			onToolCalls: (c) => {
				calls = c;
			},
			onToken: (t: string) => {
				streamed += t;
				onToken(t);
			},
			onGenerationId: (id) => {
				genId = id;
			},
			onFinishReason: (r) => {
				finish = r;
			},
			signal: opts?.signal,
			onUsage: (u) => recordSpend(u?.cost ?? 0, u?.total_tokens ?? (u?.prompt_tokens || 0) + (u?.completion_tokens || 0)),
		});
		roundOpen = false;
		rounds++;
		return { text, toolCalls: calls.filter((c) => c?.function?.name), truncated: finish === 'length' };
	};
	let reply = '';
	const notes: string[] = [];
	try {
		const turn = await runAgentLoop({
			complete,
			messages: ground.messages as unknown as Parameters<typeof runAgentLoop>[0]['messages'],
			toolbox,
			onToken: opts?.onToken,
			onTool: (name) => opts?.onActivity?.(TOOL_ACTIVITY[name] ?? name),
			signal: opts?.signal,
		});
		reply = turn.reply;
		if (turn.truncated) notes.push(TRUNCATION_NOTE);
		if (turn.hitRoundCap) notes.push('I hit this turn’s limit on tool calls before finishing — ask me to continue.');
	} catch (e) {
		const name = (e as { name?: string })?.name;
		if (name === 'BudgetBlock') {
			// Blocked before anything was spent: say so the way the one-shot path does.
			if (!rounds) return { status: 'blocked', reply: blockedNote ?? 'Budget cap reached.' };
			reply = soFar();
			notes.push(blockedNote ?? 'Budget cap reached.');
		} else if (name === 'AbortError') {
			// Stop keeps what streamed AND what was staged — the author can still review it.
			// Same estimate-then-reconcile as the one-shot path (the usage chunk never came).
			reply = soFar();
			// Priced whenever a round was in flight, not only when prose streamed: a round that
			// streams only a tool call (a whole slide in `edit_slides`) streams no prose, and was
			// recorded as $0 with the exact-cost lookup skipped (checker). The estimate covers the
			// prompt plus the prose seen; the generation id, when it arrived, replaces it with the
			// exact figure.
			if (roundOpen && (streamed || genId)) {
				const est = estimateUsd(roundPrompt, model.openRouterModelPrice?.() ?? null, Math.ceil(streamed.length / 4), docTokens + systemTokens) ?? 0;
				if (est) recordSpend(est, Math.ceil(streamed.length / 4));
				if (genId && model.openRouterGenerationCost) {
					void model
						.openRouterGenerationCost(genId)
						.then((exact) => {
							if (exact == null || !Number.isFinite(exact)) return;
							adjustSpend(exact - est);
							try {
								globalThis.dispatchEvent?.(new Event('lattice-spend-changed'));
							} catch {
								/* no window */
							}
						})
						.catch(() => {});
				}
			}
		} else if (!rounds) {
			// Nothing answered. Fall back to the one-shot chat ONLY when the model refused the
			// tools themselves; any other failure (a bad key, no credits, a dead model, the
			// network) would fail the one-shot the same way, and that path reports every failure
			// as an empty reply. Say what happened instead.
			const msg = String((e as { message?: string })?.message ?? e ?? '');
			if (isToolRefusal(msg)) return null;
			return { status: 'blocked', reply: describeModelError(msg) };
		}
		else {
			// A failure after a finished round. A status from OpenRouter (a 429 between rounds
			// is the likeliest) gets its own cause and remedy; anything else is a dropped
			// connection, with the error's own words when it was not the network.
			reply = soFar();
			const msg = String((e as { message?: string })?.message ?? e ?? '');
			if (/OpenRouter error \d{3}/.test(msg)) notes.push(`This turn stopped partway. ${describeModelError(msg)}`);
			else if (!msg || /fetch|network|load failed/i.test(msg)) notes.push('The model connection dropped partway through this turn.');
			else notes.push(`This turn stopped partway with an error: ${msg.slice(0, 140)}`);
		}
	}
	return finalizeAgent(source, reply, toolbox.proposal(), toolbox.activity, notes);
}

/** What the transcript says while a tool runs. */
const TOOL_ACTIVITY: Record<string, string> = {
	read_component: 'Reading a component…',
	read_front_matter: 'Reading a front-matter key…',
	read_guide: 'Reading a guide…',
	read_slides: 'Reading slides…',
	edit_slides: 'Editing the draft…',
	set_front_matter: 'Setting front matter…',
	check_deck: 'Checking the deck…',
};

/** Fold an agent turn into the ChatResult the panel already renders: the prose, and the
 *  staged draft as one review card of per-slide edits against the ORIGINAL deck. */
export function finalizeAgent(source: string, reply: string, raw: AgentRawEdit[], activity: string[], notes: string[] = []): ChatResult {
	const withNotes = (body: string) => [body, ...notes].filter(Boolean).join('\n\n');
	if (!raw.length) return { status: 'ok', reply: withNotes(reply) || 'No reply came back — try again.', proposed: null, activity };
	const run = applyEditsChecked(source, raw);
	if (!run.applied) return { status: 'ok', reply: withNotes([reply, ...run.refusals].filter(Boolean).join('\n\n')) || 'Nothing in that turn could be applied.', proposed: null, activity };
	const edits: ProposedEdit[] = raw.map((e) => ({ ...describeEdit(source, e), slide: e.slide, action: e.action, raw: e }));
	return {
		status: 'ok',
		reply: withNotes([reply || `Proposed ${edits.length} edit${edits.length > 1 ? 's' : ''} — review and apply below.`, ...run.refusals].filter(Boolean).join('\n\n')),
		proposed: { edits, count: edits.length, source: run.source },
		activity,
	};
}

/** True when a failed request was refused for carrying tools — the one case the one-shot
 *  chat can still serve. OpenRouter answers 404 "No endpoints found that support tool use",
 *  or names a tool parameter it cannot route. */
export function isToolRefusal(message: string): boolean {
	// The status is anchored to the transport's prefix, and the refusal named by its own
	// words: a context-length 400 mentions "tool input" in its token breakdown, and matching
	// a bare "tool" sent it down the one-shot path, which overflowed too and said nothing.
	if (!/^OpenRouter error (400|404)\b/.test(message)) return false;
	if (/context length|maximum context|too many tokens/i.test(message)) return false;
	return /support tool|tool use|tool_choice|tool calling|requested parameters/i.test(message);
}

/** An author-facing sentence for a failed model request, from the transport's
 *  "OpenRouter error <status>: <detail>" message. */
export function describeModelError(message: string): string {
	const status = Number(/OpenRouter error (\d{3})/.exec(message)?.[1] ?? 0);
	const raw = /OpenRouter error \d{3}: ([\s\S]*)/.exec(message)?.[1] ?? '';
	// The body is usually JSON, `{"error":{"message":"…"}}`, sometimes cut short by the
	// transport; take the message when it parses, else the first quoted message, else the text.
	let detail = '';
	try {
		detail = String(JSON.parse(raw)?.error?.message ?? '');
	} catch {
		detail = /"message"\s*:\s*"([^"]*)/.exec(raw)?.[1] ?? raw;
	}
	detail = detail.replace(/\s+/g, ' ').trim().slice(0, 140);
	const tail = detail ? ` (OpenRouter said: ${detail})` : '';
	// OpenRouter also uses 403 for input a moderated model flagged — reconnecting does not help.
	if (status === 403 && /moderation|flagged/i.test(detail)) return `The selected model's moderation flagged this request — rephrase it, or pick another model in Workspace → AI.${tail}`;
	if (status === 401 || status === 403) return `OpenRouter rejected the connection — reconnect in Workspace → AI.${tail}`;
	if (status === 402) return `Your OpenRouter account is out of credits — add credits at openrouter.ai, or switch to On-device in Workspace → AI.${tail}`;
	if (status === 400 && /context length|maximum context|too many tokens/i.test(detail || raw)) return `The deck and its attachments are too long for this model — detach a reference document, or pick a model with a longer context in Workspace → AI.${tail}`;
	if (status === 404 || status === 400) return `The selected model could not take this request — pick another model in Workspace → AI.${tail}`;
	if (status === 429) return `OpenRouter is rate-limiting this key — wait a moment and send again.${tail}`;
	if (status >= 500) return `OpenRouter or the model's provider had an error — send again in a moment.${tail}`;
	if (/fetch|network|load failed/i.test(message)) return 'The request never reached OpenRouter — check the connection and send again.';
	return `The model request failed — send again.${message ? ` (${message.slice(0, 140)})` : ''}`;
}
