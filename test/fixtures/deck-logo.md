---
marp: true
theme: indaco
logo: ./acme-logo.svg
---

<!-- _class: title -->

# Slide One

The convenience `logo:` directive should add `with-logo` to every slide
and inject `:root{--deck-logo:url("./acme-logo.svg")}` into the deck CSS.

---

# Slide Two

Body slide — also tagged because the default is `logo-on: all`.

---

<!-- _class: divider -->

## Slide Three

Divider slide — also tagged for the same reason.

---

<!-- _class: finish finish-aurora -->

## Slide Four

A FINISH slide, which is the case that caught a duplicate: the finish `.backdrop`
wrapper is injected into the same first-child slot, so a logo pass that identifies
"already has a mark" by position alone misses one that is sitting behind the wrapper
and stacks a second on top of it. Every deck in the corpus that regressed carried a
`finish:`; the two that did not, did not.
