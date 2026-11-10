- **Fixed: closing a sheet returns focus to what opened it.** A modal Radix sheet returned focus
  only to a `SheetTrigger`, and most Studio sheets open from a plain button, so Escape on the
  phone's ⋯ menu (and the others) left focus on the page body. `SheetContent` now returns focus
  to the opener when nothing else has taken it since.
