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
// COST. Mermaid is ~1MB, so it is loaded LAZILY and only for a deck that actually
// contains a diagram — a deck with no ```mermaid fence never pays. It is the same
// locally-vendored `mermaid-v11.min.js` the preview and the export bundle use (our own
// origin, never a CDN — offline / strict-CSP safe), so no new asset ships.
//
// This is a RENDER diagnostic, not an authoring lint rule: it needs the Mermaid library,
// which `lib/authoring/lint-core.js` cannot take (pure, fs-free, shared with the CLI). So
// it deliberately does NOT become a lint finding — it rides its own grounding channel.
// See engineering/decisions/2026-08-04-chat-edit-protocol.md.

import { splitTopLevel } from '@/components/studio/ai/architect-edits.js';

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
		for (let k = 0; k < lines.length; k++) {
			// An OPENER whose info-string is `mermaid`. The closer must be the same marker,
			// at least as long, and bare — CommonMark, the same rule the edit parser follows.
			const open = /^[ \t]{0,3}(`{3,}|~{3,})[ \t]*mermaid[ \t]*$/.exec(lines[k]);
			if (!open) continue;
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

// The loaded library, memoized. `null` once a load has definitively failed, so a deck on a
// broken/offline asset path doesn't re-inject a script on every debounce tick.
type MermaidLib = { initialize: (o: unknown) => void; parse: (t: string) => Promise<unknown> };
let mermaidPromise: Promise<MermaidLib | null> | null = null;

/** Load the locally-vendored Mermaid once, resolving to the library (or null if it can't
 *  be had — a diagnostic that can't run reports nothing, it never guesses). */
function loadMermaid(url: string): Promise<MermaidLib | null> {
	if (mermaidPromise) return mermaidPromise;
	mermaidPromise = new Promise<MermaidLib | null>((resolve) => {
		const existing = (globalThis as { mermaid?: MermaidLib }).mermaid;
		if (existing?.parse) return resolve(existing);
		if (typeof document === 'undefined') return resolve(null);
		const s = document.createElement('script');
		s.src = url;
		s.async = true;
		s.onload = () => {
			const lib = (globalThis as { mermaid?: MermaidLib }).mermaid;
			if (!lib?.parse) return resolve(null);
			// startOnLoad off: we are parsing, never rendering, and an auto-render pass in the
			// PARENT page would walk the Studio's own DOM looking for diagrams to draw.
			try {
				lib.initialize({ startOnLoad: false });
			} catch {
				/* already initialized by another consumer — fine */
			}
			resolve(lib);
		};
		s.onerror = () => resolve(null);
		document.head.appendChild(s);
	});
	return mermaidPromise;
}

/**
 * Mermaid's thrown error, reduced to the part that helps. Its parse errors look like:
 *
 *     Parse error on line 3:
 *     ...ass Order {    +id
 *     ---------------------^
 *     Expecting 'STRUCT_STOP', 'MEMBER', got 'EOF_IN_STRUCT'
 *
 * The WHERE is the first line and the WHAT is the last; the middle two are an ASCII
 * caret diagram that survives no useful reformatting into a prompt. Taking the first
 * line alone (the obvious reduction) yields a bare "Parse error on line 3:" — a location
 * with no diagnosis, which is barely better than the guessing this replaces. So keep
 * both ends and drop the caret art.
 */
export function parseErrorMessage(e: unknown): string {
	const raw = String((e as { message?: string })?.message ?? String(e));
	const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
	if (!lines.length) return 'Failed to parse.';
	const detail = lines.find((l) => /^(Expecting|Unrecognized|Syntax error)/i.test(l));
	const head = lines[0];
	return (detail && detail !== head ? `${head} ${detail}` : head).slice(0, 240);
}

/**
 * Parse every diagram in the deck and report the ones Mermaid rejects. Resolves to an
 * EMPTY list when the deck has no diagrams, or when the library can't be loaded — the
 * chat is then exactly as grounded as it was before, never worse and never invented.
 */
export async function checkDiagrams(source: string, mermaidUrl: string): Promise<DiagramError[]> {
	const diagrams = extractDiagrams(source);
	if (!diagrams.length || !mermaidUrl) return [];
	const lib = await loadMermaid(mermaidUrl);
	if (!lib) return [];
	const errors: DiagramError[] = [];
	for (const d of diagrams) {
		try {
			await lib.parse(d.code);
		} catch (e) {
			errors.push({ slide: d.slide, message: parseErrorMessage(e) });
		}
	}
	return errors;
}
