// The Lattice asset-share format — a portable `.zip` of saved themes, components,
// finishes and motion.
//
// SINCE 2026-09 THE ZIP IS THE PACKAGE FOLDER (engineering/decisions/2026-09-23-portable-
// packages.md §3.1, phase 3). A single export unzips to `<name>/`, a bundle to
// `<type>/<name>/`, and each folder holds exactly what a repo package holds:
// `<name>.manifest.json` plus role files. package-zip.ts maps records to packages and back
// through the package spine.
//
//   <slug>.lattice-theme.zip      <slug>/<slug>.manifest.json · <slug>.css [· <slug>.essentials.json]
//                                 + README.md and <slug>-showcase.pdf beside the folder
//   <slug>.lattice-component.zip  <slug>/<slug>.manifest.json · <slug>.styles.css · <slug>.gallery.md
//   <slug>.lattice-finish.zip     <slug>/<slug>.manifest.json · <slug>.recipe.json
//   <slug>.lattice-scene.zip      <slug>/<slug>.manifest.json · <slug>.scene.json [· poster/art .svg]
//   lattice-assets.zip            theme/… · component/… · finish/… · motion/… + README.md
//
// OLD ZIPS STILL IMPORT. A `lattice-asset/1` zip (one root `manifest.json` envelope listing
// items, files under other names) is read by `unpackLegacy` below, one way: nothing writes it.
// Pack here is pure data + JSZip; the theme showcase PDF is rendered by the caller (Library).

import { parseScene, type Scene } from '@/lib/anima';
import { normalizeSourceText } from '@/lib/normalize-source-text';
import type { StudioComponent } from './component-library';
import { coerceRecipe, type FinishRecipe } from './finish-generate';
import type { StudioFinish } from './finish-library';
import type { PackageCarry } from './library/package-carry';
import type { PackageFiles } from './package-zip';

// The package converters load on first use, not with the Library: every caller here is
// already async, and the Studio's eager bundle has a byte budget (docs/route-budget.json).
const packageZip = () => import('./package-zip');

import type { StudioScene } from './scene-library';
import type { StudioTheme } from './theme-library';
import { assertZipWithinLimits, MAX_ZIP_BYTES, readBudget } from './zip-limits';

const TOO_LARGE = 'That asset zip is too large to import.';

export const ASSET_FORMAT = 'lattice-asset/1';

// The painter a scene targets, derived from its source. Inlined here (rather than imported) so
// this "pure data + JSZip" module stays free of the IndexedDB-bound store graph.
//
// An svg scene reads `anime`, not `vivus`: Vivus was REPLACED by anime.js v4 in 90a2b41, and this
// string is written into every exported bundle's manifest and README. It is descriptive metadata
// — nothing reads it back on import (`unpackBundle` keys on `kind`) — which is exactly why it sat
// wrong: no gate could see it, and the only surface that showed it was the Motion tab's engine
// badge, which shipped reading `vivus` until this change removed it.
const engineOf = (spec: Scene): 'zdog' | 'anime' => (spec.source === 'svg' ? 'anime' : 'zdog');

export type ThemeItem = { kind: 'theme'; name: string; label: string; essentials: Record<string, string> | null; css: string; showcase?: string };
export type ComponentItem = { kind: 'component'; name: string; bucket: string | null; css: string; skeleton: string };
// A finish item: the generated `section.finish.finish-<slug>` CSS file + the
// structured recipe JSON (so a re-import reloads into the faculty for re-editing).
export type FinishItem = { kind: 'finish'; name: string; label: string; css: string; recipe: string };
// A scene item: the canonical Anima spec JSON + a token-preserving poster still (+ the
// authored line-art for a Vivus scene). `spec`/`poster`/`art` are FILENAMES in the zip.
export type SceneItem = { kind: 'scene'; name: string; label: string; description?: string; engine: string; spec: string; poster?: string; art?: string };
export type ManifestItem = ThemeItem | ComponentItem | FinishItem | SceneItem;
export type AssetManifest = { format: typeof ASSET_FORMAT; kind: 'theme' | 'component' | 'finish' | 'scene' | 'bundle'; items: ManifestItem[] };

