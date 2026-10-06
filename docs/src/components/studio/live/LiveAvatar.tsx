import { cn } from '@/lib/utils';
import { initials, type LivePerson, liveColor } from './live-model';

// A person's initials badge, in its own module so the header pill and the preview corner can draw
// it without loading the Live panel (which is lazy — studio-panels.ts).

/** A person's round initials badge in their session color. `ring` marks the speaker. */
export function LiveAvatar({ person, size = 24, ring = false, className }: { person: Pick<LivePerson, 'name' | 'color'>; size?: number; ring?: boolean; className?: string }) {
	return (
		<span
			aria-hidden
			className={cn('grid shrink-0 place-items-center rounded-full font-bold leading-none', ring && 'outline-2 outline-offset-2', className)}
			style={{ width: size, height: size, fontSize: Math.round(size * 0.42), background: liveColor(person.color), color: 'var(--bg)', outlineColor: ring ? liveColor(person.color) : undefined, outlineStyle: ring ? 'solid' : undefined }}
		>
			{initials(person.name)}
		</span>
	);
}

