import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatTraceDialog, inputTotals, roundLedger, snippet } from './ChatTraceDialog';
import type { ChatTrace, ChatUsage } from './studio-store';

afterEach(cleanup);

const trace: ChatTrace = {
	sent: { primer: 16500, deck: 900, history: 200, tools: 1400, docs: 0, photos: 0 },
	rounds: [
		{ reasoning: 'The deck has three slides.', text: 'Let me read them.', calls: [{ name: 'read_slides', args: '{"slides":[1,2]}', result: 'slide 1 ...' }], cost: 0.012, prompt: 18000, completion: 120 },
		{ text: 'Done.', calls: [], cost: 0.004, prompt: 18400, completion: 40 },
	],
};
const usage: ChatUsage = { cost: 0.016, prompt: 18400, completion: 160, cached: 16500, reasoning: 30, rounds: 2, window: 200000, model: 'm' };

describe('Show work', () => {
	it('lists what was sent, each call, and its commands behind a link', async () => {
		render(<ChatTraceDialog trace={trace} usage={usage} open onOpenChange={() => {}} renderMarkdown={(t) => <em data-testid="md">{t}</em>} />);
		expect(screen.getByText('Lattice primer')).toBeTruthy();
		expect(screen.queryByText('Reference documents')).toBeNull(); // empty parts are not listed
		expect(screen.getByText('2 model calls')).toBeTruthy();
		const link = screen.getByText('Read slides');
		expect(link.tagName).toBe('SUMMARY');
		await userEvent.click(link);
		expect(screen.getByText('{"slides":[1,2]}')).toBeTruthy();
		expect(screen.getByText('slide 1 ...')).toBeTruthy();
		await userEvent.click(screen.getByText('Thinking'));
		// Thinking goes through the host's markdown renderer, not a bare <pre>.
		expect(screen.getAllByTestId('md').some((n) => n.textContent === 'The deck has three slides.')).toBe(true);
		// One click shows the exact characters, and another puts the formatting back.
		await userEvent.click(screen.getByRole('button', { name: 'Raw' }));
		expect(screen.getByText('The deck has three slides.').tagName).toBe('PRE');
		await userEvent.click(screen.getByRole('button', { name: 'Formatted' }));
		expect(screen.getAllByTestId('md').some((n) => n.textContent === 'The deck has three slides.')).toBe(true);
		expect(screen.getByText(/30 thinking tokens/)).toBeTruthy();
	});

	it('opens on a malformed saved trace (an imported backup) instead of crashing', () => {
		const bad = { rounds: [{ calls: null, cost: 'x', prompt: null, completion: undefined }] } as unknown as ChatTrace;
		render(<ChatTraceDialog trace={bad} usage={{ cost: undefined, prompt: 'n' } as unknown as ChatUsage} open onOpenChange={() => {}} />);
		expect(screen.getByText('1 model call')).toBeTruthy();
	});

	it('does not claim a billed figure once compaction has made the count an estimate', () => {
		render(<ChatTraceDialog trace={trace} usage={{ ...usage, estimated: true }} open onOpenChange={() => {}} />);
		expect(screen.queryByText(/The provider billed/)).toBeNull();
	});

	it('shows the first line of each thought beside its label, without markdown marks', () => {
		expect(snippet('**Plan**\n- read the slides')).toBe('Plan');
		expect(snippet('\n\n> The deck has three slides.')).toBe('The deck has three slides.');
		expect(snippet('x'.repeat(200), 20)).toHaveLength(20);
		render(<ChatTraceDialog trace={trace} usage={usage} open onOpenChange={() => {}} />);
		expect(screen.getByText(/The deck has three slides\./, { selector: 'summary span' })).toBeTruthy();
	});

	it('opens as a bottom sheet on a phone-width screen, with the same content', () => {
		vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('max-width: 639px'), media: q, addEventListener: () => {}, removeEventListener: () => {} }));
		try {
			render(<ChatTraceDialog trace={trace} usage={usage} open onOpenChange={() => {}} />);
			const sheet = screen.getByTestId('chat-trace');
			expect(sheet.getAttribute('data-slot')).toBe('sheet-content');
			expect(sheet.className).toContain('rounded-t-2xl');
			expect(screen.getByText('Lattice primer')).toBeTruthy();
			expect(screen.getByText('2 model calls')).toBeTruthy();
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it('keeps meaningful leading digits and punctuation in a thought snippet', () => {
		expect(snippet('3 slides need work')).toBe('3 slides need work');
		expect(snippet('2026 revenue is the headline')).toBe('2026 revenue is the headline');
		expect(snippet('-1.5% is bad')).toBe('-1.5% is bad');
		expect(snippet('1. Read the deck\n2. Fix it')).toBe('Read the deck'); // a list marker does come off
		expect(snippet('- a bullet')).toBe('a bullet');
	});

	it('gives an empty snippet for separators, odd input and a cut that would split an emoji', () => {
		expect(snippet('---')).toBe('');
		expect(snippet('...\n\n')).toBe('');
		expect(snippet(undefined)).toBe('');
		expect(snippet({} as unknown as string)).toBe('');
		const cut = snippet(`ab${'😀'.repeat(50)}`, 10);
		expect(Array.from(cut)).toHaveLength(10);
		expect(cut.endsWith('…')).toBe(true);
		expect(cut.isWellFormed()).toBe(true); // no lone surrogate
	});

	it('draws no dangling separator when a thought has no readable first line', () => {
		const t: ChatTrace = { ...trace, rounds: [{ reasoning: '---', calls: [], cost: 0, prompt: 0, completion: 0 }] };
		render(<ChatTraceDialog trace={t} open onOpenChange={() => {}} />);
		expect(screen.getByText('Thinking').parentElement?.textContent).toBe('Thinking');
	});
});

