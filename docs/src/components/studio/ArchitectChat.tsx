import DOMPurify from 'dompurify';
import { ArrowUp, Check, Lock, RotateCcw, Sparkles, Square, TriangleAlert, Unlock, X } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { diffLines, sliceSlide } from '@/playground/architect-edits.js';
import { applyProposedEdits, architectSpend, type ChatTurn, chatComplete, type DiffRow, estimateUsd, useArchitectStatus } from './architect';
import { ChatCodeBlock } from './ChatCodeBlock';
import { type ChatSegment, renderMessageSegments, renderMessageSegmentsStreaming } from './chat-markdown';
import { useReferenceDoc } from './reference-doc-ui';
import { type ChatMessage, type ChatProposal, loadChat, loadChatDraft, saveChat, saveChatDraft } from './studio-store';

// The Architect chat (Converse) — a real conversational thread. Replies STREAM in
// token-by-token (rAF-coalesced), render as on-brand Markdown (prose sanitized with
// DOMPurify; fenced code as React ChatCodeBlock so a crafted reply can't inject HTML
// and the Copy button survives sanitization), and when the model proposes edits the
// reply carries a per-slide reviewable diff that is RE-APPLIED against the CURRENT deck
// at Apply-time (never a stale whole-deck overwrite). History persists per deck; a reply
// in flight keeps completing and commits to its originating deck even if the panel
// unmounts or the deck switches — only an explicit Stop aborts. With no model connected
// it degrades honestly (an EPHEMERAL notice, never a fabricated or replayed turn).

// DOMPurify profile matched to EXACTLY the tags chat-markdown emits (headings are
// <div>, not h1–h4). Defense-in-depth: the renderer already escapes first, but the
// bubble is a same-origin sink, so we sanitize the prose HTML before it enters the DOM.
const CHAT_SANITIZE = { ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'code', 'pre', 'a', 'ul', 'ol', 'li', 'div', 'span'], ALLOWED_ATTR: ['href', 'target', 'rel', 'class'], ALLOW_DATA_ATTR: false };
const sanitizeChat = (html: string): string => DOMPurify.sanitize(html, CHAT_SANITIZE) as unknown as string;

function AssistantBody({ text, streaming }: { text: string; streaming: boolean }) {
	const segs: ChatSegment[] = React.useMemo(() => (streaming ? renderMessageSegmentsStreaming(text) : renderMessageSegments(text)), [text, streaming]);
	return (
		<div className="cm-chat-md space-y-1.5">
			{segs.map((s, i) =>
				s.type === 'code' ? (
					// biome-ignore lint/suspicious/noArrayIndexKey: append-only segment list for one render.
					<ChatCodeBlock key={i} code={s.code} lang={s.lang} />
				) : (
					// biome-ignore lint/suspicious/noArrayIndexKey: append-only segment list for one render.
					// biome-ignore lint/security/noDangerouslySetInnerHtml: prose is escape-first rendered by renderProse then DOMPurify-sanitized with the chat tag profile — the single sanitized sink; code never takes this path.
					<div key={i} dangerouslySetInnerHTML={{ __html: sanitizeChat(s.html) }} />
				),
			)}
		</div>
	);
}

