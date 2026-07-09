import { numberToWords, toSpokenText } from '@/lib/cadenza';

// Chart narration — a small, deliberately narrow pilot for slide classes whose
// real insight is a COMPUTED relationship (a conversion rate, a delta) that
// exists only in the rendered chart, never in the raw slide Markdown
// `slideToSpeech` reads. Today: `funnel` — its stage-to-stage conversion % is
// computed at render time by `lib/components/chart/funnel/funnel.transform.js`
// and burned straight into SVG text, so it's never present anywhere in the
// slide source a narrator could read.
//
// Studio's read-aloud only ever has the slide's raw Markdown (no rendered
// HTML) at the point narration is built (see PresentOverlay.tsx), so this
// re-derives the SAME stage/value parse the funnel kernel does, directly off
// the Markdown list syntax `slideToSpeech` already understands — one
// unindented "`- Label \`value\`" line per stage, no HTML walker needed.
//
// This is a pilot, not a generic engine: a manifest-schema-driven
// "spokenTemplate" covering the whole chart family is deliberately deferred —
// speculative genericity for a pattern proven exactly once. See
// engineering/decisions/2026-07-09-cadenza-narration-quality.md §3.2.

type Stage = { label: string; value: number; valueSpoken: string };

const CLASS_DIRECTIVE = /<!--\s*_class:\s*([^>]*?)\s*-->/i;

/**
 * Does the slide's `_class:` directive carry `token` as one of its
 * space-separated words? `_class: funnel` may carry a base modifier (`funnel
 * dark`, `funnel compact`, `funnel accent` — lib/base/base.docs.md; see
 * funnel.gallery.md), so this checks token membership, not the exact string —
 * and, unlike a `\bfunnel\b` regex, correctly does NOT match a hyphenated
 * class like `funnel-detail` (a `\b` word boundary sits on either side of a
 * hyphen too, so it would otherwise false-positive on that substring).
 */
function hasClassToken(markdown: string, token: string): boolean {
	const m = markdown.match(CLASS_DIRECTIVE);
	if (!m) return false;
	return m[1].split(/\s+/).includes(token);
}

// A top-level (unindented) stage line: `- Label `value``. An INDENTED line
// (leading whitespace before the dash) is a stage's optional detail sublist —
// not itself a stage — so this intentionally matches against the raw line,
// not its trimmed form.
const STAGE_LINE = /^- (.+?)\s*`([^`]+)`\s*$/;

/**
 * Blank out fenced code block bodies. A slide demonstrating funnel syntax as a
 * doc example (inside a fence) must not be mistaken for an actual funnel slide
 * — used before every check below (class, heading, stages) so they all agree
 * on what's fenced instead of each tracking it separately.
 */
function withoutFences(markdown: string): string {
	const out: string[] = [];
	let inFence = false;
	for (const line of markdown.split('\n')) {
		if (/^```/.test(line.trim())) {
			inFence = !inFence;
			out.push('');
			continue;
		}
		out.push(inFence ? '' : line);
	}
	return out.join('\n');
}

function parseFunnelStages(markdown: string): Stage[] {
	const stages: Stage[] = [];
	for (const raw of markdown.split('\n')) {
		const m = STAGE_LINE.exec(raw);
		if (!m) continue;
		const label = m[1]
			.replace(/[*_~`]/g, '')
			.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // link/image label, drop the URL
			.trim();
		const value = Number(m[2].replace(/,/g, '').replace(/[^0-9.-]/g, ''));
		if (!label || !Number.isFinite(value)) continue;
		stages.push({ label, value, valueSpoken: toSpokenText(m[2]) });
	}
	return stages;
}

/** The slide's heading (`## …`), spoken-ready with a terminator, or ''. */
function heading(markdown: string): string {
	const m = markdown.match(/^##\s+(.+)$/m);
	if (!m) return '';
	const h = m[1].replace(/`([^`]*)`/g, '$1').trim();
	return /[.!?;:,…]\s*$/.test(h) ? h : `${h}.`;
}

/**
 * Narrate a `funnel` slide's stages AND the stage-to-stage conversion rate the
 * transform computes at render time — the exact number `slideToSpeech`'s
 * generic Markdown flatten never sees, because it's derived, never authored.
 * Returns null for a non-funnel slide or one with fewer than two stages
 * (mirrors `funnel.transform.js`'s own `stages.length < 2` bailout).
 */
export function narrateFunnel(markdown: string): string | null {
	const md = withoutFences(String(markdown || ''));
	if (!hasClassToken(md, 'funnel')) return null;
	const stages = parseFunnelStages(md);
	if (stages.length < 2) return null;
	const parts: string[] = [];
	const h = heading(md);
	if (h) parts.push(h);
	stages.forEach((s, i) => {
		let line = `${s.label}: ${s.valueSpoken}`;
		if (i > 0 && stages[i - 1].value > 0) {
			const pct = Math.round((s.value / stages[i - 1].value) * 100);
			line += `, ${numberToWords(pct)} percent of the prior stage`;
		}
		parts.push(`${line}.`);
	});
	return parts.join(' ');
}

/** One entry per pilot-covered chart class — the next component is a small addition here. */
const NARRATORS: Array<(markdown: string) => string | null> = [narrateFunnel];

/** Try each chart narrator in turn; the first that recognizes the slide wins. */
export function narrateChart(markdown: string): string | null {
	for (const narrate of NARRATORS) {
		const result = narrate(markdown);
		if (result) return result;
	}
	return null;
}
