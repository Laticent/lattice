import { ArrowUp, Check, Sparkles, X } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { type ChatTurn, chatComplete } from './architect';
import { useReferenceDoc } from './reference-doc-ui';
import { type ChatMessage, loadChat, loadChatDraft, saveChat, saveChatDraft } from './studio-store';

// The Architect chat — a real conversational thread (not a fixed card panel).
// Each turn runs through the connected model with the deck in context; when the
// model proposes edits, the reply carries a reviewable diff card (Apply / Discard)
// so nothing changes the deck until the author accepts it. History persists per
// deck; with no model connected it degrades honestly (points at Workspace).

export function ArchitectChat({ deckId, source, aiReady, onApply, onConnect, onManageDocs, notify }: { deckId: string; source: string; aiReady: boolean; onApply: (next: string) => void; onConnect: () => void; onManageDocs?: () => void; notify: (m: string) => void }) {
	const [messages, setMessages] = React.useState<ChatMessage[]>(() => loadChat(deckId));
	// Draft is restored from the store so a closed/unmounted panel keeps what was
	// being typed (the activity-bar model closes the panel entirely).
	const [input, setInput] = React.useState<string>(() => loadChatDraft(deckId));
	const [busy, setBusy] = React.useState(false);
	const scrollRef = React.useRef<HTMLDivElement>(null);
	// A reference doc grounds the whole conversation (#640) — kept across turns (a
	// chat about "the attached brand deck" spans several questions); the chip's ✕
	// removes it. Its tokens are billed each turn, as the chip states.
	const refDoc = useReferenceDoc(notify, onManageDocs);

	// Latest-value refs so an in-flight request can persist its reply to the RIGHT
	// deck and guard the UI update — a `send` may resolve after the panel unmounts
	// (bar-closed) or after a deck switch, and the model's reply must not be lost.
	const deckIdRef = React.useRef(deckId);
	deckIdRef.current = deckId;
	const inputRef = React.useRef(input);
	inputRef.current = input;

	// Reload the thread AND the draft when the deck changes (this component is not
	// re-keyed on deck switch — deckId changes in place).
	React.useEffect(() => setMessages(loadChat(deckId)), [deckId]);
	React.useEffect(() => setInput(loadChatDraft(deckId)), [deckId]);
	React.useEffect(() => {
		saveChat(deckId, messages);
		scrollRef.current?.scrollTo?.({ top: scrollRef.current.scrollHeight });
	}, [deckId, messages]);
	// Persist the draft as it changes — keyed on `input` ONLY: a deck SWITCH must not
	// fire this with the outgoing deck's text and clobber the incoming deck's draft
	// (the reload effect above sets the incoming text). The deck is read via ref so
	// each save targets the current deck. Also saved on unmount, so closing the panel
	// mid-type never drops it.
	React.useEffect(() => { saveChatDraft(deckIdRef.current, input); }, [input]);
	React.useEffect(() => () => saveChatDraft(deckIdRef.current, inputRef.current), []);

	const send = async () => {
		const text = input.trim();
		if (!text || busy) return;
		const sendDeckId = deckId;
		setInput('');
		saveChatDraft(sendDeckId, '');
		const history: ChatMessage[] = [...messages, { role: 'user', content: text }];
		// commit = update the UI IF we're still on this deck AND persist to the store
		// unconditionally, so an in-flight reply survives the panel unmounting or a
		// deck switch (the store is the source of truth on reopen).
		const commit = (next: ChatMessage[]) => {
			saveChat(sendDeckId, next);
			if (deckIdRef.current === sendDeckId) setMessages(next);
		};
		commit(history);
		setBusy(true);
		try {
			const turns: ChatTurn[] = history.map((m) => ({ role: m.role, content: m.content }));
			const out = await chatComplete(turns, source, refDoc.docs);
			if (out.status === 'offline') {
				commit([...history, { role: 'assistant', content: 'Connect a model in Workspace → AI and I can answer and edit your deck. Until then I can’t generate a reply.' }]);
				onConnect();
			} else if (out.status === 'blocked') {
				commit([...history, { role: 'assistant', content: out.reply }]);
			} else {
				commit([...history, { role: 'assistant', content: out.reply, proposed: out.proposed?.source }]);
			}
		} catch {
			commit([...history, { role: 'assistant', content: 'Something went wrong reaching the model — try again.' }]);
		} finally {
			// `busy` is a single UI-disable flag, not deck-scoped — clear it
			// unconditionally. Guarding it on the send-time deck would soft-lock the
			// composer forever if the user switched decks before the reply landed.
			setBusy(false);
		}
	};

	const apply = (idx: number) => {
		const m = messages[idx];
		if (!m?.proposed) return;
		onApply(m.proposed);
		setMessages((cur) => cur.map((x, i) => (i === idx ? { ...x, applied: true } : x)));
		notify('Edit applied — restore from History to undo.');
	};
	const discard = (idx: number) => {
		setMessages((cur) => cur.map((x, i) => (i === idx ? { ...x, proposed: undefined } : x)));
	};

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div ref={scrollRef} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 py-3">
				{messages.length === 0 && (
					<div className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-[12px] leading-relaxed text-muted-foreground">
						<Sparkles className="mx-auto mb-1.5 size-4 text-[var(--accent)]" />
						Ask the Architect to tighten a slide, reshape the deck, or answer a question. Proposed edits arrive as a diff you Apply or Discard.
						{!aiReady && <span className="mt-1.5 block text-[var(--text-muted)]">Connect a model in Workspace to start.</span>}
					</div>
				)}
				{messages.map((m, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: an append-only chat log — index is stable identity.
					<div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
						<div className={cn('max-w-[92%] rounded-2xl px-3 py-2 text-[12.5px] leading-relaxed', m.role === 'user' ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-foreground')}>
							<span className="whitespace-pre-wrap">{m.content}</span>
							{m.role === 'assistant' && m.proposed && !m.applied && <DiffCard before={source} after={m.proposed} onApply={() => apply(i)} onDiscard={() => discard(i)} />}
							{m.role === 'assistant' && m.applied && <span className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-[var(--accent)]"><Check className="size-3" />Applied</span>}
						</div>
					</div>
				))}
				{busy && <div className="flex justify-start"><div className="rounded-2xl border border-border bg-card px-3 py-2 text-[12.5px] text-muted-foreground"><Sparkles className="inline size-3.5 animate-pulse text-[var(--accent)]" /> thinking…</div></div>}
			</div>
			<div className="flex flex-col gap-1.5 border-t border-border p-2.5">
				{refDoc.chip}
				<div className="flex items-end gap-1.5 rounded-xl border border-border bg-background px-2.5 py-1.5 focus-within:border-[var(--accent)]">
					<textarea
						value={input}
						onChange={(e) => setInput(e.target.value)}
						onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
						rows={1}
						placeholder={aiReady ? 'Ask or instruct…' : 'Connect a model to chat…'}
						aria-label="Message the Architect"
						className="max-h-[120px] min-h-[22px] flex-1 resize-none bg-transparent text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground"
					/>
					{refDoc.attachButton}
					<button type="button" onClick={send} disabled={busy || !input.trim()} aria-label="Send" className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40"><ArrowUp className="size-4" /></button>
				</div>
			</div>
		</div>
	);
}

// A compact line diff — the changed lines (add green / del red), with runs of
// unchanged context collapsed, plus Apply / Discard. Exported so the Coach panel's
// per-finding AI fix renders the SAME reviewable card the chat does.
export function DiffCard({ before, after, onApply, onDiscard }: { before: string; after: string; onApply: () => void; onDiscard: () => void }) {
	const rows = React.useMemo(() => {
		// Lazy import would complicate the render; diffLines came in via the proposal,
		// so recompute here for display (cheap LCS over a slide-sized deck).
		const A = before.split('\n');
		const B = after.split('\n');
		// Reuse the same algorithm the proposal used (kept local + tiny).
		const changed: { type: 'add' | 'del'; text: string }[] = [];
		const setB = new Set(B);
		const setA = new Set(A);
		for (const l of A) if (!setB.has(l) && l.trim()) changed.push({ type: 'del', text: l });
		for (const l of B) if (!setA.has(l) && l.trim()) changed.push({ type: 'add', text: l });
		return changed.slice(0, 14);
	}, [before, after]);
	return (
		<div className="mt-2 overflow-hidden rounded-lg border border-border bg-background">
			<div className="max-h-[160px] overflow-auto px-2 py-1.5 font-mono text-[10.5px] leading-relaxed">
				{rows.map((r, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: static diff snapshot.
					<div key={i} className={cn('whitespace-pre-wrap', r.type === 'add' ? 'text-[var(--chart-3,#2e6f00)]' : 'text-[var(--fail,#b3261e)] line-through opacity-70')}>
						{r.type === 'add' ? '+ ' : '− '}{r.text}
					</div>
				))}
			</div>
			<div className="flex items-center gap-1.5 border-t border-border px-2 py-1.5">
				<button type="button" onClick={onApply} className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground"><Check className="size-3" />Apply</button>
				<button type="button" onClick={onDiscard} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-muted-foreground"><X className="size-3" />Discard</button>
			</div>
		</div>
	);
}
