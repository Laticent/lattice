import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StudioShell from './StudioShell';

// Slice: per-finding AI fix. The Coach panel surfaces the deck's deterministic lint
// findings; with a model connected, each grows a "Fix with AI" button that proposes
// a reviewable diff (requestSlideFix) — Apply checkpoints + splices the slide,
// Discard drops it. Honest with no model. The model + lint bundle are mocked so we
// assert the StudioShell ORCHESTRATION, not a real backend or lint run.

vi.mock('@/components/DeckPreview', () => ({
	default: ({ 'aria-label': label }: { 'aria-label'?: string }) => <div data-testid="deck-preview">{label}</div>,
}));

// One deterministic finding the panel should surface. The Coach kernel is mocked so we
// assert the StudioShell ORCHESTRATION (the real assessment is covered by coach-core.test).
const FINDING = { slide: 2, rule: 'wall-of-text', severity: 'warning', message: 'Too many words on this slide.' };
vi.mock('./coach/coach-core', () => ({
	assessDeck: vi.fn(async () => ({ hasContent: true, scorecard: { overall: 82, band: 'B+', categories: [] }, findings: [FINDING] })),
	hasFencedSeparator: () => false,
	rankFindings: (f: unknown[]) => f,
	topFixes: () => ({ title: 'Top fixes', body: [] }),
	weakestSlide: () => ({ title: 'Weakest slide', body: [] }),
	theAsk: async () => ({ title: 'The ask', body: [] }),
	pacing: async () => ({ title: 'Pacing', body: [] }),
	structureCheck: async () => ({ title: 'Structure check', body: [] }),
}));

const fixSpy = vi.hoisted(() => vi.fn(async () => ({ status: 'ok', before: 'old line', after: 'new tightened line', edit: { action: 'replace', slide: 2, body: 'new' } })));
const statusSpy = vi.hoisted(() => vi.fn((): { ready: boolean; generation: string; modelName: string | null; remaining: number | null } => ({ ready: true, generation: 'openrouter', modelName: 'test', remaining: null })));
const applySpy = vi.hoisted(() => vi.fn((_src: string, _edit: unknown) => 'EDITED DECK SOURCE'));
vi.mock('./architect', () => ({
	requestFindingFix: fixSpy,
	applyDeckEdit: applySpy,
	useArchitectStatus: statusSpy,
	refineSelection: vi.fn(async () => ({ status: 'offline' })),
	REFINE_ACTIONS: [],
	runArchitect: vi.fn(async () => ({ status: 'offline' })),
	chatComplete: vi.fn(async () => ({ status: 'offline' })),
	resumePendingAuth: vi.fn(async () => false),
	architectSpend: () => ({ total: 0, session: 0, totalTokens: 0, sessionTokens: 0, cap: 0, mode: 'alert', status: { level: 'ok', blocked: false, message: null } }),
	setBudget: vi.fn(),
	connectOpenRouter: vi.fn(),
	disconnectOpenRouter: vi.fn(),
	listStudioModels: vi.fn(async () => []),
	currentStudioModel: vi.fn(async () => null),
	setStudioModel: vi.fn(async () => {}),
	setStudioTier: vi.fn(async () => {}),
	summonWebLLM: vi.fn(async () => false),
	loadUniversalModel: vi.fn(async () => false),
	architectAccount: vi.fn(async () => null),
}));

const options = { themeBase: '', runtimeUrl: '', engineUrl: '' };

// The Coach findings live in the Architect panel, which a newcomer starts with
// closed. Seed onboarded:true (a returning user) so the panel is docked.
beforeEach(() => {
	localStorage.clear();
	localStorage.setItem('lattice-studio-settings', JSON.stringify({ validation: true, pageNumbers: true, headerFooter: false, onboarded: true }));
});
afterEach(() => {
	document.documentElement.removeAttribute('data-palette');
	vi.clearAllMocks();
	statusSpy.mockReturnValue({ ready: true, generation: 'openrouter', modelName: 'test', remaining: null });
	try {
		localStorage.clear();
	} catch {
		/* no storage */
	}
});

function setup() {
	const user = userEvent.setup();
	render(<StudioShell options={options} />);
	// Panels start closed at every stop now (Build shows the activity-bar launcher;
	// panels open on demand — posture never force-opens one). These flows exercise the
	// docked Coach, so open it from the bar.
	fireEvent.click(screen.getByRole('button', { name: 'Toggle Coach' }));
	return user;
}

describe('Studio — per-finding AI fix', () => {
	it('surfaces the lint findings in the Coach panel', async () => {
		setup();
		expect(await screen.findByText('1 to address')).toBeInTheDocument();
		expect(screen.getByText(/Too many words/)).toBeInTheDocument();
		expect(screen.getByText(/Slide 2/)).toBeInTheDocument();
	});

	it('proposes a reviewable diff, and Apply splices the edited deck', async () => {
		const user = setup();
		await user.click(await screen.findByRole('button', { name: /Fix ≈/ }));
		expect(fixSpy).toHaveBeenCalledWith(expect.any(String), FINDING, expect.anything());
		// The diff card appears with Apply / Discard…
		const apply = await screen.findByRole('button', { name: 'Apply' });
		expect(screen.getByText(/new tightened line/)).toBeInTheDocument();
		// …and Apply runs the edit splice + confirms with a toast.
		await user.click(apply);
		expect(applySpy).toHaveBeenCalled();
		expect(await screen.findByText(/Fix applied/)).toBeInTheDocument();
	});

	it('Discard drops the proposed diff without applying', async () => {
		const user = setup();
		await user.click(await screen.findByRole('button', { name: /Fix ≈/ }));
		await user.click(await screen.findByRole('button', { name: 'Discard' }));
		expect(screen.queryByText(/new tightened line/)).not.toBeInTheDocument();
		expect(applySpy).not.toHaveBeenCalled();
	});

	it('offers no AI fix and points at Workspace when no model is ready', async () => {
		statusSpy.mockReturnValue({ ready: false, generation: 'floor', modelName: null, remaining: null });
		setup();
		// The findings still show (deterministic), but without the AI fix affordance.
		expect(await screen.findByText('1 to address')).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: /Fix ≈/ })).not.toBeInTheDocument();
		expect(screen.getByText(/Connect a model in Workspace to fix these with AI/)).toBeInTheDocument();
	});
});
