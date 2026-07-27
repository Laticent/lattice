/**
 * Typography scale — the SINGLE SOURCE OF TRUTH for font sizing.
 * (engineering/decisions/2026-06-20-typography-categories.md)
 *
 * THE PROBLEM THIS REPLACES
 * -------------------------
 * Sizes used to be `landscape_coefficient × cqi × --canvas-scale`, where
 * --canvas-scale was ONE uniform multiplier (≈2.19 for story) that stretched the
 * landscape scale to fake portrait. Two failures fell out of that:
 *   1. A uniform stretch is not a curated scale — the portrait hierarchy was just
 *      landscape photo-enlarged (h1 ballooned toward overflow; nothing tuned for a
 *      tall frame).
 *   2. Anything that didn't route through that exact formula silently fell out of
 *      the system — raw `cqi` font-sizes (pills, corner tags) rendered at landscape
 *      size on a tall box (~12px). Fine-print bugs by construction.
 *
 * THE MODEL
 * ---------
 * Font size stays `coefficient × cqi` (width-relative — so a category self-
 * normalises across the SIZES inside it: 4k↔hd↔standard share landscape; square
 * is its own; story↔mobile share portrait, all ≈1080 wide). What `cqi` cannot
 * bridge is ACROSS orientations (landscape width = long edge; portrait width =
 * short edge), so each orientation gets its OWN curated coefficient set — never one
 * set × a multiplier. Three categories, selected per slide off the orientation the
 * pipeline stamps (see CATEGORY_SELECTOR / §11 note below). The active Phase-1
 * path keys off the `data-orientation` stamp, whose boundaries are the engine's
 * `orientationFor` (lib/engine/css.js · lib/runtime):
 *
 *   landscape   aspect > 1.05         (hd · standard · 4k)        — the default
 *   square      0.95 ≤ aspect ≤ 1.05  (1:1 social)               — its own scale
 *   portrait    aspect < 0.95         (portrait · story · mobile) — the tall frame
 *
 * (These are the ENGINE's `orientationFor` boundaries. lib/adaptive/families.js
 * splits square|portrait at 0.9, not 0.95 — a pre-existing seam between the type
 * categories and the structural families, unrelated to #1218 and still open.)
 *
 * The coefficients below are curated to target px on each category's reference
 * width (landscape ≈ HD 1280 → 1cqi=12.8px; square/portrait ≈ 1080 → 1cqi=10.8px),
 * documented per role. Curated, not derived from one another by a constant: e.g.
 * portrait `h1` is pulled DOWN relative to a uniform stretch so a two-line title
 * fits, while body stays generous — which a single --canvas-scale can't express.
 *
 * BYTE-SAFETY: the `landscape` coefficients are IDENTICAL to the historical
 * hand-written `--fs-*` values, so every landscape/HD/4k export stays pixel-exact.
 *
 * Consumed by: the token generator (emits the `--fs-*` blocks) and any tool that
 * needs to reason about type. Components must use `var(--fs-<role>)` only — a
 * drift-guard test bans raw `cqi` font-sizes so the fine-print class of bug can't
 * recur.
 */

// Roles, coarsest → largest. Names are ROLE-based (never colour/scheme), matching
// the existing token contract (HARD RULE #4).
const ROLES = [
  'meta',          // chrome: eyebrows, citations, pills, corner tags, captions
  'body-compact',  // dense reference cells (tables, tabular lists)
  'body',          // container default — prose
  'message',       // slide-level statement / lead line
  'emphasis',      // lead callout
  'h6', 'h5', 'h4', 'h3', 'h2', 'h1',
  'hero',          // big-number / monumental
];

