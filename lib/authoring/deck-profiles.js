/**
 * Deck PROFILES — the genre a deck's STYLE half is judged against. Pure,
 * browser-safe, fs-free (sibling to lint-core / review-core / scorecard).
 *
 * ## What this is, and what it deliberately is not
 *
 * Three profiles, DECLARED ONLY. `general` is the default and is byte-for-byte
 * the bar every deck was already held to before profiles existed. A profile can
 * therefore only ever LOOSEN a number for a deck whose author asked for it by
 * name — never for a deck that said nothing.
 *
 * That constraint is the whole design, and it is a correction. An earlier cut of
 * this module shipped five profiles, INFERRED a genre from component vocabulary
 * when none was declared, and set `general` looser than the old universal bar
 * (80 words, a 16-word heading, and neither `no-ask` nor `agenda-missing`
 * graded). Three independent review passes each broke it the same way:
 *
 *   · A 2,332-word padded deck — 26 slides, no ask, no agenda — scored
 *     Style 100 "no issues found", beating a tight 395-word argued deck at 87.
 *     The OLD single grade ordered that pair correctly. The relaxation of
 *     `general`, which 76% of decks landed on, inverted it.
 *   · Inference fired on 46 decks, made 40 of them WORSE than abstaining and 0
 *     better — every inferable profile was tighter than `general`, so committing
 *     was a pure penalty — and 22 of its 46 firings were on `examples/` feature
 *     demos, which are not a genre at all.
 *   · `no-ask` became unreachable: inference only reached `boardroom` when a
 *     `decision` slide was present, which is exactly what suppresses the finding.
 *     Measured: it fired on 152 decks and deducted on none of them.
 *
 * So inference is gone. It is not a tuning problem: nothing in the component
 * vocabulary positively marks a genre, and a wrong guess is never neutral — it
 * always deducts. `boardroom` and `academic` are gone too, both measured to fit
 * `general` already (academic slide p90 = 66 against a 70 budget, heading
 * p90 = 14 against 14).
 *
 * ## The numbers
 *
 * Re-measured with `review-core`'s OWN `proseWordCount` — the counter the rule
 * actually applies, which strips the `_class` directive but NOT speaker-note
 * comments. An earlier calibration stripped all comments, which is a different
 * population (53.2% of 1,890 content slides carry one, mean +9.1 words) and left every
 * budget about three words tight against its own stated basis.
 *
 *   family        slide p50/p90/p95   >70    heading p90/p95   >14
 *   corporate         35 / 62 / 65     0%        14 / 14        2%
 *   government        43 / 64 / 68     4%        13 / 15        5%
 *   academic          52 / 66 / 69     3%        14 / 16        7%
 *   nonprofit         41 / 70 / 74     7%        16 / 17       17%   ← headings
 *   teaching          78 / 94 /110    67%        11 / 11        0%   ← density
 *
 * Three families sit comfortably inside the old 70/14 pair; it was never a
 * boardroom-only number. Two genres miss it, on OPPOSITE axes, and each gets
 * relief on THAT AXIS ONLY:
 *
 *   · `teaching` — two thirds of its slides clear 70 words and its median (78)
 *     sits above every other family's 90th percentile, because a mentee re-reads
 *     the slide with no narrator and it has to stand alone. Its headings are the
 *     TERSEST measured (p90 = 11), so it gets no heading relief.
 *   · `mission` — normally dense (p90 = 70, inside the budget) but 17% of its
 *     headings clear 14 words against corporate's 2%, because a program name
 *     plus its outcome does not compress. It gets the heading budget and
 *     nothing else — same prose budget, both structural rules still graded.
 *
 * The teaching row is n = 2 decks (30 slides) by one author. That is the weakest
 * evidence in the table and the number most likely to want revisiting; it is
 * pinned by a test so it cannot drift silently in the meantime.
 *
 * ## What a profile can never do
 *
 * It never touches CRAFT. Stub slides, duplicate headings, placeholder titles,
 * missing alt text, label headings and a broken authoring contract are defects in
 * every genre; the scorecard's Craft half is profile-blind by construction and a
 * test pins it. `teaching` is the only profile that switches a rule off, and both
 * rules it switches off are genre claims rather than quality ones — a lesson asks
 * the learner to practice, not the room to approve, and its progression is its
 * agenda. It is declared-only, so no deck receives that by accident.
 *
 * See engineering/decisions/2026-08-25-deck-profiles-craft-style-split.md.
 */

