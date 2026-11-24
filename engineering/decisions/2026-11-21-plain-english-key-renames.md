---
status: proposed
summary: The owner's naming rules and rename decisions for deck front-matter keys, their class tokens and Studio labels before GA. Old names are removed, not aliased; lint flags them and --fix migrates. marks: splits into chart-finish: and color-intensity:; cards: stays open. One PR per rename, lowest risk first.
---

# Plain-English key renames before GA (2026-11-21)

**Decided.** The owner answered each naming question in the command-center session
(`session_015KSkL7uv5r7CPSaDnS9F2c`), through its question dialogs between 23:30 and 23:42 UTC, and
said "go renames" at 23:49 UTC on 2026-11-21. Two later answers came the same way at 00:09 UTC on
2026-11-22 (the Q4 key name, Q7 still open), and one, §4 step 1, in both sessions. This note
records those answers so each rename PR can point here instead of at a chat transcript. Nothing in
this note is built yet; each rename ships as its own PR (§4).

## 1. The rules

1. **The thing first, then the attribute.** `card-tag`, not `tag-card`; `heading-rule`, not `rule`.
2. **A Studio label equals its key.** The panel shows `card-lift`, not "Lift cards". A terse key gets a
   tooltip, never a different label.
3. **One word means one thing everywhere.** A word that names a key does not also name an
   unrelated value or class somewhere else.
4. **A key with several axes takes one word per axis, in any order.** `cover: light column`, the way
   `image-card:` and `backdrop:` already work (`kind: 'axis'` in `lib/core/deck-settings.js`).
5. **Old names do not stay.** A rename removes the old spelling from the engine. Lint reports the old
   name as an **error**, names the new one, and `lint:deck --fix` rewrites it. The same PR migrates
   every deck in the repo. There is no alias period.

## 2. The decisions

Current names come from `lib/core/deck-settings.js` (`DECK_SETTINGS`) and the class tokens from the
key's resolver in `lib/core/resolve-*.js`. "Repo decks" counts files outside the docs folders whose
front matter sets the key today (measured 2026-11-21 on `038c49f`).

### D1. Six keys gain their subject

| Today | Becomes | Class tokens today → after | Repo decks |
|---|---|---|---|
| `tag:` | `card-tag:` | the `resolve-card-tag.js` tokens follow the key | 0 |
| `lift:` | `card-lift:` | `lifted` / `flat` → `card-lift-on` / `card-lift-off` | 1 |
| `corners:` | `slide-corners:` | the `resolve-corners.js` tokens follow the key | 1 |
| `rule:` | `heading-rule:` | `rule-*`, `with-heading-rule`, `no-heading-rule` → `heading-rule-*` | 1 |
| `headline:` | `headline-align:` | `head-auto|left|center|right` → `headline-align-*` | 1 |
| `stamp:` | `stamp-shape:` | the `resolve-stamp.js` tokens follow the key | 1 |

`flat` also appears in `lib/engine/index.js` and `lib/engine/themes.js`. The `lift:` PR checks each
use and renames only the ones that mean "card lift off".

### D2. Token cleanups (no key changes)

The owner approved "give image-card its own names, delete the old guards names, and tidy two more".
The last two bullets below are those two; the dialog did not name them, so their PRs say what they
change in plain terms.

- **`image-card:` gets its own `image-card-*` tokens.** Today it borrows shared words: `at-*` (the
  tint placement words in `lib/base/treatments.js`), `card-*`, `ink-*`, `compact` (the universal
  density modifier) and `band`. `resolve-image-card.js` explains why it scopes them to `image`
  slides; own tokens remove the need for that scoping trick.
- **Delete the `guards-strict` / `guards-loose` tokens** (`lib/core/resolve-guards.js`). The
  `guards:` key itself was already retired (rule `guards-renamed`).
