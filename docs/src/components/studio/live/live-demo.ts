import * as React from 'react';
import { IDLE_VIEW, type LiveActions, type LiveChatLine, type LiveView, type LobbyActions, type LobbyView } from './live-model';

// The PROTOTYPE driver: a scripted session that feeds the real Live components with
// believable state, so the experience can be reviewed before Tavola is wired in. Opt-in with
// `?live-demo=host` (a running session, a knock arrives after 3s) or
// `?live-demo=lobby&stage=<stage>` (the guest's card). Nothing here touches the network.
// Removed when the real session lands (S2).

export type LiveDemoMode = { kind: 'host' } | { kind: 'lobby'; stage: LobbyView['stage'] } | null;

export function readLiveDemoMode(search: string): LiveDemoMode {
	const q = new URLSearchParams(search);
	const v = q.get('live-demo');
	if (v === 'host') return { kind: 'host' };
	if (v === 'lobby') return { kind: 'lobby', stage: (q.get('stage') as LobbyView['stage']) || 'ready' };
	return null;
}

let seq = 0;
const id = () => `d${++seq}`;

export function useLiveDemo(mode: LiveDemoMode, opts: { myName: string; activeSlide: number; goToSlide: (i: number) => void }) {
	const [view, setView] = React.useState<LiveView>(() =>
		mode?.kind === 'host'
			? {
					...IDLE_VIEW,
					status: 'live',
					isHost: true,
					startedAt: Date.now() - 14 * 60_000 - 32_000,
					link: `${location.origin}${location.pathname}#live=demo.demo`,
					people: [
						{ id: 'me', name: opts.myName, color: 1, role: 'host', me: true, slide: 3, editing: false, mic: 'on' },
						{ id: 'amina', name: 'Amina', color: 2, role: 'edit', slide: 3, editing: true, mic: 'speaking' },
						{ id: 'chen', name: 'Chen', color: 3, role: 'view', slide: 5, editing: false, mic: 'off' },
					],
					chat: [
						{ kind: 'system', id: id(), text: 'Amina joined', at: Date.now() - 13 * 60_000 },
						{ kind: 'system', id: id(), text: 'Chen joined · can view', at: Date.now() - 11 * 60_000 },
						{ kind: 'message', id: id(), from: 'Amina', color: 2, text: 'Can we cut slide 5? It repeats the market point.', at: Date.now() - 4 * 60_000 },
						{ kind: 'message', id: id(), from: 'Chen', color: 3, text: '+1. And #6 needs the Q3 number.', at: Date.now() - 3 * 60_000 },
						{ kind: 'system', id: id(), text: 'Amina applied an AI edit to slide 4', at: Date.now() - 60_000 },
					],
				}
			: IDLE_VIEW,
	);
	const [lobby, setLobby] = React.useState<LobbyView | null>(() =>
		mode?.kind === 'lobby' ? { stage: mode.stage, title: 'Q3 Board Review', hostName: 'Sharmarke', slides: 12, theme: 'Indaco', name: mode.stage === 'ready' ? '' : 'Amina' } : null,
	);
	const [now, setNow] = React.useState(() => Date.now());

	// The clock for the elapsed timer, and the scripted knock.
	React.useEffect(() => {
		if (view.status !== 'live') return;
		const t = window.setInterval(() => setNow(Date.now()), 1000);
		return () => window.clearInterval(t);
	}, [view.status]);
	const knocked = React.useRef(false);
	React.useEffect(() => {
		if (mode?.kind !== 'host' || knocked.current) return;
		knocked.current = true;
		const t = window.setTimeout(() => setView((v) => ({ ...v, waiting: [...v.waiting, { id: 'bruno', name: 'Bruno', at: Date.now() }] })), 3000);
		return () => window.clearTimeout(t);
	}, [mode]);

	// My own row tracks the slide I am on.
	React.useEffect(() => {
		setView((v) => (v.status === 'live' ? { ...v, people: v.people.map((p) => (p.me ? { ...p, slide: opts.activeSlide } : p)) } : v));
	}, [opts.activeSlide]);

	const sys = (text: string): LiveChatLine => ({ kind: 'system', id: id(), text, at: Date.now() });
	const actions: LiveActions = {
		start: () => setView((v) => ({ ...v, status: 'live', isHost: true, startedAt: Date.now(), link: `${location.origin}${location.pathname}#live=demo.demo`, people: [{ id: 'me', name: opts.myName, color: 1, role: 'host', me: true, slide: opts.activeSlide, editing: false, mic: 'off' }] })),
		copyLink: () => void navigator.clipboard?.writeText(view.link ?? '').catch(() => {}),
		setLinkRole: (r) => setView((v) => ({ ...v, linkRole: r })),
		setAutoAdmit: (on) => setView((v) => ({ ...v, autoAdmit: on })),
		admit: (who) =>
			setView((v) => {
				const k = v.waiting.find((w) => w.id === who);
				if (!k || v.people.length >= v.cap) return v;
				const used = new Set(v.people.map((p) => p.color));
				const color = ([1, 2, 3, 4] as const).find((c) => !used.has(c)) ?? 4;
				return { ...v, waiting: v.waiting.filter((w) => w.id !== who), people: [...v.people, { id: k.id, name: k.name, color, role: v.linkRole, slide: opts.activeSlide, editing: false, mic: 'off' }], chat: [...v.chat, sys(`${k.name} joined`)] };
			}),
		deny: (who) => setView((v) => ({ ...v, waiting: v.waiting.filter((w) => w.id !== who) })),
		remove: (who) => setView((v) => ({ ...v, people: v.people.filter((p) => p.id !== who), chat: [...v.chat, sys(`${v.people.find((p) => p.id === who)?.name ?? 'Someone'} was removed`)] })),
		setRole: (who, r) => setView((v) => ({ ...v, people: v.people.map((p) => (p.id === who ? { ...p, role: r } : p)) })),
		follow: (who) => {
			setView((v) => ({ ...v, following: who }));
			const target = view.people.find((p) => p.id === who);
			if (target?.slide != null) opts.goToSlide(target.slide);
		},
		bringEveryone: () => setView((v) => ({ ...v, people: v.people.map((p) => ({ ...p, slide: opts.activeSlide })), chat: [...v.chat, sys(`${opts.myName} brought everyone to slide ${opts.activeSlide + 1}`)] })),
		toggleMic: () => setView((v) => ({ ...v, people: v.people.map((p) => (p.me ? { ...p, mic: p.mic === 'off' ? 'on' : 'off' } : p)) })),
		end: () => setView(IDLE_VIEW),
		leave: () => setView(IDLE_VIEW),
		sendChat: (text) => setView((v) => ({ ...v, chat: [...v.chat, { kind: 'message', id: id(), from: opts.myName, color: v.people.find((p) => p.me)?.color ?? 1, text, at: Date.now() }] })),
		goToSlide: opts.goToSlide,
	};
	const lobbyActions: LobbyActions = {
		setName: (name) => setLobby((l) => (l ? { ...l, name } : l)),
		knock: () => setLobby((l) => (l ? { ...l, stage: 'waiting' } : l)),
		cancel: () => setLobby(null),
		retry: () => setLobby((l) => (l ? { ...l, stage: 'connecting' } : l)),
	};
	return { view, actions, lobby, lobbyActions, now };
}
