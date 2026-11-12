# Performance review — 1 November 2026

Changes are on `codex/performance-reactiveness`, based on 0.22.1.

## Findings and fixes

- Localized text bindings weakly referenced their element but strongly retained its child text node. The child retained its parent, defeating collection. Both targets are now weak. An incremental sweep examines at most four bindings per newly registered binding, releasing dead records during normal use without a background timer.
- Draft badges subscribed to global mail changes. Unrelated arrivals, deletions and moves scheduled full Drafts metadata rebuilds and sender-cell rewrites. Filter those events by the affected folders, retaining conservative refreshes for unknown events and folder topology changes.
- The bounded Sent cache was invalidated by unrelated mailbox changes. Scope message notifications to the cached Sent folders, retaining count checks, expiration, shutdown cancellation and conservative invalidation for unknown events.
- Every conversation lookup rebuilt a reference-to-Sent-message index over the same cached metadata. Keep one weakly owned index per immutable candidate snapshot. Matching still follows exact Message-ID/References, including transitive replies.
- Global keyword/security notifications rebuilt the visible conversation even for unrelated messages. Refresh only for a matching physical message or Message-ID. Direct changes to the visible conversation still update immediately.

## Validation

295 JavaScript tests and 14 Python tests pass. Added checks cover unrelated mailbox events, relevant moves, cache invalidation, reference-index reuse, localization cleanup and live language changes. Built the XPI and checked the patch for whitespace errors.

An isolated Node garbage-collection experiment created 2,000 localized elements with parent/child links, dropped application references and forced collection across eight event-loop turns. Before: 2,000 targets remained reachable through the binding registry. After: zero remained. This demonstrates the reference-lifetime fix; it is not a measurement of Thunderbird's total memory savings.

Operation-count tests: 100 unrelated inbox notifications cause no additional Sent scan and schedule no draft rebuild. After indexing 5,000 Sent candidates once, 20 repeated conversation lookups inspect only the matched candidate's references rather than all 5,000 candidates each time.

## Review boundaries

Reviewed message-list row work, draft metadata, Sent discovery, conversation observers, native body resize cleanup, pagination observers, preview queue bounds, localization lifetimes, and backup/restore scanning. Existing preview queue bounds, startup cleanup, native MIME/editor behavior and backup cancellation remain unchanged. Full Sent scans still occur on cache misses; snapshots above the existing 10,000-item retention limit are not cached. Those policies were retained to avoid silently losing conversations or increasing retained memory.

No end-to-end latency percentage or long-session heap measurement is claimed. Sustained everyday use is needed to assess perceived responsiveness and find any remaining bottlenecks.
