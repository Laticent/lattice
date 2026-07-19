import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StudioShell from './StudioShell';

// Slice: the Coach panel's deterministic findings + their AI fix lifecycle. Each finding
// is a full-width card; with a model connected it grows a "Fix ≈ $X" pill that drafts a
// reviewable diff (requestFindingFix) — the pill cycles progress in place then splits into
// Apply / Discard. Batch "Draft all" / "Apply all" appear at 2+. A fix keyed by finding
// identity survives a re-lint. The model + coach kernel are mocked so we assert the
// StudioShell ORCHESTRATION, not a real backend or lint run.

vi.mock('@/components/DeckPreview', () => ({
	default: ({ 'aria-label': label }: { 'aria-label'?: string }) => <div data-testid="deck-preview">{label}</div>,
}));

// A mutable findings list the mocked assessDeck returns, so a test can seed 1, 2, or 3
// findings (and change them to simulate a re-lint).
const FINDING = { slide: 2, rule: 'wall-of-text', severity: 'warning', message: 'Too many words on this slide.' };
const mockFindings = vi.hoisted(() => ({ current: [{ slide: 2, rule: 'wall-of-text', severity: 'warning', message: 'Too many words on this slide.' }] as { slide: number; rule: string; severity: string; message: string }[] }));
vi.mock('./coach/coach-core', () => ({
	assessDeck: vi.fn(async () => ({ hasContent: true, scorecard: { overall: 82, band: 'B+', categories: [] }, findings: mockFindings.current })),
	hasFencedSeparator: () => false,
	rankFindings: (f: unknown[]) => f,
	topFixes: () => ({ title: 'Top fixes', body: [] }),
	weakestSlide: () => ({ title: 'Weakest slide', body: [] }),
	theAsk: async () => ({ title: 'The ask', body: [] }),
	pacing: async () => ({ title: 'Pacing', body: [] }),
	structureCheck: async () => ({ title: 'Structure check', body: [] }),
}));

const fixSpy = vi.hoisted(() => vi.fn(async (_src: string, finding: { slide?: number }) => ({ status: 'ok', before: `old line ${finding.slide}`, after: `new tightened line ${finding.slide}`, edit: { action: 'replace', slide: finding.slide, body: 'new' } })));
// A ready cloud model WITH a price, so the honest cost estimate renders ("Fix ≈ $…").
const READY = { ready: true, generation: 'openrouter', modelName: 'test', remaining: null, price: { promptPerM: 1, completionPerM: 2 } };
const statusSpy = vi.hoisted(() => vi.fn((): Record<string, unknown> => ({ ready: true, generation: 'openrouter', modelName: 'test', remaining: null, price: { promptPerM: 1, completionPerM: 2 } })));
// Mimic the real applyDeckEdit closely enough for the sequential K4 guard: keep the deck
// structure intact (only mark it changed) so a batch apply's later proposals still resolve
// their own slide via the real sliceSlide, and so setSource actually changes the source
// (triggering a re-lint), the way the real edit would.
const applySpy = vi.hoisted(() => vi.fn((src: string, _edit: unknown) => `${src}\n<!-- edited -->`));
vi.mock('./architect', () => ({
	requestFindingFix: fixSpy,
	applyDeckEdit: applySpy,
	useArchitectStatus: statusSpy,
	estimateUsd: (_text: string, price: { promptPerM: number | null; completionPerM: number | null } | null) => (price?.promptPerM == null ? null : 0.004),
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

beforeEach(() => {
	localStorage.clear();
	localStorage.setItem('lattice-studio-settings', JSON.stringify({ validation: true, pageNumbers: true, headerFooter: false, onboarded: true }));
	mockFindings.current = [{ ...FINDING }];
	fixSpy.mockImplementation(async (_src: string, finding: { slide?: number }) => ({ status: 'ok', before: `old line ${finding.slide}`, after: `new tightened line ${finding.slide}`, edit: { action: 'replace', slide: finding.slide, body: 'new' } }));
});
afterEach(() => {
	document.documentElement.removeAttribute('data-palette');
	vi.clearAllMocks();
	statusSpy.mockReturnValue({ ...READY });
	try {
		localStorage.clear();
	} catch {
		/* no storage */
	}
});

function setup() {
	const user = userEvent.setup();
	render(<StudioShell options={options} />);
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
		const apply = await screen.findByRole('button', { name: 'Apply' });
		expect(screen.getByText(/new tightened line/)).toBeInTheDocument();
		await user.click(apply);
		expect(applySpy).toHaveBeenCalled();
		expect(await screen.findByText(/Fix applied/)).toBeInTheDocument();
	});

	it('cycles progress in the pill while drafting, then splits into Apply / Discard', async () => {
		const user = setup();
		let resolveFix: (v: unknown) => void = () => {};
		fixSpy.mockImplementationOnce(() => new Promise((r) => { resolveFix = r as (v: unknown) => void; }));
		await user.click(await screen.findByRole('button', { name: /Fix ≈/ }));
		// In-pill progress (no toast) — an honest pipeline step is announced.
		expect(await screen.findByText(/Reading slide 2|Drafting|Preparing the diff/)).toBeInTheDocument();
		resolveFix({ status: 'ok', before: 'old', after: 'new tightened line 2', edit: { action: 'replace', slide: 2, body: 'new' } });
		// …then the pill splits.
		expect(await screen.findByRole('button', { name: 'Apply' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument();
	});

	it('Discard drops the proposed diff without applying', async () => {
		const user = setup();
		await user.click(await screen.findByRole('button', { name: /Fix ≈/ }));
		await user.click(await screen.findByRole('button', { name: 'Discard' }));
		expect(screen.queryByText(/new tightened line/)).not.toBeInTheDocument();
		expect(applySpy).not.toHaveBeenCalled();
	});

	it('offers no AI fix and points at Workspace when no model is ready', async () => {
		statusSpy.mockReturnValue({ ready: false, generation: 'floor', modelName: null, remaining: null, price: null });
		setup();
		expect(await screen.findByText('1 to address')).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: /Fix ≈/ })).not.toBeInTheDocument();
		expect(screen.getByText(/Connect a model in Workspace to fix these with AI/)).toBeInTheDocument();
	});
});

