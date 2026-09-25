// The Studio's zip IS the package folder (engineering/decisions/2026-09-23-portable-packages.md
// §3.1, phase 3). A single export unzips to `<name>/`; a bundle unzips to `<type>/<name>/`.
// Each folder is exactly what a repo package holds: `<name>.manifest.json` and role files
// named `<name>.<role>`. There is no envelope and no renaming, so a Studio export drops into
// a repo root, and a repo package imports into the Studio.
//
// The package spine (lib/packages/) does the reading and writing: it finds each file's role
// by SUFFIX, lets the manifest own the name, and rewrites every projection from it. This file
// only maps a Studio record to a package's files and back.
//
// The spine is loaded ON DEMAND. `asset-bundle.ts` sits on the Studio's eager path (Library
// imports it), and the spine pulls in the theme parser; pack and unpack are user actions.

import type { Scene } from '@/lib/anima';
// The JSON value cap (lib/packages/json-guard.js). A static import is fine here: this module is
// only ever loaded on demand (asset-bundle.ts, share-export.ts), never on the Studio's eager path.
import jsonGuard from '../../../../lib/packages/json-guard.js';
import type { StudioComponent } from './component-library';
import { coerceRecipe, type FinishRecipe } from './finish-generate';
import type { StudioFinish } from './finish-library';
import type { PackageCarry } from './library/package-carry';
import type { StudioScene } from './scene-library';
import type { StudioTheme } from './theme-library';

export type PackageType = 'theme' | 'component' | 'finish' | 'motion';
/** One package as files: file name (`<name>.<role>`) → text. */
export type PackageFiles = { type: PackageType; name: string; files: Record<string, string> };

// Through the esbuild bundle (tools/build-packages-core.js), not lib/packages/ directly: the
// spine is CommonJS with requires, which the docs dev server can't serve (astro.config.mjs).
type Spine = typeof import('@/playground/packages-core.generated.js');

const TOO_MANY = 'it holds too many values to read';
let spineLoad: Promise<Spine> | null = null;
export function loadSpine(): Promise<Spine> {
	if (!spineLoad) spineLoad = import('@/playground/packages-core.generated.js');
	return spineLoad;
}

