import fs from 'node:fs';
import { expect, gotoStudio, setEditorContent, shareExport, test } from './studio-fixture';

// THE STUDIO'S EXPORT TO MARP IS A READY VS CODE PROJECT, on the real Studio (HARD RULE #23).
//
// The bundle's README walks a newcomer through VS Code and marp-cli, and two of its steps
// lean on files only this export writes: `.vscode/extensions.json`, which makes VS Code
// offer Marp for VS Code when the folder opens, and `.vscode/tasks.json`, which puts the
// exports under Terminal → Run Task…. The CLI producer (tools/export-marp.js) is pinned by
// the unit tier; this is the in-browser producer (deck-export.js exportMarp), which writes
// the same files through its own zip and could drop one without the unit tier noticing.

const DECK = `---
theme: indaco
---

# Quarterly review

---

## Next steps
`;

test('a Studio Marp export opens as a VS Code project, with tasks and a step-by-step README', async ({ page }) => {
	test.slow();
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	const [file] = await Promise.all([page.waitForEvent('download'), shareExport(page, 'marp')]);
	const path = await file.path();
	const out = process.env.LATTICE_EVIDENCE_DIR;
	if (out) fs.copyFileSync(path, `${out}/${file.suggestedFilename()}`);

	const { default: JSZip } = await import('jszip');
	const zip = await JSZip.loadAsync(fs.readFileSync(path));
	const names = Object.keys(zip.files);
	const read = async (suffix: string) => {
		const entry = names.find((n) => n.endsWith(suffix));
		expect(entry, `the bundle carries ${suffix} (had: ${names.filter((n) => !n.includes('fonts/')).join(', ')})`).toBeTruthy();
		return (await zip.file(entry ?? '')?.async('string')) ?? '';
	};

	expect(JSON.parse(await read('/.vscode/extensions.json'))).toEqual({ recommendations: ['marp-team.marp-vscode'] });
	expect(JSON.parse(await read('/.vscode/settings.json'))['markdown.marp.html']).toBe('all');

	const { scripts } = JSON.parse(await read('/package.json'));
	expect(Object.keys(scripts).sort()).toEqual(['html', 'pdf', 'pptx']);
	const { tasks } = JSON.parse(await read('/.vscode/tasks.json'));
	for (const task of tasks) {
		expect(task.type, `${task.label} uses VS Code's npm task type`).toBe('npm');
		if (task.script !== 'install') expect(scripts[task.script], `${task.label} runs a script package.json defines`).toBeTruthy();
	}

	const deck = names.find((n) => /^[^/]+\/[^/]+\.md$/.test(n) && !/README|AGENTS/.test(n)) ?? '';
	const deckFile = deck.split('/').pop() ?? '';
	const readme = await read('/README.md');
	expect(readme, 'the README walks VS Code step by step').toContain('## Quick start: VS Code');
	expect(readme).toContain('## Quick start: command line');
	expect(readme, 'and names the deck this bundle actually carries').toContain(`Click \`${deckFile}\` in the Explorer`);
	expect(readme).toContain('**The name decides the format**');
});