- **`drawing: sketch-headings` (today `mode: sketch-clean`) emits one token**, not the two it stamps
  today (`sketch sketch-clean-body`, `resolve-mode.js` `MODE_REGISTER`). The owner chose A (naming
  session, 2026-11-22 02:12 UTC): the one class is `sketch-headings`, and every `sketch` rule also
  matches it. It ships with Q5.
- **`paginate`'s tokens share one stem.** Today the key is `paginate:` but its per-slide switches
  are `with-pagination` / `no-pagination` (`lib/core/pagination.js`, `lib/core/switches.mjs`). The
  owner chose B (typed "2. B" in the command center, 2026-11-22 02:09 UTC): the key becomes
  `pagination:` and the classes stay. Export to Marp writes Marp's own `paginate:` back out, and folding
  an exported bundle back reads it as `pagination:` again. `paginate:` was in the August v0.9.0
  preview (GitHub only, never on npm; the tag once read v1.0.0, relabeled per
  `2026-10-07-first-npm-release.md` §2), so this rename breaks decks written for that preview too;
  `lint:deck --fix` migrates them. (`paginator` in `lib/core/split-facts.js` is a split strategy, not
  this key, and stays.)

### D3. Every Studio label equals its key

`title`, `lang`, `ai-lang`, `size`, `split`, `inline-code`, `glossary`, `class`, `validate`,
`debug`, `backdrop`, the `image-card` rows, `paginate`, `meta`, `callout`, the motion keys, and
every key renamed here. Terse keys get a tooltip. This PR goes **last**, because the labels follow
the final keys.

### Q1. `progress-rail:` → `progress-track:`; `tone: rail` → `stripe`

Two renames that share one reason (a "rail" is the progress track, so the word leaves the status
styles): the key `progress-rail:` becomes `progress-track:`, and the `tone:` (now `status-shape:`,
Q3) value `rail` becomes `stripe`. `progress-rail:` has no `rail` value of its own (its styles are
`dots` and `bar`, `lib/core/resolve-progress-rail.js`). It is the most-used key in this sweep:
17 repo decks.

### Q2. `bar` splits by meaning

- `progress-track: bar` → `line`.
- `eyebrow: bar` and `stamp-shape: bar` → `stroke`.

### Q3. `tone:` → `status-shape:`

It sets how the pass / warn / fail colors draw, and it pairs with `stamp-shape:`. Values after Q1:
`stripe`, `edge`, `glow`.

### Q4. `marks:` splits in two

