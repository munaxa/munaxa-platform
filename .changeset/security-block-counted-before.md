---
'@munaxa/security': patch
---

Rate limiter: an adaptive block no longer refuses a request that was counted within the limit before
the violation that recorded the block (same fixed window, lower atomic count). Under concurrency a
request counted fifth could read the block the eleventh had just written, so 9 of 10 were admitted
(NF-3). Blocks are now stored as `{ until, windowStart, current }`; the earlier bare-number format is
still read and applies to every request.
