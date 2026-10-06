import { Loader2, Mic, UsersRound } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { LobbyActions, LobbyView } from './live-model';

// The guest's lobby (§4.2 of engineering/decisions/2026-10-06-studio-live-collaboration.md):
// a centered card over the dimmed Studio, so the guest sees where they are going before they
// arrive. Every stage the card can be in is drawn here; nothing turns a device on.

const COPY: Record<LobbyView['stage'], { title: string; body: string } | null> = {
	connecting: { title: 'Connecting…', body: 'Finding the host. This usually takes a second or two.' },
	ready: null,
	waiting: { title: 'Waiting for the host', body: '' },
	denied: { title: "The host didn't let you in", body: 'Ask them to send the link again if this was a mistake.' },
	'host-absent': { title: "This session isn't live right now", body: 'The host needs to have the deck open. Ask them to open it, then try again.' },
	full: { title: 'This session is full', body: 'A live session holds up to 4 people.' },
	failed: { title: "Couldn't connect", body: 'Some office networks and mobile carriers block direct browser-to-browser connections. Try another network, or try again.' },
};

export function LiveLobby({ view, actions }: { view: LobbyView; actions: LobbyActions }) {
	const copy = COPY[view.stage];
	const nameRef = React.useRef<HTMLInputElement>(null);
	React.useEffect(() => {
		if (view.stage === 'ready') nameRef.current?.focus();
	}, [view.stage]);
	const canKnock = view.stage === 'ready' && view.name.trim().length > 0;
	return (
		<div role="dialog" aria-modal="true" aria-labelledby="live-lobby-title" className="fixed inset-0 z-50 grid place-items-center bg-background/85 p-4 backdrop-blur-sm" data-live-lobby>
			<div className="w-full max-w-[380px] rounded-2xl border border-border bg-card p-5 shadow-lg">
				<div className="mb-4 flex items-start gap-3">
					<span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
						<UsersRound className="size-[18px]" />
					</span>
					<div className="min-w-0">
						<p className="text-[12px] text-muted-foreground">{view.hostName ? `${view.hostName} invited you to` : 'You were invited to'}</p>
						<h2 id="live-lobby-title" className="truncate text-[17px] font-semibold text-[var(--text-heading)]">{view.title ?? 'a live deck'}</h2>
						{(view.slides !== null || view.theme) && (
							<p className="text-[12px] text-muted-foreground">{[view.slides !== null ? `${view.slides} slides` : null, view.theme].filter(Boolean).join(' · ')}</p>
						)}
					</div>
				</div>

				{copy ? (
					<div className="mb-4 rounded-xl border border-border bg-background px-3 py-3" aria-live="polite">
						<p className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
							{(view.stage === 'connecting' || view.stage === 'waiting') && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
							{copy.title}
						</p>
						<p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
							{view.stage === 'waiting' ? `${view.hostName ?? 'The host'} has been asked to let you in.` : copy.body}
						</p>
					</div>
				) : (
					<form
						className="mb-4 flex flex-col gap-2"
						onSubmit={(e) => {
							e.preventDefault();
							if (canKnock) actions.knock();
						}}
					>
						<label htmlFor="live-lobby-name" className="text-[12px] font-semibold text-foreground">Your name</label>
						<Input id="live-lobby-name" ref={nameRef} value={view.name} maxLength={40} autoComplete="name" onChange={(e) => actions.setName(e.target.value)} placeholder="How others will see you" />
						<p className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
							<Mic className="size-3.5" /> Your mic and camera stay off. You can join the call later.
						</p>
					</form>
				)}

				<div className="flex justify-end gap-2">
					{view.stage === 'ready' && <Button onClick={actions.knock} disabled={!canKnock}>Ask to join</Button>}
					{(view.stage === 'connecting' || view.stage === 'waiting') && <Button variant="outline" onClick={actions.cancel}>Cancel</Button>}
					{(view.stage === 'host-absent' || view.stage === 'failed') && (
						<>
							<Button variant="ghost" onClick={actions.cancel}>Open the Studio instead</Button>
							<Button onClick={actions.retry}>Try again</Button>
						</>
					)}
					{(view.stage === 'denied' || view.stage === 'full') && <Button onClick={actions.cancel}>Open the Studio</Button>}
				</div>
				<p className="mt-4 border-t border-border pt-3 text-[11px] leading-relaxed text-muted-foreground">
					Your edits and calls go directly between browsers. Lattice has no server that sees them.
				</p>
			</div>
		</div>
	);
}
