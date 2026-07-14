// Per-slide comments UI — the review layer (add / show / resolve / delete),
// rendered inside the "This slide" drawer's Comments tab. Comments are app state
// (slide-comments.ts), distinct from the speaker note and the accessibility
// description. They are NOT part of the deck markdown and are not exported by
// default. See engineering/decisions/2026-07-04-comments-layer.md.

import { Check, MessageSquarePlus, RotateCcw, Trash2 } from 'lucide-react';
import * as React from 'react';
import { Tip } from '@/components/ui/tooltip';
import { addComment, COMMENTS_EVENT, commentsForSlide, deleteComment, setResolved } from './slide-comments';

function timeAgo(ts: number, now: number): string {
	const s = Math.max(0, Math.round((now - ts) / 1000));
	if (s < 60) return 'just now';
	const m = Math.round(s / 60);
	if (m < 60) return `${m}m ago`;
	const h = Math.round(m / 60);
	if (h < 24) return `${h}h ago`;
	return `${Math.round(h / 24)}d ago`;
}

export function SlideComments({ deckId, slide }: { deckId: string; slide: number }) {
	// Re-read on any comment change (this or another view mutated the deck's comments).
	const [tick, setTick] = React.useState(0);
	React.useEffect(() => {
		const h = () => setTick((t) => t + 1);
		window.addEventListener(COMMENTS_EVENT, h);
		return () => window.removeEventListener(COMMENTS_EVENT, h);
	}, []);
	// biome-ignore lint/correctness/useExhaustiveDependencies: re-read on tick (comment mutations) + slide change.
	const comments = React.useMemo(() => commentsForSlide(deckId, slide), [deckId, slide, tick]);
	const [draft, setDraft] = React.useState('');
	const now = Date.now();

	const add = () => {
		if (addComment(deckId, slide, draft)) setDraft('');
	};

	const open = comments.filter((c) => !c.resolved);
	const resolved = comments.filter((c) => c.resolved);

	return (
		<div className="py-1">
			<div className="mb-3">
				<textarea
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); add(); } }}
					aria-label="New comment for this slide"
					placeholder="Leave a review note on this slide — e.g. “Double-check this figure before the board.”"
					className="min-h-[64px] w-full resize-none rounded-lg border border-border bg-background p-2.5 text-[13px] leading-relaxed text-foreground outline-none focus:border-[var(--accent)]"
				/>
				<div className="mt-1.5 flex items-center justify-between">
					<span className="text-[10.5px] text-muted-foreground">⌘↵ to add</span>
					<button
						type="button"
						onClick={add}
						disabled={!draft.trim()}
						className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[11.5px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
					>
						<MessageSquarePlus className="size-3.5" />Add comment
					</button>
				</div>
			</div>

			{comments.length === 0 && (
				<p className="px-0.5 py-2 text-[12px] leading-relaxed text-muted-foreground">No comments on this slide yet. Comments are review notes — they travel in the Lattice file, never on the slide or in a shared PDF unless you opt in at export.</p>
			)}

			{open.map((c) => (
				<CommentRow key={c.id} c={c} now={now} onResolve={() => setResolved(deckId, c.id, true)} onDelete={() => deleteComment(deckId, c.id)} />
			))}

			{resolved.length > 0 && (
				<div className="mt-3 border-t border-border pt-2">
					<div className="mb-1 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">Resolved ({resolved.length})</div>
					{resolved.map((c) => (
						<CommentRow key={c.id} c={c} now={now} resolved onResolve={() => setResolved(deckId, c.id, false)} onDelete={() => deleteComment(deckId, c.id)} />
					))}
				</div>
			)}
		</div>
	);
}

function CommentRow({
	c,
	now,
	resolved,
	onResolve,
	onDelete,
}: {
	c: { id: string; author: string; body: string; createdAt: number };
	now: number;
	resolved?: boolean;
	onResolve: () => void;
	onDelete: () => void;
}) {
	return (
		<div className={`group my-1.5 rounded-lg border border-border px-2.5 py-2 ${resolved ? 'opacity-60' : ''}`}>
			<div className="mb-1 flex items-center gap-2 text-[11px] text-muted-foreground">
				<span className="font-semibold text-foreground">{c.author}</span>
				<span>·</span>
				<span>{timeAgo(c.createdAt, now)}</span>
				<span className="flex-1" />
				<Tip label={resolved ? 'Reopen' : 'Resolve'}><button
					type="button"
					onClick={onResolve}
					aria-label={resolved ? 'Reopen comment' : 'Resolve comment'}
					className="rounded p-0.5 text-muted-foreground opacity-0 hover:text-[var(--accent)] group-hover:opacity-100"
				>
					{resolved ? <RotateCcw className="size-3.5" /> : <Check className="size-3.5" />}
				</button></Tip>
				<Tip label="Delete"><button
					type="button"
					onClick={onDelete}
					aria-label="Delete comment"
					className="rounded p-0.5 text-muted-foreground opacity-0 hover:text-[var(--fail,#b3261e)] group-hover:opacity-100"
				>
					<Trash2 className="size-3.5" />
				</button></Tip>
			</div>
			<p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-foreground">{c.body}</p>
		</div>
	);
}
