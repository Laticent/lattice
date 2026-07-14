import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { approvalHash, catalogFromComponents, parseLensRegistry } from '@/lib/lente';
import { LensesPanel } from './LensesPanel';

// The human-in-the-loop control center. These assert the loop the whole feature exists to enforce: a
// machine SUGGESTS, the author sees each proposal + reason, edits by hand, PREVIEWS, and only then can
// APPROVE — and only an approved view is readable. Writes are asserted at the callback boundary (the
// shell funnels them to the library + undo); the panel is pure presentation over @slidewright/lente.

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
	'<!-- _class: closing -->\n# The ask',
];

function setup(fm: string, over: Partial<React.ComponentProps<typeof LensesPanel>> = {}) {
	const onWriteRegistry = vi.fn();
	const onTag = vi.fn();
	const onPreview = vi.fn();
	const onRemoveLens = vi.fn();
	render(<LensesPanel slides={slides} registry={parseLensRegistry(fm)} catalog={catalog} activeLens="full" onPreview={onPreview} onWriteRegistry={onWriteRegistry} onTag={onTag} onRemoveLens={onRemoveLens} {...over} />);
	return { onWriteRegistry, onTag, onPreview, onRemoveLens };
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

	it('a single-slide archetype (the ask) is written with single: true', async () => {
		const user = userEvent.setup();
		const { onWriteRegistry } = setup('');
		await user.click(screen.getByRole('button', { name: /Add a reader view/ }));
		await user.click(screen.getByRole('button', { name: /The ask/ }));
		const [, reg] = onWriteRegistry.mock.calls[0];
		expect(reg.lenses.find((l: { id: string }) => l.id === 'ask')).toMatchObject({ base: 'none', single: true });
	});

	it('does not re-offer a lens that already exists', async () => {
		const user = userEvent.setup();
		setup('lenses:\n  brief: { label: "Bottom line", base: none }');
		await user.click(screen.getByRole('button', { name: /Add a reader view/ }));
		expect(screen.queryByText(/Headline metrics/i)).not.toBeInTheDocument(); // brief blurb — absent
		expect(screen.getByText(/The throughline/i)).toBeInTheDocument(); // story blurb — present
	});
});

