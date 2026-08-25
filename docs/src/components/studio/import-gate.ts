import { gateCss } from '@/playground/layout-core.generated.js';
import { gateThemeCss } from '@/playground/theme-core.generated.js';

// The safety check on IMPORTED asset CSS — a `.zip` a stranger sent you.
//
// ── WHY THIS IS SCOPED TO THE IMPORT, AND NOT TO THE STORE ───────────────────
//
// The first cut of this guard lived in `saveStudioTheme`, on the reasoning that the
// import, the workspace restore and Fabricate's own Save all meet there, so one
// guard covers all three. That reasoning is right for a NON-DESTRUCTIVE action —
// it is why version history sits in `putAsset` — and wrong for a REFUSAL, because a
// refusal's false positives destroy work rather than merely pausing a preview.
//
// The gate has false positives, and they are not exotic. Both measured:
//
//   `:root{--code-javascript:#f0db4f}`  → blocked. `CSS_EXFIL_RULES`'s `css-scheme`
//       rule matches `javascript:` inside the PROPERTY NAME. A `.javascript:hover`
//       selector trips it too.
//   `@import 'indaco'; :root{…}`        → blocked. A composing theme is rejected
//       unless the caller passes a registry, and 18 of the 32 SHIPPED themes are
//       blocked under the default. Fabricate's CSS view lets an author type exactly
//       this, and the theme gate models it as a first-class case (`composes`).
//
// Before the guard, either of those saved and previewed blank — recoverable, and the
// author could see why. Behind a store-level refusal, the first can never be saved,
// and inside `restoreWorkspace` — which has no per-item guard and runs AFTER decks
// and settings are already merged — one such theme in your own backup aborts the
// whole restore with no way to skip it. That is a denial of service on a person's
// own data, caused by a guard meant to protect them from a stranger.
//
// So the refusal applies where the threat model actually says it should: the `.zip`,
// the one path where the AUTHOR and the VICTIM are different people. Your own
// hand-edit and your own backup are your own risk, and the live findings in
// Fabricate already tell you what is wrong with them.
//
// ── WHAT COUNTS AS A REFUSAL ─────────────────────────────────────────────────
//
// Only findings that are unambiguously an OFF-DEVICE FETCH. `css-scheme` is
// deliberately excluded: it is the rule with demonstrated false positives on a
// property name and on a selector, and a `javascript:` URL in a stylesheet cannot
// execute in any shipping browser — so it buys nothing and costs a legitimate
// refusal. It still reports as a finding; it just does not veto an import.

/** Findings that veto an imported asset. Off-device fetches and script vectors. */
const REFUSING_RULES = new Set([
	'css-url-remote', // a remote url() — the beacon
	'css-import', // a remote or unresolvable @import (theme gate allowlists the legit one)
	'theme-import', // the theme gate's own verdict on a non-allowlisted import target
	'css-expression', // legacy IE script-in-CSS
	'css-binding', // -moz-binding
]);

export type ImportRefusal = { name: string; why: string } | null;

type Finding = { rule?: string; message?: string; blocking?: boolean };

function firstRefusal(findings: Finding[] | undefined, name: string): ImportRefusal {
	const hit = (findings ?? []).find((f) => f.rule && REFUSING_RULES.has(f.rule));
	return hit ? { name, why: hit.message ?? 'it reaches off the device.' } : null;
}

/**
 * Refuse imported THEME css that reaches off the device, or `null` to allow.
 *
 * `knownThemes` is left at the gate's default (the base theme alone) for the reason
 * its own docblock gives: the registry is what is actually REGISTERED, not what a
 * catalog lists. Nothing legitimate is lost on THIS path — `packTheme` only ever
 * exports a Studio theme, and a Studio theme imports the base and nothing else. (A
 * palette-to-palette import would not resolve in the receiving browser anyway, and
 * since #1841 the engine drops rather than hoists it.)
 */
export function refuseImportedTheme(css: string, name: string): ImportRefusal {
	const verdict = gateThemeCss(css) as { findings?: Finding[] };
	return firstRefusal(verdict.findings, name);
}

/**
 * Refuse imported COMPONENT css on the same terms.
 *
 * The component arm of the same `.zip` was ungated while the theme arm was not, which
 * is the same hole in the same file: hostile component CSS reaches the same
 * same-origin preview `<style>` (`single-slide-render.ts`) and every export, and the
 * intended workflow — import, then insert the skeleton — is what fires it. `gateCss`
 * already runs on component CSS in Fabricate for live findings, so this is the same
 * "guards a preview, not the library" gap, closed on the same path.
 */
export function refuseImportedComponent(css: string, name: string): ImportRefusal {
	const findings = (gateCss(css, name) as { findings?: Finding[] } | Finding[]);
	const list = Array.isArray(findings) ? findings : findings?.findings;
	return firstRefusal(list, name);
}
