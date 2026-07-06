import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
vi.mock('@/playground/drawing-board-chart-interact.js', () => ({
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
} as unknown as PlaygroundData;

// ── Helpers that read the live DOM the way a user perceives it ───────────────

/** Which pane the toolbar tab control SAYS is active (Radix marks data-state). */
function activeTab(): 'edit' | 'preview' {
	const tab = document.querySelector('[role="tab"][data-state="active"]');
	const label = (tab?.textContent || '').trim().toLowerCase();
	return label === 'preview' ? 'preview' : 'edit';
}

/** Which pane the LAYOUT actually shows (mobile single-pane CSS keys off this). */
function visiblePane(): string | null {
	return document.body.getAttribute('data-pane');
}

/**
 * THE invariant. What the tab claims and what the layout shows must never
 * diverge — divergence is exactly the reported bug: the tab flips to "Preview"
 * but `body[data-pane]` stays "edit", so the rendered deck is in a hidden pane.
 */
function expectPaneInSync() {
	expect(visiblePane(), `tab says "${activeTab()}" but layout shows "${visiblePane()}"`).toBe(activeTab());
}

async function mountPlayground() {
	const user = userEvent.setup({ pointerEventsCheck: 0 });
	render(<PlaygroundApp data={data} />);
	// The EditorHost mounts CodeMirror in an effect and reports ready → first
	// render. Wait for the body data-pane seed so the chrome is settled.
	await waitFor(() => expect(visiblePane()).not.toBeNull());
	return user;
}

async function clickTab(user: ReturnType<typeof userEvent.setup>, name: 'Edit' | 'Preview') {
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

async function scaffold(user: ReturnType<typeof userEvent.setup>) {
	// The reset action names its target ("Reset to the <name> example") and
	// "Insert blank skeleton" is gone (Specimen Book §0.4) — match by prefix.
	const sheet = await openGalleries(user);
	await user.click(sheet.getByRole('button', { name: /Reset to/ }));
}

afterEach(() => {
	cleanup();
	document.body.removeAttribute('data-pane');
});

// ── The reported scenario, gated ────────────────────────────────────────────
describe('PlaygroundApp — gallery load shows the rendered deck (regression)', () => {
	it('seeds the layout pane in sync with the active tab on mount', async () => {
		await mountPlayground();
		expect(activeTab()).toBe('edit');
		expectPaneInSync();
	});

	it('loading a gallery from Edit view actually switches the LAYOUT to preview', async () => {
		const user = await mountPlayground();
		expect(activeTab()).toBe('edit');

		// The exact repro: in Edit view, open Galleries and pick "Jargon".
		await loadGallery(user, 'Jargon');

		// The tab flips to Preview…
		await waitFor(() => expect(activeTab()).toBe('preview'));
		// …AND the layout must follow. Before the fix, body[data-pane] stayed
		// "edit", so the rendered deck sat in a hidden pane and the user had to
		// toggle Edit→Preview by hand to see it. This is the line that fails on
		// the old code.
		expect(visiblePane()).toBe('preview');
		expectPaneInSync();
	});

	it('manual Edit→Preview toggling stays in sync (the old workaround still works)', async () => {
		const user = await mountPlayground();
		await clickTab(user, 'Preview');
		expectPaneInSync();
		await clickTab(user, 'Edit');
		expectPaneInSync();
	});

	it('scaffolding (reset) does not desync the pane', async () => {
		const user = await mountPlayground();
		await clickTab(user, 'Preview');
		expectPaneInSync();
		// Reset-to-example does not request a pane switch; whatever pane we are on
		// must remain coherent.
		await scaffold(user);
		expectPaneInSync();
	});
});

// ── Fuzz: random user journeys must never desync the pane ────────────────────
// Property-based, model-based testing via fast-check's `commands` — the
// idiomatic tool for stateful UI fuzzing. Each command is one real toolbar
// interaction; fast-check generates random *sequences* of them, runs the
// invariant after each, and — crucially — SHRINKS any failing journey down to a
// minimal reproducer (e.g. "Edit, then LoadGallery") instead of dumping a 24-
// step trace. We don't roll our own RNG or shrinker.
//
// The model is a no-op: this property has no precondition gating and a single
// global invariant (tab and layout agree), so the commands carry all the state
// we need in the live DOM. Each command's `check` is always true; `run` performs
// the interaction and asserts.
type Ctx = { user: ReturnType<typeof userEvent.setup> };

const paneCommand = (label: string, act: (u: Ctx['user']) => Promise<void>): fc.AsyncCommand<Record<string, never>, Ctx> => ({
	check: () => true,
	async run(_model, real) {
		await act(real.user);
		// React + the async render settle the pane synchronously through the
		// `pane`→body effect; wait so a trailing state flush can't race us.
		await waitFor(() => expectPaneInSync());
	},
	toString: () => label,
});

const allCommands = [
	fc.constant(paneCommand('Edit tab', (u) => clickTab(u, 'Edit'))),
	fc.constant(paneCommand('Preview tab', (u) => clickTab(u, 'Preview'))),
	fc.constant(paneCommand('load Jargon gallery', (u) => loadGallery(u, 'Jargon'))),
	fc.constant(paneCommand('load Survey gallery', (u) => loadGallery(u, 'Survey'))),
	fc.constant(paneCommand('reset to example', (u) => scaffold(u))),
];

describe('PlaygroundApp — fuzz: the pane never desyncs across random journeys', () => {
	it('keeps tab and layout in sync for any sequence of toolbar actions', async () => {
		await fc.assert(
			fc.asyncProperty(fc.commands(allCommands, { maxCommands: 18 }), async (cmds) => {
				const user = await mountPlayground();
				try {
					await fc.asyncModelRun(() => ({ model: {}, real: { user } }), cmds);
				} finally {
					// Each run is an independent mount; tear it down so the next
					// generated sequence starts from a clean Edit-view playground.
					cleanup();
					document.body.removeAttribute('data-pane');
				}
			}),
			// jsdom + Radix interactions are not free; keep the run count modest but
			// enough to exercise many orderings. endOnFailure → report the first
			// (shrunk) counterexample rather than burning the whole budget.
			{ numRuns: 25, endOnFailure: true },
		);
	}, 60_000);
});
