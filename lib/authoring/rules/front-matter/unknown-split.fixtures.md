# `deck/unknown-split`

A `split:` value that is not one of the register's names (`splitNames`). The deck renders as if the key were unset, so the
author's choice does nothing and nothing says so. Ported from lint-core's `unknown-split`; the reading is
`pick: 'loose'`, `value: 'bare'` (lib/authoring/rules/front-matter/register-value.js says what each means).

A typo close to one name is fixed to it.

```md bad typo
---
title: Q3
split: ⟦rulee⟧
---

# A slide
```

```md fixed typo
---
title: Q3
split: rule
---

# A slide
```

A repeated key is read as its last line, as the engine reads it.

```md bad last-wins
---
split: rule
split: ⟦rulee⟧
---

# A slide
```

```md fixed last-wins
---
split: rule
split: rule
---

# A slide
```

With no column-0 line, the first indented one stands in.

```md bad nested
---
pptx:
  split: ⟦rulee⟧
---

# A slide
```

```md fixed nested
---
pptx:
  split: rule
---

# A slide
```

The value is read as the register reads it: quotes and a trailing comment are not part of it.

```md bad quoted
---
split: "⟦rulee⟧"  # the deck's register
---

# A slide
```

```md fixed quoted
---
split: "rule"  # the deck's register
---

# A slide
```

A known name, in any case, is quiet.

```md good
---
split: RULE
---

# A slide
```

A value that is not a bare name reads as none, as the engine reads it.

```md good not-a-name
---
split: two words
---

# A slide
```

A block scalar's body is the author's text, not keys, so a line in it is never read.

```md good block-scalar
---
style: |
  split: rulee
---

# A slide
```
