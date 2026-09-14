import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SETTING_FILTERING, SETTING_HIT, SETTING_SECTION, SettingsBlock, SettingsFind, SettingsNoMatch, SettingsScope, SettingsSection, SettingsSectionTabs, SettingsToolbar, type SettingsView, settingsMatch, useSettingsHit, visibleSectionTabs } from './settings-view';

// `settingsMatch` is re-exported from `lib/settings-search.ts`, where the full semantics
// (morphology, the synonym table, the anchored typo repair) are pinned. What stays pinned
// HERE is the contract the panels depend on: the terms are ANDed, order-free, case- and
// accent-blind, and an absent haystack slot is skipped rather than counted as a miss.
describe('settingsMatch', () => {
	it('matches everything on an empty query', () => {
		expect(settingsMatch('', 'Theme')).toBe(true);
		expect(settingsMatch('   ', 'Theme')).toBe(true);
	});
	it('is case-insensitive', () => {
		expect(settingsMatch('THEME', "This deck's color palette", 'Theme')).toBe(true);
	});
	it('requires EVERY term, in any order', () => {
		expect(settingsMatch('page number', 'Hide page number')).toBe(true);
		expect(settingsMatch('number page', 'Hide page number')).toBe(true);
		expect(settingsMatch('page footer', 'Hide page number')).toBe(false);
	});
	it('searches every haystack term together, skipping the absent ones', () => {
		// The `find=` slot is what carries a synonym ONE row needs. (The negative arm used to
		// be `pagination` without it; that reaches the row on its own now, through the shared
		// vocabulary in `lib/settings-search.ts`, so the arm needs a word nothing carries.)
		expect(settingsMatch('mezzanine', 'Page numbers', undefined, 'mezzanine paginate')).toBe(true);
		expect(settingsMatch('mezzanine', 'Page numbers', undefined, false)).toBe(false);
	});
	it('folds diacritics, so an ASCII word still reaches an accented label', () => {
		expect(settingsMatch('resume', 'Résumé')).toBe(true);
	});
});

function Row({ label, desc }: { label: string; desc?: string }) {
	const hit = useSettingsHit(label, desc);
	if (!hit) return null;
	return <div {...hit}>{label}</div>;
}

describe('useSettingsHit', () => {
	it('renders every row when nothing is being searched', () => {
		render(
			<SettingsFind query="">
				<SettingsSection label="Look">
					<Row label="Theme" />
					<Row label="Size" />
				</SettingsSection>
			</SettingsFind>,
		);
		expect(screen.getByText('Theme')).toBeTruthy();
		expect(screen.getByText('Size')).toBeTruthy();
	});

	it('drops the rows that miss', () => {
		render(
			<SettingsFind query="size">
				<SettingsSection label="Look">
					<Row label="Theme" />
					<Row label="Size" desc="Slide shape and dimensions." />
				</SettingsSection>
			</SettingsFind>,
		);
		expect(screen.queryByText('Theme')).toBeNull();
		expect(screen.getByText('Size')).toBeTruthy();
	});

	it('keeps a row whose DESCRIPTION matches, not just its label', () => {
		render(
			<SettingsFind query="dark">
				<SettingsSection label="Look">
					<Row label="Color mode" desc="Light, dark, or follow something." />
					<Row label="Size" desc="Slide shape and dimensions." />
				</SettingsSection>
			</SettingsFind>,
		);
		expect(screen.getByText('Color mode')).toBeTruthy();
		expect(screen.queryByText('Size')).toBeNull();
	});

	it('shows a section ENTIRE when the section itself matches', () => {
		render(
			<SettingsFind query="motion">
				<SettingsSection label="Motion" keywords="animation chart">
					<Row label="Play" />
					<Row label="Speed" />
				</SettingsSection>
			</SettingsFind>,
		);
		// Neither row spells "motion"; the SECTION does, so both stay.
		expect(screen.getByText('Play')).toBeTruthy();
		expect(screen.getByText('Speed')).toBeTruthy();
	});

	it('matches a section on its KEYWORDS, not only its label', () => {
		render(
			<SettingsFind query="animation">
				<SettingsSection label="Motion" keywords="animation chart">
					<Row label="Play" />
				</SettingsSection>
			</SettingsFind>,
		);
		expect(screen.getByText('Play')).toBeTruthy();
	});
});

