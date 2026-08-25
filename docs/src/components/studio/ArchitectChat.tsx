import DOMPurify from 'dompurify';
import { ArrowUp, Check, Lock, RotateCcw, Sparkles, Square, TriangleAlert, Unlock, X } from 'lucide-react';
import * as React from 'react';
import { createPortal } from 'react-dom';
import { diffLines, sliceSlide } from '@/components/studio/ai/architect-edits.js';
import { readCachingEnabled } from '@/components/studio/ai/spend.js';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { applyProposedEditsChecked, type ChatGrounding, type ChatTurn, chatComplete, type DiffRow, useArchitectStatus } from './architect';
import { ChatCodeBlock } from './ChatCodeBlock';
import { ChatCost } from './ChatCost';
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
// it degrades honestly (an EPHEMERAL notice, on the deck that asked, never a fabricated
// or replayed turn).

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

// Drop a queued paint frame and clear the guard, together. Zeroing the id matters as
// much as the cancel: `onToken` reads a non-zero `rafRef` as "a frame is already
// scheduled" and would never queue another one (#1787).
function cancelPaint(ref: React.MutableRefObject<number>) {
	if (ref.current) cancelAnimationFrame(ref.current);
	ref.current = 0;
}

type ChatNotice = { deck: string; kind: 'offline' | 'blocked' | 'error'; text: string };

// A FAILURE NOTICE HAS TO OUTLIVE THE PANEL, NOT JUST THE RENDER.
//
// `notice` was component state, so closing Chat mid-turn destroyed it — and because the
// shell action below is guarded too, a turn that failed while the panel was shut said
// nothing, anywhere: the author reopened Chat on the deck that asked and saw their own
// question with nothing after it. The `ok` branch never had that hole, because `commit`
// calls `saveChat` unconditionally — so only a FAILED turn could vanish, which is the
// worst possible way round (checker, #1849).
//
// Module scope, deliberately NOT storage. Still ephemeral in the sense the contract means
// — gone on reload, never an assistant turn, so it can never re-enter the model's history
// and be re-sent — but it survives the panel closing, which is what makes the guard on
// `onConnect()` honest rather than a way to drop the news on the floor.
//
// Keyed BY DECK, which also settles a second defect: one slot meant a send on deck-2 wiped
// a notice deck-1 was still waiting to show. A map holds each deck's own.
// IT HAS TO BE OBSERVABLE, NOT SAMPLED. The first version of this parked the notice and
// then called the DEAD instance's setter; a live reader only ever picked the park up at
// mount or on a deck change. Close the panel mid-turn and reopen it on the SAME deck and
// neither happens — the notice sits in the map, invisible, and the author is back to their
// own question with nothing after it. That is the original bug one click further in
// (checker N1), which is why this is a store with subscribers rather than a cache.
const pendingNotices = new Map<string, ChatNotice>();
const noticeListeners = new Set<() => void>();

// A per-deck turn counter, so a notice cannot arrive from a turn that has been SUPERSEDED.
// `run()` clears the deck's park at its start, but a turn that was already in flight
// resolves afterwards and would park its failure under the newer turn's reply — a stale
// "something went wrong" sitting beneath an answer that worked (checker N2). Reachable only
// because the notice now outlives the panel: a remounted panel resets `busy`, so a second
// turn can be sent while the first is still running.
const deckTurnSeq = new Map<string, number>();

function subscribeNotices(fn: () => void): () => void {
	noticeListeners.add(fn);
	return () => {
		noticeListeners.delete(fn);
	};
}

function publishNotices() {
	for (const fn of noticeListeners) fn();
}

// Park a notice for its deck and tell every live reader. UNGATED — every caller that
// reaches this is saying something the author needs to see now.
function raiseNotice(deck: string, kind: ChatNotice['kind'], text: string) {
	pendingNotices.set(deck, { deck, kind, text });
	publishNotices();
}

