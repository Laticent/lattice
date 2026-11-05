// Every switch has a Studio home at both scopes, or a stated reason it has none — and every home
// names a row the panel really draws. Adding a switch to lib/core/switches.mjs without a control
// fails here (followups.d 3023-p2: "a test fails when a switch is added without a Studio control").
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SWITCHES } from '../../../../lib/core/switches.mjs';
import { CONTENT_SWITCH_TOKENS, CONTENT_SWITCHES, switchState, withSwitchState } from './switch-controls';
import { SWITCH_HOMES } from './switch-homes';

const read = (f: string) => readFileSync(join(__dirname, f), 'utf8');
const PANELS = { deck: read('StudioShell.tsx'), slide: read('SlideContext.tsx') } as const;
const CONTENT_LABELS = new Set(CONTENT_SWITCHES.map((s) => s.label));

describe('Studio switch controls', () => {
	it('give every switch in SWITCHES a home, and no home to a name that is not a switch', () => {
		expect(Object.keys(SWITCH_HOMES).sort()).toEqual(SWITCHES.map((s) => s.name).sort());
	});

	for (const scope of ['deck', 'slide'] as const) {
		it(`name a ${scope} row the ${scope} panel draws, under the tab it names, or a reason`, () => {
			const src = PANELS[scope];
			for (const [name, homes] of Object.entries(SWITCH_HOMES)) {
				const home = homes[scope];
				if ('none' in home) {
					expect(home.none.length, `${name}: a reason, not a blank`).toBeGreaterThan(20);
					continue;
				}
				expect(src, `${name}: the ${scope} panel has a "${home.tab}" tab`).toContain(`label: '${home.tab}'`);
				if (home.tab === 'Content') expect(CONTENT_LABELS.has(home.label), `${name}: a Content row`).toBe(true);
				else expect(src, `${name}: the ${scope} panel draws "${home.label}"`).toMatch(new RegExp(`label="${home.label}"|label: '${home.label}'`));
			}
		});
	}

	it('draw a Content row for exactly the switches homed in Content', () => {
		const homed = Object.entries(SWITCH_HOMES).filter(([, h]) => 'tab' in h.deck && h.deck.tab === 'Content').map(([n]) => n);
		expect(CONTENT_SWITCHES.map((s) => s.name).sort()).toEqual(homed.sort());
	});

	it('read and write one token per switch, with-X winning over no-X', () => {
		expect(switchState('spine', ['columns', 'no-spine'])).toBe('off');
		expect(switchState('spine', ['columns', 'no-spine', 'with-spine'])).toBe('on');
		expect(switchState('spine', ['columns'])).toBeNull();
		expect(withSwitchState('period', ['content', 'no-period', 'scale-l'], 'on')).toEqual(['content', 'scale-l', 'with-period']);
		expect(withSwitchState('period', ['content', 'with-period'], null)).toEqual(['content']);
	});

	it('own the class tokens of the class-borne Content switches, not callout (a front-matter key)', () => {
		expect(CONTENT_SWITCH_TOKENS).toContain('no-spine');
		expect(CONTENT_SWITCH_TOKENS).not.toContain('no-callout');
	});
});
