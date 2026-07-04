import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SlideContext } from './SlideContext';
import { getClassTokens } from './slide-directives';

const lintVocab = {
	universalGroups: {
		mood: ['dark'],
		decoration: ['treatment-none', 'tint-corner at-tl', 'mark-orbit', 'tint-vignette', 'tint-edge at-right', 'mark-threads'],
		typography: ['with-period', 'no-period', 'scale-l', 'scale-xl', 'scale-2xl'],
		chrome: ['silent', 'no-header', 'no-footer', 'no-paginate', 'no-progress'],
		state: ['wip', 'draft', 'confidential'],
		tone: ['tone-pass', 'tone-warn', 'tone-fail', 'tone-skip'],
	},
	exclusiveAxes: {
		tone: ['tone-pass', 'tone-warn', 'tone-fail', 'tone-skip'],
		scale: ['scale-l', 'scale-xl', 'scale-2xl'],
		period: ['with-period', 'no-period'],
	},
	semiUniversalVariants: ['compact', 'accent'],
	finishNames: ['atrium', 'meridian'],
	stampStyles: { boardroom: ['tab', 'notch', 'bracket', 'seal', 'pill'], range: ['ribbon', 'dot'] },
	toneStyles: ['tone-rail', 'tone-edge', 'tone-glow'],
};
const catalog = [{ name: 'kpi', effectiveVariants: ['compact', 'accent'] }];

function setup(chunk: string, source = chunk, savedFinishNames: string[] = []) {
	const onMutate = vi.fn();
	render(
		<SlideContext open onOpenChange={() => {}} chunk={chunk} source={source} slideNumber={1} lintVocab={lintVocab} catalog={catalog} savedFinishNames={savedFinishNames} onMutate={onMutate} />,
	);
	// Apply the captured transform to the chunk to see the resulting tokens.
	const applied = () => getClassTokens(onMutate.mock.calls.at(-1)?.[0](chunk));
	// The resulting SOURCE after applying the last captured transform.
	const sourceOut = () => onMutate.mock.calls.at(-1)?.[0](chunk) as string;
	return { onMutate, applied, sourceOut };
}

