---
origin: 2620
priority: P4
recorded: 2026-10-09
area: engine
severity: low
swimlane: engineering/decisions/2026-10-07-first-npm-release.md
---

# Run `lattice completion powershell` once in Windows PowerShell 5.1, on Windows

why now   — #2620 shipped Tab completion for four shells. PowerShell was tested in pwsh 7.4 on
            Linux through TabExpansion2 (45/45, including an npm-style `lattice.ps1` launcher and
            the fallback path), and PSScriptAnalyzer's Windows 10 / 5.1 profile found 0 syntax,
            command or type problems. Nobody has run it live in Windows PowerShell 5.1, the
            shell most Windows users have. Two run-time differences are untested: 5.1's legacy
            native-argument passing (it mangles an argument holding a literal `"`), and npm's
            real `lattice.cmd` / `lattice.ps1` launchers. A one-off Windows runner from the
            #2620 session was refused by its permission policy.
where     — lib/cli/complete.js `powershellScript`; the pwsh arm in
            test/unit/cli/completion.test.js ("PowerShell: through TabExpansion2") holds the
            cases to run.
done when — on a Windows machine, after `npm install -g` of a packed tarball (or a clone with a
            `lattice.cmd` on PATH), `lattice completion powershell | Out-String |
            Invoke-Expression` in Windows PowerShell 5.1, then TabExpansion2 on: `lattice --pa`,
            `lattice --palette=indaco`, `lattice --disable-plugin mermaid,m`, `lattice --output=o`,
            `lattice my` (a `my deck.md` beside it), `lattice packages un`, `lattice pack` (with a
            `packages\` folder beside it). Each gives what the pwsh arm expects; then the same in
            `pwsh` on Windows. Widen or narrow the docs' PowerShell claim to match the result.
evidence  — the TabExpansion2 output for each line, both shells, pasted in the PR.
verify    — tier 0: a reproduction on the real surface is the evidence. Adding a Windows CI job
            for it instead is a CI-contract change, so the owner decides.
