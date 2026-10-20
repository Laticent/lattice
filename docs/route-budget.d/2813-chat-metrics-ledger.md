studio: +800
Measured +759 to +760 bytes against successive bases as main moved; declared with a little headroom so a base shift of a few bytes does not fail the gate again.
The spend ledger (per-day, per-deck charges in ai/spend.js, read by the chat metrics dropdown), the saved-chat usage/trace/compaction types and the trace-aware `saveChat` in studio-store.ts, and the shell's `setSpendDeck` effect are on the Studio's startup path because the shell and the chat header read them. The dropdown, Show work dialog, compaction code and its prompt are lazy chunks and add nothing here.
