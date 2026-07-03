/**
 * The brand mark ("Spectrum Cell", minimal cut) inlined as JSX.
 *
 * Why not `<img src="/lattice-mark-min.svg">` like SiteHeader: that file's
 * dark variant rides an internal `@media (prefers-color-scheme: dark)`, which
 * follows the OS scheme — but the Studio flips light/dark via its own
 * `data-mode`, so an OS-light machine with the Studio in dark mode would get
 * navy bonds on a dark header (and cream halos glaring). Inlining lets the
 * bond/halo colors key off the app's `mode` instead.
 *
 * Geometry and palette are a 1:1 copy of docs/public/lattice-mark-min.svg
 * (source of truth: design/logo/generate.py) — bonds are Indaco navy in
 * light / sky in dark, spectrum nodes and the gold core are mode-invariant
 * brand constants ("structure is ink, colour is signal").
 */
export function LatticeMark({ mode, className }: { mode: string; className?: string }) {
	const dark = mode === 'dark';
	const bond = dark ? '#4FA8DA' : '#003D66';
	const halo = dark ? '#15110D' : '#FAF7F2';
	return (
		<svg viewBox="0 0 128 128" fill="none" aria-hidden="true" className={className}>
			<g transform="rotate(45 64 64)" stroke={bond} strokeWidth="6.4" strokeLinecap="round">
				<line x1="31" y1="31" x2="97" y2="31" />
				<line x1="97" y1="31" x2="97" y2="97" />
				<line x1="97" y1="97" x2="31" y2="97" />
				<line x1="31" y1="97" x2="31" y2="31" />
			</g>
			<circle cx="64" cy="17.3" r="12.7" fill={halo} />
			<circle cx="64" cy="17.3" r="11" fill="#5B86B8" />
			<circle cx="110.7" cy="64" r="12.7" fill={halo} />
			<circle cx="110.7" cy="64" r="11" fill="#A8628A" />
			<circle cx="64" cy="110.7" r="12.7" fill={halo} />
			<circle cx="64" cy="110.7" r="11" fill="#D08C42" />
			<circle cx="17.3" cy="64" r="12.7" fill={halo} />
			<circle cx="17.3" cy="64" r="11" fill="#7B72C0" />
			<circle cx="64" cy="64" r="16.2" fill={halo} />
			<circle cx="64" cy="64" r="14" fill="#C8A040" />
			<circle cx="64" cy="64" r="10.4" fill="none" stroke="#7A5A10" strokeWidth="1.5" opacity="0.55" />
		</svg>
	);
}
