/**
 * The frame dock's global ceiling: at most this many preview frames exist across every pooled
 * surface of the Studio (frame-dock.tsx). A standalone module so the e2e oracles can import the
 * number without pulling in React or the Studio.
 */
export const DOCK_MAX_SLOTS = 28;
