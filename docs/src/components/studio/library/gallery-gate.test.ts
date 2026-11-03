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
		(window as unknown as { LatticePlayground: unknown }).LatticePlayground = { referenceTargets: () => [], pluginService: (plugin: string, name: string) => (plugin === 'mermaid' && name === 'fences' ? () => [] : null) };
	});

	it('renders the gallery alone and as inserted, never warming the draw host', async () => {
		await galleryRemoteRefs('# a\n\n```mermaid\nflowchart LR\n  A --> B\n```\n');
		expect(renderMarkdown).toHaveBeenCalledTimes(2);
		for (const call of renderMarkdown.mock.calls) expect(call[3]).toMatchObject({ warmDraw: false });
	});
});

describe('galleryRemoteRefs reads the markup with remote-ref.js scanHtml', () => {
	beforeEach(() => {
		(window as unknown as { LatticePlayground: unknown }).LatticePlayground = { referenceTargets: () => [], pluginService: (plugin: string, name: string) => (plugin === 'mermaid' && name === 'fences' ? () => [] : null) };
	});

	it('lists a remote image in the rendered slide', async () => {
		renderMarkdown.mockImplementation(async () => ({ html: '<section><img src="https://evil.example/a.png"></section>', css: '' }));
		expect(await galleryRemoteRefs('# a\n')).toContain('https://evil.example/a.png');
	});

	it('refuses markup the tree builder could read differently (an SVG <style>)', async () => {
		renderMarkdown.mockImplementation(async () => ({ html: '<section><svg><style>p{background:url&lpar;https://evil.example/b.png&rpar;}</style></svg></section>', css: '' }));
		expect(await galleryRemoteRefs('# a\n')).toContain('policy:markup a browser may build differently from how the check reads it (foreign-content)');
	});

	it('reads a highlighted Mermaid fence as its text', async () => {
		renderMarkdown.mockImplementation(async () => ({ html: '<section><pre><code class="language-mermaid"><span class="hljs-keyword">img</span>: x</code></pre></section>', css: '' }));
		expect(await galleryRemoteRefs('# a\n')).toContain('policy:an image shape (`img:`)');
	});
});
