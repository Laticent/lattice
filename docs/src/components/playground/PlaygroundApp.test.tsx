import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mock the irreducible, browser-only engine pieces ────────────────────────
// PlaygroundApp wraps a CodeMirror editor, a window-global render engine, a
// chart-hover layer, and the vanilla deck-config panel — none of which load
// under jsdom. We stub each at the SAME seam the app imports it through, so the
// React orchestration (pickers → applyDeck → pane/render) runs for real while
// the heavy bits become inert. The test asserts the *chrome contract*, not the
// engine's pixels.

vi.mock('@/playground/editor.js', () => ({
	// A minimal in-memory editor adapter. setValue does NOT fire onChange:
	// programmatic deck swaps (applyDeck) already call syncPickers explicitly,
	// and the real createEditor's setValue is likewise a silent document swap.
	createEditor: ({ doc, onChange }: { doc: string; onChange?: (v: string) => void }) => {
		let value = doc ?? '';
		return {
			getValue: () => value,
			setValue: (t: string) => {
				value = t;
			},
			focus: () => {},
			destroy: () => {},
			__fireChange: (t: string) => onChange?.(t),
		};
	},
}));

vi.mock('@/lib/playground-engine', () => ({
	// A bridge that is always ready and renders synchronously to "rendered".
	createEngineBridge: () => ({
		ready: () => true,
		ensure: () => {},
		prefetchTheme: () => {},
		renderInto: async () => ({
			status: 'rendered' as const,
			count: 3,
			state: { frameSig: 'sig', lastSections: null },
			geom: { w: 1280, h: 720 },
		}),
	}),
}));

vi.mock('@/playground/debug-overlay.js', () => ({ applyDebug: () => {}, deckDebugOn: () => false }));
vi.mock('@/playground/debug-prefs.js', () => ({
	getDebugOverride: () => null,
	onDebugOverrideChange: () => () => {},
	setDebugOverride: () => {},
	debugEffectiveOn: (d: boolean) => d,
}));
vi.mock('@/playground/deck-config.js', () => ({
	readFrontMatter: () => ({ configured: false }),
	CONFIG_PROFILES: { noTheme: [] },
	createConfigPanel: () => ({ render: () => {} }),
}));
vi.mock('@/playground/chart-interact.js', () => ({
	createChartInteract: () => ({ rebind: () => {}, destroy: () => {} }),
}));

import { PlaygroundApp, type PlaygroundData } from './PlaygroundApp';

// ── A realistic-enough fixture ──────────────────────────────────────────────
const STARTER = '<!-- _class: verdict-grid -->\n\n# Starter\n';

const catalog = {
	'verdict-grid': {
		skeleton: '<!-- _class: verdict-grid -->\n\n# skeleton\n',
		sample: '<!-- _class: verdict-grid -->\n\n# sample\n',
		variants: [{ key: 'compact', label: 'compact', caption: 'tighter rows', sample: '<!-- _class: verdict-grid compact -->\n' }],
	},
	'big-number': {
		skeleton: '<!-- _class: big-number -->\n',
		sample: '<!-- _class: big-number -->\n\n# 42\n',
		variants: [],
	},
} as unknown as PlaygroundData['catalog'];

const components = [
	{ name: 'verdict-grid', bucket: 'comparison', function: 'compare', form: 'grid', substance: 'verdict', family: 'comparison', familyLabel: 'Comparison', description: 'verdicts', tags: [] },
	{ name: 'big-number', bucket: 'statement', function: 'state', form: 'hero', substance: 'metric', family: 'statement', familyLabel: 'Statement', description: 'one big number', tags: [] },
];

const lenses = [{ id: 'function', label: 'Function', field: 'function', order: null }];

