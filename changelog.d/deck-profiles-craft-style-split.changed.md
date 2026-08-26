- **Breaking: the deck scorecard reports TWO grades — Craft and Style — instead of one
  overall number.** `scoreDeck()` now returns `{ craft, style, profile, categories }` where
  it previously returned `{ overall, band, categories }`, and the five categories became
  seven split across the halves (`structure` · `craftProse` · `contract` in Craft;
  `brevity` · `framing` · `data` · `pacing` in Style). The single grade averaged three
  incommensurable things — does it render correctly, did the author do the work, and does it
  match one genre's house style — so a well-made teaching deck with zero lint findings and
  zero craft findings scored C+, the joint lowest of the 198 scorable committed decks. **Craft is
  genre-blind and holds the same bar for every deck; Style is measured against a named
  profile and always reported with it.**
- **Added: deck profiles — `profile: general | teaching | mission` in front matter,
  declared only.** `general` is the default and reproduces the pre-profiles universal bar
  exactly (70 words / 6 bullets / a 14-word heading, both structural rules graded), pinned
  by a test against those constants. A profile can therefore only ever loosen a number for a
  deck whose author asked by name — never for a deck that said nothing. `teaching` relaxes
  prose density (measured: two thirds of its slides clear 70 words) **and stops grading
  `no-ask` and `agenda-missing`** — a lesson asks the learner to practice rather than the
  room to approve, and its progression is its agenda; both rules are still surfaced as
  advice, they just stop deducting. `mission` relaxes
  the heading budget only (17% of nonprofit headings clear 14 against corporate's 2%).
  Neither can touch Craft.
- **Fixed: the density penalty no longer floors a category, and cannot be gamed by deck
  length.** `wall-of-text` deducted 12 points per slide, uncapped, so nine dense slides took
  108 points off a 100-point category and any long-enough deck could reach zero — after
  which the score stopped telling "slightly over budget everywhere" from "genuinely
  unreadable". Every rule family now deducts a bounded, saturating amount in the finding
  COUNT, with no deck-length denominator: padding a deck with empty slides no longer raises
  its score, and a deck the slide splitter cannot see through is no longer penalised the
  full ceiling on its first finding.
- **Fixed: `Contract` was still uncapped, in the highest-weighted Craft category.** Thirteen
  lint warnings floored it and 20 versus 60 were indistinguishable — the same saturation bug
  this change exists to end, left in the one category that varies on a real, un-linted
  draft. It is now ONE saturating curve over a severity-weighted finding count, so it
  approaches a ceiling it never reaches: a lint-swamped draft bottoms out near 12 rather
  than clamping to 0, and every additional finding still costs something. (The first cut of
  this fix gave it two per-family curves whose ceilings summed to 125, so it still floored
  at roughly twenty errors plus twenty warnings — bounded per family is not bounded per
  category.)
- **Changed: `density-crowd`, `density-overflow` and the verbose-chrome findings now count
  toward the grade.** They were surfaced to authors and silently ignored by the scorer, while
  `wall-of-text` — which measures nearly the same thing — was scored uncapped.
- **Changed: Pacing is `n/a` unless a talk length is set or the deck runs past 40 slides.**
  It read 100 on 196 of 197 decks while carrying 19% of the grade's weight.
- **Added: the Studio Coach names the profile it judged Style against, says whether that was
  declared or the default, and lets you view the deck through another profile.** The control
  overrides a declaration (it previously lost to one, which made it a silent no-op on exactly
  the decks that declare a profile); it is session-only and never rewrites your front matter.
  A misspelled `profile:` value is reported rather than swallowed.
