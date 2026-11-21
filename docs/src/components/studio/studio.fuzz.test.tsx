import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import fc from 'fast-check';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadStudioPanels } from '@/test/panels';
import StudioShell from './StudioShell';

// The Studio's panels load on first open; load them up front so no test races a shell.
beforeAll(loadStudioPanels);

// Stub the live preview (its engine poller leaks a post-teardown timer in jsdom).
vi.mock('@/components/DeckPreview', () => ({
	default: ({ 'aria-label': label }: { 'aria-label'?: string }) => <div data-testid="deck-preview">{label}</div>,
}));

const options = { themeBase: '', runtimeUrl: '', engineUrl: '' };

// ONE SEED FOR BOTH PROPERTIES, printed, so a red run replays exactly (HARD RULE #32, F5): `FUZZ_SEED=<n> npx vitest run
// src/components/studio/studio.fuzz.test.tsx`. fast-check drew a fresh seed every run before, so a failure on CI could
// not be replayed and a pass said nothing about the next run.
const SEED = Number(process.env.FUZZ_SEED ?? 3045);
console.info(`studio.fuzz: seed ${SEED} (replay with FUZZ_SEED=${SEED})`);

// The journeys include a "switch deck" command that targets the original decks,
// and assume the full-density shell. Seed a returning-user state so "Q3 Board
// Review" is active and the panels are docked (not the newcomer welcome deck).
beforeEach(() => {
	localStorage.clear();
	localStorage.setItem('lattice-studio-deck-index', JSON.stringify([
		{ id: 'q3-board', title: 'Q3 Board Review', builtin: true },
		{ id: 'product-strategy', title: 'FY26 Product Strategy', builtin: true },
	]));
	localStorage.setItem('lattice-studio-settings', JSON.stringify({ validation: true, pageNumbers: true, headerFooter: false, onboarded: true, editMode: 'source' }));
});
afterEach(() => {
	cleanup();
	document.documentElement.removeAttribute('data-palette');
	localStorage.clear();
});

// ── The anti-jank invariant ──────────────────────────────────────────────────
// After ANY sequence of interactions the Studio must hold together: it never
// crashes (the shell root stays mounted), and whenever the preview counter is
// showing, it is well-formed (1 ≤ active ≤ total) and the navigator rail has
// exactly `total` chips. This catches off-by-one drift, NaN counters, and
// rail/preview desync — the classic "janky" failures — across random journeys.
function expectNoJank() {
	// Shell root is always present — no unmount / error boundary.
	expect(document.querySelector('.lx-ui')).toBeTruthy();
	const m = document.body.textContent?.match(/Slide (\d+) \/ (\d+)/);
	if (m) {
		const active = Number(m[1]);
		const total = Number(m[2]);
		expect(total).toBeGreaterThanOrEqual(1);
		expect(active).toBeGreaterThanOrEqual(1);
		expect(active).toBeLessThanOrEqual(total);
		const rail = document.querySelector('nav[aria-label="Slide navigator"]');
		if (rail) expect(rail.querySelectorAll('button[data-unit]').length).toBe(total);
	}
}

type Ctx = { user: ReturnType<typeof userEvent.setup> };

type Model = Record<string, never>;

const cmd = (label: string, act: (u: Ctx['user']) => Promise<void>): fc.AsyncCommand<Model, Ctx> => ({
	check: () => true,
	async run(_m, real) {
		await act(real.user);
		await waitFor(() => expectNoJank());
	},
	toString: () => label,
});

