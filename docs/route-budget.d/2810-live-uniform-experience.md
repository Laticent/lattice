studio: +2144
Live sessions now share more than the text, and the Studio's always-loaded Live wiring grew to carry it: the
session look the host froze, the Library records a deck uses, what each member is doing, Present together,
and narration on the call. CI's breakdown: `StudioIsland` +1691 (the controller state and the StudioShell
hooks every session needs before anyone opens a panel) and `finish-library` +585 (reading a finish record a
session shares). The heavy parts stay lazy: the pointer layer, `read-aloud` and the Live panel. Measured by
CI on a7714ec against 23073cb; an earlier run on 0e17e6e against b7a82b7 measured +2035, and a local build
+1923.
