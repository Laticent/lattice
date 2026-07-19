// Theme Studio kernel (lib/theme/*, bundled): the model PROPOSES an essential set
// + a ramp strategy via askMessages; deriveTheme fans it into the full ~80-token
// contract (AA-repaired both modes); auditBoth confirms. The model never authors
// the derived tokens — so the delivered palette is always AA-clean.
import Fuse from 'fuse.js';
import * as React from 'react';
import { parseScene } from '@/lib/anima/schema';
import type { Scene } from '@/lib/anima/types';
import { AXES, MOTION_VERBS, PRIMITIVES, VERB_SOURCE } from '@/lib/anima/vocabulary';
import { applyEdit, diffLines, EDIT_PROTOCOL, numberSlides, parseEdits, sliceSlide } from '@/playground/architect-edits.js';
import { requestSlideFix } from '@/playground/architect-fix.js';
import { cosineRank } from '@/playground/architect-retrieval.js';
import { deckCanon } from '@/playground/authoring-core.generated.js';
import { buildRefinePrompt, cleanRewrite, REFINE_ACTIONS } from '@/playground/drawing-board-refine.js';
import { budgetStatus, readBudgetCap, readBudgetFloor, readBudgetMode, readDedupEnabled, readSpend, recordSpend } from '@/playground/drawing-board-settings.js';
import { askComponentMessages, auditComponentDesign, coerceComponent, gateComponent, rankSimilar } from '@/playground/layout-core.generated.js';
import { askMessages, auditBoth, coerceEssentials, deriveTheme, STARTERS } from '@/playground/theme-core.generated.js';
import { EDGE_TYPES, MARK_TYPES, PLACEMENTS, TEXTURE_TYPES, WASH_TYPES } from './finish-generate';
import { type GroundMsg, groundMessages, type MsgContent, type ReferenceDoc, refDocsTokens } from './reference-doc';
import { deckOutputLang, languageDirective } from './studio-language';
import { loadInstructions, loadOnDeviceInstructions, loadSettings } from './studio-store';

// Re-export so UI surfaces (Fabricate, the deck chat) import the doc type + reader
// from one place alongside the generate functions they feed it to.
export type { ReferenceDoc } from './reference-doc';
export { REF_DOC_ACCEPT, readReferenceDoc } from './reference-doc';

// Re-export the canonical refine action list (Polish / Formalize / Elaborate /
// Shorten) so the Studio's UI menu and the Drawing Board read from one source.
export { REFINE_ACTIONS };
export type RefineActionId = 'polish' | 'formalize' | 'elaborate' | 'shorten';

// Studio Architect — the HONEST AI layer. It wraps the production architect model
// (architect-model.js: OpenRouter cloud → in-browser tiers → deterministic floor)
// and the edit protocol (architect-edits.js). The contract is honesty:
//   - With a model CONNECTED, an action runs a real completion, parses the edit
//     blocks, and applies them to the source — a real, reviewable change.
//   - With NO model (the floor), it does NOT fake an edit; it reports `offline`
//     so the UI can point the author at Workspace → connect, instead of toasting
//     a change that never happened.

// The deck-editor system turn: persona + the full authoring canon (DECK_CANON, sourced
// from lib/authoring — the boardroom rules, budgets, and the reviewer's own traps, so the
// generator self-avoids what the review pass would flag) + the edit-block protocol. The
// canon subsumes the terse inline rules the prompt used to carry.
const SYSTEM =
	'You are the Lattice Architect, a boardroom deck editor.\n\n' +
	deckCanon.DECK_CANON +
	'\n\n' +
	EDIT_PROTOCOL;

// ── Studio voice ────────────────────────────────────────────────────────────
// The output language + the author's standing instructions, merged into the
// system turn of every DECK-CONTENT call (runArchitect / refineSelection /
// chatComplete / requestFindingFix). DELIBERATELY NOT applied to theme/component
// generation: that output is a structural contract (slugs, CSS, manifest keys,
// `_class` invokes) that must stay canonical English to pass the gates and resolve
// at render time. Read live, so a change takes effect on the next turn. The language
// is the deck's AI-OUTPUT language (`deckOutputLang`): its `ai-lang:` override, else
// its document `lang:`, else the workspace default — DISTINCT from the document
// language the exports stamp, so a translation lens can diverge them. Every deck-
// content path threads it: the source-bearing paths (runArchitect, chatComplete,
// requestFindingFix) resolve it from their own `source`; the fragment paths
// (refineSelection, generateDescription) receive it from their caller.
// See engineering/decisions/2026-07-14-language-settings.md.
//
// Standing instructions are CLOUD/ON-DEVICE separated (2026-07-09-studio-cloud-
// ondevice-config-split.md): a small on-device model gets its own, shorter field
// rather than a truncation of the cloud one. Language stays shared/generation-
// agnostic — it describes the OUTPUT, not the model that produced it.
type Msg = GroundMsg; // { role; content: string | ContentPart[] } — array content carries an inlined PDF

function studioVoice(generation: string, deckLang?: string): string {
	// `deckLang` is the deck's AI-OUTPUT language (deckOutputLang: ai-lang ?? lang),
	// resolved by the caller; empty → the deck inherits the workspace default
	// (studio-store). The document language the exports stamp is resolved separately.
	const parts = [languageDirective(deckLang || loadSettings().language)];
	const instr = (generation === 'openrouter' ? loadInstructions() : loadOnDeviceInstructions()).trim();
	if (instr) parts.push(`The author has given you STANDING INSTRUCTIONS — always honor these:\n${instr}`);
	return parts.filter(Boolean).join('\n\n');
}

/** Merge the Studio voice into a messages array's system turn (creating one if
 *  absent). Pure — returns a new array; the inputs are untouched. `generation`
 *  selects the cloud vs on-device standing-instructions store; defaults to
 *  'openrouter' so a caller that hasn't been threaded yet (or a test) keeps the
 *  prior cloud-field behavior unchanged. `deckLang` is the editing deck's `lang:`
 *  override (from its front matter); omitted → the workspace default applies. */
export function withStudioVoice(messages: Msg[], generation: string = 'openrouter', deckLang?: string): Msg[] {
	const extra = studioVoice(generation, deckLang);
	if (!extra) return messages;
	const out = messages.map((m) => ({ ...m }));
	const sys = out.find((m) => m.role === 'system');
	// The system turn is always plain text (we author it); the string guard keeps
	// TS honest now that a message's content may be content-parts (an inlined PDF).
	if (sys && typeof sys.content === 'string') sys.content = `${sys.content}\n\n${extra}`;
	else if (!sys) out.unshift({ role: 'system', content: extra });
	return out;
}

/** A model whose `complete` injects the Studio voice — for bridges that build
 *  their messages internally (e.g. requestSlideFix). `deckLang` threads the deck's
 *  `lang:` override through to the language directive. */
function voicedModel(model: ArchitectModel, generation: string, deckLang?: string): ArchitectModel {
	return { ...model, complete: (o) => model.complete({ ...o, messages: withStudioVoice(o.messages, generation, deckLang) }) };
}

type Usage = { cost?: number; total_tokens?: number; prompt_tokens?: number; completion_tokens?: number };

/** A catalog entry, the shape architect-model.js `listOpenRouterModels()` yields. */
export type ORModel = {
	id: string;
	name: string;
	promptPerM: number | null;
	completionPerM: number | null;
	contextLength: number | null;
	maxOutput: number | null;
	vision: boolean;
};

/** This key's readout from /auth/key — usage + (optional) per-key spend limit. */
export type ORAccount = {
	usage?: number | null;
	limit?: number | null;
	remaining?: number | null;
	usageMonthly?: number | null;
	limitReset?: string | null;
	isFreeTier?: boolean | null;
};

/** The account WALLET from /credits — real money: credits purchased, used, balance. */
export type ORCredits = { credits: number; usage: number; balance: number };

