// What a Library photo shows when its picture cannot be drawn: the file is unreadable, the browser dropped it, or an image
// failed to decode. It replaces the browser's own broken-image mark, which is a blue "?" box that looks like a crash and says
// nothing. This one is ours: a small LATTICE of tiles (the product's own shape) with one tile cracked and slipped out of place.
// Colors are tokens only (HARD RULE #3), so it follows the theme and dark mode with no variant.
export function PhotoPlaceholder({ compact = false, className = '' }: { compact?: boolean; className?: string }) {
	return (
		<div className={`flex h-full w-full flex-col items-center justify-center gap-1.5 bg-[var(--bg-alt)] text-muted-foreground ${className}`} role="img" aria-label="This photo can't be shown" data-photo-placeholder>
			<svg viewBox="0 0 96 64" className={compact ? 'h-9 w-auto' : 'h-20 w-auto'} fill="none" aria-hidden>
				<title>Broken photo</title>
				{/* The lattice: a 4 x 3 grid of tiles, one gap where the cracked tile came out. */}
				{[0, 1, 2].flatMap((row) =>
					[0, 1, 2, 3].map((col) => {
						const x = 8 + col * 20;
						const y = 6 + row * 18;
						if (row === 1 && col === 2) return null;
						return <rect key={`${row}-${col}`} x={x} y={y} width="16" height="14" rx="2.5" stroke="currentColor" strokeOpacity="0.55" strokeWidth="1.4" />;
					}),
				)}
				{/* The tile that came loose: dropped a little, tilted, split by a crack. */}
				<g transform="translate(52 34) rotate(7 8 7)">
					<path d="M2.5 0 H13.5 A2.5 2.5 0 0 1 16 2.5 V11.5 A2.5 2.5 0 0 1 13.5 14 H2.5 A2.5 2.5 0 0 1 0 11.5 V2.5 A2.5 2.5 0 0 1 2.5 0 Z" stroke="var(--accent)" strokeWidth="1.6" />
					<path d="M9 0 L6.5 5 L10 8 L7 14" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
				</g>
			</svg>
			{!compact && <span className="px-4 text-center text-[12.5px]">This photo can’t be shown. Its file may be missing from this browser.</span>}
		</div>
	);
}
