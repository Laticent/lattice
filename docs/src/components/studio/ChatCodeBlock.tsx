import { Check, Copy } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { type CodeToken, tokenColor, tokenize } from './chat-highlight';

// A fenced code block in an Architect reply. Rendered as a REACT component (NOT inside
// the sanitized prose innerHTML) for two reasons the adversarial trio surfaced:
//  1. XSS — each highlighted token is an escaped React text child, so model-authored
//     code can never become live HTML (no post-sanitize innerHTML write path).
//  2. The Copy button is a real <button> OUTSIDE any sanitized string, so a DOMPurify
//     profile (which strips <button> + data-attrs) can't delete it.
// The code string lives in React state/props; Copy reads it directly. Highlighting is
// on-brand via the shared lezer highlighter (chat-highlight.ts), colored with palette
// var()s — no highlight.js, no injected stylesheet.
export function ChatCodeBlock({ code, lang }: { code: string; lang: string }) {
	const [copied, setCopied] = React.useState(false);
	const tokens: CodeToken[] = React.useMemo(() => tokenize(code, lang), [code, lang]);
	const copy = async () => {
		try {
			await navigator.clipboard.writeText(code);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1400);
		} catch {
			/* clipboard blocked — no-op */
		}
	};
	return (
		<div className="my-1.5 overflow-hidden rounded-lg border border-border bg-[var(--bg-alt)]">
			<div className="flex items-center justify-between gap-2 border-b border-border px-2.5 py-1">
				<span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{lang || 'code'}</span>
				<button
					type="button"
					onClick={copy}
					aria-label={copied ? 'Copied' : 'Copy code'}
					className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold text-muted-foreground transition-colors hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
				>
					{copied ? <Check className="size-3 text-[var(--chart-3,#2e6f00)]" /> : <Copy className="size-3" />}
					{copied ? 'Copied' : 'Copy'}
				</button>
			</div>
			<pre className="overflow-x-auto px-2.5 py-2 font-mono text-[11.5px] leading-relaxed text-[var(--text-body)]">
				<code>
					{tokens.map((t, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: static token list for one render.
						<span key={i} style={tokenColor(t.cls) ? { color: tokenColor(t.cls) } : undefined}>
							{t.text}
						</span>
					))}
				</code>
			</pre>
		</div>
	);
}

// Shared visual language for an inline mini-diff/apply surface reused across chat +
// coach. Kept here so both import one implementation. (See DiffCard in ArchitectChat.)
export const codeBlockClass = cn('rounded-lg border border-border');