describe('LensesPanel — suggest + membership', () => {
	it('surfaces per-slide suggestions BY TITLE with a reason, and Accept-all writes the tags', async () => {
		const user = userEvent.setup();
		const { onTag } = setup('lenses:\n  brief: { label: "Bottom line", base: none }');
		await user.click(screen.getByRole('button', { name: /Bottom line/ })); // expand the row
		// brief suggests the bookends (title/closing) + the metric (kpi) — never the connect quote. Each
		// proposal is shown by the slide's TITLE (legible to a non-engineer), not its _class token: the
		// suggestion reads `Add "Cover"`, and the manual list row is titled "Cover" too (two matches).
		expect(screen.getByText(/suggestion/i)).toBeInTheDocument();
		expect(screen.getAllByText(/Cover/).length).toBeGreaterThanOrEqual(2);
		expect(screen.getByRole('button', { name: /Cover/ })).toBeInTheDocument(); // the manual slide row, by title
		await user.click(screen.getByRole('button', { name: 'Accept all' }));
		expect(onTag).toHaveBeenCalledTimes(1);
		const [, changes] = onTag.mock.calls[0];
		expect(changes.map((c: { index: number }) => c.index).sort()).toEqual([0, 1, 3]); // title, kpi, closing
		for (const c of changes) expect(c).toMatchObject({ lensId: 'brief', member: true, base: 'none' });
	});

	it('a base:all lens (evidence) proposes DROPS with base all + member false', async () => {
		const user = userEvent.setup();
		const { onTag } = setup('lenses:\n  evidence: { label: "The evidence", base: all }');
		await user.click(screen.getByRole('button', { name: /The evidence/ }));
		await user.click(screen.getByRole('button', { name: 'Accept all' }));
		const [, changes] = onTag.mock.calls[0];
		// evidence drops the connect quote (index 2) — as a base:all EXCLUDE.
		expect(changes).toContainEqual({ index: 2, lensId: 'evidence', member: false, base: 'all' });
	});

	it('a manual slide toggle writes a single tag change', async () => {
		const user = userEvent.setup();
		const { onTag } = setup('lenses:\n  brief: { label: "Bottom line", base: none }');
		await user.click(screen.getByRole('button', { name: /Bottom line/ }));
		await user.click(screen.getByRole('button', { name: /A voice/ })); // toggle slide 3 (the quote) in
		expect(onTag).toHaveBeenCalledTimes(1);
		expect(onTag.mock.calls[0][1]).toEqual([{ index: 2, lensId: 'brief', member: true, base: 'none' }]);
	});

	it('a single lens keeps EXTRA tagged slides removable (the strand bug is fixed)', async () => {
		const user = userEvent.setup();
		// ask is single; two slides carry the tag. The projection shows one, but BOTH checkboxes must be
		// checked-and-removable — else the author strands a tag they can't clear.
		const twoTagged = ['<!-- _class: title -->\n<!-- _lens: ask -->\n# Cover', '<!-- _class: closing -->\n<!-- _lens: ask -->\n# The ask'];
		const { onTag } = setup('lenses:\n  ask: { label: "The ask", base: none, single: true }', { slides: twoTagged });
		await user.click(screen.getByRole('button', { name: /The ask/ }));
		// The SECOND tagged slide is checked (aria-pressed) yet marked "not shown" (single cap), and
		// toggling it REMOVES the tag (member:false) — it isn't stranded.
		const second = screen.getByRole('button', { name: /The ask.*not shown/i, pressed: true });
		await user.click(second);
		expect(onTag.mock.calls[0][1]).toEqual([{ index: 1, lensId: 'ask', member: false, base: 'none' }]);
	});
});

