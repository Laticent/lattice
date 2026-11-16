import { createRequire } from 'node:module';
import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { photoAt } from '../../components/studio/card-ink-pick';
import { slidePlacingOf } from '../slide-carried';
import { deckSchema, deckToDoc } from './deck-doc';
import { parseDeck } from './deck-source';
import { placementAt } from './image-objects';

// COMPOSE ANSWERS THE ENGINE'S QUESTIONS. Whether a picture is the slide's placed photo is decided by the engine
// (lib/integrations/markdown-it/plugins.js), and Export-to-Marp and Compose must say the same. The shared table holds the
// engine's answer for each case; test/unit/plugins/image-address.test.js holds the engine and the export to it, and this
// holds Compose's badge (`placementAt(...).placement`) and the Studio's photo finder (`photoAt`) to it, so every reader agrees
// through one table and one kernel (lib/core/placed-picture.mjs). A new case goes in the table, never in one reader's own test.
type Case = { name: string; md: string; addr: string; placed: boolean };
const { cases } = createRequire(import.meta.url)('../../../../test/fixtures/placed-picture-cases.json') as { cases: Case[] };

describe('Compose places the picture exactly where the engine does (test/fixtures/placed-picture-cases.json)', () => {
	it('the table is not empty', () => {
		expect(cases.length).toBeGreaterThanOrEqual(20);
	});
	// Every case runs, the carried ones included: Compose reads a class and a background carried from the front matter or an
	// earlier slide from its document . 
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

describe('the photo finder finds the photo the engine places (test/fixtures/placed-picture-cases.json)', () => {
	// `photoAt` reads one slide's text; what the slide inherits (a carried class, a carried background, the deck's `class:`) is
	// read from the whole deck as the Studio's callers read it (lib/slide-carried.ts). Every case runs.
	for (const { name, md, addr, placed } of cases) {
		it(name, () => {
			const source = md.replace(/\r\n/g, '\n');
			const slide = parseDeck(source).slides.find((s) => s.raw.includes(`(${addr}`));
			expect(slide, `no slide holds ${addr}`).toBeTruthy();
			const placing = slidePlacingOf(source, slide?.raw ?? '');
			expect(placing, `the deck reader found no slide for ${addr}`).toBeTruthy();
			const found = photoAt(slide?.raw ?? '', placing ?? []);
			expect(found?.ref === addr, name).toBe(placed);
		});
	}
});
