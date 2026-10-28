---
origin: 2900
priority: P3
recorded: 2026-10-26
area: infra
severity: low
swimlane: engineering/workflow.md
source: https://github.com/Laticent/lattice/pull/2900
---

# CodeQL's C# analysis fails on every branch cut before the repo's first C# file

why now   — `Analyze (csharp)` fails with "No source files found" on any PR whose branch
            predates a45a89a (#2852, 2026-10-22), which added the repo's only C# file,
            `tools/office-conformance/openxml-check/Program.cs` (a 28-line .NET checker for
            exported .pptx files). CodeQL here is GitHub's default setup (no workflow file), so
            it analyzes C# on every PR now that `main` has some. Found by the session driving
            #2869, verified in #2900. 36 open PRs were opened before 10-22 (an upper bound: a
            rebased one passes). The check is not required, so nothing is blocked.
where     — the repository's code-scanning default setup (Settings → Code security), not a
            file. Changing it is a repo-setting and CI-contract decision: the owner's.
done when — the owner has picked one, and it is applied or recorded:
            A. no change (recommended): every branch cut since 10-22 is already clean and the
               set of old ones only shrinks;
            B. drop C# from default setup's languages: stops scanning a checker that never
               ships;
            C. an advanced CodeQL workflow with a paths filter: a new workflow every PR pays for.
evidence  — the owner's answer; for B or C, a pre-10-22 branch's checks with no C# failure.
verify    — tier 0: a setting or a decision, no code.
