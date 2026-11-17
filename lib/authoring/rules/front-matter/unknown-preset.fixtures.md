# `deck/unknown-preset`

A `preset:` value that is not one of the register's names (`presetNames`). The deck renders as if the key were unset, so the
author's choice does nothing and nothing says so. Ported from lint-core's `unknown-preset`; the reading is
`pick: 'top'`, `value: 'scalar'` (lib/authoring/rules/front-matter/register-value.js says what each means).

A typo close to one name is fixed to it.

```md bad typo
---
title: Q3
preset: ⟦classicc⟧
---

# A slide
```

```md fixed typo
---
title: Q3
preset: classic
---

# A slide
```

A repeated key is read as its last line, as the engine reads it.

```md bad last-wins
---
preset: classic
preset: ⟦classicc⟧
---

# A slide
```

```md fixed last-wins
---
preset: classic
preset: classic
---

# A slide
```

The value is read as the register reads it: quotes and a trailing comment are not part of it.

```md bad quoted
---
preset: "⟦classicc⟧"  # the deck's register
---

# A slide
```

```md fixed quoted
---
preset: "classic"  # the deck's register
---

# A slide
```

A known name, in any case, is quiet.

```md good
---
preset: CLASSIC
---

# A slide
```

A block scalar's body is the author's text, not keys, so a line in it is never read.

```md good block-scalar
---
style: |
  preset: classicc
---

# A slide
```

The register is read at column 0 only, so a nested key is not it.

```md good nested
---
pptx:
  preset: classicc
---

# A slide
```
