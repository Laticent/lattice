import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { approvalHash, catalogFromComponents, parseLensRegistry } from '@/lib/lente';
import { LensesPanel } from './LensesPanel';

// The human-in-the-loop control center. These assert the loop the whole feature exists to enforce: a
// machine SUGGESTS, the author sees each proposal + reason, edits by hand, and APPROVES — and only an
// approved view is readable. Writes are asserted at the callback boundary (the shell funnels them to
// the library + undo); the panel itself is pure presentation over @slidewright/lente.

const catalog = catalogFromComponents([
	{ name: 'title', bucket: 'anchor', function: 'anchor', form: 'bookend' },
	{ name: 'kpi', bucket: 'evidence', function: 'evidence', form: 'metric' },
	{ name: 'quote', bucket: 'connect', function: 'statement', form: 'pull' },
	{ name: 'closing', bucket: 'anchor', function: 'anchor', form: 'bookend' },
]);
const slides = [
	'<!-- _class: title -->\n# Cover',
	'<!-- _class: kpi -->\n# The number',
	'<!-- _class: quote -->\n# A voice',
	'<!-- _class: closing -->\n# Ask',
];

function setup(fm: string, over: Partial<React.ComponentProps<typeof LensesPanel>> = {}) {
	const onWriteRegistry = vi.fn();
	const onTag = vi.fn();
	const onPreview = vi.fn();
	render(<LensesPanel slides={slides} registry={parseLensRegistry(fm)} catalog={catalog} activeLens="full" onPreview={onPreview} onWriteRegistry={onWriteRegistry} onTag={onTag} {...over} />);
	return { onWriteRegistry, onTag, onPreview };
}

describe('LensesPanel — add a reader view', () => {
	it('offers the reader archetypes and appends the picked one to the registry (empty + unapproved)', async () => {
		const user = userEvent.setup();
		const { onWriteRegistry } = setup(''); // no registry yet
		await user.click(screen.getByRole('button', { name: /Add a reader view/ }));
		await user.click(screen.getByRole('button', { name: /Bottom line/ }));
		expect(onWriteRegistry).toHaveBeenCalledTimes(1);
		const [, reg] = onWriteRegistry.mock.calls[0];
		expect(reg.lenses.map((l: { id: string }) => l.id)).toEqual(['full', 'brief']);
		expect(reg.lenses.find((l: { id: string }) => l.id === 'brief').approved).toBeUndefined();
	});

	it('does not re-offer a lens that already exists', async () => {
		const user = userEvent.setup();
		setup('lenses:\n  brief: { label: "Bottom line", base: none }');
		await user.click(screen.getByRole('button', { name: /Add a reader view/ }));
		// brief is taken → only the other three archetypes remain on the add menu. The archetype BLURB is
		// unique to the add menu (the existing lens row shows only the label), so key on it.
		expect(screen.queryByText(/Headline metrics/i)).not.toBeInTheDocument(); // brief's blurb — absent
		expect(screen.getByText(/The throughline/i)).toBeInTheDocument(); // story's blurb — present
	});
});

describe('LensesPanel — suggest + membership', () => {
	it('surfaces per-slide suggestions with a reason, and Accept-all writes the tags', async () => {
		const user = userEvent.setup();
		const { onTag } = setup('lenses:\n  brief: { label: "Bottom line", base: none }');
		await user.click(screen.getByRole('button', { name: /Bottom line/ })); // expand the row
		// brief suggests the bookends (title/closing) + the metric (kpi) — never the connect quote.
		expect(screen.getByText(/suggestion/i)).toBeInTheDocument();
		await user.click(screen.getByRole('button', { name: 'Accept all' }));
		expect(onTag).toHaveBeenCalledTimes(1);
		const [, changes] = onTag.mock.calls[0];
		const ids = changes.map((c: { index: number }) => c.index).sort();
		expect(ids).toEqual([0, 1, 3]); // title, kpi, closing — the quote (2) is excluded
		for (const c of changes) expect(c).toMatchObject({ lensId: 'brief', member: true, base: 'none' });
	});

	it('a manual slide toggle writes a single tag change', async () => {
		const user = userEvent.setup();
		const { onTag } = setup('lenses:\n  brief: { label: "Bottom line", base: none }');
		await user.click(screen.getByRole('button', { name: /Bottom line/ }));
		// The per-slide list carries a row per slide; toggle slide 3 (the quote) into the view.
		const row = screen.getByRole('button', { name: /quote/ });
		await user.click(row);
		expect(onTag).toHaveBeenCalledTimes(1);
		const [, changes] = onTag.mock.calls[0];
		expect(changes).toEqual([{ index: 2, lensId: 'brief', member: true, base: 'none' }]);
	});
});

