// The Lattice asset-share format — a portable `.zip` for a saved theme or
// component, built on ONE `manifest.json` envelope (the same shape the
// `.lattice` deck format uses: `engineering/decisions/2026-06-16-lattice-export-format.md`).
// Pack here is pure data + JSZip; the live theme PDF showcase is rendered by the
// caller (Library) and handed in as a Blob, so this module stays engine-free and
// testable. Unpack re-hydrates straight into the shared asset store.
//
// Layout — single asset (files at root), bundle (one zip, many assets):
//   <slug>.lattice-theme.zip      manifest.json · <slug>.css · <slug>-showcase.pdf · README.md
//   <slug>.lattice-component.zip  manifest.json · <slug>.css · <slug>.skeleton.md · README.md
//   lattice-assets.zip            manifest.json · themes/<slug>/… · components/<slug>/… · README.md

import { parseScene, type Scene } from '@/lib/anima';
import type { StudioComponent } from './component-library';
import { coerceRecipe, type FinishRecipe } from './finish-generate';
import type { StudioFinish } from './finish-library';
import type { StudioScene } from './scene-library';
import type { StudioTheme } from './theme-library';

export const ASSET_FORMAT = 'lattice-asset/1';

// The engine a scene targets, derived from its source (built→Zdog, svg→Vivus). Inlined
// here (rather than importing scene-library's `sceneEngine`) so this "pure data + JSZip"
// module stays free of the IndexedDB-bound store graph. Mirrors scene-library.sceneEngine.
const engineOf = (spec: Scene): 'zdog' | 'vivus' => (spec.source === 'svg' ? 'vivus' : 'zdog');

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

export type ParsedTheme = { name: string; label: string; essentials: Record<string, string> | null; css: string };
export type ParsedComponent = { name: string; bucket: string | null; css: string; skeleton: string };
export type ParsedFinish = { name: string; label: string; css: string; recipe: FinishRecipe };
export type ParsedScene = { name: string; label: string; description?: string; spec: Scene; poster?: string; art?: string };
export type ParsedBundle = { themes: ParsedTheme[]; components: ParsedComponent[]; finishes: ParsedFinish[]; scenes: ParsedScene[] };

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
- \`${t.name}.css\` — the serialized \`@theme ${t.name}\` (drop into \`themes/\` or load in the Studio).
${hasShowcase ? `- \`${t.name}-showcase.pdf\` — a representative deck rendered in this theme (title · KPIs · chart · Mermaid · split-panel · closer).\n` : ''}- \`manifest.json\` — the asset envelope (re-imports losslessly into the Studio Library).

## Use it
Open the Studio → **Library** → **Import .zip**, or drop \`${t.name}.css\` into a deck's \`themes/\`.
`;
}

function componentReadme(c: StudioComponent): string {
	return `# .${c.name} — a Lattice component

A local, palette-blind, scope-checked component for [Lattice](https://lattice.style).

## What's inside
- \`${c.name}.css\` — the \`.${c.name}\`-scoped styles (palette-blind).
- \`${c.name}.skeleton.md\` — a sample slide that invokes \`<!-- _class: ${c.name} -->\`.
- \`manifest.json\` — the asset envelope (re-imports into the Studio Library).

## Use it
Open the Studio → **Library** → **Import .zip**, then **Insert** it into any deck.
`;
}

function finishReadme(f: { name: string; label: string }): string {
	return `# ${f.label} — a Lattice finish

A palette-blind, export-safe surface finish for [Lattice](https://lattice.style).
Every color is a token; it recolors with the theme and bakes clean into PDF/PPTX.

## What's inside
- \`${f.name}.finish.css\` — the \`section.finish.finish-${f.name}\` rule (apply per slide with \`<!-- _class: finish finish-${f.name} -->\` or deck-wide with \`class: finish finish-${f.name}\`).
- \`${f.name}.recipe.json\` — the structured layer recipe (re-opens in the Finish faculty for re-editing).
- \`manifest.json\` — the asset envelope (re-imports into the Studio Library).

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
- \`${s.name}.scene.json\` — the canonical Anima scene spec (${engineOf(s.spec)} engine).
${s.poster ? `- \`${s.name}.poster.svg\` — the hero still (keeps \`var(--token)\`, so it recolors with the theme).\n` : ''}${s.art ? `- \`${s.name}.art.svg\` — the authored line-art the scene draws.\n` : ''}- \`manifest.json\` — the asset envelope (re-imports into the Studio Library).

## Use it
Open the Studio → **Library** → **Import .zip**, then place it via the scene component.
`;
}

