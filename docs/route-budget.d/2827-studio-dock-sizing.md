studio: +850
playground: +560
home: +40
The Studio's dock sizing contract (dock-layout.ts) and the fold logic added to the shared `useResizableSplit` hook ship in shared chunks. CI read studio +801 (mode-catalog +512, StudioIsland +254, panel-shells +9), playground +538 (mode-catalog +512) and home +26 (palette-label +26); the declared figures leave room for gzip spread. The mode-catalog growth is where Rollup placed the new module, not a change to mode-catalog itself, and the palette-label +26 was not traced to a source change in this PR.
Given back first: the contract is one 60-line pure function with no dependency beyond the existing preview-rect constants, and the fold logic reuses the hook's collapse and restore paths rather than a second state machine.
