import type { CDPSession, Page } from '@playwright/test';
import { expect, gotoStudio, test } from './studio-fixture';

// EVERY DESCRIPTION SAYS SOMETHING, AND EVERY DIALOG HAS A NAME.
//
// A screen reader reads a control's NAME, then after a pause its DESCRIPTION. The owner listened with
// VoiceOver on an iPhone (PR #3108) and heard descriptions that changed with how a button was
// reached and said nothing new: a tooltip hint wired only while the tooltip was open (so a swipe got
// none and a keyboard Tab got one), a hint equal to the name ("Share… Share"), a bar icon whose own
// `aria-describedby={undefined}` silenced its hint, and a Coach row described by its raw rule id
// (`metric-no-referent`). This spec reads what Chromium's accessibility tree COMPUTES, the same
// name and description a screen reader is handed, rather than the attributes: a description can come
// from `aria-describedby`, a `title`, or a Radix wiring no grep sees.
//
// A missing description is fine (most controls need none). A bad one fails: it repeats the name, it
// is a bare kebab-case id, or it is empty text behind a dangling reference.

type Node = { role: string; name: string; desc: string };

const squash = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

function problem(n: Node): string | null {
	if (!n.desc) return null;
	const d = squash(n.desc);
	if (n.name && d === squash(n.name)) return 'repeats its name';
	// "Slide map — every slide…" on a button named "Slide map": the name again before what is new.
	if (n.name && new RegExp(`^${squash(n.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s*[—–:]|\\s+-)`).test(d)) return 'opens with its name';
	if (/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(d)) return 'is a raw id';
	return null;
}

async function axNodes(cdp: CDPSession): Promise<Node[]> {
	const { nodes } = (await cdp.send('Accessibility.getFullAXTree')) as {
		nodes: { ignored?: boolean; role?: { value?: string }; name?: { value?: string }; description?: { value?: string } }[];
	};
	return nodes
		.filter((n) => !n.ignored)
		.map((n) => ({ role: n.role?.value ?? '', name: (n.name?.value ?? '').trim(), desc: (n.description?.value ?? '').trim() }));
}

async function audit(cdp: CDPSession, where: string): Promise<string[]> {
	const bad: string[] = [];
	for (const n of await axNodes(cdp)) {
		const p = problem(n);
		if (p) bad.push(`${where}: ${n.role} "${n.name}" — description "${n.desc}" ${p}`);
		if ((n.role === 'dialog' || n.role === 'alertdialog') && !n.name) bad.push(`${where}: a ${n.role} has no name`);
	}
	return bad;
}

async function open(page: Page, name: string): Promise<boolean> {
	const button = page.getByRole('button', { name, exact: true }).filter({ visible: true }).first();
	if (!(await button.count()) || (await button.isDisabled())) return false;
	await button.click();
	return page
		.getByRole('dialog')
		.first()
		.waitFor({ timeout: 5000 })
		.then(() => true)
		.catch(() => false);
}

async function closeAll(page: Page) {
	for (let i = 0; i < 3 && (await page.getByRole('dialog').count()); i++) await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog')).toHaveCount(0);
}

test.describe('descriptions a screen reader hears', () => {
	test.skip(({ browserName }) => browserName !== 'chromium', 'reads the accessibility tree over CDP, a Chromium API');

	test('@crosswidth no description repeats its name or is a raw id, and every dialog has a name', async ({ page }) => {
		await gotoStudio(page);
		const cdp = await page.context().newCDPSession(page);
		const bad = await audit(cdp, 'at rest');
		// The surfaces that open from the chrome: whichever of these this width shows.
		for (const name of ['Menu', 'Toggle Coach', 'Toggle Chat', 'Settings', 'Reshape slide', 'Version history', 'Send feedback', 'Share', 'Workspace settings']) {
			if (!(await open(page, name))) continue;
			bad.push(...(await audit(cdp, `with "${name}" open`)));
			await closeAll(page);
		}
		expect(bad, bad.join('\n')).toEqual([]);
	});

	test('@crosswidth a bar icon is described by its hint with no tooltip open', async ({ page }) => {
		await gotoStudio(page);
		// The icon bar's Coach button: its hint used to reach a screen reader only while its tooltip was
		// open, and never at all on a bar icon. Untouched, no tooltip open, it must already be described.
		const coach = page.getByRole('button', { name: 'Toggle Coach', exact: true }).filter({ visible: true }).first();
		await expect(coach).toBeVisible();
		await expect(page.getByRole('tooltip')).toHaveCount(0);
		// Chromium's own computed tree, not Playwright's accessible-description code: the description is
		// a reference to a hidden element's `aria-label`, and only the engine says whether it resolves.
		const cdp = await page.context().newCDPSession(page);
		await expect
			.poll(async () => (await axNodes(cdp)).find((n) => n.role === 'button' && n.name === 'Toggle Coach' && n.desc)?.desc ?? '')
			.toMatch(/deck/i);
	});
});
