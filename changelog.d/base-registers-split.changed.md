- **The ten deck-level front-matter registers now live in `lib/base/base.registers.docs.md`.**
  `mode:`, `finish:`, `split:`, `stamp:` / `tone:`, `spectrum:` / `spectrum-edge:`, `rule:`,
  `eyebrow:`, `headline:`, `lift:` and `corners:` — with a table at the top naming what each
  one selects and its default. Nine of them were nested under `base.docs.md` § `sketch`, a
  **per-slide variant**: `mode: sketch` is how you turn sketch on deck-wide, so the first
  register landed there fairly and eight more followed it one at a time. A reader looking for
  `headline:` had no reason to open a section about handwriting.
- **`lib/base/base.docs.md` drops 24,504 → 15,171 tokens**, which matters because HARD RULE #6
  makes it a mandatory read before authoring a base modifier. The move is mechanical: nine of the
  ten register bodies are byte-identical to what left, with only the heading level changed, and
  the tenth (`eyebrow:`) carries a one-line edit because it pointed at a section that stayed
  behind. The other falsified cross-reference (a `tone-*` variant pointing at the `stamp:` /
  `tone:` registers "above") now names its file too.
- **The two files together are 25,610 — about 1,100 MORE than before.** The frequent read got a
  third cheaper and the rare one became findable; a reader who needs both pays slightly more.
  The per-slide tokens the registers resolve to (`corners-square`, `lifted`, `sketch-clean`,
  `stamp-notch`, `spectrum-*`) are named in `base.docs.md` so they stay greppable in the file
  HARD RULE #6 actually sends you to.
- Routing follows the content — `CLAUDE.md`, `design/skills/finish.md` and
  `design/design-system.md` point register questions at the new file.
