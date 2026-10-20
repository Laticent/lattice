studio: +2719
Live sessions now share more than the text, and the Studio's always-loaded Live wiring grew to carry it: the
session look the host froze, the Library records a deck uses, what each member is doing, Present together,
narration on the call, Show me on a practice deck, and AI activity. CI's breakdown on ac29704: `StudioIsland` +1691 (the
controller state and the StudioShell hooks every session needs before anyone opens a panel) and
`finish-library` +585 (reading a finish record a session shares). The heavy parts stay lazy: the pointer
layer, `read-aloud`, the Live panel and the tours. Measured: CI +2144 on ac29704 against 23073cb; Show me
then added 403 bytes and AI activity 172, each measured locally as the same build against the same base
(b7a82b7) before and after it: +1923, +2326, +2498.
