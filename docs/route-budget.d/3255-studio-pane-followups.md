studio: +151
playground: +154
The split hook (`use-resizable-split.ts`, in the `lazy-panel` chunk both routes share) gains the settled-resize branch that puts a docked pane back to its width after the window shrinks and grows (it came back at 371px instead of 320), the set that remembers a drag made while a side was collapsed, and the `lattice:split-resize-settled` event its tests wait on. About 150 gzipped bytes of logic; nothing to give back without dropping the fix or one of the two guards the checker asked for.
