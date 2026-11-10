studio: +229
home: +49
Two fixes, read from the failing log's per-PR allowance. single-slide-render (+49, studio and home) now publishes each
full write's load so a render that starts while it is still loading waits and patches it, instead of writing the whole
preview again on a first visit. architect (+180, studio) fills the chat chip's model name and price when the prefetched
catalog lands late, backs off 30 s after a failed fetch, and schedules the fill for when the backoff ends. Nothing was
given back; both are under the 2KB free bytes.
