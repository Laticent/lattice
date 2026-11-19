// ANSWER THE WAITING MESSAGE AFTER CONNECTING. An author who asks the chat something with no model connected is
// sent to connect one (Workspace → AI). Before this, their message then sat in the thread unanswered: OpenRouter's
// sign-in reloads the page and the Studio did not reopen the chat, so the author came back to a question with no
// reply and asked again (seen by the owner on an iPhone, PR #3317). Now the chat marks the deck that is waiting,
// and answers that message as soon as a model is ready: at once for a key typed in Workspace, or after the
// sign-in's reload, when the Studio also reopens the chat.
//
// sessionStorage, because the mark must survive the sign-in's full-page round trip and nothing longer: a mark left
// from yesterday must not fire a paid turn by itself. Every access is guarded: private modes and blocked storage
// throw, and then the author simply asks again, as before.

const KEY = 'lattice-chat-answer-after-connect';

/** Remember that `deckId`'s last message is waiting for a model. */
export function markAnswerAfterConnect(deckId: string): void {
	try {
		sessionStorage.setItem(KEY, deckId);
	} catch {
		/* storage unavailable: the author asks again */
	}
}

/** Whether `deckId` has a message waiting for a model. */
export function hasAnswerAfterConnect(deckId: string): boolean {
	try {
		return sessionStorage.getItem(KEY) === deckId;
	} catch {
		return false;
	}
}

/** Take (read and clear) the mark for `deckId`: true at most once per mark, so the waiting message is answered once. */
export function takeAnswerAfterConnect(deckId: string): boolean {
	try {
		if (sessionStorage.getItem(KEY) !== deckId) return false;
		sessionStorage.removeItem(KEY);
		return true;
	} catch {
		return false;
	}
}
