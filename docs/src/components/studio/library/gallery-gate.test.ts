// The gallery check renders a sample slide to READ its markup. It must not warm the draw host:
// warming reopens a draw frame the preview closed after its modules failed
// (draw-frame-preview.spec.ts), the bug web-images.ts fixed with `warmDraw: false`.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { renderMarkdown } = vi.hoisted(() => ({ renderMarkdown: vi.fn(async (..._args: unknown[]) => ({ html: '<section></section>', css: '' })) }));
vi.mock('@/lib/render-engine', () => ({ renderMarkdown }));

import { galleryRemoteRefs } from './gallery-gate';

describe('galleryRemoteRefs', () => {
	beforeEach(() => {
		renderMarkdown.mockClear();
		(window as unknown as { LatticePlayground: unknown }).LatticePlayground = { referenceTargets: () => [] };
	});

	it('renders the gallery alone and as inserted, never warming the draw host', async () => {
		await galleryRemoteRefs('# a\n\n```mermaid\nflowchart LR\n  A --> B\n```\n');
		expect(renderMarkdown).toHaveBeenCalledTimes(2);
		for (const call of renderMarkdown.mock.calls) expect(call[3]).toMatchObject({ warmDraw: false });
	});
});
