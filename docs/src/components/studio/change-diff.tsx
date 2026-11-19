import * as React from 'react';
import { cn } from '@/lib/utils';

// THE CHANGE CARD'S DIFF, in plain words. Board authors read a slide, not its Markdown, so by default the
// diff drops the Markdown markers (`##`, `- `, backticks, directive comments) and marks changed WORDS. A line
// that is mostly rewritten shows whole, old struck and new under it, because interleaved word marks on a
// rewrite read as noise (UI/UX review, engineering/decisions/2026-11-19-chat-card-apply-undo.md §8). A new
// slide is just its text. `source` shows the raw Markdown instead, for authors who want it.

/** A slide's visible text: no directive comments, heading marks, list dashes or backticks. Display only, never a sanitizer. */
export function plainText(md: string): string {
	return md
		.split('\n')
		.filter((l) => !l.trimStart().startsWith('<!--'))
		.map((l) => l.replace(/^#{1,6}\s+/, '').replace(/^\s*[-*]\s+/, '• ').replace(/`/g, ''))
		.filter((l) => l.trim())
		.join('\n');
}

export type WordSeg = { t: string; k: 'same' | 'add' | 'del' };

/** A word-level LCS diff of two lines, whitespace kept as its own tokens. */
export function wordDiff(a: string, b: string): WordSeg[] {
	const A = a.split(/(\s+)/);
	const B = b.split(/(\s+)/);
	const L = Array.from({ length: A.length + 1 }, () => new Array<number>(B.length + 1).fill(0));
	for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
	const out: WordSeg[] = [];
	const push = (t: string, k: WordSeg['k']) => {
		const last = out[out.length - 1];
		if (last && last.k === k) last.t += t;
		else out.push({ t, k });
	};
	let i = 0;
	let j = 0;
	while (i < A.length && j < B.length) {
		if (A[i] === B[j]) {
			push(A[i++], 'same');
			j++;
		} else if (L[i + 1][j] >= L[i][j + 1]) push(A[i++], 'del');
		else push(B[j++], 'add');
	}
	while (i < A.length) push(A[i++], 'del');
	while (j < B.length) push(B[j++], 'add');
	return out;
}

const ADD = 'rounded-sm bg-[var(--accent-soft)] px-0.5 font-medium text-foreground no-underline';
const DEL = 'text-muted-foreground decoration-[var(--fail)]';

/** One edit's change, line by line. `before` is empty for a new slide, `after` empty for a removed one. */
export function ChangeDiff({ before, after, source = false }: { before: string; after: string; source?: boolean }) {
	const lines = React.useMemo(() => {
		const a = (source ? before : plainText(before)).split('\n').filter((l) => l.trim());
		const b = (source ? after : plainText(after)).split('\n').filter((l) => l.trim());
		return Array.from({ length: Math.max(a.length, b.length) }, (_, k) => ({ a: a[k] ?? '', b: b[k] ?? '' }));
	}, [before, after, source]);
	const fresh = !before.trim();
	const gone = !after.trim();
	return (
		<div className={cn('flex flex-col gap-0.5 pb-1 text-[12.5px] leading-relaxed text-foreground', source && 'font-mono text-[11px]')}>
			{lines.map(({ a, b }, k) => {
				const key = `${k}:${a}:${b}`;
				if (fresh) return <div key={key}>{b}</div>;
				if (gone)
					return (
						<del key={key} className={cn(DEL, 'block')}>
							{a}
						</del>
					);
				if (a === b) return <div key={key}>{b}</div>;
				if (!a)
					return (
						<ins key={key} className={cn(ADD, 'block w-fit')}>
							{b}
						</ins>
					);
				if (!b)
					return (
						<del key={key} className={cn(DEL, 'block')}>
							{a}
						</del>
					);
				const segs = wordDiff(a, b);
				const kept = segs.filter((x) => x.k === 'same').reduce((n, x) => n + x.t.split(/\s+/).filter(Boolean).length, 0);
				const words = Math.max(a.split(/\s+/).filter(Boolean).length, b.split(/\s+/).filter(Boolean).length);
				// Mostly rewritten: word marks would interleave into noise, so show the two lines whole.
				if (kept / words < 0.5)
					return (
						<div key={key}>
							<del className={cn(DEL, 'block')}>{a}</del>
							<ins className={cn(ADD, 'block w-fit')}>{b}</ins>
						</div>
					);
				return (
					<div key={key}>
						{segs.map((x, m) =>
							x.k === 'same' ? (
								// biome-ignore lint/suspicious/noArrayIndexKey: a static diff.
								<span key={m}>{x.t}</span>
							) : x.k === 'add' ? (
								// biome-ignore lint/suspicious/noArrayIndexKey: a static diff.
								<ins key={m} className={ADD}>
									{x.t}
								</ins>
							) : x.t.trim() ? (
								// biome-ignore lint/suspicious/noArrayIndexKey: a static diff.
								<del key={m} className={DEL}>
									{x.t}
								</del>
							) : null,
						)}
					</div>
				);
			})}
		</div>
	);
}
