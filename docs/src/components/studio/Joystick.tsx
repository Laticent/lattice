import * as React from 'react';
import { cn } from '@/lib/utils';

// A small CSS-3D analog JOYSTICK — a rate control for nudging a bound value (or an
// x/y pair) by FEEL. Push the puck and it tilts in 3D toward your drag; the further
// you push, the FASTER the bound value changes (a signed-square response, so it's
// fine near center and quick at the rim). Release and the puck springs back to
// center and motion stops. It is the hero placement control of the Finish Studio,
// but it's generic: it only emits a normalized direction/velocity, the consumer
// decides what moves.
//
// CONTRACT. While the stick is active the component calls `onNudge(dx, dy)` once per
// animation frame with dx,dy in [-1, 1] (0 = center, ±1 = full push). The consumer
// scales by its own per-call STEP: `value = clamp(value + dx * STEP)`. Because both
// the per-frame pointer loop AND a single keyboard arrow press call `onNudge` the
// same way, holding the stick moves fast (~60 calls/s) while a key tap nudges once —
// precise. A 1-D consumer just ignores dy.
//
// ACCESSIBILITY. The control is a focusable group; arrow keys nudge it (with the same
// onNudge contract), so it's fully keyboard-operable and never the only way to set a
// value — the Finish Studio always pairs it with exact numeric fields. Honors
// prefers-reduced-motion by skipping the 3D tilt animation (the nudge still works).

export type JoystickProps = {
	/** Called with a normalized direction/velocity (dx, dy ∈ [-1, 1]); per animation
	 *  frame while dragging, once per keyboard arrow press. */
	onNudge: (dx: number, dy: number) => void;
	/** Accessible label, e.g. "Move mark". */
	label: string;
	/** Lock to one axis — hides/zeros the other. Default 'both'. */
	axis?: 'both' | 'x' | 'y';
	disabled?: boolean;
	/** Diameter in px (the base plate). Default 92. */
	size?: number;
	className?: string;
};

// Signed square — gentle near center, quick at the rim ("the more you push, the
// faster it moves"), sign preserved.
const ramp = (t: number): number => Math.sign(t) * t * t;
const clamp1 = (n: number): number => Math.max(-1, Math.min(1, n));

