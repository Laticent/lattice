import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatTraceDialog, snippet } from './ChatTraceDialog';
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
