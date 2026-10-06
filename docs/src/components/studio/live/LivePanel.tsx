import { ArrowUp, Check, Crown, Eye, Link2, LogOut, Mic, MicOff, MoreHorizontal, Pencil, UserMinus, UsersRound, X } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { CHAT_COMPOSER_FIELD, CHAT_COMPOSER_ROW, CHAT_COMPOSER_TOOLS } from '../panel-shells';
import { LiveAvatar } from './LiveAvatar';
import { elapsed, type LiveActions, type LiveChatLine, type LivePerson, type LiveView, liveColor, SLIDE_REF } from './live-model';

// The Live panel — the collaboration PORTAL, not the workspace (§5.2 of
// engineering/decisions/2026-10-06-studio-live-collaboration.md). It is narrow on purpose:
// the editor and preview are where the work happens, and they carry the presence
// (carets, navigator avatars). Section order follows the ask: who (waiting, then
// present), then text. The call section lands with S4.

const SECTION = 'px-3.5 pt-3 pb-1 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground';

function whereLabel(p: LivePerson): string {
	if (p.slide === null) return 'Arriving…';
	return `Slide ${p.slide + 1}${p.editing ? ' · editing' : ''}`;
}

function PersonRow({ p, view, actions }: { p: LivePerson; view: LiveView; actions: LiveActions }) {
	const MicGlyph = p.mic === 'off' ? MicOff : Mic;
	const canManage = view.isHost && !p.me && p.role !== 'host';
	const following = view.following === p.id;
	return (
		<li className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-accent">
			<LiveAvatar person={p} size={26} ring={p.mic === 'speaking'} />
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-1 truncate text-[12.5px] font-semibold text-foreground">
					<span className="truncate">{p.name}</span>
					{p.me && <span className="font-normal text-muted-foreground">(you)</span>}
					{p.role === 'host' && <Crown className="size-3 shrink-0 text-muted-foreground" aria-label="Host" />}
					{p.role === 'view' && <Eye className="size-3 shrink-0 text-muted-foreground" aria-label="View only" />}
				</div>
				<div className="truncate text-[11px] text-muted-foreground">
					{following ? `Following · ${whereLabel(p)}` : whereLabel(p)}
				</div>
			</div>
			{view.audio && <MicGlyph className={cn('size-3.5 shrink-0', p.mic === 'off' ? 'text-muted-foreground/60' : 'text-foreground')} aria-label={p.mic === 'off' ? 'Muted' : 'Mic on'} />}
			{!p.me && (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" size="icon" className="size-6" aria-label={`Options for ${p.name}`}>
							<MoreHorizontal className="size-3.5" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-48">
						<DropdownMenuItem onSelect={() => actions.follow(following ? null : p.id)}>
							<Eye className="size-4" /> {following ? 'Stop following' : `Follow ${p.name}`}
						</DropdownMenuItem>
						{p.slide !== null && (
							<DropdownMenuItem onSelect={() => actions.goToSlide(p.slide as number)}>
								<ArrowUp className="size-4 rotate-45" /> Go to slide {p.slide + 1}
							</DropdownMenuItem>
						)}
						{canManage && (
							<>
								<DropdownMenuSeparator />
								<DropdownMenuItem onSelect={() => actions.setRole(p.id, p.role === 'edit' ? 'view' : 'edit')}>
									{p.role === 'edit' ? <Eye className="size-4" /> : <Pencil className="size-4" />}
									{p.role === 'edit' ? 'Make view-only' : 'Allow editing'}
								</DropdownMenuItem>
								<DropdownMenuItem variant="destructive" onSelect={() => actions.remove(p.id)}>
									<UserMinus className="size-4" /> Remove from session
								</DropdownMenuItem>
							</>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			)}
		</li>
	);
}

/** Chat text with "slide 6" / "#6" turned into chips that jump the preview. */
function ChatText({ text, onSlide }: { text: string; onSlide: (i: number) => void }) {
	const parts: React.ReactNode[] = [];
	let last = 0;
	for (const m of text.matchAll(SLIDE_REF)) {
		const n = Number(m[1]);
		if (m.index > last) parts.push(text.slice(last, m.index));
		parts.push(
			<button key={m.index} type="button" onClick={() => onSlide(n - 1)} className="mx-0.5 inline-flex items-center rounded-md border border-border bg-background px-1.5 py-px text-[11px] font-semibold text-foreground hover:bg-accent">
				Slide {n}
			</button>,
		);
		last = m.index + m[0].length;
	}
	if (last < text.length) parts.push(text.slice(last));
	return <>{parts}</>;
}

function ChatLine({ line, onSlide }: { line: LiveChatLine; onSlide: (i: number) => void }) {
	if (line.kind === 'system') return <li className="px-1 text-[11px] italic text-muted-foreground">{line.text}</li>;
	return (
		<li className="text-[12.5px] leading-[1.45] text-foreground">
			<span className="font-semibold" style={{ color: liveColor(line.color) }}>{line.from}</span>{' '}
			<ChatText text={line.text} onSlide={onSlide} />
		</li>
	);
}

function Composer({ onSend }: { onSend: (text: string) => void }) {
	const [draft, setDraft] = React.useState('');
	const send = () => {
		const t = draft.trim();
		if (!t) return;
		onSend(t);
		setDraft('');
	};
	return (
		<div className={CHAT_COMPOSER_ROW}>
			<Textarea
				autosize
				maxRows={4}
				rows={1}
				value={draft}
				onChange={(e) => setDraft(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === 'Enter' && !e.shiftKey) {
						e.preventDefault();
						send();
					}
				}}
				data-focus-ring="container"
				aria-label="Message everyone"
				placeholder="Message everyone…"
				className={CHAT_COMPOSER_FIELD}
			/>
			<span className={CHAT_COMPOSER_TOOLS}>
				<Button size="icon" className="size-7 rounded-lg" aria-label="Send" disabled={!draft.trim()} onClick={send}>
					<ArrowUp className="size-4" />
				</Button>
			</span>
		</div>
	);
}

/** The panel body before a session: one card, your name, one action. */
function StartCard({ actions, defaultName }: { actions: LiveActions; defaultName: string }) {
	const [name, setName] = React.useState(defaultName);
	return (
		<form
			className="flex flex-col gap-3 px-3.5 py-4"
			onSubmit={(e) => {
				e.preventDefault();
				if (name.trim()) actions.start(name);
			}}
		>
			<div className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-[12px] leading-relaxed text-muted-foreground">
				<UsersRound className="mx-auto mb-1.5 size-5 text-[var(--accent)]" />
				Edit this deck together, live. Share a link; people knock, you let them in, and everyone sees the same deck, carets and slide.
				<span className="mt-1.5 block">Up to 4 people. Edits go browser to browser.</span>
			</div>
			<label htmlFor="live-start-name" className="text-[11.5px] font-semibold text-foreground">Your name</label>
			<Input id="live-start-name" value={name} maxLength={40} autoComplete="name" onChange={(e) => setName(e.target.value)} placeholder="How others will see you" className="h-8 text-[12.5px]" />
			<Button type="submit" disabled={!name.trim()} className="w-full gap-1.5">
				<Link2 className="size-4" /> Start live session
			</Button>
		</form>
	);
}

export function LivePanel({ view, actions, title, now, defaultName = '' }: { view: LiveView; actions: LiveActions; title?: string; now: number; defaultName?: string }) {
	const chatEnd = React.useRef<HTMLLIElement>(null);
	const chatCount = view.chat.length;
	React.useEffect(() => {
		if (chatCount) chatEnd.current?.scrollIntoView({ block: 'end' });
	}, [chatCount]);
	const live = view.status === 'live';
	const full = view.people.length >= view.cap;
	return (
		<div className="flex min-h-0 flex-1 flex-col" data-live-panel>
			{title && (
				<div className="flex items-center gap-2 border-b border-border px-3.5 py-2 font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
					<span>{title}</span>
					{live && (
						<>
							<span className="size-1.5 rounded-full bg-[var(--accent)]" aria-hidden />
							{view.startedAt !== null && <span className="tabular-nums font-normal tracking-normal">{elapsed(view.startedAt, now)}</span>}
							<span className="flex-1" />
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button variant="ghost" size="icon" className="-my-1 size-6" aria-label="Session options">
										<MoreHorizontal className="size-3.5" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end" className="w-52">
									<DropdownMenuItem onSelect={actions.copyLink}><Link2 className="size-4" /> Copy invite link</DropdownMenuItem>
									{view.isHost && <DropdownMenuItem onSelect={actions.bringEveryone}><Eye className="size-4" /> Bring everyone to my slide</DropdownMenuItem>}
									<DropdownMenuSeparator />
									{view.isHost ? (
										<DropdownMenuItem variant="destructive" onSelect={actions.end}><LogOut className="size-4" /> End session for everyone</DropdownMenuItem>
									) : (
										<DropdownMenuItem variant="destructive" onSelect={actions.leave}><LogOut className="size-4" /> Leave session</DropdownMenuItem>
									)}
								</DropdownMenuContent>
							</DropdownMenu>
						</>
					)}
				</div>
			)}
			{!live ? (
				<StartCard actions={actions} defaultName={defaultName} />
			) : (
				<>
					<div className="shrink-0 overflow-y-auto">
						{view.isHost && (
							<div className="flex flex-col gap-2 px-3.5 pt-3">
								<div className="flex items-stretch">
									<Button size="sm" variant="outline" onClick={actions.copyLink} className="min-w-0 flex-1 justify-start gap-1.5 rounded-r-none" disabled={full}>
										<Link2 className="size-4" /> <span className="truncate">{full ? 'Session full' : 'Copy link'}</span>
									</Button>
									<DropdownMenu>
										<DropdownMenuTrigger asChild>
											<Button size="sm" variant="outline" className="-ml-px rounded-l-none px-2 text-[11.5px]" aria-label="Link permission">
												{view.linkRole === 'edit' ? 'Can edit' : 'Can view'}
											</Button>
										</DropdownMenuTrigger>
										<DropdownMenuContent align="end">
											<DropdownMenuItem onSelect={() => actions.setLinkRole('edit')}><Pencil className="size-4" /> Can edit{view.linkRole === 'edit' && <Check className="ml-auto size-4" />}</DropdownMenuItem>
											<DropdownMenuItem onSelect={() => actions.setLinkRole('view')}><Eye className="size-4" /> Can view{view.linkRole === 'view' && <Check className="ml-auto size-4" />}</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>
								</div>
								{view.link && (
									<input
										readOnly
										value={view.link}
										aria-label="Invite link"
										onFocus={(e) => e.currentTarget.select()}
										className="w-full truncate rounded-md border border-border bg-background px-2 py-1 font-mono text-[10.5px] text-muted-foreground"
									/>
								)}
								<div className="flex items-center justify-between gap-2 text-[11.5px] text-muted-foreground">
									<label htmlFor="live-auto-admit">Let people in automatically</label>
									<Switch id="live-auto-admit" checked={view.autoAdmit} onCheckedChange={actions.setAutoAdmit} />
								</div>
							</div>
						)}
						{view.hostAway && (
							<p className="mx-3.5 mt-3 rounded-lg border border-border bg-background px-2.5 py-2 text-[11.5px] text-muted-foreground">
								The host is away. You can keep editing; new people can't join until they return.
							</p>
						)}
						{view.isHost && view.waiting.length > 0 && (
							<>
								<div className={SECTION}>Waiting ({view.waiting.length})</div>
								<ul className="flex flex-col gap-1 px-1.5">
									{view.waiting.map((k) => (
										<li key={k.id} className="flex items-center gap-2 rounded-lg border border-[var(--accent)] bg-background px-2 py-1.5">
											<span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-foreground">{k.name}</span>
											<Button size="icon" variant="ghost" className="size-6" onClick={() => actions.deny(k.id)} aria-label={`Deny ${k.name}`} title="Deny"><X className="size-3.5" /></Button>
											<Button size="xs" onClick={() => actions.admit(k.id)} disabled={full} aria-label={`Admit ${k.name}`}><Check /> Admit</Button>
										</li>
									))}
								</ul>
							</>
						)}
						<div className={SECTION}>
							In this session ({view.people.length}/{view.cap})
						</div>
						<ul className="flex flex-col px-1.5">
							{view.people.map((p) => <PersonRow key={p.id} p={p} view={view} actions={actions} />)}
						</ul>
						{view.audio && <div className="px-3.5 pt-1 pb-2">
							<Button size="sm" variant="ghost" onClick={actions.toggleMic} className="h-7 gap-1.5 px-2 text-[11.5px]">
								{view.people.find((p) => p.me)?.mic === 'off' ? <><Mic className="size-3.5" /> Join with audio</> : <><MicOff className="size-3.5" /> Mute</>}
							</Button>
						</div>}
					</div>
					<div className="mt-1.5 flex min-h-0 flex-1 flex-col border-t border-border">
						<div className={SECTION}>Chat</div>
						<ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3.5 py-1.5" aria-label="Session chat" aria-live="polite">
							{view.chat.length === 0 && <li className="text-[11.5px] text-muted-foreground">Messages go to everyone in the session. Type “slide 4” to link a slide.</li>}
							{view.chat.map((line) => <ChatLine key={line.id} line={line} onSlide={actions.goToSlide} />)}
							<li ref={chatEnd} aria-hidden />
						</ul>
						<div className="border-t border-border p-2.5">
							{view.canChat ? <Composer onSend={actions.sendChat} /> : <p className="px-1 text-[11.5px] text-muted-foreground">You can view this session, so you can read the chat but not post.</p>}
						</div>
					</div>
				</>
			)}
		</div>
	);
}
