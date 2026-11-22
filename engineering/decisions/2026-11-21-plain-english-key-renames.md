---
status: proposed
summary: The owner's naming rules and rename decisions for deck front-matter keys, their class tokens and Studio labels before GA. Old names are removed, not aliased; lint flags them and --fix migrates. Two names stay open (the chart intensity key, cards:). One PR per rename, lowest risk first.
---

# Plain-English key renames before GA (2026-11-21)

**Decided.** The owner answered each naming question in the command-center session
(`session_015KSkL7uv5r7CPSaDnS9F2c`), through its question dialogs between 23:30 and 23:42 UTC, and
said "go renames" at 23:49 UTC on 2026-11-21. This note
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
  today (`sketch sketch-clean-body`, `resolve-mode.js` `MODE_REGISTER`).
- **`paginate`'s tokens share one stem.** Today the key is `paginate:` but its per-slide switches
  are `with-pagination` / `no-pagination` (`lib/core/pagination.js`, `lib/core/switches.mjs`). The
  PR picks one stem for both. (`paginator` in `lib/core/split-facts.js` is a split strategy, not
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
- A separate intensity key, `muted | vivid`. It sets how loud the pass / warn / fail status colors
  are across the deck, under any chart finish (`lib/core/resolve-marks.js`), so it is a status key,
  not a chart key. **Its name is OPEN.** The option the owner picked gave `status-intensity:` as an
  example, not a decision. This session sends the command center three candidates with a
  recommendation; the PR waits for the owner's pick.

**This reverses an earlier rename.** `chart-finish:` is a retired key today: `deck-settings.js` lists
it as `kind: 'retired'` with rule `marks-renamed`, which tells authors to write `marks:`. The rule
is info-level and says the old key "still works", so decks that still write `chart-finish:` render
today. The Q4 PR
deletes that retired row and rule, makes `chart-finish:` live again with the narrower meaning (finish
only), and adds the new rule that migrates `marks:`. A deck that wrote `chart-finish: <intensity>`
before the earlier rename gets a lint error that names the intensity key.

### Q5. `mode:` → `drawing:`

Values: `boardroom` → `clean`, `sketch` stays, `sketch-clean` → `sketch-headings`. 8 repo decks set
`mode:` today.

### Q6. `logo-finish:` folds into `logo:`

`logo:` takes the file plus the axis words, in any order (rule 4): `logo: brand.svg top-left sm`.
The `logo-finish:` key goes away. 4 repo decks set it today.

### Q7. `cards:` stays as it is — name OPEN

`cards:` sets what a card or tile row does with spare height, like flexbox `align-content`. The owner
was not sure of any name offered (`card-row-fill`, `card-row-align`, then `card-rows`,
`spare-height` and `row-align`): "this requires more thought". No rename until a name is chosen. A
better candidate goes to the command center as a suggestion only.

### Q8. Repeated value words wait

Value words reused across keys (`ledger`, `classic`, `poster`, `plain`, `tone`, …) wait for a later
sweep. These PRs do not change them, which is why `tone` survives as a `chart-finish:` value after Q3
retires it as a key.

## 3. Out of scope here

- **The `spectrum*` keys** are settled and being renamed by the Presets Wave 1 session
  (`session_015KSkL4sc6jW8B6fZsc5HR9`). These PRs do not touch them. Where a rename here edits the
  same files (`deck-settings.js`, `lint-core.js`, the base docs), this session tells that one first.
- **Value words (Q8)** and the **`cards:` name (Q7)**.

## 4. How each rename ships

One PR per rename, lowest risk first: D2, then D1 one key at a time, then Q1, Q2, Q3, Q5, Q6, then
Q4 once its intensity name is chosen, then D3.

Each PR:

1. Renames the key or token in the engine and removes the old spelling (rule 5).
2. Adds a lint rule in `lib/authoring/lint-core.js` (HARD RULE #7): the old name is an error that
   names the new one, with a `--fix` rewrite. The `deck-settings.js` row for the old key becomes
   `kind: 'retired'` pointing at that rule, the pattern `guards-renamed` and `fonts-renamed` use.
3. Runs `lint:deck --fix` over every repo deck.
4. Updates `lib/base/*.docs.md` and the generated docs (`npm run build`).
5. Adds a `changelog.d/` fragment led by `**Breaking:**` (HARD RULE #10).
6. Ships a demo deck where a rendered surface changes (HARD RULE #9). A pure rename whose rendered
   slides match byte for byte owes the identity evidence instead (`npm run identity:check`).
7. Goes to the owner with a checker-graded 🚦 card. This session never merges.
