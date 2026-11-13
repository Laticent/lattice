import { createRequire } from 'node:module';
import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { photoAt } from '../../components/studio/card-ink-pick';
import { deckPlacingClasses } from '../deck-placing-classes';
import { deckSchema, deckToDoc } from './deck-doc';
import { parseDeck } from './deck-source';
import { placementAt } from './image-objects';

// COMPOSE ANSWERS THE ENGINE'S QUESTIONS. Whether a picture is the slide's placed photo is decided by the engine
// (lib/integrations/markdown-it/plugins.js), and Export-to-Marp and Compose must say the same. The shared table holds the
// engine's answer for each case; test/unit/plugins/image-address.test.js holds the engine and the export to it, and this
// holds Compose's badge (`placementAt(...).placement`) and the Studio's photo finder (`photoAt`) to it, so every reader agrees
// through one table and one kernel (lib/core/placed-picture.mjs). A new case goes in the table, never in one reader's own test.
type Case = { name: string; md: string; addr: string; placed: boolean; carried?: boolean; carriedBackground?: boolean };
const { cases } = createRequire(import.meta.url)('../../../../test/fixtures/placed-picture-cases.json') as { cases: Case[] };

describe('Compose places the picture exactly where the engine does (test/fixtures/placed-picture-cases.json)', () => {
	it('the table is not empty', () => {
		expect(cases.length).toBeGreaterThanOrEqual(20);
	});
	// A `backgroundImage` carried from the front matter or an earlier slide is not handed to Compose yet (`carriedBackground`,
	// followups.d/3126-p3-studio-carried-class.md): skipped by name, never silently.
	for (const { name, md, addr, placed, carriedBackground } of cases) {
		it.skipIf(carriedBackground)(name, () => {
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

describe('the photo finder finds the photo the engine places (test/fixtures/placed-picture-cases.json)', () => {
	// `photoAt` reads one slide's text and the deck's `class:`; a class carried from an earlier slide is out of its sight
	// (`carried`, followups.d/3126-p3-studio-carried-class.md), so those cases are skipped by name, never silently.
	for (const { name, md, addr, placed, carried, carriedBackground } of cases) {
		it.skipIf(carried || carriedBackground)(name, () => {
			const slide = parseDeck(md.replace(/\r\n/g, '\n')).slides.find((s) => s.raw.includes(`(${addr}`));
			expect(slide, `no slide holds ${addr}`).toBeTruthy();
			const found = photoAt(slide?.raw ?? '', deckPlacingClasses(md));
			expect(found?.ref === addr, name).toBe(placed);
		});
	}
});
