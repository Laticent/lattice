// THE ROUND TRIP (engineering/decisions/2026-09-23-portable-packages.md §3.1, phase 3):
//
//   repo package → zip → Studio → zip → IDENTICAL FILES
//
// A repo package folder, written by the spine, is zipped; the Studio imports it through the
// real `unpackBundle` and the real save functions; the Studio exports it again; and every
// file in the second zip equals the first, byte for byte. That is the property the package
// format exists for: the repo folder, the zip and the Studio record hold the same files.
//
// The packages are real repo packages RENAMED off their shipped names (`probe-…`), because a
// shipped name is reserved and would correctly import as `<name>-custom` (§3.7).
//
// jsdom, not node: JSZip reads a Blob only where FileReader exists.

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// The store echoes what it is given, so each save returns the record it would have written.
vi.mock('@/components/studio/library/asset-store.js', () => ({
	putAsset: vi.fn(async (a: Record<string, unknown>) => ({ ...a, id: a.id || `${a.kind}:${a.name}` })),
	listAssets: vi.fn(async () => []),
	deleteAsset: vi.fn(async () => {}),
}));

import { packComponent, packFinish, packTheme, unpackBundle } from './asset-bundle';
import { saveStudioComponent, toMeta } from './component-library';
import { saveStudioFinish } from './finish-library';
import { saveStudioTheme } from './theme-library';

const require = createRequire(import.meta.url);
const spine = require('../../../../lib/packages/index.js');
const ROOT = path.resolve(__dirname, '../../../..');

/** A repo package folder, read and re-written by the spine under a new name. */
function repoPackage(type: string, dir: string, newName: string, only?: string[]): Record<string, string> {
	const files: Record<string, string> = {};
	for (const f of only ?? fs.readdirSync(path.join(ROOT, dir))) files[f] = fs.readFileSync(path.join(ROOT, dir, f), 'utf8');
	const r = spine.readPackage(files, { type, strict: true });
	expect(r.ok, r.errors.join('\n')).toBe(true);
	const renamed = { ...r.pkg, name: newName, manifest: { ...r.pkg.manifest, name: newName } };
	return spine.writePackage(renamed);
}

async function zipFolder(name: string, files: Record<string, string>): Promise<Blob> {
	const { default: JSZip } = await import('jszip');
	const zip = new JSZip();
	for (const [f, text] of Object.entries(files)) zip.file(`${name}/${f}`, text);
	return zip.generateAsync({ type: 'blob' });
}

/** The package files in a zip (a README or showcase beside the folder is not a package file). */
async function packageFiles(blob: Blob, name: string): Promise<Record<string, string>> {
	const { default: JSZip } = await import('jszip');
	const zip = await JSZip.loadAsync(blob);
	const out: Record<string, string> = {};
	for (const p of Object.keys(zip.files)) if (!zip.files[p].dir && p.startsWith(`${name}/`)) out[p.slice(name.length + 1)] = await zip.file(p)!.async('string');
	return out;
}

describe('repo package → zip → Studio → zip yields identical files', () => {
	it('a component (manifest, styles, gallery, docs)', async () => {
		// The gallery PDFs are build outputs; the spine drops them, as it should.
		const first = repoPackage('component', 'lib/components/statement/content', 'probe-content', ['content.manifest.json', 'content.styles.css', 'content.gallery.md', 'content.docs.md']);
		expect(Object.keys(first).sort()).toEqual(['probe-content.docs.md', 'probe-content.gallery.md', 'probe-content.manifest.json', 'probe-content.styles.css']);
		const parsed = await unpackBundle(await zipFolder('probe-content', first));
		const c = parsed.components[0];
		const saved = await saveStudioComponent({ name: c.name, css: c.css, skeleton: c.skeleton, meta: toMeta(c.manifest), pkg: c.pkg });
		expect(await packageFiles(await packComponent(saved), 'probe-content')).toEqual(first);
	});

	it('a theme (manifest, css)', async () => {
		// Themes are still flat files (phase 5 moves them into folders), so pick indaco's two.
		const first = repoPackage('theme', 'themes', 'probe-indaco', ['indaco.css', 'indaco.manifest.json']);
		const parsed = await unpackBundle(await zipFolder('probe-indaco', first));
		const t = parsed.themes[0];
		const saved = await saveStudioTheme({ name: t.name, label: t.label, essentials: t.essentials ?? {}, css: t.css, pkg: t.pkg });
		expect(await packageFiles(await packTheme(saved), 'probe-indaco')).toEqual(first);
	});

	it('a finish (manifest, recipe)', async () => {
		const first = repoPackage('finish', 'lib/finishes/halo', 'probe-halo');
		const parsed = await unpackBundle(await zipFolder('probe-halo', first));
		const f = parsed.finishes[0];
		const saved = await saveStudioFinish({ name: f.name, label: f.label, css: f.css, recipe: f.recipe, pkg: f.pkg });
		expect(await packageFiles(await packFinish(saved), 'probe-halo')).toEqual(first);
	});
});
