import type { Extension } from '@codemirror/state';
import * as React from 'react';
import { notify, notifyAction } from '@/lib/notify';
import type { Session, SessionState } from '@/lib/tavola';
import { IDLE_VIEW, type LiveActions, type LiveChatLine, type LiveColor, type LivePerson, type LiveView, type LobbyActions, type LobbyView, liveColor, liveColorLight } from './live-model';

// The Studio's side of a live session: it turns a Tavola session plus a Yjs document into the
// Live view model, and hands the editor a CodeMirror binding. Everything heavy (Yjs, the
// CodeMirror binding, Tavola, Trystero) loads on first use, so a solo author pays nothing.
// See engineering/decisions/2026-10-06-studio-live-collaboration.md §4–§6.
//
// ONE SOURCE OF TRUTH while live: the shared `Y.Text`. The editor binds to it directly
// (`collab.extension`); every OTHER writer of the Studio's `source` (Compose, AI apply, settings,
// fix-all, restore) lands in React state first, and the effect below pushes that change into the
// `Y.Text` as one minimal edit. The editor skips its own `value` sync while bound, so a change is
// never applied twice.

const NAME_KEY = 'lattice-live-name';
/** sessionStorage: the join intent (room, secret), so it survives the OpenRouter OAuth round trip. */
const JOIN_KEY = 'lattice-live-join';
/** localStorage: room → { deckId, token }, so a guest's linked copy and rejoin token survive a reload. */
const LINKS_KEY = 'lattice-live-links';
const TYPING_MS = 2500;

type Linked = { deckId?: string; token?: string };
const readLinks = (): Record<string, Linked> => {
	try {
		return JSON.parse(localStorage.getItem(LINKS_KEY) || '{}');
	} catch {
		return {};
	}
};
const writeLink = (room: string, patch: Linked) => {
	try {
		const all = readLinks();
		all[room] = { ...all[room], ...patch };
		localStorage.setItem(LINKS_KEY, JSON.stringify(all));
	} catch {}
};
export const storedLiveName = (): string => {
	try {
		return localStorage.getItem(NAME_KEY) ?? '';
	} catch {
		return '';
	}
};
const saveName = (name: string) => {
	try {
		localStorage.setItem(NAME_KEY, name);
	} catch {}
};

type ChatMsg = { id: string; from: string; color: LiveColor; text: string; at: number };
type AwState = { peer?: string; user?: { name: string; color: string; colorLight: string }; slide?: number; editingAt?: number; summon?: { slide: number; n: number } };

/** What the editor needs to bind to the shared text. `key` changes when it must rebuild. */
export type LiveCollab = { extension: Extension; key: string; readOnly: boolean; seed: () => string };

type Runtime = {
	session: Session;
	doc: import('yjs').Doc;
	ytext: import('yjs').Text;
	ychat: import('yjs').Array<ChatMsg>;
	aw: import('y-protocols/awareness').Awareness;
	room: string;
	link: string;
	startedAt: number;
	ext: Extension;
	disposers: Array<() => void>;
};

async function loadEngine() {
	const [Y, awareness, ycm, tavola, trystero, cmView] = await Promise.all([import('yjs'), import('y-protocols/awareness'), import('y-codemirror.next'), import('@/lib/tavola'), import('@/lib/tavola/adapters/trystero'), import('@codemirror/view')]);
	return { Y, awareness, ycm, tavola, trystero, cmView };
}
type Engine = Awaited<ReturnType<typeof loadEngine>>;

export type LiveDeps = {
	source: string;
	/** Mirror the shared text into the Studio's source (not a deck switch). */
	setSource: (next: string) => void;
	deckId: string;
	deckTitle: string;
	slideCount: number;
	theme: string;
	activeSlide: number;
	goToSlide: (fullIndex: number) => void;
	/** Guest: open (or re-open) the linked copy of the shared deck. Returns its deck id. */
	openSharedDeck: (opts: { deckId?: string; title: string; source: string }) => string;
};

