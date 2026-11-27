---
status: proposed
summary: >
  The Theme spec becomes a token-system spec (owner, 2026-11-27). Measured on main: themes declare 198 tokens in
  30 families, mentioned 22,325 times in 1,015 files, with four numbering styles, three "on" placements, two words
  for one role, and a duplicated categorical family. The engine already builds all 132 required theme tokens from
  10 starting colors (`deriveTheme`). The note proposes naming principles (role over look, one word per role, one
  grammar), maps them to SOLID, shows before/after names, and recommends freezing only the 10 starting colors as
  THEME 1.0's core, with every derived token documented but experimental until a later audit renames it.
builds-on:
  - 2026-11-27-specs-1-0.md
  - 2026-06-11-universal-token-system.md
  - 2026-07-15-categorical-token-contract.md
  - 2026-08-09-theme-token-contract.md
  - 2026-08-09-color-theme-ownership.md
---

# The token system at 1.0: what a theme must give, and how tokens are named (2026-11-27)

**Status:** proposed; the scope question is on the ❓ card (§6). Nothing is renamed until the owner answers.

**The owner's words (2026-11-27, command center, typed on iOS):** "theme should be a spec as a token system. we
need to audit our tokens and their nomenclature for sure because we have been adding to it as we go for what we
needed but a spec can't operate like that. we need to apply a systems thinking and make sure our tokens are named
appropriately and easy understand and easy to use. whatever we put in there has to be load bearing and it will be
hard to change. they must great and built on solid principles too."

## 1. The answer

Freeze the smallest set of tokens a theme must give and derive the rest. The engine already works this way for
generated themes: `deriveTheme` (`lib/theme/derive.js`) takes **10 starting colors** (`ESSENTIAL_KEYS`: canvas,
alternate canvas, heading ink, body ink, muted ink, accent, soft accent, pass, warn, fail) and returns **132**
tokens, the same count THEME 1.0 names. So THEME 1.0's core is those 10 seeds, under names that pass the principles
in §3. Every derived token is listed with its recipe and marked experimental: a theme MAY override one, but 1.0 does
not promise its name. The full audit and rename of the derived tokens lands in a later version, with a crosswalk
(`lib/tokens/crosswalk.js` already migrates a theme mechanically) so an outside theme moves in one step.

## 2. What is there today (measured, `main` at `90a387d4`)

A throwaway script, not committed: it collects every custom property declared in `themes/**/*.css`, then counts
the `var(--…)` reads of each in `lib/`, `docs/src/` and `themes/`, and the mentions of each name anywhere in the
tree. The seed counts below are `grep -rlE -- '--<name>([^a-z0-9-]|$)'` over the same directories.

| Measure | Value |
|---|---|
| Tokens declared by at least one theme | **198** |
| Tokens THEME 1.0 names | 132 (68 declared tokens are not in the spec; 2 spec tokens no theme declares) |
| Theme directories | 33 (light themes declare; most `-dark` themes compose a light one) |
| Mentions of the 198 names in the tree | **22,325**, in **1,015** files (lib 219, docs/src 312, test 144, engineering 232, examples 32, tools 29, themes 22, spec 15, design 10) |
| Engine-declared tokens (`lib/**/*.css`) | 1,082, built on the theme tokens; layouts read these |
| Theme tokens with exactly one reader file | 50 |
| Theme tokens with no `var()` reader | 17, but most are read by string building (`--cat-N-ink`, `--diagram-*`), so "unused" needs a second pass before anything is deleted |

**Largest families:** `--cat-N-*` 48, `--chart-*` 17, `--syntax-*` 14, `--diagram-*` 11, `--heatmap-*` 10,
`--scheme-dark-*` 10, status (`--pass` `--warn` `--fail` `--info` `--mute` and their tiers) 33.

**Mentions of the 10 seeds** (files): `--accent` 481, `--bg` 314, `--text-heading` 314, `--text-body` 200,
`--text-muted` 193, `--bg-alt` 191, `--accent-soft` 131, `--warn` 125, `--fail` 114, `--pass` 103.

### 2.1 Where the names break their own system

| Problem | Today |
|---|---|
| Four numbering styles | `--cat-3-fill` (hyphen, 1–12), `--chart-cat3` (no hyphen, 1–8), `--heatmap-step3` (word + number), `--seq-500` (a 100–900 scale) |
| One hue, two families | `--chart-cat3` and `--cat-3-fill` / `--cat-3-mark` / `--cat-3-ink` both name categorical color 3 |
| "On" in three places | `--on-accent` (prefix), `--cat-on-fill` (middle), `--c-on-container` (after a cryptic prefix) |
| Two words for one role | `--bg` and `--surface-inverse` are both surfaces; `--mute`, `--text-muted` and `--muted-mark` are one idea in two spellings |
| A name that says the wrong thing | `--diagram-critical` is filed as "Universal signal" in THEME 1.0 |
| A cryptic prefix | `--c-container`, `--c-subcontainer-edge` (`c-` is left over from the pre-2026-06 names) |
| A color mode in a name | the ten `--scheme-dark-*` tokens repeat the light names for the dark face |
| A tool's name in a token | `--marp-slide-pagination-font-size`, declared by a theme |

## 3. Naming principles

