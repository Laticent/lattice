import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import StudioShell from './StudioShell';

// Slice: Architect selection Refine. With a model connected, selecting text in the
// editor reveals a "Refine" control (Polish / Formalize / Elaborate / Shorten);
// picking an action rewrites JUST the selection via the model and applies it as one
// undoable edit, checkpointing first. Honest with no model. CodeMirror selection
// can't be driven in jsdom, so we stub the Editor to a controllable surface and
// assert the StudioShell ORCHESTRATION (gating, apply, checkpoint, degradation).

vi.mock('@/components/DeckPreview', () => ({
	default: ({ 'aria-label': label }: { 'aria-label'?: string }) => <div data-testid="deck-preview">{label}</div>,
}));

// A controllable Editor stub: a textarea bound to value/onChange, a button that
// fakes a selection (the whole doc) and notifies the shell, and a ref handle whose
// getSelection/replaceSelection act over that fake selection.
vi.mock('./Editor', async () => {
	const React = await import('react');
	const Editor = React.forwardRef(
		(
			{ value, onChange, onSelectionChange }: { value: string; onChange: (v: string) => void; onSelectionChange?: (h: boolean) => void },
			ref: React.Ref<unknown>,
		) => {
			const selRef = React.useRef<{ from: number; to: number }>({ from: 0, to: 0 });
			React.useImperativeHandle(ref, () => ({
				fixAll() {},
				revealSlide() {},
				getSelection() {
					const { from, to } = selRef.current;
					return { empty: from === to, text: value.slice(from, to), from, to };
				},
				replaceSelection(text: string) {
					const { from, to } = selRef.current;
					onChange(value.slice(0, from) + text + value.slice(to));
				},
			}));
			return (
				<div>
					<textarea aria-label="Deck source" value={value} onChange={(e) => onChange(e.target.value)} />
					<button
						type="button"
						onClick={() => {
							selRef.current = { from: 0, to: value.length };
							onSelectionChange?.(true);
						}}
					>
						stub-select-all
					</button>
				</div>
			);
		},
	);
	return { Editor, suggestFor: () => 'kpi' };
});

// The architect layer — the model is the unit under integration here; mock it so we
// control the outcome (ready model, a real rewrite) without a backend.
const refineSpy = vi.hoisted(() => vi.fn(async (_action: string, _text: string, _deckLang?: string) => ({ status: 'ok', text: 'REFINED COPY' })));
const statusSpy = vi.hoisted(() => vi.fn((): { ready: boolean; generation: string; modelName: string | null; remaining: number | null } => ({ ready: true, generation: 'openrouter', modelName: 'test', remaining: null })));
vi.mock('./architect', () => ({
	refineSelection: refineSpy,
	REFINE_ACTIONS: [
		{ id: 'polish', label: 'Polish', hint: 'tighten and clarify' },
		{ id: 'shorten', label: 'Shorten', hint: 'cut to the essential' },
	],
	useArchitectStatus: statusSpy,
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
	return user;
}

describe('Studio — Architect selection Refine', () => {
	it('hides the Refine control until there is a selection', () => {
		setup();
		expect(screen.queryByRole('button', { name: 'Refine selection' })).not.toBeInTheDocument();
	});

	it('reveals Refine on a selection and applies the model rewrite to the editor', async () => {
		const user = setup();
		await user.click(screen.getByRole('button', { name: 'stub-select-all' }));
		const refineBtn = await screen.findByRole('button', { name: 'Refine selection' });
		await user.click(refineBtn);
		const menu = await screen.findByRole('menu');
		await user.click(within(menu).getByText('Polish'));
		// The model was asked to refine the selected text (a 3rd arg threads the deck's
		// `lang:` so a refine keeps the deck's dialect — absent here, so it's undefined).
		const [act, txt] = refineSpy.mock.calls[0];
		expect(act).toBe('polish');
		expect(typeof txt).toBe('string');
		// …and the rewrite landed in the editor (replaceSelection → onChange → source).
		expect(await screen.findByDisplayValue(/REFINED COPY/)).toBeInTheDocument();
		// A pre-edit checkpoint makes it reversible from History.
		expect(screen.getByText(/Polish applied/)).toBeInTheDocument();
	});

	it('offers a connect path instead of actions when no model is ready', async () => {
		statusSpy.mockReturnValue({ ready: false, generation: 'floor', modelName: null, remaining: null });
		const user = setup();
		await user.click(screen.getByRole('button', { name: 'stub-select-all' }));
		await user.click(await screen.findByRole('button', { name: 'Refine selection' }));
		const menu = await screen.findByRole('menu');
		expect(within(menu).getByText(/Connect a model to refine/)).toBeInTheDocument();
		expect(within(menu).queryByText('Polish')).not.toBeInTheDocument();
	});
});
