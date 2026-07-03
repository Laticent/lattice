import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SlideContext } from './SlideContext';
import { getClassTokens } from './slide-directives';

const lintVocab = {
	universalGroups: {
		mood: ['dark'],
		decoration: ['treatment-none', 'tint-corner at-tl', 'mark-orbit', 'tint-vignette', 'tint-edge at-right', 'mark-threads'],
		typography: ['with-period', 'no-period', 'scale-l', 'scale-xl', 'scale-2xl'],
		chrome: ['silent', 'no-header', 'no-footer', 'no-paginate'],
		state: ['wip', 'draft', 'confidential'],
		tone: ['tone-pass', 'tone-warn', 'tone-fail', 'tone-skip'],
	},
	exclusiveAxes: {
		tone: ['tone-pass', 'tone-warn', 'tone-fail', 'tone-skip'],
		scale: ['scale-l', 'scale-xl', 'scale-2xl'],
		period: ['with-period', 'no-period'],
		density: ['compact', 'loose'],
	},
	semiUniversalVariants: ['compact', 'loose', 'accent'],
	finishNames: ['atrium', 'meridian'],
};
const catalog = [{ name: 'kpi', effectiveVariants: ['compact', 'loose', 'accent'] }];

function setup(chunk: string, source = chunk, savedFinishNames: string[] = []) {
	const onMutate = vi.fn();
	render(
		<SlideContext open onOpenChange={() => {}} chunk={chunk} source={source} slideNumber={1} lintVocab={lintVocab} catalog={catalog} savedFinishNames={savedFinishNames} onMutate={onMutate} />,
	);
	// Apply the captured transform to the chunk to see the resulting tokens.
	const applied = () => getClassTokens(onMutate.mock.calls.at(-1)?.[0](chunk));
	return { onMutate, applied };
}

describe('SlideContext drawer', () => {
	it('toggles dark on', () => {
		const { onMutate, applied } = setup('<!-- _class: kpi -->\n\n# Hi');
		fireEvent.click(screen.getByRole('switch', { name: /dark/i }));
		expect(onMutate).toHaveBeenCalled();
		expect(applied()).toContain('dark');
	});

	it('sets a type scale via the segmented control', () => {
		const { applied } = setup('<!-- _class: kpi -->\n\n# Hi');
		fireEvent.click(screen.getByRole('radio', { name: 'XL' }));
		expect(applied()).toEqual(['kpi', 'scale-xl']);
	});

	it('single-selects a tone (and swaps, not stacks)', () => {
		const { applied } = setup('<!-- _class: kpi tone-warn -->\n\n# Hi');
		fireEvent.click(screen.getByRole('radio', { name: 'Fail' }));
		const toks = applied();
		expect(toks).toContain('tone-fail');
		expect(toks).not.toContain('tone-warn');
	});

	it('toggles the silent chrome switch', () => {
		const { applied } = setup('<!-- _class: kpi -->\n\n# Hi');
		fireEvent.click(screen.getByRole('switch', { name: /silent/i }));
		expect(applied()).toContain('silent');
	});

	it('sets a per-slide finish from the picker', () => {
		const { applied } = setup('<!-- _class: kpi -->\n\n# Hi');
		fireEvent.change(screen.getByRole('combobox', { name: /finish/i }), { target: { value: 'meridian' } });
		expect(applied()).toContain('finish-meridian');
	});

	it('writes a SAVED finish as bare finish-<name>, not a double prefix', () => {
		const { applied } = setup('<!-- _class: kpi -->\n\n# Hi', '<!-- _class: kpi -->\n\n# Hi', ['velvet']);
		fireEvent.change(screen.getByRole('combobox', { name: /finish/i }), { target: { value: 'velvet' } });
		const toks = applied();
		expect(toks).toContain('finish-velvet');
		expect(toks).not.toContain('finish-finish-velvet');
	});

	it('applies a decoration tint phrase (token + placement together)', () => {
		const { applied } = setup('<!-- _class: kpi -->\n\n# Hi');
		fireEvent.click(screen.getByRole('radio', { name: 'Edge' }));
		const toks = applied();
		expect(toks).toContain('tint-edge');
		expect(toks).toContain('at-right');
	});

	it('shows the emitted _class line', () => {
		setup('<!-- _class: kpi dark -->\n\n# Hi');
		expect(screen.getByText(/kpi dark/)).toBeTruthy();
	});

	it('goes read-only on a non-editable class shape', () => {
		setup('<!-- _class: [kpi, dark] -->\n\n# Hi');
		expect(screen.getByText(/hand-authored/i)).toBeTruthy();
		expect(screen.queryByRole('switch', { name: /dark/i })).toBeNull();
	});

	it('reads dark as inherited from a dark deck (no misleading off toggle)', () => {
		const src = '---\nclass: dark\n---\n\n<!-- _class: kpi -->\n\n# Hi';
		setup('<!-- _class: kpi -->\n\n# Hi', src);
		expect(screen.getByText(/On · deck/i)).toBeTruthy();
	});
});
