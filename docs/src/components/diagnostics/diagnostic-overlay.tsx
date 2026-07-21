// Shared chassis for the studio/site DIAGNOSTIC OVERLAYS — the small, draggable,
// on-brand floating panels: PerfOverlay, VizDiagnosticsOverlay, ViewportDebugOverlay,
// and ReadAloudOverlay. Each of those grew its own copy of the same ~80-line panel
// (drag the grip header, clamp on-screen, portal to <body>) plus the same ~20-line
// enable/singleton gate; a fourth clone (ViewportDebugOverlay, #1129) crossed the
// rule-of-three line and the four copies were drifting. This module is the single
// source of truth for both halves (HARD RULE #15), so a fix to the drag math or the
// on-brand surface lands once, for all of them.
//
// Two exports, matching the two duplicated concerns:
//   • useDiagnosticGate() — the "render nothing until the shared pref is on" gate: the
//     URL-param honor, the live pref subscription, and a per-overlay singleton claim
//     (so a doubly-included island still shows ONE). Returns whether to mount.
//   • DiagnosticPanel — the panel itself: position restore + on-screen clamp + pointer
//     drag on the grip header + <body> portal + the standard grip / label / × header.
//     The body is `children`; everything that varies (label, id/testid, close handler,
//     default corner, aria-live, width/shape) is a prop.

import { X } from 'lucide-react';
import * as React from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

// ── The enable / singleton gate ───────────────────────────────────────────────
// A module-level claim token, unique per overlay module (each passes its own), so the
// "only one instance renders" rule is per overlay TYPE, not global across all overlays.
export type OverlayClaim = { held: boolean };

export function useDiagnosticGate(cfg: {
	/** GA/feature gate — false disables the overlay outright. */
	available: boolean;
	/** Read the shared pref (localStorage-backed). */
	isEnabled: () => boolean;
	/** Subscribe to same-page pref flips; returns an unsubscribe fn. */
	subscribe: (fn: (on: boolean) => void) => () => void;
	/** Honor this overlay's `?param` once at load (writes the shared pref). Optional. */
	applyUrlParam?: () => void;
	/** The per-overlay singleton token (a stable module-level object). */
	claim: OverlayClaim;
}): boolean {
	const [enabled, setEnabled] = React.useState(false);
	const [owner, setOwner] = React.useState(false);

	// URL param + enabled state + live subscription. Runs once; the pref functions are
	// stable module singletons, so the empty-dep capture is correct.
	// biome-ignore lint/correctness/useExhaustiveDependencies: cfg fields are stable module singletons; the gate must run once on mount.
	React.useEffect(() => {
		if (!cfg.available) return;
		cfg.applyUrlParam?.();
		setEnabled(cfg.isEnabled());
		return cfg.subscribe(setEnabled);
	}, []);

	// Claim the singleton so duplicate includes don't stack overlays: the FIRST to mount
	// wins and renders, later instances early-return (owner stays false).
	//
	// KNOWN LIMITATION (pre-existing, carried over verbatim from the four originals): this
	// assumes overlay instances of one type mount/unmount TOGETHER. If two instances of the
	// same overlay are on a page (e.g. PerfOverlay on both the Header and a features block)
	// and the winner unmounts ALONE, `held` flips false but the loser's mount-effect has
	// already run and won't re-fire, so nothing renders until a full remount. Not reached in
	// practice (co-located includes mount/unmount together at nav); a ref-counted claim would
	// close it if a real dual-mount surface ever appears.
	// biome-ignore lint/correctness/useExhaustiveDependencies: claim is a stable module token; claim/release once on mount.
	React.useEffect(() => {
		if (!cfg.available || cfg.claim.held) return;
		cfg.claim.held = true;
		setOwner(true);
		return () => {
			cfg.claim.held = false;
			setOwner(false);
		};
	}, []);

	return cfg.available && enabled && owner;
}

// ── The draggable panel ────────────────────────────────────────────────────────
type Pos = { left: number; top: number } | null;

// EXACTLY ONE selector attribute — a compile-time XOR, so a caller can't pass both (two
// selector attributes on one node) or neither (an unselectable panel). Perf/ReadAloud use
// a DOM `id`; Viz/Viewport use `data-testid`.
type PanelIdentity = { id: string; testId?: never } | { testId: string; id?: never };

type DiagnosticPanelProps = PanelIdentity & {
	/** localStorage key for the persisted drag position (unique per overlay). */
	posKey: string;
	/** Uppercase header label, e.g. "performance · live". */
	label: string;
	/** Called by the × button (typically the overlay's setEnabled(false)). */
	onClose: () => void;
	/** aria-label for the × button, e.g. "Hide performance overlay". */
	closeLabel: string;
	/** Optional live-region politeness; omitted = no aria-live. */
	ariaLive?: 'polite' | 'off';
	/** Which corner the panel rests in before it's ever dragged. */
	corner?: 'bottom-left' | 'top-left';
	/** Extra classes for width / shape / font (the one part that varies per overlay). */
	panelClassName?: string;
	children: React.ReactNode;
};

