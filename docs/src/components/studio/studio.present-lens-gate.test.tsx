import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { approvalHash, parseLensRegistry } from '@/lib/lente';
import { PresentOverlay } from './PresentOverlay';

// The reader gate, at the surface a reader actually uses (HARD RULE #23). Present is the human-facing
// reader path: a scoping lens can be a REDACTION, so a lens the author hasn't approved (or that drifted
// since approval, or that has no members) must NEVER silently fall open to the full deck — Present has
// to render an explicit "unavailable" state instead. These assert the fail-CLOSED contract at the
// PresentOverlay ↔ @slidewright/lente seam (design §6.3), not just at the pure-projection layer.

vi.mock('@/components/DeckPreview', () => ({ default: () => <div data-testid="dp" /> }));
vi.mock('@/playground/voice-model.js', () => ({
	createVoiceModel: () => ({ synthOne: async () => ({ rung: 'silent', bytes: null, key: 'k' }), speakThis() {}, stop() {}, pause() {}, resume() {}, rung: () => 'silent', warm: vi.fn() }),
}));
vi.mock('./studio-presenter', () => ({ buildPresenterStageDoc: vi.fn(async () => ({ doc: '', total: 0 })) }));

const options = { themeBase: '', runtimeUrl: '', engineUrl: '' };
// A deck whose middle slide is the only member of `brief`.
const slides = [
	'<!-- _class: title -->\n\n# Cover',
	'<!-- _class: kpi -->\n<!-- _lens: brief -->\n\n# The number',
	'<!-- _class: quote -->\n\n# Appendix',
];

// A registry with an APPROVED brief (hash bound to its real membership) vs. an UNAPPROVED one.
function fmWith(approved: boolean): string {
	const base = 'lenses:\n  brief: { label: "Bottom line", base: none }';
	const reg = parseLensRegistry(base);
	if (!approved) return base;
	const hash = approvalHash(slides, reg, 'brief');
	return `lenses:\n  brief: { label: "Bottom line", base: none, approved: ${JSON.stringify(hash)} }`;
}

afterEach(() => vi.clearAllMocks());

describe('Present — reader lens gate (fail closed)', () => {
	it('an UNAPPROVED registry lens is not even offered to the reader', () => {
		const reg = parseLensRegistry(fmWith(false));
		render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} frontMatter={fmWith(false)} registry={reg} notify={() => {}} />);
		// brief is the ONLY non-full lens and it's unapproved → not reader-eligible → the picker has only
		// "Full deck", so it renders a static label with NO reader-view dropdown (nothing to switch to).
		expect(screen.getByText('Full deck')).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Reader view' })).not.toBeInTheDocument();
		// Present opens on the whole deck (3 slides) — the safe default a reader LANDS on, not a scoped lens.
		expect(screen.getByText('1 / 3')).toBeInTheDocument();
	});

	it('an APPROVED registry lens is offered as a real reader-view switcher', () => {
		const reg = parseLensRegistry(fmWith(true));
		render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} frontMatter={fmWith(true)} registry={reg} notify={() => {}} />);
		// brief is approved → eligible → the picker now has 2 entries (Full deck + Bottom line) → dropdown.
		expect(screen.getByRole('button', { name: 'Reader view' })).toBeInTheDocument();
		// The library says brief has exactly one member (the KPI slide) — the seam preserves that.
		expect(reg.lenses.some((l) => l.id === 'brief')).toBe(true);
	});
});
