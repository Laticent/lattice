- A rendered page now ships only the categorical texture `<pattern>` sets its theme
  actually references, instead of all 92 on every page whatever the theme. A deck on a
  hue-carried palette (`indaco`, `carta`, `mustard`, …) drops 23,157 B per page; `onyx`,
  `concrete` and the `a11y-*` palettes drop ~11 KB. Rendered output is otherwise
  byte-identical — an unreferenced `<pattern>` paints nothing — and `section.print`
  keeps its set on every theme.
