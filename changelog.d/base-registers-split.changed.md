- **The ten deck-level front-matter registers now live in `lib/base/base.registers.docs.md`.**
  `mode:`, `finish:`, `split:`, `stamp:` / `tone:`, `spectrum:` / `spectrum-edge:`, `rule:`,
  `eyebrow:`, `headline:`, `lift:` and `corners:` — with a table at the top naming what each
  one selects and its default. Nine of them were nested under `base.docs.md` § `sketch`, a
  **per-slide variant**: `mode: sketch` is how you turn sketch on deck-wide, so the first
  register landed there fairly and eight more followed it one at a time. A reader looking for
  `headline:` had no reason to open a section about handwriting.
- **`lib/base/base.docs.md` drops 24,504 → 14,991 tokens**, which matters because HARD RULE #6
  makes it a mandatory read before authoring a base modifier. Nothing was rewritten: all ten
  register bodies are byte-identical to what left, only the heading level changed, and the two
  positional cross-references the move falsified ("see *Eyebrow labels* above", "see *The
  `stamp:` / `tone:` registers* above") now name their file.
- Routing follows the content — `CLAUDE.md`, `design/skills/finish.md` and
  `design/design-system.md` point register questions at the new file.
