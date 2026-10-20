import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { ChatTraceDialog } from './ChatTraceDialog';
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
		render(<ChatTraceDialog trace={trace} usage={usage} open onOpenChange={() => {}} />);
		expect(screen.getByText('Lattice primer')).toBeTruthy();
		expect(screen.queryByText('Reference documents')).toBeNull(); // empty parts are not listed
		expect(screen.getByText('2 model calls')).toBeTruthy();
		const link = screen.getByText('Read slides');
		expect(link.tagName).toBe('SUMMARY');
		await userEvent.click(link);
		expect(screen.getByText('{"slides":[1,2]}')).toBeTruthy();
		expect(screen.getByText('slide 1 ...')).toBeTruthy();
		await userEvent.click(screen.getByText('Thinking'));
		expect(screen.getByText('The deck has three slides.')).toBeTruthy();
		expect(screen.getByText(/30 thinking tokens/)).toBeTruthy();
	});
});
