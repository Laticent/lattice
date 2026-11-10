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
		// A dialog is named, not described: VoiceOver on an iPhone read a dialog's description again after
		// every control inside it (#3108; ui/sheet.tsx, ui/dialog.tsx). An alertdialog keeps its: there the
		// text is the question, and only its buttons follow.
		if (n.role === 'dialog' && n.desc) bad.push(`${where}: dialog "${n.name}" is described ("${n.desc}"); VoiceOver repeats it after every control inside`);
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
		// The surfaces that open from the chrome: whichever of these this width shows. At least three must
		// open, or the loop proves nothing (every launcher renamed would pass on the at-rest check alone).
		let opened = 0;
		for (const name of ['Menu', 'Toggle Coach', 'Toggle Chat', 'Settings', 'Reshape slide', 'Version history', 'Send feedback', 'Share', 'Workspace settings']) {
			if (!(await open(page, name))) continue;
			opened += 1;
			bad.push(...(await audit(cdp, `with "${name}" open`)));
			await closeAll(page);
		}
		expect(opened, 'surfaces the audit opened').toBeGreaterThanOrEqual(3);
		expect(bad, bad.join('\n')).toEqual([]);
	});

	test('@crosswidth every command palette row says what it does, and the search field has a name', async ({ page }) => {
		await gotoStudio(page);
		// The phone opens the palette as a sheet from the Menu; wider screens type into the inline field.
		const menu = page.getByRole('button', { name: 'Menu', exact: true }).filter({ visible: true }).first();
		if (await menu.count()) {
			await menu.click();
			await page.getByRole('button', { name: 'Search / commands', exact: true }).click();
		} else {
			await page.getByRole('button', { name: 'Search or run a command', exact: true }).filter({ visible: true }).first().click();
		}
		await expect(page.getByRole('option').first()).toBeVisible();
		const cdp = await page.context().newCDPSession(page);
		const nodes = await axNodes(cdp);
		const options = nodes.filter((n) => n.role === 'option');
		expect(options.length, 'the palette lists its rows').toBeGreaterThan(5);
		// A row with no description gets VoiceOver's generic option hint in that pause (owner, iPhone, #3108).
		const bare = options.filter((n) => !n.desc).map((n) => n.name);
		expect(bare, `rows with no description: ${bare.join(', ')}`).toEqual([]);
		const bad = options.map((n) => (problem(n) ? `"${n.name}": "${n.desc}" ${problem(n)}` : null)).filter(Boolean);
		expect(bad, bad.join('\n')).toEqual([]);
		expect(nodes.some((n) => n.role === 'combobox' && n.name === 'Search or run a command'), 'the search field has a name').toBe(true);
		// Lesson rows appear only on a query (LearnGroup); check them too.
		await page.getByPlaceholder('Search or run a command…').filter({ visible: true }).first().fill('pdf');
		await expect(page.locator('[data-lesson]').filter({ visible: true }).first()).toBeVisible();
		const typed = (await axNodes(cdp)).filter((n) => n.role === 'option');
		const bareTyped = typed.filter((n) => !n.desc).map((n) => n.name);
		expect(bareTyped, `rows with no description after a query: ${bareTyped.join(', ')}`).toEqual([]);
	});

	test('@crosswidth every row of the site command menu says what it does', async ({ page }) => {
		await page.goto('/components/', { waitUntil: 'domcontentloaded' });
		const dialog = page.getByRole('dialog', { name: 'Command palette' });
		// Wait for the menu's island to mount, then press its header button: Astro removes `ssr` from an island when it
		// mounts (axe-site.spec.ts), and before that the button has no handler. The menu lives in NavActions,
		// a `client:idle` island, so the eager-islands signal does not cover it.
		await page.waitForFunction(() => {
			const island = document.querySelector('astro-island[component-url*="NavActions"]');
			return !!island && !island.hasAttribute('ssr');
		});
		await page.getByRole('button', { name: 'Search (⌘K)', exact: true }).filter({ visible: true }).first().click();
		await expect(dialog).toBeVisible();
		await expect(dialog.getByRole('option').first()).toBeVisible();
		const cdp = await page.context().newCDPSession(page);
		const nodes = await axNodes(cdp);
		const options = nodes.filter((n) => n.role === 'option');
		expect(options.length, 'the menu lists its rows').toBeGreaterThan(3);
		const bare = options.filter((n) => !n.desc).map((n) => n.name);
		expect(bare, `rows with no description: ${bare.join(', ')}`).toEqual([]);
		const bad = options.map((n) => (problem(n) ? `"${n.name}": "${n.desc}" ${problem(n)}` : null)).filter(Boolean);
		expect(bad, bad.join('\n')).toEqual([]);
		expect(nodes.some((n) => n.role === 'combobox' && n.name === 'Command palette'), 'the search field has a name').toBe(true);
		// Lesson rows and documentation hits (Pagefind) render only on a query; check them too.
		await dialog.getByRole('combobox').fill('chart');
		await expect(dialog.locator('[data-lesson]').first()).toBeVisible();
		const typed = (await axNodes(cdp)).filter((n) => n.role === 'option');
		const bareTyped = typed.filter((n) => !n.desc).map((n) => n.name);
		expect(bareTyped, `rows with no description after a query: ${bareTyped.join(', ')}`).toEqual([]);
		expect(typed.filter((n) => /&#?\w+;/.test(n.desc)).map((n) => n.desc), 'no raw HTML entity is read aloud').toEqual([]);
	});

	test('@crosswidth a destructive confirm is an alertdialog that reads its warning', async ({ page }) => {
		// The exemption from "named, not described": a confirmation's text IS the question, and only its
		// buttons follow (ui/dialog.tsx `alert`). Workspace › Data › Delete everything is the costliest one.
		await gotoStudio(page);
		await page.getByRole('button', { name: 'Workspace settings', exact: true }).filter({ visible: true }).first().click();
		await page.getByRole('tab', { name: 'Data', exact: true }).click();
		await page.getByRole('button', { name: /^Delete everything/ }).click();
		await expect(page.getByRole('alertdialog')).toBeVisible();
		const cdp = await page.context().newCDPSession(page);
		const confirm = (await axNodes(cdp)).find((n) => n.role === 'alertdialog');
		expect(confirm?.name).toBe('Delete everything?');
		expect(confirm?.desc).toMatch(/cannot be undone/);
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
