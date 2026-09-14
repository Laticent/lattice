import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Announce } from './announce';

// What this guards is not the markup, it is the NODE'S PERSISTENCE. A live region
// that is freshly inserted is mostly not announced, so the obvious
// `{msg && <span aria-live>…</span>}` is silent exactly when it matters.

function region(): HTMLElement | null {
	return document.querySelector('[role="status"], [role="alert"]');
}

describe('Announce', () => {
	it('stays mounted with nothing to say, so the next message is a CHANGE', () => {
		const { rerender } = render(<Announce message={null} />);
		expect(region()).not.toBeNull();
		expect(region()?.textContent).toBe('');

		rerender(<Announce message="Saved." />);
		// Same node, new text — that is what gets announced. A node that appeared
		// along with its text would not.
		expect(region()?.textContent).toBe('Saved.');
	});

	it('is polite by default and assertive on request', () => {
		const { rerender } = render(<Announce message="Saved." />);
		expect(region()?.getAttribute('aria-live')).toBe('polite');
		expect(region()?.getAttribute('role')).toBe('status');

		rerender(<Announce message="Refused." assertive />);
		expect(region()?.getAttribute('aria-live')).toBe('assertive');
		expect(region()?.getAttribute('role')).toBe('alert');
	});

	it('reads the whole message, not a diff', () => {
		render(<Announce message="Two of three imported." />);
		expect(region()?.getAttribute('aria-atomic')).toBe('true');
	});

	it('renders nothing a sighted reader can see', () => {
		render(<Announce message="Saved." />);
		expect(region()?.className).toContain('sr-only');
	});
});

// A CALLER-SIDE hazard, pinned here because the component cannot defend against it:
// mounting `<Announce>` inside the branch that the message arrives with re-creates
// the region, which is the silent-insert failure. The Fabricate theme gate was
// written that way first — its region lived inside the `findings.length` branch, and
// `blocked` can only become true as findings go 0 → N.
describe('the caller must keep the node across the change', () => {
	function Wrong({ on }: { on: boolean }) {
		if (!on) return <p>clean</p>;
		return (
			<div>
				<Announce message="Refused." />
			</div>
		);
	}
	function Right({ on }: { on: boolean }) {
		return (
			<>
				<Announce message={on ? 'Refused.' : null} />
				{on ? <div>bad</div> : <p>clean</p>}
			</>
		);
	}

	it('a region mounted inside the branch is a NEW node — it will not announce', () => {
		const { rerender } = render(<Wrong on={false} />);
		expect(region()).toBeNull(); // nothing to change FROM
		rerender(<Wrong on />);
		expect(region()).not.toBeNull();
	});

	it('a region mounted outside it survives the swap, so the text is a change', () => {
		const { rerender } = render(<Right on={false} />);
		const before = region();
		expect(before).not.toBeNull();
		rerender(<Right on />);
		expect(region()).toBe(before);
		expect(region()?.textContent).toBe('Refused.');
	});
});
