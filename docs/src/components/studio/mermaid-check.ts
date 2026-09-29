// Real diagram diagnostics, from Mermaid itself.
//
// WHY THIS EXISTS. The Architect was asked "are these diagrams correct?" and had no way
// to find out: no shell, no renderer, no parser. So it guessed, then described the guess
// as a test result ("I've tested all 14 diagrams with mmdc and confirmed they render
// cleanly"). The prompt now forbids that claim — but forbidding a fabrication only
// converts it into "I don't know". This module supplies the answer instead.
//
// The runtime ALREADY knows: it attaches a `.mermaid-error` box carrying Mermaid's own
// parse message next to every diagram that fails (lib/runtime/index.js). That knowledge
// was unreachable from the chat for two reasons — it lives inside the preview iframe, and
// the Studio's live preview renders only the CURRENT slide, so it can never account for a
// deck. Rather than scrape a frame that only knows one slide, ask the parser directly.
//
// COST. Mermaid is ~3MB, so it is loaded LAZILY and only for a deck that actually
// contains a diagram — a deck with no ```mermaid fence never pays. It is the same file the
// preview frames load: the Mermaid plugin's payload, staged beside `lattice-runtime.js`
// (`drawnLibraryUrl`, lib/plugins/drawn-library.mjs — our own origin, never a CDN — offline /
// strict-CSP safe), so no new asset ships and no page threads its address.
//
// This is a RENDER diagnostic, not an authoring lint rule: it needs the Mermaid library,
// which `lib/authoring/lint-core.js` cannot take (pure, fs-free, shared with the CLI). So
// it deliberately does NOT become a lint finding — it rides its own grounding channel.
// See engineering/decisions/2026-08-04-chat-edit-protocol.md.

import { splitTopLevel } from '@/components/studio/ai/architect-edits.js';

// THE PARSE HALF LIVES IN `mermaid-parse.ts`, loaded on demand. This file — the diagram
// extraction the Studio's signature memo reads on every render — is in the Studio's startup
// JavaScript; the library loader and the parse loop run only 900ms after a deck with a diagram
// settles, so they stay out of it (docs/route-budget.json).

/** One diagram that failed to parse, addressed by the same 1-based slide number the
 *  preview, the findings, and the edit protocol all use. */
export type DiagramError = { slide: number; message: string };

/** A ```mermaid fence found in the deck, with the slide it sits on. */
export type Diagram = { slide: number; code: string };

const FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/;

/**
 * Every ```mermaid (or ~~~mermaid) fence in the deck, with its 1-based REAL slide number
 * (front matter excluded), matching how every other Studio surface addresses a slide.
 * Pure — no DOM, no network — so the extraction half is testable headless.
 */
export function extractDiagrams(source: string): Diagram[] {
	const src = String(source || '');
	const chunks = splitTopLevel(src);
	const real = FRONT_MATTER.test(src) ? chunks.slice(2) : chunks;
	const out: Diagram[] = [];
	real.forEach((chunk, i) => {
		const lines = String(chunk).split('\n');
		// Outer-fence state. A slide that DOCUMENTS a diagram — a ```mermaid block nested
		// inside a ````markdown block — has no diagram the renderer will ever draw, but the
		// first pass extracted the sample anyway and told the model, authoritatively, to fix
		// a deliberately-broken teaching example (red team). This is the same fence-blindness
		// `splitTopLevel` exists to avoid, so track the enclosing fence the same way.
		let outer = null;
		for (let k = 0; k < lines.length; k++) {
			if (outer) {
				if (new RegExp(`^[ \\t]{0,3}[${outer[0]}]{${outer.length},}[ \\t]*$`).test(lines[k])) outer = null;
				continue;
			}
			// An OPENER whose info-string is `mermaid`. The closer must be the same marker,
			// at least as long, and bare — CommonMark, the same rule the edit parser follows.
			const open = /^[ \t]{0,3}(`{3,}|~{3,})[ \t]*mermaid[ \t]*$/.exec(lines[k]);
			if (!open) {
				// Any OTHER fence opener encloses whatever follows.
				const other = /^[ \t]{0,3}(`{3,}|~{3,})[ \t]*\S/.exec(lines[k]);
				if (other) outer = other[1];
				continue;
			}
			const fence = open[1];
			const closes = new RegExp(`^[ \\t]{0,3}[${fence[0]}]{${fence.length},}[ \\t]*$`);
			let end = k + 1;
			while (end < lines.length && !closes.test(lines[end])) end++;
			const code = lines.slice(k + 1, end).join('\n').trim();
			if (code) out.push({ slide: i + 1, code });
			k = end;
		}
	});
	return out;
}
