/**
 * lib/core/resolve-pace.mjs
 *
 * The deck front-matter `pace:` register — the deck's PRESENTATION RHYTHM: how long
 * a self-presenting deck holds on a newly-arrived slide before it starts speaking.
 *
 *   pace: brisk        a demo, a familiar audience        (~0.8s slide / 1.6s section)
 *   pace: natural      boardroom delivery — the default   (~1.4s slide / 2.6s section)
 *   pace: deliberate   a technical or non-native audience (~2.2s slide / 4.0s section)
 *
 * WHY THIS IS A DECK REGISTER AND NOT A SETTING. The beat itself shipped first as a
 * workspace preference in `localStorage`, which makes the rhythm a property of the
 * MACHINE DOING THE PLAYING rather than of the deck. For an author rehearsing their own
 * deck that is invisible; for the product claim — ship a deck for the board, or share a
 * deck and have it present itself — it is backwards, because the author's directorial
 * choice is lost the moment the deck leaves their machine. A deliberately slow, weighty
 * deck would play at whatever pace the recipient's browser happened to hold.
 *
 * RESOLUTION ORDER, stated once (and pinned by resolve-pace.test.js):
 *
 *   1. an explicit millisecond override    the presenter's live "faster/slower" during a
 *                                          delivery. Never persisted into the artifact.
 *   2. the deck's own `pace:`              the author's intent, and it travels with the deck.
 *   3. the workspace preset                a DEFAULT for decks that declare no pace — not
 *                                          an override of one that does.
 *   4. `natural`                           the shipped default.
 *
 * The millisecond values themselves live with the rest of the narration cadence in
 * `docs/src/lib/cadenza/cadence.ts` (`PACE_PRESETS`, `slideBeatMs`), which is TypeScript in
 * a workspace package and therefore unreachable from here — this file owns the NAMES and the
 * front-matter parse, the kernel owns the numbers. `pace-names.test.js` pins the two lists
 * against each other so the split cannot silently drift.
 *
 * ESM, and self-contained, mirroring `resolve-captions.mjs` — the module this is most like (a
 * narration front-matter register the docs site imports directly). That is not a style choice:
 * the docs production build is Rollup, which will not resolve named exports off a CommonJS file
 * outside its root, so a CJS module here fails `astro build` while passing vitest AND `tsc`.
 * The front-matter regex is inlined for the same reason `resolve-captions.mjs` inlines its own,
 * rather than reaching for the CJS `front-matter-key.js`.
 *
 * The consequence is that `lib/authoring/lint.js` (CommonJS) cannot require this, so the linter
 * keeps its own copy of the names in `lint-core.js` — where the rule lives anyway, per HARD RULE
 * #7. `pace-names.test.js` pins every copy against every other.
 */

/** The registered pace names, slowest-to-fastest order deliberately NOT implied. */
export const PACE_NAMES = ['brisk', 'natural', 'deliberate'];

/** The name a deck gets when it declares none. */
export const DEFAULT_PACE = 'natural';

/** True when `value` names a registered pace. */
export function isKnownPace(value) {
  return typeof value === 'string' && PACE_NAMES.includes(value.trim().toLowerCase());
}

/**
 * The deck's declared pace name, or null when it declares none.
 *
 * Takes a deck SOURCE or a leading front-matter block — the same shape `frontMatterLang` and
 * the rest of the narration front-matter readers take, and the shape every caller already
 * holds. The `---` fence is required: without it there is no way to tell a deck-level `pace:`
 * from the word appearing in a slide's prose.
 *
 * An unknown value returns null rather than being coerced to the default, so a typo is
 * indistinguishable from an absent key at RENDER time (both fall through to the workspace /
 * default path) and distinguishable at AUTHORING time — `lint-core`'s `unknown-pace` rule is
 * what tells the author, which is the same division finish/mode/split already use.
 *
 * @param {string} md deck source, or the leading `---`-fenced block
 * @returns {string|null}
 */
export function frontMatterPace(md) {
  const value = paceLine(md)?.value ?? null;
  return value !== null && PACE_NAMES.includes(value) ? value : null;
}

/**
 * The raw `pace:` line and its parsed value, or null when the deck declares none.
 *
 * Split out from `frontMatterPace` so the LINTER can ask the same question and get the same
 * answer. It could not before: the rule carried its own value pattern, which matched only a
 * clean bare word and returned NO FINDING for anything with a trailing character. So
 * `pace: brisk.` and `pace: delibrate # weighty deck` were rejected by this resolver and passed
 * in silence by the rule written to catch exactly that \u2014 a deck that plays at the VIEWER's pace
 * with nobody told. One parse, two callers.
 *
 * A trailing YAML comment is STRIPPED rather than folded into the value. Front matter is YAML \u2014
 * the engine parses `theme:` and `paginate:` with a real YAML parser, where `# \u2026` after
 * whitespace is a comment \u2014 so an author who annotates their pace should keep their pace, not
 * silently lose it. (The sibling registers do not do this yet; aligning them is its own sweep.)
 *
 * @param {string} md deck source, or the leading `---`-fenced block
 * @returns {{ line: string, value: string }|null}
 */
export function paceLine(md) {
  const block = String(md ?? '').match(/^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/);
  if (!block) return null;
  const line = block[1].match(/^[ \t]*pace:[ \t]*(.*)$/m);
  if (!line) return null;
  // MUST stay identical to `frontMatterScalar` (lib/core/front-matter-key.js), which is
  // now the repo-wide rule this key anticipated ("the sibling registers do not do this
  // yet; aligning them is its own sweep" — that sweep landed). It cannot IMPORT it: this
  // module is ESM the docs site imports directly, and Rollup will not resolve named
  // exports off a CJS file outside its root, so a require here fails `astro build` while
  // passing vitest and tsc. So it is a sync-gated mirror, pinned by
  // `front-matter-scalar-parity` in test/unit/core/pace-names.test.js.
  //
  // The `^` the old pattern carried is deliberately GONE: a `#` that OPENS a value is
  // data, not a comment (`backgroundColor: #ffffff`), and the shared rule keeps it. No
  // pace value can begin with `#`, so this changes no pace — it removes a divergence.
  const cut = line[1].search(/[ \t]#/);
  const value = (cut === -1 ? line[1] : line[1].slice(0, cut))
    .trim()
    .replace(/^['"]/, '')
    .replace(/['"]$/, '')
    .toLowerCase();
  return { line: line[0].trim(), value };
}

/**
 * Resolve the pace NAME for a delivery, per the order documented above. Millisecond
 * overrides are not handled here — they are applied by `slideBeatMs`, which already treats a
 * finite override (including `0`, "no beat") as winning over any name.
 *
 * @param {string|null|undefined} deck      the deck's own `pace:` (from frontMatterPace)
 * @param {string|null|undefined} workspace the viewer's stored preset
 * @returns {string} a registered pace name
 */
export function resolvePaceName(deck, workspace) {
  if (isKnownPace(deck)) return String(deck).trim().toLowerCase();
  if (isKnownPace(workspace)) return String(workspace).trim().toLowerCase();
  return DEFAULT_PACE;
}
