// @vitest-environment node
// This file touches no DOM. Under the suite default it paid for a jsdom window it
// never used; see engineering/decisions/2026-09-20-dom-library-bakeoff.md.
import { describe, expect, it } from 'vitest';
import { getClassTokens } from '../../lib/slide-directives';
import {
	canvasProvenance,
	eyebrowProvenance,
	finishProvenance,
	headlineProvenance,
	marksProvenance,
	modeProvenance,
	motionPlayProvenance,
	motionSpeedProvenance,
	motionStyleProvenance,
	ruleProvenance,
	setCanvas,
	setEyebrow,
	setFinish,
	setHeadline,
	setMarks,
	setMode,
	setMotionPlay,
	setMotionSpeed,
	setMotionStyle,
	setRule,
	setSpectrumAxis,
	setStampStyle,
	setToneStyle,
	spectrumAxisProvenance,
	stampStyleProvenance,
	toneStyleProvenance,
} from './slide-provenance';

const TONE_STYLES = ['tone-rail', 'tone-edge', 'tone-glow'];

const deck = (fm: string, body: string) => `---\n${fm}\n---\n\n${body}`;

describe('canvas provenance', () => {
	it('auto when neither slide nor deck pins a canvas', () => {
		const p = canvasProvenance('<!-- @meta{layout=kpi} -->\n\n# Hi', '# deck');
		expect(p.state).toBe('auto');
		expect(p.deckValue).toBeUndefined();
	});
	it('dark when the slide carries dark', () => {
		expect(canvasProvenance('<!-- @meta{layout=kpi, class=dark} -->\n\n# Hi', '').state).toBe('dark');
	});
	it('light when the slide carries light', () => {
		expect(canvasProvenance('<!-- @meta{layout=kpi, class=light} -->\n\n# Hi', '').state).toBe('light');
	});
	it('auto reports the deck value it would inherit (dark)', () => {
		const src = deck('class: dark', '<!-- @meta{layout=kpi} -->\n\n# Hi');
		const p = canvasProvenance('<!-- @meta{layout=kpi} -->', src);
		expect(p.state).toBe('auto');
		expect(p.deckValue).toBe('dark');
	});
	it('a per-slide LIGHT pin wins inside a dark deck (the point of the control)', () => {
		const src = deck('class: dark', '<!-- @meta{layout=kpi, class=light} -->');
		const p = canvasProvenance('<!-- @meta{layout=kpi, class=light} -->', src);
		expect(p.state).toBe('light'); // explicit — overrides the deck-wide dark
		expect(p.deckValue).toBe('dark');
	});
	it('setCanvas sets one token and clears the other (mutually exclusive)', () => {
		expect(getClassTokens(setCanvas('<!-- @meta{layout=kpi, class=tint-corner} -->', 'dark'))).toEqual(['kpi', 'tint-corner', 'dark']);
		expect(getClassTokens(setCanvas('<!-- @meta{layout=kpi, class=dark tint-corner} -->', 'light'))).toEqual(['kpi', 'tint-corner', 'light']);
		expect(getClassTokens(setCanvas('<!-- @meta{layout=kpi, class=light tint-corner} -->', 'auto'))).toEqual(['kpi', 'tint-corner']);
	});
});

describe('finish provenance + override', () => {
	it('inherited from deck finish', () => {
		const src = deck('finish: atrium', '<!-- @meta{layout=kpi} -->');
		const p = finishProvenance('<!-- @meta{layout=kpi} -->', src);
		expect(p).toMatchObject({ state: 'inherited', value: 'atrium', inheritable: true });
	});
	it('on when the slide overrides with its own finish', () => {
		const src = deck('finish: atrium', '<!-- @meta{layout=kpi, class=finish-meridian} -->');
		const p = finishProvenance('<!-- @meta{layout=kpi, class=finish-meridian} -->', src);
		expect(p).toMatchObject({ state: 'on', value: 'meridian', deckValue: 'atrium' });
	});
	it('off when the slide opts out with no-finish', () => {
		const src = deck('finish: atrium', '<!-- @meta{layout=kpi, class=no-finish} -->');
		expect(finishProvenance('<!-- @meta{layout=kpi, class=no-finish} -->', src).state).toBe('off');
	});
	it('the finish-preview specimen is NOT a real finish (mirrors the engine)', () => {
		expect(finishProvenance('<!-- @meta{layout=kpi, class=finish-preview} -->', '').state).toBe('off');
	});
	it('setFinish never stacks finishes', () => {
		let chunk = '<!-- @meta{layout=kpi, class=finish-atrium} -->';
		chunk = setFinish(chunk, 'meridian');
		expect(getClassTokens(chunk).filter((t) => t.startsWith('finish-'))).toEqual(['finish-meridian']);
		expect(getClassTokens(setFinish(chunk, 'none'))).toContain('no-finish');
		expect(getClassTokens(setFinish(chunk, null)).some((t) => t.startsWith('finish'))).toBe(false);
	});
});

