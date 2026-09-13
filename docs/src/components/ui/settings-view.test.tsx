import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SETTING_FILTERING, SETTING_HIT, SETTING_SECTION, SettingsBlock, SettingsFind, SettingsNoMatch, SettingsScope, SettingsSection, SettingsToolbar, type SettingsView, settingsMatch, useSettingsHit } from './settings-view';

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
		expect(settingsMatch('pagination', 'Page numbers', undefined, 'pagination paginate')).toBe(true);
		expect(settingsMatch('pagination', 'Page numbers', undefined, false)).toBe(false);
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

	it('brings the toggles back when the search closes', async () => {
		const user = userEvent.setup();
		render(<Toolbar />);
		await user.click(screen.getByLabelText('Search deck settings'));
		await user.type(screen.getByLabelText('Search deck settings'), 'theme');
		await user.click(screen.getByLabelText('Close search'));
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
				if (end < 0) continue;
				blocks++;
				const inner = src.slice(m.index, end);
				// A nested block would end the span early; that is fine, it is still a subset.
				for (const tag of ['<Row ', '<Field ', '<TextRow ']) {
					if (inner.includes(tag)) offenders.push(`${tag.trim()} inside the block at index ${m.index}`);
				}
				m = open.exec(src);
			}
			expect(offenders).toEqual([]);
			// …and the walk actually found blocks, so a regex that silently stops matching
			// cannot turn this into a test that passes by looking at nothing.
			expect(blocks).toBeGreaterThan(0);
		});
	}
});