describe('SettingsSection', () => {
	it('shows its heading only when asked (the list view), never in the tabbed one', () => {
		const { rerender } = render(
			<SettingsFind query="">
				<SettingsSection label="Look">
					<Row label="Theme" />
				</SettingsSection>
			</SettingsFind>,
		);
		expect(screen.queryByRole('heading', { name: 'Look' })).toBeNull();
		rerender(
			<SettingsFind query="">
				<SettingsSection label="Look" heading>
					<Row label="Theme" />
				</SettingsSection>
			</SettingsFind>,
		);
		expect(screen.getByRole('heading', { name: 'Look' })).toBeTruthy();
	});
});

describe('SettingsNoMatch', () => {
	it('renders only while a query is live', () => {
		const { rerender, container } = render(<SettingsNoMatch query="" />);
		expect(container.querySelector('[data-settings-empty]')).toBeNull();
		rerender(<SettingsNoMatch query="zzz" />);
		expect(container.querySelector('[data-settings-empty]')).toBeTruthy();
	});
});

function Toolbar({ onView }: { onView?: (v: SettingsView) => void } = {}) {
	const [view, setView] = React.useState<SettingsView>('group');
	const [query, setQuery] = React.useState('');
	const [searching, setSearching] = React.useState(false);
	return (
		<SettingsToolbar
			scope="Deck"
			view={view}
			onViewChange={(v) => { setView(v); onView?.(v); }}
			query={query}
			onQueryChange={setQuery}
			searching={searching}
			onSearchingChange={setSearching}
		/>
	);
}

// Widths read off the REAL ghost strip in a real Chromium, deck scope, docked default
// (`row.clientWidth === 231`), after `document.fonts.ready` — the last detail matters,
// because every one of these is text and the web font lands after first paint.
//
// The first version of this fixture carried [56, 74, 82, 72, 72, 72] / 72 and claimed the
// same provenance. Every number was wrong, `General` by 10px, and the chevron in the wrong
// direction. Nothing was hiding behind it — the assertions below give the same answers
// either way — but a fixture that says it is a measurement should be one. Re-derive with a
// browser, not by editing the numbers until the tests pass.
const PILLS = [54, 71, 72, 65, 66, 67]; // Look · Chrome · General · Accent · Motion · Speech
const CHEVRON = 74;
const TABS = ['Look', 'Chrome', 'General', 'Accent', 'Motion', 'Speech'];
const fitAt = (box: number) => ({ box, pills: PILLS, chevron: CHEVRON });

