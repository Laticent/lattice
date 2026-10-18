import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { expect, gotoStudio, SHARE_EXPORTS, setEditorContent, test } from './studio-fixture';

// ONE DECK, ONE FILE, FROM EITHER HOST (engineering/decisions/2026-10-16-player-as-library-audit.md
// §11.9). The Studio's Share → Webpage export and the CLI's `--player` must write the same bytes for
// the same deck, apart from the three things the owner ruled out on 2026-10-17: the record's time
// stamp (`generatedAt`), the record's `host` field (`cli` or `studio`), and the policy's script hashes.
// Formatting counts.
//
// BOTH HOSTS ON ONE BROWSER BUILD. The CLI renders with the Chromium this suite runs, not its own
// default: two Chromium versions spell some computed colors differently (`oklch(… 259.53)` against
// `oklch(… none)` for one `color-mix()`), and the bake reads computed styles. The parity claim is
// per browser build, and this pins it to one.
//
// RUNS IN ITS OWN NIGHTLY JOB (`player-parity` in .github/workflows/studio-e2e-nightly.yml); the
// `@player-parity` tag keeps the big `e2e` job from running it a second time.
//
// Three decks, each standing for a class of gap the audit closed: a plain deck (the sheet, the fonts,
// the record), Mermaid diagrams with `light-dark()` tokens and a drop shadow (the baked figure, the
// token reader, the export render's config and box), and a portrait split (the structural cut).

const REPO = path.resolve(process.cwd(), '..');
const DECKS = ['html-player', 'carbone-curation', 'inventory-split-portrait'];

// The only normalization: the three exclusions, nothing else.
function comparable(html: string): string {
	return html
		.replace(/(<script type="application\/lattice\+json"[^>]*>)([^<]*)(<\/script>)/, (_m, open: string, b64: string, close: string) => {
			const record = JSON.parse(Buffer.from(b64, 'base64').toString());
			delete record.generatedAt;
			delete record.host;
			return open + Buffer.from(JSON.stringify(record)).toString('base64') + close;
		})
		.replace(/'sha256-[A-Za-z0-9+/=]+'/g, "'sha256-*'");
}

// Where the two first part, for the failure message: a byte offset alone is unreadable.
function firstDifference(a: string, b: string): string {
	let i = 0;
	while (i < a.length && a[i] === b[i]) i++;
	return `first difference at byte ${i} of ${a.length}/${b.length}\n  cli:    …${JSON.stringify(a.slice(Math.max(0, i - 80), i + 160))}\n  studio: …${JSON.stringify(b.slice(Math.max(0, i - 80), i + 160))}`;
}

for (const deck of DECKS) {
	test(`${deck}: the Studio's Webpage export is the CLI's --player, byte for byte @player-parity`, async ({ page }, testInfo) => {
		test.setTimeout(480_000);
		const source = await readFile(path.join(REPO, 'examples', `${deck}.md`), 'utf8');

		// The CLI, in its own folder so the deck's relative assets resolve as they do for an author.
		const dir = path.join(testInfo.outputDir, 'cli');
		await mkdir(dir, { recursive: true });
		await copyFile(path.join(REPO, 'examples', `${deck}.md`), path.join(dir, `${deck}.md`));
		const browser = chromium.executablePath();
		const cli = spawnSync(process.execPath, [path.join(REPO, 'lattice.js'), `${deck}.md`, `${deck}.pdf`, '--player', '-q'], {
			cwd: dir,
			env: { ...process.env, CHROME_PATH: browser, PUPPETEER_EXECUTABLE_PATH: browser, SOURCE_DATE_EPOCH: '0' },
			encoding: 'utf8',
			timeout: 400_000,
		});
		expect(cli.status, `the CLI failed:\n${cli.stderr}`).toBe(0);
		const fromCli = await readFile(path.join(dir, `${deck}.html`), 'utf8');

		// The Studio, through the real Share flow.
		await gotoStudio(page);
		await setEditorContent(page, source);
		await page.getByRole('button', { name: 'Share', exact: true }).click();
		const dialog = page.getByRole('dialog');
		await dialog.getByRole('button', { name: SHARE_EXPORTS.webpage.row }).click();
		const download = page.waitForEvent('download', { timeout: 400_000 });
		await dialog.getByRole('button', { name: SHARE_EXPORTS.webpage.confirm }).click();
		const file = path.join(testInfo.outputDir, `${deck}.studio.html`);
		await (await download).saveAs(file);
		const fromStudio = await readFile(file, 'utf8');

		const a = comparable(fromCli);
		const b = comparable(fromStudio);
		// What this browser does with text, so a runner-only difference arrives with its own cause.
		const text = await page.evaluate(() => {
			const ctx = document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D;
			ctx.font = '14px sans-serif';
			return `${navigator.userAgent}; 'The quick brown fox' = ${ctx.measureText('The quick brown fox').width}px at 14px sans-serif`;
		});
		expect(a === b, `${firstDifference(a, b)}\n  studio browser: ${text}`).toBe(true);
	});
}