const { topLevelFrontMatterValue } = require('../core/front-matter-key');

/**
 * Front-matter block at the head of a deck. A leading BOM is tolerated: an
 * imported or pasted deck keeps its declaration instead of silently falling back
 * to `general` (`tools/lint-deck.js` strips the BOM at read, the Studio does not).
 */
const FRONT_MATTER = /^﻿?---\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/;

/** A profile name is a bare name, like every other deck register (`finish:`, `mode:`). */
const BARE_NAME = /^[A-Za-z0-9_-]+$/;

/** An invalid declared name is echoed into the Coach; bound it so a pathological
 *  front-matter value cannot blow out the panel. */
const MAX_INVALID_ECHO = 32;

/**
 * The profile table.
 *
 * - `slideWords` / `slideBullets` — the wall-of-text ceiling for a whole slide.
 * - `titleHard` — the heading budget (`long-heading` fires past it).
 * - `framingScale` — how hard `no-ask` and `agenda-missing` DEDUCT, as a multiplier on
 *   the Framing penalties. 1 is the full bar; a genre that legitimately does not ask the
 *   room to approve gets a fraction, never zero.
 *
 *   This was two booleans, `scoresAsk` / `scoresAgenda`, and `teaching` set both false.
 *   An inversion pass measured what that actually did: `scoreFraming`'s ONLY two deduction
 *   paths are those rules, so switching both off pinned the whole category to a constant
 *   100 across all 198 decks. Style then collapsed to a rescaled `brevity`
 *   (r = 0.965), and NO deck in the corpus could score below 77 under `teaching` — mean
 *   96.1. That is not "a different bar", which is the contract this module claims; it is
 *   an exemption, self-certified by two words of front matter that nothing can verify and
 *   that changes no render, no export and no gate. A scale keeps the genre concession and
 *   keeps the category discriminating: at 0.4 Framing takes four distinct values again.
 */
const PROFILES = Object.freeze({
  /**
   * The default, and the pre-profiles universal bar exactly: `SLIDE_PROSE_BUDGET`
   * (70 words / 6 bullets), `UNIVERSAL_PROSE_BUDGETS.title.hard` (14), both
   * structural rules graded. A test pins it against those constants, so `general`
   * cannot drift away from the bar it is supposed to reproduce.
   */
  general: Object.freeze({
    key: 'general',
    label: 'General',
    blurb: 'The default bar — every deck is held to this unless it declares otherwise.',
    slideWords: 70,
    slideBullets: 6,
    titleHard: 14,
    framingScale: 1,
  }),
  teaching: Object.freeze({
    key: 'teaching',
    label: 'Teaching',
    blurb: 'A lesson, workshop, or mentoring deck — read and re-read without a narrator.',
    slideWords: 95, // p90 = 94
    slideBullets: 8,
    titleHard: 14, // teaching headings are the TERSEST measured (p90 = 11) — no relief earned
    // NOT zero. A lesson asks the learner to practice rather than the room to approve, and
    // its progression is its agenda — so the two rules should cost less, not nothing.
    // Zeroing them pinned the category and guaranteed every declaring deck >= Style 77.
    framingScale: 0.4,
  }),
  mission: Object.freeze({
    key: 'mission',
    label: 'Mission',
    blurb: 'Nonprofit, advocacy, or public-good work — where a program name carries its outcome.',
    // Heading relief ONLY. Prose density and both structural rules stay at the
    // general bar, because nonprofit prose measured INSIDE it (p90 = 70).
    slideWords: 70,
    slideBullets: 6,
    titleHard: 18, // p95 = 17
    framingScale: 1,
  }),
});