// "jargon" is the deck in the reported repro ("select gallery → jargon").
const gallerySources: Record<string, string> = {
	jargon: '<!-- _class: verdict-grid -->\n\n# Jargon gallery\n',
	survey: '<!-- _class: big-number -->\n\n# Survey gallery\n',
};
const galleryGroups = [
	{
		key: 'Showcases',
		hint: 'Full decks',
		items: [
			{ id: 'jargon', label: 'Jargon', slides: 12 },
			{ id: 'survey', label: 'Survey', slides: 8 },
		],
	},
];

const data: PlaygroundData = {
	catalog,
	components,
	lenses,
	gallerySources,
	galleryGroups,
	themeBase: '/themes/',
	runtimeUrl: '/runtime.js',
	// engineUrl is read off data but absent from the published type; cast covers it.
	palettes: ['indaco'],
	finishes: [],
	starter: STARTER,
	plansBase: '/plans/',
} as unknown as PlaygroundData;

// The walk fetches plans/<name>.json; a tiny two-slide plan is enough for the
// mode toggle to mount and the walk to exist.
beforeEach(() => {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => ({
			ok: true,
			text: async () =>
				JSON.stringify({
					name: 'verdict-grid',
					slides: [
						{ kind: 'title', caption: 'c', md: '<!-- _class: title -->\n# t' },
						{ kind: 'default', caption: 'c', md: '<!-- _class: verdict-grid -->\n# d' },
					],
				}),
		})),
	);
});

// ── Helpers that read the live DOM the way a user perceives it ───────────────

/** Which pane the LAYOUT shows (mobile single-pane CSS keys off this). */
function visiblePane(): string | null {
	return document.body.getAttribute('data-pane');
}
function currentView(): string | null {
	return document.body.getAttribute('data-view');
}

/**
 * THE invariant (2026-07-06 simplification): the mode and the visible pane agree
 * — Explore (read) shows the deck (pane 'preview'); Edit shows the editor (pane
 * 'edit'). A divergence would render the deck into a hidden pane.
 */
function expectViewPaneInSync() {
	const view = currentView();
	if (view == null) return; // pre-mount
	expect(visiblePane(), `view "${view}" but pane "${visiblePane()}"`).toBe(view === 'read' ? 'preview' : 'edit');
}

async function mountPlayground() {
	const user = userEvent.setup({ pointerEventsCheck: 0 });
	render(<PlaygroundApp data={data} />);
	await waitFor(() => expect(visiblePane()).not.toBeNull());
	return user;
}

/** The mode toggle buttons expose role="tab" + aria-label Explore/Edit. */
async function clickMode(user: ReturnType<typeof userEvent.setup>, name: 'Explore' | 'Edit') {
	await user.click(screen.getByRole('tab', { name }));
}

async function openGalleries(user: ReturnType<typeof userEvent.setup>) {
	await user.click(screen.getByRole('button', { name: 'Galleries' }));
	return within(await screen.findByRole('dialog'));
}

async function loadGallery(user: ReturnType<typeof userEvent.setup>, label: string) {
	const sheet = await openGalleries(user);
	await user.click(sheet.getByRole('button', { name: new RegExp(label, 'i') }));
}

afterEach(() => {
	cleanup();
	document.body.removeAttribute('data-pane');
	document.body.removeAttribute('data-view');
	vi.unstubAllGlobals();
});

// ── The mode toggle drives the pane in sync ──────────────────────────────────
describe('PlaygroundApp — the mode toggle keeps view and pane in sync', () => {
	it('flips Explore ⇄ Edit, and the pane always agrees', async () => {
		const user = await mountPlayground();
		// Explore renders the deck; Edit shows the editor.
		await clickMode(user, 'Explore');
		await waitFor(() => expect(currentView()).toBe('read'));
		expectViewPaneInSync();

		await clickMode(user, 'Edit');
		await waitFor(() => expect(currentView()).toBe('edit'));
		expectViewPaneInSync();

		await clickMode(user, 'Explore');
		await waitFor(() => expect(currentView()).toBe('read'));
		expectViewPaneInSync();
	});

	it('loading a gallery shows the rendered deck (pane preview)', async () => {
		const user = await mountPlayground();
		await loadGallery(user, 'Jargon');
		await waitFor(() => expect(visiblePane()).toBe('preview'));
	});
});