describe('mode provenance + opt-out', () => {
	it('inherited from deck sketch mode', () => {
		const src = deck('mode: sketch', '<!-- @meta{layout=kpi} -->');
		expect(modeProvenance('<!-- @meta{layout=kpi} -->', src)).toMatchObject({ state: 'inherited', value: 'sketch' });
	});
	it('off via boardroom opt-out', () => {
		const src = deck('mode: sketch', '<!-- @meta{layout=kpi, class=boardroom} -->');
		expect(modeProvenance('<!-- @meta{layout=kpi, class=boardroom} -->', src).state).toBe('off');
	});
	it('reads sketch-clean back correctly regardless of token order', () => {
		expect(modeProvenance('<!-- @meta{layout=kpi, class=sketch sketch-clean-body} -->', '')).toMatchObject({ state: 'on', value: 'sketch-clean' });
		expect(modeProvenance('<!-- @meta{layout=kpi, class=sketch} -->', '')).toMatchObject({ state: 'on', value: 'sketch' });
	});
	it('setMode writes the right tokens', () => {
		expect(getClassTokens(setMode('<!-- @meta{layout=kpi} -->', 'sketch-clean'))).toEqual(['kpi', 'sketch', 'sketch-clean-body']);
		expect(getClassTokens(setMode('<!-- @meta{layout=kpi, class=sketch} -->', 'boardroom'))).toEqual(['kpi', 'boardroom']);
		expect(getClassTokens(setMode('<!-- @meta{layout=kpi, class=sketch sketch-clean-body} -->', null))).toEqual(['kpi']);
	});
});

describe('motion provenance — three axes (Play / Style / Speed)', () => {
	it('PLAY: off by default; inherits deck `motion: on`; slide with-motion/off overrides', () => {
		expect(motionPlayProvenance('<!-- @meta{layout=funnel} -->', '# deck')).toMatchObject({ state: 'off', inheritable: false });
		expect(motionPlayProvenance('<!-- @meta{layout=funnel} -->', deck('motion: on', 'x'))).toMatchObject({ state: 'inherited', value: 'on', inheritable: true });
		expect(motionPlayProvenance('<!-- @meta{layout=funnel, class=no-motion} -->', deck('motion: on', 'x'))).toMatchObject({ state: 'off', deckValue: 'on' });
		// Play is the SOLE switch: an explicit with-motion is on; the legacy chart-anima is on…
		expect(motionPlayProvenance('<!-- @meta{layout=funnel, class=with-motion} -->', '# deck')).toMatchObject({ state: 'on' });
		expect(motionPlayProvenance('<!-- @meta{layout=funnel, class=chart-anima} -->', '# deck')).toMatchObject({ state: 'on' });
		// …but a bare style/speed token does NOT imply Play on — it stays inherit/off (no magic).
		expect(motionPlayProvenance('<!-- @meta{layout=funnel, class=motion-rise} -->', '# deck')).toMatchObject({ state: 'off', inheritable: false });
		expect(motionPlayProvenance('<!-- @meta{layout=funnel, class=motion-fast} -->', deck('motion: on', 'x'))).toMatchObject({ state: 'inherited', value: 'on' });
	});
	it('STYLE: inherits `motion-style:`; slide motion-<style> overrides; legacy chart-anima → build', () => {
		expect(motionStyleProvenance('<!-- @meta{layout=funnel} -->', deck('motion-style: together', 'x'))).toMatchObject({ state: 'inherited', value: 'together' });
		expect(motionStyleProvenance('<!-- @meta{layout=funnel, class=motion-rise} -->', '# deck')).toMatchObject({ state: 'on', value: 'rise' });
		expect(motionStyleProvenance('<!-- @meta{layout=funnel, class=chart-anima} -->', '# deck')).toMatchObject({ state: 'on', value: 'build' });
	});
	it('SPEED: inherits `motion-speed:`; slide motion-<speed> overrides', () => {
		expect(motionSpeedProvenance('<!-- @meta{layout=funnel} -->', deck('motion-speed: fast', 'x'))).toMatchObject({ state: 'inherited', value: 'fast' });
		expect(motionSpeedProvenance('<!-- @meta{layout=funnel, class=motion-slow} -->', '# deck')).toMatchObject({ state: 'on', value: 'slow' });
	});
	it('setters write the right token, null clears, and setting Play/Style strips legacy chart-anima', () => {
		expect(getClassTokens(setMotionPlay('<!-- @meta{layout=funnel} -->', 'off'))).toEqual(['funnel', 'no-motion']);
		expect(getClassTokens(setMotionStyle('<!-- @meta{layout=funnel, class=chart-anima} -->', 'rise'))).toEqual(['funnel', 'motion-rise']);
		expect(getClassTokens(setMotionSpeed('<!-- @meta{layout=funnel, class=motion-slow} -->', 'fast'))).toEqual(['funnel', 'motion-fast']);
		expect(getClassTokens(setMotionSpeed('<!-- @meta{layout=funnel, class=motion-fast} -->', null))).toEqual(['funnel']);
		// axes are independent: setting style leaves a speed token intact
		expect(getClassTokens(setMotionStyle('<!-- @meta{layout=funnel, class=motion-fast} -->', 'together')).sort()).toEqual(['funnel', 'motion-fast', 'motion-together']);
	});
});