/** A per-million price pair for the active model (for the pre-send estimate). */
export type ORPrice = { promptPerM: number | null; completionPerM: number | null };

/** The generation-ladder availability flags `architect-model.js` reports. */
export type ModelAvailability = {
	generation: string;
	promptApi: string; // 'available' | 'downloadable' | 'downloading' | 'unavailable' | 'unknown'
	webgpu: boolean;
	webllmReady: boolean;
	universalReady: boolean;
	openRouterReady: boolean;
	modelOn: boolean;
};

/** Download progress for an on-device tier (0–1 fraction + a status line). */
export type TierProgress = { progress: number; text?: string; status?: string };

type ArchitectModel = {
	complete: (o: { messages: { role: string; content: MsgContent }[]; json?: boolean; fallback?: string; onUsage?: (u: Usage) => void; onToken?: (t: string) => void; signal?: AbortSignal; maxTokens?: number; plugins?: unknown[] }) => Promise<string>;
	// bge-small sentence embeddings (CDN, on-device) — null on Safari/mobile/no-CDN/model-off.
	embed?: (texts: string | string[]) => Promise<number[][] | null>;
	availability: () => ModelAvailability;
	refreshAvailability?: () => Promise<unknown>;
	beginOpenRouterAuth: (cb: string) => Promise<string | null>;
	resumeOpenRouterAuth: (code: string) => Promise<boolean>;
	hasPendingOpenRouterAuth: () => boolean;
	disconnectOpenRouter: () => void;
	openRouterAccount: () => Promise<ORAccount | null> | ORAccount | null;
	openRouterCredits: () => Promise<ORCredits | null> | ORCredits | null;
	openRouterKeySettingsUrl: () => string;
	openRouterModelPrice: () => ORPrice | null;
	openRouterModelName: () => string | null;
	// The catalog + selection the Workspace model picker drives.
	listOpenRouterModels: () => Promise<ORModel[]>;
	openRouterModel: () => string;
	setOpenRouterModel: (id: string) => void;
	// The on-device ladder the Workspace restores to its UI.
	setTier: (name: string) => void;
	summon: (onProgress?: (p: TierProgress) => void, signal?: AbortSignal) => Promise<boolean>;
	loadUniversal: (onProgress?: (p: TierProgress) => void, signal?: AbortSignal) => Promise<boolean>;
};

let modelPromise: Promise<ArchitectModel | null> | null = null;
/** The single shared architect model (lazy — backends touch window). */
export function architectModel(): Promise<ArchitectModel | null> {
	if (!modelPromise) {
		modelPromise = import('@/playground/architect-model.js')
			// explicitTierWins: a deliberate on-device pick outranks the connected cloud
			// (Studio Policy B — connection ≠ active; one tap resumes the cloud).
			// defaultModel: the cheap Haiku family's `~*-latest` ALIAS — OpenRouter resolves
			// it to the current version server-side, so it can't rot when a model is retired
			// (a pinned id 404s "No endpoints found"). The user upgrades deliberately.
			// defaultMaxTokens: a 4096-token output ceiling so a runaway reply can't blow the
			// budget. Both Studio-scoped (the Drawing Board keeps its own default + stays
			// uncapped), so no shared blast radius.
			.then((m) => m.createArchitectModel({ getSettings: () => ({}), explicitTierWins: true, defaultModel: '~anthropic/claude-haiku-latest', defaultMaxTokens: 4096 }) as ArchitectModel)
			.catch(() => null);
	}
	return modelPromise;
}

export type ArchitectOutcome =
	| { status: 'applied'; source: string; applied: number; note: string }
	| { status: 'advice'; note: string }
	| { status: 'offline' }
	| { status: 'blocked'; note: string };

/**
 * Run one architect instruction against the deck. Returns the edited source +
 * count when a connected model proposes edits, the model's advice when it only
 * advises, `offline` when no model is connected, or `blocked` when the user's
 * hard budget cap (mode: 'stop') is reached on the cloud tier — so the UI degrades
 * honestly and never spends real credit past the guardrail.
 */
export async function runArchitect(source: string, instruction: string, docs?: ReferenceDoc[]): Promise<ArchitectOutcome> {
	const model = await architectModel();
	if (!model) return { status: 'offline' };
	const generation = model.availability().generation;
	if (generation === 'floor') return { status: 'offline' };
	// Respect the budget on the paid cloud tier — blocks when over, and (hard-stop mode)
	// refuses a call whose estimate would breach the cap. Local tiers are free.
	if (generation === 'openrouter') {
		const blk = cloudBudgetBlock(model, `${instruction}\n${source}`, refDocsTokens(docs));
		if (blk) return { status: 'blocked', note: blk };
	}
	// Ground in the user's reference doc (#640) — e.g. "rewrite this in the style of
	// the attached deck". Applied after the Studio voice so the doc sits in the user turn.
	const ground = groundMessages(withStudioVoice([
		{ role: 'system', content: SYSTEM },
		{ role: 'user', content: `${instruction}\n\nThe deck — address slides by their [slide N] markers, and never include a marker in an edit body:\n\n${numberSlides(source)}` },
	], generation, deckOutputLang(source)), docs, generation === 'openrouter');
	let reply = '';
	try {
		reply = await model.complete({
			messages: ground.messages,
			plugins: ground.plugins,
			fallback: '',
			onUsage: (u) => recordSpend(u?.cost ?? 0, u?.total_tokens ?? (u?.prompt_tokens || 0) + (u?.completion_tokens || 0)),
		});
	} catch {
		return { status: 'offline' };
	}
	const { text, edits } = parseEdits(reply);
	if (!edits.length) return { status: 'advice', note: text || 'The model had no change to propose.' };
	// Apply highest slide first so earlier indices stay valid as the deck shifts.
	let next = source;
	for (const e of [...edits].sort((a, b) => b.slide - a.slide)) next = applyEdit(next, e);
	return { status: 'applied', source: next, applied: edits.length, note: text || `Applied ${edits.length} edit${edits.length > 1 ? 's' : ''}.` };
}

export type RefineOutcome =
	| { status: 'ok'; text: string }
	| { status: 'nochange' }
	| { status: 'offline' }
	| { status: 'blocked'; note: string };

/**
 * Refine a SELECTION of prose with the model (Polish / Formalize / Elaborate /
 * Shorten). Reuses the Drawing Board's pure refine kernel (`buildRefinePrompt` +
 * `cleanRewrite`) — the system brief forbids inventing facts or breaking markdown
 * and asks for ONLY the rewritten text back, so the result applies verbatim. The
 * model PROPOSES; the caller APPLIES it as one undoable editor transaction.
 * Honest like the rest: `offline` with no model, `blocked` at the budget cap,
 * `nochange` when the rewrite is empty or identical — never a fabricated edit.
 */
export async function refineSelection(action: RefineActionId, text: string, deckLang?: string): Promise<RefineOutcome> {
	if (!text.trim()) return { status: 'nochange' };
	const model = await architectModel();
	if (!model) return { status: 'offline' };
	const generation = model.availability().generation;
	if (generation === 'floor') return { status: 'offline' };
	if (generation === 'openrouter') {
		const blk = cloudBudgetBlock(model, text);
		if (blk) return { status: 'blocked', note: blk };
	}
	let out = '';
	try {
		out = await model.complete({
			// Pass the deck's `lang:` so a refine on a fragment keeps the deck's dialect
			// (a British-pinned deck stays British on shorten/rephrase) — not the caller's
			// selection but the DECK it belongs to; the caller threads it from `source`.
			messages: withStudioVoice(buildRefinePrompt(action, text), generation, deckLang),
			fallback: text,
			onUsage: (u) => recordSpend(u?.cost ?? 0, u?.total_tokens ?? (u?.prompt_tokens || 0) + (u?.completion_tokens || 0)),
		});
	} catch {
		return { status: 'offline' };
	}
	const next = cleanRewrite(out, text);
	if (!next || next === text) return { status: 'nochange' };
	return { status: 'ok', text: next };
}

