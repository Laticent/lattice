studio: +68
playground: +6
home: +2
getting-started: +2

Button names now contain their visible text (WCAG 2.5.3, Label in Name), which axe-core 4.14 checks by
default: "Lattice — workspace launcher", "Search or run ⌘K, command palette" with `aria-keyshortcuts`,
"Reader view: <the view shown>" built from the active lens, "H1 heading" / "H2 section" for the Compose
format buttons, "Search the docs, ⌘K" in NavActions, and "Prev, previous slide" in the playground. The
bytes are those strings, plus the review's `data-demo="search"` hook and the `Meta+K Control+K` shortcut list
(StudioIsland +37, lens-picker +31, PlaygroundIsland +3, NavActions +2); nothing can be given back without
dropping a label the rule needs or the hook the welcome tour points at.