describe('stamp-style provenance + override', () => {
	it('off (the uniform default) when neither slide nor deck sets a shape', () => {
		expect(stampStyleProvenance('<!-- @meta{layout=kpi, class=confidential} -->', '# deck').state).toBe('off');
	});
	it('inherited from the deck `stamp:` register', () => {
		const src = deck('stamp: seal', '<!-- @meta{layout=kpi} -->');
		expect(stampStyleProvenance('<!-- @meta{layout=kpi} -->', src)).toMatchObject({ state: 'inherited', value: 'seal', deckValue: 'seal', inheritable: true });
	});
	it('on when the slide overrides with its own stamp-* shape', () => {
		const src = deck('stamp: seal', '<!-- @meta{layout=kpi, class=stamp-notch} -->');
		expect(stampStyleProvenance('<!-- @meta{layout=kpi, class=stamp-notch} -->', src)).toMatchObject({ state: 'on', value: 'notch', deckValue: 'seal' });
	});
	it('setStampStyle never stacks shapes; null clears back to inherit/default', () => {
		let chunk = '<!-- @meta{layout=kpi, class=stamp-seal} -->';
		chunk = setStampStyle(chunk, 'notch');
		expect(getClassTokens(chunk).filter((t) => t.startsWith('stamp-'))).toEqual(['stamp-notch']);
		expect(getClassTokens(setStampStyle(chunk, null)).some((t) => t.startsWith('stamp-'))).toBe(false);
	});
});

describe('tone-style provenance + override', () => {
	it('off (the default rail) when neither slide nor deck sets a shape', () => {
		expect(toneStyleProvenance('<!-- @meta{layout=kpi, class=tone-pass} -->', '# deck', TONE_STYLES).state).toBe('off');
	});
	it('inherited from the deck `tone:` register', () => {
		const src = deck('tone: edge', '<!-- @meta{layout=kpi} -->');
		expect(toneStyleProvenance('<!-- @meta{layout=kpi} -->', src, TONE_STYLES)).toMatchObject({ state: 'inherited', value: 'edge', inheritable: true });
	});
	it('on when the slide overrides with its own tone-* shape', () => {
		const src = deck('tone: edge', '<!-- @meta{layout=kpi, class=tone-glow} -->');
		expect(toneStyleProvenance('<!-- @meta{layout=kpi, class=tone-glow} -->', src, TONE_STYLES)).toMatchObject({ state: 'on', value: 'glow', deckValue: 'edge' });
	});
	it('a SEMANTIC tone (tone-pass) is not read as a tone STYLE — the axes are orthogonal', () => {
		// tone-pass sets the color; the shape stays at its default (off).
		expect(toneStyleProvenance('<!-- @meta{layout=kpi, class=tone-pass} -->', '', TONE_STYLES).state).toBe('off');
	});
	it('setToneStyle clears only the KNOWN style tokens, never a semantic tone', () => {
		let chunk = '<!-- @meta{layout=kpi, class=tone-pass tone-edge} -->';
		chunk = setToneStyle(chunk, 'glow', TONE_STYLES);
		const tokens = getClassTokens(chunk);
		expect(tokens).toContain('tone-pass'); // semantic tone untouched
		expect(tokens).toContain('tone-glow');
		expect(tokens).not.toContain('tone-edge');
		expect(getClassTokens(setToneStyle(chunk, null, TONE_STYLES))).toEqual(['kpi', 'tone-pass']);
	});
});

