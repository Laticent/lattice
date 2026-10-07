---
origin: 2447
priority: P2
recorded: 2026-09-28
area: infra
severity: low
swimlane: design/skills/cli.md
source: https://github.com/Laticent/lattice/pull/2447
---

# Ship the CLI skill in the kit's Claude Code plugin

why now   — design/skills/cli.md reaches the kit's skills/ folder and the npm package,
            but the kit's Claude Code plugin (plugin/ and repo/skills/) still installs
            only the lattice-decks skill, so a Claude Code user who copies the plugin
            gets deck authoring without the render/share/check workflow
where     — tools/build-agent-kit.mjs: pluginFiles() and the repo/ + plugin/ skill
            writes near the end of the build; test/unit/tools/agent-kit-structure.test.js
done when — dist/agent-kit/plugin/skills/lattice-cli/SKILL.md (and repo/ twin) exist,
            carry name + description front matter within the 200-character cap, are
            generated from design/skills/cli.md rather than hand-copied, and the kit
            structure test pins them
evidence  — the generated SKILL.md, and a Claude Code session in a scratch project that
            loads it (`/skills` lists lattice-cli)
verify    — tier 0 gates plus the kit structure test, because it is a build-output
            addition with no render path
