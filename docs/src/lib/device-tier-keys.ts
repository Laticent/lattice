// The storage keys the device tier shares between its eager gate (device-gate.ts) and its lazy runtime (device-tier.ts).
// Their own module, so the gate does not pull the runtime into the page's startup JavaScript. studio.astro's inline boot
// script spells `lattice-device-tier` out by hand, because an inline script imports nothing.

/** Where the decided tier is saved for the next page load's pre-paint read. */
export const TIER_KEY = 'lattice-device-tier';
/** "Continue anyway", for this tab only (sessionStorage is per tab). */
export const CONTINUE_KEY = 'lattice-device-continue';
/** The person's Auto / Full / Lite choice (Workspace settings). Absent means Auto. It never lifts a decline. */
export const OVERRIDE_KEY = 'lattice-device-tier-override';
