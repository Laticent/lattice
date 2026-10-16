import { defineCollection, z } from 'astro:content';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';
import { glob } from 'astro/loaders';

// The CATALOG — one Markdown file per library (src/content/catalog/libraries/) and per
// author-facing plugin (src/content/catalog/plugins/). Each file is the single source for
// three surfaces: its card on the hub (/libraries/, /plugins/), the hero of its demo page,
// and its Learn page (/<kind>/<slug>/learn/). The body is the Learn page's prose and must
// carry the sections in REQUIRED_SECTIONS, in order (catalog.test.ts holds that line).
const link = z.object({ label: z.string(), href: z.string(), note: z.string().optional() });

const catalog = defineCollection({
	loader: glob({ pattern: '**/*.md', base: './src/content/catalog' }),
	schema: z.object({
		kind: z.enum(['library', 'plugin']),
		name: z.string(),
		order: z.number(),
		// The hub card and the hero headline. A promise in outcome terms, not a feature list.
		promise: z.string().max(80),
		// Two sentences under the headline: what it does for you.
		intro: z.string(),
		// "Use it when…" — the one-line problem the hub card leads with.
		useWhen: z.string(),
		// The hub's grouping, and the one line saying where Lattice itself uses this.
		group: z.string().optional(),
		inLattice: z.string().optional(),
		mark: z.string().optional(),
		facts: z.array(z.object({ k: z.string(), v: z.string() })),
		reference: z.array(link),
		// Plugins only: the examples the live demo cycles through, each one slide of Markdown.
		examples: z
			.array(z.object({ key: z.string(), label: z.string(), caption: z.string(), sample: z.string() }))
			.optional(),
		// Plugins only: the line an author types, shown on the hub card.
		syntax: z.string().optional(),
	}),
});

export const collections = {
	docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
	catalog,
};
