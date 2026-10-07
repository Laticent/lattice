// @vitest-environment node
//
// THE RECIPE A VITE USER FOLLOWS, run through Vite itself (followups.d/2568-p3-theme-css-plain-import-in-vite.md).
//
//     import '@laticent/lattice/css';
//     import '@laticent/lattice/palette/<name>.css';
//
// The published theme file cannot be imported this way: its first rule is Marp's `@import 'lattice'`,
// which Vite's CSS pipeline reads as a file path. So the package publishes each palette's tokens with
// the imports resolved (tools/build-default-bundle.js writes dist/palettes/), and this test builds the
// recipe through the package's real `exports` map, from a node_modules link to the repo root.
//
// It lives in the docs suite because this is the one suite with Vite installed, and the CI job that
// runs it (docs-build) builds the root `dist/` first. The plain theme import is asserted to FAIL as
// well: the day Vite or the package makes it work, the README's warning and this recipe need a look.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const REPO = path.resolve(__dirname, '../../..');
let dir = '';

beforeAll(() => {
	if (!fs.existsSync(path.join(REPO, 'dist/palettes/cuoio.css'))) throw new Error('dist/palettes/ is missing: run `npm run build` at the repo root first');
	dir = fs.mkdtempSync(path.join(os.tmpdir(), 'palette-vite-'));
	fs.mkdirSync(path.join(dir, 'node_modules/@laticent'), { recursive: true });
	fs.symlinkSync(REPO, path.join(dir, 'node_modules/@laticent/lattice'), 'dir');
	fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}');
});
afterAll(() => {
	if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

/** Build an app whose entry is `imports`, and return its one stylesheet. */
async function buildCss(name: string, imports: string[]): Promise<string> {
	const app = path.join(dir, name);
	fs.mkdirSync(app, { recursive: true });
	fs.writeFileSync(path.join(app, 'index.html'), '<!doctype html><script type="module" src="./main.js"></script>');
	fs.writeFileSync(path.join(app, 'main.js'), imports.map((i) => `import '${i}';`).join('\n'));
	const out = (await build({ root: app, logLevel: 'silent', configFile: false, build: { write: false } })) as { output: { fileName: string; source?: string | Uint8Array }[] };
	const css = out.output.filter((o) => o.fileName.endsWith('.css'));
	expect(css).toHaveLength(1);
	return String(css[0].source);
}

/** The first custom property a theme file declares, as Vite's minifier writes it. */
function firstToken(theme: string): string {
	const css = fs.readFileSync(path.join(REPO, 'themes', theme, `${theme}.css`), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
	const m = /(--[a-z0-9-]+)\s*:\s*(#[0-9A-Fa-f]{3,8})\s*;/.exec(css);
	if (!m) throw new Error(`${theme} declares no hex token to look for`);
	return `${m[1]}:${m[2].toLowerCase()}`;
}

describe('a published palette imports cleanly in Vite', () => {
	it('THE FAILING ARM: the Marp theme file itself does not', async () => {
		await expect(buildCss('plain', ['@laticent/lattice/themes/cuoio.css'])).rejects.toThrow(/ENOENT[\s\S]*lattice/);
	});

	it.each([
		// [palette, the theme whose own hex token it must carry, why it is here]
		['cuoio', 'cuoio', 'a base palette'],
		['cuoio-dark', 'cuoio', 'a dark variant, whose tokens come from the base it imports'],
		['a11y-achromatopsia', 'a11y-achromatopsia', 'the deepest chain: a11y-achromatopsia -> a11y-base -> onyx'],
	])('engine + palette/%s builds, and carries the engine and %s’s tokens (%s)', async (theme, source) => {
		const css = await buildCss(theme, ['@laticent/lattice/css', `@laticent/lattice/palette/${theme}.css`]);
		expect(css.replace(/\s/g, '').toLowerCase()).toContain(firstToken(source));
		// The engine came with it: a component rule and its self-hosted fonts.
		expect(css).toMatch(/section\.title/);
		expect(css).toMatch(/@font-face/);
		expect(css).not.toMatch(/@import/);
	}, 60_000);

	it('a dark variant pins the dark canvas after its base declares the light one', async () => {
		const css = (await buildCss('dark-pin', ['@laticent/lattice/css', '@laticent/lattice/palette/cuoio-dark.css'])).replace(/\s/g, '');
		const light = css.lastIndexOf('color-scheme:light');
		const dark = css.lastIndexOf('color-scheme:dark');
		expect(dark).toBeGreaterThan(light);
	}, 60_000);
});
