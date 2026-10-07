// Tavola — live collaboration for one document, browser to browser.
// Tavola knows peers and bytes; the app knows screens. The transport and the document are
// passed in (the way Trama takes dagre), so the core has no dependencies.
// Design: engineering/decisions/2026-10-06-studio-live-collaboration.md (§4, §7.1).

export { type Cert, createHostKey, fingerprintOf, fromBase64Url, type HostKey, hostKeyFrom, loadHostKey, type SavedHostKey, saveHostKey, tokenId } from './hostkey.js';
export { FRAGMENT_KEY, formatFragment, formatLink, type LinkParts, mintLink, parseFragment, randomBytes, toBase64Url } from './link.js';
export { createMemoryNetwork, type MemoryNetwork } from './memory.js';
export { cleanName, PROTOCOL_VERSION } from './protocol.js';
export { createSession, DEFAULT_CAP, HANDOFF_GRACE_MS, type HostOptions, MAX_MESSAGE, type Session, type SessionOptions, type Succession, type TokenEntry } from './session.js';
export type { Clock, Color, Invite, Knock, LinkKind, LinkPath, Member, PeerId, Role, SessionState, Stage, Stream, Transport } from './types.js';
export { linkKind } from './types.js';