// ── Accessible description: "Generate a text alternative" ──────────────────────
// Drafts the slide's WCAG SC 1.1.1 alternative for the author to REVIEW+CONFIRM
// (never auto-applied). Deliberately SLIDE-LOCAL — the prompt is fed only this
// slide's markdown, never the deck: a description must be an equivalent of THIS
// slide's pixels, and off-slide context is a conformance regression, not a bonus
// (opposite rule to a speaker note). The system prompt is the structure-first,
// no-hallucination contract. See 2026-07-04-accessible-descriptions.md.
const DESCRIBE_SYSTEM =
	'You write accessibility text alternatives (WCAG SC 1.1.1) for ONE presentation slide, ' +
	'for a person using a screen reader who cannot see it.\n' +
	'Rules:\n' +
	'- Describe ONLY what is on THIS slide. Never add outside context, background, or interpretation.\n' +
	'- Be objective and factual. State the numbers, labels, and structure exactly as shown; never invent or estimate a figure.\n' +
	'- For a chart or table, state the data it shows (values, categories, trend) as given — do not explain why.\n' +
	'- Plain language. One to three sentences. No "image of" / "slide showing" preamble.\n' +
	'- Output only the description text, nothing else.';

/** The (pure) message list for a slide-local description generation. Exported for testing. */
export function buildDescriptionPrompt(slideSource: string): Msg[] {
	return [
		{ role: 'system', content: DESCRIBE_SYSTEM },
		{ role: 'user', content: `Slide markdown:\n\n${String(slideSource).trim()}\n\nWrite the description.` },
	];
}

/**
 * Draft an accessibility description from a single slide's markdown. Honest like the
 * other bridges: `offline` with no cloud model (a description must be accurate, so
 * the tiny on-device tier is not trusted here), `blocked` at the budget cap,
 * `nochange` for empty input or an unusable reply — never a fabricated alt text.
 * The caller (the drawer) treats the result as an UNCONFIRMED draft: it is not
 * written to the slide until the author confirms or edits it.
 */
export async function generateDescription(slideSource: string, deckLang?: string): Promise<RefineOutcome> {
	if (!String(slideSource).trim()) return { status: 'nochange' };
	const model = await architectModel();
	if (!model) return { status: 'offline' };
	const generation = model.availability().generation;
	// Accuracy matters (a wrong alt is worse than none), so require the cloud tier —
	// the deterministic floor and tiny on-device model are not trusted to describe.
	if (generation !== 'openrouter') return { status: 'offline' };
	const blk = cloudBudgetBlock(model, slideSource);
	if (blk) return { status: 'blocked', note: blk };
	let out = '';
	try {
		out = await model.complete({
			// The alt-text is read in the deck's language, so describe in the deck's
			// `lang:` (threaded from the full deck source by the caller), not the default.
			messages: withStudioVoice(buildDescriptionPrompt(slideSource), generation, deckLang),
			fallback: '',
			onUsage: (u) => recordSpend(u?.cost ?? 0, u?.total_tokens ?? (u?.prompt_tokens || 0) + (u?.completion_tokens || 0)),
		});
	} catch {
		return { status: 'offline' };
	}
	const next = String(out).trim().replace(/^describe:\s*/i, '').replace(/\s+/g, ' ').trim();
	if (!next) return { status: 'nochange' };
	return { status: 'ok', text: next };
}

// ── Theme Studio: "Describe a look" ────────────────────────────────────────
// The shape auditBoth returns (lib/theme/contrast.js): an overall verdict plus a
// per-canvas breakdown the inspector renders.
export type ThemeAudit = {
	ok: boolean;
	light: { ok: boolean; failures: unknown[]; missing: unknown[] };
	dark: { ok: boolean; failures: unknown[]; missing: unknown[] };
};

export type ThemeEssentials = Record<string, string>;

export type ThemeGenOutcome =
	| {
			status: 'ok';
			essentials: ThemeEssentials;
			rampStrategy: string;
			tokens: Record<string, string>;
			audit: ThemeAudit;
			applied: string[];
			name: string; // model-suggested slug (editable; '' when none)
			description: string; // model-suggested caption (editable; '' when none)
	  }
	| { status: 'offline' }
	| { status: 'blocked'; note: string }
	| { status: 'nochange'; note: string };

/**
 * Generate (or refine) a full theme from a "describe a look" prompt. The model
 * PROPOSES the 10 essentials + a ramp strategy; the deterministic kernel derives
 * the full ~80-token contract and AA-repairs it in both canvas modes — so the
 * returned palette is finished and accessible, never a draft the user must fix.
 * `current` is threaded as context so a relative tweak ("cooler", "more navy")
 * has a baseline. Honest like the deck bridges: `offline` with no model,
 * `blocked` at the budget cap, `nochange` for an empty prompt or an unusable
 * reply — never a fabricated palette. The model never authors the derived tokens,
 * so a connected model that returns nonsense degrades to the fallback essentials,
 * still AA-clean.
 */
export async function generateTheme(current: ThemeEssentials, prompt: string, docs?: ReferenceDoc[]): Promise<ThemeGenOutcome> {
	if (!prompt.trim()) return { status: 'nochange', note: 'Describe a look to generate a theme.' };
	const model = await architectModel();
	if (!model) return { status: 'offline' };
	const generation = model.availability().generation;
	if (generation === 'floor') return { status: 'offline' };
	if (generation === 'openrouter') {
		const blk = cloudBudgetBlock(model, prompt, refDocsTokens(docs));
		if (blk) return { status: 'blocked', note: blk };
	}
	const fallback: ThemeEssentials = current && Object.keys(current).length ? current : (STARTERS[0].essentials as ThemeEssentials);
	// Ground in the user's reference doc (#640) — e.g. "match this brand guide".
	const ground = groundMessages(askMessages(fallback, prompt), docs, generation === 'openrouter');
	let reply = '';
	try {
		reply = await model.complete({
			messages: ground.messages,
			plugins: ground.plugins,
			fallback: '',
			onUsage: (u) => recordSpend(u?.cost ?? 0, u?.total_tokens ?? (u?.prompt_tokens || 0) + (u?.completion_tokens || 0)),
		});
	} catch {
		return { status: 'offline' };
	}
	const { essentials, rampStrategy, name, description, applied, ok } = coerceEssentials(reply, fallback);
	// A connected model that proposed nothing usable (e.g. the json:true floor
	// echoing the fallback) → no-op, never a fabricated change.
	if (!ok && applied.length === 0) return { status: 'nochange', note: 'The model returned no usable palette.' };
	const tokens = deriveTheme(essentials, { rampStrategy }) as Record<string, string>;
	const audit = auditBoth(tokens) as ThemeAudit;
	return { status: 'ok', essentials, rampStrategy, tokens, audit, applied, name, description };
}

// ── Finish faculty: "Describe a finish" ────────────────────────────────────
// The finish analog of generateTheme, same model-proposes / code-disposes shape:
// the model returns a STRUCTURED RECIPE (the four layers + params from the closed
// vocabulary), NOT raw CSS — so the deterministic generator (finish-generate.ts)
// makes the palette-blind, export-safe CSS and model text never reaches the
// same-origin preview frame (HARD RULE #22). Honest like the rest: `offline` with
// no model, `blocked` at the cap, `nochange` for an empty prompt or unusable reply.
export type FinishRecipeOut = {
	wash: { type: string; intensity: number };
	texture: { type: string; intensity: number; scale: number };
	mark: { type: string; placement: string };
	edge: { type: string; intensity: number };
};
export type FinishGenOutcome =
	| { status: 'ok'; recipe: FinishRecipeOut; name?: string }
	| { status: 'offline' }
	| { status: 'blocked'; note: string }
	| { status: 'nochange'; note: string };