const json = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`;

/** The manifest to write: the carried one (if any) under the record's current identity. */
function manifestFor(type: PackageType, name: string, carry: PackageCarry | undefined, fields: Record<string, unknown>): Record<string, unknown> {
	const base = carry?.manifest ? { ...carry.manifest } : {};
	// A carried manifest keeps its own shape; a record with none gets the fields the Studio knows.
	const extra = carry?.manifest ? Object.fromEntries(Object.entries(fields).filter(([k]) => k in base)) : fields;
	const { name: _n, type: _t, format: _f, ...rest } = { ...base, ...extra };
	return { name, type, format: 1, ...rest };
}

/** A carried role file, when its content still describes the record; else the fresh text. */
function carried(carry: PackageCarry | undefined, role: string, fresh: string, same: (text: string) => boolean): string {
	const text = carry?.files?.[role];
	if (text != null) {
		try {
			if (same(text)) return text;
		} catch {
			/* an unreadable carried file is replaced by the fresh one */
		}
	}
	return fresh;
}

const deepEqual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ── Studio record → package files ─────────────────────────────────────────────

export function themePackage(t: StudioTheme): PackageFiles {
	const n = t.name;
	const files: Record<string, string> = {
		[`${n}.manifest.json`]: json(manifestFor('theme', n, t.pkg, { label: t.label })),
		[`${n}.css`]: t.css,
	};
	// essentials.json is what reopens the theme for editing in Fabricate.
	if (t.essentials && Object.keys(t.essentials).length) {
		const state = { essentials: t.essentials, ...(t.overrides ? { overrides: t.overrides } : {}), ...(t.rampStrategy ? { rampStrategy: t.rampStrategy } : {}) };
		files[`${n}.essentials.json`] = carried(t.pkg, 'essentials.json', json(state), (x) => deepEqual(jsonGuard.parseJsonCapped(x, TOO_MANY), state));
	}
	return { type: 'theme', name: n, files };
}

export function componentPackage(c: StudioComponent): PackageFiles {
	const n = c.name;
	const meta = Object.fromEntries(Object.entries(c.meta ?? {}).filter(([, v]) => v != null && v !== ''));
	const files: Record<string, string> = {
		[`${n}.manifest.json`]: json(manifestFor('component', n, c.pkg, { ...(c.bucket ? { bucket: c.bucket } : {}), ...meta })),
		[`${n}.styles.css`]: c.css,
		// The Studio calls it the skeleton; the repo calls the same file the gallery.
		[`${n}.gallery.md`]: c.skeleton,
	};
	const docs = c.pkg?.files?.['docs.md'];
	if (docs != null) files[`${n}.docs.md`] = docs;
	return { type: 'component', name: n, files };
}

export function finishPackage(f: StudioFinish): PackageFiles {
	const n = f.name;
	return {
		type: 'finish',
		name: n,
		files: {
			[`${n}.manifest.json`]: json(manifestFor('finish', n, f.pkg, { label: f.label })),
			// The CSS is generated from the recipe (§3.6), so it never travels.
			[`${n}.recipe.json`]: carried(f.pkg, 'recipe.json', json(f.recipe), (x) => deepEqual(coerceRecipe(jsonGuard.parseJsonCapped(x, TOO_MANY)), coerceRecipe(f.recipe))),
		},
	};
}

export function motionPackage(s: StudioScene): PackageFiles {
	const n = s.name;
	const engine = s.spec.source === 'svg' ? 'anime' : 'zdog';
	const files: Record<string, string> = {
		[`${n}.manifest.json`]: json(manifestFor('motion', n, s.pkg, { label: s.label, ...(s.description ? { description: s.description } : {}), engine })),
		[`${n}.scene.json`]: carried(s.pkg, 'scene.json', json(s.spec), (x) => deepEqual(jsonGuard.parseJsonCapped(x, TOO_MANY), s.spec)),
	};
	if (s.poster) files[`${n}.poster.svg`] = s.poster;
	if (s.art) files[`${n}.art.svg`] = s.art;
	return { type: 'motion', name: n, files };
}

// ── zip ⇄ package folders ─────────────────────────────────────────────────────

// biome-ignore lint/suspicious/noExplicitAny: JSZip is dynamically imported.
type Zip = any;

/**
 * Write packages into a zip. One package lands at `<name>/`, several at `<type>/<name>/`
 * (§3.1). `extras` are files OUTSIDE any package folder — a README, a theme's showcase
 * PDF — which a reader skips.
 */
export function writePackagesToZip(zip: Zip, pkgs: PackageFiles[], extras: Record<string, string | Blob> = {}): void {
	const single = pkgs.length === 1;
	for (const p of pkgs) {
		const dir = single ? p.name : `${p.type}/${p.name}`;
		for (const [file, text] of Object.entries(p.files)) zip.file(`${dir}/${file}`, text);
	}
	for (const [file, body] of Object.entries(extras)) zip.file(file, body);
}

export type ReadPackage = {
	type: PackageType;
	name: string;
	manifest: Record<string, unknown>;
	/** role → file text, after the spine rewrote every projection from the manifest */
	roles: Record<string, string>;
	code: boolean;
	notes: string[];
};

// ── Untrusted theme STATE ────────────────────────────────────────────────────
// A theme package's `essentials.json` is not CSS, so no CSS gate sees it, but Fabricate
// turns it INTO CSS: reopening the theme derives the stylesheet from `essentials` and
// writes each `overrides` value verbatim into a declaration. An override of
// `red; background-image: url(https://…)` therefore became a live beacon in the saved
// theme (HARD RULE #22). Both are colors by contract, so the import keeps only
// slug-named entries with hex values, and drops the rest.
const HEX = /^#[0-9a-fA-F]{3,8}$/;
const SLUG = /^[a-z][a-z0-9-]*$/;
export function hexMap(v: unknown): Record<string, string> | null {
	if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
	const out = Object.entries(v as Record<string, unknown>).filter(([k, x]) => SLUG.test(k) && typeof x === 'string' && HEX.test(x));
	return out.length ? Object.fromEntries(out) as Record<string, string> : null;
}
function overridesMap(v: unknown): Record<string, { light?: string; dark?: string }> | null {
	if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
	const out: Record<string, { light?: string; dark?: string }> = {};
	for (const [token, sides] of Object.entries(v as Record<string, unknown>)) {
		if (!SLUG.test(token) || !sides || typeof sides !== 'object') continue;
		const s = sides as Record<string, unknown>;
		const kept = { ...(typeof s.light === 'string' && HEX.test(s.light) ? { light: s.light } : {}), ...(typeof s.dark === 'string' && HEX.test(s.dark) ? { dark: s.dark } : {}) };
		if (Object.keys(kept).length) out[token] = kept;
	}
	return Object.keys(out).length ? out : null;
}

const TYPES: readonly string[] = ['theme', 'component', 'finish', 'motion'];

/**
 * Every package folder in a zip: a directory holding a `*.manifest.json`, with an optional
 * leading `<type>/` segment. Files outside any such folder (a README, a showcase PDF) are
 * not package files and are skipped. `read` returns an entry's text and charges the caller's
 * size budget.
 */
export async function readPackagesFromZip(zip: Zip, read: (path: string) => Promise<string | undefined>): Promise<{ packages: ReadPackage[]; refused: { name: string; why: string }[] }> {
	const spine = await loadSpine();
	const paths = Object.keys(zip.files).filter((p) => !zip.files[p].dir);
	// A folder holding a manifest — or the zip's ROOT, when someone zipped the files instead
	// of the folder (what "Compress items" does), which used to import nothing and say nothing.
	const dirs = [...new Set(paths.filter((p) => p.endsWith('.manifest.json')).map((p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '')))].sort();
	const packages: ReadPackage[] = [];
	const refused: { name: string; why: string }[] = [];
	for (const dir of dirs) {
		const segs = dir ? dir.split('/') : [];
		const folder = segs.length ? segs[segs.length - 1] : undefined;
		const typeHint = segs.length >= 2 && TYPES.includes(segs[segs.length - 2]) ? segs[segs.length - 2] : undefined;
		const prefix = dir ? `${dir}/` : '';
		const files: Record<string, string> = {};
		for (const p of paths) {
			const rest = p.slice(prefix.length);
			// At the root, only the package's own files: a README or a showcase PDF is not one.
			if (p.startsWith(prefix) && !rest.includes('/') && (dir || /\.(manifest\.json|css|md|json|svg|js)$/.test(rest))) files[rest] = (await read(p)) ?? '';
		}
		const r = spine.readPackage(files, { type: typeHint, ...(folder ? { folder } : {}) });
		if (!r.ok || !r.pkg) {
			refused.push({ name: folder ?? 'the zip', why: r.errors.join('; ') });
			continue;
		}
		// Normalize through the writer, so every file name is the manifest's (§3.2).
		const written = spine.writePackage(r.pkg) as Record<string, string>;
		const norm = spine.readPackage(written, { strict: true });
		if (!norm.ok || !norm.pkg) {
			refused.push({ name: folder ?? 'the zip', why: norm.errors.join('; ') });
			continue;
		}
		const roles: Record<string, string> = {};
		for (const [role, file] of Object.entries(norm.pkg.roles as Record<string, string>)) roles[role] = String(written[file] ?? '');
		// A component's images and data files (its assets) are not carried into the Studio's
		// record yet, so they are named as left out rather than lost in silence.
		const notes = [...r.renames, ...(r.pkg.dropped ?? []).map((f: string) => `left out ${f}`), ...(r.pkg.assets?.length ? [`left out ${r.pkg.assets.length} asset file(s): ${r.pkg.assets.join(', ')}`] : [])];
		packages.push({ type: norm.pkg.type as PackageType, name: norm.pkg.name, manifest: jsonGuard.parseJsonCapped(roles['manifest.json'], TOO_MANY) as Record<string, unknown>, roles, code: !!norm.pkg.code, notes });
	}
	return { packages, refused };
}

/** Is this zip a package zip (as opposed to a `lattice-asset/1` envelope)? */
export function isPackageZip(zip: Zip): boolean {
	return !zip.file('manifest.json') && Object.keys(zip.files).some((p) => p.endsWith('.manifest.json'));
}

// ── read package → the shapes the Library saves ───────────────────────────────

const labelOf = (m: Record<string, unknown>, name: string) => (typeof m.label === 'string' && m.label ? m.label : name);

export function themeFromPackage(p: ReadPackage): { name: string; label: string; essentials: Record<string, string> | null; overrides?: Record<string, unknown>; rampStrategy?: string; css: string; pkg: PackageCarry } {
	let state: { essentials?: Record<string, string>; overrides?: Record<string, unknown>; rampStrategy?: string } = {};
	// Carried verbatim into the saved theme, and so into every later export and backup, ONLY when
	// it parsed: a file the value cap refused, or that is not JSON, is dropped, not kept to re-fire.
	let raw: string | undefined = p.roles['essentials.json'];
	if (raw) {
		try {
			state = (jsonGuard.parseJsonCapped(raw, TOO_MANY) as typeof state) ?? {};
		} catch {
			state = {};
			raw = undefined;
		}
	}
	const overrides = overridesMap(state.overrides);
	return {
		name: p.name,
		label: labelOf(p.manifest, p.name),
		essentials: hexMap(state.essentials),
		...(overrides ? { overrides } : {}),
		...(typeof state.rampStrategy === 'string' && SLUG.test(state.rampStrategy) ? { rampStrategy: state.rampStrategy } : {}),
		css: p.roles.css ?? '',
		pkg: { manifest: p.manifest, ...(raw ? { files: { 'essentials.json': raw } } : {}) },
	};
}

export function componentFromPackage(p: ReadPackage): { name: string; bucket: string | null; css: string; skeleton: string; manifest: Record<string, unknown>; pkg: PackageCarry } {
	const m = p.manifest;
	return {
		name: p.name,
		bucket: typeof m.bucket === 'string' ? m.bucket : null,
		css: p.roles['styles.css'] ?? '',
		skeleton: p.roles['gallery.md'] ?? '',
		manifest: m,
		pkg: { manifest: m, ...(p.roles['docs.md'] != null ? { files: { 'docs.md': p.roles['docs.md'] } } : {}) },
	};
}

export function finishFromPackage(p: ReadPackage): { name: string; label: string; recipe: FinishRecipe; pkg: PackageCarry } {
	let parsed: unknown;
	let raw = p.roles['recipe.json'] ?? '';
	try {
		parsed = jsonGuard.parseJsonCapped(raw, TOO_MANY);
	} catch {
		// Refused by the value cap, or not JSON: the finish still imports from the clamped default
		// recipe, but the file is not carried into the saved record (see themeFromPackage).
		parsed = undefined;
		raw = '';
	}
	// coerceRecipe clamps every number and enum-checks every keyword, so a recipe from a
	// stranger can only describe a finish the vocabulary can draw.
	return { name: p.name, label: labelOf(p.manifest, p.name), recipe: coerceRecipe(parsed), pkg: { manifest: p.manifest, files: { 'recipe.json': raw } } };
}

export function motionFromPackage(p: ReadPackage): { name: string; label: string; description?: string; specText: string; poster?: string; art?: string; pkg: PackageCarry } {
	const m = p.manifest;
	return {
		name: p.name,
		label: labelOf(m, p.name),
		...(typeof m.description === 'string' ? { description: m.description } : {}),
		specText: p.roles['scene.json'] ?? '',
		...(p.roles['poster.svg'] != null ? { poster: p.roles['poster.svg'] } : {}),
		...(p.roles['art.svg'] != null ? { art: p.roles['art.svg'] } : {}),
		pkg: { manifest: m, files: { 'scene.json': p.roles['scene.json'] ?? '' } },
	};
}

export type { Scene };
