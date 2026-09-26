---
status: shipped
summary: The owner asked for self-healing to be ONE deck setting — front matter, on by default, a Studio field, and a way to turn it off — and raised floor vs ceiling and cohesiveness. Proposes a `fit:` register (report / heal / trim) that absorbs `guards:`, and a cohesion rule for the projection-scale step. Measured on the repro deck: stepping the whole deck to what its worst slide holds erases the scale (13 of 64 slides only fit at 1x), so "cohesive" has to mean a deck-wide size plus named holdouts, not "fit the worst slide". Three forks for the owner; no code until they are settled.
builds-on: 2026-09-25-font-scale-fit.md, 2026-09-07-overflow-guards-trim.md, 2026-07-29-autosplit-is-not-a-toggle.md, 2026-07-30-overflow-marker-register.md
---

# One `fit:` setting for everything the engine may do to make a slide fit

**Status:** shipped — the owner settled all three forks on 2026-09-25 (§8).

## 1. The ask

After #2378 shipped STEP (`2026-09-25-font-scale-fit.md`), the owner asked for self-healing
to be a **general setting**: a front-matter key, **on by default**, with a **Studio
deck-settings field**, and **a way to disable it if things go south**. The owner said there
are other places the engine should self-heal too, and raised two concerns about STEP itself:

- **Floor vs ceiling.** What bounds a heal.
- **Cohesiveness.** Per-slide stepping makes type size vary from slide to slide in one deck.

## 2. What exists today

The engine has three moves that change a slide to make it fit. Each has a different switch:

