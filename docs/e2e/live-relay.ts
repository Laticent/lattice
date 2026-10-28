// A Nostr relay inside the test process, so a two-browser Live session runs with no network.
//
// The Studio's transport (Tavola over `trystero/nostr`) finds peers by publishing signed events to
// public Nostr relays and subscribing to the same topic; the WebRTC connection that follows is
// direct. `context.routeWebSocket` answers every `wss://` socket the page opens from here instead,
// with no upstream server, so the relays never see the session and CI never depends on them. The
// WebRTC half stays real: two browser contexts on one machine connect over host candidates.
//
// Only the slice of NIP-01 that Trystero speaks: `EVENT` (acknowledged with `OK`, then delivered
// to every matching subscription on the same relay URL), `REQ` (answered with `EOSE`; nothing is
// stored, since Trystero subscribes `since: now`) and `CLOSE`. A filter matches on `kinds` and on
// the `#x` topic tag, the two fields Trystero sets. Signatures are not checked: the room password
// already encrypts the offers, and this relay only carries them between two pages of one test.
import type { BrowserContext, WebSocketRoute } from '@playwright/test';

type Filter = { kinds?: number[]; '#x'?: string[] };
type NostrEvent = { id: string; kind: number; tags: string[][] };
type Client = { ws: WebSocketRoute; subs: Map<string, Filter[]> };

const matches = (ev: NostrEvent, filters: Filter[]) =>
	filters.some((f) => (!f.kinds || f.kinds.includes(ev.kind)) && (!f['#x'] || ev.tags.some((t) => t[0] === 'x' && f['#x']?.includes(t[1]))));

export type LocalRelay = {
	/** Route every `wss://` socket `context` opens to this relay. Call before the page loads. */
	attach(context: BrowserContext): Promise<void>;
	/** Events relayed so far: a witness that the session's signaling really went through here. */
	readonly events: number;
};

export function localRelay(): LocalRelay {
	// One room per relay URL, as on the real network: a client on relay A never hears relay B.
	const rooms = new Map<string, Set<Client>>();
	let events = 0;
	const serve = (ws: WebSocketRoute) => {
		const room = rooms.get(ws.url()) ?? new Set<Client>();
		rooms.set(ws.url(), room);
		const me: Client = { ws, subs: new Map() };
		room.add(me);
		ws.onClose(() => room.delete(me));
		ws.onMessage((raw) => {
			let msg: unknown;
			try {
				msg = JSON.parse(String(raw));
			} catch {
				return;
			}
			if (!Array.isArray(msg)) return;
			const [type, ...rest] = msg as [string, ...unknown[]];
			if (type === 'EVENT') {
				const ev = rest[0] as NostrEvent;
				events++;
				ws.send(JSON.stringify(['OK', ev.id, true, '']));
				for (const c of room) for (const [sub, filters] of c.subs) if (matches(ev, filters)) c.ws.send(JSON.stringify(['EVENT', sub, ev]));
			} else if (type === 'REQ') {
				const [sub, ...filters] = rest as [string, ...Filter[]];
				me.subs.set(sub, filters);
				ws.send(JSON.stringify(['EOSE', sub]));
			} else if (type === 'CLOSE') me.subs.delete(rest[0] as string);
		});
	};
	return {
		attach: (context) => context.routeWebSocket(/^wss:\/\//, serve),
		get events() {
			return events;
		},
	};
}