// `pkg` is what a PACKAGE zip carried that the Studio record does not model (package-carry.ts);
// a legacy zip has none. `manifest` is a component package's full manifest.
export type ParsedTheme = { name: string; label: string; essentials: Record<string, string> | null; css: string; overrides?: Record<string, unknown>; rampStrategy?: string; pkg?: PackageCarry };
export type ParsedComponent = { name: string; bucket: string | null; css: string; skeleton: string; manifest?: Record<string, unknown>; pkg?: PackageCarry };
export type ParsedFinish = { name: string; label: string; css: string; recipe: FinishRecipe; pkg?: PackageCarry };
export type ParsedScene = { name: string; label: string; description?: string; spec: Scene; poster?: string; art?: string; pkg?: PackageCarry };
/** `notes`: what the reader changed or left out (a renamed file, a dropped README).
 *  `refused`: packages it would not import, each with the reason. */
export type ParsedBundle = { themes: ParsedTheme[]; components: ParsedComponent[]; finishes: ParsedFinish[]; scenes: ParsedScene[]; notes: string[]; refused: { name: string; why: string }[] };

export const themeZipName = (t: { name: string }) => `${t.name}.lattice-theme.zip`;
export const componentZipName = (c: { name: string }) => `${c.name}.lattice-component.zip`;
export const finishZipName = (f: { name: string }) => `${f.name}.lattice-finish.zip`;
export const sceneZipName = (s: { name: string }) => `${s.name}.lattice-scene.zip`;

// A representative deck that exercises the theme across the engine's range —
// title, KPIs, a journey chart (the categorical series band), a Mermaid flow, a
// split-panel, and a closing slide — rendered live in the theme so showcase.pdf
// SHOWS the look. (Journey reads the `--chart-catN` series tokens the derived
// theme emits; piechart would need `--chart-cat-N-hue`, which it doesn't.)
export function showcaseDeck(label: string): string {
	const L = label || 'Your theme';
	return `---
size: hd
paginate: true
---

<!-- _class: title -->
<!-- _paginate: false -->

# ${L}

\`Lattice · theme showcase\`

Every surface this palette touches — type, charts, diagrams, structure.

---

<!-- _class: kpi -->

\`Highlights · at a glance\`

## The numbers, framed.

1. 100
   - Tokens derived
2. AA
   - Contrast floor
3. 8
   - Chart series

---

<!-- _class: journey -->

\`Charts · a journey map\`

## From first touch to activation.

- Evaluate
  - Read the case study \`@prospect\` \`:4\`
  - Book a demo \`@prospect\` \`:3\`
- Trial
  - First win \`@user\` \`:5\`
  - Invite the team \`@user\` \`:4\`
- Adopt
  - Roll out \`@team\` \`:5\`
  - Renew \`@team\` \`:5\`

---

<!-- _class: diagram -->

\`Diagrams · Mermaid\`

## How the work flows.

\`\`\`mermaid
flowchart LR
  A[Plan] --> B[Build] --> C[Review] --> D[Ship]
  D -.risk.-> B
\`\`\`

---

<!-- _class: split-panel -->

\`Structure · split panel\`

## Two columns that hold their weight.

A framing sentence that sets up the supporting points beside it.

- Palette-blind
  - Every color is a token, so the layout never hard-codes a hue.
- Contrast-safe
  - The derivation repairs to WCAG AA in light and dark.
- Portable
  - One file re-opens into Lattice with the look intact.

---

<!-- _class: closing -->
<!-- _paginate: false -->

## ${L}, on every surface.

\`Lattice · theme showcase\`
`;
}

function themeReadme(t: StudioTheme, hasShowcase: boolean): string {
	return `# ${t.label} — a Lattice theme

A palette-blind theme for [Lattice](https://lattice.style). Every color is a
token; the derivation is WCAG-AA in light **and** dark.

## What's inside
- \`${t.name}/\` — the theme as a Lattice package: \`${t.name}.manifest.json\` (its name and label), \`${t.name}.css\` (the serialized \`@theme ${t.name}\`)${t.essentials ? `, and \`${t.name}.essentials.json\` (the picked colors, so it reopens for editing)` : ''}.
${hasShowcase ? `- \`${t.name}-showcase.pdf\` — a representative deck rendered in this theme (title · KPIs · chart · Mermaid · split-panel · closer).\n` : ''}
## Use it
Open the Studio → **Library** → **Import .zip**. The folder is the same shape a Lattice repo keeps its packages in.
`;
}

function componentReadme(c: StudioComponent): string {
	return `# .${c.name} — a Lattice component

