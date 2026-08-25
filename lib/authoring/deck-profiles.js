/**
 * Deck PROFILES — the genre a deck is judged against. Pure, browser-safe, fs-free
 * (sibling to lint-core / review-core / scorecard).
 *
 * ## Why this exists
 *
 * `review-core` carried ONE pair of prose numbers — 70 slide words, a 14-word
 * heading — seeded from the boardroom canon (Minto, Duarte, Knaflic, Reynolds) and
 * applied to every deck regardless of what the deck is FOR. Measured across the 197
 * committed decks, that single pair does not fit one corpus, it fits one GENRE, and
 * it penalizes each of the others on whichever axis that genre naturally runs long:
 *
 *   family        slide words p90   over 70    heading words p90   over 14
 *   corporate            59            0%             14             2%
 *   government           61            3%             13             5%
 *   academic             63            2%             14             7%
 *   nonprofit            67            5%             16            17%   ← headings
 *   teaching             92           50%             11             0%   ← density
 *
 * The two failure modes are OPPOSITE. A teaching deck is dense and tersely headed —
 * its median slide (72 words) sits above every other family's 90th percentile,
 * because a mentee re-reads it without a narrator and the slide has to stand alone.
 * A mission deck is normally dense but long-headed (17% over the ceiling), because a
 * program name plus its outcome does not compress to eleven words. Judged by the one
 * boardroom pair, each looks broken in a way it is not.
 *
 * So the numbers become a PROFILE — data, not code — and each profile's budgets sit
 * at roughly its family's own p90–p95, so a rule flags a genuine outlier WITHIN the
 * genre instead of flagging the genre itself.
 *
 * ## What a profile does NOT do
 *
 * It never relaxes CRAFT. A stub slide, a duplicate heading, a placeholder title, an
 * image with no alt text and a broken authoring contract are defects in every genre,
 * and the scorecard's Craft half is profile-blind by construction. A profile moves
 * only the contested, genre-relative numbers — prose budgets, and whether "no ask" /
 * "no agenda" are scored at all. A profile is a different bar, never a lower one.
 *
 * ## Resolution order
 *
 * declared (`profile:` front matter) → override (the Coach control) → inferred →
 * `general`. Inference ABSTAINS rather than guessing: see `inferProfile`.
 *
 * See engineering/decisions/2026-08-25-deck-profiles-craft-style-split.md.
 */

const { topLevelFrontMatterValue } = require('../core/front-matter-key');

/** Front-matter block at the head of a deck (same shape review-core matches). */
const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/;

/** A profile name is a bare name, like every other deck register (`finish:`, `mode:`). */
const BARE_NAME = /^[A-Za-z0-9_-]+$/;

/**
 * The profile table. Every number here is traceable to the distribution above; none
 * is a preference typed in from memory.
 *
 * - `slideWords` / `slideBullets` — the wall-of-text ceiling for a whole slide.
 * - `titleSoft` / `titleHard` — the heading budget (`long-heading` fires past hard).
 * - `scoresAsk` / `scoresAgenda` — whether those two structural rules DEDUCT. They
 *   are always still SURFACED as advice; this only controls the grade. `no-ask`
 *   fires on 77% of the corpus and `agenda-missing` on 37% — a rule that fires on
 *   three-quarters of everything is a constant, not a signal, everywhere except the
 *   genre it was written for.
 */
const PROFILES = Object.freeze({
  boardroom: Object.freeze({
    key: 'boardroom',
    label: 'Boardroom',
    blurb: 'A pitch, board update, or proposal — a room you are asking for something.',
    slideWords: 70,
    slideBullets: 6,
    titleSoft: 10,
    titleHard: 14,
    scoresAsk: true,
    scoresAgenda: true,
  }),
  teaching: Object.freeze({
    key: 'teaching',
    label: 'Teaching',
    blurb: 'A lesson, workshop, or mentoring deck — read and re-read without a narrator.',
    // p90 = 92 words. A teaching slide carries the explanation itself, because the
    // learner revisits it alone; splitting a six-level taxonomy across six slides
    // destroys the simultaneous comparison that makes it teachable.
    slideWords: 95,
    slideBullets: 8,
    titleSoft: 10,
    titleHard: 14, // teaching headings are the SHORTEST measured (p90 = 11) — no relief needed
    scoresAsk: false, // a lesson asks the learner to practice, not the room to approve
    scoresAgenda: false, // the progression (Bloom's levels, seven steps) IS the agenda
  }),
  mission: Object.freeze({
    key: 'mission',
    label: 'Mission',
    blurb: 'Nonprofit, advocacy, or public-good work — impact, programs, and accountability.',
    slideWords: 72, // p95 = 71
    slideBullets: 6,
    titleSoft: 12,
    titleHard: 18, // p95 = 17; a program name plus its outcome does not fit 14
    scoresAsk: false,
    scoresAgenda: true,
  }),
  academic: Object.freeze({
    key: 'academic',
    label: 'Academic',
    blurb: 'A lecture, seminar, defense, or conference talk.',
    slideWords: 70, // p90 = 63 — the boardroom budget already fits
    slideBullets: 6,
    titleSoft: 11,
    titleHard: 16, // p95 = 16
    scoresAsk: false,
    scoresAgenda: true,
  }),
  /**
   * The fallback when nothing is declared and inference abstains. Deliberately the
   * LENIENT end of every contested number: an undeclared deck must not be punished
   * for a genre we failed to detect. Silence is not evidence of a boardroom deck.
   */
  general: Object.freeze({
    key: 'general',
    label: 'General',
    blurb: 'No profile declared or detected — judged on the genre-neutral bar.',
    slideWords: 80,
    slideBullets: 7,
    titleSoft: 11,
    titleHard: 16,
    scoresAsk: false,
    scoresAgenda: false,
  }),
});

