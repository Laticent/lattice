import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assessDeck } from './coach/coach-core';
import StudioShell from './StudioShell';

// P2b wiring: the Coach's assessment and the component catalog have to actually REACH
// `chatComplete`. `chat-grounding.test.ts` pins what the prompt looks like once the
// grounding arrives; this pins that it arrives at all. Without it, a mis-wired prop
// would send an ungrounded prompt forever and every other test would still pass —
// the exact silent failure this slice exists to avoid.

vi.mock('@/components/DeckPreview', () => ({
	default: ({ 'aria-label': label }: { 'aria-label'?: string }) => <div data-testid="deck-preview">{label}</div>,
}));

const FINDING = { slide: 2, rule: 'wall-of-text', severity: 'warning', message: 'Too many words on this slide.' };
const SCORECARD = { overall: 82, band: 'B+', categories: [] };
vi.mock('./coach/coach-core', () => ({
	assessDeck: vi.fn(async () => ({ hasContent: true, scorecard: { overall: 82, band: 'B+', categories: [] }, findings: [{ slide: 2, rule: 'wall-of-text', severity: 'warning', message: 'Too many words on this slide.' }] })),
	rankFindings: (f: unknown[]) => f,
	topFixes: () => ({ title: 'Top fixes', body: [] }),
	weakestSlide: () => ({ title: 'Weakest slide', body: [] }),
	theAsk: async () => ({ title: 'The ask', body: [] }),
	pacing: async () => ({ title: 'Pacing', body: [] }),
	structureCheck: async () => ({ title: 'Structure check', body: [] }),
}));

const chatSpy = vi.hoisted(() => vi.fn(async () => ({ status: 'ok', reply: 'Sure.', proposed: null })));
const statusSpy = vi.hoisted(() => vi.fn((): Record<string, unknown> => ({ ready: true, generation: 'openrouter', modelName: 'test', remaining: null, price: { promptPerM: 1, completionPerM: 2 } })));
vi.mock('./architect', () => ({
	chatComplete: chatSpy,
	useArchitectStatus: statusSpy,
	requestFindingFix: vi.fn(async () => ({ status: 'offline' })),
	applyDeckEdit: vi.fn((src: string) => src),
	applyProposedEditsChecked: vi.fn((src: string) => ({ source: src, applied: 1, refusals: [] })),
	estimateUsd: () => 0.004,
	CHAT_OUTPUT_EST: 4096,
	chatSystemTokens: () => 0,
	CHAT_MAX_TOKENS: 16384,
	refineSelection: vi.fn(async () => ({ status: 'offline' })),
	REFINE_ACTIONS: [],
	runArchitect: vi.fn(async () => ({ status: 'offline' })),
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
const COMPONENTS = [{ name: 'headline', bucket: 'anchor', description: 'A cover statement.', skeleton: '<!-- _class: headline -->\n\n# Title' }];

beforeEach(() => {
	localStorage.clear();
	localStorage.setItem('lattice-studio-settings', JSON.stringify({ validation: true, pageNumbers: true, headerFooter: false, onboarded: true }));
});
afterEach(() => {
	vi.clearAllMocks();
	statusSpy.mockReturnValue({ ready: true, generation: 'openrouter', modelName: 'test', remaining: null, price: { promptPerM: 1, completionPerM: 2 } });
	try {
		localStorage.clear();
	} catch {
		/* no storage */
	}
});

describe('Studio — the chat is grounded in what the Coach knows', () => {
	it('hands chatComplete the live scorecard, findings, and component catalog', async () => {
		const user = userEvent.setup();
		render(<StudioShell options={options} components={COMPONENTS} />);

		// WAIT for the Coach's assessment to actually land before sending anything.
		// StudioShell debounces `assessDeck` behind a 400 ms REAL timer, so a run that
		// reaches Send first sends ungrounded and this asserts `null`. The test was racing
		// that debounce and only passing because the surrounding suite happened to be slow
		// enough — a latent order-dependency, not a product bug. The assessment's own state
		// is not observable from here (the "Board readiness" card lives in the Coach panel,
		// which this test never opens), so we wait on the call and then let its `.then`
		// chain commit.
		await vi.waitFor(() => expect(vi.mocked(assessDeck)).toHaveBeenCalled(), { timeout: 3000 });
		await vi.waitFor(() => expect(vi.mocked(assessDeck).mock.settledResults.length).toBeGreaterThan(0), { timeout: 3000 });
		await act(async () => {
			await Promise.resolve();
		});

		await user.click(screen.getByRole('button', { name: 'Toggle Chat' }));

		const box = await screen.findByLabelText('Message the Architect');
		await user.type(box, 'tighten slide 2');
		await user.click(screen.getByRole('button', { name: 'Send' }));

		await vi.waitFor(() => expect(chatSpy).toHaveBeenCalled());
		const opts = (chatSpy.mock.calls[0] as unknown[])[3] as { grounding?: { scorecard?: unknown; findings?: unknown[]; catalog?: unknown[] } };
		expect(opts?.grounding, 'chatComplete was called with no grounding — the prop is not wired through').toBeTruthy();
		expect(opts.grounding?.scorecard).toEqual(SCORECARD);
		expect(opts.grounding?.findings).toEqual([FINDING]);
		expect(opts.grounding?.catalog).toEqual(COMPONENTS);
	});
});
