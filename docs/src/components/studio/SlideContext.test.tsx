import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { connectOpenRouter, generateDescription, useArchitectStatus } from './architect';
import { SlideContextBody } from './SlideContext';
import { listComments } from './slide-comments';
import { getClassTokens } from './slide-directives';

// The architect module is a network/model boundary — mock it so the confirm-gate +
// Connect tests drive state deterministically. `useArchitectStatus` defaults to a
// cloud-connected model (so the Generate button shows); a test flips it to offline.
vi.mock('./architect', () => ({
	generateDescription: vi.fn(),
	connectOpenRouter: vi.fn(() => Promise.resolve()),
	useArchitectStatus: vi.fn(() => ({ openRouterReady: true })),
}));
const mockGenerate = vi.mocked(generateDescription);
const mockConnect = vi.mocked(connectOpenRouter);
const mockStatus = vi.mocked(useArchitectStatus);

beforeEach(() => {
	mockStatus.mockReturnValue({ openRouterReady: true } as ReturnType<typeof useArchitectStatus>);
	mockConnect.mockClear();
});

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
	const savedFinish = savedFinishNames.map((n) => ({ id: n, name: n, label: n.charAt(0).toUpperCase() + n.slice(1) }));
	render(
		<SlideContextBody open chunk={chunk} source={source} slideNumber={1} lintVocab={lintVocab} catalog={catalog} savedFinish={savedFinish} onMutate={onMutate} />,
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

// The finish/brand-bar/stamp/tone pickers are shadcn (Radix) Selects now — a
// combobox trigger + a portal listbox — so drive them the way a user does:
// open the trigger, then click the option by its visible label. (jsdom polyfills
// for pointer capture / scrollIntoView live in vitest.setup.ts.)
async function pickOption(comboName: RegExp, optionName: RegExp | string) {
	const user = userEvent.setup();
	await user.click(screen.getByRole('combobox', { name: comboName }));
	await user.click(await screen.findByRole('option', { name: optionName }));
}
// Read which option a Select currently shows as selected (replaces reading a
// native <select>.value): open it and return the checked option's text.
async function selectedOptionText(comboName: RegExp): Promise<string> {
	const user = userEvent.setup();
	await user.click(screen.getByRole('combobox', { name: comboName }));
	return (await screen.findByRole('option', { selected: true })).textContent ?? '';
}

describe('SlideContextBody controls', () => {
	beforeEach(() => localStorage.clear());

	it('shows a Comments tab only with a deckId, and adds a comment for the slide', () => {
		const onMutate = vi.fn();
		render(
			<SlideContextBody open deckId="d1" chunk="<!-- _class: kpi -->\n\n# Hi" source="<!-- _class: kpi -->\n\n# Hi" slideNumber={3} lintVocab={lintVocab} catalog={catalog} onMutate={onMutate} />,
		);
		goTab('Comments');
		fireEvent.change(screen.getByRole('textbox', { name: 'New comment for this slide' }), { target: { value: 'Check this figure.' } });
		fireEvent.click(screen.getByRole('button', { name: /add comment/i }));
		const stored = listComments('d1');
		expect(stored).toHaveLength(1);
		expect(stored[0]).toMatchObject({ slide: 3, body: 'Check this figure.', resolved: false });
		// Comments never touch the deck source.
		expect(onMutate).not.toHaveBeenCalled();
	});

	it('has no Comments tab without a deckId', () => {
		setup('<!-- _class: kpi -->\n\n# Hi'); // setup passes no deckId
		expect(screen.queryByRole('tab', { name: 'Comments' })).toBeNull();
	});

	it('sets the slide canvas to dark', () => {
		const { onMutate, applied } = setup('<!-- _class: kpi -->\n\n# Hi');
		fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
		expect(onMutate).toHaveBeenCalled();
		expect(applied()).toContain('dark');
	});

	it('pins the slide canvas to LIGHT even inside a dark deck', () => {
		const { applied } = setup('<!-- _class: kpi -->\n\n# Hi', '---\nclass: dark\n---\n\n<!-- _class: kpi -->\n\n# Hi');
		fireEvent.click(screen.getByRole('radio', { name: 'Light' }));
		expect(applied()).toContain('light');
		expect(applied()).not.toContain('dark');
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

	it('sets a per-slide brand bar (spectrum) from the Brand picker', async () => {
		const { applied } = setup('<!-- _class: kpi -->\n\n# Hi');
		goTab('Brand');
		await pickOption(/brand bar/i, 'None');
		expect(applied()).toContain('spectrum-off');
	});

	it('reads the brand bar as inherited from the deck `spectrum:` register', async () => {
		const src = '---\nspectrum: solid\n---\n\n<!-- _class: kpi -->\n\n# Hi';
		setup('<!-- _class: kpi -->\n\n# Hi', src);
		goTab('Brand');
		expect(await selectedOptionText(/brand bar/i)).toMatch(/inherit/i);
	});

	it('overrides the stamp SHAPE from the Stamp style picker', async () => {
		const { applied } = setup('<!-- _class: kpi confidential -->\n\n# Hi');
		goTab('Status');
		await pickOption(/stamp style/i, 'Seal');
		expect(applied()).toContain('stamp-seal');
	});

	it('picking the inherited/default stamp head clears the per-slide shape', async () => {
		const { applied } = setup('<!-- _class: kpi confidential stamp-notch -->\n\n# Hi');
		goTab('Status');
		await pickOption(/stamp style/i, /Default/);
		expect(applied().some((t) => t.startsWith('stamp-'))).toBe(false);
	});

	it('sets the tone SHAPE without disturbing the semantic tone', async () => {
		const { applied } = setup('<!-- _class: kpi tone-pass -->\n\n# Hi');
		goTab('Status');
		await pickOption(/tone style/i, 'Edge');
		const toks = applied();
		expect(toks).toContain('tone-pass'); // semantic tone untouched
		expect(toks).toContain('tone-edge');
	});

	it('reads the stamp shape as inherited from the deck `stamp:` register', async () => {
		const src = '---\nstamp: seal\n---\n\n<!-- _class: kpi confidential -->\n\n# Hi';
		setup('<!-- _class: kpi confidential -->\n\n# Hi', src);
		goTab('Status');
		expect(await selectedOptionText(/stamp style/i)).toMatch(/inherit/i);
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

	it('sets a per-slide finish from the picker', async () => {
		const { applied } = setup('<!-- _class: kpi -->\n\n# Hi');
		await pickOption(/finish/i, 'Meridian');
		expect(applied()).toContain('finish-meridian');
	});

	it('writes a SAVED finish as bare finish-<name>, not a double prefix', async () => {
		const { applied } = setup('<!-- _class: kpi -->\n\n# Hi', '<!-- _class: kpi -->\n\n# Hi', ['velvet']);
		await pickOption(/finish/i, 'Velvet');
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
			<SlideContextBody open chunk={orig} source={orig} slideNumber={1} lintVocab={lintVocab} catalog={catalog} onMutate={onMutate} />,
		);
		expect(screen.getByRole('button', { name: /reset slide/i })).toBeDisabled();
		// Simulate an edit landing (the source changed under the drawer).
		rerender(
			<SlideContextBody open chunk={edited} source={edited} slideNumber={1} lintVocab={lintVocab} catalog={catalog} onMutate={onMutate} />,
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
		expect(screen.queryByRole('radio', { name: 'Auto' })).toBeNull();
	});

	it('editable slide defaults to the Look tab; Notes is behind a tab', () => {
		setup('<!-- _class: kpi -->\n\n# Hi');
		// Look controls are visible immediately (default tab); the note is NOT (its own tab).
		expect(screen.getByRole('radio', { name: 'Auto' })).toBeTruthy();
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
		expect(screen.getByText(/light or dark surface for this one slide/i)).toBeTruthy();
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

	it('authors a read-as caption as a caption: comment under the Notes tab', () => {
		const { sourceOut } = setup('<!-- _class: kpi -->\n\n# Q3');
		goTab('Notes');
		const box = screen.getByRole('textbox', { name: 'Read-as caption for this slide' });
		fireEvent.change(box, { target: { value: 'Revenue grew forty percent across three quarters.' } });
		fireEvent.blur(box);
		const out = sourceOut();
		expect(out).toContain('<!-- caption: Revenue grew forty percent across three quarters. -->');
	});

	it('the note field warns that a caption overrides it when one is set', () => {
		// Precedence is caption → note; with a caption present, the note does NOT narrate.
		setup('<!-- _class: kpi -->\n\n# Q3\n\n<!-- caption: The board-facing line. -->');
		goTab('Notes');
		expect(screen.getByText(/caption, which overrides the note/i)).toBeTruthy();
	});

	it('the note field shows the plain read-aloud hint when NO caption is set', () => {
		setup('<!-- _class: kpi -->\n\n# Q3');
		goTab('Notes');
		expect(screen.getByText(/Read aloud in Present/i)).toBeTruthy();
		expect(screen.queryByText(/overrides the note/i)).toBeNull();
	});

	it('the caption field is separate from the speaker note (both channels coexist)', () => {
		const { sourceOut } = setup('<!-- _class: kpi -->\n\n# Q3\n\n<!-- Say this warmly. -->');
		goTab('Notes');
		const cap = screen.getByRole('textbox', { name: 'Read-as caption for this slide' });
		fireEvent.change(cap, { target: { value: 'The board-facing line.' } });
		fireEvent.blur(cap);
		const out = sourceOut();
		expect(out).toContain('<!-- caption: The board-facing line. -->');
		expect(out).toContain('<!-- Say this warmly. -->'); // the note survives untouched
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

	it('an UNCONFIRMED AI draft does NOT commit on blur (a wrong alt is worse than none)', async () => {
		mockGenerate.mockResolvedValue({ status: 'ok', text: 'AI-suggested description.' });
		const { onMutate } = setup('<!-- _class: kpi -->\n\n# Q3');
		goTab('Notes');
		fireEvent.click(screen.getByRole('button', { name: /generate/i }));
		// The draft lands in the field and the confirm affordance appears…
		await screen.findByRole('button', { name: /use it/i });
		expect((screen.getByRole('textbox', { name: 'Accessibility description for this slide' }) as HTMLTextAreaElement).value).toBe('AI-suggested description.');
		// …but blurring the box must NOT write the unread AI text to the slide.
		fireEvent.blur(screen.getByRole('textbox', { name: 'Accessibility description for this slide' }));
		expect(onMutate).not.toHaveBeenCalled();
	});

	it('clicking "Use it" commits the AI draft as a describe: comment', async () => {
		mockGenerate.mockResolvedValue({ status: 'ok', text: 'AI-suggested description.' });
		const { onMutate, sourceOut } = setup('<!-- _class: kpi -->\n\n# Q3');
		goTab('Notes');
		fireEvent.click(screen.getByRole('button', { name: /generate/i }));
		fireEvent.click(await screen.findByRole('button', { name: /use it/i }));
		expect(onMutate).toHaveBeenCalled();
		expect(sourceOut()).toContain('<!-- describe: AI-suggested description. -->');
	});

	it('editing the AI draft by hand takes ownership — a subsequent blur DOES commit', async () => {
		mockGenerate.mockResolvedValue({ status: 'ok', text: 'AI-suggested description.' });
		const { onMutate, sourceOut } = setup('<!-- _class: kpi -->\n\n# Q3');
		goTab('Notes');
		fireEvent.click(screen.getByRole('button', { name: /generate/i }));
		const box = await screen.findByRole('textbox', { name: 'Accessibility description for this slide' });
		// Typing clears the AI-draft flag (the author now owns the text).
		fireEvent.change(box, { target: { value: 'Edited by hand.' } });
		await waitFor(() => expect(screen.queryByRole('button', { name: /use it/i })).toBeNull());
		fireEvent.blur(box);
		expect(onMutate).toHaveBeenCalled();
		expect(sourceOut()).toContain('<!-- describe: Edited by hand. -->');
	});

	it('with no cloud model, the Description offers a Connect button instead of Generate', () => {
		mockStatus.mockReturnValue({ openRouterReady: false } as ReturnType<typeof useArchitectStatus>);
		setup('<!-- _class: kpi -->\n\n# Q3');
		goTab('Notes');
		// Generate is gone (it can't work without cloud); a one-tap Connect stands in.
		expect(screen.queryByRole('button', { name: /generate/i })).toBeNull();
		const connect = screen.getByRole('button', { name: /connect a cloud model/i });
		fireEvent.click(connect);
		expect(mockConnect).toHaveBeenCalledTimes(1);
	});

	it('once a cloud model is connected, the Description shows Generate (not Connect)', () => {
		mockStatus.mockReturnValue({ openRouterReady: true } as ReturnType<typeof useArchitectStatus>);
		setup('<!-- _class: kpi -->\n\n# Q3');
		goTab('Notes');
		expect(screen.getByRole('button', { name: /generate/i })).toBeTruthy();
		expect(screen.queryByRole('button', { name: /connect a cloud model/i })).toBeNull();
	});

	it('an un-pinned slide reads Auto and shows the deck canvas it inherits', () => {
		const src = '---\nclass: dark\n---\n\n<!-- _class: kpi -->\n\n# Hi';
		setup('<!-- _class: kpi -->\n\n# Hi', src);
		// The canvas control is a real 3-way selector (Auto/Light/Dark), even under a
		// dark deck — Light stays a live choice — with an "inherits dark" hint on Auto.
		expect(screen.getByRole('radio', { name: 'Auto' })).toBeTruthy();
		expect(screen.getByRole('radio', { name: 'Light' })).toBeTruthy();
		expect(screen.getByText(/dark · deck/i)).toBeTruthy();
	});
});