// The three spectrum keys, read and written one axis at a time.
const spectrumProvenance = (chunk: string, src: string) => spectrumAxisProvenance(chunk, src, 'spectrum', 'style');
const setSpectrum = (chunk: string, v: string | null) => setSpectrumAxis(chunk, 'spectrum', 'style', v);
const spectrumEdgeProvenance = (chunk: string, src: string) => spectrumAxisProvenance(chunk, src, 'spectrum', 'edge');
const setSpectrumEdge = (chunk: string, v: string | null) => setSpectrumAxis(chunk, 'spectrum', 'edge', v);
const spectrumWeightProvenance = (chunk: string, src: string) => spectrumAxisProvenance(chunk, src, 'spectrum', 'weight');
const setSpectrumWeight = (chunk: string, v: string | null) => setSpectrumAxis(chunk, 'spectrum', 'weight', v);
const cardEdgeProvenance = (chunk: string, src: string) => spectrumAxisProvenance(chunk, src, 'card-spectrum', 'edge');
const setCardEdge = (chunk: string, v: string | null) => setSpectrumAxis(chunk, 'card-spectrum', 'edge', v);

describe('spectrum provenance + override (the stripe on the slide edge)', () => {
	it('off (rainbow default) when neither slide nor deck sets a style', () => {
		expect(spectrumProvenance('<!-- @meta{layout=kpi} -->', '# deck').state).toBe('off');
	});
	it('inherited from the deck `spectrum:` style word, whatever else the line says', () => {
		const src = deck('spectrum: left solid band', '<!-- @meta{layout=kpi} -->');
		expect(spectrumProvenance('<!-- @meta{layout=kpi} -->', src)).toMatchObject({ state: 'inherited', value: 'solid', deckValue: 'solid', inheritable: true });
		expect(spectrumEdgeProvenance('<!-- @meta{layout=kpi} -->', src)).toMatchObject({ state: 'inherited', value: 'left' });
		expect(spectrumWeightProvenance('<!-- @meta{layout=kpi} -->', src)).toMatchObject({ state: 'inherited', value: 'band' });
	});
	it('a deck `spectrum: rainbow` is the default, not an inherited override; the old `on` is no word at all', () => {
		for (const v of ['rainbow', 'on']) {
			const src = deck(`spectrum: ${v}`, '<!-- @meta{layout=kpi} -->');
			expect(spectrumProvenance('<!-- @meta{layout=kpi} -->', src)).toMatchObject({ state: 'off', inheritable: false });
		}
	});
	it('a preset\'s word counts as the deck\'s, per axis', () => {
		const src = deck('preset: brand\nspectrum: left', '<!-- @meta{layout=kpi} -->');
		expect(spectrumProvenance('<!-- @meta{layout=kpi} -->', src)).toMatchObject({ state: 'inherited', value: 'solid' });
		expect(spectrumEdgeProvenance('<!-- @meta{layout=kpi} -->', src)).toMatchObject({ state: 'inherited', value: 'left' });
	});
	it('on when the slide overrides with its own class', () => {
		const src = deck('spectrum: solid', '<!-- @meta{layout=kpi, class=no-spectrum} -->');
		expect(spectrumProvenance('<!-- @meta{layout=kpi, class=no-spectrum} -->', src)).toMatchObject({ state: 'on', value: 'off', deckValue: 'solid' });
	});
	it('a slide axis leaves the other axes alone', () => {
		let chunk = '<!-- @meta{layout=kpi, class=spectrum-solid spectrum-left} -->';
		chunk = setSpectrumWeight(chunk, 'band');
		expect(getClassTokens(chunk)).toEqual(['kpi', 'spectrum-solid', 'spectrum-left', 'spectrum-band']);
		chunk = setSpectrumEdge(chunk, null);
		expect(getClassTokens(chunk)).toEqual(['kpi', 'spectrum-solid', 'spectrum-band']);
	});
	it('setSpectrum writes off/solid, never stacks, and null clears to inherit/rainbow', () => {
		let chunk = '<!-- @meta{layout=kpi, class=spectrum-solid} -->';
		chunk = setSpectrum(chunk, 'off');
		expect(getClassTokens(chunk).filter((t) => /spectrum/.test(t))).toEqual(['no-spectrum']);
		expect(getClassTokens(setSpectrum(chunk, null)).some((t) => /spectrum/.test(t))).toBe(false);
	});
	it('setSpectrum writes the restore token `with-spectrum`, which reads back as this slide\'s own choice', () => {
		const src = deck('spectrum: solid', '<!-- @meta{layout=kpi} -->');
		const chunk = setSpectrum('<!-- @meta{layout=kpi, class=spectrum-solid} -->', 'rainbow');
		expect(getClassTokens(chunk).filter((t) => /spectrum/.test(t))).toEqual(['with-spectrum']);
		expect(spectrumProvenance(chunk, src)).toMatchObject({ state: 'on', value: 'rainbow', deckValue: 'solid' });
	});
});