describe('LensesPanel — approval gate (the human control)', () => {
	// A registry whose brief has one real member (the kpi), so it is approvable.
	const tagged = ['<!-- _class: title -->\n# Cover', '<!-- _class: kpi -->\n<!-- _lens: brief -->\n# The number'];
	const fm = 'lenses:\n  brief: { label: "Bottom line", base: none }';

	it('a draft view shows "hidden from readers" and Approve binds the current content hash', async () => {
		const user = userEvent.setup();
		const onWriteRegistry = vi.fn();
		render(<LensesPanel slides={tagged} registry={parseLensRegistry(fm)} catalog={catalog} activeLens="full" onPreview={() => {}} onWriteRegistry={onWriteRegistry} onTag={() => {}} />);
		const row = screen.getByRole('button', { name: /Bottom line/ });
		await user.click(row);
		expect(screen.getByText(/hidden from readers/i)).toBeInTheDocument();
		await user.click(screen.getByRole('button', { name: /Approve for readers/ }));
		const [, reg] = onWriteRegistry.mock.calls[0];
		expect(reg.lenses.find((l: { id: string }) => l.id === 'brief').approved).toBe(approvalHash(tagged, parseLensRegistry(fm), 'brief'));
	});

	it('an empty view cannot be approved — no Approve button, an explanation instead', async () => {
		const user = userEvent.setup();
		setup(fm); // slides have NO brief tags → brief is empty
		await user.click(screen.getByRole('button', { name: /Bottom line/ }));
		expect(screen.queryByRole('button', { name: /Approve for readers/ })).not.toBeInTheDocument();
		expect(screen.getByText(/No slides yet/i)).toBeInTheDocument();
	});

	it('an approved view offers Unapprove and, once its content drifts, Re-approve', async () => {
		const user = userEvent.setup();
		// Approve bound to the CURRENT content, then a body edit drifts the hash.
		const approvedFm = `lenses:\n  brief: { label: "Bottom line", base: none, approved: ${JSON.stringify(approvalHash(tagged, parseLensRegistry(fm), 'brief'))} }`;
		// Same tags, byte-identical body → approved (matches).
		const { onWriteRegistry: w1 } = setup(approvedFm, { slides: tagged });
		await user.click(screen.getByRole('button', { name: /Bottom line/ }));
		expect(screen.getByRole('button', { name: 'Unapprove' })).toBeInTheDocument();
		await user.click(screen.getByRole('button', { name: 'Unapprove' }));
		expect(w1.mock.calls[0][1].lenses.find((l: { id: string }) => l.id === 'brief').approved).toBeUndefined();

		// Now render the SAME approval against EDITED content → drift → Re-approve.
		const drifted = [tagged[0], '<!-- _class: kpi -->\n<!-- _lens: brief -->\n# A different number'];
		render(<LensesPanel slides={drifted} registry={parseLensRegistry(approvedFm)} catalog={catalog} activeLens="full" onPreview={() => {}} onWriteRegistry={() => {}} onTag={() => {}} />);
		const rows = screen.getAllByRole('button', { name: /Bottom line/ });
		await user.click(rows[rows.length - 1]);
		expect(screen.getByRole('button', { name: 'Re-approve' })).toBeInTheDocument();
		expect(within(document.body).getByText(/changed since you approved/i)).toBeInTheDocument();
	});
});