// The GATED path, and the signature is the point: only a caller holding a real sequence
// from `run()` can reach the gate, and there is no way to hand this a number you made up.
//
// The first version of the gate lived inside `raiseNotice` and Apply called it with
// `deckTurnSeq.get(deck) ?? 0` — which does not "claim" a sequence, it FABRICATES one that
// the identity check on the next line then rejects (`undefined !== 0`). So a failed Apply
// said nothing at all on any deck that had not had a turn this page session: come back the
// next day, hit Apply on a proposal that no longer fits the deck, and the refusal was
// discarded — the exact silent failure this whole branch exists to remove (checker B1).
//
// Splitting the two is what stops that recurring: the ungated call cannot take a sequence,
// and the gated one cannot be reached without a genuine one.
function raiseTurnNotice(deck: string, seq: number, kind: ChatNotice['kind'], text: string) {
	// Superseded — a newer turn on this deck has already bumped the counter, so this
	// failure is not news any more and must not land under the newer turn's answer.
	if (deckTurnSeq.get(deck) !== seq) return;
	raiseNotice(deck, kind, text);
}

/** Test seam. Module state outlives a `render()`, so a suite that never cleared this would
 *  carry one case's failure into the next. Not used by the app. */
export function __clearPendingNotices() {
	pendingNotices.clear();
	deckTurnSeq.clear();
	publishNotices();
}