// biome-ignore lint/suspicious/noExplicitAny: JSZip is dynamically imported.
async function jszip(): Promise<any> {
	const { default: JSZip } = await import('jszip');
	return new JSZip();
}

/** Pack ONE theme → a `.zip` Blob. `showcasePdf` (rendered by the caller) rides as `<slug>-showcase.pdf`. */
export async function packTheme(theme: StudioTheme, showcasePdf?: Blob | null): Promise<Blob> {
	const zip = await jszip();
	const item: ThemeItem = { kind: 'theme', name: theme.name, label: theme.label, essentials: theme.essentials, css: `${theme.name}.css` };
	zip.file(`${theme.name}.css`, theme.css);
	if (showcasePdf) {
		item.showcase = `${theme.name}-showcase.pdf`;
		zip.file(item.showcase, showcasePdf);
	}
	zip.file('manifest.json', JSON.stringify({ format: ASSET_FORMAT, kind: 'theme', items: [item] } satisfies AssetManifest, null, 2));
	zip.file('README.md', themeReadme(theme, !!showcasePdf));
	return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

/** Pack ONE component → a `.zip` Blob. */
export async function packComponent(c: StudioComponent): Promise<Blob> {
	const zip = await jszip();
	const item: ComponentItem = { kind: 'component', name: c.name, bucket: c.bucket, css: `${c.name}.css`, skeleton: `${c.name}.skeleton.md` };
	zip.file(item.css, c.css);
	zip.file(item.skeleton, c.skeleton);
	zip.file('manifest.json', JSON.stringify({ format: ASSET_FORMAT, kind: 'component', items: [item] } satisfies AssetManifest, null, 2));
	zip.file('README.md', componentReadme(c));
	return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

/** Pack ONE saved finish → a `.zip` Blob (CSS + recipe JSON + manifest). */
export async function packFinish(f: StudioFinish): Promise<Blob> {
	const zip = await jszip();
	const item: FinishItem = { kind: 'finish', name: f.name, label: f.label, css: `${f.name}.finish.css`, recipe: `${f.name}.recipe.json` };
	zip.file(item.css, f.css);
	zip.file(item.recipe, JSON.stringify(f.recipe, null, 2));
	zip.file('manifest.json', JSON.stringify({ format: ASSET_FORMAT, kind: 'finish', items: [item] } satisfies AssetManifest, null, 2));
	zip.file('README.md', finishReadme(f));
	return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

/** Pack ONE scene → a `.zip` Blob (spec JSON + optional poster/art SVG + manifest). */
export async function packScene(s: StudioScene): Promise<Blob> {
	const zip = await jszip();
	const item: SceneItem = { kind: 'scene', name: s.name, label: s.label, description: s.description, engine: engineOf(s.spec), spec: `${s.name}.scene.json` };
	zip.file(item.spec, JSON.stringify(s.spec, null, 2));
	if (s.poster) {
		item.poster = `${s.name}.poster.svg`;
		zip.file(item.poster, s.poster);
	}
	if (s.art) {
		item.art = `${s.name}.art.svg`;
		zip.file(item.art, s.art);
	}
	zip.file('manifest.json', JSON.stringify({ format: ASSET_FORMAT, kind: 'scene', items: [item] } satisfies AssetManifest, null, 2));
	zip.file('README.md', sceneReadme(s));
	return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

/** Pack a MIX of themes + components + finishes + scenes → one `lattice-assets.zip` Blob (sub-dir layout). */
export async function packBundle(themes: { theme: StudioTheme; showcase?: Blob | null }[], components: StudioComponent[], finishes: StudioFinish[] = [], scenes: StudioScene[] = []): Promise<Blob> {
	const zip = await jszip();
	const items: ManifestItem[] = [];
	for (const { theme, showcase } of themes) {
		const base = `themes/${theme.name}`;
		const item: ThemeItem = { kind: 'theme', name: theme.name, label: theme.label, essentials: theme.essentials, css: `${base}/${theme.name}.css` };
		zip.file(item.css, theme.css);
		if (showcase) {
			item.showcase = `${base}/${theme.name}-showcase.pdf`;
			zip.file(item.showcase, showcase);
		}
		items.push(item);
	}
	for (const c of components) {
		const base = `components/${c.name}`;
		zip.file(`${base}/${c.name}.css`, c.css);
		zip.file(`${base}/${c.name}.skeleton.md`, c.skeleton);
		items.push({ kind: 'component', name: c.name, bucket: c.bucket, css: `${base}/${c.name}.css`, skeleton: `${base}/${c.name}.skeleton.md` });
	}
	for (const f of finishes) {
		const base = `finishes/${f.name}`;
		zip.file(`${base}/${f.name}.finish.css`, f.css);
		zip.file(`${base}/${f.name}.recipe.json`, JSON.stringify(f.recipe, null, 2));
		items.push({ kind: 'finish', name: f.name, label: f.label, css: `${base}/${f.name}.finish.css`, recipe: `${base}/${f.name}.recipe.json` });
	}
	for (const s of scenes) {
		const base = `scenes/${s.name}`;
		const item: SceneItem = { kind: 'scene', name: s.name, label: s.label, description: s.description, engine: engineOf(s.spec), spec: `${base}/${s.name}.scene.json` };
		zip.file(item.spec, JSON.stringify(s.spec, null, 2));
		if (s.poster) {
			item.poster = `${base}/${s.name}.poster.svg`;
			zip.file(item.poster, s.poster);
		}
		if (s.art) {
			item.art = `${base}/${s.name}.art.svg`;
			zip.file(item.art, s.art);
		}
		items.push(item);
	}
	zip.file('manifest.json', JSON.stringify({ format: ASSET_FORMAT, kind: 'bundle', items } satisfies AssetManifest, null, 2));
	zip.file('README.md', `# Lattice asset bundle\n\n${themes.length} theme(s) + ${components.length} component(s) + ${finishes.length} finish(es) + ${scenes.length} scene(s). Import via the Studio → **Library** → **Import .zip**.\n`);
	return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

/** Read a `.zip` (single or bundle) back into themes + components + finishes ready to save. */
export async function unpackBundle(file: Blob): Promise<ParsedBundle> {
	const { default: JSZip } = await import('jszip');
	const zip = await JSZip.loadAsync(file);
	const manifestFile = zip.file('manifest.json');
	if (!manifestFile) throw new Error('Not a Lattice asset zip — manifest.json missing.');
	const manifest = JSON.parse(await manifestFile.async('string')) as AssetManifest;
	if (manifest.format !== ASSET_FORMAT) throw new Error(`Unsupported asset format: ${manifest.format}`);
	const out: ParsedBundle = { themes: [], components: [], finishes: [], scenes: [] };
	for (const item of manifest.items) {
		if (item.kind === 'theme') {
			const css = await zip.file(item.css)?.async('string');
			if (css) out.themes.push({ name: item.name, label: item.label, essentials: item.essentials ?? null, css });
		} else if (item.kind === 'component') {
			const css = await zip.file(item.css)?.async('string');
			const skeleton = await zip.file(item.skeleton)?.async('string');
			if (css && skeleton != null) out.components.push({ name: item.name, bucket: item.bucket ?? null, css, skeleton });
		} else if (item.kind === 'finish') {
			const css = await zip.file(item.css)?.async('string');
			const recipeText = await zip.file(item.recipe)?.async('string');
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
			const specText = await zip.file(item.spec)?.async('string');
			let parsed: unknown;
			try { parsed = specText ? JSON.parse(specText) : undefined; } catch { parsed = undefined; }
			const r = parseScene(parsed);
			if (r.ok) {
				const poster = item.poster ? await zip.file(item.poster)?.async('string') : undefined;
				const art = item.art ? await zip.file(item.art)?.async('string') : undefined;
				out.scenes.push({ name: item.name, label: item.label, description: item.description, spec: r.scene, poster: poster ?? undefined, art: art ?? undefined });
			}
		}
	}
	return out;
}
