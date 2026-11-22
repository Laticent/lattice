studio: +2619
playground: +347
home: +474
getting-started: +474
One side pane at a time (#3222), and the pane house style it led to. The Studio island grows by the one-slot pane state, the rail's last-used mark, Esc closing a docked pane, the shared header on every docked pane, the header reset (deck-reset.ts) and the readable rail labels; `settings-view` by the shared search row. `ui/panel.tsx`, which every route loads, grows by the drill-in chip `PanelHeader` draws when one pane opens another, and by `PanelSheet`'s open-focus rule (a sheet focuses itself, not a header action, so no tooltip pops on open). The search and reset buttons live in `ui/panel-actions.tsx` and the collapse icons with their callers, so neither reaches a route that never docks a pane. Numbers are CI's `per-PR allowance` figures for head 01af168; the commit after it moves the collapse icons out of `panel.tsx`, so these are an upper bound until CI re-measures.
