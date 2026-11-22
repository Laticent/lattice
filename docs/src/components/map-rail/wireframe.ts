// A WIREFRAME OF ONE SLIDE, read from its Markdown.
//
// A map tile that has no picture yet still has to say what the slide is. This reads a slide's source
// (no engine, no render) and returns its title, its component class and the shape of its body as a
// short list of blocks, which `MapRail` draws as grey shapes. It is a sketch, not a layout: it costs
// a few microseconds, so the rail can draw hundreds of them while the real pictures load.
//
// The sketch is read from the SOURCE on purpose. The rendered slide is what the live tier shows; this
// tier exists for the units that have no render yet, so it must not need one.

import { readMetaField } from '../../../../lib/core/meta-edit.mjs';

export type Block = 'text' | 'list' | 'table' | 'image' | 'code' | 'quote';

export interface Wire {
	/** The first heading, as plain text; empty when the slide has none. */
	title: string;
	/** The first word of the slide's class (a `_class` comment or a record's `layout`), or ''. */
	kind: string;
	/** The body, top to bottom, at most `MAX_BLOCKS`. */
	blocks: readonly Block[];
}

export const MAX_BLOCKS = 5;

const CACHE_CAP = 4096;
const cache = new Map<string, Wire>();

const FENCE = /^\s*(```|~~~)/;

function plain(heading: string): string {
	return heading
		.replace(/^#{1,6}\s+/, '')
		.replace(/\s+#+\s*$/, '')
		.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
		.replace(/\[([^\]]*)\]\((?:[^()]|\([^()]*\))*\)/g, '$1')
		.replace(/[*_`~]/g, '')
		.trim();
}

/** The wireframe of one slide's Markdown. Memoized by text. */
export function wireOf(markdown: string): Wire {
	const hit = cache.get(markdown);
	if (hit) return hit;
	let title = '';
	const blocks: Block[] = [];
	const push = (b: Block) => {
		// A run of the same block is one block: five bullets are one list, three lines one paragraph.
		if (blocks[blocks.length - 1] !== b && blocks.length < MAX_BLOCKS) blocks.push(b);
	};
	let inFence = false;
	for (const line of markdown.split('\n')) {
		if (FENCE.test(line)) {
			if (!inFence) push('code');
			inFence = !inFence;
			continue;
		}
		if (inFence) continue;
		const trimmed = line.trim();
		if (!trimmed) continue;
		if (trimmed.startsWith('<!--')) continue;
		if (/^#{1,6}\s/.test(trimmed)) {
			if (!title) title = plain(trimmed);
			else push('text');
			continue;
		}
		if (/^!\[/.test(trimmed)) push('image');
		else if (/^([-*+]|\d+[.)])\s/.test(trimmed)) push('list');
		else if (trimmed.startsWith('|')) push('table');
		else if (trimmed.startsWith('>')) push('quote');
		else if (/^`[^`]*`$/.test(trimmed) && !title) continue; // an eyebrow line above the title
		else push('text');
	}
	// The layout is the first word of the class the engine applies, comment or record (`@meta{layout=cards}`).
	const kind = readMetaField(markdown, 'class').value.trim().split(/\s+/)[0] || '';
	const wire: Wire = { title, kind, blocks };
	if (cache.size >= CACHE_CAP) cache.clear();
	cache.set(markdown, wire);
	return wire;
}
