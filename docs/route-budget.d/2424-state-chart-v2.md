studio: +1036
playground: +13
home: +1
State chart v2 on Trama (#2424). The Studio's live lint is lint-core itself (HARD RULE #7), and it now carries the v2 state-chart grammar and its lint rules (`state-chart-v1-transition`, `state-chart-v1-tint`), beside the state-chart adapter and Trama's live pipeline (sticky wrap, the settle). Measured as a pair on main 873b4c5 before this ledger landed: +975 bytes gz. Given back first: the v1 state-chart pass (3,892 lines of transform, its own router and layout) is deleted, but that code never loaded on these routes' startup path, so it frees nothing here. The playground and home figures are compression noise in shared chunks. The playground HTML also grows 786 bytes, over its soft target: its inlined component docs carry the v2 grammar.