describe('the per-call ledger (#3533 S01/S02)', () => {
	const call = { calls: [], cost: 0.0123, prompt: 9100, completion: 300 };
	it('shows the cached share, "cache unknown" when none was reported, and nothing on a trace saved before it was kept', () => {
		expect(roundLedger({ ...call, cached: 7000 })).toBe('$0.012 · 9.1K in (7.0K cached) · 300 out');
		expect(roundLedger({ ...call, cached: null })).toBe('$0.012 · 9.1K in (cache unknown) · 300 out');
		expect(roundLedger(call)).toBe('$0.012 · 9.1K in · 300 out');
	});
	it('marks a stopped call as an estimate', () => {
		expect(roundLedger({ ...call, cached: null, estimated: true })).toBe('≈ $0.012 · ≈ 9.1K in (cache unknown) · 300 out');
	});
	it('keeps cumulative input apart from the largest single call', () => {
		expect(inputTotals([{ ...call, prompt: 9000 }, { ...call, prompt: 12000 }, { ...call, prompt: 11000 }])).toBe('32K input over 3 calls, 12K at most in one');
	});
	it('renders the ledger and an estimated total in Show work', () => {
		const trace: ChatTrace = { sent: { primer: 100, deck: 50, history: 0, tools: 30, docs: 0, photos: 0 }, rounds: [{ ...call, cached: 7000 }, { ...call, cached: null, estimated: true }] };
		const usage = { cost: 0.0246, prompt: 9100, completion: 600, cached: null, reasoning: 0, rounds: 2, window: null, model: 'm', estimated: true } as ChatUsage;
		render(<ChatTraceDialog open onOpenChange={() => {}} trace={trace} usage={usage} />);
		expect(screen.getAllByTestId('trace-round-ledger').map((e) => e.textContent)).toEqual(['$0.012 · 9.1K in (7.0K cached) · 300 out', '≈ $0.012 · ≈ 9.1K in (cache unknown) · 300 out']);
		expect(screen.getByText(/stopped, estimated/)).toBeTruthy();
		expect(screen.getByTestId('trace-total').textContent).toContain('≈ $0.025');
		expect(screen.getByTestId('trace-total').textContent).toContain('18K input over 2 calls, 9.1K at most in one');
	});
});
