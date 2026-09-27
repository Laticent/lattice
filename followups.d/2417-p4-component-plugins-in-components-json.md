---
origin: 2417
priority: P4
recorded: 2026-09-27
---

# Project a component's `plugins` block into `dist/docs/components.json` and the pick list

why now   — #2417 gave the component manifest `plugins: { requires, optional }` and the `math`
            slide class declares `requires: ["math"]`. But the machine record that tools and
            agents read (`dist/docs/components.json`, `dist/docs/components.pick.md`) does not
            carry the field, so an agent choosing `math` cannot see that it depends on a plugin.
            Checked 2026-09-27 on `main` at d6ebd26: the math entry has no `plugins` key.
where     — the build step that writes `dist/docs/components.json` (find it via
            `engineering/capabilities.md`), and its schema or tests.
done when — the math entry in `components.json` carries `plugins: { requires: ["math"] }`, the
            pick line names the plugin, and a test fails if the projection drops the field.
evidence  — the math entry from the rebuilt `components.json`, pasted into the PR body.
verify    — tier 0 gates, because it is an additive, generated projection with a test.