- `chart-finish: pigment | etch | tone` — the finish axis.
- `tone` keeps its color-source word: `marks: tone ink` becomes `chart-finish: tone ink` (D11, owner
  chose A in the presets desk's session, relayed by the command center on 2026-11-23).
- A separate intensity key, `muted | vivid`. It sets how loud the pass / warn / fail status colors
  are across the deck, under any chart finish (`lib/core/resolve-marks.js`), so it is a status key,
  not only a chart key. **It is `color-intensity: muted | vivid`** (owner, 2026-11-22 00:09 UTC),
  over the other two options the dialog offered, `chart-intensity` ("suggests charts only") and
  `status-intensity` ("undersells the charts"). In the dialog's words, it "says what it changes
  (how strong colors are) for charts and status marks alike".

**This reverses an earlier rename.** `chart-finish:` is a retired key today: `deck-settings.js` lists
it as `kind: 'retired'` with rule `marks-renamed`, which tells authors to write `marks:`. The rule
is info-level and says the old key "still works", so decks that still write `chart-finish:` render
today. The Q4 PR
deletes that retired row and rule, makes `chart-finish:` live again with the narrower meaning (finish
only), and adds the new rule that migrates `marks:`. A deck that wrote `chart-finish: <intensity>`
before the earlier rename gets a lint error that names `color-intensity:`.

#### Q4 implementation map (scoped 2026-11-24 on `e15585e`)

**Classes follow the keys** (owner, 2026-11-24 01:15 UTC, relayed by the command center: "A: rename the classes too").
The rendered pixels do not change, but the class names inside exported HTML do, so the PR stops at the merge gate
for the owner's export sign-off on a demo deck rendered dark and light (CLAUDE.md, QUALITY BAR, export changes).

| Today | After |
|---|---|
| `marks: pigment\|etch\|tone` | `chart-finish: pigment\|etch\|tone` |
| `marks: … muted\|vivid` | `color-intensity: muted\|vivid` |
| `marks: tone ink\|accent` | `chart-finish: tone ink\|accent` (D11) |
| classes `marks-pigment` `marks-etch` `marks-tone` | `chart-finish-pigment` `chart-finish-etch` `chart-finish-tone` |
| classes `marks-ink` `marks-accent` | `chart-finish-ink` `chart-finish-accent` |
| classes `marks-muted` `marks-vivid` | `color-intensity-muted` `color-intensity-vivid` |
| key `chart-finish:` (retired, honored alias of `marks:`, rule `marks-renamed`) | live again, finish words only |
| per-slide `chart-finish-<word>` (honored aliases, `RENAMED_CLASSES` in lint-core) | the real class names; `chart-finish-muted` / `-vivid` move to `color-intensity-*` |

Where the work is (`git grep -lE "marks-(pigment|etch|tone|muted|vivid|ink|accent)"`, 30 files, plus about 17 that read
the key):

- **Engine.** `lib/core/resolve-marks.js` (rename it `resolve-chart-finish.js`, and add a `color-intensity` reader or
  one resolver for both), `lib/core/surface-registers.js`, `lib/core/front-matter-key.js`,
  `lib/integrations/markdown-it/plugins.js`, `lib/runtime/index.js`, `lib/export/player-core.mjs`,
  `lib/transformers/prose-projection.mjs`, `lib/components/index.js`.
- **CSS.** `tools/build-marks-css.js` (generates the finish rules from each chart manifest's `kernel.marks`; rename the
  generator and its output classes), `tools/build-css.js` (its ordering comment), `lib/base/base.tokens.css`
  (§ STATUS reads the intensity class).
- **Settings and lint.** `lib/core/deck-settings.js`: retire `marks`, make `chart-finish` live with finish words, add
  `color-intensity`. In `lib/authoring/lint-core.js`, `marks:` cannot be a plain `KEY_RENAMES` row because it splits
  in two. Add a small `marks:` rule beside the table: it writes `chart-finish:` with the finish and source words and
  `color-intensity:` with the intensity word. A deck that still writes `chart-finish: <intensity>` (the pre-#2887
  spelling) gets an error naming `color-intensity:`. Delete the `marks-renamed` rule and the honored
  `chart-finish-*` entries in `RENAMED_CLASSES`. Old per-slide `marks-*` classes become errors with fixes. Watch the
  studio `lintCoreGz` ceiling (168.7 of 168.9 KB after #3506): free bytes first.
- **Studio.** `docs/src/components/studio/marks-catalog.ts`, `marks-value.ts`, `deck-preset.ts`, `slide-provenance.ts`,
  `SlideContext.tsx`, `docs/src/lib/marks-words.ts`, `docs/src/playground/snapshot-cache.js`. D3 relabels later; here
  only the key and classes they write.
- **Decks and docs.** `examples/marks-tone-source.md` (the only deck setting `marks:`), `lib/base/base.registers.docs.md`,
  `lib/base/base.modifiers.docs.md`, `engineering/chart-styling.md`, and the LFM 1.1 draft row for `marks:`.
- **Tests.** About 20 files, including `test/unit/parsing/resolve-marks.test.js`,
  `test/unit/components/marks-css.test.js`, `marks-finish-contrast.test.js`,
  `test/integration/parity/runtime-marks.test.js` and `test/unit/shard-weights.json` (its file names).
- **Presets.** None on `main` yet (#3470). If they land first, migrate `lib/presets/*/*.preset.json`.

Verification this rename owes:
- the adversarial trio, because it revives a retired key with a new meaning (HARD RULE #25);
- an identity render, old source on `main` against new source on the branch, which must be pixel-identical (the
  HTML differs only in class names);
- the dark and light demo for the export sign-off;
- `lintCoreGz` under its ceiling.

### Q5. `mode:` → `drawing:`

Values: `boardroom` → `clean`, `sketch` stays, `sketch-clean` → `sketch-headings`. 8 repo decks set
`mode:` today.

### Q6. `logo-finish:` folds into `logo:`

`logo:` takes the file plus the axis words, in any order (rule 4): `logo: brand.svg top-left sm`.
The `logo-finish:` key goes away. 4 repo decks set it today.

### Q7. `cards:` stays as it is — name OPEN

`cards:` sets what a card or tile row does with spare height, like flexbox `align-content`. The owner
was not sure of any name offered (`card-row-fill`, `card-row-align`, then `card-rows`,
`spare-height` and `row-align`, then `card-placement` and `card-spacing`): "this requires more
thought", then "we need to think more" (2026-11-22 00:09 UTC). **OPEN: no rename until a name is
chosen.**

### Q8. Repeated value words wait

Value words reused across keys (`ledger`, `classic`, `poster`, `plain`, `tone`, …) wait for a later
sweep. These PRs do not change them, which is why `tone` survives as a `chart-finish:` value after Q3
retires it as a key.

## 3. Out of scope here

- **`cover:` → `cover-layout:`** (D10, owner chose A in the presets desk's session, relayed on 2026-11-23).
  The presets desk ships it in its own cover PR, so it leaves this sweep.
- **The `spectrum*` keys** are settled and being renamed by the Presets Wave 1 session
  (`session_015KSkL4sc6jW8B6fZsc5HR9`). These PRs do not touch them. Where a rename here edits the
  same files (`deck-settings.js`, `lint-core.js`, the base docs), this session tells that one first.
- **Value words (Q8)** and the **`cards:` name (Q7)**.

## 4. How each rename ships

One PR per rename, in the order the owner set on 2026-11-23 (relayed by the command center and the
release desk): D2 (#3415), then `pagination:` with the rename table, then Q4 (it must land before the
release, so it goes early), then D1's six keys in ONE PR (the owner's call), then Q1, Q5 (with
sketch-headings), Q3, Q2, Q6, and D3 last. The release waits for all of them.

Each PR:

1. Renames the key or token in the engine and removes the old spelling (rule 5). It also renames
   the internal names that carry the old word (a resolver file such as `resolve-lift.js`, a vocab
   field such as `liftNames`, a constant such as `MODE_REGISTER`), so the code reads the way
   authors write (rule 3). The owner agreed twice on 2026-11-22: "i'm aligned" in the naming session
   (about 00:10 UTC), then "yes, rename internals too" in the command center (00:27 UTC).
2. Adds a ROW to `KEY_RENAMES` in `lib/authoring/lint-core.js` (HARD RULE #7), not a rule: the one
   `key-renamed` rule reads the table, so the old key is an error that names the new one, with a
   `--fix` rewrite (the owner chose one table over a rule per key, 2026-11-23). A rename the table
   cannot express (Q4's split) adds what it needs beside it. The `deck-settings.js` row for the old key becomes
   `kind: 'retired'` pointing at that rule, the pattern `guards-renamed` and `fonts-renamed` use.
3. Runs `lint:deck --fix` over every repo deck.
4. Updates `lib/base/*.docs.md` and the generated docs (`npm run build`).
5. Adds a `changelog.d/` fragment led by `**Breaking:**` (HARD RULE #10).
6. Migrates `lib/presets/*/*.preset.json` (#3470), or a preset silently stops setting the renamed
   key; #3470 adds a test that fails on a retired key.
7. Ships a demo deck where a rendered surface changes (HARD RULE #9). A pure rename whose rendered
   slides match byte for byte owes the identity evidence instead (`npm run identity:check`).
7. Goes to the owner with a checker-graded 🚦 card. This session never merges.
