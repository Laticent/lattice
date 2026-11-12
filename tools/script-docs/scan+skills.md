---
group: Lint & audit
---
Scan every agent skill (`.claude/skills/` + the agent kit) with NVIDIA SkillSpector, static-only, and report findings `.github/skillspector-baseline.yaml` does not excuse; needs `skillspector` on PATH (install line in `tools/scan-skills.sh`), runs nightly as `skillspector-nightly.yml`.
