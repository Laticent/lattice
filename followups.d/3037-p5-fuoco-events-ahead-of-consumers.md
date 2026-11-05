---
origin: 3037
recorded: 2026-11-05
area: website
swimlane: engineering/decisions/2026-11-05-fuoco-event-channel.md
priority: P5
severity: low
deferred: blocked — needs builds 1 and 4 (assets and media cross the bridge).
---

# Fuoco event channel, build 5 (slice 3, the rest): the events that ship ahead of a reader

what      — `asset.*` (host-issued asset ids, never URLs) and `media.*` over the bridge; and the host-side families `editor.*`, `compose.*`, `selection.*`, `clipboard.*` (never the text), `shortcut.fired`, `drag.*`, `slide.moved`, `live.*` (the Live controller feeds the hub itself with `by: 'peer:<id>'`; nothing crosses Tavola), `coach.*` (stamped with the `rev` judged), `present.*` (emitter-debounced `slide-shown`), `stage.*`, `rehearsal.*` (the planner's real beat kinds), `lint.changed`. Small per-domain batches, as the owner asked, each under the ledger's consumer ratchet.
done when — every event has an emitter-level test and a ledger entry; the bridged ones (`asset.*`, `media.*`) also fire from the real preview in Chromium, WebKit and Firefox.
