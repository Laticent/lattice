import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PresentOverlay } from './PresentOverlay';

// Two entry rules for a `_build` slide that Present walks (engineering/decisions/2026-11-09-steps-as-a-behavior.md,
// D2), each found broken by the red team on 2026-11-10:
//   - Live: a presenter's move onto a build was sent before its walk was measured, with no step, which a member reads
//     as rest: the member saw the build whole, then hidden. The move now waits for the measured step.
//   - Play: narration reads the whole slide, so Play on a build part-way through its walk (step 0 after a jump) shows
//     the whole slide, as autoplay does on every slide it reaches.
// The preview is mocked: it records the step Present asks for, and reports a three-step build the way DeckPreview does.

const reports: Array<(r: unknown) => void> = [];
vi.mock('@/components/DeckPreview', () => ({
	default: (p: { step?: unknown; onSteps?: (r: unknown) => void }) => {
		if (p.onSteps) reports.push(p.onSteps);
		return <div data-testid="dp" data-step={JSON.stringify(p.step ?? null)} />;
	},
}));
vi.mock('@/playground/voice-model.js', () => ({
	createVoiceModel: () => ({ synthOne: async () => ({ rung: 'silent', bytes: null, key: 'k' }), speakThis() {}, stop() {}, pause() {}, resume() {}, rung: () => 'silent', warm: () => {} }),
}));
vi.mock('./studio-stage', () => ({ buildStageDocument: vi.fn(async () => ({ doc: '', total: 0 })) }));

const options = { themeBase: '', runtimeUrl: '', engineUrl: '' };
const BUILD = `<!-- _build -->\n\n## Built\n\n- First\n- Second\n- Third\n\n<!-- say: ${'Three points, each one read aloud in full while the slide is up. '.repeat(20)} -->`;
const steps = () => screen.getAllByTestId('dp').map((d) => d.getAttribute('data-step'));
/** The preview measures the shown slide: a three-step build, at the step Present asked for. */
const measure = (at: number | null) => act(() => { for (const r of reports.splice(0)) r({ slide: 0, kind: 'build', count: 3, at }); });

afterEach(() => {
	reports.length = 0;
	localStorage.clear();
	vi.clearAllMocks();
});

describe('Present on a build slide', () => {
	it('Live: the first move a member hears already carries the measured step, never a bare move that reads as rest', async () => {
		const onTransport = vi.fn();
		render(<PresentOverlay open onClose={() => {}} options={options} slides={[BUILD, '# End']} live={{ onTransport } as never} />);
		// Opening Present on a build is a jump: it starts hidden (D2), and nothing is published until that is measured.
		await waitFor(() => expect(steps()).toContain('{"enter":"jump"}'));
		expect(onTransport.mock.calls.filter(([t]) => t.idx === 0 && t.step === undefined)).toEqual([]);
		measure(0);
		await waitFor(() => expect(onTransport).toHaveBeenCalledWith(expect.objectContaining({ idx: 0, step: 0 })));
		expect(onTransport.mock.calls[0][0]).toEqual(expect.objectContaining({ idx: 0, step: 0 }));
	});

	it('Play shows the whole build: a slide hidden at step 0 comes to rest before it is read', async () => {
		const user = userEvent.setup();
		render(<PresentOverlay open onClose={() => {}} options={options} slides={[BUILD, '# End']} />);
		await waitFor(() => expect(steps()).toContain('{"enter":"jump"}'));
		measure(0);
		// A long say: line, so the read is still on the build slide when the step is checked.
		await user.click(screen.getByRole('button', { name: 'Play the presentation' }));
		await waitFor(() => {
			expect(screen.getByText('1 / 2')).toBeInTheDocument();
			for (const s of steps()) expect(s).toBe('null');
		});
		expect(screen.getByText('1 / 2')).toBeInTheDocument();
	});
});
