import DOMPurify from 'dompurify';
import { ArrowUp, Check, Eye, FilePlus2, Lock, MessageCircle, RotateCcw, Share2, Sparkles, Square, TriangleAlert, Unlock, Zap } from 'lucide-react';
import * as React from 'react';
import { createPortal } from 'react-dom';
import { slideCount as deckSlideCount } from '@/components/studio/ai/architect-edits.js';
import { orSupportsCache } from '@/components/studio/ai/or-cache.js';
import { readCachingEnabled } from '@/components/studio/ai/spend.js';
import { Textarea } from '@/components/ui/textarea';
import { notify } from '@/lib/notify';
import { cn } from '@/lib/utils';
import { frontMatterBlock } from '../../lib/front-matter';
import { applyProposedEditsChecked, type ChatGrounding, type ChatReadiness, type ChatTurn, chatComplete, listStudioModels, useArchitectStatus } from './architect';
import { ChangeCard } from './ChangeCard';
import { ChatActivityRow } from './ChatActivityRow';
import { ChatAttach } from './ChatAttach';
import { ChatCodeBlock } from './ChatCodeBlock';
import { ChatCost } from './ChatCost';
import { ChatFigure, ChatFigureContext, type ChatFigureRender } from './ChatFigure';
import { ChatLiveStatus } from './ChatLiveStatus';
import { MessagePhotos, PhotoStrip } from './ChatPhotos';
import { ChatTraceDialog } from './ChatTraceDialog';
import { applyRows, applyTarget, type ChatApplyOpts, type ChatDraft, cardHistoryLabel, landingSlide, NO_ENTRY, type RowState, reconcile, rowName, rowStates, toldLine, undoRows } from './change-card';
import { autoHold } from './chat-actions';
import { thoughtTail } from './chat-activity';
import { applyCompaction, modelText, splitForCompaction, transcript } from './chat-compact';
import { isFigureLang } from './chat-figures';
import { type ChatSegment, renderMessageSegments, renderMessageSegmentsStreaming } from './chat-markdown';
import { photoNote, videoNote, videoRefusal } from './chat-photo-parts';
import { addChatPhotos, addChatVideo, discardChatVideo, MAX_CHAT_PHOTOS, photoDataUrl, videoDataUrl } from './chat-photos';
import { THINKING } from './chat-status';
import { chatLoaded, hydrateChat } from './chat-store';
import { holdWarmUps } from './first-slide';
import { classifyMedia, LIBRARY_MEDIA_ACCEPT } from './media-import';
import type { MediaRecord } from './media-store';
import { refreshAssetUrls, setActiveAssetDeck } from './media-urls';
import { CHAT_COMPOSER_BAR, CHAT_COMPOSER_STACK, CHAT_COMPOSER_TEXT, ChatEmptyCard } from './panel-shells';
import { PreviewPool } from './preview-pool';
import { cardMaxHeight, cardScrollTarget } from './proposal-pick';
import { REF_DOC_ACCEPT } from './reference-doc';
import { useReferenceDoc } from './reference-doc-ui';
import { type ChatMessage, type ChatPhoto, type ChatProposal, type ChatVideo, loadChat, loadChatDraft, loadChatMode, type StoredChatMode, saveChat, saveChatDraft, saveChatMode } from './studio-store';

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
const CHAT_SANITIZE = { ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'code', 'pre', 'a', 'ul', 'ol', 'li', 'div', 'span', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'blockquote', 'hr'], ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'start'], ALLOW_DATA_ATTR: false };
const sanitizeChat = (html: string): string => DOMPurify.sanitize(html, CHAT_SANITIZE) as unknown as string;

// One prose segment, sanitized ONCE per distinct html string. `sanitizeChat` runs DOMPurify over the
// whole fragment, and it used to run in the render body of every segment of every message in the
// transcript on EVERY render of the panel: each streamed frame, each keystroke in the composer.
// Measured on the real Studio (4x CPU throttle, a fifth turn of a thread), that was a long task on
// nearly every frame. Memoizing on the html string means a settled segment costs nothing to repaint,
// and React leaves its DOM alone because the `__html` string it compares is unchanged.
const ProseHtml = React.memo(function ProseHtml({ html }: { html: string }) {
	const safe = React.useMemo(() => sanitizeChat(html), [html]);
	// biome-ignore lint/security/noDangerouslySetInnerHtml: prose is escape-first rendered by renderProse then DOMPurify-sanitized with the chat tag profile — the single sanitized sink; code never takes this path.
	return <div dangerouslySetInnerHTML={{ __html: safe }} />;
});

// `memo` for the same reason: a past reply's text never changes, so a panel re-render (a keystroke, a
// status line, the next frame of a LATER reply) must not re-segment or re-render it.
const AssistantBody = React.memo(function AssistantBody({ text, streaming }: { text: string; streaming: boolean }) {
	const segs: ChatSegment[] = React.useMemo(() => (streaming ? renderMessageSegmentsStreaming(text) : renderMessageSegments(text)), [text, streaming]);
	return (
		<div className="cm-chat-md space-y-1.5">
			{segs.map((s, i) =>
				s.type === 'code' ? (
					// biome-ignore lint/suspicious/noArrayIndexKey: append-only segment list for one render.
					isFigureLang(s.lang) ? <ChatFigure key={i} code={s.code} lang={s.lang} /> : <ChatCodeBlock key={i} code={s.code} lang={s.lang} />
				) : (
					// biome-ignore lint/suspicious/noArrayIndexKey: append-only segment list for one render.
					<ProseHtml key={i} html={s.html} />
				),
			)}
		</div>
	);
});

// THE IN-FLIGHT REPLY LIVES OUTSIDE THE PANEL'S STATE. It used to be `useState<{deck, text}>`, set on every
// painted frame, so each frame re-rendered the whole panel: the composer, the header, and every past message
// (re-sanitizing each one). Now the text sits in this tiny store and only `LiveReply` subscribes, so a frame
// re-renders exactly the bubble that changed. `deck` still travels with the text (#1787, checker F1): the
// panel filters on it at the render, never clears it on a deck switch.
type LiveText = { deck: string; text: string };
function createLiveStore() {
	let value: LiveText | null = null;
	const listeners = new Set<() => void>();
	return {
		get: () => value,
		set(next: LiveText | null) {
			value = next;
			for (const fn of listeners) fn();
		},
		subscribe(fn: () => void) {
			listeners.add(fn);
			return () => {
				listeners.delete(fn);
			};
		},
	};
}

// Paint at most once a frame, and back off when frames get expensive. A paint's cost is the whole frame it
// caused, not only the JavaScript in it: React renders the store update in a microtask after `paint()`
// returns, and style, layout and paint follow, so the gap from a paint to the NEXT frame callback is the true
// cost (it includes the 16ms the frame would take anyway, which is taken out). The next paint then waits
// `PAINT_WAIT` times that cost, so a slow machine or a long reply keeps most of the main thread for input and
// the slide preview, and a fast one (cost near zero) still paints every frame. A paint that was queued before
// the measurement landed checks the wait again when it runs. The buffer is never lost, only shown later; the
// wait is capped so the text never looks stuck.
const FRAME_MS = 17;
const PAINT_WAIT = 3;
const PAINT_WAIT_CAP_MS = 300;
function createPaintScheduler(paint: () => void) {
	let raf = 0;
	let timer: ReturnType<typeof setTimeout> | 0 = 0;
	let notBefore = 0;
	// `-1` while the call is in flight, so a host that runs the callback synchronously (a test stub) is not
	// overwritten by the id the call returns after `frame` already cleared it.
	const queueFrame = () => {
		raf = -1;
		const id = requestAnimationFrame(frame);
		if (raf === -1) raf = id;
	};
	const queueAfter = (wait: number) => {
		timer = setTimeout(() => {
			timer = 0;
			queueFrame();
		}, wait);
	};
	function frame() {
		raf = 0;
		const t0 = performance.now();
		if (t0 < notBefore - 1) {
			queueAfter(notBefore - t0);
			return;
		}
		paint();
		// Registered before any later paint's frame callback, so it runs first in the next frame.
		requestAnimationFrame(() => {
			const whole = performance.now() - t0 - FRAME_MS;
			notBefore = t0 + Math.min(Math.max(whole, 0) * PAINT_WAIT, PAINT_WAIT_CAP_MS);
		});
	}
	return {
		request() {
			if (raf || timer) return;
			const wait = notBefore - performance.now();
			// Under one frame there is nothing to wait for: the next frame callback is already that far off.
			if (wait <= FRAME_MS) queueFrame();
			else queueAfter(wait);
		},
		cancel() {
			if (raf > 0) cancelAnimationFrame(raf);
			if (timer) clearTimeout(timer);
			raf = 0;
			timer = 0;
		},
	};
}

