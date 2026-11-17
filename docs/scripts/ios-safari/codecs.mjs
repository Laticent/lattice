/**
 * The verdict for the narration codec probe (PROBE=codec-support, codec-probe.js), shared by run.mjs (Mobile Safari in an
 * iPhone iOS Simulator) and probe.selftest.mjs (Playwright's engines). The checks are what the streaming narration design
 * needs from a browser: Opus decodes from a standard container with no added lead-in, and WebCodecs can encode Opus in the
 * page and decode it back. Every other codec and container is reported, not judged: they are the bake-off's comparison.
 * Work, never time (HARD RULE #32): the encode speed is reported and judged by no check.
 */

/** Lead-in a player may skip without a caption or the next sentence noticing: under one 20 ms Opus frame. */
export const LEAD_IN_MS = 20;

/** @param {{ decode: Record<string, { ok: boolean, extraMs?: number }>, roundTrip: Record<string, { ok: boolean, extraMs?: number, kbps?: number, error?: string }> }} r */
export function codecChecks(r) {
	const ogg = r.decode['opus.ogg'] ?? { ok: false };
	const webm = r.decode['opus.webm'] ?? { ok: false };
	const opus24 = r.roundTrip['opus 24k @48k'] ?? { ok: false, error: 'not run' };
	const fmt = (d) => (d.ok ? `ok, +${d.extraMs} ms` : 'does not decode');
	return [
		{
			name: 'Opus decodes from Ogg or WebM with decodeAudioData',
			pass: ogg.ok || webm.ok,
			detail: `Ogg ${fmt(ogg)}; WebM ${fmt(webm)}`,
		},
		{
			name: `Opus from Ogg or WebM adds under ${LEAD_IN_MS} ms of lead-in`,
			pass: [ogg, webm].some((d) => d.ok && Math.abs(d.extraMs ?? 999) < LEAD_IN_MS),
			detail: `Ogg ${fmt(ogg)}; WebM ${fmt(webm)}`,
		},
		{
			name: 'WebCodecs encodes Opus inside a worker',
			pass: !!r.worker?.ok,
			detail: r.worker?.ok ? `${r.worker.bytes} B, ${r.worker.encodeXRealtime}x realtime` : r.worker?.error || 'not run',
		},
		{
			name: 'WebCodecs encodes speech to Opus and decodes it back',
			pass: !!opus24.ok,
			detail: opus24.ok ? `${opus24.kbps} kbps, ${opus24.extraMs} ms longer than the source (the decoder's pre-skip, which a player trims)` : opus24.error || 'failed',
		},
	];
}