export function ArchitectChat({ title, costSlot, deckId, source, aiReady, grounding, onApply, onConnect, onManageDocs, notify }: { title?: string; costSlot?: HTMLElement | null; deckId: string; source: string; aiReady: boolean; grounding?: ChatGrounding; onApply: (next: string) => void; onConnect: () => void; onManageDocs?: () => void; notify: (m: string) => void }) {
	const [messages, setMessages] = React.useState<ChatMessage[]>(() => loadChat(deckId));
	const [input, setInput] = React.useState<string>(() => loadChatDraft(deckId));
	const [busy, setBusy] = React.useState(false);
	// "Facts locked" — a tone/clarity-only turn: the model may improve wording but must not
	// change any number/date/name/claim (threaded to chatComplete as constrainFacts). Off by
	// default; a deliberate opt-in for a "polish, don't touch the numbers" pass.
	const [factsLocked, setFactsLocked] = React.useState(false);
	// The in-flight assistant buffer (null when idle), CARRYING THE DECK IT BELONGS TO.
	// Painted rAF-coalesced during stream. The deck travels with the text because the panel
	// renders one deck at a time while a turn keeps streaming across a deck switch: without
	// it, the pair "which text" / "which deck" lives in two places and they disagree for a
	// render — which is how the other deck's partial reply used to paint into this
	// transcript. Filtered at the render (`live`), never cleared on the switch, so switching
	// BACK shows the reply still arriving rather than a blank turn (#1787, checker F1).
	const [streaming, setStreaming] = React.useState<{ deck: string; text: string } | null>(null);
	// An EPHEMERAL notice (offline / blocked / error). NEVER persisted as an assistant turn —
	// a persisted notice would re-enter the model history and be re-sent. It is read from the
	// module store rather than held in state, keyed by THIS deck: a turn keeps completing
	// across a deck switch and across the panel closing, so the answer has to be waiting
	// wherever the author comes back to, and has to reach a reader that is already on screen
	// (#1813, checker N1). `useSyncExternalStore` makes all three the same code path — mount,
	// deck change, and a park that lands while this instance is live.
	const notice = React.useSyncExternalStore(
		subscribeNotices,
		() => pendingNotices.get(deckId) ?? null,
		() => null,
	);
	const [pulse, setPulse] = React.useState(0);
	const scrollRef = React.useRef<HTMLDivElement>(null);
	const refDoc = useReferenceDoc(notify, onManageDocs);
	const status = useArchitectStatus(pulse);

	const deckIdRef = React.useRef(deckId);
	deckIdRef.current = deckId;
	const inputRef = React.useRef(input);
	inputRef.current = input;
	// The Coach's live assessment + the component catalog, read at SEND time rather than
	// captured in the send closure — the deck is re-assessed on a 400ms debounce, so a
	// send that fires mid-edit must ground on the newest findings, not the ones that
	// happened to be current when the handler was created.
	const groundingRef = React.useRef(grounding);
	groundingRef.current = grounding;
	const mountedRef = React.useRef(true);
	const abortRef = React.useRef<AbortController | null>(null);
	const bufferRef = React.useRef('');
	const rafRef = React.useRef(0);
	React.useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
			cancelPaint(rafRef);
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

	// After the first turn of a thread the cached prefix is a READ, not a write — the cost
	// readout weights it accordingly. Chat state, so it is resolved here and handed down.
	const primed = status.generation === 'openrouter' && readCachingEnabled() && messages.length > 0;
	// The money readout lives in the PANEL HEADER now (ChatCost), not in a strip of its
	// own between the transcript and the composer — that row cost a whole line of a narrow
	// panel to show two short numbers. ChatCost reads the spend gauge itself and refreshes
	// on `lattice-spend-changed`, which is why a turn ending fires that event below: it is
	// the one signal that crosses from here to a header this component doesn't own.

	const run = async (history: ChatMessage[], sendDeckId: string) => {
		const commit = (next: ChatMessage[]) => {
			saveChat(sendDeckId, next);
			if (mountedRef.current && deckIdRef.current === sendDeckId) setMessages(next);
		};
		setBusy(true);
		// Only this deck's. A new turn supersedes the last failure on the deck it is sent
		// from; it says nothing about a notice another deck is still waiting to show. The
		// bumped sequence is what a turn already in flight will fail to match when it
		// resolves later, so it cannot park its failure under this turn's answer.
		const turnSeq = (deckTurnSeq.get(sendDeckId) ?? 0) + 1;
		deckTurnSeq.set(sendDeckId, turnSeq);
		pendingNotices.delete(sendDeckId);
		publishNotices();
		const controller = new AbortController();
		abortRef.current = controller;
		bufferRef.current = '';
		setStreaming({ deck: sendDeckId, text: '' });
		const onToken = (tok: string) => {
			bufferRef.current += tok;
			if (!rafRef.current)
				rafRef.current = requestAnimationFrame(() => {
					rafRef.current = 0;
					// No deck guard here — the RENDER decides what is on screen. Keeping the buffer
					// current while the author is on another deck is the point: come back mid-turn
					// and the reply is where they left it, still arriving.
					if (mountedRef.current) setStreaming({ deck: sendDeckId, text: bufferRef.current });
				});
		};
		try {
			const turns: ChatTurn[] = history.map((m) => ({ role: m.role, content: m.content }));
			const out = await chatComplete(turns, source, refDoc.docs, { onToken, signal: controller.signal, constrainFacts: factsLocked, grounding: groundingRef.current });
			if (out.status === 'offline') {
				raiseTurnNotice(sendDeckId, turnSeq, 'offline', 'Connect a model in Workspace → AI and I can answer and edit your deck.');
				// THE NOTICE IS DECK STATE; THIS IS AN ACTION ON THE SHELL — and the shell has
				// no deck of its own to be right about. A notice can sit and wait for the author
				// to come back; popping the Workspace sheet happens NOW, over whatever they are
				// looking at. So it fires only if they are still on the deck that asked, in a
				// panel that is still open — otherwise it opens a sheet over a deck that never
				// asked for anything (#1813).
				//
				// This is only honest because the notice is PARKED (`pendingNotices`) rather
				// than merely set: it is genuinely waiting on the originating deck, naming
				// Workspace → AI, whichever of the two conditions withheld the sheet. Guarding
				// the shell action while the notice could still evaporate is how a failed turn
				// ends up saying nothing at all — see the note on `pendingNotices`.
				//
				// The MOUNTED half is load-bearing in its own right, and not for the reason it
				// looks: `deckIdRef` is assigned during render, so it FREEZES at unmount. Drop
				// the mounted check and a turn sent from deck-1 with Chat since closed still
				// reads `deckIdRef.current === 'deck-1'`, passes, and pops the sheet over
				// whatever deck the author has moved to — #1813 again, wearing a hat.
				if (mountedRef.current && deckIdRef.current === sendDeckId) onConnect();
			} else if (out.status === 'blocked') {
				raiseTurnNotice(sendDeckId, turnSeq, 'blocked', out.reply);
			} else {
				commit([...history, { role: 'assistant', content: out.reply, proposed: out.proposed?.edits as ChatProposal[] | undefined }]);
			}
		} catch {
			raiseTurnNotice(sendDeckId, turnSeq, 'error', 'Something went wrong reaching the model — try again.');
		} finally {
			abortRef.current = null;
			// CANCEL THE PENDING PAINT BEFORE CLEARING THE BUBBLE. The last token's frame can
			// still be queued when `chatComplete` resolves; it would fire after `setStreaming(null)`
			// and set the buffer BACK, so the committed reply renders twice — permanently, since
			// nothing clears `streaming` again until the next send (#1787). Unconditional: the
			// frame is this turn's regardless of which deck is on screen or whether we still are.
			cancelPaint(rafRef);
			// TEARDOWN IS PANEL STATE, NOT DECK STATE. `busy` and `streaming` describe this
			// panel, and the panel has exactly one turn in flight — so they must clear when it
			// ends, whichever deck is on screen. Gated on the deck (as this was), switching
			// decks mid-turn stranded `busy` at true FOREVER: Send stayed replaced by Stop and
			// that deck could never be sent from again. Only the COMMIT is deck-scoped, and it
			// carries its own guard inside `commit`.
			if (mountedRef.current) {
				setBusy(false);
				setStreaming(null);
				setPulse((p) => p + 1);
				// The gauge is rendered elsewhere now — announce, don't set.
				try {
					globalThis.dispatchEvent?.(new Event('lattice-spend-changed'));
				} catch {
					/* no window */
				}
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
		const outcome = applyProposedEditsChecked(source, m.proposed);
		// NOTHING LANDED. This used to paint the green "Applied" tick, toast "Edit applied",
		// and burn a History checkpoint over an untouched deck — the author's only clue that
		// their edit hadn't happened was looking at the slide. Say so, and leave the proposal
		// standing so they can Discard it deliberately.
		if (!outcome.applied) {
			raiseNotice(deckId, 'error', outcome.refusals[0] || "That edit couldn't be applied to this deck.");
			return;
		}
		onApply(outcome.source);
		setMessages((cur) => cur.map((x, i) => (i === idx ? { ...x, applied: true, appliedCount: outcome.applied, refused: outcome.refusals.length || undefined } : x)));
		// A PARTIAL run is reported as partial — "applied" over a run where half the blocks
		// were refused is the same false claim, just smaller.
		if (outcome.refusals.length) {
			raiseNotice(deckId, 'error', outcome.refusals[0]);
			// BLOCKS on both sides of the "of" — `slides` is a different unit and summing them
			// produced counts describing nothing that existed (checker).
			notify(`Applied ${outcome.applied} of ${outcome.applied + outcome.refusals.length} edits — restore from History to undo.`);
		} else notify('Edit applied — restore from History to undo.');
	};
	const discardProposal = (idx: number) => setMessages((cur) => cur.map((x, i) => (i === idx ? { ...x, proposed: undefined } : x)));

	// One element, two destinations (this panel's own header row, or a host header's actions
	// slot via a portal) — built once so the two can't drift.
	const costReadout = <ChatCost source={source} grounding={grounding} docs={refDoc.docs} primed={primed} />;

	// WHAT IS ON SCREEN, as opposed to what is in flight. The buffer belongs to the deck that
	// asked for it; on any other deck this panel shows that deck's transcript and nothing of
	// the turn but the Stop button (which is panel-wide — the single-slot abort/buffer refs
	// make a second concurrent turn impossible, so the guard has to be).
	const live: string | null = streaming && streaming.deck === deckId ? streaming.text : null;
	// `!busy` is part of "empty": without it a deck with no history showed the *nothing has
	// happened here* placeholder while the composer showed Stop — a contradiction on screen
	// (checker F2). A turn in flight elsewhere leaves this transcript blank, not reassuring.
	// Already this deck's — the store is keyed by deck, so there is nothing left to filter.
	// Named apart from `notice` only because the render below reads it twice.
	const shownNotice = notice;
	const empty = messages.length === 0 && live === null && !shownNotice && !busy;

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			{/* HEADER — the panel title and the money, on ONE row. The cost readout used to own
			    a full-width strip between the transcript and the composer: a whole line of the
			    narrowest panel in the app, spent on two short numbers, while this row sat half
			    empty.

			    A host with its OWN header (the mobile PanelSheet) passes `costSlot` instead of a
			    title, and the readout is portalled into that header's actions area — otherwise
			    the strip just reappears one row lower, which is the same waste on the surface
			    with the least room. A portal rather than props because the two facts the price
			    needs — the attached reference docs and whether this thread is already warm — are
			    chat state, and hoisting them to a shell that renders the header would be a much
			    larger change than moving one element. */}
			{title ? (
				<div className="flex items-center justify-between gap-2 border-b border-border px-3.5 py-2 font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
					<span>{title}</span>
					{costReadout}
				</div>
			) : costSlot ? (
				createPortal(costReadout, costSlot)
			) : null}
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
								<span className="flex items-center gap-1 text-[11px] font-semibold text-[var(--pass)]">
									<Check className="size-3" />
									{m.refused ? `Applied ${m.appliedCount} of ${(m.appliedCount ?? 0) + m.refused}` : 'Applied'}
								</span>
							)}
						</div>
					),
				)}
				{live !== null && (
					<div className="flex flex-col gap-1.5">
						<div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
							<Sparkles className="size-3 animate-pulse text-[var(--accent)]" /> Architect
						</div>
						{live === '' ? (
							<div className="flex gap-1 py-1" role="status" aria-label="Thinking">
								<span className="size-1.5 animate-bounce rounded-full bg-[var(--accent)] [animation-delay:-0.2s]" />
								<span className="size-1.5 animate-bounce rounded-full bg-[var(--accent)] [animation-delay:-0.1s]" />
								<span className="size-1.5 animate-bounce rounded-full bg-[var(--accent)]" />
							</div>
						) : (
							<div className="text-[12.5px] leading-relaxed text-foreground">
								<AssistantBody text={live} streaming={true} />
								<span className="ml-0.5 inline-block h-[1.1em] w-[2px] animate-pulse bg-[var(--accent)] align-text-bottom" aria-hidden />
							</div>
						)}
					</div>
				)}
				{shownNotice && (
					<div className={cn('flex items-start gap-2 rounded-xl border px-3 py-2 text-[12px] leading-relaxed', shownNotice.kind === 'blocked' ? 'border-[var(--warn,#9a6a00)]/40 text-[var(--warn,#9a6a00)]' : 'border-border text-muted-foreground')}>
						<TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
						<span>{shownNotice.text}</span>
					</div>
				)}
			</div>

			<div className="flex flex-col gap-1.5 border-t border-border p-2.5">
				{refDoc.chip}
				{/* PADDING. One value on every side (p-2) rather than a 10/6 split, and it has to
					    clear the `rounded-xl` corner — content inset closer than the radius reads as
					    crowding into the curve. The buttons are `shrink-0` and the field is the only
					    flexible child, so the row reflows by changing the FIELD's width and nothing
					    else. Gap matches the padding (both 8px) so the spacing keeps one rhythm
					    instead of two nearly-equal values reading as a mistake. */}
				<div className="flex items-end gap-2 rounded-xl border border-border bg-background p-2 focus-within:border-[var(--accent)]">
					{/* `block` is load-bearing: the shadcn base sets `display:flex` on the field,
					    which wrecks a textarea's own text layout — with it, 800 characters
					    measured as 67 wrapped lines against a ~72px-wide box. `min-w-0` lets it
					    actually shrink inside the flex row instead of being floored by content.
					    `min-h-7` matches the buttons' `size-7`, and `py-[5px]` centers a single
					    line inside that box ((28 − 18.1) / 2). Without both, `items-end` pinned a
					    22px field to the bottom of a 28px row and the first line sat 6px low —
					    measured 13px above / 7px below, which is the asymmetry that reads as "off".
					    Grows with the prompt, to FOUR rows, so a typical instruction is visible
					    while it is being written instead of scrolling inside one line. The
					    surrounding row is `items-end`, so the buttons stay pinned to the bottom
					    edge as it grows rather than drifting to the middle. */}
					<Textarea
						autosize
						maxRows={4}
						// The ROW paints the focus affordance (`focus-within:border-[var(--accent)]`),
						// so the field must not paint a second one inside it. `outline-none` cannot
						// do this: the global rule in native-widgets.css is
						// `:where(…textarea…):focus-visible:not([data-focus-ring='container'])`, which
						// outscores a utility 2:1 — the attribute IS the documented opt-out. (The
						// double ring predates this change; the old raw textarea carried `outline-none`
						// and lost the same way. Fixed here because this is the element being edited.)
						data-focus-ring="container"
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
						className="block min-h-7 min-w-0 flex-1 resize-none border-0 bg-transparent px-0 py-[5px] text-[12.5px] leading-[1.45] text-foreground shadow-none outline-none focus-visible:ring-0 placeholder:text-muted-foreground md:text-[12.5px]"
					/>
					{refDoc.attachButton}
					<button
						type="button"
						onClick={() => setFactsLocked((v) => !v)}
						title={factsLocked ? 'Preserve facts: ON — asking the model to change wording only, not numbers or names. Best-effort — review the diff to confirm.' : 'Preserve facts — ask the model to improve wording without changing numbers or names (best-effort; review the diff).'}
						aria-label="Preserve facts — ask the model not to change numbers or names"
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
						<button type="button" onClick={stop} aria-label="Stop" className="grid size-7 shrink-0 place-items-center rounded-lg bg-[var(--fail-fill,#b3261e)] text-white">
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
// of the "facts locked" mode. A money/metric token: optional SIGN, optional currency,
// grouped-thousands OR a plain number, optional decimal, optional magnitude (K/M/B),
// optional percent. The leading `[-−+]?` is load-bearing — without it a loss↔profit flip
// (`-5%` → `5%`) tokenizes identically and the change is invisible (trio: the highest-risk
// numeric edit). NOT `[\d,]*` — that swallowed list commas ("10, 20" → "10,").
const NUM_RE = /[-−+]?[$€£]?\d{1,3}(?:,\d{3})+(?:\.\d+)?[KkMmBb]?%?|[-−+]?[$€£]?\d+(?:\.\d+)?[KkMmBb]?%?/g;
function numericTokens(s: string): string[] {
	return (String(s).match(NUM_RE) || []).filter((x) => /\d/.test(x));
}
// Normalize a token to a comparable numeric VALUE: apply sign, strip currency/commas,
// fold magnitude (K/M/B) and percent (÷100). So a pure REFORMAT of the same value
// (`4,200`↔`4200`, `$4.2M`↔`$4,200,000`) compares EQUAL and does not flag — only a real
// value change (or a sign flip) does. NaN for an unparseable token (compared as literal).
function tokenValue(tok: string): number {
	let t = tok.replace(/[$€£,\s]/g, '');
	let sign = 1;
	if (/^[-−]/.test(t)) { sign = -1; t = t.slice(1); } else if (t.startsWith('+')) t = t.slice(1);
	let pct = false;
	if (t.endsWith('%')) { pct = true; t = t.slice(0, -1); }
	let mult = 1;
	const mag = /[KkMmBb]$/.exec(t);
	if (mag) { mult = { k: 1e3, m: 1e6, b: 1e9 }[mag[0].toLowerCase() as 'k' | 'm' | 'b']; t = t.slice(0, -1); }
	const n = Number(t);
	if (!Number.isFinite(n)) return Number.NaN;
	return (sign * n * mult) / (pct ? 100 : 1);
}
// KNOWN LIMITS (documented, not bugs): compares as a MULTISET, so a value TRANSPOSITION
// between two labeled figures ("$5M/$3M" → "$3M/$5M") is not flagged; and `\d` is ASCII,
// so non-Latin numerals (Arabic-Indic / full-width) aren't tokenized. The full textual
// diff above the chip still shows every change — this cue is an advisory highlight, not a gate.
export function figureChange(before: string, after: string): { removed: string[]; added: string[] } | null {
	// Bucket display tokens by normalized value-key, so a reformat matches but a real change
	// (or a sign flip) leaves an unmatched token on each side.
	const bucket = (toks: string[]) => {
		const m = new Map<string, string[]>();
		for (const t of toks) {
			const v = tokenValue(t);
			const k = Number.isFinite(v) ? `v:${v}` : `s:${t}`;
			(m.get(k) ?? m.set(k, []).get(k))?.push(t);
		}
		return m;
	};
	const b = bucket(numericTokens(before));
	const a = bucket(numericTokens(after));
	const removed: string[] = [];
	const added: string[] = [];
	for (const [k, toks] of b) for (let i = a.get(k)?.length ?? 0; i < toks.length; i++) removed.push(toks[i]);
	for (const [k, toks] of a) for (let i = b.get(k)?.length ?? 0; i < toks.length; i++) added.push(toks[i]);
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
						<div key={i} className={cn('whitespace-pre-wrap', r.type === 'add' ? 'text-[var(--pass)]' : r.type === 'del' ? 'text-[var(--fail,#b3261e)] line-through opacity-70' : 'text-muted-foreground')}>
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