describe('visibleSectionTabs — the fitting policy', () => {
	it('draws as many as the row holds, and more of them as the row grows', () => {
		expect(visibleSectionTabs(TABS, 0, fitAt(231))).toEqual(['Look', 'Chrome']);
		expect(visibleSectionTabs(TABS, 0, fitAt(351))).toEqual(['Look', 'Chrome', 'General']);
		expect(visibleSectionTabs(TABS, 0, fitAt(500))).toEqual(['Look', 'Chrome', 'General', 'Accent', 'Motion']);
	});

	it('never draws more than fits — the row cannot spill to a second line', () => {
		for (const box of [200, 231, 280, 351, 391, 500, 900]) {
			const out = visibleSectionTabs(TABS, 5, fitAt(box));
			const used = out.reduce((sum, label) => sum + 6 + PILLS[TABS.indexOf(label)], CHEVRON);
			expect(used, `${out.length} pills at box ${box}`).toBeLessThanOrEqual(box);
		}
	});

	it('KEEPS THE ACTIVE PILL ON SCREEN at every width — the thing a container query cannot', () => {
		// Pick section 6, drag the panel narrow, and the old strip read "Look · Chrome · More"
		// with nothing saying where you were. This is that case, at every width.
		for (const box of [231, 280, 351, 391, 500]) {
			expect(visibleSectionTabs(TABS, 5, fitAt(box)), `box ${box}`).toContain('Speech');
		}
	});

	it('RESERVES the pinned pill rather than squeezing it in afterwards', () => {
		// Look(54) + Chrome(71) + chevron(74) + 2 gaps = 211, so a 231px row holds both — but
		// only if nothing else has to fit. With Speech active the run gives one pill back.
		expect(visibleSectionTabs(TABS, 1, fitAt(231))).toEqual(['Look', 'Chrome']);
		expect(visibleSectionTabs(TABS, 5, fitAt(231))).toEqual(['Look', 'Speech']);
	});

	it('appends the active pill, keeping the leading run in tab order', () => {
		expect(visibleSectionTabs(TABS, 4, fitAt(391))).toEqual(['Look', 'Chrome', 'General', 'Motion']);
	});

	it('falls back to the chevron alone when not even one pill fits', () => {
		expect(visibleSectionTabs(TABS, 3, fitAt(100))).toEqual([]);
	});

	it('treats a fit that disagrees with the tab count as NO measurement', () => {
		// The slide panel's section list is per-slide, so the tab count changes live. A 6-pill
		// fit against 7 tabs would price the 7th at zero and draw it for free — measured at
		// 320px of pills in a 231px row.
		const seven = [...TABS, 'Comments'];
		expect(visibleSectionTabs(seven, 6, fitAt(231))).toEqual(['Look', 'Chrome']);
		expect(visibleSectionTabs(seven, 6, { box: 231, pills: [...PILLS, 90], chevron: CHEVRON })).toEqual(['Look', 'Comments']);
	});

	it('falls back to the narrowest supported shape when it cannot measure, and does NOT pin', () => {
		// An unmeasured strip must never be WIDER than a measured one — the chevron answers
		// "where am I" by wearing the active section's name when no pill is selected.
		expect(visibleSectionTabs(TABS, 5, null)).toEqual(['Look', 'Chrome']);
	});
});

describe('SettingsToolbar', () => {
	it('opens the field and HIDES both view toggles, so the input owns the row', async () => {
		const user = userEvent.setup();
		render(<Toolbar />);
		expect(screen.getByLabelText('Grouped — one section at a time')).toBeTruthy();
		await user.click(screen.getByLabelText('Search deck settings'));
		expect(screen.queryByLabelText('Grouped — one section at a time')).toBeNull();
		expect(screen.queryByLabelText('List — every section in one scroll')).toBeNull();
		expect(screen.getByLabelText('Search deck settings')).toBeTruthy();
	});

	// ONE trailing ✕, two jobs. There were two side by side — the field's 24px "Clear
	// search" and a 28px "Close search" 19px away, same glyph, on a 293px phone row — and
	// the panel's own collapse made three within 100px of the 296px docked desktop panel.
	it('the trailing ✕ CLEARS while there is text and CLOSES once there is not', async () => {
		const user = userEvent.setup();
		render(<Toolbar />);
		await user.click(screen.getByLabelText('Search deck settings'));
		// Empty field: the one button is the way out.
		expect(screen.queryByLabelText('Clear search')).toBeNull();
		expect(screen.getByLabelText('Close search')).toBeTruthy();

		await user.type(screen.getByLabelText('Search deck settings'), 'theme');
		// Text in the field: the SAME button now empties it, and there is no second ✕.
		expect(screen.queryByLabelText('Close search')).toBeNull();
		expect(screen.getAllByLabelText('Clear search')).toHaveLength(1);

		await user.click(screen.getByLabelText('Clear search'));
		// Cleared and STILL OPEN, with the CARET STILL IN THE FIELD. That last one is the
		// whole point of clear-and-stay: without it the click moves focus to the button, the
		// input blurs, and a phone keyboard drops — and the button under the finger has by
		// then become "Close search", so a second tap closes instead of clearing.
		expect((screen.getByLabelText('Search deck settings') as HTMLInputElement).value).toBe('');
		expect(document.activeElement).toBe(screen.getByLabelText('Search deck settings'));
		expect(screen.queryByLabelText('Grouped — one section at a time')).toBeNull();

		await user.click(screen.getByLabelText('Close search'));
		expect(screen.getByLabelText('Grouped — one section at a time')).toBeTruthy();
	});

	it('brings the toggles back when the search closes', async () => {
		const user = userEvent.setup();
		render(<Toolbar />);
		await user.click(screen.getByLabelText('Search deck settings'));
		await user.type(screen.getByLabelText('Search deck settings'), 'theme');
		// Escape is the one-key exit from a DIRTY field — the trailing ✕ clears first.
		await user.keyboard('{Escape}');
		expect(screen.getByLabelText('Grouped — one section at a time')).toBeTruthy();
		// …and the query is gone with it, so the panel is whole again.
		await user.click(screen.getByLabelText('Search deck settings'));
		expect((screen.getByLabelText('Search deck settings') as HTMLInputElement).value).toBe('');
	});

	it('closes on Escape', async () => {
		const user = userEvent.setup();
		render(<Toolbar />);
		await user.click(screen.getByLabelText('Search deck settings'));
		await user.keyboard('{Escape}');
		expect(screen.getByLabelText('Grouped — one section at a time')).toBeTruthy();
	});

	it('switches the view', async () => {
		const user = userEvent.setup();
		const onView = vi.fn();
		render(<Toolbar onView={onView} />);
		await user.click(screen.getByLabelText('List — every section in one scroll'));
		expect(onView).toHaveBeenCalledWith('list');
		expect(screen.getByLabelText('List — every section in one scroll').getAttribute('aria-pressed')).toBe('true');
	});
});