A local, palette-blind, scope-checked component for [Lattice](https://lattice.style).

## What's inside
- \`${c.name}/\` — the component as a Lattice package: \`${c.name}.manifest.json\`, \`${c.name}.styles.css\` (the \`.${c.name}\`-scoped styles, palette-blind) and \`${c.name}.gallery.md\` (a sample slide that invokes \`<!-- _class: ${c.name} -->\`).

## Use it
Open the Studio → **Library** → **Import .zip**, then **Insert** it into any deck.
`;
}

function finishReadme(f: { name: string; label: string }): string {
	return `# ${f.label} — a Lattice finish

A palette-blind, export-safe surface finish for [Lattice](https://lattice.style).
Every color is a token; it recolors with the theme and bakes clean into PDF/PPTX.

## What's inside
- \`${f.name}/\` — the finish as a Lattice package: \`${f.name}.manifest.json\` and \`${f.name}.recipe.json\`, the structured layer recipe. The CSS is generated from the recipe on import, so it is not in the zip. Apply it per slide with \`<!-- _class: finish finish-${f.name} -->\` or deck-wide with \`class: finish finish-${f.name}\`.

## Use it
Open the Studio → **Library** → **Import .zip**, then pick it from the Finish menu in the Inspector.
`;
}

function sceneReadme(s: StudioScene): string {
	return `# ${s.label} — a Lattice motion scene

A palette-blind, poster-first Anima animation for [Lattice](https://lattice.style). The
scene SPEC is the source of truth; the poster is a token-preserving still that bakes into
a PDF.

## What's inside
- \`${s.name}/\` — the motion as a Lattice package: \`${s.name}.manifest.json\` and \`${s.name}.scene.json\`, the canonical Anima scene spec (${engineOf(s.spec)} engine).
${s.poster ? `- \`${s.name}/${s.name}.poster.svg\` — the hero still (keeps \`var(--token)\`, so it recolors with the theme).\n` : ''}${s.art ? `- \`${s.name}/${s.name}.art.svg\` — the authored line-art the scene draws.\n` : ''}

## Use it
Open the Studio → **Library** → **Import .zip**, then place it via the scene component.
`;
}

// biome-ignore lint/suspicious/noExplicitAny: JSZip is dynamically imported.
async function jszip(): Promise<any> {
	const { default: JSZip } = await import('jszip');
	return new JSZip();
}

async function zipOf(pkgs: PackageFiles[], extras: Record<string, string | Blob>): Promise<Blob> {
	const [zip, { writePackagesToZip }] = await Promise.all([jszip(), packageZip()]);
	writePackagesToZip(zip, pkgs, extras);
	return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

/** Pack ONE theme → a `.zip` Blob. `showcasePdf` (rendered by the caller) rides beside the folder. */
export async function packTheme(theme: StudioTheme, showcasePdf?: Blob | null): Promise<Blob> {
	const { themePackage } = await packageZip();
	return zipOf([themePackage(theme)], { 'README.md': themeReadme(theme, !!showcasePdf), ...(showcasePdf ? { [`${theme.name}-showcase.pdf`]: showcasePdf } : {}) });
}

/** Pack ONE component → a `.zip` Blob. */
export async function packComponent(c: StudioComponent): Promise<Blob> {
	const { componentPackage } = await packageZip();
	return zipOf([componentPackage(c)], { 'README.md': componentReadme(c) });
}

/** Pack ONE saved finish → a `.zip` Blob (manifest + recipe; the CSS regenerates on import). */
export async function packFinish(f: StudioFinish): Promise<Blob> {
	const { finishPackage } = await packageZip();
	return zipOf([finishPackage(f)], { 'README.md': finishReadme(f) });
}

/** Pack ONE scene → a `.zip` Blob. */
export async function packScene(s: StudioScene): Promise<Blob> {
	const { motionPackage } = await packageZip();
	return zipOf([motionPackage(s)], { 'README.md': sceneReadme(s) });
}

/** Pack a SELECTION of assets into one bundle `.zip`: one `<type>/<name>/` folder each. */
export async function packBundle(themes: { theme: StudioTheme; showcase?: Blob | null }[], components: StudioComponent[], finishes: StudioFinish[] = [], scenes: StudioScene[] = []): Promise<Blob> {
	const { themePackage, componentPackage, finishPackage, motionPackage } = await packageZip();
	const pkgs = [...themes.map((t) => themePackage(t.theme)), ...components.map(componentPackage), ...finishes.map(finishPackage), ...scenes.map(motionPackage)];
	const extras: Record<string, string | Blob> = {
		'README.md': `# Lattice asset bundle\n\n${themes.length} theme(s) + ${components.length} component(s) + ${finishes.length} finish(es) + ${scenes.length} motion(s).\nEach folder is a Lattice package: \`<type>/<name>/<name>.manifest.json\` plus its files.\nImport via the Studio → **Library** → **Import .zip**.\n`,
	};
	for (const { theme, showcase } of themes) if (showcase) extras[`showcases/${theme.name}-showcase.pdf`] = showcase;
	// A single-item "bundle" still lands under its type folder, so a bundle is always the same shape.
	if (pkgs.length === 1) {
		const zip = await jszip();
		for (const [file, text] of Object.entries(pkgs[0].files)) zip.file(`${pkgs[0].type}/${pkgs[0].name}/${file}`, text);
		for (const [file, body] of Object.entries(extras)) zip.file(file, body);
		return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
	}
	return zipOf(pkgs, extras);
}