// The closed vocabularies are pulled from finish-generate.ts's `as const` arrays — the
// SAME lists coerceRecipe validates against — so the model is always offered EXACTLY the
// shippable layer types, including the premium layers (wash `mesh`, texture `pinstripe`/
// `lattice`, edge `frame`) added in the Finish redesign. Hardcoding them here is how this
// prompt silently fell behind the engine; deriving them means it can't drift again.
const vocab = (a: readonly string[]) => a.join('|');
export const FINISH_SYSTEM = [
	'You design a SLIDE FINISH — a subtle, palette-blind backdrop composed of four stacked layers, behind boardroom content.',
	'Return ONLY a JSON object (no prose, no CSS) with this exact shape and ONLY values from these closed vocabularies:',
	'{',
	'  "name": "<short-kebab-name>",',
	`  "wash":    { "type": "${vocab(WASH_TYPES)}", "intensity": <3-20> },`,
	`  "texture": { "type": "${vocab(TEXTURE_TYPES)}", "intensity": <3-18>, "scale": <12-64> },`,
	`  "mark":    { "type": "${vocab(MARK_TYPES)}", "placement": "${vocab(PLACEMENTS)}" },`,
	`  "edge":    { "type": "${vocab(EDGE_TYPES)}", "intensity": <3-20> }`,
	'}',
	'Keep it RESTRAINED: low intensities (text must stay readable, no scrim). A finish is atmosphere, not decoration. Leave a layer "none" when it is not needed — most good finishes use one or two layers.',
].join('\n');

/**
 * Generate a finish RECIPE from a "describe a finish" prompt. The model proposes
 * the structured layer recipe; the caller coerces it to the vocabulary and the
 * deterministic generator turns it into CSS. The model NEVER authors CSS, so a
 * connected model that returns nonsense degrades to the coerced (still-renderable)
 * recipe — and no model text ever reaches the preview frame.
 */
export async function generateFinish(prompt: string): Promise<FinishGenOutcome> {
	if (!prompt.trim()) return { status: 'nochange', note: 'Describe a finish to generate one.' };
	const model = await architectModel();
	if (!model) return { status: 'offline' };
	const generation = model.availability().generation;
	if (generation === 'floor') return { status: 'offline' };
	if (generation === 'openrouter') {
		const blk = cloudBudgetBlock(model, prompt);
		if (blk) return { status: 'blocked', note: blk };
	}
	let reply = '';
	try {
		reply = await model.complete({
			messages: [
				{ role: 'system', content: FINISH_SYSTEM },
				{ role: 'user', content: `Design a finish for: ${prompt.trim()}` },
			],
			json: true,
			fallback: '',
			onUsage: (u) => recordSpend(u?.cost ?? 0, u?.total_tokens ?? (u?.prompt_tokens || 0) + (u?.completion_tokens || 0)),
		});
	} catch {
		return { status: 'offline' };
	}
	const parsed = parseFinishReply(reply);
	if (!parsed) return { status: 'nochange', note: 'The model returned no usable finish recipe.' };
	return { status: 'ok', recipe: parsed.recipe, name: parsed.name };
}

// Pull the first JSON object out of a (possibly fenced) reply and shape it into a
// recipe-ish object. Validation/clamping to the closed vocab is the CALLER's job
// (finish-generate's coerceRecipe) — here we only extract + lightly normalize.
// Exported for unit tests (the AI-recipe extraction contract: structured fields only,
// never a forwarded model string).
export function parseFinishReply(reply: string): { recipe: FinishRecipeOut; name?: string } | null {
	const text = String(reply || '').trim();
	if (!text) return null;
	const start = text.indexOf('{');
	const end = text.lastIndexOf('}');
	if (start < 0 || end <= start) return null;
	let obj: Record<string, unknown>;
	try {
		obj = JSON.parse(text.slice(start, end + 1));
	} catch {
		return null;
	}
	if (!obj || typeof obj !== 'object') return null;
	const layer = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
	const w = layer(obj.wash);
	const t = layer(obj.texture);
	const m = layer(obj.mark);
	const e = layer(obj.edge);
	const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
	const str = (v: unknown) => (typeof v === 'string' ? v : '');
	return {
		name: typeof obj.name === 'string' ? obj.name : undefined,
		recipe: {
			wash: { type: str(w.type), intensity: num(w.intensity) },
			texture: { type: str(t.type), intensity: num(t.intensity), scale: num(t.scale) },
			mark: { type: str(m.type), placement: str(m.placement) },
			edge: { type: str(e.type), intensity: num(e.intensity) },
		},
	};
}

// ── Motion faculty (Director mode): "Describe a motion scene" ──────────────
// The Anima analog of generateFinish, same model-proposes / deterministic-code-
// disposes shape (2026-07-18-anima-motion-faculty-modes.md §3.1): the model proposes
// a full Anima Scene as DATA (HARD RULE #22 — never code), and `parseScene` is the
// gate that disposes. A reply that doesn't validate degrades to 'nochange' (the last
// good scene stands) — no model text ever reaches the render frame.
export type SceneGenOutcome =
	| { status: 'ok'; scene: Scene }
	| { status: 'offline' }
	| { status: 'blocked'; note: string }
	| { status: 'nochange'; note: string };

// The built-scene motion verbs (spin/orbit/explode/reveal/sequence/fill) — svg-only
// verbs (draw/trace) are excluded from the prompt because Director authors built scenes.
const BUILT_VERBS = MOTION_VERBS.filter((v) => VERB_SOURCE[v] === 'built' || VERB_SOURCE[v] === 'both');

const SCENE_SYSTEM = [
	'You design an ANIMA SCENE — a small, serious 3D animation for a boardroom slide. The motion must CARRY INFORMATION (a mechanism, a relationship, a process a still cannot show), never decoration. Prefer ONE clear moving idea over many.',
	'Return ONLY a JSON object (no prose, no code, no markdown) matching this exact shape, using ONLY values from the closed vocabularies below:',
	'{',
	'  "source": "built",            // always "built" for you (3D primitives)',
	'  "duration": <ms 1500-8000>,   // total loop length; longer reads calmer',
	'  "hero": <0..1>,               // poster-frame fraction (the still baked into the PDF), usually 0.4-0.6',
	'  "elements": [ <Element>, ... ] // at least one; a nested TREE',
	'}',
	'Element: { "id": "<unique-kebab>", "shape": <primitive>, "color"?: "var(--token)", "props"?: {geometry}, "transform"?: {"at":[x,y,z],"rotate":[x,y,z-radians],"scale":n}, "motion"?: [<Motion>], "children"?: [<Element>...] }',
	`Primitives: ${PRIMITIVES.join(', ')}. A "group" draws nothing — it is a transform node; put shapes in its "children" (e.g. a rotor spinning inside a housing = a group carrying the spin, containing the parts).`,
	`Motion verbs: ${BUILT_VERBS.join(', ')}. spin/orbit take {"axis":"${AXES.join('|')}","period":<ms-per-turn, >=800 so a viewer can follow it>}. explode takes {"distance":<n>=0>}. fill takes {"to":<0..1>}. reveal/sequence/explode/fill also accept a window {"at":<0..1>,"span":<0..1>,"easing":"linear|ease-in|ease-out|ease-in-out"}.`,
	'Colors MUST be palette tokens — "var(--accent)", "var(--cat-2-mark)", "var(--text)", "var(--cat-1-mark)" — never hex or CSS names, so the scene recolors with the deck theme.',
	'Example (a rotor spinning inside a ring): {"source":"built","duration":3000,"hero":0.5,"elements":[{"id":"rig","shape":"group","motion":[{"verb":"spin","axis":"y","period":3000}],"children":[{"id":"ring","shape":"ellipse","color":"var(--cat-2-mark)","props":{"diameter":150,"stroke":10},"transform":{"rotate":[1.5708,0,0]}},{"id":"rotor","shape":"cone","color":"var(--accent)","props":{"diameter":74,"length":96}}]}]}',
].join('\n');

