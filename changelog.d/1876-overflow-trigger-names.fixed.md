- **Fixed: the E2E chrome map named the ⋯ overflow trigger wrongly at tablet and
  desktop.** `CHROME.moreControls` claimed `'Menu'` was the trigger's accessible name at
  every breakpoint, and `CHROME.searchOverflow` claimed `'More controls'` appeared only
  while the inline search was open. The 2026-08-18 header pass had already made
  `'More controls'` the row's permanent right edge from 700px up, leaving `'Menu'` on the
  phone alone. Both docblocks now describe the measured behavior, and
  `overflow-trigger-names.spec.ts` pins which trigger exists at which width. The stale map
  is what made #1876 look like a reachability bug: all four tool panels — Coach, Chat,
  Library and Reader views — do open at 700, 820, 1024 and 1099, through that ⋯ menu.