describe('LensesPanel — approval gate (the human control)', () => {
	const tagged = ['<!-- _class: title -->\n# Cover', '<!-- _class: kpi -->\n<!-- _lens: brief -->\n# The number'];
	const fm = 'lenses:\n  brief: { label: "Bottom line", base: none }';

	it('Approve is GATED on preview — locked until the author previews, then binds the content hash', async () => {
		const user = userEvent.setup();
		const onWriteRegistry = vi.fn();
		const onPreview = vi.fn();
		render(<LensesPanel slides={tagged} registry={parseLensRegistry(fm)} catalog={catalog} activeLens="full" onPreview={onPreview} onWriteRegistry={onWriteRegistry} onTag={() => {}} onRemoveLens={() => {}} />);
		await user.click(screen.getByRole('button', { name: /Bottom line/ }));
		expect(screen.getByText('Draft')).toBeInTheDocument(); // short status pill (full meaning in its tooltip)
		// Before previewing, Approve is withheld — a "Preview to approve" affordance stands in its place.
		expect(screen.queryByRole('button', { name: /Approve for readers/ })).not.toBeInTheDocument();
		expect(screen.getByText(/Preview to approve/i)).toBeInTheDocument();
		// Previewing unlocks Approve (and routes the preview via the callback).
		await user.click(screen.getByRole('button', { name: /^Preview$/ }));
		expect(onPreview).toHaveBeenCalledWith('brief');
		await user.click(screen.getByRole('button', { name: /Approve for readers/ }));
		const [, reg] = onWriteRegistry.mock.calls[0];
		expect(reg.lenses.find((l: { id: string }) => l.id === 'brief').approved).toBe(approvalHash(tagged, parseLensRegistry(fm), 'brief'));
	});

	it('an empty view cannot be approved — no Approve, no preview-gate, an explanation instead', async () => {
		const user = userEvent.setup();
		setup(fm); // slides have NO brief tags → brief is empty
		await user.click(screen.getByRole('button', { name: /Bottom line/ }));
		expect(screen.queryByRole('button', { name: /Approve for readers/ })).not.toBeInTheDocument();
		expect(screen.queryByText(/Preview to approve/i)).not.toBeInTheDocument();
		expect(screen.getByText(/No slides yet/i)).toBeInTheDocument();
	});

	it('an approved view offers Unapprove; a drifted one requires a fresh preview then Re-approve with the NEW hash', async () => {
		const user = userEvent.setup();
		const approvedFm = `lenses:\n  brief: { label: "Bottom line", base: none, approved: ${JSON.stringify(approvalHash(tagged, parseLensRegistry(fm), 'brief'))} }`;
		// Byte-identical content → approved (matches) → Unapprove offered.
		const { onWriteRegistry: w1 } = setup(approvedFm, { slides: tagged });
		await user.click(screen.getByRole('button', { name: /Bottom line/ }));
		await user.click(screen.getByRole('button', { name: 'Unapprove' }));
		expect(w1.mock.calls[0][1].lenses.find((l: { id: string }) => l.id === 'brief').approved).toBeUndefined();

		// Same approval against EDITED content → drift → preview-gated Re-approve writes the fresh hash.
		const drifted = [tagged[0], '<!-- _class: kpi -->\n<!-- _lens: brief -->\n# A different number'];
		const onWriteRegistry = vi.fn();
		render(<LensesPanel slides={drifted} registry={parseLensRegistry(approvedFm)} catalog={catalog} activeLens="full" onPreview={() => {}} onWriteRegistry={onWriteRegistry} onTag={() => {}} onRemoveLens={() => {}} />);
		const rows = screen.getAllByRole('button', { name: /Bottom line/ });
		await user.click(rows[rows.length - 1]);
		expect(within(document.body).getByText(/changed since you approved/i)).toBeInTheDocument();
		await user.click(screen.getAllByRole('button', { name: /^Preview$/ }).at(-1) as HTMLElement);
		await user.click(screen.getByRole('button', { name: 'Re-approve' }));
		const fresh = onWriteRegistry.mock.calls[0][1].lenses.find((l: { id: string }) => l.id === 'brief').approved;
		expect(fresh).toBe(approvalHash(drifted, parseLensRegistry(approvedFm), 'brief'));
		expect(fresh).not.toBe(approvalHash(tagged, parseLensRegistry(fm), 'brief')); // NOT the stale hash
	});

	it('a hidden (staged) view reads truthfully — never "Approved — readable"', async () => {
		const user = userEvent.setup();
		// Approved AND hidden: the reader gate withholds it, so the badge must NOT say readable.
		const hiddenFm = `lenses:\n  brief: { label: "Bottom line", base: none, hidden: true, approved: ${JSON.stringify(approvalHash(tagged, parseLensRegistry('lenses:\n  brief: { label: "Bottom line", base: none, hidden: true }'), 'brief'))} }`;
		setup(hiddenFm, { slides: tagged });
		const row = screen.getByRole('button', { name: /Bottom line/ });
		expect(row).toHaveTextContent(/Staged/i);
		expect(row).not.toHaveTextContent(/readable/i);
		await user.click(row);
		expect(screen.getByText(/staged \(hidden\)/i)).toBeInTheDocument();
	});
});

describe('LensesPanel — remove', () => {
	it('Remove routes through the tag-stripping handler (not a bare registry write)', async () => {
		const user = userEvent.setup();
		const { onRemoveLens, onWriteRegistry } = setup('lenses:\n  brief: { label: "Bottom line", base: none }');
		await user.click(screen.getByRole('button', { name: /Bottom line/ }));
		await user.click(screen.getByRole('button', { name: 'Remove' }));
		expect(onRemoveLens).toHaveBeenCalledTimes(1);
		expect(onRemoveLens.mock.calls[0][0]).toMatchObject({ id: 'brief' }); // gets the full lens (id + base)
		expect(onWriteRegistry).not.toHaveBeenCalled(); // removal is NOT a plain registry edit
	});
});
