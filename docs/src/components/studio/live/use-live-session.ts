import * as React from 'react';
import { notify, notifyAction } from '@/lib/notify';
import type { LiveController } from './live-controller';
import { IDLE_VIEW, type LiveActions, type LobbyActions } from './live-model';
import { hasLiveFragment, type LiveCollab, type LiveDeps, type LiveHost, takeLiveIntent } from './live-store';

// The always-loaded half of the Studio's live session. It does almost nothing on its own: it takes a
// `#live=` link into memory (on load, or pasted into an open tab), and it loads the session code (live-controller.ts, with
// Yjs, Tavola and Trystero) only when there is something live — a link, a join carried across a
// reload or OAuth, a session this tab was hosting, or the author pressing "Start live session".
// A solo author's Studio never loads any of it. See
// engineering/decisions/2026-10-06-studio-live-collaboration.md §6.

export type { LiveCollab } from './live-store';
export { storedLiveName } from './live-store';

type ShellCallbacks = Omit<LiveHost, 'rerender' | 'notify' | 'notifyAction'>;

const NOOP = () => {};

export function useLiveSession(deps: LiveDeps & ShellCallbacks) {
	const depsRef = React.useRef(deps);
	depsRef.current = deps;
	const [ctl, setCtl] = React.useState<LiveController | null>(null);
	const [, rerender] = React.useReducer((n: number) => n + 1, 0);
	const loading = React.useRef<Promise<LiveController> | null>(null);

	const ensure = React.useCallback((): Promise<LiveController> => {
		if (loading.current) return loading.current;
		loading.current = import('./live-controller').then(({ LiveController: C }) => {
			const host: LiveHost = {
				setSource: (s) => depsRef.current.setSource(s),
				goToSlide: (i) => depsRef.current.goToSlide(i),
				openSharedDeck: (o) => depsRef.current.openSharedDeck(o),
				notify: (m) => notify(m),
				notifyAction: (m, o) => notifyAction(m, o),
				rerender,
			};
			const { source, deckId, deckTitle, slideCount, theme, activeSlide } = depsRef.current;
			const c = new C(host, { source, deckId, deckTitle, slideCount, theme, activeSlide });
			setCtl(c);
			return c;
		});
		// A failed load (offline, or a chunk a deploy rotated away) is not final: forget it so the next
		// try loads again, and say so. A link stays in the address bar until the code has it, so a
		// reload also works (inversion round 2, item 1).
		loading.current.catch(() => {
			loading.current = null;
			notify("Couldn't load the live session. Check your connection, or reload the page.");
		});
		return loading.current;
	}, []);

	// A link, a carried join, or a session this tab was hosting: load and resume it.
	React.useEffect(() => {
		const go = () => {
			if (takeLiveIntent()) ensure().then((c) => c.resume(), NOOP);
		};
		go();
		// A link pasted into a Studio tab that is already open (inversion round 2, item 2).
		const onHash = () => {
			if (hasLiveFragment()) go();
		};
		window.addEventListener('hashchange', onHash);
		return () => window.removeEventListener('hashchange', onHash);
	}, [ensure]);
	React.useEffect(() => () => ctl?.dispose(), [ctl]);

	// Feed the controller this render's Studio state (it diffs against the last one).
	React.useEffect(() => {
		ctl?.update({ source: deps.source, deckId: deps.deckId, deckTitle: deps.deckTitle, slideCount: deps.slideCount, theme: deps.theme, activeSlide: deps.activeSlide });
	});

	// Hosting others: ask before the tab goes.
	// The tab is going away: unmount effects do not run on a real unload, so save here.
	React.useEffect(() => {
		if (!ctl) return;
		const h = () => ctl.flushSave();
		window.addEventListener('pagehide', h);
		return () => window.removeEventListener('pagehide', h);
	}, [ctl]);

	React.useEffect(() => {
		if (!ctl) return;
		const h = (e: BeforeUnloadEvent) => {
			if (!ctl.shouldWarnOnUnload()) return;
			e.preventDefault();
			e.returnValue = '';
		};
		window.addEventListener('beforeunload', h);
		return () => window.removeEventListener('beforeunload', h);
	}, [ctl]);

	const actions: LiveActions = ctl?.actions ?? {
		start: (name) => void ensure().then((c) => c.actions.start(name), NOOP),
		copyLink: NOOP,
		setLinkRole: NOOP,
		setAutoAdmit: NOOP,
		admit: NOOP,
		deny: NOOP,
		remove: NOOP,
		setRole: NOOP,
		follow: NOOP,
		bringEveryone: NOOP,
		toggleMic: NOOP,
		leaveCall: NOOP,
		pickMic: NOOP,
		end: NOOP,
		leave: NOOP,
		sendChat: NOOP,
		chatTyping: NOOP,
		goToSlide: (i) => depsRef.current.goToSlide(i),
	};
	const lobbyActions: LobbyActions = ctl?.lobbyActions ?? { setName: NOOP, knock: NOOP, cancel: NOOP, retry: NOOP };
	const noteEditorWrite = React.useCallback((next: string) => ctl?.noteEditorWrite(next), [ctl]);
	const mayLeaveDeck = React.useCallback(() => ctl?.mayLeaveDeck() ?? true, [ctl]);
	const collab: LiveCollab | null = ctl?.collab() ?? null;
	return { view: ctl?.view() ?? IDLE_VIEW, actions, lobby: ctl?.lobby() ?? null, lobbyActions, now: ctl?.now ?? Date.now(), collab, noteEditorWrite, mayLeaveDeck };
}