/**
 * Generate an Anima Scene from a "describe a motion scene" prompt. When `current` is
 * supplied, this is a REFINE: the model gets the current scene + the nudge and returns a
 * full updated scene. The reply is extracted + validated by `parseScene` (parseSceneReply);
 * a non-validating reply degrades to 'nochange'.
 */
export async function generateScene(prompt: string, current?: Scene): Promise<SceneGenOutcome> {
	if (!prompt.trim()) return { status: 'nochange', note: 'Describe a motion scene to generate one.' };
	const model = await architectModel();
	if (!model) return { status: 'offline' };
	const generation = model.availability().generation;
	if (generation === 'floor') return { status: 'offline' };
	if (generation === 'openrouter') {
		const blk = cloudBudgetBlock(model, prompt);
		if (blk) return { status: 'blocked', note: blk };
	}
	const messages: { role: string; content: string }[] = [{ role: 'system', content: SCENE_SYSTEM }];
	if (current) {
		messages.push({ role: 'user', content: `Current scene JSON:\n${JSON.stringify(current)}\n\nAdjust it — ${prompt.trim()} — and return the FULL updated scene JSON.` });
	} else {
		messages.push({ role: 'user', content: `Design a motion scene for: ${prompt.trim()}` });
	}
	let reply = '';
	try {
		reply = await model.complete({
			messages,
			json: true,
			fallback: '',
			onUsage: (u) => recordSpend(u?.cost ?? 0, u?.total_tokens ?? (u?.prompt_tokens || 0) + (u?.completion_tokens || 0)),
		});
	} catch {
		return { status: 'offline' };
	}
	const parsed = parseSceneReply(reply);
	if (!parsed.ok) return { status: 'nochange', note: parsed.note };
	return { status: 'ok', scene: parsed.scene };
}

// Validate a model reply as an Anima Scene. The model emits DATA only (HARD RULE #22) —
// `parseScene` is the gate; a bad reply is reported, never rendered. `complete({ json:true })`
// hands back an ALREADY-PARSED object (architect-model's extractJson), so accept an object
// directly; also tolerate a raw/fenced STRING (a json:false path, or a test feeding text) by
// slicing the first {…}. Exported for unit tests (the AI-scene extraction contract).
export function parseSceneReply(reply: unknown): { ok: true; scene: Scene } | { ok: false; note: string } {
	let obj: unknown;
	if (reply && typeof reply === 'object') {
		obj = reply; // json:true already parsed it
	} else {
		const text = String(reply || '').trim();
		const start = text.indexOf('{');
		const end = text.lastIndexOf('}');
		if (start < 0 || end <= start) return { ok: false, note: 'The model returned no scene.' };
		try {
			obj = JSON.parse(text.slice(start, end + 1));
		} catch {
			return { ok: false, note: 'The model’s reply was not valid JSON.' };
		}
	}
	const res = parseScene(obj);
	if (!res.ok) return { ok: false, note: `The scene didn’t validate: ${res.errors[0] ?? 'unknown error'}.` };
	return { ok: true, scene: res.scene };
}

// ── Component Studio: "Describe a component" ───────────────────────────────
// The component analog of generateTheme, mirroring the same model-proposes /
// deterministic-code-disposes shape (engineering/decisions/2026-06-29-ai-
// component-generation.md): dedup-first → model proposes {manifest, css,
// skeleton} grounded in the knowledge file → coerce + safe-fix → the gate
// disposes. The gate is the SAME one the Component tab runs live, so a draft the
// bridge returns and the editor re-checks always agree.
export type ComponentSimilar = { name: string; bucket: string; description: string; score: number };
export type ComponentFinding = { level: string; rule: string; line?: number; message: string };
export type ComponentDraft = {
	name: string;
	description: string;
	function: string;
	form: string;
	substance: string;
	bucket: string;
	tags: string[];
	adapt: { mode: string };
	capacity: { sweet?: number; soft?: number; hard?: number } | null;
	density: { axis: string; soft?: number; hard?: number } | null;
	css: string;
	skeleton: string;
};
export type ComponentGenOutcome =
	| { status: 'ok'; draft: ComponentDraft; findings: ComponentFinding[]; fixes: string[]; similar: ComponentSimilar[] }
	| { status: 'declined'; reason: string; route: string; suggestion: string; similar: ComponentSimilar[] }
	| { status: 'offline' }
	| { status: 'blocked'; note: string }
	| { status: 'nochange'; note: string };

type DedupCatalog = { name: string; bucket?: string; description?: string; purpose?: string; tags?: string[] }[];
// One docstring per component for the dedup signal — the TOP-LEVEL fields only
// (`name` recurs on slots; using it would skew the vector). §5.
const corpusText = (c: DedupCatalog[number]) => `${c.name} — ${c.description || ''} ${c.purpose || ''} ${(Array.isArray(c.tags) ? c.tags : []).join(' ')}`.trim();

/**
 * Dedup ranking (§5), best signal first: (1) bge-small EMBEDDINGS — embed the
 * request + each component's docstring and cosine-rank (the real semantic signal);
 * (2) the SHIPPED fuse.js lexical path when the embedder is unavailable
 * (Safari/mobile/no-CDN/model-off); (3) the pure `rankSimilar` token-overlap as a
 * final floor. Returns the top `limit` near neighbors. Never throws.
 */
async function dedupComponents(prompt: string, catalog: DedupCatalog, model: ArchitectModel, limit = 3): Promise<ComponentSimilar[]> {
	if (!prompt.trim() || !catalog.length) return [];
	const toSimilar = (c: DedupCatalog[number], score: number): ComponentSimilar => ({ name: c.name, bucket: c.bucket || '', description: c.description || '', score });
	// 1. Embeddings — the primary signal.
	try {
		if (model.embed) {
			const vecs = await model.embed([prompt, ...catalog.map(corpusText)]);
			if (vecs && vecs.length === catalog.length + 1) {
				const ranked = cosineRank(vecs[0], vecs.slice(1), { limit }) as { index: number; score: number }[];
				const hits = ranked.filter((r) => r.score > 0.35).map((r) => toSimilar(catalog[r.index], r.score));
				if (hits.length) return hits;
			}
		}
	} catch {
		/* embedder unavailable — fall through to lexical */
	}
	// 2. The shipped fuse.js lexical path.
	try {
		const fuse = new Fuse(catalog, { keys: ['name', 'description', 'tags'], threshold: 0.4, ignoreLocation: true });
		const hits = fuse.search(prompt, { limit }).map((r) => toSimilar(r.item, 1 - (r.score ?? 0)));
		if (hits.length) return hits;
	} catch {
		/* fall through to the pure floor */
	}
	// 3. Pure token-overlap floor (also the unit-tested path).
	return rankSimilar(prompt, catalog, { limit }) as ComponentSimilar[];
}

/**
 * Generate a local component from a "describe a component" prompt. The model
 * PROPOSES a manifest + scoped CSS + skeleton grounded in the knowledge file; the
 * deterministic gate disposes. `catalog` (the shipped + local component set) feeds
 * the dedup pass — near neighbors are surfaced so the user reuses rather than
 * duplicates, and threaded to the model as reuse hints. Honest like the deck
 * bridges: `offline` with no model, `blocked` at the budget cap, `declined` when
 * the request needs a transform (chart/diagram/code/non-`ul>li`) the CSS-only path
 * can't author, `nochange` for an empty prompt or an unusable reply. A returned
 * `ok` draft may still carry gate `findings` — they are SHOWN, never papered over.
 */