// The collapse behavior is CSS, and nothing but the spelling links the two files: the
// module writes the attributes, `styles/tailwind.css` reads them. Rename one side and the
// panel silently stops collapsing empty sections — a search that returns six headings over
// nothing, with every test above still green. So pin the coupling by text.
describe('the tailwind.css rules that finish the job', () => {
	const css = readFileSync(join(__dirname, '../../styles/tailwind.css'), 'utf8');
	const hitAttr = Object.keys(SETTING_HIT)[0];

	it('collapses a section holding no hit', () => {
		expect(css).toContain(`[${SETTING_FILTERING}] [${SETTING_SECTION}]:not(:has([${hitAttr}]))`);
	});

	it('hides the no-matches note as soon as the body holds one hit', () => {
		expect(css).toContain(`[${SETTING_FILTERING}]:has([${hitAttr}]) [data-settings-empty]`);
	});

	it('keeps both rules UNLAYERED, so a utility on a section cannot out-cascade them', () => {
		// `utilities` is declared after `base` (the @layer line at the top of the file), so a
		// layered `display: none` would lose to any `flex`/`block` utility that ever lands on
		// a section wrapper. The rules therefore sit after the last `@layer` block closes.
		const rule = css.indexOf(`[${SETTING_FILTERING}] [${SETTING_SECTION}]`);
		expect(rule).toBeGreaterThan(-1);
		expect(css.slice(rule)).not.toContain('@layer');
	});
});


// ── The AND-gate, and the three defects it caused ────────────────────────────
// A wrapper must never require a child to match ITS words AND the child's own. Each of
// these reproduces a failure that shipped, so each fails again if the rule is undone.

