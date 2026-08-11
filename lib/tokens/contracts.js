/**
 * contracts — what CONTRAST FLOOR a token's value must meet, derived from its NAME.
 *
 * #1595, the second half of #1545. `SANCTIONED_FALLBACK_READS` records what a
 * `var()` fallback lands on and asserts the target mechanically; what it cannot
 * check is whether that target carries the SAME CONTRACT. The defect the whole
 * line of work exists to prevent — `--cat-N-ink` degrading onto `--cat-N-mark` —
 * is exactly that: a value repaired to the 3:1 GRAPHICAL floor, then painted as
 * label text needing 4.5:1. 176 of 200 sampled `brand-mono` themes carried a
 * sub-AA label that way (`../../engineering/decisions/2026-08-10-no-safe-default-token-contract.md`).
 *
 * WHERE THE CONTRACT LIVES — the token's own name, and nothing else.
 *
 * The issue's open question was where to put it: `lib/theme/derive.js`, the
 * manifest schema, or a new table, with the constraint that it be ONE source and
 * not a second hand-kept list. The answer is that Lattice already has one.
 * HARD RULE #11 makes universal ROLE-BASED token names canonical and gates them
 * (`checkRetiredTokenNames`) — `-ink` is text, `-mark` is a shape, `-fill` is a
 * surface. The name is already the declaration of role, so reading the floor off
 * it adds no second copy to keep in sync and no per-token list to rot: a token
 * introduced tomorrow classifies the moment it is named.
 *
 * What this file adds is a list of RULES over that vocabulary — about a dozen
 * patterns, not 383 token entries. The difference matters and is the whole reason
 * this shape was chosen: a per-token list goes stale the instant someone adds a
 * token and forgets the list, which is the failure #1560's first cut shipped and
 * had to undo. A pattern list cannot go stale that way. What it CAN do is fail to
 * match, and that is deliberately not a silent pass — `contractOf` returns null,
 * and the gate counts it.
 *
 * THE FLOORS ARE DEFINED HERE, ONCE. `tools/check-ownership.js` imports them
 * rather than declaring its own 4.5 / 3.0, so "AA normal text is 4.5:1" has a
 * single home.
 *
 * WHAT THIS DELIBERATELY DOES NOT MODEL. A contract belongs to a TOKEN, not to a
 * use site. `base.finish.css` reads `var(--ink, var(--accent))` inside a 7%-alpha
 * `color-mix` for a vignette rim — an ink token used decoratively, where no text
 * floor applies. The classifier still calls that a floor drop, correctly: the
 * READ is of a 4.5 token, and any other consumer of the same pattern would be
 * painting text. Sites like that belong in the gate's recorded backlog with the
 * reason written down, not in a smarter classifier.
 *
 * Pure: no fs, no deps — usable from the gate, the browser bundle, or a test.
 */

/** AA normal text — the floor an `-ink` / `-fg` / `text-*` value must clear. */
const TEXT_FLOOR = 4.5;
/** WCAG 1.4.11 graphical objects — the floor a `-mark` / `-border` / `-stroke` clears. */
const GRAPHICAL_FLOOR = 3.0;
/**
 * An AREA — a surface, a hue, or a decorative paint. Nothing is measured against
 * it; it is the thing other values are measured against.
 *
 * Surface, hue and paint are ONE role on purpose. A finer split (fill vs texture
 * vs accent) reads tidier but makes role equality useless: the ledger's own
 * `--cat-N-texture → --cat-N-fill` row justifies itself as "the same role", and it
 * is right — both are what paints the categorical chip's area — while a taxonomy
 * that separated them would call that row a role change. Three tiers is also
 * exactly the model #1595 describes: label text at 4.5:1, graphical at 3:1, a fill
 * as a surface.
 */
const NO_FLOOR = 0;
/** Not a color at all (a length, a font stack, a duration). Floors do not apply. */
const NOT_A_COLOR = null;

/**
 * Ordered — FIRST MATCH WINS, so the non-color and explicit-family rules come
 * before the generic suffixes. Each entry is `[pattern, floor, role]` where the
 * pattern is tested against the token name WITHOUT its leading `--`.
 */
const RULES = Object.freeze([
  // ── not colors ───────────────────────────────────────────────────────────
  [/^(font|fs|lh|ls|sp|radius|dur|ease|z)(-|$)/,      NOT_A_COLOR,     'metric'],
  [/(^|-)(x|y|w|h|v|size|position|opacity|weight)$/,  NOT_A_COLOR,     'metric'],
  [/(^|-)(inset|anchor)(-|$)/,                        NOT_A_COLOR,     'metric'],

  // ── text: measured at 4.5:1 against whatever it sits on ──────────────────
  // `on-` first: `--cat-on-fill` / `--on-dark-primary` / `--on-accent` are ink
  // named for the surface they sit on, and would otherwise hit the surface rule.
  [/(^|-)on-[a-z]/,                                   TEXT_FLOOR,      'ink'],
  [/(^|-)(ink|fg)$/,                                  TEXT_FLOOR,      'ink'],
  [/^text(-|$)/,                                      TEXT_FLOOR,      'ink'],
  [/(^|-)(heading|body|label|secondary|muted|display)$/, TEXT_FLOOR,   'ink'],

  // ── graphical: 3:1, a shape rather than a glyph ──────────────────────────
  [/(^|-)(mark|border|stroke|line|rule|edge|outline)$/, GRAPHICAL_FLOOR, 'graphical'],

  // ── areas: surfaces, hues and paints — nothing is measured against them ──
  [/(^|-)(bg|fill|surface|container|subcontainer|soft|alt)$/, NO_FLOOR, 'area'],
  [/^(bg|surface)(-|$)/,                              NO_FLOOR,        'area'],
  [/(^|-)(hue|tint|texture|scrim|shadow|glow|gradient)$/, NO_FLOOR,     'area'],
  // `accent` ANYWHERE in the name, not only at the end — `--decision-accent-deep`
  // is the theme's accent hue with a depth qualifier, same contract as `--accent`.
  // `--on-accent` is ink and is already claimed by the `on-` rule above.
  [/(^|-)accent(-|$)/,                                NO_FLOOR,        'area'],
  [/^(spectrum|seq|fin)(-|$)/,                        NO_FLOOR,        'area'],
]);

