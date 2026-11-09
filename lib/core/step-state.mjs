/**
 * lib/core/step-state — the step cursor, and the painter for one step of a stepping slide.
 *
 * `stepMove` / `stepEnter` (below) are the pure cursor; lib/core/present-transport.mjs re-exports them and
 * `createTransport` takes them as arguments. They live here so a surface that only paints a step does not
 * bundle the whole transport.
 *
 * The DOM half of the step contract (engineering/decisions/2026-11-09-steps-as-a-behavior.md §1).
 * The engine only TAGS: `lib/transformers/build.js` and `lib/transformers/focus.js` stamp each
 * unit with its step (`data-step`, and for focus `data-step-recede`) and the slide with its walk
 * (`data-steps`, `data-step-kind`, for focus `data-step-axes` / `data-step-styles`). The cursor
 * (`stepMove` / `stepEnter` in lib/core/present-transport.mjs) decides WHICH step is shown;
 * this paints it, so every Present surface paints a step the same way:
 *
 *   - sets `data-step-at` on the slide (and `data-build-at`, the alias the build CSS also reads);
 *   - build: `.lat-built` on every unit whose step is at or before the cursor;
 *   - focus: `.lat-focus` on the units lit at this step, `.lat-recede` on the ones that recede,
 *     and the step's `data-focus-axis` / `data-focus-style`, the attributes lib/base/base.focus.css
 *     already keys on — so a step looks exactly like the same `_focus` written by hand.
 *
 * `at === null` is the slide AT REST: every tag comes off, and the slide reads as written, the
 * way PDF, PowerPoint and the preview show it (S1).
 *
 * Self-contained (no module-scope references) so the export player and the presenter's stage
 * window inline its source verbatim, like present-transport's functions.
 *
 * @param {Element|null|undefined} section @param {number|null} at
 */
export function applyStepAt(section, at) {
	if (!section || typeof section.getAttribute !== 'function') return;
	const kind = section.getAttribute('data-step-kind');
	const n = Number(section.getAttribute('data-steps')) || 0;
	if ((kind !== 'build' && kind !== 'focus') || n <= 0) return;
	const rest = at == null;
	if (rest) {
		section.removeAttribute('data-step-at');
		section.removeAttribute('data-build-at');
	} else {
		section.setAttribute('data-step-at', String(at));
		if (kind === 'build') section.setAttribute('data-build-at', String(at));
	}
	const has = (el, attr) => !rest && (' ' + (el.getAttribute(attr) || '') + ' ').indexOf(' ' + at + ' ') >= 0;
	const units = section.querySelectorAll('[data-step], [data-step-recede]');
	for (let u = 0; u < units.length; u++) {
		const el = units[u];
		if (kind === 'build') {
			el.classList.toggle('lat-built', !rest && Number(el.getAttribute('data-step')) <= at);
		} else {
			el.classList.toggle('lat-focus', has(el, 'data-step'));
			el.classList.toggle('lat-recede', has(el, 'data-step-recede'));
		}
	}
	if (kind !== 'focus') return;
	const axis = rest ? '-' : (section.getAttribute('data-step-axes') || '').split(' ')[at - 1] || '-';
	const style = rest ? '-' : (section.getAttribute('data-step-styles') || '').split(' ')[at - 1] || '-';
	if (axis === '-') section.removeAttribute('data-focus-axis');
	else section.setAttribute('data-focus-axis', axis);
	if (style !== '-') section.setAttribute('data-focus-style', style);
}

/**
 * The walk a rendered slide carries, or `null` for a slide with no steps — the `stepsOf` answer
 * `createTransport` takes. Self-contained, for the same inlining.
 *
 * @param {Element|null|undefined} section @returns {{kind:string, count:number}|null}
 */
export function stepsOfSection(section) {
	if (!section || typeof section.getAttribute !== 'function') return null;
	const kind = section.getAttribute('data-step-kind');
	const count = Number(section.getAttribute('data-steps')) || 0;
	return (kind === 'build' || kind === 'focus') && count > 0 ? { kind, count } : null;
}

/**
 * THE STEP CURSOR — where a move lands INSIDE a stepping slide
 * (engineering/decisions/2026-11-09-steps-as-a-behavior.md §2). A slide that walks in steps
 * (`_build`, `_focusSteps`) carries `data-steps` and `data-step-kind`; the cursor is
 * `(slide, step)`, and `step === null` is the slide AT REST, the way every still format shows it.
 *
 * The two kinds count differently, by S2:
 *   - build: positions 0..N. 0 is "nothing revealed yet", N is "everything shown", which is
 *     what rest looks like too, so rest counts as N.
 *   - focus: positions 1..N, one lit unit each. Rest (nothing lit) sits before step 1.
 *
 * `stepMove` answers a next/prev from position `at`: the new position, or `false` when the move
 * leaves the slide. `stepEnter` answers where a slide entered by next/prev starts: build at 0 by
 * next, focus at 1 by next, either at N by prev. A slide with no steps is always at rest.
 * Pure and self-contained, so the export player inlines them verbatim.
 *
 * @param {string|null|undefined} kind 'build' | 'focus' @param {number} count
 * @param {number|null} at @param {'next'|'prev'} dir
 * @returns {number|false}
 */
export function stepMove(kind, count, at, dir) {
	const n = Number(count) || 0;
	if (n <= 0 || (kind !== 'build' && kind !== 'focus')) return false;
	if (kind === 'build') {
		const a = at == null ? n : at;
		if (dir === 'next') return a < n ? a + 1 : false;
		return a > 0 ? a - 1 : false;
	}
	if (dir === 'next') {
		if (at == null) return 1;
		return at < n ? at + 1 : false;
	}
	if (at == null) return false;
	return at > 1 ? at - 1 : false;
}

/**
 * Where a slide starts when it is entered: by `next`, by `prev`, or by a `jump` (the rail, the overview, Home/End, a
 * lens, opening Present on it). A jump lands a BUILD at step 0, nothing revealed, so a slide reached any way still
 * builds (the owner's D2, 2026-11-09); a jump lands a FOCUS walk at rest, nothing lit, since its rest shows every unit.
 *
 * @param {string|null|undefined} kind @param {number} count @param {'next'|'prev'|'jump'} dir
 * @returns {number|null}
 */
export function stepEnter(kind, count, dir) {
	const n = Number(count) || 0;
	if (n <= 0 || (kind !== 'build' && kind !== 'focus')) return null;
	if (dir === 'jump') return kind === 'build' ? 0 : null;
	if (dir === 'prev') return n;
	if (dir === 'next') return kind === 'build' ? 0 : 1;
	// Anything else (a 'rest' entry, a typo, a value from a newer host) lands at rest, every unit shown: the safe still.
	// Never read an unknown direction as `next`, which would start a build hidden (the inversion, 2026-11-10).
	return null;
}