const clickLabel = (u: Ctx['user'], name: string) => u.click(screen.getByRole('button', { name }));
async function openClose(u: Ctx['user'], open: () => Promise<void>) {
	await open();
	await u.keyboard('{Escape}');
}
async function railNth(u: Ctx['user'], which: 'first' | 'last') {
	const rail = document.querySelector('nav[aria-label="Slide navigator"]');
	if (!rail) return;
	const chips = rail.querySelectorAll('button[data-unit]');
	const target = which === 'first' ? chips[0] : chips[chips.length - 1];
	if (target) await u.click(target as HTMLElement);
}
// Reshape the preview to a reader lens / clear it — safe no-op when there's no reader-view switcher.
// The seed fuzz decks are untagged (no `lenses:` registry), so the picker is a static "Full deck" with
// no "Reader view" dropdown and this command is a no-op on them; real reshape/clear coverage lives in
// lenses.spec + lint.test. Kept in the command set so a future tagged seed deck exercises it for free.
async function reshape(u: Ctx['user']) {
	const btn = [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Reader view');
	if (!btn) return;
	await u.click(btn as HTMLElement);
	const item = [...document.querySelectorAll('[role="menuitem"]')].find((m) => !/Full deck/i.test(m.textContent ?? ''));
	if (item) await u.click(item as HTMLElement);
}
async function clearLens(u: Ctx['user']) {
	const btn = document.querySelector('[aria-label="Clear reader lens"]');
	if (btn) await u.click(btn as HTMLElement);
}

const commands = [
	fc.constant(cmd('toggle Coach', (u) => clickLabel(u, 'Toggle Coach'))),
	fc.constant(cmd('toggle Inspector', (u) => clickLabel(u, 'Deck scope'))),
	fc.constant(cmd('rail → first', (u) => railNth(u, 'first'))),
	fc.constant(cmd('rail → last', (u) => railNth(u, 'last'))),
	fc.constant(cmd('reshape → reader view', (u) => reshape(u))),
	fc.constant(cmd('clear lens', (u) => clearLens(u))),
	fc.constant(cmd('Share open/close', (u) => openClose(u, () => clickLabel(u, 'Share')))),
	fc.constant(cmd('Workspace open/close', (u) => openClose(u, () => clickLabel(u, 'Workspace settings')))),
	fc.constant(cmd('Present open/close', (u) => openClose(u, () => clickLabel(u, 'Present')))),
	fc.constant(cmd('⌘K open/close', (u) => openClose(u, () => u.keyboard('{Meta>}k{/Meta}')))),
	fc.constant(
		cmd('switch deck', async (u) => {
			await u.click(screen.getByRole('button', { name: /(Q3 Board Review|FY26 Product Strategy)/ }));
			const items = await screen.findAllByRole('menuitem', { name: /(Q3 Board Review|FY26 Product Strategy)/ });
			await u.click(items[items.length - 1]); // the deck that isn't loaded first
		}),
	),
];

// THE JOURNEYS ARE DRAWN ONCE, FROM THE SEED, AND EACH IS ITS OWN TEST. One property ran all 15 inside one 120 s limit:
// 13 s idle, 43 s under 4-way CPU contention, and past 120 s when other suites shared the CPU (HARD RULE #32, F4). A
// limit on 15 renders measured the machine; a limit on one render plus at most 12 actions (about 1 s idle) does not.
// Same journeys, same count, same coverage; what is lost is fast-check's shrinking, so a failure names its seed and
// its whole journey instead.
const JOURNEYS = fc.sample(fc.commands(commands, { maxCommands: 12 }), { seed: SEED, numRuns: 15 });

describe('StudioShell — fuzz: no jank across random journeys', () => {
	it.each(JOURNEYS.map((cmds, i) => [i + 1, cmds] as const))('journey %i never crashes and keeps the counter ↔ rail consistent', async (n, cmds) => {
		const user = userEvent.setup();
		render(<StudioShell options={options} />);
		try {
			await fc.asyncModelRun(() => ({ model: {}, real: { user } }), cmds);
		} catch (err) {
			throw new Error(`journey ${n} of seed ${SEED} failed: ${String(cmds)}`, { cause: err });
		} finally {
			cleanup();
			document.documentElement.removeAttribute('data-palette');
		}
	});
});

// A second, content-level fuzz: arbitrary edits to the deck source must never
// break the derived views (split / rail / counter math) that the UI renders from.
describe('StudioShell — fuzz: arbitrary source never desyncs the derived views', () => {
	it('keeps rail count == counter total for random editor input', async () => {
		const user = userEvent.setup();
		render(<StudioShell options={options} />);
		// Wait for the editor rather than reading it synchronously: it arrives through a
		// `React.lazy` boundary (StudioShell.tsx:127) whose resolution is memoized at module
		// scope, so this passed only when the sibling property above had already mounted the
		// shell and warmed it. Explicit budget — the cold Vite transform of CodeMirror is
		// 420ms idle but 1070-1424ms under CPU contention, past the 1000ms `asyncUtilTimeout`
		// default (#1806).
		const editor = await screen.findByLabelText('Deck source', undefined, { timeout: 15000 });
		await fc.assert(
			fc.asyncProperty(fc.string({ maxLength: 40 }), async (chunk) => {
				await user.click(editor);
				await user.paste(`\n\n---\n\n${chunk}`);
				await waitFor(() => expectNoJank());
			}),
			{ seed: SEED, numRuns: 12, endOnFailure: true },
		);
	});
});