/**
 * Tokens whose NAME cannot carry the role, so the contract is declared here
 * instead. Kept deliberately short: every entry is a HARD RULE #11 exception, and
 * the honest fix for most of them is a rename, not a row.
 *
 * Fails both ways in the gate — an entry naming a token that no longer appears in
 * a fallback chain is a stale sanction and errors, so this cannot rot.
 */
const SANCTIONED_TOKEN_CONTRACTS = Object.freeze([
  // Marp's own chrome vocabulary. Named `-color` by Marp, not by us, and the
  // engine cannot rename them without breaking the export boundary.
  { token: 'marp-slide-header-color', floor: TEXT_FLOOR, role: 'ink',
    why: 'Marp chrome: the header text. Named `-color` by Marp Core, not renameable from here.' },
  { token: 'marp-slide-footer-color', floor: TEXT_FLOOR, role: 'ink',
    why: 'Marp chrome: the footer text. Same boundary as the header.' },
  { token: 'marp-slide-pagination-color', floor: TEXT_FLOOR, role: 'ink',
    why: 'Marp chrome: the page number. Same boundary as the header.' },
  // Local per-row/per-item variables that hold a hue. `-color` says the medium,
  // not the role, so the name cannot classify — a HARD RULE #11 rename is the real
  // fix and is off this change's path.
  { token: 'state-color', floor: GRAPHICAL_FLOOR, role: 'graphical',
    why: 'roadmap legend: a per-item status hue (--pass / --warn / --text-label), painted as the '
       + 'swatch background and the row rail — a shape, not a glyph. Its two fallbacks '
       + '(--text-muted, --border) both clear this floor.' },
  { token: 'lane-color', floor: GRAPHICAL_FLOOR, role: 'graphical',
    why: 'a per-lane rail hue, painted as a border. Same role as --lane-jur below.' },
  { token: 'lane-jur', floor: GRAPHICAL_FLOOR, role: 'graphical',
    why: 'statute-stack: the per-jurisdiction lane hue, assigned from --cat-N-mark and painted as a '
       + '3px left border. A mark by role; the name says the domain instead.' },
]);

const SANCTIONED_BY_TOKEN = new Map(SANCTIONED_TOKEN_CONTRACTS.map((s) => [s.token, s]));

/**
 * The contract for a token name (with or without its leading `--`), or `null`
 * when the name does not declare a role. Null is a REPORTABLE state, never a
 * silent pass — a classifier that quietly defaults to "no floor" would let the
 * next `--cat-N-ink` through.
 */
function contractOf(name) {
  const n = String(name).replace(/^--/, '');
  const sanctioned = SANCTIONED_BY_TOKEN.get(n);
  if (sanctioned) return { floor: sanctioned.floor, role: sanctioned.role, sanctioned: true };
  for (const [re, floor, role] of RULES) if (re.test(n)) return { floor, role, sanctioned: false };
  return null;
}

/**
 * Does a `var(--token, var(--target))` hop DROP the floor — land on a value held
 * to a weaker contract than the read needs? That is the `--cat-N-ink` shape.
 *
 * Returns `{ from, to, token, target }` when it drops, `null` when it does not,
 * and `{ unclassified: [...] }` when either side has no declared role.
 *
 * Landing on a HIGHER floor is fine and reported as no drop: a value that clears
 * 4.5:1 also clears 3:1. A non-color on either side is not comparable, and a hop
 * between two non-colors (`--font-mono` → `--font-body`) is fine.
 */
function contractDrop(token, target) {
  const a = contractOf(token);
  const b = contractOf(target);
  const unclassified = [];
  if (!a) unclassified.push(String(token).replace(/^--/, ''));
  if (!b) unclassified.push(String(target).replace(/^--/, ''));
  if (unclassified.length) return { unclassified };
  if (a.floor === NOT_A_COLOR || b.floor === NOT_A_COLOR) return null;
  if (b.floor >= a.floor) return null;
  return {
    token: String(token).replace(/^--/, ''),
    target: String(target).replace(/^--/, ''),
    from: a.floor,
    to: b.floor,
    fromRole: a.role,
    toRole: b.role,
  };
}

module.exports = {
  TEXT_FLOOR,
  GRAPHICAL_FLOOR,
  NO_FLOOR,
  NOT_A_COLOR,
  RULES,
  SANCTIONED_TOKEN_CONTRACTS,
  contractOf,
  contractDrop,
};
