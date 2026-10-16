studio: +64
The always-loaded half of the Live session (use-live-session.ts) gained the two call actions' stubs (`leaveCall`, `pickMic`), and the idle view model gained the `call` state the panel and the header pill read. CI measured +46 bytes; declared +64 for gzip variation.
Given back first: everything else in the call (mic capture, playback, the speaking meter via Suono, the call row) loads with the session code, only when a session starts or a link is opened.
