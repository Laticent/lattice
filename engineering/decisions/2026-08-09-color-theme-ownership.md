---
status: shipped
summary: >
  The charter for who owns color in Lattice. The boundary was decided across seven
  records and stated in none, so a reader had to reconstruct it. Four owners, one
  sentence each: the ENGINE owns the vocabulary (role-named `var(--token)` names, no
  literals — HARD RULE #3 + #11, both gated); a THEME owns only the values behind
  those names; the DECK owns which theme and which mode (`theme:` and `color-mode:`
  are authoritative on every surface, and beat the legacy `class:` color axis); and
  every CONSUMER — docs site, Studio, exported artifact — is downstream of all three
  and may not invent a token. This note restates none of the seven records; it says
  what each one settled and points at it. The live edge is named too, because the
  boundary being settled does not make the work inside it finished: #1411, #1302,
  #414, #757, #1377, and the engine-level categorical seed derivation deferred by
  2026-07-15-categorical-token-contract.md.
---

# Color and theme ownership — where each layer's authority starts and stops

Every piece of this boundary has been decided. None of it was written down in one
place, so answering "may the docs site restyle a themed deck?" or "can the Studio
add a token?" meant reconstructing the answer from seven records — two of which
carried a stale `proposed` header and read like open questions.

This note is a **map, not a manual**. Each row below says what a record settled and
points at it. Read the record for the reasoning; nothing here is restated from one.

It carries `status: shipped` because everything it describes is built and verified —
but the "absorb into canon, then delete" rule for shipped notes does not fire here.
There is no canonical doc that owns the *boundary*; that absence is the defect this
note exists to close. Keep it, and edit it when an owner moves.

## The boundary in four sentences

| Layer | Owns | Does not own |
|---|---|---|
| **Engine** | The token *vocabulary* — which role names exist, what each means, and the layouts that consume them | Any concrete color. `lattice.css` carries no literal (HARD RULE #3) |
| **Theme** (`themes/*.css`) | The *values* behind those names, per mode | The names. A theme cannot invent a role or rename one (HARD RULE #11) |
| **Deck** | *Which* theme and *which* mode — `theme:` and `color-mode:` in front matter | Anything below that. A deck picks a palette; it does not author one |
| **Consumer** (docs site · Studio · export) | Its own chrome, and the choice it offers a user | The deck's declared palette or mode, and the vocabulary |

The single load-bearing consequence, stated once: **a token name is engine
property.** Themes fill it, decks select among filled sets, consumers read the
result. Nothing downstream adds to the set. That is why the Studio's theme
generator writes engine token names rather than its own, and why a palette picker
on the docs site cannot reach a deck that named its theme.

## What each record settled

| Record | What it settled |
|---|---|
| `2026-06-11-universal-token-system.md` | The vocabulary itself — universal, role-named tokens on two axes, and the phased alias-then-flip that got every theme onto them |
| HARD RULE **#3** + **#11** | The vocabulary is *enforced*, not merely documented: `checkHexLiterals` fails a literal in layout CSS, `checkRetiredTokenNames` fails a legacy per-theme name. Both run in `build:check` |
| `2026-07-08-deck-theme-independence.md` | The deck's `theme:` wins over the site. The site palette picker styles app chrome and un-themed decks only; mode stays a shared axis except where the deck pins. **One** resolver owns the precedence for every preview surface — `docs/src/lib/deck-theme.ts` |
| `2026-07-11-color-mode-frontmatter.md` | `color-mode: light \| dark \| system \| inherited` is the deck-wide mode register, resolved once in `lib/core/resolve-color-mode.js` and honored by engine, runtime, emulator, both previews and the player. The legacy `class: dark`/`light` axis survives only as a deprecated alias |
| `2026-08-05-deck-class-register-boundary.md` | …and when the two disagree, the key always wins — enforced by *filtering the register where it is read*, so an illegal token is never stamped. Also names the four boundaries that reading happens at, the export one included |
| `2026-07-15-categorical-token-contract.md` | `--cat-*` carries semantics, not free-form paint: fill and mark are distinct tiers of one hue, the twelve slots are mutually distinguishable, the ink contrasts. Shipped as a recolor plus gates; the engine-level *seed derivation* was deferred |
| `2026-07-13-viz-color-and-frame-unification.md` | The road **not** taken. A unified color-palette migration across charts, diagrams and Mermaid was investigated and rejected — they already share one contract, and collapsing them would flatten per-theme brand identity to re-solve a problem the a11y palettes own. The *frame* merge was approved instead, and shipped separately |
| `2026-07-20-preview-theme-restyle-in-place.md` | How a consumer applies a change without owning it: a theme/mode switch swaps the resident `<style>` in place rather than rewriting the preview document, so the realm survives |

That is the seven #1449 counted, plus `2026-08-05-deck-class-register-boundary.md`,
which is where the `color-mode:` precedence above is actually enforced and so cannot
be left out of a map of who wins.

Two of those headers said `proposed` until this change, and both read as open
questions they are not: `2026-07-11-color-mode-frontmatter.md` shipped in #899 and
was hardened in #1427, and `2026-07-13-viz-color-and-frame-unification.md` is a
decision — the palette migration is rejected, the frame merge went ahead. Both now
say so.

## What is not settled

The boundary is decided. The work *inside* it is not, and this note is worth
nothing if it reads as an all-clear. Open at the time of writing:

- **#1411** — `--cat-N-ink` is absent from the derived-theme contract in
  `lib/theme/derive.js`, so the Studio's own contrast meter can read green on a
  sub-AA ink. The universal tier got its ink (#1263, shipped); the *generated* tier
  did not. That gap is the sharpest live instance of the asymmetry #1450 is about.
- **The deferred seed derivation** from `2026-07-15-categorical-token-contract.md` —
  the recolor shipped, the model that would make `fill == mark` structurally
  impossible did not.
- **#1302** — carbone is the one palette with no light face. Nothing in the file
  says whether that is a decision or an omission, which is exactly the kind of
  question a theme manifest (#1450) would have to answer.
- **#414** — the per-surface theme/palette dropdowns on the docs site are not yet
  one shared control, so the boundary above is stated in one resolver but offered
  through several UIs.
- **#757** — the self-contained `.lattice` player and its full theme/asset envelope.
  Until it lands, "the artifact carries its palette with it" is the intent, not a
  finished claim; `2026-07-07-html-lattice-player.md` is still `proposed`.
- **#1377** — a theme-pinned diagram gets no engine config on the export path, the
  last hole in Mermaid config parity.

## Using this note

Working on color, start here, then read the one record that owns your question.
Two rules fall out of the table and are worth stating flatly, because both have
been broken before:

1. **A new color goes in a theme, behind an existing role token.** If no role fits,
   the change is to the vocabulary — an engine change with a gate and a crosswalk
   entry, not a literal at the call site.
2. **A consumer that wants to restyle a deck must ask whether the deck already
   answered.** `resolveDeckTheme` is where that question is answered for the docs
   site; do not re-answer it locally.

Canon for how the system works, rather than who owns it, stays where it is:
`design/theming.md` for the palette contract, `lib/base/base.docs.md` for the token
reference, `engineering/textures.md` for the categorical texture channel, and
`engineering/typography.md` for the `--fs-*` system.
