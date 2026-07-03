import { describe, expect, it } from 'vitest';
import { getClassTokens } from './slide-directives';
import { darkProvenance, finishProvenance, modeProvenance, setDark, setFinish, setMode } from './slide-provenance';

const deck = (fm: string, body: string) => `---\n${fm}\n---\n\n${body}`;

describe('dark provenance', () => {
	it('off when neither slide nor deck is dark', () => {
		expect(darkProvenance('<!-- _class: kpi -->\n\n# Hi', '# deck').state).toBe('off');
	});
	it('on when the slide carries dark', () => {
		expect(darkProvenance('<!-- _class: kpi dark -->\n\n# Hi', '').state).toBe('on');
	});
	it('inherited (not off) when the DECK is dark and the slide is not', () => {
		const src = deck('class: dark', '<!-- _class: kpi -->\n\n# Hi');
		const p = darkProvenance('<!-- _class: kpi -->', src);
		expect(p.state).toBe('inherited');
		expect(p.deckValue).toBe('dark');
	});
	it('setDark toggles only the dark token', () => {
		expect(getClassTokens(setDark('<!-- _class: kpi tint-corner -->', true))).toEqual(['kpi', 'tint-corner', 'dark']);
		expect(getClassTokens(setDark('<!-- _class: kpi dark tint-corner -->', false))).toEqual(['kpi', 'tint-corner']);
	});
});

describe('finish provenance + override', () => {
	it('inherited from deck finish', () => {
		const src = deck('finish: atrium', '<!-- _class: kpi -->');
		const p = finishProvenance('<!-- _class: kpi -->', src);
		expect(p).toMatchObject({ state: 'inherited', value: 'atrium', inheritable: true });
	});
	it('on when the slide overrides with its own finish', () => {
		const src = deck('finish: atrium', '<!-- _class: kpi finish-meridian -->');
		const p = finishProvenance('<!-- _class: kpi finish-meridian -->', src);
		expect(p).toMatchObject({ state: 'on', value: 'meridian', deckValue: 'atrium' });
	});
	it('off when the slide opts out with finish-none', () => {
		const src = deck('finish: atrium', '<!-- _class: kpi finish-none -->');
		expect(finishProvenance('<!-- _class: kpi finish-none -->', src).state).toBe('off');
	});
	it('setFinish never stacks finishes', () => {
		let chunk = '<!-- _class: kpi finish-atrium -->';
		chunk = setFinish(chunk, 'meridian');
		expect(getClassTokens(chunk).filter((t) => t.startsWith('finish-'))).toEqual(['finish-meridian']);
		expect(getClassTokens(setFinish(chunk, 'none'))).toContain('finish-none');
		expect(getClassTokens(setFinish(chunk, null)).some((t) => t.startsWith('finish'))).toBe(false);
	});
});

describe('mode provenance + opt-out', () => {
	it('inherited from deck sketch mode', () => {
		const src = deck('mode: sketch', '<!-- _class: kpi -->');
		expect(modeProvenance('<!-- _class: kpi -->', src)).toMatchObject({ state: 'inherited', value: 'sketch' });
	});
	it('off via boardroom opt-out', () => {
		const src = deck('mode: sketch', '<!-- _class: kpi boardroom -->');
		expect(modeProvenance('<!-- _class: kpi boardroom -->', src).state).toBe('off');
	});
	it('setMode writes the right tokens', () => {
		expect(getClassTokens(setMode('<!-- _class: kpi -->', 'sketch-clean'))).toEqual(['kpi', 'sketch', 'sketch-clean-body']);
		expect(getClassTokens(setMode('<!-- _class: kpi sketch -->', 'boardroom'))).toEqual(['kpi', 'boardroom']);
		expect(getClassTokens(setMode('<!-- _class: kpi sketch sketch-clean-body -->', null))).toEqual(['kpi']);
	});
});
