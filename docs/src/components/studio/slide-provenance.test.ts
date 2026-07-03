import { describe, expect, it } from 'vitest';
import { getClassTokens } from './slide-directives';
import { darkProvenance, finishProvenance, modeProvenance, setDark, setFinish, setMode, setStampStyle, setToneStyle, stampStyleProvenance, toneStyleProvenance } from './slide-provenance';

const TONE_STYLES = ['tone-rail', 'tone-edge', 'tone-glow'];

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
	it('a dark deck reads inherited even when the slide ALSO carries dark (no phantom off)', () => {
		const src = deck('class: dark', '<!-- _class: kpi dark -->');
		expect(darkProvenance('<!-- _class: kpi dark -->', src).state).toBe('inherited');
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
	it('the finish-preview specimen is NOT a real finish (mirrors the engine)', () => {
		expect(finishProvenance('<!-- _class: kpi finish-preview -->', '').state).toBe('off');
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
	it('reads sketch-clean back correctly regardless of token order', () => {
		expect(modeProvenance('<!-- _class: kpi sketch sketch-clean-body -->', '')).toMatchObject({ state: 'on', value: 'sketch-clean' });
		expect(modeProvenance('<!-- _class: kpi sketch -->', '')).toMatchObject({ state: 'on', value: 'sketch' });
	});
	it('setMode writes the right tokens', () => {
		expect(getClassTokens(setMode('<!-- _class: kpi -->', 'sketch-clean'))).toEqual(['kpi', 'sketch', 'sketch-clean-body']);
		expect(getClassTokens(setMode('<!-- _class: kpi sketch -->', 'boardroom'))).toEqual(['kpi', 'boardroom']);
		expect(getClassTokens(setMode('<!-- _class: kpi sketch sketch-clean-body -->', null))).toEqual(['kpi']);
	});
});

describe('stamp-style provenance + override', () => {
	it('off (the uniform default) when neither slide nor deck sets a shape', () => {
		expect(stampStyleProvenance('<!-- _class: kpi confidential -->', '# deck').state).toBe('off');
	});
	it('inherited from the deck `stamp:` register', () => {
		const src = deck('stamp: seal', '<!-- _class: kpi -->');
		expect(stampStyleProvenance('<!-- _class: kpi -->', src)).toMatchObject({ state: 'inherited', value: 'seal', deckValue: 'seal', inheritable: true });
	});
	it('on when the slide overrides with its own stamp-* shape', () => {
		const src = deck('stamp: seal', '<!-- _class: kpi stamp-notch -->');
		expect(stampStyleProvenance('<!-- _class: kpi stamp-notch -->', src)).toMatchObject({ state: 'on', value: 'notch', deckValue: 'seal' });
	});
	it('setStampStyle never stacks shapes; null clears back to inherit/default', () => {
		let chunk = '<!-- _class: kpi stamp-seal -->';
		chunk = setStampStyle(chunk, 'notch');
		expect(getClassTokens(chunk).filter((t) => t.startsWith('stamp-'))).toEqual(['stamp-notch']);
		expect(getClassTokens(setStampStyle(chunk, null)).some((t) => t.startsWith('stamp-'))).toBe(false);
	});
});

describe('tone-style provenance + override', () => {
	it('off (the default rail) when neither slide nor deck sets a shape', () => {
		expect(toneStyleProvenance('<!-- _class: kpi tone-pass -->', '# deck', TONE_STYLES).state).toBe('off');
	});
	it('inherited from the deck `tone:` register', () => {
		const src = deck('tone: edge', '<!-- _class: kpi -->');
		expect(toneStyleProvenance('<!-- _class: kpi -->', src, TONE_STYLES)).toMatchObject({ state: 'inherited', value: 'edge', inheritable: true });
	});
	it('on when the slide overrides with its own tone-* shape', () => {
		const src = deck('tone: edge', '<!-- _class: kpi tone-glow -->');
		expect(toneStyleProvenance('<!-- _class: kpi tone-glow -->', src, TONE_STYLES)).toMatchObject({ state: 'on', value: 'glow', deckValue: 'edge' });
	});
	it('a SEMANTIC tone (tone-pass) is not read as a tone STYLE — the axes are orthogonal', () => {
		// tone-pass sets the color; the shape stays at its default (off).
		expect(toneStyleProvenance('<!-- _class: kpi tone-pass -->', '', TONE_STYLES).state).toBe('off');
	});
	it('setToneStyle clears only the KNOWN style tokens, never a semantic tone', () => {
		let chunk = '<!-- _class: kpi tone-pass tone-edge -->';
		chunk = setToneStyle(chunk, 'glow', TONE_STYLES);
		const tokens = getClassTokens(chunk);
		expect(tokens).toContain('tone-pass'); // semantic tone untouched
		expect(tokens).toContain('tone-glow');
		expect(tokens).not.toContain('tone-edge');
		expect(getClassTokens(setToneStyle(chunk, null, TONE_STYLES))).toEqual(['kpi', 'tone-pass']);
	});
});