export function Joystick({ onNudge, label, axis = 'both', disabled = false, size = 92, className }: JoystickProps) {
	const baseRef = React.useRef<HTMLDivElement>(null);
	// Live, ref-held push vector so the rAF loop reads the latest without re-subscribing.
	const vecRef = React.useRef({ x: 0, y: 0 });
	const rafRef = React.useRef<number | null>(null);
	const kbTimerRef = React.useRef<number | null>(null); // keyboard flick settle timer
	const onNudgeRef = React.useRef(onNudge);
	onNudgeRef.current = onNudge;
	// `active` drives the visual (raised, accent ring); the vector drives the math.
	const [active, setActive] = React.useState(false);
	const [knob, setKnob] = React.useState({ x: 0, y: 0 }); // -1..1 for the visual transform

	const lockX = axis === 'y'; // x movement disallowed
	const lockY = axis === 'x';

	const stopLoop = React.useCallback(() => {
		if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
		rafRef.current = null;
	}, []);

	// The per-frame pump — apply the current push as a velocity, then schedule the next.
	const pump = React.useCallback(() => {
		const { x, y } = vecRef.current;
		if (x !== 0 || y !== 0) onNudgeRef.current(ramp(x), ramp(y));
		rafRef.current = requestAnimationFrame(pump);
	}, []);

	const startLoop = React.useCallback(() => {
		if (rafRef.current === null) rafRef.current = requestAnimationFrame(pump);
	}, [pump]);

	// Map a pointer position to a normalized push vector (clamped to the plate radius).
	const setFromPointer = React.useCallback(
		(clientX: number, clientY: number) => {
			const el = baseRef.current;
			if (!el) return;
			const r = el.getBoundingClientRect();
			if (r.width === 0 || r.height === 0) return; // not laid out yet — avoid 0/0 → NaN
			const cx = r.left + r.width / 2;
			const cy = r.top + r.height / 2;
			const radius = r.width / 2;
			const nx = lockX ? 0 : clamp1((clientX - cx) / radius);
			const ny = lockY ? 0 : clamp1((clientY - cy) / radius);
			vecRef.current = { x: nx, y: ny };
			setKnob({ x: nx, y: ny });
		},
		[lockX, lockY],
	);

	const release = React.useCallback(() => {
		vecRef.current = { x: 0, y: 0 };
		setKnob({ x: 0, y: 0 });
		setActive(false);
		stopLoop();
	}, [stopLoop]);

	const onPointerDown = (e: React.PointerEvent) => {
		if (disabled) return;
		e.preventDefault();
		(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
		setActive(true);
		setFromPointer(e.clientX, e.clientY);
		startLoop();
	};
	const onPointerMove = (e: React.PointerEvent) => {
		if (!active) return;
		setFromPointer(e.clientX, e.clientY);
	};

	// Keyboard: one nudge per arrow press (key-repeat gives continuous motion). Same
	// onNudge contract, so the consumer's STEP makes a tap a precise single step.
	const onKeyDown = (e: React.KeyboardEvent) => {
		if (disabled) return;
		let dx = 0;
		let dy = 0;
		if (e.key === 'ArrowLeft') dx = -1;
		else if (e.key === 'ArrowRight') dx = 1;
		else if (e.key === 'ArrowUp') dy = -1;
		else if (e.key === 'ArrowDown') dy = 1;
		else return;
		if (lockX) dx = 0;
		if (lockY) dy = 0;
		if (dx === 0 && dy === 0) return;
		e.preventDefault();
		onNudgeRef.current(dx, dy);
		// A brief visual flick toward the key, then settle (timer cleared on unmount).
		setKnob({ x: dx * 0.6, y: dy * 0.6 });
		if (kbTimerRef.current !== null) clearTimeout(kbTimerRef.current);
		kbTimerRef.current = window.setTimeout(() => setKnob({ x: 0, y: 0 }), 110);
	};

	// Tear down the loop + settle timer on unmount.
	React.useEffect(
		() => () => {
			stopLoop();
			if (kbTimerRef.current !== null) clearTimeout(kbTimerRef.current);
		},
		[stopLoop],
	);
	// If the control is disabled mid-drag, abandon the loop so onNudge stops firing.
	React.useEffect(() => {
		if (disabled) release();
	}, [disabled, release]);

	// 3D visual. The plate sits in a perspective box; the inner assembly tilts toward
	// the push (rotateY by x, rotateX by -y), and the knob slides + lifts. A reduced-
	// motion user gets the knob slide without the tilt.
	const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
	const tiltX = reduce ? 0 : -knob.y * 18;
	const tiltY = reduce ? 0 : knob.x * 18;
	const travel = size * 0.28;

	return (
		<div
			ref={baseRef}
			role="application"
			aria-roledescription="joystick — arrow keys nudge"
			aria-label={label}
			aria-disabled={disabled || undefined}
			tabIndex={disabled ? -1 : 0}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={release}
			onPointerCancel={release}
			onLostPointerCapture={release}
			onKeyDown={onKeyDown}
			onBlur={release}
			className={cn(
				'relative shrink-0 touch-none select-none rounded-full outline-none',
				'bg-[radial-gradient(circle_at_50%_38%,color-mix(in_srgb,var(--accent)_8%,var(--bg-alt)),var(--bg-alt))]',
				'border border-border shadow-inner',
				disabled ? 'cursor-not-allowed opacity-50' : 'cursor-grab active:cursor-grabbing',
				'focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
				active && 'ring-2 ring-[color-mix(in_srgb,var(--accent)_60%,transparent)]',
				className,
			)}
			style={{ width: size, height: size, perspective: `${size * 2.4}px` }}
		>
			{/* faint compass ticks + center crosshair */}
			<span aria-hidden className="pointer-events-none absolute inset-[14%] rounded-full border border-dashed border-[color-mix(in_srgb,var(--accent)_22%,transparent)]" />
			<span aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[color-mix(in_srgb,var(--accent)_35%,transparent)]" />
			{/* the 3D assembly */}
			<div
				aria-hidden
				className="absolute inset-0 grid place-items-center"
				style={{ transformStyle: 'preserve-3d', transform: `rotateX(${tiltX}deg) rotateY(${tiltY}deg)`, transition: active ? 'none' : 'transform 240ms cubic-bezier(.2,.9,.2,1)' }}
			>
				{/* the knob — slides toward the push and lifts in Z */}
				<div
					className="rounded-full border border-[color-mix(in_srgb,var(--accent)_45%,var(--border))] bg-[radial-gradient(circle_at_38%_30%,color-mix(in_srgb,var(--accent)_30%,var(--bg-alt)),color-mix(in_srgb,var(--accent)_8%,var(--bg-alt)))]"
					style={{
						width: size * 0.42,
						height: size * 0.42,
						transform: `translate3d(${knob.x * travel}px, ${knob.y * travel}px, ${active ? size * 0.16 : size * 0.08}px)`,
						transition: active ? 'none' : 'transform 240ms cubic-bezier(.2,.9,.2,1)',
						boxShadow: `0 ${active ? 10 : 5}px ${active ? 16 : 9}px rgba(8, 18, 38, .28)`,
					}}
				>
					<span className="pointer-events-none absolute inset-[18%] rounded-full bg-[radial-gradient(circle_at_40%_28%,rgba(255,255,255,.5),transparent_60%)]" />
				</div>
			</div>
		</div>
	);
}
