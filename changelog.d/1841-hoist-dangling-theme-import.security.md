- **Security: a theme import the registry cannot resolve is dropped, not hoisted
  to the top of the composed sheet.** `ThemeStore.resolveThemeImports` leaves an
  unknown or cyclic theme-name import in place, where CSS ignores it — but
  `composeCss`'s `hoistImports` then lifted every surviving quoted import to
  position 0 precisely so it would survive the "@import must come first" rule.
  At position 0 the browser resolves a bare name as a relative URL and fetches
  it, so composition turned a reference the registry had already declined into a
  live request. The judgment decodes CSS escapes first, so `@import '\61 rdesia'`
  — which the raw-byte resolver cannot match but the browser reads as `ardesia` —
  is dropped too. Real `@import url(…)` and quoted-path imports still hoist
  unchanged, and all 32 shipped themes compose byte-identically.
