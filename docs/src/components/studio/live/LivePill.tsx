import { Mic, MicOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { LiveAvatar } from './LiveAvatar';
import { type LivePerson, type LiveView, liveColor } from './live-model';

// The header presence pill (§5.6): while a session is live it is the one surface visible at
// every width, so closing the Live panel never hides who is here or whether you are on air.

export function LivePill({ view, onOpen, onToggleMic }: { view: LiveView; onOpen: () => void; onToggleMic: () => void }) {
	if (view.status !== 'live') return null;
	const me = view.people.find((p) => p.me);
	const others = view.people.filter((p) => !p.me);
	const shown = view.people.slice(0, 4);
	const onAir = !!me && (me.mic === 'on' || me.mic === 'speaking');
	const muted = me?.mic === 'muted';
	return (
		<div className="flex items-center rounded-full border border-border bg-background" data-live-pill>
			<button
				type="button"
				onClick={onOpen}
				className={cn('flex items-center gap-1.5 py-0.5 pr-1.5 pl-1 hover:bg-accent', view.audio ? 'rounded-l-full' : 'rounded-full')}
				aria-label={`Live session with ${others.length === 0 ? 'nobody else yet' : others.map((p) => p.name).join(', ')}${view.waiting.length ? `; ${view.waiting.length} waiting` : ''}. Open the Live panel`}
			>
				<span className="flex -space-x-1.5">
					{shown.map((p) => <LiveAvatar key={p.id} person={p} size={22} ring={p.mic === 'speaking'} className="border-2 border-[var(--bg)]" />)}
				</span>
				{view.waiting.length > 0 && <span className="grid h-4 min-w-4 place-items-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-bold text-[var(--on-accent)]">{view.waiting.length}</span>}
			</button>
			{view.audio && <Button
				variant="ghost"
				size="icon"
				onClick={onToggleMic}
				aria-pressed={!!onAir}
				aria-label={onAir ? 'Mute your microphone' : muted ? 'Unmute your microphone' : 'Join audio'}
				className="size-7 rounded-l-none rounded-r-full"
				style={onAir && me ? { color: liveColor(me.color) } : undefined}
			>
				{onAir ? <Mic className="size-3.5" /> : <MicOff className="size-3.5 text-muted-foreground" />}
			</Button>}
		</div>
	);
}

/** The preview's corner (§5.3): who else is looking at THIS slide, since a change could land under you. */
export function LiveCorner({ people }: { people: LivePerson[] }) {
	const names = people.map((p) => p.name).join(', ');
	return (
		<span className="flex shrink-0 -space-x-1.5 normal-case tracking-normal" role="img" title={`Also here: ${names}`} aria-label={`Also on this slide: ${names}`}>
			{people.slice(0, 3).map((p) => <LiveAvatar key={p.id} person={p} size={20} ring={p.mic === 'speaking'} className="border-2 border-[var(--bg)]" />)}
		</span>
	);
}
