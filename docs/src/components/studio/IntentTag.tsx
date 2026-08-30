import { CheckCircle2, Info, OctagonX, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

// Color-independent status signal (plan PM-13 / WCAG 1.4.1). Each intent pairs
// color with a SHAPE-distinct icon + a text label, so the meaning survives in
// grayscale and across the CVD palettes. Color only reinforces.
export type Intent = 'pass' | 'review' | 'fix' | 'info';

const MAP: Record<Intent, { Icon: typeof CheckCircle2; label: string; cls: string }> = {
	pass: { Icon: CheckCircle2, label: 'READY', cls: 'text-[var(--pass)] border-[color-mix(in_srgb,var(--pass)_45%,transparent)]' },
	review: { Icon: TriangleAlert, label: 'REVIEW', cls: 'text-[var(--warn)] border-[color-mix(in_srgb,var(--warn)_45%,transparent)]' },
	fix: { Icon: OctagonX, label: 'FIX', cls: 'text-[#b42318] border-[color-mix(in_srgb,#b42318_45%,transparent)] dark:text-[#f97066]' },
	info: { Icon: Info, label: 'INFO', cls: 'text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_45%,transparent)]' },
};

export function IntentTag({ intent, label, className }: { intent: Intent; label?: string; className?: string }) {
	const { Icon, label: deflabel, cls } = MAP[intent];
	return (
		<span
			className={cn(
				'inline-flex items-center gap-1 rounded-full border-[1.5px] bg-background px-2 py-[2px] font-mono text-[10px] font-bold tracking-wide',
				cls,
				className,
			)}
		>
			<Icon className="size-3" aria-hidden />
			{label ?? deflabel}
		</span>
	);
}