describe('restore tokens (each register default as a per-slide choice)', () => {
	const cases = [
		['spectrum: left', setSpectrumEdge, spectrumEdgeProvenance, 'top', 'spectrum-top'],
		['spectrum: band', setSpectrumWeight, spectrumWeightProvenance, 'regular', 'spectrum-regular'],
		['rule: accent', setRule, ruleProvenance, 'auto', 'rule-auto'],
		['eyebrow: dot', setEyebrow, eyebrowProvenance, 'plain', 'eyebrow-plain'],
		['headline: center', setHeadline, headlineProvenance, 'auto', 'head-auto'],
		['card-spectrum: rainbow top', setCardEdge, cardEdgeProvenance, 'left', 'card-spectrum-left'],
	] as const;
	for (const [fm, set, read, name, token] of cases) {
		it(`${fm}: the default \`${name}\` writes \`${token}\` and reads back as the slide's own value`, () => {
			const src = deck(fm, '<!-- @meta{layout=kpi} -->');
			expect(read('<!-- @meta{layout=kpi} -->', src)).toMatchObject({ state: 'inherited', inheritable: true });
			const chunk = set('<!-- @meta{layout=kpi} -->', name);
			expect(getClassTokens(chunk)).toContain(token);
			expect(read(chunk, src)).toMatchObject({ state: 'on', value: name });
			// null takes the token away again: the slide follows the deck.
			expect(getClassTokens(set(chunk, null))).not.toContain(token);
		});
	}
});

describe('backdrop provenance (the register over any finish)', () => {
	it('reads each axis from the one deck line, and a slide token overrides only its axis', async () => {
		const { backdropProvenance, setBackdrop, deckBackdrop, backdropDeckValue } = await import('./slide-provenance');
		const src = deck('finish: atrium\nbackdrop: 40 clear  # quiet', '## A');
		expect(deckBackdrop(src)).toEqual({ strength: '40', mask: 'clear' });
		const chunk = '<!-- @meta{class=backdrop-spot-tr} -->\n\n## A';
		expect(backdropProvenance(chunk, src, 'mask')).toMatchObject({ state: 'on', value: 'spot-tr', deckValue: 'clear' });
		expect(backdropProvenance(chunk, src, 'strength')).toMatchObject({ state: 'inherited', value: '40' });
		const set = setBackdrop(chunk, 'strength', 'full');
		expect(getClassTokens(set)).toEqual(['backdrop-spot-tr', 'backdrop-full']);
		expect(getClassTokens(setBackdrop(set, 'mask', null))).toEqual(['backdrop-full']);
		expect(backdropDeckValue(undefined, undefined)).toBeNull();
		expect(backdropDeckValue('60', 'clear')).toBe('60 clear');
	});

	it("never reads finish-override's nested `backdrop:` header as the register", async () => {
		const { deckBackdrop } = await import('./slide-provenance');
		expect(deckBackdrop(deck('finish: atrium\nfinish-override:\n  backdrop:\n    strength: 0.4', '## A'))).toEqual({});
	});
});