export async function generateComponent(
	prompt: string,
	catalog: { name: string; bucket?: string; description?: string; purpose?: string; tags?: string[] }[] = [],
	docs?: ReferenceDoc[],
): Promise<ComponentGenOutcome> {
	if (!prompt.trim()) return { status: 'nochange', note: 'Describe a component to generate one.' };
	const model = await architectModel();
	if (!model) return { status: 'offline' };
	const generation = model.availability().generation;
	if (generation === 'floor') return { status: 'offline' };
	if (generation === 'openrouter') {
		const blk = cloudBudgetBlock(model, prompt, refDocsTokens(docs));
		if (blk) return { status: 'blocked', note: blk };
	}
	// Dedup-first (§5/§8): unless the author turned it off, rank the request against
	// the catalog (embeddings → fuse → lexical), surface near neighbors, and hand
	// them to the model as reuse hints.
	const similar = readDedupEnabled() ? await dedupComponents(prompt, catalog, model) : [];
	// Ground in the user's reference doc (#640) — prepended to the user turn as
	// untrusted DATA; a PDF rides as an inlined file-part + the parser plugin.
	const ground = groundMessages(askComponentMessages(prompt, { similar }), docs, generation === 'openrouter');
	let reply = '';
	try {
		reply = await model.complete({
			messages: ground.messages,
			plugins: ground.plugins,
			json: true,
			fallback: '',
			onUsage: (u) => recordSpend(u?.cost ?? 0, u?.total_tokens ?? (u?.prompt_tokens || 0) + (u?.completion_tokens || 0)),
		});
	} catch {
		return { status: 'offline' };
	}
	const coerced = coerceComponent(reply) as {
		ok: boolean;
		decline: { reason: string; route: string; suggestion: string } | null;
		manifest: Omit<ComponentDraft, 'css' | 'skeleton'> | null;
		css: string;
		skeleton: string;
		fixes: string[];
	};
	if (coerced.decline) {
		return { status: 'declined', reason: coerced.decline.reason, route: coerced.decline.route, suggestion: coerced.decline.suggestion, similar };
	}
	if (!coerced.ok || !coerced.manifest) {
		return { status: 'nochange', note: 'The model returned no usable component.' };
	}
	const m = coerced.manifest;
	const gate = gateComponent({ css: coerced.css, manifest: { ...m, skeleton: coerced.skeleton } }) as { ok: boolean; errors: ComponentFinding[] };
	// The native-ness design audit (§6) — adapt/capacity coherence + the data: URI
	// size cap — beyond the structural gate. Advisory + hard findings, both shown.
	const design = auditComponentDesign(m, coerced.css) as ComponentFinding[];
	const md = m as typeof m & {
		adapt: { mode: string };
		capacity: { sweet?: number; soft?: number; hard?: number } | null;
		density: { axis: string; soft?: number; hard?: number } | null;
	};
	const draft: ComponentDraft = {
		name: m.name, description: m.description, function: m.function, form: m.form,
		substance: m.substance, bucket: m.bucket, tags: m.tags, adapt: md.adapt, capacity: md.capacity, density: md.density,
		css: coerced.css, skeleton: coerced.skeleton,
	};
	return { status: 'ok', draft, findings: [...(gate.errors ?? []), ...design], fixes: coerced.fixes, similar };
}

// A deterministic lint finding (the shape lint-core's `lintTextWith` returns) — a
// per-slide issue the Coach panel can offer to fix with AI.
export type Finding = { slide: number; rule: string; severity: string; message: string; fix?: string; autofixable?: boolean; line?: string };

export type FixOutcome =
	| { status: 'ok'; before: string; after: string; edit: unknown }
	| { status: 'nochange' }
	| { status: 'offline' }
	| { status: 'blocked'; note: string };

/**
 * Ask the model to rewrite the ONE slide a finding flags, for review. Reuses the
 * Drawing Board's `requestSlideFix` (the same edit-block protocol + canon grounding
 * the Coach card uses there): the model PROPOSES a `{ before, after, edit }` the UI
 * renders as a diff; nothing is applied until the author clicks Apply. Honest like
 * the rest — `offline` with no model, `blocked` at the cap, `nochange` when nothing
 * usable comes back. `catalog` is the component dossier (the Studio's `components`
 * prop) so the rewrite respects each layout's authoring contract.
 */
export async function requestFindingFix(source: string, finding: Finding, catalog: unknown[]): Promise<FixOutcome> {
	const model = await architectModel();
	if (!model) return { status: 'offline' };
	const generation = model.availability().generation;
	if (generation === 'floor') return { status: 'offline' };
	if (generation === 'openrouter') {
		const blk = cloudBudgetBlock(model, source);
		if (blk) return { status: 'blocked', note: blk };
	}
	try {
		const res = await requestSlideFix({
			model: voicedModel(model, generation, deckOutputLang(source)),
			gate: { cache: () => generation === 'openrouter', onUsage: (u: Usage) => recordSpend(u?.cost ?? 0, u?.total_tokens ?? (u?.prompt_tokens || 0) + (u?.completion_tokens || 0)) },
			source,
			finding,
			catalog,
		});
		if (!res) return { status: 'nochange' };
		return { status: 'ok', before: res.before, after: res.after, edit: res.edit };
	} catch {
		return { status: 'offline' };
	}
}

/** Apply a proposed edit block (from `requestFindingFix`) to the deck source. */
export function applyDeckEdit(source: string, edit: unknown): string {
	return applyEdit(source, edit);
}

export type ChatTurn = { role: 'user' | 'assistant'; content: string };
export type DiffRow = { type: 'same' | 'add' | 'del'; text: string };
/** One proposed edit, carried so the UI can RE-APPLY it against the CURRENT deck at
 *  Apply-time (not overwrite the whole deck with a stale snapshot) and show a real
 *  per-slide diff. `raw` is the parsed edit block re-fed to applyEdit; `before` is the
 *  target slide's content AT PROPOSE TIME, so the UI can detect a slide that changed
 *  under it and force a re-review. */
export type ProposedEdit = {
	label: string;
	slide: number;
	action: 'replace' | 'insert' | 'delete';
	raw: { action: string; slide: number; body: string };
	before: string;
	after: string;
	diff: DiffRow[];
};
export type ChatResult =
	| { status: 'ok'; reply: string; proposed: { edits: ProposedEdit[]; count: number; source: string } | null }
	| { status: 'offline' }
	| { status: 'blocked'; reply: string };

/**
 * One turn of the Architect chat. Runs the conversation through the connected
 * model with the deck in context; if the reply proposes edit blocks, returns the
 * resulting source + a line diff for a review-then-apply card (nothing is applied
 * here). Degrades to `offline`/`blocked` honestly — never a fabricated answer.
 */
export async function chatComplete(history: ChatTurn[], source: string, docs?: ReferenceDoc[], opts?: { onToken?: (t: string) => void; signal?: AbortSignal }): Promise<ChatResult> {
	const model = await architectModel();
	if (!model) return { status: 'offline' };
	const generation = model.availability().generation;
	if (generation === 'floor') return { status: 'offline' };
	const last = history[history.length - 1];
	if (generation === 'openrouter') {
		const blk = cloudBudgetBlock(model, `${last?.content ?? ''}\n${source}`, refDocsTokens(docs));
		if (blk) return { status: 'blocked', reply: blk };
	}
	// Ground the final user turn in the reference doc (#640).
	const ground = groundMessages(withStudioVoice([
		{ role: 'system', content: `${SYSTEM}\n\nConverse with the author. Answer questions directly. Only emit edit blocks when they actually want a change to the deck.` },
		...history.slice(0, -1),
		{ role: 'user', content: `${last?.content ?? ''}\n\nThe current deck — address slides by their [slide N] markers, never include a marker in an edit body:\n\n${numberSlides(source)}` },
	], generation, deckOutputLang(source)), docs, generation === 'openrouter');
	let reply = '';
	// A local copy of the streamed text so an explicit Stop keeps the partial reply
	// (model.complete throws on abort before returning, so its return value is lost).
	let streamed = '';
	try {
		reply = await model.complete({
			messages: ground.messages,
			plugins: ground.plugins,
			fallback: '',
			// Streaming: tokens are painted live by the caller. All tiers that emit a chat
			// reply stream (OpenRouter SSE, Prompt API, WebLLM, Transformers); floor never
			// reaches here (offline above). Only an explicit Stop aborts (signal).
			onToken: (t: string) => {
				streamed += t;
				opts?.onToken?.(t);
			},
			signal: opts?.signal,
			onUsage: (u) => recordSpend(u?.cost ?? 0, u?.total_tokens ?? (u?.prompt_tokens || 0) + (u?.completion_tokens || 0)),
		});
	} catch (e) {
		// An explicit abort (Stop) is not a failure — keep whatever streamed so far. The
		// usage chunk never arrived, so recordSpend didn't fire; charge an ESTIMATE of the
		// aborted turn (prompt + streamed tokens) so the budget gauge/cap aren't blind to
		// real spend (exact cost would need a /generation fetch — a follow-up).
		if ((e as { name?: string })?.name === 'AbortError') {
			if (generation === 'openrouter' && streamed) {
				const est = estimateUsd(`${last?.content ?? ''}\n${source}`, model.openRouterModelPrice?.() ?? null, Math.ceil(streamed.length / 4), refDocsTokens(docs));
				if (est) recordSpend(est, Math.ceil(streamed.length / 4));
			}
			return finalizeChat(streamed || reply, source);
		}
		return { status: 'offline' };
	}
	return finalizeChat(reply, source);
}

