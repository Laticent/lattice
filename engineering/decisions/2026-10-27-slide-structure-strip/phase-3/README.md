# Evidence: phase 3, the slide menu, the keyboard model, drag, and the strip without its icon row

Screenshots of the real Studio on 2026-10-29, Chromium (Playwright), the default deck at the Write stop. The 820 and 390
shots use a touch screen. The P4 shots are from a production build (`npm run build:e2e`); the earlier ones from the
docs dev server.

| File | What it shows |
|---|---|
| `p1-menu-1440.png`, `p1-menu-820.png`, `p1-menu-390.png` | A slide's menu opened on slide 3 (right-click at 1440, a tap on the current slide at 820 and 390): five items in a fixed order, shortcuts shown on a fine pointer only |
| `p1-map-menu-1440.png` | The same menu on the slide map, from a right-click on tile 4 |
| `p2-focus-1440.png` | Keyboard focus on the current pill after Tab and two arrow presses, with its ⋯ beside it |
| `p2-shortcuts-1440.png` | The "?" list of keyboard shortcuts |
| `p3-drag-1440.png` | A mouse drag of slide 1 past slide 2: the floating copy, the landing bar, the faded original |
| `p4-strip-1440.png`, `p4-strip-820.png`, `p4-strip-390.png` | The pill strip with the icon row gone |
| `p4-map-1440.png`, `p4-map-820.png`, `p4-map-390.png` | The slide map with the icon row gone; on touch the ⋯ draws at 28px over a 48px hit area |

The scripts that took them live in the session's scratchpad, not here; each spec in `docs/e2e/strip-*.spec.ts` and
`docs/e2e/slide-ops.spec.ts` drives the same surface and asserts the behavior.

## After the owner's review, 2026-10-29

| File | What it shows |
|---|---|
| `v2-pill-390.png`, `v2-pill-820.png`, `v2-pill-1440.png` | The ⋯ as the current pill's right-hand segment, one shape with the pill (390 in dark mode, as the owner's iPhone) |
| `v2-menu-390.png`, `v2-menu-820.png`, `v2-menu-1440.png` | The menu with an icon per item, Move left and Move right, and Delete below a rule |