1. **Role, never look.** A name says what the token is for (`--text-heading`), never how it looks (`--blue`,
   `--light-gray`) or which mode it is in. HARD RULE #11 states this for the engine; the spec states it for everyone.
2. **One word per role, across every family.** `surface` is a surface, `text` is ink for reading, `mark` is ink for
   a graphic, `muted` is de-emphasis. No synonyms.
3. **One grammar:** `--{family}-{role}[-{variant}][-{state}]`, every part lowercase, words joined by hyphens.
   Numbers are always `-N`, counted from 1 (`--cat-3`, `--ramp-3`). Ink that sits on a surface is always
   `--on-{surface}` (`--on-accent`, `--on-cat-fill`, `--on-container`).
4. **Color mode is not in the name.** A theme gives each token a light and a dark value (CSS `light-dark()`), so
   `--scheme-dark-text-body` becomes the dark value of `--text-body`.
5. **A small required core; everything else optional, with a default.** A theme MUST give the core. A derived token
   has a recipe the engine applies when a theme does not override it.
6. **Every token is load-bearing.** A token enters the spec only if a layout reads it and no other token could
   serve. A token with one reader is a candidate to fold into that reader.
7. **Outside additions are prefixed.** A plugin's tokens start with its name (`--acme-gauge-fill`), so they can never
   collide with a core family (EXTENDING §4). CSS names cannot hold a `.`, so the prefix is joined by a hyphen and
   the core families are a reserved list.

### 3.1 SOLID, for tokens

| Principle | For tokens | Test |
|---|---|---|
| Single responsibility | one token, one role; no token is both an area color and an ink | no token is read both as `background` and as `color` |
| Open/closed | a new family or a plugin's tokens add names; they never change a core one | adding a chart kind adds no core token |
| Liskov | any theme that passes the gate drops in for any other, in both modes | the contrast gate passes for every theme and every layout |
| Interface segregation | a theme gives 10 seeds, not 132 tokens; a chart-only consumer reads only the categorical family | `deriveTheme` from the 10 seeds alone passes the gate |
| Dependency inversion | layouts read roles, never a theme's own values or a derived recipe's internals | HARD RULE #3's hex gate, plus no layout reads a `--scheme-dark-*` name |

### 3.2 Before and after

| Before | After | Principle |
|---|---|---|
| `--chart-cat3`, `--cat-3-fill`, `--cat-3-mark`, `--cat-3-ink` | `--cat-3` (the seed hue), and `--cat-3-fill`, `--cat-3-mark`, `--cat-3-text` derived from it | 2, 3, 5 |
| `--heatmap-step1` … `--heatmap-step5`, `--seq-500` | `--ramp-1` … `--ramp-5` | 3 |
| `--c-container`, `--c-on-container`, `--cat-on-fill` | `--surface-container`, `--on-container`, `--on-cat-fill` | 2, 3 |
| `--scheme-dark-text-body` | the dark value of `--text-body` | 4 |
| `--mute`, `--muted-mark` | `--muted`, `--muted-mark` | 2 |

These are examples of the principles, not a proposed rename list. The audit (§5, option B's later step) produces
the list, with a reader count and a migration row for each.

## 4. The seeds, against the principles

Nine of the ten seed names already pass: `--text-heading`, `--text-body`, `--text-muted`, `--accent`,
`--accent-soft`, `--pass`, `--warn`, `--fail`, and `--bg-alt` passes only alongside `--bg`. The one that fails
principle 2 is `--bg` itself: it and `--surface-inverse` are the same kind of thing under two words. Renaming
`--bg` and `--bg-alt` to `--surface` and `--surface-alt` touches 314 and 191 files and every theme. That is W1 on
the card, with "keep `--bg`" as the default, because "background" is the word every CSS author already knows and the
rename buys consistency only.

## 5. Options for the scope before 1.0

| Option | What ships at 1.0 | Measured cost | Risk |
|---|---|---|---|
| **A. Full audit and rename now** | all ~200 tokens renamed by the principles | 22,325 mentions in 1,015 files; every theme, every layout; exported HTML changes, so the dark and light export sign-off; the trio; about 4 days to release | the bar drops to make the date, or the date moves |
| **B. Freeze the 10 seeds now, the rest experimental** (recommended) | THEME 1.0 = the 10 seeds (principles §3, the derive recipes listed); derived tokens documented, overridable, name not promised | the spec rewrite and this audit; zero renames if W1 keeps `--bg` | the derived names stay inconsistent until the audit lands; an outside theme that overrides one may need the crosswalk later |
| **C. THEME stays a draft at 1.0** | nothing promised | none now | outside themes have no contract at all |

B is honest about what is load-bearing today. A theme author who gives the 10 seeds gets a theme that passes the
gate, and that promise is already true in the code. The rest can be designed properly instead of renamed in a rush.

## 6. Verification B owes

- `deriveTheme` from the 10 seeds alone passes `lib/theme/gate.js` for every shipped theme's seeds, in both modes.
  The 2026-08-09 contract note measured a generated theme failing the hand-theme gate on 27 tokens; that number is
  re-measured first, and closing it is part of B.
- The second "unused" pass (§2) before the spec lists anything as unread.
- The THEME PR gets the adversarial trio (#25) and a checker-graded 🚦 card. With no rename, no export bytes change.
