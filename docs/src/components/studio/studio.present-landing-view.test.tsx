import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { approvalHash, parseLensRegistry } from '@/lib/lente';
import { PresentOverlay } from './PresentOverlay';

// The LANDING view — front matter's `lens-default:` — at the surface a reader actually uses (HARD RULE
// #23). This is the lever that was parsed, inherited, emitted and validated by Lente since the feature
// landed while NO consumer honored it (2026-08-25-lens-view-defaults-and-depth.md §1.1).
//
// The contract under test is the SOFT failure, and why it doesn't weaken the fail-CLOSED projection
// asserted next door in studio.present-lens-gate.test.tsx: a landing view is where a reader STARTS, not
// what they may SEE, so an ineligible target lands on Full instead of showing "unavailable". That is
// safe precisely because eligibility is resolved BEFORE the id is selected — an ineligible id never
// becomes the active lens, so the projection is never asked to fall open.

vi.mock('@/components/DeckPreview', () => ({ default: () => <div data-testid="dp" /> }));
vi.mock('@/playground/voice-model.js', () => ({
	createVoiceModel: () => ({ synthOne: async () => ({ rung: 'silent', bytes: null, key: 'k' }), speakThis() {}, stop() {}, pause() {}, resume() {}, rung: () => 'silent', warm: vi.fn() }),
}));
vi.mock('./studio-presenter', () => ({ buildPresenterStageDoc: vi.fn(async () => ({ doc: '', total: 0 })) }));

const options = { themeBase: '', runtimeUrl: '', engineUrl: '' };
// A 4-slide deck whose 2nd and 4th slides are the members of `brief`.
const slides = [
	'<!-- _class: title -->\n\n# Cover',
	'<!-- _class: kpi -->\n<!-- _lens: brief -->\n\n# The number',
	'<!-- _class: quote -->\n\n# Appendix',
	'<!-- _class: closing -->\n<!-- _lens: brief -->\n\n# The ask',
];

/** Front matter with `brief` defined, optionally approved, and an optional `lens-default:` scalar. */
function fm({ approved = false, landing }: { approved?: boolean; landing?: string } = {}): string {
	const head = landing ? `lens-default: ${landing}\n` : '';
	const bare = `${head}lenses:\n  brief: { label: "Bottom line", base: none }`;
	if (!approved) return bare;
	const hash = approvalHash(slides, parseLensRegistry(bare), 'brief');
	return `${head}lenses:\n  brief: { label: "Bottom line", base: none, approved: ${JSON.stringify(hash)} }`;
}

function present(source: string, startIndex?: number) {
	const reg = parseLensRegistry(source);
	render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} frontMatter={source} registry={reg} startIndex={startIndex} notify={() => {}} />);
	return reg;
}

afterEach(() => vi.clearAllMocks());

describe('Present — the landing view (`lens-default:`)', () => {
	it('opens on the deck default when that view is reader-eligible', () => {
		const reg = present(fm({ approved: true, landing: 'brief' }));
		expect(reg.default).toBe('brief'); // the scalar round-tripped through the registry
		// brief has 2 of the 4 slides, and Present opened INSIDE it — not on the full deck.
		expect(screen.getByText('1 / 2')).toBeInTheDocument();
	});

	it('falls back to the full deck when the default names an UNAPPROVED view', () => {
		const reg = present(fm({ approved: false, landing: 'brief' }));
		expect(reg.default).toBe('brief'); // the author's intent is preserved in the source…
		expect(screen.getByText('1 / 4')).toBeInTheDocument(); // …but readers land on the whole deck
	});

	it('falls back to the full deck when the default names a view that does not exist', () => {
		// A stale `lens-default: exec` left behind by a rename is the case that must not throw or
		// half-project — it resolves to Full like any other ineligible target.
		present(`lens-default: exec\nlenses:\n  brief: { label: "Bottom line", base: none }`);
		expect(screen.getByText('1 / 4')).toBeInTheDocument();
	});

	it('opens on the whole deck when no default is set', () => {
		present(fm({ approved: true }));
		expect(screen.getByText('1 / 4')).toBeInTheDocument();
	});

	it('starts at the TOP of the landing view, ignoring the editing cursor', () => {
		// The cursor sits on slide 4 (the last brief member). Under a landing view the reader starts at
		// the view's first slide: `idx` indexes the PROJECTED set, so carrying a full-deck cursor across
		// would point at an unrelated slide — and the cursor slide often isn't a member at all.
		present(fm({ approved: true, landing: 'brief' }), 3);
		expect(screen.getByText('1 / 2')).toBeInTheDocument();
	});

	it('still honors the editing cursor when the deck lands on Full', () => {
		present(fm({ approved: true }), 2);
		expect(screen.getByText('3 / 4')).toBeInTheDocument();
	});
});
