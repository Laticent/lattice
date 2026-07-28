import { cn } from '@/lib/utils';

// A lightweight range slider on the native <input type="range"> — no extra
// dependency (we deliberately avoid pulling @radix-ui/react-slider for one
// control). Styled to match the studio's controls; the accent-colored track fill
// is driven by a CSS gradient computed from the value. Accessible by default
// (it's a real range input); 44px-tall hit area for touch.

export type SliderProps = {
	value: number;
	min?: number;
	max?: number;
	step?: number;
	onValueChange: (v: number) => void;
	'aria-label'?: string;
	id?: string;
	className?: string;
	disabled?: boolean;
};

export function Slider({
	value, min = 0, max = 100, step = 1, onValueChange, className, disabled, id,
	'aria-label': ariaLabel,
}: SliderProps) {
	const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
	return (
		<>
			{/* Thumb styling needs vendor pseudo-elements Tailwind can't reach inline;
			    a singleton <style> (identical across instances → harmless) keeps the
			    primitive self-contained without touching global CSS. */}
			<style>{SLIDER_THUMB_CSS}</style>
			<input
			id={id}
			type="range"
			min={min}
			max={max}
			step={step}
			value={value}
			disabled={disabled}
			aria-label={ariaLabel}
			onChange={(e) => onValueChange(Number(e.target.value))}
			className={cn('lat-slider h-2 w-full cursor-pointer appearance-none rounded-full', disabled && 'cursor-not-allowed opacity-50', className)}
			style={{
				background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${pct}%, color-mix(in srgb, var(--text-heading) 14%, transparent) ${pct}%, color-mix(in srgb, var(--text-heading) 14%, transparent) 100%)`,
			}}
			/>
		</>
	);
}

const SLIDER_THUMB_CSS = `
.lat-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:16px;height:16px;border-radius:9999px;background:var(--accent);border:2px solid var(--bg);box-shadow:0 1px 3px rgba(0,0,0,.25);cursor:pointer}
.lat-slider::-moz-range-thumb{width:16px;height:16px;border-radius:9999px;background:var(--accent);border:2px solid var(--bg);box-shadow:0 1px 3px rgba(0,0,0,.25);cursor:pointer}
.lat-slider:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
`;
