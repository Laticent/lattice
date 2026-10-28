// Phone (390) and tablet (820) with touch: the strip's slide actions and Undo on a heading-split deck.
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..', '..');
const { chromium } = await import(path.join(ROOT, 'docs', 'node_modules', 'playwright', 'index.mjs'));
const BASE = process.env.BASE ?? 'http://localhost:4321/studio/';
const OUT = `${process.env.TMPDIR ?? "/tmp"}/touch-ops-`;
const DECK = '---\nsplit: headings\n---\n\n# Alpha\n\na\n\n## Bravo\n\nb\n\n## Charlie\n\nc\n';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const [name, width, height] of [['phone', 390, 844], ['tablet', 820, 1180]]) {
	const ctx = await b.newContext({ viewport: { width, height }, hasTouch: true, isMobile: name === 'phone' });
	await ctx.addInitScript(() => localStorage.setItem('lattice-studio-settings', JSON.stringify({ posture: 'craft' })));
	const p = await ctx.newPage();
	const log = (m) => console.log(`[${name}] ${m}`);
	await p.goto(BASE, { waitUntil: 'networkidle' });
	const src = () => p.locator('.cm-content').first().evaluate((el) => el.cmTile.root.view.state.doc.toString());
	const order0 = async () => [...(await src()).matchAll(/^#+ (\w+)/gm)].map((m) => m[1]).join(' ');
	const order = async () => `${await order0()} · at ${(await p.locator('body').innerText()).match(/\b(\d+ \/ \d+)\b/)?.[1]} · current pill ${await p.locator('nav[aria-label="Slide navigator"] button[aria-current="true"]').first().getAttribute('aria-label').catch(() => '?')}`;
	// Put the deck in through the editor's view (the phone shows one pane at a time).
	const md = p.getByRole('button', { name: 'Markdown source', exact: true }).first();
	if (await md.isVisible().catch(() => false)) await md.tap();
	await p.locator('.cm-content').first().waitFor({ state: 'attached' });
	await p.locator('.cm-content').first().evaluate((el, d) => { const v = el.cmTile.root.view; v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: d }, userEvent: 'input.paste' }); }, DECK);
	const pv = p.getByRole('button', { name: 'Preview', exact: true }).first();
	if (await pv.isVisible().catch(() => false)) await pv.tap();
	await p.waitForTimeout(1500);
	const pills = p.locator('nav[aria-label="Slide navigator"] button');
	log(`pills: ${await pills.count()} · deck: ${await order()}`);
	await pills.nth(1).tap();
	await p.waitForTimeout(400);
	const ops = ['Duplicate slide', 'Delete slide', 'Move slide earlier', 'Move slide later'];
	for (const o of ops) log(`${o}: visible ${await p.getByRole('button', { name: o }).first().isVisible().catch(() => false)}`);
	await p.screenshot({ path: `${OUT}${name}-1-strip.png` });
	await p.getByRole('button', { name: 'Move slide later' }).first().tap();
	await p.waitForTimeout(600);
	log(`after Move later on Bravo: ${await order()}`);
	await p.getByRole('button', { name: 'Duplicate slide' }).first().tap();
	await p.waitForTimeout(600);
	log(`after Duplicate: ${await order()} · pills ${await pills.count()}`);
	await p.getByRole('button', { name: 'Delete slide' }).first().tap();
	await p.waitForTimeout(600);
	log(`after Delete (one tap): ${await order()} · pills ${await pills.count()}`);
	await p.screenshot({ path: `${OUT}${name}-2-deleted.png` });
	const undo = p.getByRole('button', { name: 'Undo', exact: true }).first();
	log(`Undo notice visible: ${await undo.isVisible().catch(() => false)}`);
	await undo.tap();
	await p.waitForTimeout(600);
	log(`after Undo: ${await order()} · pills ${await pills.count()}`);
	await p.screenshot({ path: `${OUT}${name}-3-undone.png` });
	await ctx.close();
}
await b.close();