describe('a nested SettingsScope never gates its children', () => {
	it('finds a row by its own label when the group says nothing like it', () => {
		// Shipped bug: `Shape` lived in a block whose terms were "stamp state badge …",
		// so typing the row's own visible label answered "No setting matches".
		render(
			<SettingsFind query="shape">
				<SettingsSection label="Marks" keywords="overlay">
					<SettingsScope label="Stamp" keywords="state badge draft confidential">
						<Row label="Shape" desc="The badge's shape." />
					</SettingsScope>
				</SettingsSection>
			</SettingsFind>,
		);
		expect(screen.getByText('Shape')).toBeTruthy();
	});

	it('shows every row when the GROUP matches, including rows that never say its name', () => {
		// Shipped bug: searching "logo" hid `Show on` / `Treatment` / `Size` / `Across` /
		// `Down` — the five rows that exist only because a logo is set.
		render(
			<SettingsFind query="logo">
				<SettingsSection label="Chrome" keywords="furniture">
					<SettingsScope label="Logo" keywords="brand mark image">
						<Row label="Show on" />
						<Row label="Treatment" />
						<Row label="Across" />
					</SettingsScope>
				</SettingsSection>
			</SettingsFind>,
		);
		expect(screen.getByText('Show on')).toBeTruthy();
		expect(screen.getByText('Treatment')).toBeTruthy();
		expect(screen.getByText('Across')).toBeTruthy();
	});

	it('does not drop a sibling row when the group matches (the worse half of the bug)', () => {
		// Shipped bug: "tone" matched the block, rendered its header, and silently dropped
		// one of its two rows — the panel showed LESS than the tab, with no signal.
		render(
			<SettingsFind query="tone">
				<SettingsSection label="Marks">
					<SettingsScope label="Tone" keywords="review status pass warn fail">
						<Row label="Shape" desc="A rail, a full edge, or a glow." />
					</SettingsScope>
				</SettingsSection>
			</SettingsFind>,
		);
		expect(screen.getByText('Shape')).toBeTruthy();
	});

	it('a leaf SettingsBlock stays all-or-nothing — the contrast the two names carry', () => {
		// This is the behavior `SettingsScope` exists to NOT have. A block wraps content
		// with no controls in it (a textarea, a chip row), so matching it as one unit is
		// right; the bug was using it around rows.
		const { rerender } = render(
			<SettingsFind query="caption">
				<SettingsSection label="Notes">
					<SettingsBlock terms="caption read aloud narration">
						<textarea aria-label="Read-as caption" />
					</SettingsBlock>
				</SettingsSection>
			</SettingsFind>,
		);
		expect(screen.getByLabelText('Read-as caption')).toBeTruthy();
		rerender(
			<SettingsFind query="motion">
				<SettingsSection label="Notes">
					<SettingsBlock terms="caption read aloud narration">
						<textarea aria-label="Read-as caption" />
					</SettingsBlock>
				</SettingsSection>
			</SettingsFind>,
		);
		expect(screen.queryByLabelText('Read-as caption')).toBeNull();
	});

	it('still filters its rows when neither the group nor the row matches', () => {
		render(
			<SettingsFind query="zzz">
				<SettingsSection label="Marks">
					<SettingsScope label="Tone">
						<Row label="Shape" />
					</SettingsScope>
				</SettingsSection>
			</SettingsFind>,
		);
		expect(screen.queryByText('Shape')).toBeNull();
	});
});

// The rule above is only safe while no `SettingsBlock` wraps a control — a block IS
// all-or-nothing, so a Row inside one is the AND-gate again. Nothing in the type system
// says so, and the two panels are where it would be broken, so read them.
describe('no SettingsBlock in either panel wraps a Field or a Row', () => {
	const panels = ['../studio/StudioShell.tsx', '../studio/SlideContext.tsx'];
	for (const rel of panels) {
		it(`${rel.split('/').pop()} keeps controls out of its blocks`, () => {
			const src = readFileSync(join(__dirname, rel), 'utf8');
			const offenders: string[] = [];
			let blocks = 0;
			// Walk each <SettingsBlock …> … </SettingsBlock> span and look inside it.
			const open = /<SettingsBlock\b/g;
			let m = open.exec(src);
			while (m !== null) {
				const end = src.indexOf('</SettingsBlock>', m.index);
				// ALWAYS advance. `continue` without this spun forever on a self-closing
				// `<SettingsBlock … />`, hanging vitest instead of reporting anything.
				const from = m.index;
				m = open.exec(src);
				if (end < 0) continue;
				blocks++;
				const inner = src.slice(from, end);
				// A WORD BOUNDARY, not a trailing space: `inner.includes('<Row ')` missed a
				// multi-line `<Row` / `<TextRow` whose props start on the next line, and that
				// formatting is already in this tree — so the guard would have certified the
				// AND-gate right back in.
				for (const tag of ['Row', 'Field', 'TextRow']) {
					if (new RegExp(`<${tag}\\b`).test(inner)) offenders.push(`<${tag}> inside the block at index ${from}`);
				}
			}
			expect(offenders).toEqual([]);
			// …and the walk actually found blocks, so a regex that silently stops matching
			// cannot turn this into a test that passes by looking at nothing.
			expect(blocks).toBeGreaterThan(0);
		});
	}
});


