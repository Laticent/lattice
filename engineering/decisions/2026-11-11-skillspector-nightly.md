---
status: shipped
summary: Agent skills are instructions an agent obeys, so a tampered skill is a supply-chain attack on every user who installs our agent kit. NVIDIA SkillSpector scans them statically for prompt injection, exfiltration, unpinned installs, tool poisoning and hidden Unicode. A nightly workflow scans `.claude/skills/` and the published `dist-kits` agent kit, excuses only findings a person reviewed (`.github/skillspector-baseline.yaml`, narrow rules with reasons), and files one rolling issue on anything else.
---

# SkillSpector nightly: scan every agent skill we ship

Owner decisions, 2026-11-11: a static-only nightly with a reviewed baseline (no LLM pass, no key,
$0). The unpinned `npx lattice` finding was first accepted on a false premise ("our own CLI"); with
the facts corrected, the owner set the direction: `@laticent/lattice` is the package on npm, so
the skills say `npx @laticent/lattice` (§3), and the package also ships a short `lat` command.

## 1. What SkillSpector is

[SkillSpector](https://github.com/NVIDIA/SkillSpector) (NVIDIA, Apache-2.0, released 2026-08) reads
an agent skill (a `SKILL.md` and anything bundled with it) before an agent loads it. It runs pattern
rules across prompt injection, data exfiltration, privilege escalation, excessive agency, supply
chain, MCP tool poisoning and rug pulls, YARA signatures, an AST and taint pass over bundled code,
and a Unicode integrity check. It returns a 0-100 risk score with a SAFE / CAUTION /
DO_NOT_INSTALL verdict. An optional LLM pass reads intent; we run with `--no-llm`. It never
executes the skill, so it cannot see runtime behavior.

## 2. Why we run it

Our agent kit (`dist/agent-kit/`, published to the `dist-kits` branch) is copied into users'
agents. A skill the agent obeys is a higher-trust input than code it merely reads. The scan gives
users a standing, public check that what we publish carries nothing hostile, and it catches the
two ways something hostile could arrive: an edit to a skill source on `main`, and a change to the
`dist-kits` orphan branch, which `publish-kits.yml` force-pushes outside PR review. That second
path is why the nightly scans the **published** copy rather than a fresh build.

## 3. The first scan (v2.13.4, static)

All 19 `.claude/skills/` scored 0. The agent kit's per-task files first scored 70
(DO_NOT_INSTALL) on 74 findings. Each was read; none was hostile:

| Rule | Count | What it matched | Disposition |
|---|---|---|---|
| RP1 MCP rug pull | 70 | `npx lattice …` with no `@version` | **A real risk, fixed at source.** On npm, unscoped `lattice` belongs to an unrelated publisher, so outside a Lattice project the line ran their code. All 69 lines now say `npx @laticent/lattice` (ours). Only the scoped name is excused, so a bare `npx lattice` creeping back fires |
| AR2 anti-refusal | 2 | "prints no warning", "no errors, no warnings" | **Reworded at source.** A rule on the bare phrase also excused a real "give the user no warning" (reproduced by the review) |
| YR4 YARA tool poisoning | 1 | a `<!-- describe: … -->` alt-text comment | Baseline: Lattice's accessibility syntax |
| AE4 Unicode / mixed script | 1 | the Greek Δ in "ΔE" in `theme.md` | **Fixed at source** (`design/skills/theme.md` now says "deltaE"), so the check stays live everywhere |
| AE1 incomplete analysis | 2 | the scanner could not fully parse `writing-a-deck.md` and `pick-a-layout.md` | Baseline: coverage notes, not hits. `pick-a-layout.md` was bisected: only the full generated catalog table trips it, and it holds no hidden characters or encoded text |

The second pass covered the rest of the kit. Five catalog sentences tripped AR2/EA2 ("no
warning", "without checking", "without asking") and were reworded at their sources (the
component and chart `.docs.md`, their manifests, and the chart-family README). The bundled
`review/check.mjs` raised 221 hits on ordinary JavaScript: 212 MP2 on `Uint8Array` lookup tables,
7 RA2 on `topLists`/`plist`, and 2 P6 on `return rules`. Each was read and excused by a rule
scoped to that file.

## 4. How it is built

- `tools/scan-skills.sh` (`npm run scan:skills`) scans one target per skill, because SkillSpector
  refuses `--baseline` on a `--recursive` scan: the 19 own skills and **every file in the agent
  kit an agent reads or runs**: its skills, the files an agent loads on its own (`repo/CLAUDE.md`,
  `AGENTS.md`, `lattice.mdc`, the plugin manifests), the paste-in folders, the component catalog
  (`components/`, `reference/`, `upload/`) and the bundled deck checker (`review/check.mjs`). A coverage floor exits 2 when a group is empty or a
  named target is missing, so a scan that covered nothing never reads as clean. It uses `--fail-on-findings`, so a finding outside
  the baseline counts at any severity, not only above the score threshold of 50.
- `.github/skillspector-baseline.yaml` uses **rules, not fingerprints**. A fingerprint hashes the
  scanner version and the whole file text, so any edit to a skill or any scanner bump would bring
  every excused finding back. A rule matches rule id + path + the matched text, and each rule
  names the exact phrase it excuses.
- `.github/workflows/skillspector-nightly.yml` runs at 06:47 UTC, after `publish-kits.yml`
  republishes at 06:29. It pins the scanner to a commit (`SKILLSPECTOR_REF`), merges every
  target's SARIF into ONE run (code scanning rejects several runs under one tool and category),
  uploads it, and files or appends one `[skillspector]`
  issue. It never closes that issue: a new baseline rule turns a night green without fixing
  anything (`test/unit/tools/nightly-alarm-contract.test.js`, `COMMENTS_ONLY`).

- **GitHub runs `run:` under `bash -e`.** A bare `scan | tee` exited the step on a finding before
  `found` was written, so no issue would ever have been filed. Found on a real PR runner, fixed with
  `|| RC=${PIPESTATUS[0]}`; the scan step also runs on `!cancelled()` so a failed install files
  "the scan did not complete" instead of passing in silence.

Proved on GitHub's ubuntu-24.04 runner through a temporary PR trigger, removed before merge:
pipx install on Python 3.12.3, 22 targets, `findings=1` (the Δ, still on `dist-kits` then), the
step surviving to record it, the SARIF upload "complete", and the job green.

## 5. Limits

- **The docs keep `npx lattice` where it is correct:** inside a project or a clone, npx runs the
  installed copy, and every page that uses it says so and names `npx @laticent/lattice` for
  outside one. Only the agent skills, which an agent may run anywhere, use the scoped form always.


- Static only. A skill that behaves differently at runtime, or text crafted to slip past the
  patterns, is out of reach. The LLM pass would read intent but would spend API budget nightly
  and send skill text to a provider; the owner declined it for now.
- The scanner pin does not move on its own; Dependabot cannot see it. Bump it in a PR that
  re-runs `npm run scan:skills` and reviews whatever is new.
- A baseline rule is an exception a reviewer signs. Keep each one scoped to a file and a phrase.