describe('marks provenance + override', () => {
	const slide = '<!-- @meta{layout=bar} -->\n\n## Revenue';
	it('off (not inheritable) when the deck sets no finish or names the default', () => {
		expect(marksProvenance(slide, deck('theme: indaco', slide))).toMatchObject({ state: 'off', inheritable: false });
		expect(marksProvenance(slide, deck('marks: pigment', slide))).toMatchObject({ state: 'off', inheritable: false });
	});
	it('a word that is not a finish reads as the default, as the engine renders it', () => {
		expect(marksProvenance(slide, deck('marks: off', slide))).toMatchObject({ state: 'off', inheritable: false });
	});
	it('inherited from the deck finish', () => {
		expect(marksProvenance(slide, deck('marks: tone', slide))).toMatchObject({ state: 'inherited', value: 'tone', deckValue: 'tone' });
	});
	it('reads the finish word out of a two-word value, in either order', () => {
		expect(marksProvenance(slide, deck('marks: tone vivid', slide))).toMatchObject({ state: 'inherited', value: 'tone', deckValue: 'tone' });
		expect(marksProvenance(slide, deck('marks: vivid etch', slide))).toMatchObject({ state: 'inherited', value: 'etch', deckValue: 'etch' });
		expect(marksProvenance(slide, deck('marks: pigment vivid', slide))).toMatchObject({ state: 'off', inheritable: false });
	});
	it('a slide asks for the default inside a finished deck with its own pigment token', () => {
		const own = '<!-- @meta{layout=bar, class=marks-pigment} -->\n\n## Revenue';
		expect(marksProvenance(own, deck('marks: tone', own))).toMatchObject({ state: 'on', value: 'pigment', deckValue: 'tone' });
	});
	it('chart-finish-off is not a finish token any more, so it is just an unknown class', () => {
		const stale = '<!-- @meta{layout=bar, class=chart-finish-off} -->\n\n## Revenue';
		expect(marksProvenance(stale, deck('marks: tone', stale))).toMatchObject({ state: 'inherited', value: 'tone' });
	});
	it('the old chart-finish spelling is read, on the slide and in the deck, and a pick replaces the old token', () => {
		const old = '<!-- @meta{layout=bar, class=chart-finish-tone} -->\n\n## Revenue';
		expect(marksProvenance(old, deck('marks: etch', old))).toMatchObject({ state: 'on', value: 'tone', deckValue: 'etch' });
		expect(marksProvenance(slide, deck('chart-finish: tone', slide))).toMatchObject({ state: 'inherited', value: 'tone' });
		expect(getClassTokens(setMarks(old, 'etch'))).toEqual(['bar', 'marks-etch']);
		expect(getClassTokens(setMarks(old, null))).toEqual(['bar']);
	});
	it('setMarks swaps the one token and keeps the component; null clears it', () => {
		const on = setMarks(slide, 'etch');
		expect(getClassTokens(on)).toEqual(['bar', 'marks-etch']);
		expect(getClassTokens(setMarks(on, 'tone'))).toEqual(['bar', 'marks-tone']);
		expect(getClassTokens(setMarks(on, null))).toEqual(['bar']);
	});
});

