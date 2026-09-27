/**
 * lib/core/resolve-bookends.mjs
 *
 * The deck front-matter `greeting:` and `closing:` registers. They set what a narrated deck says
 * BEFORE its first slide and AFTER its last:
 *
 *   greeting: true                                         says "Good morning." (or afternoon / evening)
 *   greeting: "{greeting}, and welcome to the Q3 review."  custom text; {greeting} is the salutation
 *   closing: true                                          says "Thank you."
 *   closing: "Thank you. Questions are welcome."           custom text, spoken as written
 *
 * Both are off when absent, `false`, `off`, `no` or empty. The design, and why the exported
 * player carries all four greeting variants, is
 * engineering/decisions/2026-09-27-narration-bookends.md.
 *
 * WHOSE CLOCK. The VIEWER's. The salutation is chosen where the deck plays, from the local hour
 * (`greetingPeriod`), never where it was authored or exported. A video has no viewer, so video
 * export uses the `neutral` variant, "Hello".
 *
 * ESM and self-contained, like `resolve-pace.mjs` and for the same reason: the docs production
 * build is Rollup, which will not resolve named exports off a CommonJS file outside its root. So
 * the scalar rule is MIRRORED from `frontMatterScalar` (lib/core/front-matter-key.js) rather than
 * imported, and `front-matter-scalar-parity` in test/unit/core/resolve-bookends.test.js pins the
 * two together.
 *
 * `greetingPeriod` is also INLINED into the exported HTML player by `.toString()` (the player's
 * script is CSP-hashed and cannot import), so it references nothing outside itself.
 * test/unit/export/inlinable-kernels.test.js pins that.
 */

/** The greeting variants an export bakes, one per period plus the clock-free `neutral`.
 *  @type {Array<'morning'|'afternoon'|'evening'|'neutral'>} */
export const GREETING_VARIANTS = ['morning', 'afternoon', 'evening', 'neutral'];

/** What `{greeting}` expands to, per variant. */
export const SALUTATIONS = {
	morning: 'Good morning',
	afternoon: 'Good afternoon',
	evening: 'Good evening',
	neutral: 'Hello',
};

/** The line `greeting: true` speaks, before expansion. */
export const DEFAULT_GREETING = '{greeting}.';

/** The line `closing: true` speaks. */
export const DEFAULT_CLOSING = 'Thank you.';

/** The breath between the greeting and slide 1, and between the last slide and the closing, ms. */
export const BOOKEND_GAP_MS = 600;

/**
 * The period of day for a local hour: 04:00–11:59 morning, 12:00–16:59 afternoon, and every other
 * hour evening. There is deliberately no "night": "good night" is a farewell in English, so a deck
 * played at 2 a.m. still says "Good evening".
 *
 * SELF-CONTAINED — inlined into the exported player (see the header). A non-finite hour answers
 * `neutral`, so a clock that cannot be read never guesses a time of day.
 *
 * @param {number} hour 0–23, the viewer's local hour (`new Date().getHours()`)
 * @returns {'morning'|'afternoon'|'evening'|'neutral'}
 */
export function greetingPeriod(hour) {
	if (typeof hour !== 'number' || !Number.isFinite(hour)) return 'neutral';
	var h = ((Math.floor(hour) % 24) + 24) % 24;
	return h >= 4 && h < 12 ? 'morning' : h >= 12 && h < 17 ? 'afternoon' : 'evening';
}

/** The words that switch a bookend OFF. Anything else non-empty is custom text. */
const OFF = ['false', 'off', 'no', 'none'];
/** The words that switch a bookend ON with its default line. */
const ON = ['true', 'on', 'yes'];

/**
 * The raw line and its scalar value for a TOP-LEVEL bookend key, or null when the deck does not
 * set it. Top-level only (column 0): `greeting:` nested under some other map is not this register.
 *
 * Split out so the linter asks the same question and gets the same answer.
 *
 * @param {string} md deck source, or its leading `---`-fenced block
 * @param {'greeting'|'closing'} key
 * @returns {{ line: string, value: string, quoted: boolean }|null}
 */
