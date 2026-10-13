// Labels shared by the lazy chat agent (chat-agent.ts) and the panel (ArchitectChat.tsx).
// Its own import-free module so the panel can read them WITHOUT importing the agent, which
// is lazy on purpose (see the header of chat-agent.ts).

/** The status line between a round starting and its first token. */
export const THINKING = 'Thinking…';
