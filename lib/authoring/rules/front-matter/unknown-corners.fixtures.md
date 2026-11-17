# `deck/unknown-corners`

A `corners:` value that is not one of the register's names (`cornersNames`). The deck renders as if the key were unset, so the
author's choice does nothing and nothing says so. Ported from lint-core's `unknown-corners`; the reading is
`pick: 'loose'`, `value: 'bare'` (lib/authoring/rules/front-matter/register-value.js says what each means).

A typo is reported; lint-core never offered a fix for this key, so neither does the port.

```md bad typo
---
corners: ⟦round⟧
---

# A slide
```

```md bad typo-near
---
corners: ⟦squaree⟧
---

# A slide
```

A trailing comment is not part of the value, as the engine reads it.

```md bad comment
---
corners: ⟦squaree⟧  # for the board
---

# A slide
```

A known name, in any case, is quiet.

```md good
---
corners: SQUARE
---

# A slide
```

A value that is not a bare name reads as none, as the engine reads it.

```md good not-a-name
---
corners: two words
---

# A slide
```

A block scalar's body is the author's text, not keys, so a line in it is never read.

```md good block-scalar
---
style: |
  corners: squaree
---

# A slide
```