export function bookendLine(md, key) {
	const block = String(md ?? '').match(/^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
	if (!block) return null;
	const line = block[1].match(new RegExp(`^${key}:(.*)$`, 'm'));
	if (!line) return null;
	const raw = line[1].trim();
	return { line: line[0].trim(), value: scalar(raw), quoted: raw[0] === '"' || raw[0] === "'" };
}

/**
 * MUST stay identical to `frontMatterScalar` (lib/core/front-matter-key.js); pinned by
 * `front-matter-scalar-parity`. See this file's header for why it cannot be imported.
 */
function scalar(raw) {
	const t = String(raw ?? '').trim();
	if (!t) return '';
	const quote = t[0];
	if (quote === '"' || quote === "'") {
		let end = -1;
		for (let i = 1; i < t.length; i++) {
			if (quote === '"' && t[i] === '\\') {
				i++;
				continue;
			}
			if (t[i] === quote) {
				end = i;
				break;
			}
		}
		if (end !== -1) return t.slice(1, end);
		return t.slice(1);
	}
	const cut = t.search(/[ \t]#/);
	const body = (cut === -1 ? t : t.slice(0, cut)).trim();
	return body.replace(/^['"]/, '').replace(/['"]$/, '');
}

/** A double-quoted scalar's text as an author means it: `\"` is a quote and `\\` a backslash. The
 *  shared scalar rule returns the span raw. (A single-quoted value ends at its first `'`, as it
 *  does for every front-matter key, so an apostrophe belongs in double quotes.) */
function unquote(value, quoted, raw) {
	if (!quoted || raw.trim()[0] !== '"') return value;
	return value.replace(/\\(["\\])/g, '$1');
}

/**
 * The deck's two bookends, or null for each one it does not set.
 *
 * `greeting.template` still carries `{greeting}`: WHICH salutation it becomes is decided where
 * the deck plays (`greetingText`), not here. `closing.text` is final.
 *
 * @param {string} md deck source, or its leading `---`-fenced block
 * @returns {{ greeting: { template: string } | null, closing: { text: string } | null }}
 */
export function resolveBookends(md) {
	return { greeting: read(md, 'greeting', DEFAULT_GREETING, 'template'), closing: read(md, 'closing', DEFAULT_CLOSING, 'text') };
}

function read(md, key, fallback, field) {
	const hit = bookendLine(md, key);
	if (!hit) return null;
	const raw = hit.line.slice(key.length + 1);
	const text = unquote(hit.value, hit.quoted, raw).trim();
	// `greeting: # todo` is YAML for an empty value: the scalar rule strips only a comment that
	// FOLLOWS a value, so a comment-only value is treated as empty here (as frontMatterValue does).
	if (!text || (!hit.quoted && text.startsWith('#'))) return null;
	// A quoted "true" is text the author typed on purpose, not the switch.
	if (!hit.quoted) {
		const word = text.toLowerCase();
		if (OFF.includes(word)) return null;
		if (ON.includes(word)) return { [field]: fallback };
	}
	return { [field]: text };
}

/**
 * The spoken greeting for one variant: `{greeting}` becomes the salutation. Every occurrence is
 * replaced; any other `{…}` is left as written (the linter flags it).
 *
 * @param {string} template
 * @param {'morning'|'afternoon'|'evening'|'neutral'} variant
 * @returns {string}
 */
export function greetingText(template, variant) {
	const salutation = SALUTATIONS[variant] || SALUTATIONS.neutral;
	return String(template ?? '').replace(/\{greeting\}/g, salutation);
}

/**
 * All four variants' text for a greeting template — what an export bakes.
 *
 * @param {string} template
 * @returns {Record<'morning'|'afternoon'|'evening'|'neutral', string>}
 */
export function greetingVariants(template) {
	const out = {};
	for (const v of GREETING_VARIANTS) out[v] = greetingText(template, v);
	return out;
}

/**
 * Does a slide's narration already GREET? True when its first words are a greeting: "Good
 * morning" (or afternoon, evening, day), "Hello", "Hi", "Hey", "Greetings" or "Welcome".
 *
 * WHY. A deck that opens "Welcome to the Q3 review" and also sets `greeting:` would say
 * "Good afternoon, and welcome to the Q3 review. Welcome to the Q3 review." The slide's own words
 * are what the audience reads on screen, so they win and the greeting is skipped (owner ruling,
 * 2026-09-27; engineering/decisions/2026-09-27-narration-bookends.md §12).
 *
 * @param {string} text slide 1's resolved narration
 * @returns {boolean}
 */
export function alreadyGreets(text) {
	return /^[^\p{L}\p{N}]*(?:good\s+(?:morning|afternoon|evening|day)|hello|hi|hey|greetings|welcome)\b/iu.test(String(text ?? ''));
}

/**
 * Does a slide's narration already THANK the audience? True when it says "thank you" or "thanks"
 * anywhere — the common "Thank you" closing slide. The closing is then skipped, for the reason
 * `alreadyGreets` gives.
 *
 * @param {string} text the last slide's resolved narration
 * @returns {boolean}
 */
export function alreadyThanks(text) {
	return /\b(?:thank\s+you|thanks)\b/i.test(String(text ?? ''));
}

/**
 * The deck's bookends with any the slides already say removed: the greeting when slide 1 already
 * greets, the closing when the last slide already thanks. The ONE place that rule is applied, so
 * the Studio, the export bake and the caption files skip the same lines.
 *
 * @param {{ greeting: { template: string } | null, closing: { text: string } | null }} ends
 *   what `resolveBookends` returned
 * @param {readonly string[]} slideTexts every slide's resolved narration, in order ('' for silent)
 * @returns {{ greeting: { template: string } | null, closing: { text: string } | null }}
 */
export function withoutRedundantBookends(ends, slideTexts) {
	const texts = Array.from(slideTexts || [], (t) => String(t ?? ''));
	return {
		greeting: ends?.greeting && !alreadyGreets(texts[0] ?? '') ? ends.greeting : null,
		closing: ends?.closing && !alreadyThanks(texts[texts.length - 1] ?? '') ? ends.closing : null,
	};
}
