import { Trash2 } from 'lucide-react';
import * as React from 'react';

// The two-tap delete, shared by the Library and the Workspace sheet's Data tab (HARD RULE
// #15: one delete affordance). In its own module so the Workspace sheet does not pull the
// whole Library onto the Studio's startup path.
// Two-tap delete (matches the slide-toolbar pattern) — first tap arms, second
// confirms. Exported so other Studio surfaces (the Workspace Privacy & Data tab)
// reuse the same delete affordance instead of re-styling their own (HARD RULE #15).
//
// Owns its own un-arm behavior rather than leaning on each caller to remember
// it: a "Sure?" left alone is a footgun waiting for an accidental later click
// to land as a real delete. It reverts on whichever comes first — ~3s of
// inactivity (matching StudioShell's RailOp slide-toolbar delete) or a
// pointerdown anywhere outside this button, captured at the document level so
// another component's stopPropagation can't swallow it first.
export function DeleteBtn({ armed, onArm, onConfirm, onCancel, label, labelClass }: { armed: boolean; onArm: () => void; onConfirm: () => void; onCancel: () => void; label: string;
	/** Classes for the armed button's "Sure?" word. Defaults to always-visible.
	 *
	 *  It is a PROP rather than a container query baked in here because this button is
	 *  shared — `WorkspaceSheet` renders it outside any size container, where a bare
	 *  `@[…]` would never match and would leave the confirm permanently wordless. */
	labelClass?: string }) {
	const ref = React.useRef<HTMLButtonElement>(null);
	React.useEffect(() => {
		if (!armed) return;
		const timer = setTimeout(onCancel, 3000);
		const onPointerDown = (e: PointerEvent) => {
			if (!ref.current?.contains(e.target as Node)) onCancel();
		};
		document.addEventListener('pointerdown', onPointerDown, true);
		return () => {
			clearTimeout(timer);
			document.removeEventListener('pointerdown', onPointerDown, true);
		};
	}, [armed, onCancel]);
	return armed ? (
		<button ref={ref} type="button" onClick={onConfirm} aria-label={`Confirm delete ${label}`} className="flex items-center gap-1 rounded-lg border border-[color-mix(in_srgb,var(--fail,#c0392b)_40%,transparent)] bg-[color-mix(in_srgb,var(--fail,#c0392b)_12%,transparent)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--fail,#c0392b)]"><Trash2 className="size-3.5" /><span className={labelClass}>Sure?</span></button>
	) : (
		<button type="button" onClick={onArm} aria-label={`Delete ${label}`} className="grid place-items-center rounded-lg border border-border bg-card px-2.5 py-1.5 text-muted-foreground hover:text-[var(--fail,#c0392b)]"><Trash2 className="size-3.5" /></button>
	);
}
