// The TURN slot. Empty on purpose: the owner has not chosen a relay yet
// (engineering/decisions/2026-10-06-live-collaboration-roadmap.md §3.1 has the options, measured).
//
// Without TURN, two browsers connect only when a direct path exists. That holds for about 75–90 %
// of real sessions; the rest (strict office firewalls, symmetric NATs, some mobile carriers) see
// "Nobody answered". A TURN server relays those connections. To turn one on, list it here, and the
// Trystero adapter adds it after the public STUN servers. Credentials in this file ship in the
// public site bundle, so use a provider's short-lived credentials or a key restricted to this
// origin. A long-lived username and password here lets anyone spend the quota.

export type IceServer = { urls: string | string[]; username?: string; credential?: string };

export const LIVE_TURN: IceServer[] = [];