/**
 * Read a `.zip` back into themes + components + finishes + scenes ready to save — a package
 * zip, or an old `lattice-asset/1` one.
 */
export async function unpackBundle(file: Blob): Promise<ParsedBundle> {
	// Size caps first (`zip-limits.ts`): an asset zip is a file from anyone.
	if (file.size > MAX_ZIP_BYTES) throw new Error(TOO_LARGE);
	const { default: JSZip } = await import('jszip');
	const zip = await JSZip.loadAsync(file);
	assertZipWithinLimits(zip, TOO_LARGE, []);
	// Every read below is charged against one running budget (`zip-limits.ts`).
	const charge = readBudget(TOO_LARGE);
	const read = async (path: string | undefined): Promise<string | undefined> => (path ? ((charge(await zip.file(path)?.async('string')) as string | undefined) ?? undefined) : undefined);
	if ((await packageZip()).isPackageZip(zip)) return unpackPackages(zip, read);
	return unpackLegacy(zip, read);
}

/** A package zip: every `<name>/` folder through the spine, then into the Library's shapes.
 *  Exported for the `.lattice` reader, whose `packages/` folders are the same thing. */
// biome-ignore lint/suspicious/noExplicitAny: JSZip is dynamically imported.
export async function unpackPackages(zip: any, read: (path: string | undefined) => Promise<string | undefined>): Promise<ParsedBundle> {
	// The declared size of every entry a package folder holds; loose files beside the folders
	// (a README, a showcase PDF) are never read and don't count.
	const inFolders = Object.keys(zip.files).filter((p) => !zip.files[p].dir && p.includes('/') && !p.startsWith('showcases/'));
	assertZipWithinLimits(zip, TOO_LARGE, inFolders);
	const { readPackagesFromZip, themeFromPackage, componentFromPackage, finishFromPackage, motionFromPackage } = await packageZip();
	const { packages, refused } = await readPackagesFromZip(zip, (p) => read(p));
	const out: ParsedBundle = { themes: [], components: [], finishes: [], scenes: [], notes: [], refused: [...refused] };
	for (const p of packages) {
		if (p.notes.length) out.notes.push(`${p.name}: ${p.notes.join('; ')}`);
		// §3.5: a package carrying JavaScript needs the user's consent and a sandbox, and
		// neither exists yet. It is refused by name, never imported without its code.
		if (p.code) {
			out.refused.push({ name: p.name, why: 'it carries code (a transform), and code packages are not supported yet' });
			continue;
		}
		if (p.type === 'theme') out.themes.push(themeFromPackage(p));
		else if (p.type === 'component') {
			const c = componentFromPackage(p);
			// LINE ENDINGS: the gallery (the Studio's skeleton) is spliced into a deck's source.
			out.components.push({ name: c.name, bucket: c.bucket, css: c.css, skeleton: normalizeSourceText(c.skeleton) ?? '', manifest: c.manifest, pkg: c.pkg });
		} else if (p.type === 'finish') {
			const f = finishFromPackage(p);
			out.finishes.push({ name: f.name, label: f.label, css: '', recipe: f.recipe, pkg: f.pkg });
		} else if (p.type === 'motion') {
			const m = motionFromPackage(p);
			// The spec is the source of truth and is re-validated; a scene that doesn't parse is
			// refused, never coerced (there is no safe default scene).
			let r: ReturnType<typeof parseScene> = { ok: false, errors: ['unreadable scene spec'] };
			try {
				r = parseScene(JSON.parse(m.specText));
			} catch {
				/* malformed JSON → refused below */
			}
			if (r.ok) out.scenes.push({ name: m.name, label: m.label, description: m.description, spec: r.scene, poster: m.poster, art: m.art, pkg: m.pkg });
			else out.refused.push({ name: m.name, why: 'its motion plan is not valid' });
		}
	}
	return out;
}