// The reply still arriving: the only subscriber to the live store, so a painted frame re-renders this bubble and
// nothing else. `deck` is the deck on screen; text for another deck's turn is not shown (#1787).
function LiveReply({ store, thoughts, deck, activity, onGrow }: { store: ReturnType<typeof createLiveStore>; thoughts: ReturnType<typeof createLiveStore>; deck: string; activity: string | null; onGrow: () => void }) {
	const v = React.useSyncExternalStore(store.subscribe, store.get, store.get);
	const th = React.useSyncExternalStore(thoughts.subscribe, thoughts.get, thoughts.get);
	const thought = th && th.deck === deck ? th.text : '';
	const text = v && v.deck === deck ? v.text : null;
	React.useLayoutEffect(() => {
		if (text !== null) onGrow();
	}, [text, onGrow]);
	if (text === null) return null;
	return (
		<div className="flex flex-col gap-1.5">
			<div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
				<Sparkles className="size-3 animate-pulse text-[var(--accent)]" /> Architect
			</div>
			{text !== '' && (
				<div className="text-[12.5px] leading-relaxed text-foreground">
					<AssistantBody text={text} streaming={true} />
				</div>
			)}
			{/* Under the text, where the eye already is, and present for the WHOLE turn. */}
			{thought && (
				<div className="flex max-h-8 flex-col-reverse overflow-hidden text-[11.5px] leading-4 text-muted-foreground" data-testid="chat-live-thought">
					<p className="m-0">{thoughtTail(thought)}</p>
				</div>
			)}
			<ChatLiveStatus label={activity ?? (text === '' ? THINKING : 'Writing…')} progress={`${activity ?? ''}|${text.length}`} />
		</div>
	);
}

/** Where a thread was compacted: what stands in for the earlier messages, and what it saves. */
function CompactedDivider({ info }: { info: NonNullable<ChatMessage['compacted']> }) {
	return (
		<details className="rounded-lg border border-dashed border-border px-2.5 py-1.5 text-[11.5px] text-muted-foreground" data-testid="chat-compacted">
			<summary className="cursor-pointer">
				{info.count} earlier messages compacted · about {Math.round(info.saved / 100) / 10}K tokens lighter each turn
			</summary>
			<p className="mt-1.5 whitespace-pre-wrap leading-snug text-foreground">{info.summary}</p>
			<p className="mt-1 text-[10.5px]">This briefing is what the Architect reads in place of those messages.</p>
		</details>
	);
}

type ChatNotice = { deck: string; kind: 'offline' | 'blocked' | 'error'; text: string };

const PROVIDER_LABEL: Record<string, string> = { openrouter: 'OpenRouter', openai: 'OpenAI', gemini: 'Gemini', anthropic: 'Anthropic' };
/** The notice for a turn the selected model could not answer. It names the selection's state and never a substitute. */
export function offlineNotice(r?: ChatReadiness): string {
	switch (r?.state) {
		case 'warming':
			return r.source === 'device' ? 'Your on-device model is still loading. Send again in a moment.' : 'Your API key is still opening. Send again in a moment.';
		case 'needs-key':
			return `Connect a model in Workspace → AI: your chat model (${PROVIDER_LABEL[r.provider] ?? r.provider}) needs a key, or pick another model.`;
		case 'unavailable':
			return 'Your on-device model is not loaded in this browser. Load it in Workspace → AI, or pick another model.';
		case 'unset':
			return 'Choose a chat model in Workspace → AI: connect OpenRouter or a key, or pick a free on-device model.';
		case 'retired':
			return `Your chat model was retired and ${PROVIDER_LABEL[r.provider] ?? r.provider} has no newer version of it. Choose another in Workspace → AI.`;
		default:
			return 'Connect a model in Workspace → AI and I can answer and edit your deck.';
	}
}

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

// The GATED path. Be exact about what keeps it honest, because this file has already paid
// once for a comment that claimed a guarantee the code did not have: the type says
// `seq: number`, so nothing STRUCTURAL stops a future caller passing a made-up one. What
// stops it is that this function is module-private and its only three call sites are inside
// `run()`, each passing the sequence that same call just bumped. Keep it that way — a fourth
// call site is the thing to argue with, not the signature.
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