// Parse a (possibly partial) reply into prose + a set of reviewable, RE-APPLIABLE
// edits. Each edit carries its parsed block (`raw`, re-fed to applyEdit against the
// CURRENT deck at Apply-time — never a stale whole-deck snapshot) and its propose-time
// before/after + diff for the review card.
function finalizeChat(reply: string, source: string): ChatResult {
	const { text, edits } = parseEdits(reply);
	if (!edits.length) return { status: 'ok', reply: text || 'No change suggested.', proposed: null };
	// The propose-time full result, kept only as a fallback; the UI re-applies `raw`.
	let next = source;
	for (const e of [...edits].sort((a, b) => b.slide - a.slide)) next = applyEdit(next, e);
	const proposedEdits: ProposedEdit[] = edits.map((e: { action: string; slide: number; body: string }) => {
		const before = e.action === 'insert' ? '' : sliceSlide(source, e.slide);
		const after = e.action === 'delete' ? '' : String(e.body || '').trim();
		const label = e.action === 'insert' ? `Insert after slide ${e.slide}` : e.action === 'delete' ? `Delete slide ${e.slide}` : `Slide ${e.slide}`;
		return { label, slide: e.slide, action: e.action as ProposedEdit['action'], raw: e, before, after, diff: diffLines(before, after) as DiffRow[] };
	});
	const count = proposedEdits.length;
	return {
		status: 'ok',
		reply: text || `Proposed ${count} edit${count > 1 ? 's' : ''} — review and apply below.`,
		proposed: { edits: proposedEdits, count, source: next },
	};
}

/** Re-apply a set of proposed edit blocks against the CURRENT deck (slide-descending so
 *  earlier indices stay valid), so intervening edits to OTHER slides are preserved. */
export function applyProposedEdits(source: string, edits: { raw: { action: string; slide: number; body: string } }[]): string {
	let next = source;
	for (const e of [...edits].sort((a, b) => b.raw.slide - a.raw.slide)) next = applyEdit(next, e.raw);
	return next;
}

/** True when the target slide's CURRENT content no longer matches what a replace/delete
 *  edit was diffed against — the UI uses this to force a re-review instead of clobbering
 *  an edit the author made to that slide after the proposal arrived (K1 stale guard). */
export function isProposedEditStale(source: string, edit: ProposedEdit): boolean {
	if (edit.action === 'insert') return false;
	return sliceSlide(source, edit.slide).trim() !== edit.before.trim();
}

// The latest fetched spend context (wallet + key acct), cached from useArchitectStatus
// so the SYNC architectSpend()/gate can watch the REAL balance, not just the self-cap.
let _wallet: ORCredits | null = null;
let _keyAcct: ORAccount | null = null;
function rememberSpendContext(wallet: ORCredits | null, keyAcct: ORAccount | null): void {
	_wallet = wallet;
	_keyAcct = keyAcct;
}

// The binding remaining-balance the gauge should watch: the tightest of the account
// wallet balance and (if set) this key's remaining limit. null when neither is known.
function bindingAccount(): { remaining: number; limit: number | null } | null {
	const c: { remaining: number; limit: number | null }[] = [];
	if (_wallet && Number.isFinite(_wallet.balance)) c.push({ remaining: _wallet.balance, limit: _wallet.credits ?? null });
	if (_keyAcct && _keyAcct.remaining != null) c.push({ remaining: _keyAcct.remaining, limit: _keyAcct.limit ?? null });
	return c.length ? c.reduce((a, b) => (b.remaining < a.remaining ? b : a)) : null;
}

/** Real session spend + the budget gauge — now watching the binding real balance, not just the self-cap. */
export function architectSpend() {
	try {
		const s = readSpend();
		const cap = readBudgetCap();
		const mode = readBudgetMode();
		const floor = readBudgetFloor();
		const account = bindingAccount();
		return { ...s, cap, mode, floor, wallet: _wallet, account, status: budgetStatus({ sessionSpend: s.session, cap, mode, account, floor }) };
	} catch {
		return { total: 0, session: 0, totalTokens: 0, sessionTokens: 0, cap: 0, mode: 'alert' as const, floor: 0, wallet: null, account: null, status: { level: 'ok', blocked: false, message: null } };
	}
}

/** The account wallet (credits / usage / balance), fetched live. */
export async function architectCredits(): Promise<ORCredits | null> {
	const m = await architectModel();
	if (!m) return null;
	try {
		return (await m.openRouterCredits()) ?? null;
	} catch {
		return null;
	}
}

// A cheap token estimate: ~4 chars/token. Enough for a pre-send "≈ $X".
const estTokens = (text: string) => Math.ceil((text || '').length / 4);

/** Estimate a cloud call's USD cost: prompt tokens × in-price + an output ceiling ×
 *  out-price. `extraTokens` folds in an attached reference doc's contribution (#640)
 *  so the pre-send guard and readout include the doc the user pays for. */
export function estimateUsd(promptText: string, price: ORPrice | null, maxOut = 4096, extraTokens = 0): number | null {
	if (!price || price.promptPerM == null || price.completionPerM == null) return null;
	return ((estTokens(promptText) + extraTokens) / 1e6) * price.promptPerM + (maxOut / 1e6) * price.completionPerM;
}

// The cloud budget gate, shared by every architect action: blocks when already over
// the cap/balance, AND — in hard-stop mode — refuses a call whose ESTIMATE would
// breach the self-cap, so a single large request can't overshoot. Returns a note, or null.
function cloudBudgetBlock(model: ArchitectModel, promptText: string, extraTokens = 0): string | null {
	const s = architectSpend();
	if (s.status.blocked) return 'Budget cap reached — raise it in Workspace → Spend, or switch tier.';
	if (s.mode === 'stop' && s.cap > 0) {
		const est = estimateUsd(promptText, model.openRouterModelPrice?.() ?? null, 4096, extraTokens);
		if (est != null && s.session + est > s.cap) {
			return `Estimated ~$${est.toFixed(2)} — that would exceed your $${s.cap.toFixed(2)} cap. Raise it in Workspace → Spend, pick a cheaper model, or switch to On-device (free).`;
		}
	}
	return null;
}

// The shared budget keys (lattice-db-*) the spend gauge + the architect gate read.
const BUDGET_CAP_KEY = 'lattice-db-budget-cap';
const BUDGET_MODE_KEY = 'lattice-db-budget-mode';
/** Set (or clear with cap ≤ 0) the session budget cap + enforcement mode. */
export function setBudget(cap: number | null, mode: 'alert' | 'stop'): void {
	try {
		if (cap && cap > 0) localStorage.setItem(BUDGET_CAP_KEY, String(cap));
		else localStorage.removeItem(BUDGET_CAP_KEY);
		localStorage.setItem(BUDGET_MODE_KEY, mode === 'stop' ? 'stop' : 'alert');
	} catch {
		/* storage unavailable */
	}
}