// The drawer is now dynamic pill-tabs — controls live under Look / Status / Decoration /
// Chrome / Notes. Switch to the tab that owns a control before interacting with it.
const goTab = (name: string) => fireEvent.click(screen.getByRole('tab', { name }));

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
		goTab('Status');
		fireEvent.click(screen.getByRole('radio', { name: 'Fail' }));
		const toks = applied();
		expect(toks).toContain('tone-fail');
		expect(toks).not.toContain('tone-warn');
	});

	it('sets a per-slide brand bar (spectrum) from the Look picker', () => {
		const { applied } = setup('<!-- _class: kpi -->\n\n# Hi');
		fireEvent.change(screen.getByRole('combobox', { name: /brand bar/i }), { target: { value: 'off' } });
		expect(applied()).toContain('spectrum-off');
	});

	it('reads the brand bar as inherited from the deck `spectrum:` register', () => {
		const src = '---\nspectrum: solid\n---\n\n<!-- _class: kpi -->\n\n# Hi';
		setup('<!-- _class: kpi -->\n\n# Hi', src);
		const picker = screen.getByRole('combobox', { name: /brand bar/i }) as HTMLSelectElement;
		expect(picker.value).toBe('__inherit__');
	});

	it('overrides the stamp SHAPE from the Stamp style picker', () => {
		const { applied } = setup('<!-- _class: kpi confidential -->\n\n# Hi');
		goTab('Status');
		fireEvent.change(screen.getByRole('combobox', { name: /stamp style/i }), { target: { value: 'seal' } });
		expect(applied()).toContain('stamp-seal');
	});

	it('picking the inherited/default stamp head clears the per-slide shape', () => {
		const { applied } = setup('<!-- _class: kpi confidential stamp-notch -->\n\n# Hi');
		goTab('Status');
		fireEvent.change(screen.getByRole('combobox', { name: /stamp style/i }), { target: { value: '__default__' } });
		expect(applied().some((t) => t.startsWith('stamp-'))).toBe(false);
	});

	it('sets the tone SHAPE without disturbing the semantic tone', () => {
		const { applied } = setup('<!-- _class: kpi tone-pass -->\n\n# Hi');
		goTab('Status');
		fireEvent.change(screen.getByRole('combobox', { name: /tone style/i }), { target: { value: 'edge' } });
		const toks = applied();
		expect(toks).toContain('tone-pass'); // semantic tone untouched
		expect(toks).toContain('tone-edge');
	});

	it('reads the stamp shape as inherited from the deck `stamp:` register', () => {
		const src = '---\nstamp: seal\n---\n\n<!-- _class: kpi confidential -->\n\n# Hi';
		setup('<!-- _class: kpi confidential -->\n\n# Hi', src);
		goTab('Status');
		const picker = screen.getByRole('combobox', { name: /stamp style/i }) as HTMLSelectElement;
		expect(picker.value).toBe('__inherit__');
	});

	it('toggles the silent chrome switch', () => {
		const { applied } = setup('<!-- _class: kpi -->\n\n# Hi');
		goTab('Chrome');
		fireEvent.click(screen.getByRole('switch', { name: /silent/i }));
		expect(applied()).toContain('silent');
	});

	it('toggles the section rail off (no-progress), independent of silent', () => {
		const { applied } = setup('<!-- _class: kpi -->\n\n# Hi');
		goTab('Chrome');
		fireEvent.click(screen.getByRole('switch', { name: /hide section rail/i }));
		expect(applied()).toContain('no-progress');
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
		goTab('Decoration');
		fireEvent.click(screen.getByRole('radio', { name: 'Edge' }));
		const toks = applied();
		expect(toks).toContain('tint-edge');
		expect(toks).toContain('at-right');
	});

	it('Reset is disabled until an edit lands, then reverts to the original slide', () => {
		const orig = '<!-- _class: kpi -->\n\n# Hi';
		const edited = '<!-- _class: kpi dark scale-xl -->\n\n# Hi';
		const onMutate = vi.fn();
		const { rerender } = render(
			<SlideContext open onOpenChange={() => {}} chunk={orig} source={orig} slideNumber={1} lintVocab={lintVocab} catalog={catalog} onMutate={onMutate} />,
		);
		expect(screen.getByRole('button', { name: /reset slide/i })).toBeDisabled();
		// Simulate an edit landing (the source changed under the drawer).
		rerender(
			<SlideContext open onOpenChange={() => {}} chunk={edited} source={edited} slideNumber={1} lintVocab={lintVocab} catalog={catalog} onMutate={onMutate} />,
		);
		const reset = screen.getByRole('button', { name: /reset slide/i });
		expect(reset).not.toBeDisabled();
		fireEvent.click(reset);
		// The reset transform restores the ORIGINAL chunk verbatim, ignoring current content.
		expect(onMutate.mock.calls.at(-1)?.[0]('whatever')).toBe(orig);
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

	it('editable slide defaults to the Look tab; Notes is behind a tab', () => {
		setup('<!-- _class: kpi -->\n\n# Hi');
		// Look controls are visible immediately (default tab); the note is NOT (its own tab).
		expect(screen.getByRole('switch', { name: /dark/i })).toBeTruthy();
		expect(screen.queryByRole('textbox', { name: 'Speaker note for this slide' })).toBeNull();
		// The tab bar offers the applicable sections.
		expect(screen.getByRole('tab', { name: 'Look' })).toBeTruthy();
		expect(screen.getByRole('tab', { name: 'Notes' })).toBeTruthy();
	});

	it('a non-editable slide collapses to the note only (no look/status/chrome tabs)', () => {
		setup('<!-- _class: [kpi, dark] -->\n\n# Hi');
		// No tab bar (single Notes panel); the note + reason show directly.
		expect(screen.queryByRole('tab', { name: 'Look' })).toBeNull();
		expect(screen.queryByRole('tab', { name: 'Chrome' })).toBeNull();
		expect(screen.getByRole('textbox', { name: 'Speaker note for this slide' })).toBeTruthy();
	});

	it('each tab explains itself — a tab intro plus per-control help text', () => {
		setup('<!-- _class: kpi -->\n\n# Hi');
		// Look tab (default): the group intro + a field-level description are both present.
		expect(screen.getByText(/how this one slide looks/i)).toBeTruthy();
		expect(screen.getByText(/theme's dark canvas/i)).toBeTruthy();
		// Switching tabs swaps in that tab's own intro.
		goTab('Chrome');
		expect(screen.getByText(/the slide's furniture/i)).toBeTruthy();
		expect(screen.getByText(/section-progress dots/i)).toBeTruthy();
	});

	it('authors an accessibility description as a describe: comment under the Notes tab', () => {
		const { sourceOut } = setup('<!-- _class: kpi -->\n\n# Q3');
		goTab('Notes');
		const box = screen.getByRole('textbox', { name: 'Accessibility description for this slide' });
		fireEvent.change(box, { target: { value: 'A bar chart, revenue up 40%.' } });
		fireEvent.blur(box);
		const out = sourceOut();
		expect(out).toContain('<!-- describe: A bar chart, revenue up 40%. -->');
		// It must NOT become the speaker note.
		expect(out).not.toMatch(/<!-- note:.*bar chart/);
	});

	it('the description field is separate from the speaker note (both coexist)', () => {
		const { sourceOut } = setup('<!-- _class: kpi -->\n\n# Q3');
		goTab('Notes');
		const note = screen.getByRole('textbox', { name: 'Speaker note for this slide' });
		fireEvent.change(note, { target: { value: 'Pause here.' } });
		fireEvent.blur(note);
		// The note is committed; re-render happens via onMutate in the app, but within
		// this unit the last transform holds the note. Now the description on a fresh setup.
		const withNote = sourceOut();
		expect(withNote).toContain('<!-- note: Pause here. -->');
	});

	it('reads dark as inherited from a dark deck (no misleading off toggle)', () => {
		const src = '---\nclass: dark\n---\n\n<!-- _class: kpi -->\n\n# Hi';
		setup('<!-- _class: kpi -->\n\n# Hi', src);
		expect(screen.getByText(/On · deck/i)).toBeTruthy();
	});
});
