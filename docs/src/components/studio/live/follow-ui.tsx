// How a settings row looks while the person we follow is in it: a ring in the accent color, and their name on a
// small tag. A location only; nothing they typed or picked is shown (design note 2026-10-21 §7.6).

/** Put on the row's root (which is `relative`-positioned by `FOLLOW_GHOST` itself). */
export const FOLLOW_GHOST = 'relative rounded-md outline outline-2 outline-offset-2 outline-[var(--accent)]';

export function FollowChip({ name }: { name: string }) {
	return (
		<span role="status" className="pointer-events-none absolute right-1 top-0 z-10 max-w-[60%] truncate rounded-b-md bg-[var(--accent)] px-1.5 py-px text-[10px] font-semibold leading-tight text-[var(--on-accent)]">
			{name}
		</span>
	);
}
