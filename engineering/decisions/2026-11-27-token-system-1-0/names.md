# Theme token names for 1.0 — T1 draft

**Status:** DRAFT, for the owner and the PR's adversarial review. Nothing is renamed here. This is T1 of the token
plan (`engineering/decisions/2026-11-27-token-system-1-0.md` §9, on #3554): every token a theme declares today, its
job, where it goes, and its proposed 1.0 name. The rename itself is T6.

**Measured on `main` at `90a387d4`:** 198 names declared by at least one theme. "Readers" is the number of files in
`lib/`, `docs/src/` and `tools/` that mention the name; "themes" is how many theme files declare it.

**Rules applied** (token note §3, §8): role, never look; one word per job; `--{family}-{role}[-{variant}]`; numbers
`-N` from 1; ink on a surface is `--on-{surface}`; no color mode in a name; the theme owns the core, a plugin owns its
own colors (§8.3); no computed color except a see-through wash. Where the owner already chose a name, it stays: `--bg`.

**Where each name goes:** CORE (the theme file, frozen by THEME 1.0) · MERMAID or CODE (that plugin's per-theme file) ·
FOLD (the dark value moves into its light name's pair, so the name goes) · AUDIT (not enough evidence yet that it is
load-bearing; the review decides keep or drop).

## Surfaces and text

| Today | 1.0 | Goes to | Why |
|---|---|---|---|
| `--bg` | `--bg` | CORE | the owner kept it |
| `--bg-alt` | `--bg-alt` | CORE | pairs with `--bg` |
| `--surface-inverse` | `--bg-inverse` | CORE | one word for one job: the inverse page is a background |
| `--border` | `--border` | CORE | |
| `--text-display` `--text-heading` `--text-body` `--text-secondary` `--text-label` `--text-muted` | unchanged | CORE | already role names |
| `--on-inverse-muted` | `--on-bg-inverse-muted` | AUDIT | one theme declares it; follows `--bg-inverse` if kept |
| `--on-dark-primary` `--on-dark-secondary` `--on-dark-ghost` `--on-dark-watermark` | `--on-bg-inverse`, `-secondary`, `-ghost`, `-watermark` | AUDIT | "dark" is a look, not a job; one theme declares them, 11 files read the first |
| `--scheme-dark-*` (10) | the dark half of their light names | FOLD | color mode is not a name (§3 rule 4) |
| `--bg-warm-mid` | — | AUDIT, likely drop | 14 themes declare it, no file reads it |

## Accent and brand

| Today | 1.0 | Goes to | Why |
|---|---|---|---|
| `--accent` `--accent-soft` | unchanged | CORE | |
| `--on-accent` | unchanged | CORE | |
| `--brand-accent` `--brand-alt` `--brand-bright` `--brand-canvas` | — | AUDIT | declared by 3–11 themes, read by 1–3 files each; either they are jobs the core lacks (then named for the job) or theme-private helpers (then not in the spec) |

## Status

Five statuses: `pass` `warn` `fail` `info` `muted` (`mute` today; one word for de-emphasis, §2.1).

| Today (per status) | 1.0 (per status) | Goes to | Why |
|---|---|---|---|
| `--pass` | `--pass` | CORE | the strong color |
| `--pass-bg` | `--pass-bg` | CORE | pale background behind text |
| `--pass-mark` | `--pass-mark` | CORE | the color of a graphic mark |
| `--pass-on-mark` | `--on-pass-mark` | CORE | ink on a surface is `--on-{surface}` |
| `--pass-vivid-mark` | `--pass-mark-vivid` | CORE | variant after the role |
| `--pass-edge-mark` `--pass-vivid-edge-mark` | `--pass-edge`, `--pass-edge-vivid` | CORE | |
| `--warn-signal-mark` `--fail-signal-mark` | `--warn-signal`, `--fail-signal` | CORE | only the two exceptions carry a signal ring |
| `--mute` `--mute-mark` `--mute-on-mark` `--mute-edge-mark` | `--muted`, `--muted-mark`, `--on-muted-mark`, `--muted-edge` | CORE | one word: `muted` |
| `--muted-mark` (the de-emphasis tier, 52 readers) | `--muted-mark` | CORE | already the target spelling |
| `--on-mark` `--on-mark-shade` `--status-shade-mark` | — | AUDIT | generic "on mark" and two shade tiers; the review decides whether they are one job |

## Categories (12, each light and dark)

| Today | 1.0 | Goes to | Why |
|---|---|---|---|
| `--chart-catN` (8) | `--cat-N` | CORE | the STRONG color, for marks, bars and boxes; slots 9–12 added (T4) |
| `--chart-catN-ink` (8) | `--on-cat-N` | CORE | ink on the strong color |
| `--cat-N-fill` (12) | `--cat-N-pale` | CORE | the PALE color, behind text only (§8.2); "fill" says how it is used, not what it is |
| `--cat-N-ink` (12) | `--on-cat-N-pale` | CORE | ink on the pale color |
| `--cat-N-mark` (12) | `--cat-N-text` | CORE | the category's hue as text on the page (`lib/theme/cat-ink.js`); "mark" collided with the strong job |
| `--cat-on-fill` `--cat-on-mark` | — | FOLD into the per-category inks | one ink per category is the curated choice |
| `--chart-neutral-mark` | `--cat-neutral` | CORE | the "no category" color |

## Ramps (new in T4)

| Today | 1.0 | Goes to | Why |
|---|---|---|---|
| `--heatmap-stepN` (percentages), `--heatmap-stepN-ink` | `--seq-N`, `--on-seq-N` (N 1–5) | CORE | real colors, solver-written once and reviewed |
| `--seq-500`, `--seq-pole-low` `--seq-pole-high`, `--ramp-hue` `--ramp-ink` | — | FOLD into `--seq-N` | four spellings of one ramp today |
| — | `--div-N`, `--on-div-N` (N 1–5, 3 the middle) | CORE | the diverging scale, new |
| `--risk-critical-keep` `--risk-critical-shade-keep` `--risk-critical-step-ink` | — | AUDIT | 1–3 themes; likely the risk matrix's own colors, which the plugin rule would move to the chart family's file |

## Spectrum, code, plugins

| Today | 1.0 | Goes to | Why |
|---|---|---|---|
| `--spectrum` `--spectrum-vertical` `--spectrum-end` `--spectrum-solid` | unchanged | CORE | the slide-edge stripe is a core surface |
| `--code-inline-fg` `--code-text` | `--code-inline`, `--code-text` | CORE | a code block is a core surface; drop the `-fg` suffix (no other token has one) |
| `--syntax-*` (14) | `--code-<role>` in the code plugin's file | CODE | highlighting is the code plugin's (owner, §8.3) |
| `--diagram-*` (11) `--c-*` (6) | `--mermaid-<role>` in Mermaid's file | MERMAID | the plugin owns them; the flowchart's two reads move to core (T5) |
| `--marp-slide-*` (4) | — | AUDIT | a tool's name in a token; one theme declares them; the Marp export may own them |
| `--panel-edge-mark` | `--panel-edge` | AUDIT | 5 themes, 5 readers |
| `--tag-bg` | — | AUDIT | one theme, 3 readers |

## Counts

| | Today | Draft 1.0 |
|---|---|---|
| Names any theme declares | 198 | about 150 in the core, before the AUDIT rows are settled |
| Moved to plugins | 0 | 31 (14 code, 17 Mermaid) |
| Folded (dark copies, duplicate inks, four ramp spellings) | — | about 20 |
| AUDIT rows to settle | — | 22 names in 9 rows |

The AUDIT rows are the review's first job: each one is either a job the core needs (then it gets a job name) or a
helper one theme uses (then it is that theme's, out of the spec).