export function DiagnosticPanel({ posKey, label, onClose, closeLabel, id, testId, ariaLive, corner = 'bottom-left', panelClassName, children }: DiagnosticPanelProps) {
	const ref = React.useRef<HTMLDivElement>(null);
	const [pos, setPos] = React.useState<Pos>(() => {
		try {
			const p = JSON.parse(localStorage.getItem(posKey) || 'null');
			return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? { left: p.x, top: p.y } : null;
		} catch {
			return null;
		}
	});

	// Keep a restored / dragged position on-screen: a panel saved near the edge of a
	// wide window would otherwise render fully offscreen on a narrower viewport (or after
	// a resize) with no way to grab it back. Clamp on mount and on every resize.
	React.useEffect(() => {
		const clamp = () => {
			const el = ref.current;
			if (!el) return;
			setPos((p) => {
				if (!p) return p;
				const left = Math.max(4, Math.min(p.left, window.innerWidth - el.offsetWidth - 4));
				const top = Math.max(4, Math.min(p.top, window.innerHeight - el.offsetHeight - 4));
				return left === p.left && top === p.top ? p : { left, top };
			});
		};
		clamp();
		window.addEventListener('resize', clamp);
		return () => window.removeEventListener('resize', clamp);
	}, []);

	// Drag the header. Move/up listen on document for the drag's duration so it keeps
	// tracking when the pointer leaves the small header.
	const onHeaderPointerDown = (e: React.PointerEvent) => {
		if ((e.target as HTMLElement).closest('.dp-close')) return;
		const el = ref.current;
		if (!el) return;
		const r = el.getBoundingClientRect();
		const ox = r.left;
		const oy = r.top;
		const sx = e.clientX;
		const sy = e.clientY;
		const onMove = (ev: PointerEvent) => {
			const nx = Math.max(4, Math.min(ox + ev.clientX - sx, window.innerWidth - el.offsetWidth - 4));
			const ny = Math.max(4, Math.min(oy + ev.clientY - sy, window.innerHeight - el.offsetHeight - 4));
			setPos({ left: nx, top: ny });
		};
		const onUp = () => {
			document.removeEventListener('pointermove', onMove);
			const r2 = el.getBoundingClientRect();
			try {
				localStorage.setItem(posKey, JSON.stringify({ x: r2.left, y: r2.top }));
			} catch {}
		};
		document.addEventListener('pointermove', onMove);
		document.addEventListener('pointerup', onUp, { once: true });
		e.preventDefault();
	};

	const style: React.CSSProperties = pos
		? { left: pos.left, top: pos.top, right: 'auto', bottom: 'auto' }
		: corner === 'top-left'
			? { left: 'max(8px, env(safe-area-inset-left))', top: 'max(8px, env(safe-area-inset-top))' }
			: { left: 'max(8px, env(safe-area-inset-left))', bottom: 'max(8px, env(safe-area-inset-bottom))' };

	const panel = (
		<div
			ref={ref}
			id={id}
			data-testid={testId}
			role="status"
			aria-live={ariaLive}
			className={cn('lx-ui fixed z-[2147483646] select-none rounded-xl border border-border bg-popover/95 px-2.5 pt-2 pb-2.5 text-[12px] leading-[1.4] text-popover-foreground shadow-lg backdrop-blur-sm', panelClassName)}
			style={style}
		>
			{/* `dp-grip` is the stable DRAG-HANDLE contract hook (paired with `.dp-close`) — tests
			    and any future tooling key on it, NOT the `cursor-grab` styling utility. */}
			<div className="dp-grip mb-1.5 flex shrink-0 cursor-grab touch-none items-center gap-2 active:cursor-grabbing" onPointerDown={onHeaderPointerDown}>
				<span aria-hidden className="grid grid-cols-2 gap-[2px] p-px opacity-60">
					{['a', 'b', 'c', 'd', 'e', 'f'].map((k) => (
						<i key={k} className="block size-[3px] rounded-full bg-muted-foreground" />
					))}
				</span>
				{/* font-mono on the label itself (not just inherited from a font-mono panel) so the
				    title reads mono on every overlay — ReadAloud's panel isn't mono-wrapped. */}
				<span className="flex-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
				<button
					type="button"
					aria-label={closeLabel}
					onClick={onClose}
					className="dp-close -my-1 -mr-1 cursor-pointer rounded border-0 bg-transparent px-1 py-0.5 text-muted-foreground transition-colors hover:text-foreground"
				>
					<X className="size-3.5" aria-hidden />
				</button>
			</div>
			{children}
		</div>
	);

	if (typeof document === 'undefined') return null;
	return createPortal(panel, document.body);
}