| Move | What it does | Switch today |
|---|---|---|
| SPLIT | a slide with several members becomes one page per member, at portrait @sizes | none — `autosplit:` was **retired** on 2026-07-29 |
| STEP (#2378) | a slide that does not fit at `scale-l/xl/2xl` renders one or more steps smaller, never below 1x | none |
| TRIM | text that does not fit is cut with an ellipsis | `guards: loose` (default, off) / `strict`, with a Studio field "Text overflow" |

So the repo has already ruled twice, in opposite directions:

- **`autosplit:` was retired** because no deck in the repo's history ever turned it off. "Off"
  expressed no authoring intent; only measurement rigs wanted it, and they got `--no-split`.
- **`guards:` was admitted** as a deck register, because TRIM loses words, so it must be the
  author's choice (owner ruling, 2026-09-07 §10).

The difference between them is **whether the move loses content**. SPLIT and STEP lose
nothing. TRIM loses words.

## 3. Floor and ceiling — already fixed, stated once

- **Ceiling:** the size the author asked for (`scale-xl` = 1.3x).
- **Floor:** the designed size, 1x. STEP never goes below it. A slide that does not fit at
  1x clips and is reported exactly as it was before #2378.

A `fit:` register should keep both as invariants, not as settings: no level may go below
the designed type scale. That is the Fit Spine's floor, and the reason STEP is not a shrink.

## 4. Cohesiveness — measured, and the obvious answer fails

The obvious cohesive rule is to find the largest scale that **every** slide fits and use it
on every slide. Measured on the repro deck (agentic-practices, 64 slides, on `main` after
#2378 and #2380):

| Deck scale | Slides at the full scale | Stepped to 1.15x | Stepped to 1x |
|---|---|---|---|
| `scale-xl` | 40 | 11 | 13 |
| `scale-l` | 51 | — | 13 |

Thirteen slides only fit at 1x, so "every slide fits" puts the **whole deck at 1x**: the
projection scale is gone, and the author gets nothing for asking. The worst slide would set
the size for all 64.

So cohesion has to mean something else. Three candidates:

- **(A) Per-slide, as shipped.** Each slide takes the largest size it holds. Maximum
  readability; the most variation (three sizes in one deck).
- **(B) Two sizes at most.** The deck renders at ONE deck-wide size, and slides that cannot
  hold it drop straight to 1x rather than to the nearest step. On the repro deck: 40 slides at
  1.3x and 24 at 1x, instead of three sizes. It is the smallest change that bounds the
  variation.
- **(C) One size, named holdouts.** The deck renders at the largest size a chosen share of
  slides hold (say 80%). Holdouts step down as today, and `lint:deck` names them as the slides
  to trim for a uniform deck. It keeps the deck at a readable size and makes the variation an
  explicit to-do list rather than a surprise.

(A) is what ships. (B) is cheap. (C) needs a measured deck-wide pass before per-slide STEP.
The emulator can do it; the live preview would have to measure every slide before settling on
any size, which the runtime's sweep plan (`lib/core/fit-sweep.js`) deliberately avoids.

## 5. The forks

**Fork 1 — one register, or two?**
- *Recommended:* one `fit:` register with three levels, absorbing `guards:`:
  - `report` — the engine changes nothing; it only flags. Today's behavior with no scale class,
    and the "things went south" switch.
  - `heal` (**default**) — moves that lose no content: SPLIT and STEP.
  - `trim` — also TRIM, the move that cuts words (today's `guards: strict`).
- `guards: strict` keeps working as an alias for one release, and `lint:deck` names the new
  spelling. The per-slide overrides become `_class: fit-report / fit-heal / fit-trim`.
- *Against:* it partly reverses the `autosplit:` retirement. The honest answer to that ruling
  is that `report` is not "autosplit off" — it switches off every move at once, for one stated
  reason (debugging, or an exact-reproduction export). Nobody turns off SPLIT alone.

**Fork 2 — the cohesion rule for STEP:** (A) per-slide, (B) two sizes at most, or (C) one size
plus named holdouts. *Recommended:* (B) now — it is a small change to the kernel and bounds
the variation to two sizes — with (C) as a later option once there is a deck-wide measure pass.

**Fork 3 — the Studio field.** The existing "Text overflow" field becomes **"Fit"** with the
three levels and one line of help each. *Recommended*, since the field and its plumbing
(`StudioShell.tsx`, `guards-catalog`) already exist.

## 6. What this does not change

- The floor (1x) and the ceiling (the requested scale) — invariants, not settings.
- Detection. The ring, the `⚠ OVERFLOW` line and the `↓ SCALE` line report exactly as now, at
  every level. `report` changes what the engine does, never what it tells you.
- The export-to-Marp path. It runs the same runtime, so it follows the deck's `fit:` level.

## 7. Cost, if all three recommendations are taken

- A `resolve-fit.js` register beside `resolve-guards.js`, the alias, and lint rules for
  unknown values and the old spelling.
- STEP's kernel learns the two-size rule (a `mode` argument; rule 1, "never write at 1x",
  unchanged).
- The Studio field renamed, with three options.
- Docs: `typography.md` §7, the Fit Spine, `base.registers.docs.md`, a changelog fragment, and a
  demo deck rendered at each level.
- Verification: tier 1 checker. It rewrites two canonical rulings, so the trio is arguable.

## 8. Ruling (2026-09-25)

The owner took all three recommendations in one round.

| Fork | Ruling |
|---|---|
| One register, or two? | **One `fit:` register** — `report` / `heal` (default) / `trim` — absorbing `guards:`, which stays as an alias for one release. |
| Cohesion rule for STEP | **(B) two sizes at most.** A slide that does not hold the deck's scale drops to 1x, never to an in-between step. |
| Studio field | **"Text overflow" becomes "Fit"**, three options. |

What shipped with it:

- `lib/core/resolve-guards.js` is the `fit:` register (`FIT_NAMES`, `fitClass`,
  `fitClassFromFrontMatter`, `fitLevel`); both render paths read the deck token through
  `fitClassFromFrontMatter`, and `guardsEnabled` is TRIM's gate at `trim`.
- `lib/core/scale-fit.js` lands on 1x and returns early on `fit-report` (rule 6).
- `lib/core/auto-split.js` leaves a `fit-report` slide whole.
- `lint:deck`: `unknown-fit` (warning), `guards-renamed` (info), and the capacity rules read
  the slide's fit level — under `report`, past-budget slides are warnings, because nothing
  will split or step them.
- The five override tokens are a `fit` modifier group, which also fixes a pre-existing
  defect: `_class: guards-strict` was documented as a per-slide override and linted as
  `unknown-class`.
- The Studio's "Fit" field writes `fit:` and drops any old `guards:` line.

Measured on the repro deck at scale-xl: `heal` renders 40 slides at 1.3x and 24 at 1x with 0
clipped; `report` steps nothing and reports all 24 as clipped. A portrait `list-steps` slide
splits into 4 pages at `heal` and stays whole (and rings) at `report`.


## 9. Amendment (2026-09-26) — fork 2 replaced by one size per deck

The two-size rule still let a deck alternate between its requested size and 1x as you
click through (40 slides at 1.3x and 24 at 1x on the repro deck), which is the defect the
owner raised in #2361. The owner then chose one size per deck: STEP walks the full ladder
again to find each slide's own highest fitting rung, and LEVEL puts every slide that asked
for that scale on the lowest of those rungs. With one size there is no variation left for
the "never an in-between step" rule to cap, so it is dropped: a 1.3x deck whose densest
slide fits at 1.15x lands at 1.15x rather than 1x. The §4 objection — the worst slide sets
the size for the whole deck — is accepted as the price, and answered by naming the slides to
trim in the export's `↓ SCALE` line and by `venue:`, which tells lint the budget to warn at.
`fit:` is unchanged, and `report` switches LEVEL off with STEP. Record:
`2026-09-25-font-scale-fit.md`, amendment 2026-09-26.
