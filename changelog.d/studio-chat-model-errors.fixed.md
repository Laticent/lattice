- **The Studio chat says why a model request failed.** A failure such as a rejected key, an
  account out of credits, a model that isn't available, or a network error used to show
  "No change suggested.", because the chat retried as a one-shot request, which reports
  every failure as an empty reply. It now names the cause and what to do about it, and it
  retries as a one-shot only when the model refused the chat's tools.
  (`docs/src/components/studio/chat-agent.ts`)