const PROFILE_NAMES = Object.freeze(Object.keys(PROFILES));
const DEFAULT_PROFILE = 'general';

/**
 * The profile record for a name, or null when the name is not one of ours.
 *
 * `Object.hasOwn`, NOT a bare lookup. `PROFILES` is an object literal, so
 * `Object.prototype` is on its chain and a bare `PROFILES[name]` answers truthily for
 * `__proto__` (→ `Object.prototype`) and `constructor` (→ `Object`). Both are already
 * lowercase and both pass `BARE_NAME`, so `profile: __proto__` resolved to a "profile"
 * whose every budget is `undefined` — and since every budget comparison is
 * `count > profile.slideWords`, `undefined` made all of them false. `wall-of-text` and
 * `long-heading` stopped firing ENTIRELY: a deck of twelve 220-word slides scored
 * Brevity 100 and Style 78 where `general` gives 49 and 50.
 *
 * Worse than the leniency, it was SILENT. `declaredInvalid` stayed null because
 * `getProfile` reported success, so the guard in `resolveProfile` — written precisely so
 * a misspelled profile cannot be swallowed — reported nothing, and the Coach rendered
 * "Style — vs undefined". A fourth and fifth profile, looser than all three real ones,
 * undeclared and undocumented, reachable from any deck's front matter.
 *
 * (`toString` and friends escaped only by accident: `declaredProfile` lowercases, so
 * `tostring` misses the prototype member. That is luck, not a guard.)
 */
function getProfile(name) {
  if (!name) return null;
  const key = String(name).trim().toLowerCase();
  return Object.hasOwn(PROFILES, key) ? PROFILES[key] : null;
}

/** The RAW `profile:` value a deck declares, name-shaped or not — so a malformed one
 *  can still be reported rather than vanishing. */
function rawProfileValue(source) {
  const m = FRONT_MATTER.exec(String(source || ''));
  if (!m) return null;
  const raw = topLevelFrontMatterValue(m[1], 'profile');
  return raw === null || raw === '' ? null : raw;
}

/** The `profile:` front-matter name a deck declares, or null. */
function declaredProfile(source) {
  const m = FRONT_MATTER.exec(String(source || ''));
  if (!m) return null;
  const raw = topLevelFrontMatterValue(m[1], 'profile');
  if (raw === null || !BARE_NAME.test(raw)) return null;
  return raw.toLowerCase();
}

/**
 * Resolve which profile a deck's STYLE half is judged against, and say where that
 * came from so the Coach can show it.
 *
 * Order: OVERRIDE → declared → `general`.
 *
 * The override wins over a declaration deliberately, and that is a fix: it used to
 * lose, which made the Coach's profile control a silent no-op on every deck that
 * declared a profile — including both shipped teaching decks, i.e. exactly the
 * decks a mentor would want to view through another genre's bar. The control is a
 * "what would this look like as…" lens; a lens that cannot override the thing it
 * is looking through is not a lens. It is session-only and never rewrites front
 * matter, so the declaration remains the deck's own answer.
 *
 * @param {object} o
 * @param {string} o.source        deck markdown
 * @param {string} [o.override]    an explicit choice (the Coach control)
 * @returns {{ key:string, profile:object, origin:'override'|'declared'|'default', declaredInvalid:string|null }}
 */
