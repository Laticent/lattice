studio: +6
playground: +2
The chart row record is read by the pill pass in the engine (`ownsRecordSpan` in lib/core/chart-rows.js), which both routes load eagerly; the readers, the HTML bridge and the schema-driven detail rule load with the chart kernels, so the eager growth is a few bytes of glue. Nothing was given back: both routes were already over their soft targets, so the bytes are declared here, and the growth is small (the Compose twin of the ownership check is the largest part).