describe('Studio — batch fix (Draft all / Apply all)', () => {
	it('Draft all drafts every fixable finding, then Apply all applies them under one batch', async () => {
		mockFindings.current = [
			{ slide: 2, rule: 'wall-of-text', severity: 'warning', message: 'Too many words on slide two.' },
			{ slide: 3, rule: 'label-title', severity: 'info', message: 'Slide three has a label, not a takeaway.' },
		];
		const user = setup();
		// The batch DRAFT affordance is named for what it does (draft, not apply).
		const draftAll = await screen.findByRole('button', { name: /Draft all/ });
		await user.click(draftAll);
		// Both drafted → the Apply-all batch appears with the count.
		const applyAll = await screen.findByRole('button', { name: /Apply all \(2\)/ });
		expect(fixSpy).toHaveBeenCalledTimes(2);
		await user.click(applyAll);
		expect(applySpy).toHaveBeenCalledTimes(2);
		expect(await screen.findByText(/2 fixes applied/)).toBeInTheDocument();
	});

	it('Apply all leaves a superseded same-slide proposal visibly stale instead of clobbering', async () => {
		// Two findings on the SAME slide: two whole-slide rewrites can't both apply.
		mockFindings.current = [
			{ slide: 2, rule: 'wall-of-text', severity: 'warning', message: 'Too many words on slide two.' },
			{ slide: 2, rule: 'label-title', severity: 'warning', message: 'Slide two has a label, not a takeaway.' },
		];
		const user = setup();
		await user.click(await screen.findByRole('button', { name: /Draft all/ }));
		const applyAll = await screen.findByRole('button', { name: /Apply all \(2\)/ });
		await user.click(applyAll);
		// One applied, one kept as a visible "re-draft" card (not silently dropped).
		expect(applySpy).toHaveBeenCalledTimes(1);
		expect(await screen.findByText(/need a re-draft/)).toBeInTheDocument();
		expect(await screen.findByText(/Slide changed — the draft is out of date/)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Re-draft' })).toBeInTheDocument();
	});

	it('a proposed fix survives a re-lint of an unrelated slide (stay on Fix)', async () => {
		mockFindings.current = [
			{ slide: 2, rule: 'wall-of-text', severity: 'warning', message: 'Too many words on slide two.' },
			{ slide: 3, rule: 'label-title', severity: 'warning', message: 'Slide three has a label, not a takeaway.' },
		];
		const user = setup();
		// Draft only the slide-3 finding.
		const cards = await screen.findAllByRole('listitem');
		const slide3Card = cards.find((c) => within(c).queryByText(/slide three/i));
		expect(slide3Card).toBeTruthy();
		await user.click(within(slide3Card as HTMLElement).getByRole('button', { name: /Fix ≈/ }));
		expect(await within(slide3Card as HTMLElement).findByRole('button', { name: 'Apply' })).toBeInTheDocument();
		// Now apply the OTHER finding (slide 2) — that calls setSource, which triggers a
		// re-lint. The slide-3 proposal must survive the re-lint, not get dropped.
		const slide2Card = cards.find((c) => within(c).queryByText(/slide two/i));
		await user.click(within(slide2Card as HTMLElement).getByRole('button', { name: /Fix ≈/ }));
		await user.click(await within(slide2Card as HTMLElement).findByRole('button', { name: 'Apply' }));
		// After the re-lint settles, slide 3's Apply/Discard is still there.
		const after = await screen.findAllByRole('listitem');
		const slide3After = after.find((c) => within(c).queryByText(/slide three/i));
		expect(within(slide3After as HTMLElement).getByRole('button', { name: 'Apply' })).toBeInTheDocument();
	});
});
