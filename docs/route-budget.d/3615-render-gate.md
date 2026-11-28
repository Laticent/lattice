studio: +73
home: +73
The preview host (the Studio's, and the home page's live preview, which loads the same renderer) now carries `data-lattice-gate`, the step the newest render waits on, so the iOS panes probe can name
where a stalled first render stopped (followups.d/3368-p1). Nine `markGate(n)` calls with numeric steps and a short
attribute name, cut from +148: the frame scheduler's state report was dropped to fit.
