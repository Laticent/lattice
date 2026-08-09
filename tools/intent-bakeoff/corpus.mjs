// Evaluation corpus for the component intent ranker — harvested, not authored.
//
// Every slide in the committed decks pairs real prose with the component that
// actually renders it (`<!-- _class: X -->`), so ground truth is exact and the
// language is the project's own rather than something written to flatter a
// ranker. A SHA-1 of each pair assigns it to `dev` or `test` deterministically:
// tuning may look only at `dev`, and adding decks never reshuffles the split.
//
// KNOWN LIMITS, so nobody over-reads the numbers this feeds:
//   · a slide's prose is what the author WROTE, not what they'd TYPE to find it;
//   · labels are ambiguous — compare-prose / compare-table / split-compare are
//     all right for the same text, and only one is credited;
//   · committed decks contain no typos and use house vocabulary, so this corpus
//     cannot measure typo repair or synonym expansion at all.
// Treat it as a robustness floor, and read it beside the authored query sets.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Strip markdown/HTML noise down to the words a person would read aloud. */
function clean(text) {
	return text
		.replace(/<!--[\s\S]*?-->/g, ' ')
		.replace(/```[\s\S]*?```/g, ' ')
		.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/[#*_>`|:-]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

const CAP_PER_COMPONENT = 12; // so `title`/`content` (in every deck) can't dominate

/**
 * @param {string} root repo root
 * @param {Set<string>} names valid component names
 * @returns {{component:string,heading:string,full:string,file:string,split:'dev'|'test'}[]}
 */
export function buildCorpus(root, names) {
	const dirs = [join(root, 'examples'), join(root, 'test/integration/baseline-decks'), join(root, 'test/fixtures')];
	const files = dirs.flatMap((d) => {
		try {
			return readdirSync(d)
				.filter((f) => f.endsWith('.md'))
				.map((f) => join(d, f));
		} catch {
			return [];
		}
	});

	const pairs = [];
	for (const file of files) {
		for (const block of readFileSync(file, 'utf8').split(/^---\s*$/m)) {
			const m = block.match(/<!--\s*_class:\s*([^>]*?)\s*-->/);
			if (!m) continue;
			const component = m[1].trim().split(/\s+/)[0];
			if (!names.has(component)) continue;
			const full = clean(block);
			if (full.length < 12) continue;
			const h = block.match(/^#{1,3}\s+(.+)$/m);
			pairs.push({ component, heading: h ? clean(h[1]) : '', full: full.slice(0, 400), file: file.replace(`${root}/`, '') });
		}
	}

	const seen = new Map();
	const kept = [];
	for (const p of pairs.sort((a, b) => (a.heading + a.full).localeCompare(b.heading + b.full))) {
		const n = seen.get(p.component) || 0;
		if (n >= CAP_PER_COMPONENT) continue;
		seen.set(p.component, n + 1);
		p.split = parseInt(createHash('sha1').update(p.component + p.full).digest('hex').slice(0, 8), 16) % 2 === 0 ? 'dev' : 'test';
		kept.push(p);
	}
	return kept;
}
