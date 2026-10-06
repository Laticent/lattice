// The wire. Every message is one tag byte then a payload:
//   0 = control (UTF-8 JSON, below)   1 = document stream   2 = awareness stream   3 = app posts
// Tavola decides who may send and receive each; it never parses stream or post bytes.

import type { Color, Invite, Member, Role } from './types';

export const TAG_CONTROL = 0;
export const TAG_DOC = 1;
export const TAG_AWARENESS = 2;
export const TAG_POST = 3;

/** Bumped on any incompatible change; a peer ignores a hello from another version. */
export const PROTOCOL_VERSION = 1;

export type Control =
	/** host → a peer that is not a member: who is hosting and what (§4.2), signed with the key the
	 *  link names (`key` is the raw public key, `sig` signs host id → recipient id; hostkey.ts). */
	| { t: 'hello'; v: number; invite: Invite; key: string; sig: string }
	/** guest → host: let me in. `token` re-admits a member who dropped; `client` is the awareness
	 *  client id this browser will speak for (the host binds it in the roster). */
	| { t: 'knock'; name: string; token?: string; client?: number }
	/** host → guest: you are in, and here is who else is. */
	| { t: 'admit'; role: Exclude<Role, 'host'>; color: Color; token: string; members: Member[] }
	/** host → guest: no. */
	| { t: 'deny'; reason: 'denied' | 'full' }
	/** host → every member, on any change: who is in. Accepted only from the host. */
	| { t: 'roster'; members: Member[] }
	/** host → a member: you were removed. */
	| { t: 'removed' }
	/** host → every member: the session is over. */
	| { t: 'end' }
	/** member → member: send me your full state (closes the roster race; see session.ts). */
	| { t: 'sync' }
	/** member → host: send me your roster (a member's link to me came back; is it still in?). */
	| { t: 'roster?' };

const enc = new TextEncoder();
const dec = new TextDecoder();

export function frame(tag: number, payload: Uint8Array): Uint8Array {
	const out = new Uint8Array(payload.length + 1);
	out[0] = tag;
	out.set(payload, 1);
	return out;
}

export function encodeControl(msg: Control): Uint8Array {
	return frame(TAG_CONTROL, enc.encode(JSON.stringify(msg)));
}

/** The control message in `payload`, or null when it is not one Tavola knows. */
export function decodeControl(payload: Uint8Array): Control | null {
	let msg: unknown;
	try {
		msg = JSON.parse(dec.decode(payload));
	} catch {
		return null;
	}
	if (!msg || typeof msg !== 'object') return null;
	const m = msg as Record<string, unknown>;
	switch (m.t) {
		case 'hello':
			// Another version's hello keeps only its version: its shape is not ours to trust.
			if (typeof m.v === 'number' && m.v !== PROTOCOL_VERSION) return { t: 'hello', v: m.v, invite: { title: '', hostName: '' }, key: '', sig: '' };
			return typeof m.v === 'number' && isInvite(m.invite) && typeof m.key === 'string' && typeof m.sig === 'string' ? { t: 'hello', v: m.v, invite: cleanInvite(m.invite), key: m.key, sig: m.sig } : null;
		case 'knock':
			return typeof m.name === 'string' && (m.token === undefined || typeof m.token === 'string') ? { t: 'knock', name: cleanName(m.name), token: m.token as string | undefined, ...(isClient(m.client) ? { client: m.client } : {}) } : null;
		case 'admit':
			return (m.role === 'edit' || m.role === 'view') && isColor(m.color) && typeof m.token === 'string' && Array.isArray(m.members) && m.members.every(isMember) ? { t: 'admit', role: m.role, color: m.color, token: m.token, members: m.members as Member[] } : null;
		case 'deny':
			return m.reason === 'denied' || m.reason === 'full' ? { t: 'deny', reason: m.reason } : null;
		case 'roster':
			return Array.isArray(m.members) && m.members.every(isMember) ? { t: 'roster', members: m.members as Member[] } : null;
		case 'removed':
			return { t: 'removed' };
		case 'end':
			return { t: 'end' };
		case 'sync':
			return { t: 'sync' };
		case 'roster?':
			return { t: 'roster?' };
		default:
			return null;
	}
}

/** Characters that reorder or hide text: a name carrying them can render as someone else's. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control characters is the point.
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g;

/** Names are shown to other people: drop control, bidi and zero-width characters, collapse
 *  whitespace, cap at 40, never empty. */
export function cleanName(name: string): string {
	const n = name.replace(INVISIBLE, '').replace(/\s+/g, ' ').trim().slice(0, 40);
	return n || 'Guest';
}

/** The invite is shown in a stranger's lobby before anything is verified about them: keep it short. */
function cleanInvite(i: Invite): Invite {
	return { title: i.title.slice(0, 120), hostName: cleanName(i.hostName), ...(typeof i.slides === 'number' && Number.isFinite(i.slides) ? { slides: Math.max(0, Math.floor(i.slides)) } : {}), ...(typeof i.theme === 'string' ? { theme: i.theme.slice(0, 40) } : {}) };
}

const isClient = (c: unknown): c is number => Number.isSafeInteger(c) && (c as number) >= 0;
const isColor = (c: unknown): c is Color => c === 1 || c === 2 || c === 3 || c === 4;
const isRole = (r: unknown): r is Role => r === 'host' || r === 'edit' || r === 'view';
function isMember(x: unknown): x is Member {
	const m = x as Member;
	return !!m && typeof m.id === 'string' && typeof m.name === 'string' && isRole(m.role) && isColor(m.color) && (m.client === undefined || isClient(m.client));
}
function isInvite(x: unknown): x is Invite {
	const i = x as Invite;
	return !!i && typeof i.title === 'string' && typeof i.hostName === 'string' && (i.slides === undefined || typeof i.slides === 'number') && (i.theme === undefined || typeof i.theme === 'string');
}
