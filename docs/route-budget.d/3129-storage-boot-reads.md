studio: +993
playground: +10
home: +10
getting-started: +10
The Studio's storage fix (#3129): checkpoint-store loads one deck's versions instead of the whole store, studio-store keeps a list-title mirror so the deck list stops parsing every deck, saveSource reports a refused write, which StudioShell turns into a notice, and three checker rounds added the fallback, retry and read-failure handling that keep a failed read or reopen from hiding or dropping versions. Those are the studio-store and StudioIsland bytes, and they buy back about 0.9 s of a phone-speed boot on a full profile (engineering/decisions/2026-11-11-studio-storage-pointer-records.md §10). The other routes' +10 is StorageOverlay counting the new title key under deck sources.
