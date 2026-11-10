// @vitest-environment jsdom
// The Live privacy note links to the docs page that says who sees a Live user's IP address
// (followups 2547-p2): the lobby renders the link, the start card names the same constant, and the
// constant's anchor is the page's real heading.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render } from '@testing-library/react';
import GithubSlugger from 'github-slugger';
import { afterEach, describe, expect, it } from 'vitest';
import { LiveLobby } from './LiveLobby';
import { LIVE_PRIVACY_HREF } from './privacy-link';

const here = join(process.cwd(), 'src', 'components', 'studio', 'live');
const page = readFileSync(join(process.cwd(), 'src', 'content', 'docs', 'privacy.md'), 'utf8');
const noop = () => {};

afterEach(cleanup);

describe('the Live privacy link', () => {
	it('points at the privacy page and at a heading that page really has', () => {
		const [path, anchor] = LIVE_PRIVACY_HREF.split('#');
		expect(path.endsWith('/privacy/')).toBe(true);
		const slugger = new GithubSlugger();
		const anchors = [...page.matchAll(/^#{2,3} (.+)$/gm)].map((m) => slugger.slug(m[1]));
		expect(anchors).toContain(anchor);
	});

	it('the lobby renders it, beside the note, opening in a new tab', () => {
		const { container } = render(
			<LiveLobby view={{ stage: 'ready', title: 'Deck', hostName: 'Ada', slides: 3, theme: null, name: '' }} actions={{ setName: noop, knock: noop, cancel: noop } as never} />,
		);
		const link = container.querySelector('[data-live-privacy-note] a[data-live-privacy-link]');
		expect(link?.getAttribute('href')).toBe(LIVE_PRIVACY_HREF);
		expect(link?.getAttribute('target')).toBe('_blank');
		expect(link?.getAttribute('rel')).toContain('noopener');
	});

	it('the start card links it inside its note too', () => {
		const panel = readFileSync(join(here, 'LivePanel.tsx'), 'utf8');
		const note = panel.slice(panel.indexOf('data-live-privacy-note>'), panel.indexOf('</p>', panel.indexOf('data-live-privacy-note>')));
		expect(note).toContain('href={LIVE_PRIVACY_HREF}');
	});
});
