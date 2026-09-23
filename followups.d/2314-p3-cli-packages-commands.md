---
origin: 2314
priority: P3
recorded: 2026-09-23
source: https://github.com/Laticent/lattice/pull/2314
---

# Add `lattice packages list|add|export|remove` over ~/.lattice (phase 4)

Spec: `engineering/decisions/2026-09-23-portable-packages.md`.

```text
why now   — the CLI can't use anything made in the Studio today.
where     — lattice-emulator.js; ~/.lattice/packages with LATTICE_HOME + --packages overrides; .lattice project embeds packages/.
done when — a Studio-made theme renders from the CLI after `packages add`; a missing package fails with its name.
evidence  — a CLI transcript and the rendered PDF.
verify    — integration tier.
```
