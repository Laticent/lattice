studio: +16
Suono's `unlock()` now leaves an iOS `play-and-record` audio session in place (one comparison), so read-aloud started during a live call no longer ends the call's microphone. Suono loads eagerly for read-aloud. CI measured +9 bytes; declared +16 for gzip variation.
Given back first: nothing else to give back; the call's own fix lives in the lazily loaded session code.
