// Probe for decks/mermaid-click.md (#2734): with a real pointer, does the flowchart node show its
// tooltip, and does each gantt task's bar and label open its own link? `window.open` is
// recorded, never followed. Passes when every key below opens exactly its own URL once and the
// tooltip reads TIP.
const TIP = 'Opens the API reference';
const OWN = { ta: 'https://one.example/', 'ta-text': 'https://one.example/', tb: 'https://two.example/', 'tb-text': 'https://two.example/' };

export const diagrams = 3;

export async function probe({ page, frame, sleep }) {
	await page.mouse.move(5, 5);
	await frame.evaluate(() => {
		for (const t of document.querySelectorAll('.mermaidTooltip')) t.textContent = '';
	});
	let tooltip = null;
	const node = await frame.$('[data-lattice-figure] > svg g.node[title]');
	if (node) {
		await node.scrollIntoView();
		await sleep(300);
		await node.hover();
		await sleep(500);
		tooltip = await frame.evaluate(() => document.querySelector('.mermaidTooltip')?.textContent || '');
	}
	await frame.evaluate(() => {
		window.open = (u) => {
			(window.__opens ||= []).push(u);
			return null;
		};
	});
	const links = {};
	for (const key of Object.keys(OWN)) {
		const el = await frame.$(`[data-lattice-figure] > svg [id$="-${key}"]`);
		if (!el) {
			links[key] = 'missing';
			continue;
		}
		await frame.evaluate(() => {
			window.__opens = [];
		});
		await el.scrollIntoView();
		await sleep(200);
		await el.click();
		await sleep(250);
		links[key] = await frame.evaluate(() => window.__opens.slice());
	}
	const pass = tooltip === TIP && Object.entries(OWN).every(([k, url]) => Array.isArray(links[k]) && links[k].length === 1 && links[k][0] === url);
	return { pass, tooltip, links };
}
