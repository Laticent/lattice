---
origin: 2570
priority: P1
recorded: 2026-10-07
source: engineering/decisions/2026-10-06-goldens-bot-blessed.md
---

# Goldens step 3: pull requests stop committing PDFs

```text
  P1 · [no ticket] Goldens rollout step 3: PRs stop committing PDFs.
       why now   — steps 1 and 2 (#2570) only add the PR render and the nightly bot.
                   PDFs still conflict in PRs until this lands (11 of 19 real conflicts).
       where     — the lint job in .github/workflows/ci.yml (a PR diff may hold no *.pdf,
                   except chore/golden-bless); lefthook pre-commit pdf-rebuild stops staging
                   PDFs; tools/golden-bless.mjs also renders committed deck markdown with no
                   PDF yet; CLAUDE.md HARD RULE #9 gets the owner-approved wording (decision
                   doc §2.3) and loses "The final PR commit includes all rebuilt PDFs";
                   CLAUDE.md rule 7 names the bless bot as a fourth machine PR class;
                   workflow.md § Feature decks and development.md's bless guidance match;
                   delete followups.d/2554-p2-gallery-pdfs-off-conflict-path.md.
       done when — a PR that changes a tracked PDF fails lint, and a feature PR shows its
                   deck through CI without committing it.
       evidence  — a throwaway PR committing a PDF goes red in lint; the bless bot's next
                   night commits a newly merged feature deck's PDF.
       verify    — tier 2: the lint check on a real PR; the adversarial trio before merge.
       blocked   — only after golden-bless.yml has blessed main once (decision doc §5).
```