describe('card-tag provenance (the `tag:` register)', () => {
	it('mirrors the kernel word lists exactly', async () => {
		const { CARD_TAG_AXES } = await import('./slide-provenance');
		const kernel = await import('../../../../lib/core/resolve-card-tag.js');
		expect(CARD_TAG_AXES).toEqual(kernel.CARD_TAG_AXES);
	});

	it('reads the deck line per axis, overrides one axis per slide, and writes the line back', async () => {
		const { cardTagProvenance, setCardTag, deckCardTag, cardTagDeckValue } = await import('./slide-provenance');
		const src = deck('tag: plain band center  # quiet', '## A');
		expect(deckCardTag(src)).toEqual({ color: 'plain', placement: 'band', align: 'center' });
		const chunk = '<!-- @meta{layout=decision, class=tag-foot} -->\n\n## A';
		expect(cardTagProvenance(chunk, src, 'placement')).toMatchObject({ state: 'on', value: 'foot', deckValue: 'band' });
		expect(cardTagProvenance(chunk, src, 'color')).toMatchObject({ state: 'inherited', value: 'plain' });
		expect(cardTagProvenance(chunk, src, 'size')).toMatchObject({ state: 'off' });
		const set = setCardTag(chunk, 'placement', 'notch');
		expect(getClassTokens(set)).toEqual(['decision', 'tag-notch']);
		expect(getClassTokens(setCardTag(set, 'placement', null))).toEqual(['decision']);
		// banner-tag is a modifier, not a register token: the placement setter leaves it alone.
		expect(getClassTokens(setCardTag('<!-- @meta{layout=decision, class=banner-tag} -->\n', 'placement', 'foot'))).toEqual(['decision', 'banner-tag', 'tag-foot']);
		expect(cardTagDeckValue({})).toBeNull();
		expect(cardTagDeckValue({ align: 'end', color: 'none', placement: undefined })).toBe('none end');
	});
});

describe('image-card provenance (the `image-card:` register)', () => {
	it('mirrors the kernel word → class maps exactly', async () => {
		const { IMAGE_CARD_AXES } = await import('./slide-provenance');
		const kernel = await import('../../../../lib/core/resolve-image-card.js');
		const axes: readonly { axis: string; names: readonly string[]; tokens: readonly string[] }[] = kernel.IMAGE_CARD_REGISTER.AXES;
		// Same axes in the same order, each word mapped to the same class, in the same order (the
		// first word on each axis is its default).
		expect(Object.keys(IMAGE_CARD_AXES)).toEqual(axes.map((a) => a.axis));
		for (const a of axes) {
			expect(Object.entries(IMAGE_CARD_AXES[a.axis as keyof typeof IMAGE_CARD_AXES])).toEqual(a.names.map((n, i) => [n, a.tokens[i]]));
		}
	});

	it('reads the deck line per axis, overrides one axis per slide by its class, and writes the line back', async () => {
		const { imageCardProvenance, setImageCard, deckImageCard, imageCardDeckValue } = await import('./slide-provenance');
		const src = deck('image-card: top-right soft compact  # quiet', '## A');
		expect(deckImageCard(src)).toEqual({ placement: 'top-right', backing: 'soft', density: 'compact' });
		const chunk = '<!-- @meta{layout=image, class=spotlight image-card-bottom-left image-card-regular} -->\n\n## A';
		expect(imageCardProvenance(chunk, src, 'placement')).toMatchObject({ state: 'on', value: 'bottom-left', deckValue: 'top-right' });
		expect(imageCardProvenance(chunk, src, 'density')).toMatchObject({ state: 'on', value: 'regular', deckValue: 'compact' });
		expect(imageCardProvenance(chunk, src, 'backing')).toMatchObject({ state: 'inherited', value: 'soft' });
		expect(imageCardProvenance(chunk, src, 'ink')).toMatchObject({ state: 'off' });
		const set = setImageCard(chunk, 'placement', 'center');
		expect(getClassTokens(set)).toEqual(['image', 'spotlight', 'image-card-regular', 'image-card-center']);
		expect(getClassTokens(setImageCard(set, 'placement', null))).toEqual(['image', 'spotlight', 'image-card-regular']);
		expect(getClassTokens(setImageCard(set, 'density', 'compact'))).toEqual(['image', 'spotlight', 'image-card-center', 'image-card-compact']);
		expect(imageCardDeckValue({})).toBeNull();
		expect(imageCardDeckValue({ size: 'sm', placement: 'top', ink: undefined })).toBe('top sm');
	});
});

describe('the deck image-card line, as classes', () => {
	const deck = (fm: string) => `---\ntitle: T\n${fm}---\n\n`;

	it('maps the deck line to the classes it stamps', async () => {
		const { deckImageCardClasses } = await import('./slide-provenance');
		expect(deckImageCardClasses(deck('image-card: bottom 35% light\n'))).toEqual(['image-card-bottom', 'image-card-35', 'image-card-light']);
		expect(deckImageCardClasses(deck(''))).toEqual([]);
	});
});
