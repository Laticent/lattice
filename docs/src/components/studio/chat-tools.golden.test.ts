import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { chatOfferedTools, EDIT_TOOLS } from './architect-agent';
import { CHAT_MODES, TOOL_TIERS } from './chat-actions';
import { TOOL_ACTIVITY, TOOL_DRAFTING } from './chat-agent';

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

function snapshot(): Record<string, unknown> {
	const offered: Record<string, string> = {};
	for (const mode of CHAT_MODES)
		for (const seesPictures of [false, true])
			for (const hasLibrary of [false, true]) offered[`${mode}${seesPictures ? '+pictures' : ''}${hasLibrary ? '+library' : ''}`] = JSON.stringify(chatOfferedTools({ mode, themes: THEMES, finishes: FINISHES, seesPictures, hasLibrary }));
	return { offered, tiers: { ...TOOL_TIERS }, editTools: [...EDIT_TOOLS].sort(), activity: { ...TOOL_ACTIVITY }, drafting: { ...TOOL_DRAFTING } };
}

describe('the chat tool definitions are byte-identical to the frozen fixture', () => {
	const now = snapshot();
	if (process.env.UPDATE_GOLDEN === '1') writeFileSync(FIXTURE, `${JSON.stringify(now, null, '\t')}\n`);
	const golden = JSON.parse(readFileSync(FIXTURE, 'utf8')) as typeof now;
	for (const key of Object.keys((golden as { offered: Record<string, string> }).offered))
		it(`offered tools: ${key}`, () => {
			expect((now.offered as Record<string, string>)[key]).toBe((golden.offered as Record<string, string>)[key]);
		});
	it('the tier table, the deck-edit set and the status labels', () => {
		expect({ ...now, offered: undefined }).toEqual({ ...golden, offered: undefined });
	});
});
