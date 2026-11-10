studio: +170
home: +57
Two fixes, read from the failing log's per-PR allowance. single-slide-render (+57, studio and home) now publishes each
full write's load so a render that starts while it is still loading waits and patches it, instead of writing the whole
preview again on a first visit. architect (+113, studio) fills the chat chip's model name and price when the prefetched
catalog lands late, and waits out a 30 s backoff after a failed fetch. Nothing was given back; both are under the 2KB free bytes.
