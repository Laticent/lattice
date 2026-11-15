studio: +843
playground: +159
home: +164
getting-started: +164
One side pane at a time (#3222). The Studio island grows by the one-slot pane state, the rail's last-used mark and Esc closing a docked pane with focus kept on a control (+673). `ui/panel.tsx`, which every route loads, grows by the drill-in chip that `PanelHeader` draws when one pane opens another (+169). Numbers are CI's `per-PR allowance` figures for head 99affd4.