function resolveProfile(o = {}) {
  const source = String(o.source || '');
  // A malformed profile is reported, never silently swallowed — otherwise
  // `profile: teachng` reads as "no profile" and the deck is judged on a bar the author
  // explicitly tried to opt out of.
  //
  // Read the RAW value, not the name-shaped one. `declaredProfile` returns null for
  // anything failing BARE_NAME, so `profile: teaching!` — an entirely plausible typo —
  // resolved to `general` with NO warning at all, which is exactly the failure this
  // guard exists to prevent. Bounded before it reaches the panel.
  const declared = declaredProfile(source);
  const rawDeclared = rawProfileValue(source);
  const declaredInvalid = !getProfile(declared) && rawDeclared ? rawDeclared.slice(0, MAX_INVALID_ECHO) : null;

  const over = getProfile(o.override);
  if (over) return { key: over.key, profile: over, origin: 'override', declaredInvalid };

  const p = getProfile(declared);
  if (p) return { key: p.key, profile: p, origin: 'declared', declaredInvalid };

  const fallback = PROFILES[DEFAULT_PROFILE];
  return { key: fallback.key, profile: fallback, origin: 'default', declaredInvalid };
}

/**
 * Return `source` with `profile: <name>` declared in its front matter — the write-through
 * behind the Coach's "Keep this profile" action.
 *
 * WHY THIS EXISTS. Profiles are declared-only and nothing is inferred, which is correct
 * (inference was measured making 40 of 46 decks WORSE than abstaining, §5). But it left the
 * feature with no ADOPTION path: the Coach's dropdown is session-only and explicitly never
 * rewrote front matter, so an author who discovered that Teaching fit their deck watched the
 * score improve, closed the tab, and got the old score back — and the CLI and any shared link
 * never saw the choice at all. Measured consequence: strip the declaration from the two decks
 * that reported the original bug and they score Style 55 and 54, rank 1 of 198 — the same
 * position they were in before this change. The whole fix was two lines of front matter
 * someone happened to add by hand. A register nobody can keep is a register nobody has.
 *
 * Pure and fs-free like the rest of this module; the caller owns persistence.
 *
 * - Replaces an existing top-level `profile:` line, preserving its position.
 * - Inserts before the closing `---` when front matter exists without one.
 * - Creates a front-matter block when the deck has none.
 * - Preserves the deck's existing line endings and a leading BOM, because this writes back
 *   into a file the author owns (engineering/decisions/2026-08-04-line-endings-lf-boundaries.md).
 * - Returns the source UNCHANGED for a name that is not one of ours, so a bad call can
 *   never strand a deck on an unresolvable declaration.
 *
 * @param {string} source deck markdown
 * @param {string} name   a profile name
 * @returns {string}
 */
function withProfile(source, name) {
  const src = String(source ?? '');
  if (!getProfile(name)) return src;
  const key = getProfile(name).key;

  const bom = src.startsWith('\ufeff') ? '\ufeff' : '';
  const body = bom ? src.slice(1) : src;
  const eol = /\r\n/.test(body) ? '\r\n' : '\n';
  const line = `profile: ${key}`;

  const m = FRONT_MATTER.exec(src);
  if (!m) return `${bom}---${eol}${line}${eol}---${eol}${eol}${body}`;

  const inner = m[1];
  // Top-level `profile:` only — an indented one belongs to a nested mapping and is not
  // the deck's declaration, which is the same rule `topLevelFrontMatterValue` applies.
  const rewritten = inner
    .split(/\r?\n/)
    .map((l) => (/^profile\s*:/.test(l) ? line : l));
  const had = rewritten.some((l) => l === line);
  if (!had) rewritten.push(line);

  const head = bom + '---' + eol;
  const tail = m[0].slice(m[0].indexOf(inner) + inner.length);
  return head + rewritten.join(eol) + tail.replace(/\r?\n/g, eol) + body.slice(m[0].length - bom.length ? m[0].length : m[0].length);
}

module.exports = {
  PROFILES,
  PROFILE_NAMES,
  DEFAULT_PROFILE,
  MAX_INVALID_ECHO,
  getProfile,
  declaredProfile,
  resolveProfile,
  withProfile,
};