// ── Fuzz: random mode/gallery journeys never desync view and pane ────────────
type Ctx = { user: ReturnType<typeof userEvent.setup> };

const paneCommand = (label: string, act: (u: Ctx['user']) => Promise<void>): fc.AsyncCommand<Record<string, never>, Ctx> => ({
	check: () => true,
	async run(_model, real) {
		await act(real.user);
		await waitFor(() => expectViewPaneInSync());
	},
	toString: () => label,
});

const allCommands = [
	fc.constant(paneCommand('Explore', (u) => clickMode(u, 'Explore'))),
	fc.constant(paneCommand('Edit', (u) => clickMode(u, 'Edit'))),
	fc.constant(paneCommand('load Jargon gallery', (u) => loadGallery(u, 'Jargon'))),
	fc.constant(paneCommand('load Survey gallery', (u) => loadGallery(u, 'Survey'))),
];

describe('PlaygroundApp — fuzz: view and pane never desync across random journeys', () => {
	it('keeps view and pane in sync for any sequence of toolbar actions', async () => {
		await fc.assert(
			fc.asyncProperty(fc.commands(allCommands, { maxCommands: 14 }), async (cmds) => {
				const user = await mountPlayground();
				try {
					await fc.asyncModelRun(() => ({ model: {}, real: { user } }), cmds);
				} finally {
					cleanup();
					document.body.removeAttribute('data-pane');
					document.body.removeAttribute('data-view');
				}
			}),
			{ numRuns: 20, endOnFailure: true },
		);
	}, 60_000);
});

// ── Tour-step reachability ───────────────────────────────────────────────────
// Every tour step that names an element must resolve in the MODE it declares —
// in BOTH directions — or the tour would spotlight nothing (the handoff entry
// path arrives in Edit; Explore steps must still mount). #palette lives in the
// site topbar, outside this component — exempt here, covered by the e2e drive.
import { STEPS } from '@/playground/playground-tour.js';

describe('PlaygroundApp — every tour step is reachable in its declared mode', () => {
	const OUTSIDE = new Set(['#palette']);

	it('mounts every step target in read AND edit harnesses', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({
				ok: true,
				text: async () =>
					JSON.stringify({
						name: 'verdict-grid',
						slides: [
							{ kind: 'title', caption: 'c', md: '<!-- _class: title -->\n# t' },
							{ kind: 'default', caption: 'c', md: '<!-- _class: verdict-grid -->\n# d' },
						],
					}),
			})),
		);
		try {
			const user = userEvent.setup({ pointerEventsCheck: 0 });
			render(<PlaygroundApp data={{ ...data, plansBase: '/plans/' } as PlaygroundData} />);
			await waitFor(() => expect(visiblePane()).not.toBeNull());
			// The warm-up walk mounts #pg-walk even in Edit.
			await waitFor(() => expect(document.querySelector('#pg-walk')).not.toBeNull());

			const targets = STEPS.filter((s: { element?: string }) => s.element && !OUTSIDE.has(s.element));
			// Edit mode (startup default here: pristine → read? starter is recorded
			// pristine only in real flow; harness starts edit b/c localStorage empty
			// hash + starter source → dirty → edit).
			for (const s of targets) {
				expect(document.querySelector(s.element as string), `unreachable in edit: ${s.element}`).not.toBeNull();
			}
			// Flip to Explore via the pill and re-walk the list.
			await user.click(screen.getByRole('tab', { name: 'Explore' }));
			await waitFor(() => expect(document.body.getAttribute('data-view')).toBe('read'));
			for (const s of targets) {
				expect(document.querySelector(s.element as string), `unreachable in read: ${s.element}`).not.toBeNull();
			}
		} finally {
			vi.unstubAllGlobals();
		}
	});
});