export function useLiveSession(deps: LiveDeps) {
	const depsRef = React.useRef(deps);
	depsRef.current = deps;
	const rt = React.useRef<Runtime | null>(null);
	const engineRef = React.useRef<Engine | null>(null);
	const [, bump] = React.useReducer((n: number) => n + 1, 0);
	const [now, setNow] = React.useState(() => Date.now());
	const [following, setFollowing] = React.useState<string | null>(null);
	const [lobbyName, setLobbyName] = React.useState(storedLiveName);
	const [lobbyOpen, setLobbyOpen] = React.useState(false);
	const [bound, setBound] = React.useState(false);
	const [failed, setFailed] = React.useState(false);
	const systemLines = React.useRef<LiveChatLine[]>([]);
	const sys = (text: string) => {
		systemLines.current = [...systemLines.current, { kind: 'system', id: `s${Math.random().toString(36).slice(2)}`, text, at: Date.now() }];
	};

	const state: SessionState | null = rt.current?.session.getState() ?? null;
	const live = state?.stage === 'live';

	// ── teardown ───────────────────────────────────────────────────────────
	const stop = React.useCallback((how: 'leave' | 'end') => {
		const r = rt.current;
		if (!r) return;
		if (how === 'end') r.session.end();
		else r.session.leave();
		for (const d of r.disposers) d();
		r.aw.destroy();
		rt.current = null;
		systemLines.current = [];
		setFollowing(null);
		setBound(false);
		setLobbyOpen(false);
		bump();
	}, []);

	// ── wiring shared by host and guest ────────────────────────────────────
	// A plain function, not a callback: it runs once per session, and everything it reads that
	// changes between renders is read through `depsRef`.
	const wire = (E: Engine, args: { room: string; secret: string; host?: { name: string }; token?: string; link: string }) => {
		const { Y, awareness: A, ycm, tavola, trystero } = E;
		const d = depsRef.current;
		const doc = new Y.Doc();
		const ytext = doc.getText('source');
		const ychat = doc.getArray<ChatMsg>('chat');
		if (args.host) ytext.insert(0, d.source);
		const aw = new A.Awareness(doc);
		const REMOTE = Symbol('tavola-remote');
		const peerClients = new Map<string, Set<number>>();
		const docStream = {
			encodeAll: () => Y.encodeStateAsUpdate(doc),
			applyRemote: (u: Uint8Array) => Y.applyUpdate(doc, u, REMOTE),
			onLocal(cb: (u: Uint8Array) => void) {
				const h = (u: Uint8Array, origin: unknown) => {
					if (origin !== REMOTE) cb(u);
				};
				doc.on('update', h);
				return () => doc.off('update', h);
			},
		};
		const awStream = {
			encodeAll: () => A.encodeAwarenessUpdate(aw, [...aw.getStates().keys()]),
			applyRemote: (u: Uint8Array, from: string) => A.applyAwarenessUpdate(aw, u, from),
			onLocal(cb: (u: Uint8Array) => void) {
				const h = ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
					if (origin === 'local') cb(A.encodeAwarenessUpdate(aw, [...added, ...updated, ...removed]));
				};
				aw.on('update', h);
				return () => aw.off('update', h);
			},
			forget(peer: string) {
				const ids = peerClients.get(peer);
				if (ids?.size) A.removeAwarenessStates(aw, [...ids], 'tavola');
				peerClients.delete(peer);
			},
		};
		// Which awareness clients each peer speaks for, so `forget` can drop them.
		aw.on('update', ({ added, updated }: { added: number[]; updated: number[] }, origin: unknown) => {
			if (typeof origin !== 'string') return;
			const set = peerClients.get(origin) ?? new Set<number>();
			for (const id of [...added, ...updated]) set.add(id);
			peerClients.set(origin, set);
		});
		const transport = trystero.trysteroTransport(args.room, args.secret);
		const session = tavola.createSession({
			transport,
			doc: docStream,
			awareness: awStream,
			...(args.host ? { host: { name: args.host.name, invite: { title: d.deckTitle, hostName: args.host.name, slides: d.slideCount, theme: d.theme } } } : {}),
			...(args.token ? { token: args.token } : {}),
		});
		// The binding brings its own undo manager, scoped to THIS browser's changes, in place of
		// CodeMirror's history (which would put everyone's edits on your undo stack).
		const ext = [ycm.yCollab(ytext, aw, { undoManager: new Y.UndoManager(ytext) }), E.cmView.keymap.of(ycm.yUndoManagerKeymap)];
		const r: Runtime = { session, doc, ytext, ychat, aw, room: args.room, link: args.link, startedAt: Date.now(), ext, disposers: [] };
		rt.current = r;

		// Re-render on any change; derive the system lines from roster diffs.
		let prev: SessionState = session.getState();
		r.disposers.push(
			session.subscribe(() => {
				const s = session.getState();
				const before = new Map(prev.members.map((m) => [m.id, m]));
				for (const m of s.members) if (!before.has(m.id) && m.id !== s.selfId && prev.stage === 'live') sys(`${m.name} joined${m.role === 'view' ? ' · can view' : ''}`);
				for (const [id, m] of before) if (!s.members.some((x) => x.id === id) && id !== s.selfId && s.stage === 'live') sys(`${m.name} left`);
				for (const m of s.members) {
					const was = before.get(m.id);
					if (was && was.role !== m.role) sys(`${m.name} ${m.role === 'view' ? 'can now only view' : 'can now edit'}`);
				}
				if (s.token) writeLink(r.room, { token: s.token });
				if (prev.stage !== s.stage) onStage(prev.stage, s);
				prev = s;
				bump();
			}),
		);
		const onAw = () => bump();
		aw.on('change', onAw);
		r.disposers.push(() => aw.off('change', onAw));
		const onChat = () => bump();
		ychat.observe(onChat);
		r.disposers.push(() => ychat.unobserve(onChat));
		r.disposers.push(() => session.leave());
		bump();
		return r;
	};

	// Stage transitions that need the Studio (guests).
	const onStage = (from: SessionState['stage'], s: SessionState) => {
		const r = rt.current;
		if (!r) return;
		if (s.stage === 'live' && !s.isHost) {
			// Admitted. Wait for the host's document, then open the linked copy and bind.
			const open = () => {
				const d = depsRef.current;
				const links = readLinks();
				const deckId = d.openSharedDeck({ deckId: links[r.room]?.deckId, title: s.invite?.title ?? 'Shared deck', source: r.ytext.toString() });
				writeLink(r.room, { deckId });
				setLobbyOpen(false);
				setBound(true);
				notify(`You joined ${s.invite?.hostName ?? 'the host'}'s session.`);
			};
			if (r.ytext.length > 0) open();
			else {
				const once = () => {
					if (r.ytext.length === 0) return;
					r.ytext.unobserve(once);
					open();
				};
				r.ytext.observe(once);
			}
			return;
		}
		if (s.stage === 'removed' || s.stage === 'ended') {
			notify(s.stage === 'removed' ? 'The host removed you from the session. Your copy of the deck stays.' : 'The host ended the session. Your copy of the deck stays.');
			const wasBound = from === 'live';
			stop('leave');
			if (!wasBound) setLobbyOpen(false);
		}
	};

	// ── guest: a `#live=` link on load (or one carried across OAuth) ───────
	// biome-ignore lint/correctness/useExhaustiveDependencies: runs once, on mount.
	React.useEffect(() => {
		let parts: { room: string; secret: string } | null = null;
		void (async () => {
			const { parseFragment } = await import('@/lib/tavola/link');
			parts = parseFragment(location.hash);
			if (parts) {
				try {
					sessionStorage.setItem(JOIN_KEY, JSON.stringify(parts));
				} catch {}
				// Scrub the secret from the address bar (screenshots, history sync).
				history.replaceState(history.state, '', location.pathname + location.search);
			} else {
				try {
					parts = JSON.parse(sessionStorage.getItem(JOIN_KEY) || 'null');
				} catch {}
			}
			if (!parts) return;
			setLobbyOpen(true);
			try {
				const E = (engineRef.current ??= await loadEngine());
				wire(E, { room: parts.room, secret: parts.secret, token: readLinks()[parts.room]?.token, link: E.tavola.formatLink(location.href, parts) });
			} catch {
				setFailed(true);
			}
		})();
	}, []);

	// ── keep the shared text and the Studio's source in step ───────────────
	// Writes that are ALREADY in the shared text: the editor's own (the binding wrote them) and the
	// mirror below. Anything else that moves `source` is an outside writer and is rebased onto Y.
	const fromY = React.useRef<Set<string>>(new Set());
	const prevSource = React.useRef(deps.source);
	const ytextNow = rt.current?.ytext;
	// Y → Studio: mirror every shared change into React state (the preview, Coach, lint…).
	React.useEffect(() => {
		if (!ytextNow || !bound) return;
		const h = () => {
			const next = ytextNow.toString();
			fromY.current.add(next);
			if (next !== depsRef.current.source) depsRef.current.setSource(next);
		};
		ytextNow.observe(h);
		return () => ytextNow.unobserve(h);
	}, [ytextNow, bound]);
	// Studio → Y: an outside write (Compose, AI apply, settings, fix-all, restore) becomes one edit
	// to the shared text, REBASED onto it: the writer computed `next` from the source it saw
	// (`prevSource`), and the shared text may have moved since, so the change is located by the
	// text around it rather than by its offset. A viewer's writes are refused, not forked.
	React.useEffect(() => {
		const base = prevSource.current;
		prevSource.current = deps.source;
		const r = rt.current;
		if (!r || !bound) return;
		const next = deps.source;
		if (fromY.current.has(next)) {
			fromY.current.clear();
			fromY.current.add(next);
			return;
		}
		const cur = r.ytext.toString();
		if (cur === next) return;
		if (r.session.getState().me?.role === 'view') {
			depsRef.current.setSource(cur);
			return;
		}
		const edit = rebase(base, next, cur);
		r.doc.transact(() => {
			if (edit.to > edit.from) r.ytext.delete(edit.from, edit.to - edit.from);
			if (edit.insert) r.ytext.insert(edit.from, edit.insert);
		});
	}, [deps.source, bound]);
	const noteEditorWrite = React.useCallback((next: string) => {
		fromY.current.add(next);
	}, []);

	// ── presence: my slide, my typing, my name and color ───────────────────
	const me = state?.me ?? null;
	React.useEffect(() => {
		const r = rt.current;
		if (!r || !me) return;
		r.aw.setLocalStateField('peer', r.session.getState().selfId);
		r.aw.setLocalStateField('user', { name: me.name, color: liveColor(me.color), colorLight: liveColorLight(me.color) });
	}, [me?.name, me?.color, me]);
	// biome-ignore lint/correctness/useExhaustiveDependencies: `live` re-runs it when the session opens, so the first slide is announced too.
	React.useEffect(() => {
		rt.current?.aw.setLocalStateField('slide', deps.activeSlide);
	}, [deps.activeSlide, live]);
	React.useEffect(() => {
		const r = rt.current;
		if (!r || !bound) return;
		let last = 0;
		const h = (_e: unknown, tr: { local: boolean }) => {
			if (!tr.local) return;
			const t = Date.now();
			if (t - last < 1000) return;
			last = t;
			r.aw.setLocalStateField('editingAt', t);
		};
		r.ytext.observe(h as never);
		return () => r.ytext.unobserve(h as never);
	}, [bound]);

	// The host keeps the lobby invite current.
	React.useEffect(() => {
		const r = rt.current;
		if (!r || !state?.isHost) return;
		r.session.setInvite({ title: deps.deckTitle, hostName: state.me?.name ?? '', slides: deps.slideCount, theme: deps.theme });
	}, [deps.deckTitle, deps.slideCount, deps.theme, state?.isHost, state?.me?.name]);

	// Leaving the deck while live ends (host) or leaves (guest) — the binding is to THIS deck.
	const boundDeck = React.useRef<string | null>(null);
	React.useEffect(() => {
		if (!bound) {
			boundDeck.current = null;
			return;
		}
		if (boundDeck.current === null) boundDeck.current = deps.deckId;
		else if (boundDeck.current !== deps.deckId) {
			const host = rt.current?.session.getState().isHost;
			stop(host ? 'end' : 'leave');
			notify(host ? 'You switched decks, so the live session ended.' : 'You switched decks, so you left the live session.');
		}
	}, [deps.deckId, bound, stop]);

	// The elapsed clock.
	React.useEffect(() => {
		if (!live) return;
		const t = window.setInterval(() => setNow(Date.now()), 1000);
		return () => window.clearInterval(t);
	}, [live]);

	// ── awareness → people ─────────────────────────────────────────────────
	const awByPeer = new Map<string, AwState>();
	if (rt.current) for (const st of rt.current.aw.getStates().values()) if ((st as AwState).peer) awByPeer.set((st as AwState).peer as string, st as AwState);
	const people: LivePerson[] = (state?.members ?? []).map((m) => {
		const st = awByPeer.get(m.id);
		return { id: m.id, name: m.name, color: m.color, role: m.role, me: m.id === state?.selfId, slide: m.id === state?.selfId ? deps.activeSlide : (st?.slide ?? null), editing: !!st?.editingAt && now - st.editingAt < TYPING_MS, mic: 'off' };
	});

	// Follow: track the followed person's slide; my own navigation stops it.
	const followJump = React.useRef(false);
	const followedSlide = following ? awByPeer.get(following)?.slide : undefined;
	React.useEffect(() => {
		if (following && followedSlide !== undefined && followedSlide !== depsRef.current.activeSlide) {
			followJump.current = true;
			depsRef.current.goToSlide(followedSlide);
		}
	}, [following, followedSlide]);
	const lastSlide = React.useRef(deps.activeSlide);
	React.useEffect(() => {
		if (lastSlide.current === deps.activeSlide) return;
		lastSlide.current = deps.activeSlide;
		if (followJump.current) followJump.current = false;
		else if (following) setFollowing(null);
	}, [deps.activeSlide, following]);
	React.useEffect(() => {
		if (following && !people.some((p) => p.id === following)) setFollowing(null);
	});

	// "Bring everyone here": the host's summon, honored unless you are mid-sentence.
	const hostSummon = state && !state.isHost ? awByPeer.get(state.members.find((m) => m.role === 'host')?.id ?? '')?.summon : undefined;
	const lastSummon = React.useRef(0);
	React.useEffect(() => {
		if (!hostSummon || hostSummon.n === lastSummon.current) return;
		const first = lastSummon.current === 0 && !live;
		lastSummon.current = hostSummon.n;
		if (first) return;
		const myEdit = (rt.current?.aw.getLocalState() as AwState | null)?.editingAt ?? 0;
		const slide = hostSummon.slide;
		if (Date.now() - myEdit < TYPING_MS) notifyAction(`The host is on slide ${slide + 1}`, { label: 'Go', onClick: () => depsRef.current.goToSlide(slide) });
		else {
			depsRef.current.goToSlide(slide);
			notify(`The host brought everyone to slide ${slide + 1}.`);
		}
	}, [hostSummon?.n, hostSummon, live]);

	// ── the view model ─────────────────────────────────────────────────────
	const r = rt.current;
	const chatMsgs: LiveChatLine[] = r ? r.ychat.toArray().map((m) => ({ kind: 'message', ...m })) : [];
	const view: LiveView =
		r && state && state.stage === 'live'
			? {
					status: 'live',
					isHost: state.isHost,
					startedAt: r.startedAt,
					link: r.link,
					linkRole: state.linkRole,
					autoAdmit: state.autoAdmit,
					people,
					waiting: state.waiting,
					cap: state.cap,
					chat: [...chatMsgs, ...systemLines.current].sort((a, b) => a.at - b.at),
					following,
					hostAway: state.hostAway,
					audio: false,
				}
			: IDLE_VIEW;

	const lobbyStage: LobbyView['stage'] | null = failed
		? 'failed'
		: !lobbyOpen
			? null
			: !state
				? 'connecting'
				: state.stage === 'connecting'
					? 'connecting'
					: state.stage === 'lobby'
						? 'ready'
						: state.stage === 'waiting'
							? 'waiting'
							: state.stage === 'denied' || state.stage === 'removed'
								? 'denied'
								: state.stage === 'full'
									? 'full'
									: state.stage === 'host-absent'
										? 'host-absent'
										: state.stage === 'live'
											? 'connecting'
											: null;
	const lobby: LobbyView | null = lobbyStage ? { stage: lobbyStage, title: state?.invite?.title ?? null, hostName: state?.invite?.hostName ?? null, slides: state?.invite?.slides ?? null, theme: state?.invite?.theme ?? null, name: lobbyName } : null;

	const copy = (link: string) => {
		void navigator.clipboard?.writeText(link).then(
			() => notify('Invite link copied. Anyone you send it to will knock first.'),
			() => notify(link),
		);
	};

	const actions: LiveActions = {
		start: (name: string) => {
			const n = name.trim() || 'Host';
			saveName(n);
			void (async () => {
				try {
					const E = (engineRef.current ??= await loadEngine());
					const parts = E.tavola.mintLink();
					const link = E.tavola.formatLink(location.href, parts);
					wire(E, { room: parts.room, secret: parts.secret, host: { name: n }, link });
					setBound(true);
					copy(link);
				} catch {
					notify("Couldn't start a live session in this browser.");
				}
			})();
		},
		copyLink: () => r && copy(r.link),
		setLinkRole: (role) => r?.session.setLinkRole(role),
		setAutoAdmit: (on) => r?.session.setAutoAdmit(on),
		admit: (id) => r?.session.admit(id),
		deny: (id) => r?.session.deny(id),
		remove: (id) => r?.session.remove(id),
		setRole: (id, role) => r?.session.setRole(id, role),
		follow: (id) => setFollowing(id),
		bringEveryone: () => {
			if (!r) return;
			const prevN = (r.aw.getLocalState() as AwState | null)?.summon?.n ?? 0;
			r.aw.setLocalStateField('summon', { slide: depsRef.current.activeSlide, n: prevN + 1 });
			sys(`You brought everyone to slide ${depsRef.current.activeSlide + 1}`);
			bump();
		},
		toggleMic: () => {},
		end: () => {
			stop('end');
			notify('Live session ended. The deck stays as it is.');
		},
		leave: () => {
			stop('leave');
			notify('You left the live session. Your copy of the deck stays.');
		},
		sendChat: (text) => {
			if (!r || !state?.me) return;
			r.ychat.push([{ id: `${state.selfId}-${Date.now().toString(36)}`, from: state.me.name, color: state.me.color, text: text.slice(0, 1000), at: Date.now() }]);
		},
		goToSlide: (i) => depsRef.current.goToSlide(i),
	};

	const lobbyActions: LobbyActions = {
		setName: setLobbyName,
		knock: () => {
			const n = lobbyName.trim();
			if (!n || !r) return;
			saveName(n);
			r.session.knock(n);
		},
		cancel: () => {
			try {
				sessionStorage.removeItem(JOIN_KEY);
			} catch {}
			stop('leave');
			setFailed(false);
			setLobbyOpen(false);
		},
		retry: () => {
			setFailed(false);
			r?.session.retry();
		},
	};

	// Clear the carried join intent once it has done its job.
	React.useEffect(() => {
		if (bound || state?.stage === 'denied' || state?.stage === 'full') {
			try {
				sessionStorage.removeItem(JOIN_KEY);
			} catch {}
		}
	}, [bound, state?.stage]);

	const collab: LiveCollab | null =
		r && bound && state?.me
			? { extension: r.ext, key: `${r.room}:${state.me.role === 'view' ? 'view' : 'edit'}`, readOnly: state.me.role === 'view', seed: () => r.ytext.toString() }
			: null;

	return { view, actions, lobby, lobbyActions, now, collab, noteEditorWrite };
}

