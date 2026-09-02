- **Changed: HARD RULE #9's demo-deck requirement now triggers on the rendered
  surface, not on the word "feature".** A change a human can see on a slide — a
  layout, modifier, token, theme or chart — still ships `examples/<slug>.md` and its
  PDF, because the deck is how a reviewer sees it. Work that renders no new or
  changed slide surface (tooling, CI/infra, export plumbing, a byte-identical perf
  change, docs) does not, and owes its evidence in the PR body instead. The rule as
  written said "every feature or visual-bug branch", which described a practice the
  repo does not have: of the last 40 commits, 19 touched `lib/` or `themes/` and 6
  shipped a deck. `CLAUDE.md` and `engineering/workflow.md` now state the same
  trigger.
