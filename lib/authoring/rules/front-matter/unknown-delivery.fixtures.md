# `deck/unknown-delivery`

A `delivery:` value that is not one of the register's names (`deliveryNames`). The deck renders as if the key were unset, so the
author's choice does nothing and nothing says so. Ported from lint-core's `unknown-delivery`; the reading is
`pick: 'loose'`, `value: 'scalar'` (lib/authoring/rules/front-matter/register-value.js says what each means).

A typo close to one name is fixed to it.

```md bad typo
---
title: Q3
delivery: ⟦restrainedd⟧
---

# A slide
```

```md fixed typo
---
title: Q3
delivery: restrained
---

# A slide
```

A repeated key is read as its last line, as the engine reads it.

```md bad last-wins
---
delivery: restrained
delivery: ⟦restrainedd⟧
---

# A slide
```

```md fixed last-wins
---
delivery: restrained
delivery: restrained
---

# A slide
```

With no column-0 line, the first indented one stands in.

```md bad nested
---
pptx:
  delivery: ⟦restrainedd⟧
---

# A slide
```

```md fixed nested
---
pptx:
  delivery: restrained
---

# A slide
```

The value is read as the register reads it: quotes and a trailing comment are not part of it.

```md bad quoted
---
delivery: "⟦restrainedd⟧"  # the deck's register
---

# A slide
```

```md fixed quoted
---
delivery: "restrained"  # the deck's register
---

# A slide
```

A known name, in any case, is quiet.

```md good
---
delivery: RESTRAINED
---

# A slide
```

A block scalar's body is the author's text, not keys, so a line in it is never read.

```md good block-scalar
---
style: |
  delivery: restrainedd
---

# A slide
```
