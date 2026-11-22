# `deck/unknown-inline-code`

A `inline-code:` value that is not one of the register's names (`inlineCodeNames`). The deck renders as if the key were unset, so the
author's choice does nothing and nothing says so. Ported from lint-core's `unknown-inline-code`; the reading is
`pick: 'loose'`, `value: 'scalar'` (lib/authoring/rules/front-matter/register-value.js says what each means).

A typo close to one name is fixed to it.

```md bad typo
---
title: Q3
inline-code: ⟦richh⟧
---

# A slide
```

```md fixed typo
---
title: Q3
inline-code: rich
---

# A slide
```

A repeated key is read as its last line, as the engine reads it.

```md bad last-wins
---
inline-code: rich
inline-code: ⟦richh⟧
---

# A slide
```

```md fixed last-wins
---
inline-code: rich
inline-code: rich
---

# A slide
```

With no column-0 line, the first indented one stands in.

```md bad nested
---
pptx:
  inline-code: ⟦richh⟧
---

# A slide
```

```md fixed nested
---
pptx:
  inline-code: rich
---

# A slide
```

The value is read as the register reads it: quotes and a trailing comment are not part of it.

```md bad quoted
---
inline-code: "⟦richh⟧"  # the deck's register
---

# A slide
```

```md fixed quoted
---
inline-code: "rich"  # the deck's register
---

# A slide
```

A known name, in any case, is quiet.

```md good
---
inline-code: RICH
---

# A slide
```

A block scalar's body is the author's text, not keys, so a line in it is never read.

```md good block-scalar
---
style: |
  inline-code: richh
---

# A slide
```
