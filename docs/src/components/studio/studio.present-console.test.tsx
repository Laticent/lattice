import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PresentOverlay } from './PresentOverlay';

// The CONSOLE's own instruments — the next slide, the speaker notes and the talk clock
// (2026-08-24-stage-console-split.md §4). They are what the retired second presenter
// window carried; deleting that window without moving them would have quietly dropped
// three features, so this is the cell that says they came back.
//
// It lives on the PR gate deliberately. The layout half is verified on the real Studio
// (`docs/e2e/scenarios/present-run.spec.ts`), but that tier is nightly — and what is
// asserted here is not layout, it is DERIVATION: which slide the Next panel points at,
// which note is showing, and that the last slide says so instead of wrapping to slide 1.
//
// The panel is a >= lg affordance and it is gated in JS, not by a `hidden lg:flex` class,
// because it carries a live engine frame (see `useConsolePanel`). The setup's whole job
// is therefore the matchMedia stub: the shared one in `vitest.setup.ts` answers `false`
// to every query, which is the right default for the suite and means this panel would
// otherwise never render in jsdom at all.
vi.mock('@/components/DeckPreview', () => ({
	default: ({ slideIndex, 'aria-label': label }: { slideIndex?: number; 'aria-label'?: string }) => <div data-testid="dp" data-label={label} data-index={slideIndex} />,
}));
vi.mock('./studio-stage', () => ({ buildStageDocument: vi.fn(async () => ({ doc: '', total: 0, bg: '#15110d' })) }));

const options = { themeBase: '', runtimeUrl: '', engineUrl: '' };
const NOTE = 'Open on the ask, then pause.';
const slides = [
	`<!-- _class: title -->\n\n# One\n\nThe first slide.\n\n<!-- note: ${NOTE} -->`,
	'<!-- _class: kpi -->\n\n# Two\n\nThe second slide.',
];

let realMatchMedia: typeof window.matchMedia;
beforeEach(() => {
	realMatchMedia = window.matchMedia;
	// A wide console: only the panel's own query matches, so nothing else in the tree
	// changes shape underneath the assertions.
	window.matchMedia = ((query: string) =>
		({
			matches: query === '(min-width: 1024px)',
			media: query,
			onchange: null,
			addEventListener: () => {},
			removeEventListener: () => {},
			addListener: () => {},
			removeListener: () => {},
			dispatchEvent: () => false,
		}) as unknown as MediaQueryList) as typeof window.matchMedia;
});
afterEach(() => {
	window.matchMedia = realMatchMedia;
	localStorage.clear();
	vi.clearAllMocks();
});

const panelOf = () => within(screen.getByRole('complementary', { name: 'Notes and next slide' }));

describe('Present — the console keeps the instruments the second window carried', () => {
	it('shows THIS slide\'s note and renders the NEXT slide, not the current one', () => {
		render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} startIndex={0} notify={() => {}} />);
		const panel = panelOf();
		expect(panel.getByText(NOTE)).toBeInTheDocument();
		// The index is the load-bearing bit: a Next panel pointed at `clamped` would look
		// perfectly fine and show the slide the presenter is already looking at.
		const next = panel.getByTestId('dp');
		expect(next.getAttribute('data-label')).toBe('Next slide preview');
		expect(next.getAttribute('data-index')).toBe('1');
	});

	it('says the deck has ended rather than wrapping the preview to slide 1', () => {
		render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} startIndex={1} notify={() => {}} />);
		const panel = panelOf();
		expect(panel.getByText('End of the deck')).toBeInTheDocument();
		expect(panel.queryByTestId('dp')).toBeNull();
		// And a slide with no note says so, rather than leaving the last slide's note up —
		// which on a talk track is worse than blank, because it reads as still current.
		expect(panel.getByText('No speaker notes on this slide.')).toBeInTheDocument();
	});

	it('does not render the panel — or its engine frame — on a narrow console', () => {
		window.matchMedia = realMatchMedia; // the suite default: nothing matches
		render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} notify={() => {}} />);
		expect(screen.queryByRole('complementary', { name: 'Notes and next slide' })).toBeNull();
		// ONE live preview, not two. A CSS-hidden panel would still mount its frame, which
		// is the cost this gate is really about on the device least able to spare it.
		expect(screen.getAllByTestId('dp')).toHaveLength(1);
	});

	it('offers a talk clock whose reset ARMS before it wipes', async () => {
		const { default: userEvent } = await import('@testing-library/user-event');
		const user = userEvent.setup();
		render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} notify={() => {}} />);
		const reset = screen.getByRole('button', { name: 'Reset the talk clock' });
		await user.click(reset);
		// The label changes because the ACTION changed — the second press does something
		// the first did not. Everywhere else on this bar `aria-pressed` carries state and
		// the name is stable; this is the one control where a stable name would be the lie.
		expect(screen.getByRole('button', { name: 'Confirm reset of the talk clock' })).toBeInTheDocument();
	});
});

// ── the console's own <style> sink ───────────────────────────────────────────
//
// The console injects `STAGE_CHROME_CSS` into ITS document so one PresentCaption and one
// PresentRail render correctly in either host. That element is a genuine stylesheet sink and
// NO ARM OF HARD RULE #22 CAN SEE IT: `checkDocumentStyleSinks` keys on a doctype opener and
// this assembles no document; `checkPreviewHtmlSinks` keys on the split runtime-`<script>`
// idiom and this is no preview builder; `checkCssTreeRewrapSinks` wants a CSS serializer and
// there is none. So the safety is structural — a JSX TEXT CHILD sets `textContent`, where a
// `</style>` carried in theme or author CSS is inert — or it is nothing at all.
//
// Structural safety with no gate behind it is one careless edit from gone, and the edit that
// would end it is a one-word swap back to `dangerouslySetInnerHTML` that reviews as a
// no-op. This is the same reasoning as `test/unit/export/style-guard-census.test.js`: the
// #22 gates are text matchers, so what they cannot see needs a pin of its own. It reads the
// source because the hazard is in the SOURCE — a rendered `<style>` looks identical either
// way, so no behavioral assertion can tell the two apart.
describe('PresentOverlay — the audience-chrome stylesheet is a text child', () => {
	it('never reaches the DOM through dangerouslySetInnerHTML', async () => {
		const { readFileSync } = await import('node:fs');
		const { join } = await import('node:path');
		// From the vitest root (`docs/`), not `import.meta.url` — under Vite that is an http
		// URL, not a file one, and `fileURLToPath` throws on it.
		const src = readFileSync(join(process.cwd(), 'src/components/studio/PresentOverlay.tsx'), 'utf8');
		// The sink itself, in the shape that makes the terminator inert.
		expect(src).toContain('<style>{STAGE_CHROME_CSS}</style>');
		// And no `<style>` anywhere in this file takes parsed markup. Deliberately scoped to
		// `<style` rather than banning the prop outright: it has legitimate uses elsewhere in
		// a React tree, and a rule that fires on those would be turned off rather than obeyed.
		const parsedStyle = /<style[^>]*\bdangerouslySetInnerHTML/.test(src);
		expect(parsedStyle).toBe(false);
	});
});
