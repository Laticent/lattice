import { afterEach, describe, expect, it } from 'vitest';
import { boundaryRulesGeneration as lintGeneration } from '@/playground/authoring-core.generated.js';
import { admitPlugins } from '../../../lib/plugins/host-grammar.mjs';
import { stripFrontMatter } from '../components/studio/front-matter';
import { splitSlides } from '../components/studio/lint';
import { deckPluginsOff, followDeckAdmission } from './plugin-admission';

// The Studio's source-side readers follow the deck's admission under a host that narrowed its
// default set (spec/LPM.md §3.2.1): with math off, a `---` inside `$$` is a slide break, as in the
// engine. The playground bundle is stood in by its one method this module reads.
// What the Studio shell does: decide admission on the WHOLE deck, then read the body (which has
// lost the front matter, and with it the deck's `plugins:` list).
function rail(deck: string): number {
	followDeckAdmission(deck);
	return splitSlides(stripFrontMatter(deck)).length;
}

const DECK = '# One\n\n$$\nx\n\n---\n\ny\n$$\n\n---\n\n# Two\n';

type Win = { LatticePlayground?: { pluginAdmission?: (deck: string) => string[] | null } };
const win = globalThis as unknown as { window?: Win };
function narrowTo(defaults: string[] | null) {
	win.window = {
		LatticePlayground: {
			pluginAdmission: (deck) => (defaults === null ? null : (admitPlugins(deck, { defaults }).active as Array<{ name: string }>).map((g) => g.name)),
		},
	};
}

afterEach(() => {
	narrowTo(null);
	followDeckAdmission(DECK);
	delete win.window;
});

describe('plugin-admission — the Studio readers follow the deck', () => {
	it('on the default set nothing is off and `$$` keeps its `---`', () => {
		narrowTo(null);
		expect(deckPluginsOff(DECK)).toEqual([]);
		expect(rail(DECK)).toBe(2);
	});

	it('with math not loaded, the slide mapping splits where the engine splits', () => {
		narrowTo([]);
		expect(deckPluginsOff(DECK)).toContain('math');
		expect(rail(DECK)).toBe(3);
		// A deck that lists math loads it, and `$$` is one block again.
		expect(rail(`---\nplugins: [math]\n---\n${DECK}`)).toBe(2);
	});

	it('the lint bundle\'s own parser copy is switched too', () => {
		narrowTo(null);
		followDeckAdmission(DECK);
		const before = lintGeneration();
		narrowTo([]);
		followDeckAdmission(DECK);
		expect(lintGeneration()).toBe(before + 1);
		// An unchanged answer touches neither copy.
		followDeckAdmission(DECK);
		expect(lintGeneration()).toBe(before + 1);
	});
});