/**
 * The edit that turns `base` into `next`, located in `cur` (which may have moved on since `base`).
 * The changed span is found by the unchanged text on either side of it; when that text is gone
 * too, the offsets are clamped, which can misplace an edit but never deletes text it did not see.
 */
export function rebase(base: string, next: string, cur: string): { from: number; to: number; insert: string } {
	let p = 0;
	const min = Math.min(base.length, next.length);
	while (p < min && base.charCodeAt(p) === next.charCodeAt(p)) p++;
	let s = 0;
	while (s < min - p && base.charCodeAt(base.length - 1 - s) === next.charCodeAt(next.length - 1 - s)) s++;
	const insert = next.slice(p, next.length - s);
	const removed = base.slice(p, base.length - s);
	if (cur === base) return { from: p, to: base.length - s, insert };
	const ANCHOR = 24;
	const before = base.slice(Math.max(0, p - ANCHOR), p);
	const after = base.slice(base.length - s, base.length - s + ANCHOR);
	// Find `before + removed + after` in cur, nearest to where it was.
	const needle = before + removed + after;
	let at = -1;
	if (needle.length > 0) {
		let best = Number.POSITIVE_INFINITY;
		for (let i = cur.indexOf(needle); i !== -1; i = cur.indexOf(needle, i + 1)) {
			const d = Math.abs(i - (p - before.length));
			if (d < best) {
				best = d;
				at = i;
			}
		}
	}
	if (at !== -1) {
		const from = at + before.length;
		return { from, to: from + removed.length, insert };
	}
	// The surroundings changed under us. Insert at the clamped offset and delete nothing.
	const from = Math.min(p, cur.length);
	return { from, to: from, insert };
}
