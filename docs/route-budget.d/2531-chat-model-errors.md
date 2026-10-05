studio: +64
The chat's startup code changed one fallback string ("No change suggested." became "Nothing
came back.", shorter) so that an empty model reply no longer reads as the model declining.
Everything else in this PR is in the lazy chat-agent chunk. CI measured +25 B with a longer
string; after shortening it, consecutive local builds measured +4 B and +6 B against main —
gzip noise from the changed chunk, which shrank in raw bytes. Declared with the same 64 B noise
margin as 2508.
