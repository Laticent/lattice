/**
 * The verdict for the GALLERY REOPEN probe (gallery-memory-probe.js, PROBE=gallery-memory, #3441): shared by run.mjs, which
 * drives Mobile Safari in the iOS Simulator, and probe.selftest.mjs, which drives Playwright's WebKit. One arm is one page
 * at one pinned device tier: the cycles gallery-memory-probe.js's `latticeGalleryCycle` returned, plus the memory the runner
 * read on the Mac after each close (null where it cannot read any: the self-test, and `SIM_UDID=mac`).
 *
 * Every check counts WORK, never time (HARD RULE #32), and they are MR-3's relations
 * (docs/e2e/gallery-preview-metamorphic.spec.ts), in its letters:
 *   (a) every close leaves the same live frames as the first, within SLACK, and never more than the pool's hard ceiling;
 *   (c) the reopens after the first make at most SLACK documents (a pool may still grow a frame or two);
 *   (d) the reopens after the first REWRITE no kept frame, with no slack. This is the one #3441 fixed: before it, a LITE
 *       pool swapped frames across the Mermaid boundary on every reopen.
 * Memory is REPORTED, never judged: a simulator's WebKit is a Mac process with no jetsam, so its footprint is a cost an
 * iPhone would weigh, not the reload itself, and a reading moves with what else the runner is doing.
 */

/** A settled count can differ by a tile or two without anything being wrong (MR-3's SLACK). */
export const SLACK = 4;
/** The pool's HARD_MAX_SLOTS (28, preview-pool.tsx), plus the Studio's own preview and one spare. */
export const LIVE_CEILING = 30;

/** Sum of a vmmap reading (a Map of pid to MB, null entries skipped), or null when nothing was read. */
export function totalMB(reading) {
	if (!reading || reading.size === 0) return null;
	let sum = 0;
	for (const v of reading.values()) if (typeof v === 'number') sum += v;
	return Math.round(sum);
}

/**
 * Judge one arm. `arm` is { tier, cycles: [{ ok, opened, closed, docs, rewrites, tier, error }], memoryMB: [number|null] }.
 * Returns the named steps; an arm passes when every step passes.
 */
export function galleryChecks(arm) {
	const steps = [];
	const step = (name, pass, detail = '') => steps.push({ name, pass: !!pass, detail: String(detail) });
	const cycles = arm.cycles || [];
	const broken = cycles.find((c) => !c.ok);
	step('every open and close ran', cycles.length >= 3 && !broken, broken ? `cycle ${broken.cycle + 1}: ${broken.error}` : `${cycles.length} cycles`);
	if (cycles.length < 3 || broken) return steps;
	const first = cycles[0];
	const last = cycles[cycles.length - 1];
	step(`the page ran at the pinned tier (${arm.tier})`, cycles.every((c) => c.tier === arm.tier), cycles.map((c) => c.tier || '?').join('/'));
	const closed = cycles.map((c) => c.closed);
	step(
		'(a) every close leaves the frames the first close left, within the slack',
		closed.every((n) => n <= closed[0] + SLACK && n <= LIVE_CEILING),
		`live frames after each close: ${closed.join(', ')} (slack ${SLACK}, ceiling ${LIVE_CEILING})`,
	);
	const made = last.docs - first.docs;
	step('(c) the reopens made no new documents, within the slack', made <= SLACK, `${made} documents in ${cycles.length - 1} reopens (slack ${SLACK})`);
	const rewrote = last.rewrites - first.rewrites;
	step('(d) the reopens rewrote no kept preview frame', rewrote === 0, `${rewrote} rewrites in ${cycles.length - 1} reopens`);
	const opened = cycles.map((c) => c.opened);
	step('opening is the same each time, within the slack', Math.abs(opened[0] - opened[opened.length - 1]) <= SLACK, `mounted after the flick: ${opened.join(', ')}`);
	// (e) MR-8's relation: opened and closed at the top, every tile on screen shows its slide after each reopen.
	if (arm.shows) {
		const broke = arm.shows.find((o) => !o.ok);
		const blank = arm.shows.filter((o) => o.ok && o.blank.length);
		step(
			'(e) every tile on screen shows its slide after each reopen at the top',
			arm.shows.length >= 3 && !broke && blank.length === 0,
			broke ? `open ${broke.open + 1}: ${broke.error}` : blank.length ? blank.map((o) => `open ${o.open + 1}: ${o.blank.join(', ')}`).join('; ') : `${arm.shows.length} opens, no blank tile`,
		);
	}
	return steps;
}

/** One line for the log: what an arm did, and what memory it read. */
export function gallerySummary(name, arm) {
	const cycles = arm.cycles || [];
	if (arm.error) return `${name}: ERROR ${arm.error}`;
	const first = cycles[0] || {};
	const last = cycles[cycles.length - 1] || {};
	const mem = (arm.memoryMB || []).filter((v) => typeof v === 'number');
	const memory = mem.length >= 2 ? `, WebKit ${mem[0]} MB after close 1, ${mem[mem.length - 1]} MB after close ${mem.length} (${mem[mem.length - 1] - mem[0] >= 0 ? '+' : ''}${mem[mem.length - 1] - mem[0]} MB)` : '';
	// Reported, never judged: the most tiles on screen in the prime walk and in each flick, as count@scrollTop.
	const seen = first.primeSeen ? `; tiles seen: prime ${first.primeSeen}, flicks ${cycles.map((c) => c.flickSeen || '?').join(' ')}` : '';
	return `${name}: ${cycles.length} cycles at ${arm.tier}, ${(last.docs ?? 0) - (first.docs ?? 0)} documents and ${(last.rewrites ?? 0) - (first.rewrites ?? 0)} rewrites after close 1${memory}${seen}`;
}