/** The pre-2026-09 `lattice-asset/1` envelope. Read-only: nothing writes this format any more. */
// biome-ignore lint/suspicious/noExplicitAny: JSZip is dynamically imported.
async function unpackLegacy(zip: any, read: (path: string | undefined) => Promise<string | undefined>): Promise<ParsedBundle> {
	// The entry count, and the manifest's own declared size, before reading anything.
	assertZipWithinLimits(zip, TOO_LARGE, ['manifest.json']);
	const manifestFile = zip.file('manifest.json');
	if (!manifestFile) throw new Error('Not a Lattice asset zip — no package folder and no manifest.json.');
	const manifest = JSON.parse((await read('manifest.json')) || '') as AssetManifest;
	if (manifest?.format !== ASSET_FORMAT) throw new Error(`Unsupported asset format: ${manifest?.format}`);
	if (!Array.isArray(manifest.items)) throw new Error('Not a Lattice asset zip — manifest.json lists no items.');
	// Then the declared size of exactly the entries this import reads. Showcase PDFs ride
	// in a bundle but are never opened, so they don't count against the cap.
	const readPaths = manifest.items.flatMap((it) => Object.entries(it).filter(([k, v]) => k !== 'showcase' && typeof v === 'string' && zip.files[v]).map(([, v]) => v as string));
	assertZipWithinLimits(zip, TOO_LARGE, ['manifest.json', ...readPaths]);
	const out: ParsedBundle = { themes: [], components: [], finishes: [], scenes: [], notes: [], refused: [] };
	for (const item of manifest.items) {
		if (item.kind === 'theme') {
			const css = await read(item.css);
			if (css) out.themes.push({ name: item.name, label: item.label, essentials: item.essentials ?? null, css });
		} else if (item.kind === 'component') {
			const css = await read(item.css);
			// LINE ENDINGS: the skeleton is markdown spliced verbatim into a deck's source
			// (`addSlideAfter` in StudioShell), and the zip is external input — so it normalizes
			// here, at the unpack, for the same reason an imported `.md` does. CSS is left alone:
			// it is never spliced into markdown and the browser is indifferent to its endings.
			const skeleton = normalizeSourceText(await read(item.skeleton));
			if (css && skeleton != null) out.components.push({ name: item.name, bucket: item.bucket ?? null, css, skeleton });
		} else if (item.kind === 'finish') {
			const css = await read(item.css);
			const recipeText = await read(item.recipe);
			if (css) {
				// coerceRecipe clamps a missing/garbled recipe to the closed vocab, so a
				// finish always re-imports renderable even if the recipe JSON is absent.
				let parsed: unknown;
				try { parsed = recipeText ? JSON.parse(recipeText) : undefined; } catch { parsed = undefined; }
				out.finishes.push({ name: item.name, label: item.label, css, recipe: coerceRecipe(parsed) });
			}
		} else if (item.kind === 'scene') {
			// The spec is the source of truth. Validate the imported JSON — an untrusted /
			// corrupt zip that doesn't yield a schema-valid scene is DROPPED (fail-closed),
			// never coerced (there is no safe default scene). poster/art ride as strings and
			// stay UNTRUSTED — a consumer sanitizes them before any preview (HARD RULE #22).
			const specText = await read(item.spec);
			// Guard BOTH parse steps: a hostile spec must degrade to a DROP of this one scene,
			// never a throw that aborts the whole import (parseScene is bounded against the
			// recursion-bomb, but the try/catch keeps any future validator throw contained too).
			let r: ReturnType<typeof parseScene> = { ok: false, errors: ['unreadable scene spec'] };
			try {
				r = parseScene(specText ? JSON.parse(specText) : undefined);
			} catch {
				/* malformed JSON or a validator throw → drop this scene */
			}
			if (r.ok) {
				const poster = await read(item.poster);
				const art = await read(item.art);
				out.scenes.push({ name: item.name, label: item.label, description: item.description, spec: r.scene, poster: poster ?? undefined, art: art ?? undefined });
			}
		}
	}
	return out;
}