export type ArchitectStatus = {
	ready: boolean;
	generation: string;
	modelName: string | null;
	modelId: string | null;
	// This key (/auth/key): usage + optional per-key limit + monthly breakdown.
	remaining: number | null;
	usage: number | null;
	limit: number | null;
	usageMonthly: number | null;
	limitReset: string | null;
	// The account WALLET (/credits): the real money. null when unavailable.
	wallet: ORCredits | null;
	// The active model's per-million price (for the estimate + display); null pre-catalog.
	price: ORPrice | null;
	// Where the user sets a hard server-enforced per-key cap (we deep-link to it).
	keySettingsUrl: string | null;
	// The on-device ladder readiness, so the AI-model tab can reflect each rung.
	promptApi: string;
	webgpu: boolean;
	webllmReady: boolean;
	universalReady: boolean;
	openRouterReady: boolean;
};

const FLOOR_STATUS: ArchitectStatus = {
	ready: false, generation: 'floor', modelName: null, modelId: null, remaining: null, usage: null, limit: null,
	usageMonthly: null, limitReset: null, wallet: null, price: null, keySettingsUrl: null,
	promptApi: 'unknown', webgpu: false, webllmReady: false, universalReady: false, openRouterReady: false,
};

// The universal Transformers.js backend reports its active name as 'transformers'
// (architect-model.js), but the Studio's tier vocabulary — tierPref, setStudioTier,
// the UI's ON_DEVICE_TIERS / "active" checks — is 'universal'. Normalize at this
// boundary so the active-tier badge + helper reflect the truth. The kernel name is
// left as-is because the Drawing Board keys off `generation === 'transformers'`.
export function normalizeGeneration(generation: string): string {
	return generation === 'transformers' ? 'universal' : generation;
}

/**
 * Live model status — re-evaluates on connect/disconnect/model-swap/tier-summon
 * (the `db-model-changed` event the adapter fires) and whenever `pulse` changes
 * (the Workspace bumps it on open so the authoritative account spend is fresh).
 */
export function useArchitectStatus(pulse = 0): ArchitectStatus {
	const [state, setState] = React.useState<ArchitectStatus>(FLOOR_STATUS);
	// `pulse` is an intentional dependency: the caller bumps it to force a re-fetch
	// of the live status (incl. the authoritative account spend) on demand.
	// biome-ignore lint/correctness/useExhaustiveDependencies: pulse is the explicit refetch trigger
	React.useEffect(() => {
		let canceled = false;
		const refresh = async () => {
			const m = await architectModel();
			if (!m || canceled) return;
			try {
				await m.refreshAvailability?.();
			} catch {
				/* best-effort */
			}
			// Set the SYNC availability (tier, picker readiness) immediately — it must
			// not wait on the account network call below, or the whole panel sits on the
			// floor placeholder until the fetch resolves.
			const a = m.availability();
			if (canceled) return;
			const generation = normalizeGeneration(a.generation);
			setState({
				ready: generation !== 'floor',
				generation,
				modelName: m.openRouterModelName?.() ?? null,
				modelId: m.openRouterModel?.() ?? null,
				remaining: null,
				usage: null,
				limit: null,
				usageMonthly: null,
				limitReset: null,
				wallet: null,
				price: m.openRouterModelPrice?.() ?? null,
				keySettingsUrl: m.openRouterKeySettingsUrl?.() ?? null,
				promptApi: a.promptApi,
				webgpu: a.webgpu,
				webllmReady: a.webllmReady,
				universalReady: a.universalReady,
				openRouterReady: a.openRouterReady,
			});
			// Then fold in the authoritative spend when it arrives (best-effort): the
			// per-key figures (/auth/key) and the account WALLET (/credits) in parallel.
			try {
				const [acct, wallet] = await Promise.all([
					Promise.resolve(m.openRouterAccount()).catch(() => null),
					Promise.resolve(m.openRouterCredits()).catch(() => null),
				]);
				rememberSpendContext(wallet ?? null, acct ?? null); // feed the sync gauge
				if (!canceled && (acct || wallet)) {
					setState((s) => ({
						...s,
						remaining: acct?.remaining ?? null,
						usage: acct?.usage ?? null,
						limit: acct?.limit ?? null,
						usageMonthly: acct?.usageMonthly ?? null,
						limitReset: acct?.limitReset ?? null,
						wallet: wallet ?? null,
						price: m.openRouterModelPrice?.() ?? s.price,
					}));
				}
			} catch {
				/* spend unavailable — the panel falls back gracefully */
			}
		};
		refresh();
		const onChange = () => refresh();
		window.addEventListener('db-model-changed', onChange);
		return () => {
			canceled = true;
			window.removeEventListener('db-model-changed', onChange);
		};
	}, [pulse]);
	return state;
}

// ── Model picker + on-device tier bridge (the Workspace AI-model tab) ───────────

/** The OpenRouter catalog (id/name/pricing/ctx/vision), or [] when unavailable. */
export async function listStudioModels(): Promise<ORModel[]> {
	const m = await architectModel();
	if (!m) return [];
	try {
		return await m.listOpenRouterModels();
	} catch {
		return [];
	}
}

/** The currently-selected OpenRouter model id (the connect-time default until set). */
export async function currentStudioModel(): Promise<string | null> {
	const m = await architectModel();
	return m?.openRouterModel?.() ?? null;
}

/** Choose the active OpenRouter model — announces `db-model-changed` for live UI. */
export async function setStudioModel(id: string): Promise<void> {
	const m = await architectModel();
	m?.setOpenRouterModel?.(id);
}

/** Force a generation tier ('floor' | 'prompt-api' | 'webllm' | 'universal' | 'auto'). */
export async function setStudioTier(name: string): Promise<void> {
	const m = await architectModel();
	m?.setTier?.(name);
}

/** Summon WebLLM (~1GB, WebGPU). Resolves true once loaded; never throws to the UI. */
export async function summonWebLLM(onProgress?: (p: TierProgress) => void, signal?: AbortSignal): Promise<boolean> {
	const m = await architectModel();
	if (!m) return false;
	try {
		return await m.summon(onProgress, signal);
	} catch {
		return false;
	}
}

/** Load the universal Transformers.js tier (~350MB WASM, runs everywhere). */
export async function loadUniversalModel(onProgress?: (p: TierProgress) => void, signal?: AbortSignal): Promise<boolean> {
	const m = await architectModel();
	if (!m) return false;
	try {
		return await m.loadUniversal(onProgress, signal);
	} catch {
		return false;
	}
}

/** The authoritative OpenRouter account readout (usage + remaining credit), or null. */
export async function architectAccount(): Promise<ORAccount | null> {
	const m = await architectModel();
	if (!m) return null;
	try {
		return (await m.openRouterAccount()) ?? null;
	} catch {
		return null;
	}
}

/** Start the OpenRouter one-click OAuth (PKCE) — navigates to the auth page. */
export async function connectOpenRouter(): Promise<void> {
	const m = await architectModel();
	if (!m) throw new Error('AI model unavailable in this environment.');
	const callback = location.href.split('?')[0];
	const url = await m.beginOpenRouterAuth(callback);
	if (url) location.href = url;
}

/** On return from OAuth (`?code=`), exchange the code and clean the URL. */
export async function resumePendingAuth(): Promise<boolean> {
	const m = await architectModel();
	if (!m) return false;
	const code = new URLSearchParams(location.search).get('code');
	if (!code || !m.hasPendingOpenRouterAuth()) return false;
	try {
		await m.resumeOpenRouterAuth(code);
	} catch {
		return false;
	}
	history.replaceState(null, '', location.href.split('?')[0]);
	return true;
}

export async function disconnectOpenRouter(): Promise<void> {
	const m = await architectModel();
	m?.disconnectOpenRouter?.();
}