// coefficient × cqi. `pt@…` notes are the target at the category's reference width.
const SCALES = {
  // ── LANDSCAPE — unchanged from the historical scale (byte-identical exports).
  //    Reference: HD 1280 wide (1cqi = 12.8px). pt values are the documented HD pts.
  landscape: {
    'meta':         1.17,    // 11.25pt — chrome
    'body-compact': 1.40,    // 13.5pt
    'body':         1.67,    // 16pt — container default
    'message':      2.1875,  // 21pt — slide statement
    'emphasis':     3.125,   // 30pt — lead callout
    'h6':           1.17,    // 11.25pt
    'h5':           1.67,    // 16pt
    'h4':           2.1875,  // 21pt
    'h3':           2.3958,  // 23pt
    'h2':           2.9167,  // 28pt — standard slide title
    'h1':           5.0,     // 48pt — dominant slide title
    'hero':         8.9583,  // 86pt — big-number hero
  },

  // ── PORTRAIT — curated for the tall frame (portrait · story · mobile).
  //    Reference: 1080 wide (1cqi = 10.8px); on a phone the frame maps ×0.36, so
  //    in-frame px × 0.36 ≈ on-device px. Recurated 2026-06-21 to anchor on the
  //    DEVICE, not the room: `body` = 47px ⇒ ~17px on a phone (the iOS body floor),
  //    so an emailed-link reader can actually read it. Three rules hold the ramp
  //    together: (1) every readable tier rises with body; (2) the title ramp is
  //    COMPRESSED — display tiers rise less than body (body→h1 span 2.44×→2.08×) so
  //    a 2-line h1 still fits a 9:16 frame; (3) the role aliases are locked —
  //    h6=meta, h5=body, h4=message — matching the landscape/square scales and the
  //    base contract (the old portrait set had drifted h4 below message).
  portrait: {
    'meta':         2.78,    // ≈30px — labels/pills/eyebrows: glasses-on legible
    'body-compact': 3.70,    // ≈40px — dense reference cells
    'body':         4.35,    // ≈47px — prose; ~17px on a phone (iOS body floor)
    'message':      5.20,    // ≈56px — statement
    'emphasis':     6.30,    // ≈68px — lead callout
    'h6':           2.78,    // ≈30px (= meta)
    'h5':           4.35,    // ≈47px (= body)
    'h4':           5.20,    // ≈56px (= message)
    'h3':           5.75,    // ≈62px — subheading / column header
    'h2':           7.05,    // ≈76px — slide title
    'h1':           9.05,    // ≈98px — dominant title (pulled DOWN; fits two lines)
    'hero':        13.90,    // ≈150px — big-number hero
  },

  // ── SQUARE — 1:1 social. Reference: 1080 wide (1cqi = 10.8px). Between
  //    landscape and portrait: punchier than landscape (read at distance) but
  //    NOT as tall-frame-generous as portrait — a 1:1 box has limited height, so
  //    titles especially stay smaller than portrait to leave room for content.
  square: {
    'meta':         2.05,    // ≈22px
    'body-compact': 2.40,    // ≈26px
    'body':         2.80,    // ≈30px
    'message':      3.50,    // ≈38px
    'emphasis':     4.45,    // ≈48px
    'h6':           2.05,    // ≈22px
    'h5':           2.80,    // ≈30px
    'h4':           3.35,    // ≈36px
    'h3':           3.80,    // ≈41px
    'h2':           4.45,    // ≈48px
    'h1':           6.30,    // ≈68px — smaller than portrait (less vertical room)
    'hero':        10.20,    // ≈110px
  },
};

// HOW A CATEGORY IS SELECTED (the §11 reality)
// --------------------------------------------
// A `@container` rule CANNOT style its own container element (HARD RULE §11): a
// `section`'s nearest query container is its PARENT, never itself, so a slide can
// never restyle its OWN `--fs-*` via `@container`. The section's font-size is the
// inheritance root for all plain prose, so the WHOLE-SLIDE category MUST be keyed
// off something that can target the section itself — the `data-orientation` stamp
// the slide pipeline already writes (engine/slides.js · runtime · emulator), the
// established workaround for section-element styling. Landscape stays UNSTAMPED, so
// its DOM + render are byte-identical.
//
//   CATEGORY_SELECTOR.landscape  →  `:root, section`  (default, unstamped)
//   CATEGORY_SELECTOR.square     →  `section[data-orientation="square"]`
//   CATEGORY_SELECTOR.portrait   →  `section[data-orientation="portrait"]`
//
// Because the tokens are set ON the section, every descendant inherits ONE
// section-computed value per role → fonts are consistent across the whole slide by
// construction (no per-element cqi drift).
//
// A reserved `@container` twin of these boundaries used to sit alongside, held for
// a Phase-2 "nested box-local typography" in which a cell shadows
// `container-name:lattice`. It was deleted with #1218: the container form measures
// the CONTENT box, which drifts off the deck aspect, and nothing ever shadowed the
// container name. Nested box-local typography, if it lands, follows the structural
// families and stamps the cell — same attribute mechanism, one classifier. See
// engineering/decisions/2026-06-20-typography-categories.md.
const CATEGORY_SELECTOR = {
  landscape: ':root, section',
  square:    'section[data-orientation="square"]',
  portrait:  'section[data-orientation="portrait"]',
};

// Roles EXEMPT from the per-deck `--fs-scale` knob (HARD RULE #4 §7): the dominant
// title tier holds its designed display size while the readable tiers grow. This
// mirrors the historical split EXACTLY (only h1 + h2 were exempt) so scale-l/xl
// decks stay byte-identical — do NOT widen this set without a golden re-bless.
const NO_FS_SCALE = new Set(['h1', 'h2']);

module.exports = { ROLES, SCALES, CATEGORY_SELECTOR, NO_FS_SCALE };
