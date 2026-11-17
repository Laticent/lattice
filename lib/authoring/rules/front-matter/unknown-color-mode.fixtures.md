# `deck/unknown-color-mode`

A `color-mode:` value that is not one of the register's names (`colorModeNames`). The deck renders as if the key were unset, so the
author's choice does nothing and nothing says so. Ported from lint-core's `unknown-color-mode`; the reading is
`pick: 'top'`, `value: 'scalar'` (lib/authoring/rules/front-matter/register-value.js says what each means).

A typo close to one name is fixed to it.

```md bad typo
---
title: Q3
color-mode: ⟦lightt⟧
---

# A slide
```

```md fixed typo
---
title: Q3
color-mode: light
---

# A slide
```

A repeated key is read as its last line, as the engine reads it.

```md bad last-wins
---
color-mode: light
color-mode: ⟦lightt⟧
---

# A slide
```

```md fixed last-wins
---
color-mode: light
color-mode: light
---

# A slide
```

The value is read as the register reads it: quotes and a trailing comment are not part of it.

```md bad quoted
---
color-mode: "⟦lightt⟧"  # the deck's register
---

# A slide
```

```md fixed quoted
---
color-mode: "light"  # the deck's register
---

# A slide
```

A known name, in any case, is quiet.

```md good
---
color-mode: LIGHT
---

# A slide
```

A block scalar's body is the author's text, not keys, so a line in it is never read.

```md good block-scalar
---
style: |
  color-mode: lightt
---

# A slide
```

The register is read at column 0 only, so a nested key is not it.

```md good nested
---
pptx:
  color-mode: lightt
---

# A slide
```
