- **The Studio chat names more failures correctly.** A model that drops mid-reply now says
  the provider had an error instead of "No reply came back". A request too long for the model
  says so instead of retrying as a one-shot that fails the same way. A rate limit between tool
  rounds says to wait instead of "the connection dropped", and a moderation refusal no longer
  says to reconnect. Stopping a turn while the model was writing an edit now records that
  round's cost. (`docs/src/components/studio/chat-agent.ts`, `ai/architect-model.js`)
