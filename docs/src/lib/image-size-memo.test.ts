// image-size-memo's prefetch: the slides around the shown one get their photos ready ahead. A photo the
// preview will show as a copy (./preview-image-scale.ts) is handed to `warm` instead of loaded into the
// frame, prose photos (`![alt](url)`) included, and only for an origin the reader allowed.
import { describe, expect, it, vi } from 'vitest';
import { prefetch } from './image-size-memo';

const frame = () => ({ contentWindow: { Image: class {} } }) as unknown as HTMLIFrameElement;
const origin = (u: string) => {
	try {
		return new URL(u).origin;
	} catch {
		return null;
	}
};

describe('prefetch', () => {
	it('warms a copy for every allowed photo, placed or prose, and none for a refused origin', () => {
		const warm = vi.fn((_url: string, _prose?: boolean) => true);
		const md = [
			'<!-- _class: image -->\n\n## T\n\n![The lake](https://images.example/a.jpg)',
			'![A harbor](https://images.example/b.jpg)',
			'![Team](<https://images.example/c.jpg>)',
			// A Marp `![bg]` is an ordinary picture since the engine break (2026-11-13): a prose copy, not a panel's.
			'![bg](https://images.example/f.jpg)',
			'<!-- _class: image -->\n\n## T\n\n![Refused](https://evil.example/d.jpg)',
			'![Beacon](https://evil.example/e.jpg)',
		].join('\n\n---\n\n');
		prefetch(frame(), md, ['https://images.example'], origin, warm);
		// The placed photo's copy first, then the prose photos' wrapped ones (`true`), which an <img> looks for.
		expect(warm.mock.calls).toEqual([
			['https://images.example/a.jpg'],
			['https://images.example/b.jpg', true],
			['https://images.example/c.jpg', true],
			['https://images.example/f.jpg', true],
		]);
	});

	it('a class carried from an earlier slide places the photo there too', () => {
		const warm = vi.fn((_url: string, _prose?: boolean) => true);
		prefetch(frame(), '<!-- class: image -->\n\n## One\n\n---\n\n## Two\n\n![The lake](https://images.example/g.jpg)', ['https://images.example'], origin, warm);
		expect(warm.mock.calls).toEqual([['https://images.example/g.jpg']]);
	});

	it('loads no prose photo into the frame where there are no copies (no warm)', () => {
		const loaded: string[] = [];
		const W = {
			Image: class {
				set src(u: string) {
					loaded.push(u);
				}
			},
		};
		prefetch({ contentWindow: W } as unknown as HTMLIFrameElement, '![A harbor](https://images.example/b2.jpg)', ['https://images.example'], origin);
		expect(loaded).toEqual([]);
	});
});
