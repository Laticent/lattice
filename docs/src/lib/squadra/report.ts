// The two M1 reporters (design §12.2): `text` for people and `json` for tools. Every text field of
// a finding is data an author may have typed, so each reporter escapes it for its own format;
// SARIF, GitHub annotations and LSP land by M4.

import type { Finding, LintResult } from './types.js';

export const FORMAT = 1;

/** `{ format, findings, stats }`. Fixes appear as `{ engine, safety, description, edits }`. */
export function reportJson(result: LintResult): string {
	return JSON.stringify({ format: FORMAT, findings: result.findings, stats: result.stats }, null, 2);
}

// Control characters other than tab, plus the bidirectional overrides that can make a line read
// differently from what it contains, are shown as escapes so a message cannot redraw the terminal.
function unsafe(c: number): boolean {
	return (c < 0x20 && c !== 0x09 && c !== 0x0a) || (c >= 0x7f && c <= 0x9f) || (c >= 0x202a && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069);
}
function plain(s: string): string {
	let out = '';
	for (const ch of s) {
		const c = ch.charCodeAt(0);
		out += unsafe(c) ? `\\u${c.toString(16).padStart(4, '0')}` : ch;
	}
	return out;
}

/** Grouped by file, with the source line and a caret under the span. */
export function reportText(result: LintResult, sources: ReadonlyMap<string, string> = new Map()): string {
	const byPath = new Map<string, Finding[]>();
	for (const f of result.findings) {
		const list = byPath.get(f.path) ?? [];
		list.push(f);
		byPath.set(f.path, list);
	}
	const out: string[] = [];
	for (const [path, list] of byPath) {
		out.push(plain(path || '(ruleset)'));
		const lines = sources.get(path)?.split('\n');
		for (const f of list) {
			const fixable = f.fixes.some((x) => x.edits) ? ' (fixable)' : '';
			out.push(`  ${f.start.line}:${f.start.column}  ${f.severity}  ${plain(f.message)}  ${f.rule}${fixable}`);
			const src = lines?.[f.start.line - 1];
			if (src !== undefined) {
				const width = f.end.line === f.start.line ? Math.max(1, f.end.column - f.start.column) : Math.max(1, src.length - f.start.column + 1);
				out.push(`      ${plain(src)}`, `      ${' '.repeat(f.start.column - 1)}${'^'.repeat(width)}`);
			}
			if (f.hint) out.push(`      ${plain(f.hint)}`);
		}
	}
	const counts = { error: 0, warning: 0, suggestion: 0, info: 0 };
	for (const f of result.findings) counts[f.severity]++;
	out.push(`${result.findings.length} finding${result.findings.length === 1 ? '' : 's'}: ${counts.error} error, ${counts.warning} warning, ${counts.suggestion} suggestion, ${counts.info} info`);
	return `${out.join('\n')}\n`;
}
