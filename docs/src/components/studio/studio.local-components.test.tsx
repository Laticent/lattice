import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import StudioShell from './StudioShell';

// Slice: insert + render a SAVED LOCAL component. A component authored in the
// Fabricate Layout Studio (component-library, IndexedDB) must (1) appear in the
// add-slide gallery under a "Your components" band, (2) insert its skeleton as a
// new slide, and (3) render styled — its `.<name>` CSS injected as `extraCss`
// everywhere the deck renders (compose preview, Share exports, Present).

// Expose the props we care about as data attributes so the test can assert the
// CSS actually threads through (the real engine never boots in jsdom).
vi.mock('@/components/DeckPreview', () => ({
	default: ({ 'aria-label': label, sample, extraCss }: { 'aria-label'?: string; sample?: string; extraCss?: string }) => (
		<div data-testid="deck-preview" data-extra-css={extraCss ?? ''} data-sample={sample ?? ''}>
			{label}
		</div>
	),
}));

// A single saved local component the store hands back.
const LOCAL = {
	id: 'component:mybox',
	name: 'mybox',
	bucket: 'local' as string | null,
	css: 'section.mybox{background:var(--accent-soft)}',
	skeleton: '<!-- _class: mybox -->\n\n## Boxed\n\nA local component.',
};
vi.mock('./component-library', () => ({
	listStudioComponents: vi.fn(async () => [LOCAL]),
	saveStudioComponent: vi.fn(async () => LOCAL),
	deleteStudioComponent: vi.fn(async () => {}),
}));

// Keep the heavy export pipeline out — assert the WIRING (extraCss reaches the
// exporter), not a real render.
const shareSpies = vi.hoisted(() => ({
	shareMarkdown: vi.fn(async () => {}),
	shareMarp: vi.fn(async () => {}),
	sharePdf: vi.fn(async () => {}),
	sharePptx: vi.fn(async () => {}),
	sharePrintSource: vi.fn(() => {}),
}));
vi.mock('./share-export', () => shareSpies);

const options = { themeBase: '', runtimeUrl: '', engineUrl: '' };

afterEach(() => {
	document.documentElement.removeAttribute('data-palette');
	vi.clearAllMocks();
});

function setup() {
	const user = userEvent.setup();
	render(<StudioShell options={options} />);
	return user;
}

describe('Studio — insert + render a saved local component', () => {
	it('lists the saved local component in the add-slide gallery under Your components', async () => {
		const user = setup();
		// The Insert affordance only appears once there is something to insert; a
		// saved local component is enough (no built-in catalog in this test).
		await user.click(await screen.findByRole('button', { name: /Insert/ }));
		const dialog = await screen.findByRole('dialog');
		const d = within(dialog);
		// Local components sit under a dedicated "Your components" band, previewed as a tile.
		expect(await d.findByText('Your components')).toBeInTheDocument();
		expect(d.getByText('mybox')).toBeInTheDocument();
	});

	it('inserts the component skeleton and renders it styled (extraCss threads to the preview)', async () => {
		const user = setup();
		// Before inserting, nothing uses `.mybox`, so no local CSS is injected.
		const previewBefore = await screen.findByTestId('deck-preview');
		expect(previewBefore.getAttribute('data-extra-css')).toBe('');

		await user.click(await screen.findByRole('button', { name: /Insert/ }));
		await user.click(await screen.findByText('mybox'));

		// A success toast confirms the insert, and the preview now carries the
		// component's CSS (the deck uses `.mybox`, so usedLocalCss → extraCss).
		expect(await screen.findByText(/Inserted/)).toBeInTheDocument();
		const preview = await screen.findByTestId('deck-preview');
		expect(preview.getAttribute('data-extra-css')).toContain('section.mybox');
	});

	it('threads the local CSS into Share exports once the deck uses the component', async () => {
		const user = setup();
		await user.click(await screen.findByRole('button', { name: /Insert/ }));
		await user.click(await screen.findByText('mybox'));

		await user.click(screen.getByRole('button', { name: 'Share' }));
		const sheet = within(await screen.findByRole('dialog', { name: /Share/ }));
		// PDF opens the Options step; Download runs the exporter.
		await user.click(sheet.getByText('PDF'));
		await user.click(sheet.getByRole('button', { name: /download pdf/i }));
		// The extraCss arg (index 7) must carry the component's rules so the exported
		// artifact is styled too (annotations is the trailing arg, undefined here).
		const call = shareSpies.sharePdf.mock.calls.at(-1) as unknown[];
		expect(call?.[7]).toContain('section.mybox');
	});
});
