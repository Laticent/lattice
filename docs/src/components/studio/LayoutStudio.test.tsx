import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LayoutStudio, STARTER_CSS, STARTER_NAME, STARTER_SKELETON } from './LayoutStudio';

// LayoutStudio is now the CONTROLLED component-tab body — naming, the gate run,
// Save and Export live in Fabricate's shared header (see studio.controls). Here
// we test the body in isolation: it renders the findings it's handed, gates the
// preview on a valid name, and reports CSS/skeleton edits up. The real gate is
// covered at the Fabricate level (studio.controls) and in the lib/layout units.

// Surface the threaded extraCss/sample so we can assert the local component is
// what's previewed (the engine itself is never involved).
vi.mock('@/components/DeckPreview', () => ({
	default: ({ 'aria-label': label, extraCss, sample }: { 'aria-label'?: string; extraCss?: string; sample?: string }) => <div data-testid="dp" data-label={label} data-extracss={extraCss || ''} data-sample={sample || ''} />,
}));

const options = { themeBase: '', runtimeUrl: '', engineUrl: '' };
const noop = () => {};

describe('LayoutStudio — controlled component body', () => {
	it('renders a clean gate and previews the component (css + skeleton threaded)', () => {
		render(<LayoutStudio options={options} name={STARTER_NAME} css={STARTER_CSS} skeleton={STARTER_SKELETON} onCss={noop} onSkeleton={noop} findings={[]} nameOk />);
		expect(screen.getByText(/Gate — all clear/)).toBeInTheDocument();
		const dp = screen.getByTestId('dp');
		expect(dp.getAttribute('data-extracss')).toMatch(/section\.callout/);
		expect(dp.getAttribute('data-sample')).toMatch(/_class: callout/);
	});

	it('renders the error findings it is handed, with a “to fix” header', () => {
		render(<LayoutStudio options={options} name="callout" css={STARTER_CSS} skeleton={STARTER_SKELETON} onCss={noop} onSkeleton={noop} findings={[{ level: 'error', rule: 'no-hex', line: 3, message: 'use a palette token, not a hex' }]} nameOk />);
		expect(screen.getByText(/Gate — 1 to fix/)).toBeInTheDocument();
		expect(screen.getByText(/use a palette token/)).toBeInTheDocument();
	});

	it('withholds extraCss from the preview when the CSS has a blocked remote reference (#22)', () => {
		// A css-* exfil finding (e.g. a remote @import) must NEVER reach the same-origin
		// srcdoc preview — it concatenates extraCss raw. The skeleton still previews; the CSS
		// is paused with a note until the author fixes it. This is the F1 security seam.
		const evil = 'section.callout { background: url(https://evil.example/x.png); }';
		render(<LayoutStudio options={options} name="callout" css={evil} skeleton={STARTER_SKELETON} onCss={noop} onSkeleton={noop} findings={[{ level: 'error', rule: 'css-url-remote', line: 1, message: 'remote url() blocked' }]} nameOk />);
		const dp = screen.getByTestId('dp');
		expect(dp.getAttribute('data-extracss')).toBe(''); // the exfil CSS was withheld
		expect(dp.getAttribute('data-sample')).toMatch(/_class: callout/); // the skeleton still previews
		expect(screen.getByText(/Preview paused/i)).toBeInTheDocument();
	});

	it('still previews CSS when the only finding is a non-exfil gate error', () => {
		// A plain no-hex/margin finding is NOT an exfil channel — the preview keeps the CSS so
		// the author sees their live edit; only css-* findings pause it.
		render(<LayoutStudio options={options} name="callout" css={STARTER_CSS} skeleton={STARTER_SKELETON} onCss={noop} onSkeleton={noop} findings={[{ level: 'error', rule: 'no-hex', line: 3, message: 'use a palette token' }]} nameOk />);
		expect(screen.getByTestId('dp').getAttribute('data-extracss')).toMatch(/section\.callout/);
		expect(screen.queryByText(/Preview paused/i)).toBeNull();
	});

	it('hides the preview when the name is invalid', () => {
		render(<LayoutStudio options={options} name="" css={STARTER_CSS} skeleton={STARTER_SKELETON} onCss={noop} onSkeleton={noop} findings={[{ level: 'error', rule: 'name', message: 'lowercase slug required' }]} nameOk={false} />);
		expect(screen.queryByTestId('dp')).toBeNull();
		expect(screen.getByText(/Name your component to preview/i)).toBeInTheDocument();
	});

	it('reports CSS and skeleton edits to the parent', () => {
		const onCss = vi.fn();
		const onSkeleton = vi.fn();
		render(<LayoutStudio options={options} name="callout" css={STARTER_CSS} skeleton={STARTER_SKELETON} onCss={onCss} onSkeleton={onSkeleton} findings={[]} nameOk />);
		fireEvent.change(screen.getByLabelText('Component CSS'), { target: { value: 'section.callout{color:var(--accent)}' } });
		expect(onCss).toHaveBeenCalledWith('section.callout{color:var(--accent)}');
		fireEvent.change(screen.getByLabelText('Component skeleton'), { target: { value: '<!-- _class: callout -->' } });
		expect(onSkeleton).toHaveBeenCalledWith('<!-- _class: callout -->');
	});
});
