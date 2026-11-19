import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { chatAgentDeps, loadArchitectAuthoring } from './architect';
import { chatOfferedTools, createToolbox, EDIT_TOOLS } from './architect-agent';
import { CHAT_MODES, TOOL_TIERS } from './chat-actions';
import { init as initChatAgent, TOOL_ACTIVITY, TOOL_DRAFTING } from './chat-agent';

// WHAT THE MODEL SEES, FROZEN. The tool definitions a chat request carries are the head of the cached
// prompt prefix: a changed byte re-bills the whole prefix and can change what the model does. The move
// to use-case manifests (engineering/decisions/2026-11-17-use-case-layer.md §10 step 1) must change none
// of them, so this holds every combination (mode × pictures × Library) to a fixture captured from the
// hand-written lists before the move, with the tier table, the deck-edit set and the status labels.
//
// A deliberate change regenerates it: UPDATE_GOLDEN=1 npx vitest run <this file>, and the fixture's diff
// is the review of exactly what the model will see differently.

// From the docs/ workspace root, where vitest runs (import.meta.url is not a file URL under jsdom).
const FIXTURE = resolve(process.cwd(), 'src/components/studio/__fixtures__/chat-tools.golden.json');
const THEMES = ['indaco', 'cuoio'];
const FINISHES = ['grain', 'halo'];

type Def = { function: { name: string } };

/**
 * The fixture's shape is for REVIEW: each combination is its list of tool names, and each tool's
 * definition is stored once, pretty-printed, so a changed word is a one-line diff. The bytes are still
 * checked exactly: a combination's JSON is its definitions' JSON in its order.
 */
function snapshot() {
	const offered: Record<string, string[]> = {};
	const definitions: Record<string, unknown> = {};
	const json: Record<string, string> = {};
	for (const mode of CHAT_MODES)
		for (const seesPictures of [false, true])
			for (const hasLibrary of [false, true]) {
				const key = `${mode}${seesPictures ? '+pictures' : ''}${hasLibrary ? '+library' : ''}`;
				const tools = chatOfferedTools({ mode, themes: THEMES, finishes: FINISHES, seesPictures, hasLibrary }) as unknown as Def[];
				offered[key] = tools.map((t) => t.function.name);
				for (const t of tools) definitions[t.function.name] = t;
				json[key] = JSON.stringify(tools);
			}
	return { snap: { offered, definitions, tiers: { ...TOOL_TIERS }, editTools: [...EDIT_TOOLS].sort(), activity: { ...TOOL_ACTIVITY }, drafting: { ...TOOL_DRAFTING } }, json };
}

describe('the chat tool definitions are byte-identical to the frozen fixture', () => {
	const { snap, json } = snapshot();
	if (process.env.UPDATE_GOLDEN === '1') writeFileSync(FIXTURE, `${JSON.stringify(snap, null, '\t')}\n`);
	const golden = JSON.parse(readFileSync(FIXTURE, 'utf8')) as typeof snap;
	for (const key of Object.keys(golden.offered))
		it(`offered tools: ${key}`, () => {
			expect(snap.offered[key]).toEqual(golden.offered[key]);
			// The bytes the request carries: the golden definitions, in the golden order.
			expect(json[key]).toBe(JSON.stringify(golden.offered[key].map((n) => golden.definitions[n])));
		});
	it('the tier table, the deck-edit set and the status labels', () => {
		expect({ ...snap, offered: undefined, definitions: undefined }).toEqual({ ...golden, offered: undefined, definitions: undefined });
	});
});

// A tool the model is offered must have a handler, or every call to it reads "There is no tool called X"
// (the inversion on #3208 step 1). The dispatcher cannot see this; the manifests and the toolbox can.
describe('every chat tool has a handler, and every handler a tool', () => {
	beforeAll(async () => {
		await loadArchitectAuthoring();
		initChatAgent(chatAgentDeps());
	});
	it('the toolbox handles exactly the chat-hosted use cases', () => {
		const tb = createToolbox({ source: '# A', catalog: [], frontMatterKeys: [], library: {} as never });
		expect([...tb.handledTools].sort()).toEqual(Object.keys(TOOL_TIERS).sort());
	});
});
