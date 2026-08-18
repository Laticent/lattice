// The Studio's component catalog payload — ONE builder, two consumers.
//
// Built at BUILD TIME from the committed machine manifest (`dist/docs/components.json`)
// and trimmed to what the Studio actually needs: the insert palette, the Lattice primer,
// the reader-lens suggester, and the per-slide drawer's validity data.
//
// WHY IT IS A MODULE AND NOT INLINE IN studio.astro (2026-08-17 loading audit §5, §9.3):
// this payload is ~180KB raw / ~35KB gz, and serialized into the island's `props`
// attribute it made up 72% of a 433KB HTML document — parse-blocking work on every
// launch, to serve a gallery the user may never open. It is now emitted ONCE as a
// static asset (`src/pages/studio/component-catalog.json.ts`) and fetched after
// hydration, while `studio.astro` inlines only the NAME list (~1KB), which is the one
// part the editor's lint needs from the first frame.
//
// Resolve from process.cwd() (docs/ at build), NOT import.meta.url — under `astro build`
// the caller's frontmatter is bundled into a chunk whose URL no longer sits at src/pages/,
// so a relative walk misses and the catch silently empties the catalog.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pickGrammarVariants } from '../components/studio/ai/architect-knowledge.js';

/** The trimmed component catalog, or [] when the manifest cannot be read. */
export function buildStudioCatalog() {
	try {
		const catalog = JSON.parse(readFileSync(join(process.cwd(), '..', 'dist/docs/components.json'), 'utf8'));
		// Variants whose AUTHORING GRAMMAR differs from the base skeleton (e.g.
		// `list-tabular metric` → ``1. Name `value```) are not in components.json — they are
		// derived from the live manifest by `pickGrammarVariants`. The primer's authoring rules
		// TELL the model to match a variant's own skeleton when one is shown, so shipping the
		// primer without these instructs it to look for content that is never there.
		let variantSkeletonsByName = {};
		try {
			const req = createRequire(import.meta.url);
			const { loadAll } = req(join(process.cwd(), '..', 'lib/components', 'index.js'));
			for (const m of loadAll()) {
				const picked = pickGrammarVariants(m);
				if (picked?.length) variantSkeletonsByName[m.name] = picked;
			}
		} catch {
			variantSkeletonsByName = {};
		}
		return (catalog.components || [])
			.map((c) => ({
				name: c.name,
				bucket: c.bucket,
				// The semantic role axes the reader-lens suggester keys off (function/form).
				function: c.function || '',
				form: c.form || '',
				// The add-slide gallery (SlidePicker) filters on these + shows `purpose` in its
				// detail rail; without them the shared search core throws on undefined `tags`.
				substance: c.substance || '',
				tags: Array.isArray(c.tags) ? c.tags : [],
				purpose: c.purpose || '',
				description: c.description || '',
				// The Lattice primer (architect-knowledge.js `layoutBlock`) reads `summary`,
				// `slots`, `capacity` and `variantSkeletons`. `slots` needs reshaping:
				// components.json keys it by slot name, the primer walks an array.
				summary: c.description || '',
				...(c.capacity ? { capacity: c.capacity } : {}),
				slots: Object.entries(c.slots || {}).map(([slotName, v]) => ({
					name: slotName,
					required: !!v.required,
					description: String(v.description || '').slice(0, 240),
				})),
				...(variantSkeletonsByName[c.name] ? { variantSkeletons: variantSkeletonsByName[c.name] } : {}),
				// Prose-density budget (axis/soft/hard). The engine review's density findings key
				// off it via `densityOf`; without it those findings vanish from the assessment.
				...(c.density ? { density: c.density } : {}),
				skeleton: String(c.skeleton || ''),
				// Per-component validity data for the per-slide drawer: which variants / family
				// modifiers / axes this layout accepts, so the drawer only offers controls that
				// resolve at render time (never a disabled graveyard).
				variants: Array.isArray(c.variants) ? c.variants : [],
				...(Array.isArray(c.variantAxes) && c.variantAxes.length ? { variantAxes: c.variantAxes } : {}),
				effectiveVariants: Array.isArray(c.effectiveVariants) ? c.effectiveVariants : [],
				familyModifiers: Array.isArray(c.familyModifiers) ? c.familyModifiers : [],
				...(Array.isArray(c.focusAxes) && c.focusAxes.length ? { focusAxes: c.focusAxes } : {}),
			}))
			.filter((c) => c.name && c.skeleton);
	} catch {
		return [];
	}
}
