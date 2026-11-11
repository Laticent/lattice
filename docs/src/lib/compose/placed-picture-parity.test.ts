import { createRequire } from 'node:module';
import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { deckSchema, deckToDoc } from './deck-doc';
import { placementAt } from './image-objects';

// COMPOSE ANSWERS THE ENGINE'S QUESTIONS. Whether a picture is the slide's placed photo is decided by the engine
// (lib/integrations/markdown-it/plugins.js), and Export-to-Marp and Compose must say the same. The shared table holds the
// engine's answer for each case; test/unit/plugins/image-address.test.js holds the engine and the export to it, and this
// holds Compose's badge (`placementAt(...).placement`) to it, so the three agree through one table (the card grader's
// `raise it` on #3126). A new case goes in the table, never in one reader's own test.
type Case = { name: string; md: string; addr: string; placed: boolean };
const { cases } = createRequire(import.meta.url)('../../../../test/fixtures/placed-picture-cases.json') as { cases: Case[] };

describe('Compose places the picture exactly where the engine does (test/fixtures/placed-picture-cases.json)', () => {
	it('the table is not empty', () => {
		expect(cases.length).toBeGreaterThanOrEqual(20);
	});
	for (const { name, md, addr, placed } of cases) {
		it(name, () => {
			const state = EditorState.create({ doc: deckToDoc(md) });
			let pos = -1;
			state.doc.descendants((node, at) => {
				if (pos < 0 && node.type === deckSchema.nodes.image && node.attrs.src === addr) pos = at;
			});
			expect(pos, `Compose found no picture at ${addr}`).toBeGreaterThanOrEqual(0);
			expect(placementAt(state, pos).placement !== 'none', name).toBe(placed);
		});
	}
});
