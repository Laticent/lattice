/**
 * The frame dock's global ceiling: at most this many preview frames exist across every pooled
 * surface of the Studio (frame-dock.tsx). A standalone module so the e2e oracles can import the
 * number without pulling in React or the Studio.
 *
 * TWO POOLS' WORTH. One pool never asks for more than `HARD_MAX_SLOTS` (28, preview-pool.tsx),
 * but two docked pools can be open at once: the deck panel is always mounted while Add slide or
 * Present's overview is up. A ceiling of one pool's worth let the second run dry, which is a
 * tile left blank, and a slot of the other identity rebuilt on every switch between them, which
 * is a fresh WebKit document each time — the cost the dock exists to stop. The ceiling only
 * bounds what can exist; frames are made on demand, so a session that never needs this many
 * never has them.
 */
export const DOCK_MAX_SLOTS = 56;