const PROFILE_NAMES = Object.freeze(Object.keys(PROFILES));
const DEFAULT_PROFILE = 'general';

/** The profile record for a name, or null when the name is not one of ours. */
function getProfile(name) {
  if (!name) return null;
  return PROFILES[String(name).trim().toLowerCase()] || null;
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
 * Guess a profile from the COMPONENT vocabulary a deck uses, or return null.
 *
 * Measured on the 34 exemplar decks whose folder gives an unambiguous label
 * (`general-team` is excluded — it genuinely mixes workshop and status decks, so it
 * has no single truth): **86.4% correct when it commits, on 64.7% coverage.**
 *
 * Read that as an UPPER BOUND, not a score. The rule below was written by reading
 * the discriminative-component table off those same 34 decks, so it is fitted on
 * what it is measured against — the same train-on-test caveat the intent-routing
 * record makes about its synonym lexicon
 * (`engineering/decisions/2026-08-09-on-device-intent-routing.md` §3).
 *
 * ABSTENTION IS THE POINT. It returns null on a third of decks, and the errors it
 * does make are between ADJACENT genres (a customer case study reads as mission; a
 * public hearing reads as mission) rather than wild. A wrong profile applied
 * silently is worse than no profile at all, so a null lands on `general` — the
 * lenient fallback — and the Coach always shows which profile is in play and lets a
 * human change it. An inferred profile is a VISIBLE guess, never a silent one.
 *
 * Two profiles are deliberately NOT inferable.
 *
 * `teaching` — no component vocabulary distinguishes a lesson from a briefing. The
 * tell is intent, not layout, and the exemplar corpus has no teaching family to fit
 * against. It must be declared. Saying so is more honest than a rule that guesses.
 *
 * `academic` — an earlier cut inferred it from the ABSENCE of metrics, decision
 * slides and pull-quotes. Evaluated on the 34 labeled exemplars that scored well;
 * run across all 197 committed decks it claimed 103 of them, because a feature-demo
 * deck uses none of those components either — and it still MISSED the real
 * `exemplars/academic/lecture.md`, which uses `stats`. An absence rule matches
 * everything unremarkable. Nothing in the measured data positively marks an academic
 * deck, so nothing here claims to detect one.
 *
 * What survives is POSITIVE evidence only: a specific component combination that
 * means something. Everything else abstains to `general`.
 *
 * @param {Iterable<string>} componentNames the `_class` tokens used across the deck
 * @returns {string|null} a profile name, or null to abstain
 */
function inferProfile(componentNames) {
  const used = new Set();
  for (const n of componentNames || []) if (n) used.add(String(n));
  if (!used.size) return null;
  const has = (n) => used.has(n);

  // A quantified deck: hero metrics or a stats block carry its argument.
  const quantified = has('big-number') || has('kpi') || has('stats');

  // Testimony beside impact numbers, without the consulting 2x2 — the mission shape.
  // Measured on the exemplars: nonprofit uses quote 100%, big-number 100%, kpi 86%,
  // matrix-2x2 0%; corporate uses quote 22% and matrix-2x2 44%.
  if (has('quote') && quantified && !has('matrix-2x2')) return 'mission';
  // An explicit decision slide beside metrics — the boardroom shape. Measured:
  // corporate uses decision 78% and kpi/big-number/stats 100%; academic uses
  // decision 0%. Asking the room to decide something is a positive, specific act.
  if (has('decision') && quantified) return 'boardroom';
  return null;
}

/**
 * Resolve which profile a deck is judged against, and say WHERE that came from so
 * the Coach can show it and a human can override it.
 *
 * @param {object} o
 * @param {string} o.source           deck markdown
 * @param {string} [o.override]       an explicit choice (the Coach control) — wins over inference, loses to a declaration
 * @param {Iterable<string>} [o.componentNames] `_class` tokens, for inference
 * @returns {{ key:string, profile:object, origin:'declared'|'override'|'inferred'|'default', declaredInvalid:string|null }}
 */
function resolveProfile(o = {}) {
  const source = String(o.source || '');
  let declaredInvalid = null;

  const declared = declaredProfile(source);
  if (declared) {
    const p = getProfile(declared);
    if (p) return { key: p.key, profile: p, origin: 'declared', declaredInvalid: null };
    // A misspelled profile is reported, never silently swallowed — otherwise
    // `profile: teachng` reads as "no profile" and the deck is judged on a bar the
    // author explicitly tried to opt out of.
    declaredInvalid = declared;
  }

  const over = getProfile(o.override);
  if (over) return { key: over.key, profile: over, origin: 'override', declaredInvalid };

  const guess = getProfile(inferProfile(o.componentNames));
  if (guess) return { key: guess.key, profile: guess, origin: 'inferred', declaredInvalid };

  const fallback = PROFILES[DEFAULT_PROFILE];
  return { key: fallback.key, profile: fallback, origin: 'default', declaredInvalid };
}

module.exports = {
  PROFILES,
  PROFILE_NAMES,
  DEFAULT_PROFILE,
  getProfile,
  declaredProfile,
  inferProfile,
  resolveProfile,
};
