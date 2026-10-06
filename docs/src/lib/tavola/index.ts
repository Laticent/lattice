// Tavola — live collaboration for one document, browser to browser.
// Tavola knows peers and bytes; the app knows screens. The transport and the document are
// passed in (the way Trama takes dagre), so the core has no dependencies.
// Design: engineering/decisions/2026-10-06-studio-live-collaboration.md (§4, §7.1).

export { createHostKey, fingerprintOf, type HostKey, loadHostKey, type SavedHostKey, saveHostKey } from './hostkey';
export { FRAGMENT_KEY, formatFragment, formatLink, type LinkParts, mintLink, parseFragment, randomBytes, toBase64Url } from './link';
export { createMemoryNetwork, type MemoryNetwork } from './memory';
export { cleanName, PROTOCOL_VERSION } from './protocol';
export { createSession, DEFAULT_CAP, type HostOptions, MAX_MESSAGE, type Session, type SessionOptions, type TokenEntry } from './session';
export type { Clock, Color, Invite, Knock, Member, PeerId, Role, SessionState, Stage, Stream, Transport } from './types';