export function ArchitectChat({ costSlot, deckId, source, aiReady, grounding, onApply, onPreview, onAutoApply, liveSession, onCreateDeck, onConnect, onManageDocs, onBusyChange, onShareTurn }: { costSlot?: HTMLElement | null; deckId: string; source: string; aiReady: boolean; grounding?: ChatGrounding; /** Apply an AI edit. `opts` carries the History label for the card's one entry and the undo step's label; returns that entry's id, so the card relabels it next time instead of adding another. */ onApply: (next: string, opts?: ChatApplyOpts) => unknown; /** Show a proposed deck in the Studio's preview without applying it; null closes it. Absent: the card offers no preview. */ onPreview?: (draft: ChatDraft | null) => void; /** Auto's apply: saves the History checkpoint FIRST and resolves false (applying nothing) when it cannot, or when the deck moved meanwhile. Absent → Auto behaves as Review. */ onAutoApply?: (next: string) => Promise<boolean>; /** A live session is open: Auto behaves as Review, so no AI edit reaches the room without a press. */ liveSession?: boolean; /** Create and open a deck the author confirmed from a chat card; returns its id, or null when it was not created. */ onCreateDeck?: (title: string, markdown: string) => string | null; onConnect: () => void; onManageDocs?: () => void; /** Live: whether a turn is in flight, so the room can see "asking the AI" (never what is asked). */ onBusyChange?: (busy: boolean) => void; /** Live: share one finished turn with the session as a card. Absent outside a session. */ onShareTurn?: ((turn: { ask: string; answer: string }) => void) | null }) {
	const [messages, setMessages] = React.useState<ChatMessage[]>(() => loadChat(deckId));
	// The deck whose stored thread `messages` was loaded from (chat-store.ts reads IndexedDB after the
	// first render). Until it is this deck, nothing is saved and nothing is sent: the thread on screen
	// may be a stand-in, and saving it would replace the stored conversation.
	const [loadedFor, setLoadedFor] = React.useState<string | null>(() => (chatLoaded(deckId) ? deckId : null));
	const ready = loadedFor === deckId;
	// The thread exactly as it was loaded, so showing it is not mistaken for a change to save.
	const loadedRef = React.useRef<ChatMessage[] | null>(ready ? messages : null);
	// The deck each LOADED list (a deck's stored thread or its stand-in) belongs to. A fast A → B → A
	// switch renders A with B's stand-in still in `messages` while A is already loaded: the owner is
	// what stops that list being saved over A. Lists the author's own actions build are not in it.
	const ownerRef = React.useRef(new WeakMap<ChatMessage[], string>());
	const [input, setInput] = React.useState<string>(() => loadChatDraft(deckId));
	const [busy, setBusy] = React.useState(false);
	// Live (2026-10-20 note §5.3): only that a turn is in flight leaves this panel, and only when the shell asks.
	const onBusyRef = React.useRef(onBusyChange);
	onBusyRef.current = onBusyChange;
	React.useEffect(() => {
		onBusyRef.current?.(busy);
	}, [busy]);
	React.useEffect(() => () => onBusyRef.current?.(false), []);
	// Turns this person shared with the session, by what they say (a turn is shared once). Not by position:
	// Regenerate puts a new reply where the shared one was.
	const [sharedTurns, setSharedTurns] = React.useState<ReadonlySet<string>>(() => new Set());
	const turnKey = (ask: string, answer: string) => `${ask}\u0000${answer}`;
	// biome-ignore lint/correctness/useExhaustiveDependencies: another deck is another transcript.
	React.useEffect(() => setSharedTurns(new Set()), [deckId]);
	// "Facts locked" — a tone/clarity-only turn: the model may improve wording but must not
	// change any number/date/name/claim (threaded to chatComplete as constrainFacts). Off by
	// default; a deliberate opt-in for a "polish, don't touch the numbers" pass.
	const [factsLocked, setFactsLocked] = React.useState(false);
	// How much the chat may do: Talk (read only), Review (edits wait for Apply; the default),
	// Auto (edits apply at once, undo from History). One choice for the workspace (studio-store).
	// Enforced by the agent's tool list and its host gate (chat-actions.ts), never by the prompt.
	const [mode, setModeState] = React.useState<StoredChatMode>(loadChatMode);
	const setMode = (m: StoredChatMode) => {
		setModeState(m);
		// Auto lasts for this visit only: the riskiest setting is never what a reload, or another deck
		// opened tomorrow, silently starts in. Talk and Review are remembered.
		saveChatMode(m === 'auto' ? 'review' : m);
	};
	const sourceRef = React.useRef(source);
	sourceRef.current = source;
	// The in-flight assistant buffer (null when idle), CARRYING THE DECK IT BELONGS TO.
	// Painted rAF-coalesced during stream. The deck travels with the text because the panel
	// renders one deck at a time while a turn keeps streaming across a deck switch: without
	// it, the pair "which text" / "which deck" lives in two places and they disagree for a
	// render — which is how the other deck's partial reply used to paint into this
	// transcript. Filtered at the render (`live`), never cleared on the switch, so switching
	// BACK shows the reply still arriving rather than a blank turn (#1787, checker F1).
	// The text itself is in `liveStore` (see createLiveStore); this is only WHICH DECK a turn is in flight for, so
	// the panel re-renders when a turn starts and ends, not on every frame between.
	const [streamingDeck, setStreamingDeck] = React.useState<string | null>(null);
	const liveStore = React.useRef<ReturnType<typeof createLiveStore>>(null as never);
	if (!liveStore.current) liveStore.current = createLiveStore();
	// The model's thinking while it streams (a provider that sends it), tail-clipped to one line for the live bubble. A store of
	// its own, for the same reason the reply has one: only the bubble re-renders. Written at most every 250 ms.
	const thoughtStore = React.useRef<ReturnType<typeof createLiveStore>>(null as never);
	if (!thoughtStore.current) thoughtStore.current = createLiveStore();
	const thoughtBuf = React.useRef('');
	const thoughtTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
	const [traceIdx, setTraceIdx] = React.useState<number | null>(null);
	// Compaction. `undoCompact` holds the thread as it was until the next send, so a briefing that dropped something the author
	// cared about is one click from undone; it is memory only, because a reload is a decision to keep the result.
	const [compacting, setCompacting] = React.useState(false);
	const [undoCompact, setUndoCompact] = React.useState<{ deck: string; messages: ChatMessage[]; after: ChatMessage[] } | null>(null);
	// The thread as the panel holds it right now, for the two places that must compare against it after an await.
	const messagesRef = React.useRef(messages);
	messagesRef.current = messages;
	// What the agent is doing between replies ("Reading a component…"), for the live bubble.
	// Panel state like `streaming`, cleared with it when the turn ends.
	const [liveActivity, setLiveActivity] = React.useState<string | null>(null);
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
	// Photos picked for the NEXT message. Ephemeral like the draft's attachments: the bytes live in the
	// Library, and a sent message keeps only the reference (studio-store `ChatPhoto`).
	const [pendingPhotos, setPendingPhotos] = React.useState<ChatPhoto[]>([]);
	// `keep` marks a clip picked FROM THE LIBRARY: taking it off the message must not delete it. A clip added from the
	// device was saved only for this message, so taking it off removes it again.
	const [pendingVideos, setPendingVideos] = React.useState<(ChatVideo & { keep?: boolean })[]>([]);
	const [addingPhotos, setAddingPhotos] = React.useState(false);
	const addingRef = React.useRef(false);
	const refDoc = useReferenceDoc(onManageDocs);
	const status = useArchitectStatus(pulse);

	// What a figure in a reply needs to draw as the open deck would: the render context the shell
	// already hands the chat for its fit check, plus the deck's own front-matter block. Keyed on the
	// front-matter STRING, not the source, so typing in the deck does not re-point a figure.
	const fm = frontMatterBlock(source);
	const fitRender = grounding?.fitRender;
	const figureRender = React.useMemo<ChatFigureRender | null>(() => (fitRender ? { options: fitRender.options, palette: fitRender.palette, mode: fitRender.mode, extra: fitRender.extra, extraCss: fitRender.extraCss, frontMatter: fm } : null), [fitRender, fm]);

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
	const liveDeckRef = React.useRef('');
	const paintRef = React.useRef<ReturnType<typeof createPaintScheduler>>(null as never);
	if (!paintRef.current)
		paintRef.current = createPaintScheduler(() => {
			// No deck guard here — the RENDER decides what is on screen. Keeping the buffer
			// current while the author is on another deck is the point: come back mid-turn
			// and the reply is where they left it, still arriving.
			liveStore.current.set({ deck: liveDeckRef.current, text: bufferRef.current });
		});
	// Pin the transcript to the newest text only while the author is already reading the newest text. Pinning
	// unconditionally yanked the panel back to the bottom on every frame, so a reply could not be scrolled up
	// to reread while it streamed.
	const stickRef = React.useRef(true);
	const onTranscriptScroll = () => {
		const el = scrollRef.current;
		if (el) stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
	};
	// The newest change card, while it is the last thing in the thread (ArchitectChat's card section below).
	const lastCardRef = React.useRef<HTMLDivElement>(null);
	const followLive = React.useCallback(() => {
		const el = scrollRef.current;
		// A card that just arrived owns the scroll: the live reply's last growth lands AFTER the slide to the card
		// (a ResizeObserver fires after the frame that started the slide), and pinning to the bottom here undid it.
		if (lastCardRef.current?.dataset.arriving !== undefined) return;
		if (el && stickRef.current) el.scrollTo?.({ top: el.scrollHeight });
	}, []);
	// THE CHANGE CARD TAKES THE ROOM. A reply's card grows to the transcript's height less two lines, and
	// when one arrives the transcript slides to it, leaving the last two lines of the REPLY'S TEXT in view
	// so the author keeps their place (proposal-pick.ts holds the math). Anything between that text and the
	// card (the "what it read and changed" line) stays in view too, so it is measured, not assumed.
	const [cardMax, setCardMax] = React.useState(0);
	const above = React.useCallback(() => {
		const card = lastCardRef.current;
		const prose = card?.parentElement?.querySelector<HTMLElement>('[data-chat-prose]') ?? scrollRef.current?.querySelector<HTMLElement>('[data-chat-prose]');
		const lh = prose ? Number.parseFloat(getComputedStyle(prose).lineHeight) : Number.NaN;
		const lineHeight = Number.isFinite(lh) && lh > 0 ? lh : 20;
		const gap = card && prose ? Math.max(CARD_GAP, card.getBoundingClientRect().top - textBottom(prose)) : CARD_GAP;
		// What the transcript holds below the card (its padding, the share row, the live-status slot). Measured,
		// because a guess here leaves the scroll short of the card and clips the top line of the reply.
		const el = scrollRef.current;
		const after = card && el ? el.scrollHeight - (card.getBoundingClientRect().bottom - el.getBoundingClientRect().top + el.scrollTop) : CARD_PAD;
		return { lineHeight, gap, padding: Math.max(CARD_PAD, Math.ceil(after)) };
	}, []);
	const fitCard = React.useCallback(() => {
		const el = scrollRef.current;
		if (el) setCardMax(el.clientHeight ? cardMaxHeight({ clientHeight: el.clientHeight, ...above() }) : 0);
	}, [above]);
	React.useLayoutEffect(() => {
		const el = scrollRef.current;
		if (!el || typeof ResizeObserver === 'undefined') return;
		fitCard();
		const ro = new ResizeObserver(fitCard);
		ro.observe(el);
		return () => ro.disconnect();
	}, [fitCard]);
	// Where the transcript settles after a turn ends or the thread changes: on a card that just arrived,
	// else at the newest text. Both effects below call this, so the later one cannot undo the earlier.
	const settleScroll = React.useCallback(() => {
		const el = scrollRef.current;
		if (!el) return;
		stickRef.current = true;
		const card = lastCardRef.current;
		if (!card || card.dataset.arriving === undefined) {
			el.scrollTo?.({ top: el.scrollHeight });
			return;
		}
		// Size the card first, then measure on the next frame, once it has re-rendered at that size: measured
		// in the same tick, the scroll was computed against the taller card and stopped short.
		fitCard();
		requestAnimationFrame(() => {
			const now = lastCardRef.current;
			if (!now || now.dataset.arriving === undefined) return;
			const cardTop = now.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop;
			const { lineHeight, gap } = above();
			const top = cardScrollTarget({ cardTop, lineHeight, gap, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight });
			const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
			el.scrollTo?.({ top, behavior: reduce ? 'auto' : 'smooth' });
		});
	}, [above, fitCard]);
	React.useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
			paintRef.current.cancel();
			if (thoughtTimer.current) {
				clearTimeout(thoughtTimer.current);
				thoughtTimer.current = null;
			}
			// NOTE: we deliberately do NOT abort on unmount — the request keeps completing
			// and commits to its originating deck (the survival contract). Only Stop aborts.
		};
	}, []);
	React.useEffect(() => {
		let live = true;
		const adopt = () => {
			if (!live) return;
			const loaded = loadChat(deckId);
			ownerRef.current.set(loaded, deckId);
			loadedRef.current = loaded;
			setMessages(loaded);
			setLoadedFor(deckId);
		};
		if (chatLoaded(deckId)) adopt();
		else {
			// This deck's stand-in until its read lands (its legacy thread, or none), never the previous
			// deck's conversation. Shown only: `ready` stays false, so nothing saves or sends.
			loadedRef.current = null;
			const standIn = loadChat(deckId);
			ownerRef.current.set(standIn, deckId);
			setMessages(standIn);
			setLoadedFor(null);
			void hydrateChat(deckId).then(adopt);
		}
		return () => {
			live = false;
		};
	}, [deckId]);
	React.useEffect(() => setInput(loadChatDraft(deckId)), [deckId]);
	// Photos picked for the next message belong to the deck they were picked on (they are saved to its
	// shelf); carrying them to another deck sent pixels the new deck cannot name.
	// biome-ignore lint/correctness/useExhaustiveDependencies: `deckId` is the trigger; the body reads nothing from it.
	React.useEffect(() => {
		setPendingPhotos([]);
		setPendingVideos((cur) => {
			for (const v of cur) if (!v.keep) void discardChatVideo(v.name);
			return [];
		});
	}, [deckId]);
	// Closing the chat unmounts it and drops what was pending, so a clip added from the device and never sent goes with
	// it, as on a deck switch above. Read through a ref: the cleanup runs once, with the state of the last render.
	const pendingVideosRef = React.useRef(pendingVideos);
	pendingVideosRef.current = pendingVideos;
	React.useEffect(
		() => () => {
			for (const v of pendingVideosRef.current) if (!v.keep) void discardChatVideo(v.name);
		},
		[],
	);
	React.useEffect(() => {
		const owner = ownerRef.current.get(messages);
		if (ready && messages !== loadedRef.current && (owner === undefined || owner === deckId)) void saveChat(deckId, messages);
		settleScroll();
	}, [deckId, messages, ready, settleScroll]);
	// biome-ignore lint/correctness/useExhaustiveDependencies: a turn starting or ending is the intentional scroll trigger.
	React.useEffect(() => {
		settleScroll();
	}, [streamingDeck]);
	React.useEffect(() => {
		saveChatDraft(deckIdRef.current, input);
	}, [input]);
	React.useEffect(() => () => saveChatDraft(deckIdRef.current, inputRef.current), []);

	// After the first turn of a thread the cached prefix is a READ, not a write — the cost
	// readout weights it accordingly. Chat state, so it is resolved here and handed down.
	// Only a request that carries Anthropic's explicit breakpoint is billed at cache rates (2x / 1.25x writes, 0.1x reads). With the switch off,
	// or on any other vendor, `explicitCache` is false and the readout prices every token at the base rate: an upper bound for the vendors that
	// cache on their own (OpenAI, Google, DeepSeek, x-ai), exact for one that does not cache at all.
	const explicitCache = status.generation === 'openrouter' && readCachingEnabled() && orSupportsCache(status.modelId ?? '');
	const primed = status.generation === 'openrouter' && (readCachingEnabled() || !orSupportsCache(status.modelId ?? '')) && messages.length > 0;
	// The money readout lives in the PANEL HEADER now (ChatCost), not in a strip of its
	// own between the transcript and the composer — that row cost a whole line of a narrow
	// panel to show two short numbers. ChatCost reads the spend gauge itself and refreshes
	// on `lattice-spend-changed`, which is why a turn ending fires that event below: it is
	// the one signal that crosses from here to a header this component doesn't own.

	const run = async (history: ChatMessage[], sendDeckId: string) => {
		// The mode this turn was SENT in: switching mid-turn changes the next turn, not this one.
		const sendMode = mode;
		const sendSource = source;
		// The reply joins the thread as it is NOW, not as it was at Send: Apply and Discard stay usable while a
		// reply streams in (Send clears Undo compaction, and compaction waits), and each saves at once, so the store
		// holds what the author did meanwhile.
		// Committing `[...history, reply]` put an applied edit back to unapplied (a second Apply edited the deck
		// twice) and brought a discarded one back. The store's thread is used only while it still ends with the
		// message this turn answers; otherwise (the deck was evicted or rewritten elsewhere) the turn's own thread.
		const commitReply = (reply: ChatMessage) => {
			const asked = history.at(-1);
			const current = chatLoaded(sendDeckId) ? loadChat(sendDeckId) : null;
			const tail = current?.at(-1);
			const base = current && asked && tail && tail.role === asked.role && tail.content === asked.content ? current : history;
			const next = [...base, reply];
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
		liveDeckRef.current = sendDeckId;
		liveStore.current.set({ deck: sendDeckId, text: '' });
		thoughtBuf.current = '';
		thoughtStore.current.set(null);
		setStreamingDeck(sendDeckId);
		const onToken = (tok: string) => {
			bufferRef.current += tok;
			// Prose arrived, so the last tool's label is finished news. Synchronous on purpose:
			// the next round's label is set by a later call, and clearing from the rAF below
			// would run AFTER it and wipe it.
			if (tok) setLiveActivity(null);
			if (mountedRef.current) paintRef.current.request();
		};
		// The Studio's warm-ups wait for the whole turn (first-slide.ts `holdWarmUps`), not only for a draft render inside
		// it: a warm-up item that starts while the model is answering is still loading when its `render_slide` runs, and
		// on a busy phone that pushed the render past its 15 s budget. Released in the `finally` below.
		const releaseWarmUps = holdWarmUps();
		try {
			// An EARLIER turn's photos are named in its text (the model can refer to asset:<name>) but not
			// re-sent: each image is billed as input every time it travels. Only the LAST turn's go as pixels.
			const lastIdx = history.length - 1;
			// A past reply that proposed edits carries what the author did with them (applied, discarded, undone), so the
			// model does not propose a discarded edit again (decision note §10).
			// What the author did with each earlier card rides the NEWEST author message, not the replies it describes:
			// rewriting an earlier turn on every card action would change the cached prompt from that turn on.
			const told = history.flatMap((m) => (m.role === 'assistant' && m.proposed?.length ? [toldLine(m.proposed, reconcile(sourceRef.current, m.proposed, rowStates(m)), !!m.autoApplied)] : [])).filter(Boolean);
			const toldNote = told.length ? `\n\n(What happened to the edits you proposed earlier, oldest first: ${told.join(' ')})` : '';
			const turns: ChatTurn[] = history.map((m, i) => ({ role: m.role, content: modelText({ ...m, content: m.role === 'user' && i !== lastIdx && (m.photos?.length || m.videos?.length) ? `${m.content}${photoNote((m.photos ?? []).map((p) => p.name), false)}${videoNote(m.videos?.length ?? 0, false)}` : m.role === 'user' && i === lastIdx && toldNote ? `${m.content}${toldNote}` : m.content }) }));
			const sentVideos = history[lastIdx]?.role === 'user' ? (history[lastIdx].videos ?? []) : [];
			const clips = (await Promise.all(sentVideos.map(async (v) => ({ name: v.name, dataUrl: await videoDataUrl(v.name).catch(() => null) })))).filter((x): x is { name: string; dataUrl: string } => !!x.dataUrl);
			if (clips.length < sentVideos.length) notify('That video is no longer in the Library, so the model did not see it.');
			const sent = history[lastIdx]?.role === 'user' ? (history[lastIdx].photos ?? []) : [];
			const seen = (await Promise.all(sent.map(async (p) => ({ name: p.name, dataUrl: await photoDataUrl(p.name).catch(() => null) })))).filter((x): x is { name: string; dataUrl: string } => !!x.dataUrl);
			if (seen.length < sent.length) notify(sent.length === 1 ? 'That photo is no longer in the Library, so the model did not see it.' : `${sent.length - seen.length} of those photos are no longer in the Library, so the model did not see them.`);
			// The model is told too: a regenerated turn whose clip was deleted otherwise reached it as only "Here is a short
			// video." with nothing attached, which invites a made-up description (checker).
			const lostClips = sentVideos.length - clips.length;
			const lostPhotos = sent.length - seen.length;
			if ((lostClips || lostPhotos) && turns[lastIdx]?.role === 'user') {
				const what = [lostClips && `${lostClips} video${lostClips === 1 ? '' : 's'}`, lostPhotos && `${lostPhotos} photo${lostPhotos === 1 ? '' : 's'}`].filter(Boolean).join(' and ');
				turns[lastIdx] = { ...turns[lastIdx], content: `${turns[lastIdx].content}\n\n(The author attached ${what} that could not be sent: deleted from the Library since. Say you could not see ${lostClips + lostPhotos === 1 ? 'it' : 'them'}; never describe ${lostClips + lostPhotos === 1 ? 'it' : 'them'}.)` };
			}
			const onActivity = (label: string) => {
				if (mountedRef.current) setLiveActivity(label);
			};
			const onReasoning = (t: string) => {
				thoughtBuf.current = (thoughtBuf.current + t).slice(-400);
				if (thoughtTimer.current) return;
				thoughtTimer.current = setTimeout(() => {
					thoughtTimer.current = null;
					if (mountedRef.current) thoughtStore.current.set({ deck: sendDeckId, text: thoughtBuf.current.replace(/\s+/g, ' ').trim().slice(-200) });
				}, 250);
			};
			const out = await chatComplete(turns, source, refDoc.docs, { onToken, onActivity, onReasoning, signal: controller.signal, mode: sendMode, constrainFacts: factsLocked, grounding: groundingRef.current, ...(seen.length ? { photos: seen } : {}), ...(clips.length ? { videos: clips } : {}) });
			if (out.status === 'offline') {
				raiseTurnNotice(sendDeckId, turnSeq, 'offline', offlineNotice(out.readiness));
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
				const reply: ChatMessage = { role: 'assistant', content: out.reply, proposed: out.proposed?.edits as ChatProposal[] | undefined, ...(out.action ? { action: out.action } : {}), ...(out.activity?.length ? { activity: out.activity } : {}), ...(out.usage ? { usage: out.usage } : {}), ...(out.trace ? { trace: out.trace } : {}) };
				// AUTO: a clean agent edit applies now, after its History checkpoint is saved. Anything
				// autoHold names (a stopped or unfinished turn, the one-shot path, a deck that moved, a live
				// session, a deletion, most of the deck rewritten) waits for Apply as in Review, and says why.
				if (sendMode === 'auto' && reply.proposed?.length && mountedRef.current && deckIdRef.current === sendDeckId) {
					const hold = !onAutoApply ? 'Auto is not available here' : autoHold({ via: out.via, clean: out.clean, aborted: controller.signal.aborted, deckChanged: sourceRef.current !== sendSource, live: !!liveSession, edits: reply.proposed, slideCount: deckSlideCount(sendSource) });
					const outcome = hold ? null : applyProposedEditsChecked(sourceRef.current, reply.proposed);
					if (hold) reply.autoHeld = hold;
					else if (outcome?.applied && !outcome.refusals.length && (await onAutoApply?.(outcome.source))) {
						reply.applied = true;
						reply.autoApplied = true;
						notify('Edit applied (Auto) — restore from History to undo.');
					} else reply.autoHeld = outcome?.refusals[0] ? `part of it could not be applied: ${outcome.refusals[0]}` : 'the undo point could not be saved, or the deck moved';
				}
				commitReply(reply);
			}
		} catch {
			raiseTurnNotice(sendDeckId, turnSeq, 'error', 'Something went wrong reaching the model — try again.');
		} finally {
			releaseWarmUps();
			abortRef.current = null;
			// CANCEL THE PENDING PAINT BEFORE CLEARING THE BUBBLE. The last token's frame can
			// still be queued when `chatComplete` resolves; it would fire after the store is cleared
			// and set the buffer BACK, so the committed reply renders twice — permanently, since
			// nothing clears `streaming` again until the next send (#1787). Unconditional: the
			// frame is this turn's regardless of which deck is on screen or whether we still are.
			paintRef.current.cancel();
			// TEARDOWN IS PANEL STATE, NOT DECK STATE. `busy` and `streaming` describe this
			// panel, and the panel has exactly one turn in flight — so they must clear when it
			// ends, whichever deck is on screen. Gated on the deck (as this was), switching
			// decks mid-turn stranded `busy` at true FOREVER: Send stayed replaced by Stop and
			// that deck could never be sent from again. Only the COMMIT is deck-scoped, and it
			// carries its own guard inside `commit`.
			if (mountedRef.current) {
				setBusy(false);
				liveStore.current.set(null);
				thoughtStore.current.set(null);
				setStreamingDeck(null);
				setLiveActivity(null);
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

	const compact = async () => {
		const split = splitForCompaction(messages);
		if (!split || busy || compacting || !ready) return;
		const sendDeckId = deckId;
		const before = messages;
		setCompacting(true);
		try {
			const [{ summarizeChat }, { deckOutputLang }] = await Promise.all([import('./chat-compact-run'), import('./studio-language')]);
			const out = await summarizeChat(transcript(split.older), deckOutputLang(source));
			if (out.status === 'blocked') return void notify(out.note);
			if (out.status !== 'ok') return void notify(out.status === 'offline' ? 'Compacting needs a connected cloud model.' : 'The model returned no summary, so nothing changed.');
			// The briefing was written from the thread as it stood at the click. If anything touched it since (a send that slipped in, a deck
			// switch), writing it back would drop that message, so say so and change nothing. The call itself was real and is already in the tally.
			if (messagesRef.current !== before || deckIdRef.current !== sendDeckId) {
				setPulse((p) => p + 1);
				globalThis.dispatchEvent?.(new Event('lattice-spend-changed'));
				return void notify(`The conversation changed while compacting, so nothing was changed. The summary cost $${out.cost.toFixed(3)}.`);
			}
			const done = applyCompaction(split, out.summary);
			saveChat(sendDeckId, done.messages);
			setMessages(done.messages);
			setUndoCompact({ deck: sendDeckId, messages: before, after: done.messages });
			setPulse((p) => p + 1);
			globalThis.dispatchEvent?.(new Event('lattice-spend-changed'));
			notify(`Compacted ${done.removed} messages. About ${Math.round(done.saved / 100) / 10}K tokens lighter on every turn; the compaction cost $${out.cost.toFixed(3)}.`);
		} catch {
			notify('Compacting failed, so nothing changed.');
		} finally {
			if (mountedRef.current) setCompacting(false);
		}
	};
	// Undo is offered only while the thread is exactly what the compaction produced: a regenerate, an applied edit or a new message makes
	// the saved "before" stale, and restoring it would delete that work.
	const canUndoCompact = !!undoCompact && undoCompact.deck === deckId && undoCompact.after === messages;
	const undoCompaction = () => {
		if (!undoCompact || !canUndoCompact) return;
		saveChat(deckId, undoCompact.messages);
		setMessages(undoCompact.messages);
		setUndoCompact(null);
	};

	// ONE SEND PER PRESS. On an iPhone the Return key often fires twice: once to commit the predictive-text word,
	// then as a real Enter. Both landed before React re-rendered, so both read the same state (text still there,
	// not busy) and both sent: the thread showed the first message twice, and the second turn cancelled the first
	// one's reply. The composing Enter is ignored below; this lock covers any two sends in one tick, whatever their
	// cause, and opens again on the next render.
	const sendLockRef = React.useRef(false);
	React.useEffect(() => {
		sendLockRef.current = false;
	});
	const send = () => {
		if (sendLockRef.current) return;
		const text = input.trim();
		if (compacting) return;
		// A photo alone is a message: the model is told what was attached either way.
		if ((!text && !pendingPhotos.length && !pendingVideos.length) || busy || addingPhotos || !ready) return;
		const sendDeckId = deckId;
		setUndoCompact(null);
		const photos = pendingPhotos;
		const videos = pendingVideos.map(({ name, durationMs }) => ({ name, durationMs }));
		setInput('');
		setPendingPhotos([]);
		setPendingVideos([]);
		saveChatDraft(sendDeckId, '');
		sendLockRef.current = true;
		const history: ChatMessage[] = [...messages, { role: 'user', content: text || (videos.length ? 'Here is a short video.' : photos.length === 1 ? 'Here is a photo.' : 'Here are some photos.'), ...(photos.length ? { photos } : {}), ...(videos.length ? { videos } : {}) }];
		saveChat(sendDeckId, history);
		if (deckIdRef.current === sendDeckId) setMessages(history);
		void run(history, sendDeckId);
	};

	/**
	 * Can this conversation take photos and clips right now? Cloud tier only (the on-device tiers cannot see), and a model
	 * the catalog says cannot read photos or video is refused here, in words, rather than after the author has typed the
	 * question. Resolves which of the two kinds may go; the same rule for a file from the device and one from the Library.
	 */
	const mediaGate = async (wantImages: boolean, wantClips: boolean): Promise<{ images: boolean; clips: boolean }> => {
		if (status.generation !== 'openrouter') {
			notify('Photos and video need a cloud model that can see — connect one in Workspace → AI.');
			return { images: false, clips: false };
		}
		let images = wantImages;
		let clips = wantClips;
		try {
			if (images || clips) {
				const known = (await listStudioModels()).find((m) => m.id === status.modelId);
				if (images && known && known.vision === false) {
					notify(`${known.name || 'This model'} can't read photos — pick one marked "vision" in the model menu.`);
					images = false;
				}
				// `video` is absent on a catalog cached before the field existed: unknown, so allowed, and the
				// model's own refusal is turned into the same advice (describeModelError).
				if (clips && known && known.video === false) {
					notify(`${known.name || 'This model'} can't read video — pick one marked "video" in the model menu.`);
					clips = false;
				}
			}
		} catch {
			/* catalog unreachable: the model's own answer says it if it cannot see */
		}
		return { images, clips };
	};

	// Photos and clips from the device picker (or a paste): into the Library on THIS deck's shelf, then pending for the
	// next message.
	const attachMedia = async (files: File[]) => {
		const forDeck = deckId;
		// By `classifyMedia`, which falls back to the extension: some pickers hand a `.mov` over with an empty type, and
		// split on `type` it was sent down the photo path and refused as "isn't an image" (checker).
		let clips = files.filter((f) => classifyMedia(f) === 'video');
		let images = files.filter((f) => classifyMedia(f) !== 'video');
		const room = MAX_CHAT_PHOTOS - pendingPhotos.length;
		// Each kind is judged on its own: a refusal for one never drops the other (a full shelf of
		// photos still lets the clip in, and a clip already pending still lets the photos in).
		if (images.length && room <= 0) {
			notify(`A message can carry ${MAX_CHAT_PHOTOS} photos — remove one first.`);
			images = [];
		}
		if (clips.length && pendingVideos.length) {
			notify('A message can carry one video — remove it first.');
			clips = [];
		}
		if (!images.length && !clips.length) return;
		const gate = await mediaGate(images.length > 0, clips.length > 0);
		if (!gate.images) images = [];
		if (!gate.clips) clips = [];
		if (!images.length && !clips.length) return;
		setAddingPhotos(true);
		try {
			if (images.length) {
				const res = await addChatPhotos(images.slice(0, room), forDeck);
				if (res.photos.length) {
					// The preview, the Library and the editor's completion learn of the new shelf entry.
					await setActiveAssetDeck(forDeck);
					await refreshAssetUrls();
					// Only if the author is still on the deck the photo was saved for.
					if (deckIdRef.current === forDeck) setPendingPhotos((cur) => [...cur, ...res.photos].slice(0, MAX_CHAT_PHOTOS));
				}
				if (images.length > room) notify(`Only the first ${room} photo${room === 1 ? '' : 's'} fit — a message carries ${MAX_CHAT_PHOTOS}.`);
				if (res.renamed.length) notify(`${res.renamed.slice(0, 2).join('; ')}.`);
				if (res.failed.length) notify(res.failed.slice(0, 2).join(' '));
			}
			if (clips.length) {
				if (clips.length > 1) notify('A message can carry one video — using the first.');
				const got = await addChatVideo(clips[0], forDeck);
				if ('error' in got) notify(got.error);
				else if (deckIdRef.current === forDeck) setPendingVideos([got.video]);
				else void discardChatVideo(got.video.name); // the author left the deck while it was saved: nothing will send it
			}
		} finally {
			setAddingPhotos(false);
		}
	};
	// One add at a time, and the flag is taken BEFORE the first await: `room` and `pendingVideos` are read
	// from the last render, so two pastes that both passed a late check each saw room for the whole
	// limit (and the second clip replaced the first, leaking its bytes).
	const addPhotos = async (files: File[]) => {
		if (addingRef.current) {
			notify('Still adding the last attachment — one moment.');
			return;
		}
		addingRef.current = true;
		try {
			await attachMedia(files);
		} finally {
			addingRef.current = false;
		}
	};

	// What the device picker returns is sorted by what each file is: a photo or a clip goes through the media path, anything
	// else is a reference document. Each path judges its own files and says why when it refuses one.
	const onDeviceFiles = (files: File[]) => {
		const media = files.filter((f) => classifyMedia(f) !== null);
		const docs = files.filter((f) => classifyMedia(f) === null);
		if (media.length) void addPhotos(media);
		if (docs.length) void refDoc.addFiles(docs);
	};

	/** Take a pending clip off the message. A clip added from the device was saved only for this message, so it goes too;
	 *  one picked from the Library stays in the Library. */
	const removePendingVideo = (name: string) => {
		if (!pendingVideos.find((v) => v.name === name)?.keep) void discardChatVideo(name);
		setPendingVideos((cur) => cur.filter((v) => v.name !== name));
	};

	/** A Library photo on or off this message. It is already a Library asset: nothing is imported or copied. */
	const toggleLibraryPhoto = async (m: MediaRecord) => {
		if (pendingPhotos.some((p) => p.name === m.name)) {
			setPendingPhotos((cur) => cur.filter((p) => p.name !== m.name));
			return;
		}
		if (pendingPhotos.length >= MAX_CHAT_PHOTOS) {
			notify(`A message can carry ${MAX_CHAT_PHOTOS} photos — remove one first.`);
			return;
		}
		if (!(await mediaGate(true, false)).images) return;
		setPendingPhotos((cur) => (cur.some((p) => p.name === m.name) || cur.length >= MAX_CHAT_PHOTOS ? cur : [...cur, { name: m.name, width: m.width, height: m.height }]));
	};

	/** A Library clip on or off this message, under the same size and length rules as one from the device. One clip per
	 *  message: picking another takes the first off. */
	const toggleLibraryVideo = async (m: MediaRecord) => {
		// A device clip still saving would replace this one when it lands; wait for it (checker).
		if (addingRef.current) return;
		if (pendingVideos.some((v) => v.name === m.name)) {
			removePendingVideo(m.name);
			return;
		}
		const why = videoRefusal((m.durationMs ?? 0) / 1000, m.bytes);
		if (why) {
			notify(why);
			return;
		}
		if (!(await mediaGate(false, true)).clips) return;
		for (const v of pendingVideos) if (!v.keep) void discardChatVideo(v.name);
		setPendingVideos([{ name: m.name, durationMs: m.durationMs ?? 0, keep: true }]);
	};

	const stop = () => abortRef.current?.abort();

	const regenerate = () => {
		if (busy || compacting || !ready) return;
		// Re-send the thread up to and including the last user turn (drop a trailing
		// assistant reply so the model answers fresh).
		let end = messages.length;
		while (end > 0 && messages[end - 1].role === 'assistant') end--;
		if (!end) return;
		void run(messages.slice(0, end), deckId);
	};

	// THE CHANGE CARD'S ROWS (ChangeCard.tsx, change-card.ts). Every action re-judges its rows against the deck as it
	// is NOW, finding each slide by its text, so a row applies (or undoes) only while its slide reads as the card
	// expects. One History entry per card: the first action saves it, later ones relabel it (decision note §6).
	const [rowNote, setRowNote] = React.useState<{ msg: number; row: number; text: string } | null>(null);
	// Every action reads the thread and the deck NOW (through refs), never as they were when a button or a preview was
	// drawn: Apply pressed in a preview opened before a Discard must not bring the discarded row back. And every action
	// starts from the states the DECK has (`reconcile`), so a ⌘Z the card did not see cannot leave a row lying.
	const runRows = (idx: number, rows: number[], undo: boolean) => {
		if (compacting || !ready) return;
		const m = messagesRef.current[idx];
		if (!m?.proposed?.length) return;
		const edits = m.proposed;
		const src = sourceRef.current;
		const states = reconcile(src, edits, rowStates(m));
		const ok = rows.filter((k) => (undo ? states[k] === 'applied' : states[k] === 'waiting' || states[k] === 'undone'));
		if (!ok.length) return;
		const out = (undo ? undoRows : applyRows)(src, edits, states, ok);
		const lead = (k: number) => rowName(edits[k]).lead;
		const refusal = out.refused.length ? out.reasons[out.refused[0]] : null;
		setRowNote(refusal ? { msg: idx, row: out.refused[0], text: refusal } : null);
		// Nothing landed: the refusal is said ON THE ROW it concerns (the card shows it outside the fold), once.
		if (!out.done.length) return;
		const next: RowState[] = states.map((s, k) => (out.done.includes(k) ? (undo ? 'undone' : 'applied') : s));
		const at = m.cardAt ?? Date.now();
		const prev = messagesRef.current[idx - 1];
		const ask = prev?.role === 'user' ? prev.content : '';
		const names = out.done.map(lead);
		const step = `${undo ? 'Undo AI edit' : 'AI chat edit'}: ${names.length > 2 ? `${names.length} changes` : names.join(', ')}`;
		// Show where the change landed, found in the new deck by its text.
		const shown = [...out.done].sort((a, b) => edits[a].raw.slide - edits[b].raw.slide)[0];
		const slide = (undo ? landingSlide(out.source, { ...edits[shown], after: edits[shown].before, action: edits[shown].action === 'insert' ? 'delete' : edits[shown].action === 'delete' ? 'insert' : edits[shown].action }) : landingSlide(out.source, edits[shown])) ?? undefined;
		// Auto saved its own History entry before it applied, so its card never saves another (NO_ENTRY).
		const checkpoint = m.cardCheckpoint ?? (m.autoApplied ? NO_ENTRY : undefined);
		const cp = onApply(out.source, { label: cardHistoryLabel(ask, new Date(at), next), step, checkpoint, slide });
		setMessages((cur) => cur.map((x, i) => (i === idx ? { ...x, rows: next, applied: next.includes('applied') || undefined, cardAt: at, cardCheckpoint: typeof cp === 'string' ? cp : x.cardCheckpoint } : x)));
		const n = out.done.length;
		notify(undo ? `Undid ${n === 1 ? names[0] : `${n} changes`} — press ⌘Z to redo.` : `${n === 1 ? 'Edit applied' : `Applied ${n} edits`} — undo any of it from the card.`);
	};
	const setRows = (idx: number, rows: number[], state: RowState) => {
		if (compacting || !ready) return;
		setMessages((cur) => cur.map((x, i) => (i === idx && x.proposed ? { ...x, rows: reconcile(sourceRef.current, x.proposed, rowStates(x)).map((s, k) => (rows.includes(k) ? state : s)) } : x)));
		// A discarded row leaves an open preview of it, which would otherwise still offer to apply it.
		if (state === 'discarded' && previewingRef.current?.msg === idx && previewingRef.current.rows.some((k) => rows.includes(k))) {
			setPreviewing(null);
			onPreview?.(null);
		}
	};
	// PREVIEW FOR REAL (decision note §4): the Studio's preview shows these rows applied, writing nothing. Any change
	// to the deck closes it, because the preview would otherwise show a draft of a deck that no longer exists.
	const [previewing, setPreviewing] = React.useState<{ msg: number; rows: number[] } | null>(null);
	const previewingRef = React.useRef(previewing);
	previewingRef.current = previewing;
	const previewRows = (idx: number, rows: number[] | null) => {
		const m = messagesRef.current[idx];
		if (!rows || !m?.proposed?.length || !onPreview) {
			setPreviewing(null);
			onPreview?.(null);
			return;
		}
		const edits = m.proposed;
		const src = sourceRef.current;
		const states = reconcile(src, edits, rowStates(m));
		const draft = applyRows(src, edits, states, rows);
		if (!draft.done.length) return;
		// The slide to show: where the first previewed row lands in the draft (an insert shows its new slide).
		const k = [...draft.done].sort((a, b) => edits[a].raw.slide - edits[b].raw.slide)[0];
		const target = applyTarget(src, edits, states, k);
		const slide = landingSlide(draft.source, edits[k]) ?? (target ? Math.max(1, target.slide) : 1);
		setPreviewing({ msg: idx, rows: draft.done });
		onPreview({ source: draft.source, slide, beforeSlide: edits[k].action === 'insert' || !target ? null : target.slide, title: draft.done.length === 1 ? rowName(edits[k]).lead.toLowerCase() : `${draft.done.length} changes`, count: draft.done.length, apply: () => runRows(idx, draft.done, false), onClosed: () => setPreviewing(null) });
	};
	// biome-ignore lint/correctness/useExhaustiveDependencies: a changed deck or a switch of deck is the trigger.
	React.useEffect(() => {
		setPreviewing(null);
		onPreview?.(null);
	}, [source, deckId]);
	React.useEffect(() => () => onPreview?.(null), [onPreview]);
	// THE CONFIRM FOR AN ACT. Only this press creates the deck; the model queued it and cannot press
	// it. The conversation follows the author to the new deck: it is saved under the new deck's id
	// before the shell switches, so the next turn continues the same thread there.
	const answerAction = (idx: number, yes: boolean) => {
		if (busy || compacting || !ready) return;
		const m = messages[idx];
		if (!m?.action || m.action.state) return;
		// Once answered the card keeps only what it shows: the Markdown is dropped, so a thread does
		// not carry a whole deck in storage after it exists (or was declined).
		const answered = (state: 'done' | 'declined') => messages.map((x, i) => (i === idx && x.action ? { ...x, action: { ...x.action, markdown: '', state } } : x));
		if (!yes) {
			setMessages(answered('declined'));
			return;
		}
		let id: string | null = null;
		try {
			id = onCreateDeck?.(m.action.title, m.action.markdown) ?? null;
		} catch {
			id = null;
		}
		if (!id) {
			raiseNotice(deckId, 'error', 'The new deck could not be created.');
			return;
		}
		const next = answered('done');
		saveChat(deckId, next);
		// The new deck's chat starts with one line pointing back, not a copy of this thread: the old
		// turns are about the old deck, and a copy would carry its pending edits and double the storage.
		saveChat(id, [{ role: 'assistant', content: `I created this ${m.action.slides || m.action.outline.length}-slide deck from our chat on the deck you were in before. Ask me about it here; that conversation stays with that deck.` }]);
		setMessages(next);
	};

	// One element, two destinations (this panel's own header row, or a host header's actions
	// slot via a portal) — built once so the two can't drift.
	const costReadout = <ChatCost onManageModels={onConnect} source={source} grounding={grounding} docs={refDoc.docs} primed={primed} explicitCache={explicitCache} deckId={deckId} messages={messages} compact={{ run: compact, busy: compacting || busy, undo: canUndoCompact ? undoCompaction : null }} />;

	// WHAT IS ON SCREEN, as opposed to what is in flight. The buffer belongs to the deck that
	// asked for it; on any other deck this panel shows that deck's transcript and nothing of
	// the turn but the Stop button (which is panel-wide — the single-slot abort/buffer refs
	// make a second concurrent turn impossible, so the guard has to be).
	const live = streamingDeck === deckId;
	// `!busy` is part of "empty": without it a deck with no history showed the *nothing has
	// happened here* placeholder while the composer showed Stop — a contradiction on screen
	// (checker F2). A turn in flight elsewhere leaves this transcript blank, not reassuring.
	// Already this deck's — the store is keyed by deck, so there is nothing left to filter.
	// Named apart from `notice` only because the render below reads it twice.
	const shownNotice = notice;
	const empty = messages.length === 0 && !live && !shownNotice && !busy;

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			{/* The cost readout lives in the HOST's header, never in a row of its own. It used to own a
			    full-width strip between the transcript and the composer: a whole line of the narrowest
			    panel in the app, spent on two short numbers. Every host now draws the shared PanelHeader
			    (the phone sheet, the tablet sheet, the docked column since §3d of
			    2026-11-15-one-side-pane.md) and passes `costSlot`, an element in that header's actions,
			    and the readout is portaled into it. A portal rather than props because the two facts the
			    price needs (the attached reference docs, and whether this thread is already warm) are
			    chat state, and hoisting them to the host would be a much larger change than moving one
			    element. */}
			{costSlot ? createPortal(costReadout, costSlot) : null}
			<div ref={scrollRef} onScroll={onTranscriptScroll} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
				{/* ONE POOL FOR THE TRANSCRIPT. Figures in replies are tiles in it, so a long conversation
				    holds a handful of live frames however many figures it has (the bake-off decision). */}
				<ChatFigureContext.Provider value={figureRender}>
				<PreviewPool className="space-y-3" baseSlots={4}>
				{empty && <ChatEmptyCard aiReady={aiReady} mode={mode} />}
				{messages.map((m, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: append-only chat log — index is stable identity.
					<React.Fragment key={i}>
					{m.compacted && <CompactedDivider info={m.compacted} />}
					{m.role === 'user' ? (
						<div className="flex justify-end">
							<div className="flex max-w-[92%] flex-col items-end gap-1.5">
								{m.photos?.length || m.videos?.length ? <MessagePhotos photos={m.photos ?? []} videos={m.videos} deckId={deckId} /> : null}
								<div className="whitespace-pre-wrap rounded-2xl bg-primary px-3 py-2 text-[12.5px] leading-relaxed text-primary-foreground">{m.content}</div>
							</div>
						</div>
					) : (
						<div className="flex flex-col gap-1.5">
							<div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
								<Sparkles className="size-3 text-[var(--accent)]" /> Architect
							</div>
							<div data-chat-prose className="text-[12.5px] leading-relaxed text-foreground">
								<AssistantBody text={m.content} streaming={false} />
							</div>
							<ChatActivityRow activity={m.activity} hasTrace={!!m.trace} onOpen={() => setTraceIdx(i)} />
							{isDrawableAction(m.action) ? <ActionConfirm action={m.action} disabled={busy || compacting || !onCreateDeck} onAnswer={(yes) => answerAction(i, yes)} /> : null}
							{m.proposed?.length ? (
								(() => {
									const states = reconcile(source, m.proposed, rowStates(m));
									const live = states.includes('waiting') && i === messages.length - 1;
									return (
										<div ref={i === messages.length - 1 ? lastCardRef : undefined} data-arriving={live && !loadedRef.current?.includes(m) ? '' : undefined} className={cn(live && !loadedRef.current?.includes(m) && 'motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-6 motion-safe:duration-300 motion-safe:ease-out')}>
											<ChangeCard
												edits={m.proposed}
												states={states}
												source={source}
												kind={m.autoApplied ? 'auto' : 'review'}
												note={m.autoHeld && states.includes('waiting') ? `Auto left this for you to apply: ${m.autoHeld}.` : undefined}
												onApply={(rows) => runRows(i, rows, false)}
												onUndo={(rows) => runRows(i, rows, true)}
												onDiscard={(rows) => setRows(i, rows, 'discarded')}
												onRestore={(row) => setRows(i, [row], 'waiting')}
												onPreview={onPreview ? (rows) => previewRows(i, rows) : undefined}
												previewing={previewing?.msg === i ? previewing.rows : null}
												listMax={cardMax ? Math.max(160, cardMax - 120) : undefined}
												rowNote={rowNote?.msg === i ? rowNote : null}
												disabled={compacting || !ready}
											/>
										</div>
									);
								})()
							) : null}
							{/* Live: a turn reaches the session only when its owner shares it (§5.3). */}
							{onShareTurn && m.content.trim() && messages[i - 1]?.role === 'user' ? (
								sharedTurns.has(turnKey(messages[i - 1].content, m.content)) ? (
									<span className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground" data-live-shared-turn>
										<Check className="size-3" /> Shared with the session
									</span>
								) : (
									<button
										type="button"
										onClick={() => {
											onShareTurn({ ask: messages[i - 1].content, answer: m.content });
											setSharedTurns((was) => new Set(was).add(turnKey(messages[i - 1].content, m.content)));
										}}
										className="inline-flex w-fit items-center gap-1 rounded-md px-1 py-0.5 text-[11px] font-semibold text-muted-foreground hover:text-[var(--accent)]"
										data-live-share-turn
									>
										<Share2 className="size-3" /> Share with the session
									</button>
								)
							) : null}
						</div>
					)}
					</React.Fragment>
				))}
				{traceIdx !== null && messages[traceIdx]?.trace && <ChatTraceDialog trace={messages[traceIdx].trace as NonNullable<ChatMessage['trace']>} usage={messages[traceIdx].usage} renderMarkdown={(t) => <AssistantBody text={t} streaming={false} />} open onOpenChange={(v) => !v && setTraceIdx(null)} />}
				{live && <LiveReply store={liveStore.current} thoughts={thoughtStore.current} deck={deckId} activity={liveActivity} onGrow={followLive} />}
				{shownNotice && (
					<div className={cn('flex items-start gap-2 rounded-xl border px-3 py-2 text-[12px] leading-relaxed', shownNotice.kind === 'blocked' ? 'border-[var(--warn,#9a6a00)]/40 text-[var(--warn,#9a6a00)]' : 'border-border text-muted-foreground')}>
						<TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
						{/* min-w-0 + break-words: a provider's message can carry a long URL, which ran past the box. */}
						<span className="min-w-0 break-words [overflow-wrap:anywhere]">{shownNotice.text}</span>
					</div>
				)}
				</PreviewPool>
				</ChatFigureContext.Provider>
			</div>

			<div className="flex flex-col gap-1.5 border-t border-border p-2.5">
				{refDoc.chip}
				<PhotoStrip photos={pendingPhotos} videos={pendingVideos} onRemoveVideo={removePendingVideo} deckId={deckId} busy={addingPhotos} onRemove={(name) => setPendingPhotos((cur) => cur.filter((p) => p.name !== name))} />
				{/* LAYOUT. The field takes its own full-width line and the controls sit on a bar under it
					    (`CHAT_COMPOSER_STACK` / `_BAR` in `panel-shells.tsx`). In one row the five buttons took a third of a
					    phone's width and left the field ~215px. Padding is p-2 on every side and clears the `rounded-xl`
					    corner. The attach and Library buttons are 32px with 8px between them: two 28px targets 2px apart
					    let iOS's tap adjustment hand a Library tap to the file input beside it. */}
				<div className={cn(CHAT_COMPOSER_STACK, 'focus-within:border-[var(--accent)]')}>
					{/* `block` is load-bearing: the shadcn base sets `display:flex` on the field, which wrecks a textarea's
					    own text layout (800 characters measured as 67 wrapped lines against a ~72px-wide box).
					    `min-h-7` + `py-[5px]` centers a single line in 28px. It grows with the prompt, to FOUR rows,
					    so a typical instruction is visible while it is written. */}
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
						onPaste={(e) => {
							// A picture on the clipboard (a screenshot, a copied image) is a photo, not text.
							const imgs = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
							if (!imgs.length) return;
							e.preventDefault();
							void addPhotos(imgs);
						}}
						onKeyDown={(e) => {
							// An Enter that only commits a predictive-text or IME word is not a send (iOS fires it, then a real Enter).
							if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
								e.preventDefault();
								send();
							}
						}}
						rows={1}
						placeholder={aiReady ? 'Ask or instruct…' : 'Connect a model to chat…'}
						aria-label="Message the Architect"
						className={CHAT_COMPOSER_TEXT}
					/>
					<div className={CHAT_COMPOSER_BAR}>
					<div className="flex items-center gap-2">
					<ChatAttach
						deckId={deckId}
						deviceAccept={`${LIBRARY_MEDIA_ACCEPT},${REF_DOC_ACCEPT}`}
						onDeviceFiles={onDeviceFiles}
						savedDocs={refDoc.saved}
						activeDocIds={new Set(refDoc.docs.map((d) => d.id).filter((id): id is string => !!id))}
						onToggleDoc={(rec) => void refDoc.toggleSaved(rec)}
						onRefreshDocs={refDoc.refresh}
						photoNames={new Set(pendingPhotos.map((p) => p.name))}
						videoNames={new Set(pendingVideos.map((v) => v.name))}
						onTogglePhoto={(m) => void toggleLibraryPhoto(m)}
						onToggleVideo={(m) => void toggleLibraryVideo(m)}
						onManage={onManageDocs}
						hasAttachments={refDoc.docs.length > 0 || pendingPhotos.length > 0 || pendingVideos.length > 0}
					/>
					<ChatModeButton mode={mode} onChange={setMode} />
					<button
						type="button"
						onClick={() => setFactsLocked((v) => !v)}
						title={factsLocked ? 'Preserve facts: ON — asking the model to change wording only, not numbers or names. Best-effort — review the diff to confirm.' : 'Preserve facts — ask the model to improve wording without changing numbers or names (best-effort; review the diff).'}
						aria-label="Preserve facts — ask the model not to change numbers or names"
						aria-pressed={factsLocked}
						className={cn('grid size-8 shrink-0 place-items-center rounded-lg', factsLocked ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-muted-foreground hover:text-foreground')}
					>
						{factsLocked ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
					</button>
					{messages.some((m) => m.role === 'assistant') && !busy && (
						<button type="button" onClick={regenerate} aria-label="Regenerate last reply" className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:text-foreground">
							<RotateCcw className="size-3.5" />
						</button>
					)}
					</div>
					{busy ? (
						<button type="button" onClick={stop} aria-label="Stop" className="grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--fail-fill,#b3261e)] text-white">
							<Square className="size-3.5" />
						</button>
					) : (
						<button type="button" onClick={send} disabled={(!input.trim() && !pendingPhotos.length && !pendingVideos.length) || addingPhotos || !ready} aria-label="Send" className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40">
							<ArrowUp className="size-4" />
						</button>
					)}
					</div>
				</div>
			</div>
		</div>
	);
}

/** The bottom of the last line of TEXT in `el`, not of its box: a reply's last paragraph carries spacing below
 *  it, and counting that as a line left only one and a half lines in view. */
function textBottom(el: HTMLElement): number {
	const range = document.createRange?.();
	if (!range) return el.getBoundingClientRect().bottom;
	range.selectNodeContents(el);
	const rects = Array.from(range.getClientRects?.() ?? []).filter((r) => r.height > 0);
	return rects.length ? Math.max(...rects.map((r) => r.bottom)) : el.getBoundingClientRect().bottom;
}

// The change card's spacing in the transcript: the least room between the reply's text and the card
// (the message column's gap-1.5 plus the card's mt-1), and the transcript's py-3 below it.
const CARD_GAP = 10;
const CARD_PAD = 12;

// ── The chat mode button and the act confirm ─────────────────────────────────

const MODE_META: Record<StoredChatMode, { label: string; hint: string; Icon: typeof Eye }> = {
	talk: { label: 'Talk', hint: 'Talk: the chat reads and answers, and changes nothing.', Icon: MessageCircle },
	review: { label: 'Review', hint: 'Review: edits wait for you to apply them; a new deck asks first.', Icon: Eye },
	auto: { label: 'Auto', hint: 'Auto (this visit only): clean edits apply at once, undo from History; deleting slides, big rewrites and a new deck still ask first.', Icon: Zap },
};
// From the default the next press is Talk, the safe neighbor; Auto takes two deliberate presses.
const MODE_ORDER: StoredChatMode[] = ['review', 'talk', 'auto'];

/** One button on the composer bar. Each press moves to the next mode; the label always says
 *  which mode is on. The model can neither see nor press it: it only reads the mode line. */
export function ChatModeButton({ mode, onChange }: { mode: StoredChatMode; onChange: (m: StoredChatMode) => void }) {
	const meta = MODE_META[mode];
	const next = MODE_ORDER[(MODE_ORDER.indexOf(mode) + 1) % MODE_ORDER.length];
	return (
		<button
			type="button"
			onClick={() => onChange(next)}
			title={`${meta.hint} Press for ${MODE_META[next].label}.`}
			aria-label={`Chat mode: ${meta.label}. Press for ${MODE_META[next].label}.`}
			data-chat-mode={mode}
			className={cn('flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold', mode === 'review' ? 'text-muted-foreground hover:text-foreground' : 'bg-[var(--accent-soft)] text-[var(--accent)]')}
		>
			<meta.Icon className="size-3.5" />
			<span className="max-[420px]:sr-only">{meta.label}</span>
		</button>
	);
}

/** The confirm a queued act waits on. Drawn by the Studio from the action's own fields (title,
 *  slide headings), never from the model's prose, so injected text cannot dress it up. */
function ActionConfirm({ action, disabled, onAnswer }: { action: NonNullable<ChatMessage['action']>; disabled: boolean; onAnswer: (yes: boolean) => void }) {
	if (action.state === 'done') return <span className="flex items-center gap-1 text-[11px] font-semibold text-[var(--pass)]"><Check className="size-3" />Created “{action.title}”</span>;
	if (action.state === 'declined') return <span className="text-[11px] font-semibold text-muted-foreground">New deck not created</span>;
	const shown = action.outline.slice(0, 8);
	const total = action.slides || action.outline.length;
	return (
		<fieldset aria-label={`Create a new deck: ${action.title}`} className="min-w-0 rounded-lg border border-border bg-card p-3 text-[13px]">
			<div className="flex items-center gap-1.5 font-semibold">
				<FilePlus2 className="size-3.5 shrink-0" />
				<span className="min-w-0 truncate">Create a new deck: “{action.title}”</span>
			</div>
			<ol className="mt-1.5 list-decimal pl-5 text-muted-foreground">
				{shown.map((t, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: headings repeat; the order is the identity.
					<li key={i} className="truncate">{t}</li>
				))}
			</ol>
			{total > shown.length ? <div className="pl-5 text-muted-foreground">and {total - shown.length} more slides</div> : null}
			{action.errors > 0 ? <div className="mt-1.5 flex items-center gap-1 text-[11px] text-[var(--warn,#9a6a00)]"><TriangleAlert className="size-3 shrink-0" />The checker found {action.errors} problem{action.errors === 1 ? '' : 's'} in it; fix them after it opens.</div> : null}
			<div className="mt-2 flex gap-2">
				<button type="button" disabled={disabled} onClick={() => onAnswer(true)} className="rounded-lg bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground disabled:opacity-40">Create and open</button>
				<button type="button" disabled={disabled} onClick={() => onAnswer(false)} className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-muted-foreground hover:text-foreground disabled:opacity-40">Not now</button>
			</div>
		</fieldset>
	);
}

/** A stored action the confirm can draw. Chat history comes back from storage and from backups, so a
 *  hand-edited or truncated one is skipped rather than crashing the panel. */
function isDrawableAction(a: ChatMessage['action']): a is NonNullable<ChatMessage['action']> {
	return !!a && a.kind === 'create_deck' && typeof a.title === 'string' && typeof a.markdown === 'string' && Array.isArray(a.outline) && a.outline.every((t) => typeof t === 'string');
}