// ── The section strip ────────────────────────────────────────────────────────
const SIX = [
	{ value: 'look', label: 'Look' },
	{ value: 'chrome', label: 'Chrome' },
	{ value: 'general', label: 'General' },
	{ value: 'brand', label: 'Accent' },
	{ value: 'motion', label: 'Motion' },
	{ value: 'speech', label: 'Speech' },
];

describe('SettingsSectionTabs', () => {
	it('shows two shortcuts and puts the rest behind the chevron', () => {
		render(<SettingsSectionTabs tabs={SIX} value="look" onValueChange={() => {}} ariaLabel="Deck settings sections" />);
		expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Look', 'Chrome']);
		expect(screen.getByRole('button', { name: /all sections/ })).toBeTruthy();
	});

	// The ZERO-PILL FLOOR, which needs a measurement to reach — and jsdom has no
	// `ResizeObserver` and reports every width as 0, so without this stub the component can
	// only ever take the unmeasured fallback and the guard is unreachable. It was: an
	// independent check found `{visible.length > 0 && …}` had no coverage at any tier, and
	// deleting it left the whole suite green. An empty `role="tablist"` is a malformed
	// widget — the same `aria-required-children` family as the chevron-inside-the-tablist
	// bug this component already had once.
	it('renders NO tablist when not even one pill fits', () => {
		const observers: (() => void)[] = [];
		const RO = globalThis.ResizeObserver;
		const widths = new Map<string, number>([['Look', 54], ['Chrome', 71], ['General', 72], ['Accent', 65], ['Motion', 66], ['Speech', 67], ['More', 74]]);
		globalThis.ResizeObserver = class {
			constructor(cb: () => void) { observers.push(cb); }
			observe() { observers[observers.length - 1]?.(); }
			disconnect() {}
			unobserve() {}
		} as unknown as typeof ResizeObserver;
		// A row far too narrow for any pill, and a ghost whose children report real widths.
		const clientWidth = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(100);
		const offsetWidth = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
			return widths.get((this.textContent ?? '').trim()) ?? 0;
		});
		try {
			render(<SettingsSectionTabs tabs={SIX} value="speech" onValueChange={() => {}} ariaLabel="Deck settings sections" />);
			expect(screen.queryAllByRole('tab')).toHaveLength(0);
			expect(screen.queryByRole('tablist')).toBeNull();
			// …and the chevron carries the active section's name, so "where am I" survives.
			expect(screen.getByRole('button', { name: /all sections/ }).textContent).toContain('Speech');
		} finally {
			clientWidth.mockRestore();
			offsetWidth.mockRestore();
			globalThis.ResizeObserver = RO;
		}
	});

	it('the chevron holds EVERY section, not the leftovers', async () => {
		// This is what makes a dropped shortcut safe, and it is why the count can change
		// without anything becoming unreachable.
		const user = userEvent.setup();
		render(<SettingsSectionTabs tabs={SIX} value="look" onValueChange={() => {}} ariaLabel="Deck settings sections" />);
		await user.click(screen.getByRole('button', { name: /all sections/ }));
		expect((await screen.findAllByRole('menuitem')).map((n) => n.textContent?.replace(/\s+/g, ''))).toEqual([
			'Look', 'Chrome', 'General', 'Accent', 'Motion', 'Speech',
		]);
	});

	it('the chevron wears the ACTIVE section name when it is not a shortcut', () => {
		// Otherwise picking Speech leaves the strip reading "Look · Chrome · More" with
		// nothing on screen saying where you are.
		render(<SettingsSectionTabs tabs={SIX} value="speech" onValueChange={() => {}} ariaLabel="Deck settings sections" />);
		const chevron = screen.getByRole('button', { name: /all sections/ });
		expect(chevron.textContent).toContain('Speech');
		expect(chevron.textContent).not.toContain('More');
	});

	it('reads "More" when the active section IS a shortcut', () => {
		render(<SettingsSectionTabs tabs={SIX} value="chrome" onValueChange={() => {}} ariaLabel="Deck settings sections" />);
		expect(screen.getByRole('button', { name: /all sections/ }).textContent).toContain('More');
		expect(screen.getByRole('tab', { name: 'Chrome' }).getAttribute('aria-selected')).toBe('true');
	});

	it('keeps the chevron accessible name FIXED as its label changes', () => {
		// The visible label moves with the active section; the accessible name must not, or
		// it moves under every locator that addresses it.
		const { rerender } = render(<SettingsSectionTabs tabs={SIX} value="look" onValueChange={() => {}} ariaLabel="Deck settings sections" />);
		const name = () => screen.getByRole('button', { name: /all sections/ }).getAttribute('aria-label');
		const before = name();
		rerender(<SettingsSectionTabs tabs={SIX} value="speech" onValueChange={() => {}} ariaLabel="Deck settings sections" />);
		expect(name()).toBe(before);
	});

	it('picks a section from the chevron', async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<SettingsSectionTabs tabs={SIX} value="look" onValueChange={onChange} ariaLabel="Deck settings sections" />);
		await user.click(screen.getByRole('button', { name: /all sections/ }));
		await user.click(await screen.findByRole('menuitem', { name: 'Motion' }));
		expect(onChange).toHaveBeenCalledWith('motion');
	});

	it('implements the roving tabindex and arrow keys its roles promise', async () => {
		// Declaring `role="tab"` without them is an ARIA contract violation — a screen-reader
		// user hears "tab" and the arrows do nothing. The first cut declared the roles and
		// implemented neither.
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<SettingsSectionTabs tabs={SIX} value="look" onValueChange={onChange} ariaLabel="Deck settings sections" />);
		const tabs = screen.getAllByRole('tab');
		expect(tabs.map((t) => t.getAttribute('tabindex'))).toEqual(['0', '-1']);
		tabs[0].focus();
		await user.keyboard('{ArrowRight}');
		expect(onChange).toHaveBeenCalledWith('chrome');
	});

	it('keeps a reachable tab stop when the active section is in the overflow', () => {
		// No shortcut is selected then, so without this the strip has no tab in the tab order
		// at all and a keyboard user cannot reach it.
		render(<SettingsSectionTabs tabs={SIX} value="speech" onValueChange={() => {}} ariaLabel="Deck settings sections" />);
		expect(screen.getAllByRole('tab').map((t) => t.getAttribute('tabindex'))).toEqual(['0', '-1']);
	});

	it('puts NOTHING but tabs inside the tablist — the chevron is a sibling', () => {
		// A non-tab child of `role="tablist"` is an `aria-required-children` axe violation,
		// and the first cut put the chevron in there.
		render(<SettingsSectionTabs tabs={SIX} value="look" onValueChange={() => {}} ariaLabel="Deck settings sections" />);
		const list = screen.getByRole('tablist');
		for (const child of Array.from(list.children)) {
			expect(child.getAttribute('role')).toBe('tab');
		}
		expect(screen.getByRole('button', { name: /all sections/ }).closest('[role="tablist"]')).toBeNull();
	});

	it('renders nothing for a single section — the chevron would be a menu of one', () => {
		const { container } = render(<SettingsSectionTabs tabs={[SIX[0]]} value="look" onValueChange={() => {}} ariaLabel="x" />);
		expect(container.firstChild).toBeNull();
	});
});
