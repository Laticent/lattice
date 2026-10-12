// Test-only harness: mounts the REAL <LivePanel> with a fixture view model and records every action
// the panel calls, so the Playwright spec drives the real component (real shadcn menus, real Tailwind
// and palette tokens) with no session, no relay and no WebRTC. State is read and changed through
// `window.__live`. Everything the spec asserts is production code; only the data is a fixture.
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { LivePanel } from '@/components/studio/live/LivePanel';
import { IDLE_VIEW, type LiveActions, type LivePerson, type LiveView } from '@/components/studio/live/live-model';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import '@/styles/lattice-tokens.generated.css';
import './harness.css';

type Call = [string, ...unknown[]];
const calls: Call[] = [];
const record =
	(name: string) =>
	(...args: unknown[]) => {
		calls.push([name, ...args]);
		return name === 'copyLink' ? Promise.resolve(true) : undefined;
	};
const NAMES = ['start', 'copyLink', 'setLinkRole', 'setAutoAdmit', 'admit', 'deny', 'remove', 'setRole', 'follow', 'bringEveryone', 'toggleMic', 'leaveCall', 'pickMic', 'setVolume', 'setHighFidelity', 'setMicLevel', 'setMasterVolume', 'pickOutput', 'setShare', 'rename', 'end', 'leave', 'sendChat', 'chatTyping', 'goToSlide'] as const;
/** What the mic meter reads: set from the spec with `window.__live.level(n)`. */
let inputLevel = 0;
const actions = { ...Object.fromEntries(NAMES.map((n) => [n, record(n)])), inputLevel: () => inputLevel } as unknown as LiveActions;

const me: LivePerson = { id: 'me', name: 'Sharmarke', color: 1, role: 'host', me: true, slide: 0, editing: false, mic: 'off' };
const amina: LivePerson = { id: 'p2', name: 'Amina', color: 2, role: 'edit', slide: 0, editing: false, mic: 'off', link: { kind: 'direct', detail: 'srflx→host (udp)' } };

/** A live session the host sees: two people, no call. The spec patches it from there. */
const BASE: LiveView = {
	...IDLE_VIEW,
	status: 'live',
	isHost: true,
	startedAt: Date.now() - 65_000,
	link: 'http://127.0.0.1:4321/studio/#live=abc.secret.def',
	people: [me, amina],
	audio: true,
	heir: 'Amina',
};

let view: LiveView = BASE;
const params = new URLSearchParams(location.search);
const width = params.get('w');

function Harness() {
	const [, tick] = React.useReducer((n: number) => n + 1, 0);
	(window as unknown as { __live: unknown }).__live = {
		/** Replace the view with BASE plus `patch` (a shallow merge; `people` replaces the list). */
		set(patch: Partial<LiveView>) {
			view = { ...BASE, ...patch };
			tick();
		},
		/** Patch one person by id (a shallow merge), keeping the rest of the view. */
		person(id: string, patch: Partial<LivePerson>) {
			view = { ...view, people: view.people.map((p) => (p.id === id ? { ...p, ...patch } : p)) };
			tick();
		},
		call(patch: Partial<LiveView['call']>) {
			view = { ...view, call: { ...view.call, ...patch } };
			tick();
		},
		/** The level of what you are sending, 0–1, as the meter reads it. */
		level(n: number) {
			inputLevel = n;
		},
		calls: () => calls.slice(),
		clear: () => calls.splice(0, calls.length),
	};
	const panel = <LivePanel view={view} actions={actions} title="Live" now={Date.now()} />;
	// ?modal=1: the panel inside the real modal Sheet it lives in on a phone (its scroll lock is what a popover in
	// <body> runs into). Same Sheet the Studio drawer uses.
	if (params.get('modal') === '1')
		return (
			<Sheet open modal>
				<SheetContent side="bottom" className="flex h-[100dvh] flex-col p-0" data-live-modal-sheet>
					<SheetTitle className="sr-only">Live</SheetTitle>
					<SheetDescription className="sr-only">The Live panel inside a modal sheet</SheetDescription>
					{panel}
				</SheetContent>
			</Sheet>
		);
	return <div style={{ width: width ? `${width}px` : 'min(100vw, 340px)', height: '100vh', display: 'flex', background: 'var(--bg)' }}>{panel}</div>;
}
createRoot(document.getElementById('root') as HTMLElement).render(<Harness />);