export function ArchitectChat({ deckId, source, aiReady, onApply, onConnect, onManageDocs, notify }: { deckId: string; source: string; aiReady: boolean; onApply: (next: string) => void; onConnect: () => void; onManageDocs?: () => void; notify: (m: string) => void }) {
	const [messages, setMessages] = React.useState<ChatMessage[]>(() => loadChat(deckId));
	const [input, setInput] = React.useState<string>(() => loadChatDraft(deckId));
	const [busy, setBusy] = React.useState(false);
	// "Facts locked" — a tone/clarity-only turn: the model may improve wording but must not
	// change any number/date/name/claim (threaded to chatComplete as constrainFacts). Off by
	// default; a deliberate opt-in for a "polish, don't touch the numbers" pass.
	const [factsLocked, setFactsLocked] = React.useState(false);
	// The in-flight assistant buffer (null when idle). Painted rAF-coalesced during stream.
	const [streaming, setStreaming] = React.useState<string | null>(null);
	// An EPHEMERAL notice (offline / blocked / error). NEVER persisted as an assistant
	// turn — a persisted notice would re-enter the model history and be re-sent.
	const [notice, setNotice] = React.useState<{ kind: 'offline' | 'blocked' | 'error'; text: string } | null>(null);
	const [pulse, setPulse] = React.useState(0);
	const scrollRef = React.useRef<HTMLDivElement>(null);
	const refDoc = useReferenceDoc(notify, onManageDocs);
	const status = useArchitectStatus(pulse);
	const [spend, setSpend] = React.useState(() => architectSpend());

	const deckIdRef = React.useRef(deckId);
	deckIdRef.current = deckId;
	const inputRef = React.useRef(input);
	inputRef.current = input;
	const mountedRef = React.useRef(true);
	const abortRef = React.useRef<AbortController | null>(null);
	const bufferRef = React.useRef('');
	const rafRef = React.useRef(0);
	React.useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
			if (rafRef.current) cancelAnimationFrame(rafRef.current);
			// NOTE: we deliberately do NOT abort on unmount — the request keeps completing
			// and commits to its originating deck (the survival contract). Only Stop aborts.
		};
	}, []);

	React.useEffect(() => setMessages(loadChat(deckId)), [deckId]);
	React.useEffect(() => setInput(loadChatDraft(deckId)), [deckId]);
	React.useEffect(() => {
		saveChat(deckId, messages);
		scrollRef.current?.scrollTo?.({ top: scrollRef.current.scrollHeight });
	}, [deckId, messages]);
	// biome-ignore lint/correctness/useExhaustiveDependencies: `streaming` is the intentional scroll trigger.
	React.useEffect(() => {
		scrollRef.current?.scrollTo?.({ top: scrollRef.current.scrollHeight });
	}, [streaming]);
	React.useEffect(() => {
		saveChatDraft(deckIdRef.current, input);
	}, [input]);
	React.useEffect(() => () => saveChatDraft(deckIdRef.current, inputRef.current), []);

	const cloud = status.generation === 'openrouter';
	// Per-turn cost estimate — the DECK dominates the token count, so estimate over the
	// deck (recomputed when it changes), NOT per keystroke (a live cents-ticker is anxiety
	// noise, not reassurance). Suppressed entirely on the free on-device tier.
	const turnEst = React.useMemo(() => (cloud && status.price ? estimateUsd(source, status.price, 4096) : null), [cloud, source, status.price]);

	const run = async (history: ChatMessage[], sendDeckId: string) => {
		const commit = (next: ChatMessage[]) => {
			saveChat(sendDeckId, next);
			if (mountedRef.current && deckIdRef.current === sendDeckId) setMessages(next);
		};
		setBusy(true);
		setNotice(null);
		const controller = new AbortController();
		abortRef.current = controller;
		bufferRef.current = '';
		setStreaming('');
		const onToken = (tok: string) => {
			bufferRef.current += tok;
			if (!rafRef.current)
				rafRef.current = requestAnimationFrame(() => {
					rafRef.current = 0;
					if (mountedRef.current && deckIdRef.current === sendDeckId) setStreaming(bufferRef.current);
				});
		};
		try {
			const turns: ChatTurn[] = history.map((m) => ({ role: m.role, content: m.content }));
			const out = await chatComplete(turns, source, refDoc.docs, { onToken, signal: controller.signal, constrainFacts: factsLocked });
			if (out.status === 'offline') {
				setNotice({ kind: 'offline', text: 'Connect a model in Workspace → AI and I can answer and edit your deck.' });
				onConnect();
			} else if (out.status === 'blocked') {
				setNotice({ kind: 'blocked', text: out.reply });
			} else {
				commit([...history, { role: 'assistant', content: out.reply, proposed: out.proposed?.edits as ChatProposal[] | undefined }]);
			}
		} catch {
			setNotice({ kind: 'error', text: 'Something went wrong reaching the model — try again.' });
		} finally {
			abortRef.current = null;
			if (mountedRef.current && deckIdRef.current === sendDeckId) {
				setBusy(false);
				setStreaming(null);
				setPulse((p) => p + 1);
				setSpend(architectSpend());
			}
		}
	};

	const send = () => {
		const text = input.trim();
		if (!text || busy) return;
		const sendDeckId = deckId;
		setInput('');
		saveChatDraft(sendDeckId, '');
		const history: ChatMessage[] = [...messages, { role: 'user', content: text }];
		saveChat(sendDeckId, history);
		if (deckIdRef.current === sendDeckId) setMessages(history);
		void run(history, sendDeckId);
	};

	const stop = () => abortRef.current?.abort();

	const regenerate = () => {
		if (busy) return;
		// Re-send the thread up to and including the last user turn (drop a trailing
		// assistant reply so the model answers fresh).
		let end = messages.length;
		while (end > 0 && messages[end - 1].role === 'assistant') end--;
		if (!end) return;
		void run(messages.slice(0, end), deckId);
	};

	const applyProposal = (idx: number) => {
		const m = messages[idx];
		if (!m?.proposed?.length) return;
		// Re-apply against the CURRENT deck (not a stale snapshot) — edits to OTHER slides
		// are preserved; a same-slide edit is replaced (flagged stale in the review).
		const next = applyProposedEdits(source, m.proposed);
		onApply(next);
		setMessages((cur) => cur.map((x, i) => (i === idx ? { ...x, applied: true } : x)));
		notify('Edit applied — restore from History to undo.');
	};
	const discardProposal = (idx: number) => setMessages((cur) => cur.map((x, i) => (i === idx ? { ...x, proposed: undefined } : x)));

	const empty = messages.length === 0 && !streaming && !notice;

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
				{empty && (
					<div className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-[12px] leading-relaxed text-muted-foreground">
						<Sparkles className="mx-auto mb-1.5 size-4 text-[var(--accent)]" />
						Ask the Architect to tighten a slide, reshape the deck, or answer a question. Proposed edits arrive as a diff you Apply or Discard.
						{!aiReady && <span className="mt-1.5 block text-[var(--text-muted)]">Connect a model in Workspace to start.</span>}
					</div>
				)}
				{messages.map((m, i) =>
					m.role === 'user' ? (
						// biome-ignore lint/suspicious/noArrayIndexKey: append-only chat log — index is stable identity.
						<div key={i} className="flex justify-end">
							<div className="max-w-[92%] whitespace-pre-wrap rounded-2xl bg-primary px-3 py-2 text-[12.5px] leading-relaxed text-primary-foreground">{m.content}</div>
						</div>
					) : (
						// biome-ignore lint/suspicious/noArrayIndexKey: append-only chat log — index is stable identity.
						<div key={i} className="flex flex-col gap-1.5">
							<div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
								<Sparkles className="size-3 text-[var(--accent)]" /> Architect
							</div>
							<div className="text-[12.5px] leading-relaxed text-foreground">
								<AssistantBody text={m.content} streaming={false} />
							</div>
							{m.proposed?.length && !m.applied ? <ProposalReview edits={m.proposed} liveSource={source} onApply={() => applyProposal(i)} onDiscard={() => discardProposal(i)} /> : null}
							{m.applied && (
								<span className="flex items-center gap-1 text-[11px] font-semibold text-[var(--chart-3,#2e6f00)]">
									<Check className="size-3" />
									Applied
								</span>
							)}
						</div>
					),
				)}
				{streaming !== null && (
					<div className="flex flex-col gap-1.5">
						<div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
							<Sparkles className="size-3 animate-pulse text-[var(--accent)]" /> Architect
						</div>
						{streaming === '' ? (
							<div className="flex gap-1 py-1" role="status" aria-label="Thinking">
								<span className="size-1.5 animate-bounce rounded-full bg-[var(--accent)] [animation-delay:-0.2s]" />
								<span className="size-1.5 animate-bounce rounded-full bg-[var(--accent)] [animation-delay:-0.1s]" />
								<span className="size-1.5 animate-bounce rounded-full bg-[var(--accent)]" />
							</div>
						) : (
							<div className="text-[12.5px] leading-relaxed text-foreground">
								<AssistantBody text={streaming} streaming={true} />
								<span className="ml-0.5 inline-block h-[1.1em] w-[2px] animate-pulse bg-[var(--accent)] align-text-bottom" aria-hidden />
							</div>
						)}
					</div>
				)}
				{notice && (
					<div className={cn('flex items-start gap-2 rounded-xl border px-3 py-2 text-[12px] leading-relaxed', notice.kind === 'blocked' ? 'border-[var(--warn,#9a6a00)]/40 text-[var(--warn,#9a6a00)]' : 'border-border text-muted-foreground')}>
						<TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
						<span>{notice.text}</span>
					</div>
				)}
			</div>

			{/* Cost strip — calm, always present. Session gauge + a per-turn estimate; on the
			    free on-device tier the money UI is suppressed entirely (honest, not a fake $0). */}
			<div className="flex items-center justify-between gap-2 border-t border-border px-3 py-1.5 text-[11px]">
				{cloud ? (
					<>
						<span className="flex items-center gap-1.5 text-muted-foreground">
							{turnEst != null && (
								<span>
									≈ <span className="font-semibold text-foreground">${turnEst.toFixed(turnEst < 0.1 ? 3 : 2)}</span>/turn
								</span>
							)}
						</span>
						<span className="flex items-center gap-1.5">
							{spend.cap > 0 && (
								<span className="h-[5px] w-14 overflow-hidden rounded-full bg-border" aria-hidden>
									<span className={cn('block h-full rounded-full', spend.status.level === 'over' ? 'bg-[var(--fail,#b3261e)]' : spend.status.level === 'warn' ? 'bg-[var(--warn,#9a6a00)]' : 'bg-primary')} style={{ width: `${Math.min(100, spend.cap ? (spend.session / spend.cap) * 100 : 0)}%` }} />
								</span>
							)}
							<span className="text-muted-foreground">
								<span className="font-semibold text-foreground">${spend.session.toFixed(2)}</span>
								{spend.cap > 0 ? ` / $${spend.cap.toFixed(2)}` : ' session'}
							</span>
						</span>
					</>
				) : (
					<span className="text-muted-foreground">⚡ On-device · free &amp; private</span>
				)}
			</div>

			<div className="flex flex-col gap-1.5 border-t border-border p-2.5">
				{refDoc.chip}
				<div className="flex items-end gap-1.5 rounded-xl border border-border bg-background px-2.5 py-1.5 focus-within:border-[var(--accent)]">
					<textarea
						value={input}
						onChange={(e) => setInput(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === 'Enter' && !e.shiftKey) {
								e.preventDefault();
								send();
							}
						}}
						rows={1}
						placeholder={aiReady ? 'Ask or instruct…' : 'Connect a model to chat…'}
						aria-label="Message the Architect"
						className="max-h-[120px] min-h-[22px] flex-1 resize-none bg-transparent text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground"
					/>
					{refDoc.attachButton}
					<button
						type="button"
						onClick={() => setFactsLocked((v) => !v)}
						title={factsLocked ? 'Facts locked — tone & clarity only, no numbers changed' : 'Lock facts — let the model polish wording but change no numbers'}
						aria-label="Lock facts — tone and clarity only"
						aria-pressed={factsLocked}
						className={cn('grid size-7 shrink-0 place-items-center rounded-lg', factsLocked ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-muted-foreground hover:text-foreground')}
					>
						{factsLocked ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
					</button>
					{messages.some((m) => m.role === 'assistant') && !busy && (
						<button type="button" onClick={regenerate} aria-label="Regenerate last reply" className="grid size-7 shrink-0 place-items-center rounded-lg text-muted-foreground hover:text-foreground">
							<RotateCcw className="size-3.5" />
						</button>
					)}
					{busy ? (
						<button type="button" onClick={stop} aria-label="Stop" className="grid size-7 shrink-0 place-items-center rounded-lg bg-[var(--fail,#b3261e)] text-white">
							<Square className="size-3.5" />
						</button>
					) : (
						<button type="button" onClick={send} disabled={!input.trim()} aria-label="Send" className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40">
							<ArrowUp className="size-4" />
						</button>
					)}
				</div>
			</div>
		</div>
	);
}

// Numeric provenance — Munger's content-truth point. A rewrite that changes a figure is
// the highest-risk edit in a numbers deck, so surface it explicitly for review regardless
// of the "facts locked" mode. Captures currency / thousands / decimals / percentages.
// A money/metric token: optional currency, grouped-thousands OR a plain number, optional
// decimal, optional magnitude (K/M/B), optional percent. Deliberately NOT `[\d,]*` — that
// swallowed list commas ("10, 20" → "10,") and a trailing space; grouped thousands need an
// exact 3-digit group, so "1,000" is one token but "10, 20" is two.
const NUM_RE = /[$€£]?\d{1,3}(?:,\d{3})+(?:\.\d+)?[KkMmBb]?%?|[$€£]?\d+(?:\.\d+)?[KkMmBb]?%?/g;
function numericTokens(s: string): string[] {
	return (String(s).match(NUM_RE) || []).filter((x) => /\d/.test(x));
}
export function figureChange(before: string, after: string): { removed: string[]; added: string[] } | null {
	const count = (arr: string[]) => arr.reduce((m, n) => m.set(n, (m.get(n) ?? 0) + 1), new Map<string, number>());
	const bc = count(numericTokens(before));
	const ac = count(numericTokens(after));
	const removed: string[] = [];
	const added: string[] = [];
	for (const [n, c] of bc) for (let i = 0; i < c - (ac.get(n) ?? 0); i++) removed.push(n);
	for (const [n, c] of ac) for (let i = 0; i < c - (bc.get(n) ?? 0); i++) added.push(n);
	return removed.length || added.length ? { removed, added } : null;
}

// A grouped, per-slide review of proposed edits. Nothing changes until Apply; each edit
// re-applies against the CURRENT deck, and a slide that changed since the proposal is
// flagged so the author knows Apply will replace their current slide content.
function ProposalReview({ edits, liveSource, onApply, onDiscard }: { edits: ChatProposal[]; liveSource: string; onApply: () => void; onDiscard: () => void }) {
	const slides = new Set(edits.map((e) => e.slide));
	const staleSlides = edits.filter((e) => e.action !== 'insert' && sliceSlide(liveSource, e.slide).trim() !== e.before.trim()).map((e) => e.slide);
	return (
		<div className="mt-1 overflow-hidden rounded-lg border border-border bg-background">
			<div className="flex items-center justify-between gap-2 border-b border-border px-2.5 py-1.5">
				<span className="text-[11px] font-semibold text-foreground">
					{edits.length} edit{edits.length > 1 ? 's' : ''} · {slides.size} slide{slides.size > 1 ? 's' : ''}
				</span>
				<span className="text-[10px] text-muted-foreground">nothing changes until you Apply</span>
			</div>
			<div className="max-h-[220px] overflow-y-auto">
				{edits.map((e, i) => {
					const fig = e.action !== 'insert' ? figureChange(e.before, e.after) : null;
					return (
						// biome-ignore lint/suspicious/noArrayIndexKey: static proposal list.
						<div key={i} className="border-b border-border last:border-b-0">
							<div className="px-2.5 pt-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{e.label}</div>
							<DiffCard rows={e.diff as DiffRow[]} />
							{fig && (
								<div className="flex items-start gap-1.5 px-2.5 pb-1.5 text-[10px] text-[var(--warn,#9a6a00)]">
									<TriangleAlert className="mt-0.5 size-3 shrink-0" />
									<span>Changes a figure — verify{fig.removed.length && fig.added.length ? `: ${fig.removed.join(', ')} → ${fig.added.join(', ')}` : fig.added.length ? ` (adds ${fig.added.join(', ')})` : ` (removes ${fig.removed.join(', ')})`}</span>
								</div>
							)}
						</div>
					);
				})}
			</div>
			{staleSlides.length > 0 && (
				<div className="flex items-start gap-1.5 border-t border-border px-2.5 py-1.5 text-[10.5px] text-[var(--warn,#9a6a00)]">
					<TriangleAlert className="mt-0.5 size-3 shrink-0" />
					<span>Slide {staleSlides.join(', ')} changed since this was proposed — Apply will replace your current version.</span>
				</div>
			)}
			<div className="flex items-center gap-1.5 border-t border-border px-2.5 py-1.5">
				<button type="button" onClick={onApply} className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground">
					<Check className="size-3" />
					Apply
				</button>
				<button type="button" onClick={onDiscard} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-muted-foreground">
					<X className="size-3" />
					Discard
				</button>
			</div>
		</div>
	);
}

// Collapse long runs of unchanged context to keep a diff readable — keep CONTEXT lines
// around each change, replace the rest with a "⋯ N unchanged" marker.
function collapseContext(rows: DiffRow[], context = 2): (DiffRow | { type: 'gap'; text: string })[] {
	const keep = new Array(rows.length).fill(false);
	rows.forEach((r, i) => {
		if (r.type !== 'same') for (let j = Math.max(0, i - context); j <= Math.min(rows.length - 1, i + context); j++) keep[j] = true;
	});
	const out: (DiffRow | { type: 'gap'; text: string })[] = [];
	let run = 0;
	rows.forEach((r, i) => {
		if (keep[i]) {
			if (run > 0) {
				out.push({ type: 'gap', text: `⋯ ${run} unchanged line${run > 1 ? 's' : ''}` });
				run = 0;
			}
			out.push(r);
		} else {
			run++;
		}
	});
	if (run > 0) out.push({ type: 'gap', text: `⋯ ${run} unchanged line${run > 1 ? 's' : ''}` });
	return out;
}

// A compact line diff (real LCS from the engine — not a set-difference), context
// collapsed. Exported + reused by the Coach's per-finding fix, which passes before/after;
// the chat passes precomputed `rows` (the per-slide diff).
export function DiffCard({ before, after, rows, onApply, onDiscard }: { before?: string; after?: string; rows?: DiffRow[]; onApply?: () => void; onDiscard?: () => void }) {
	const diff = React.useMemo<DiffRow[]>(() => rows ?? (diffLines(before ?? '', after ?? '') as DiffRow[]), [before, after, rows]);
	const display = React.useMemo(() => collapseContext(diff), [diff]);
	return (
		<div className="overflow-hidden bg-background">
			<div className="max-h-[180px] overflow-auto px-2.5 py-1.5 font-mono text-[10.5px] leading-relaxed">
				{display.map((r, i) =>
					r.type === 'gap' ? (
						// biome-ignore lint/suspicious/noArrayIndexKey: static diff snapshot.
						<div key={i} className="select-none py-0.5 text-center text-[9.5px] uppercase tracking-wider text-muted-foreground">
							{r.text}
						</div>
					) : (
						// biome-ignore lint/suspicious/noArrayIndexKey: static diff snapshot.
						<div key={i} className={cn('whitespace-pre-wrap', r.type === 'add' ? 'text-[var(--chart-3,#2e6f00)]' : r.type === 'del' ? 'text-[var(--fail,#b3261e)] line-through opacity-70' : 'text-muted-foreground')}>
							{r.type === 'add' ? '+ ' : r.type === 'del' ? '− ' : '  '}
							{r.text}
						</div>
					),
				)}
			</div>
			{(onApply || onDiscard) && (
				<div className="flex items-center gap-1.5 border-t border-border px-2 py-1.5">
					{onApply && (
						<button type="button" onClick={onApply} className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground">
							<Check className="size-3" />
							Apply
						</button>
					)}
					{onDiscard && (
						<button type="button" onClick={onDiscard} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-muted-foreground">
							<X className="size-3" />
							Discard
						</button>
					)}
				</div>
			)}
		</div>
	);
}
