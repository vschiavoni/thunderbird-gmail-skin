---
description: "Find mail with Thunder-G search operators for senders, labels, dates, attachments and folders. Includes query examples and local-content limitations."
---

# Gmail-style searches

Type an operator query in Thunderbird's top search box and press Enter. Thunder-G opens the results directly as a styled message list. Searches cover all configured mail accounts using local folders and downloaded messages. Download mail for offline use for complete body and attachment-name searches.

Plain text searches continue to use Thunderbird's indexed search. Operators, quoted phrases, grouping and exclusions use Thunder-G's query parser, for example subject:report budget.

| Operator | Example |
| --- | --- |
| Sender | from:team@example.invalid, from:me |
| Recipients | to:me, cc:team, bcc:support |
| Subject | subject:"meeting notes" |
| Native labels and nested paths | label:work/projects |
| Folder | in:inbox, in:sent, in:drafts, in:archive, in:snoozed |
| Spam, Trash, all locations | in:spam, in:trash, in:anywhere |
| Status | is:read, is:unread, is:starred |
| Attachments | has:attachment, filename:pdf, filename:"annual report" |
| Label presence | has:userlabels, has:nouserlabels |
| Colored markers | has:blue-star, has:purple-question |
| Dates | after:2026/01/01 before:2026/11/01 |
| Date aliases | newer:2026-01-01, older:2026-11-01 |
| Relative dates | newer_than:7d, older_than:6m, older_than:1y |
| Size | larger:10M, smaller:500K, size:1000000 |

Sizes use bytes or binary K/M/G units. size: means at least that many bytes. Date cutoffs use the computer's local timezone. me resolves to the identities configured in Thunderbird. Labels accept exact leaf names or complete native paths, including slashes.

## Combining terms

Spaces and AND require all terms to match the same message. OR and braces match alternatives. Use parentheses to group expressions and a leading minus sign to exclude a term or group.

    from:me label:work has:attachment newer_than:6m -subject:cancelled
    {from:team from:support} subject:(meeting -cancelled)
    (from:team OR from:support) filename:pdf larger:1M
    in:anywhere "exact phrase" -is:starred

Quoted phrases are searched as text. Unqualified words in an operator query search sender, recipients, subject and locally available body text. Results retain native message actions, label assignment and conversation opening.

Spam and Trash are excluded unless the query explicitly uses in:anywhere, in:spam or in:trash. A “Searching…” indicator stays visible while the query runs. Proven matches appear progressively; combined conditions and exclusions may need more time before a match can be confirmed. Results are a snapshot taken when the query runs. Submit the query again to refresh it.

## Scope

This version supports the operators above. Gmail-specific categories, importance, Drive searches, proximity (AROUND), exact-word (+), mailing-list and custom-header operators are outside this version. Unsupported operators produce an error.

Thunder-G does not download entire mailboxes to execute a query. Body and attachment-name results depend on the messages available locally. A folder or MIME read failure is reported as an error. A search can be cancelled by closing its results tab.

## Nested label names

Use `label:subtest` to match a label whose final path component is `subtest`, including `test/subtest`. If different parents contain a label with that same leaf name, the short form matches all of them. Use `label:test/subtest` to restrict the search to that exact full path. Matching is case-insensitive and exact: `subtest` does not match `subtesting`, and assigning a child label does not implicitly assign its parent. Ordinary text such as `subtest` without `label:` remains a message-text search.

### Wildcards in label names

Use `*` in a `label:` value to match zero or more characters, case-insensitively:

| Query | Matches |
| --- | --- |
| `label:bcca*` | Leaf names such as `bcca25`, `bcca26` and `confs/bcca26`. |
| `label:confs/bcca*` | Full label paths beginning with `confs/bcca`. |
| `label:*bcca*` | Leaf names containing `bcca`. |
| `school AND label:bcca*` | Messages with a matching label and the text `school`; eligible for label-first indexed search. |
| `-label:bcca*` | Messages without any matching label. |

Patterns without `/` match only the final component of each label path. Patterns containing `/` match the entire path; `*` may span additional path components. Matching covers the entire name or path, so `label:bcca*` does not match `my-bcca26`. Without `*`, matching remains exact. Only `*` is a wildcard: `?`, brackets and other punctuation are literal. Quote values containing spaces, for example `label:"conference papers/bcca*"`. Plain `bcca*` without `label:` remains a text query and does not select labels.

Wildcard expansion reads the label definitions once per native scan, then matches message tag keys. It does not change labels or assignments. The same matching works with local search and the experimental label-first index path.

Metadata-only queries (labels, addresses, subjects, dates, sizes, folder and read/star/attachment flags) evaluate their Boolean expression in one native local scan. Label keys are compiled once per scan. Outside the indexed paths described below, searches requiring body text or attachment filenames retain the progressive multi-condition path. This reduces repeated scans but does not establish real-mailbox latency; cached/offline availability and mailbox size still matter.

## Experimental indexed plain-text search

With experimental in-place search enabled, supported positive plain-text queries use Thunderbird’s Gloda index directly, retaining the same mail list. This avoids scanning every local message body on each query. The first batch shows up to 200 indexed candidates; **Load more** increases the request by 200 without changing Thunderbird’s global result-limit preference. The status distinguishes indexed results from a disabled/unavailable-index fallback. Initial batches may contain fewer visible messages if indexed entries have been deleted or belong to excluded folders; Load more remains available if the backend reported additional candidates.

Index matching is tokenized, not an exact substring guarantee. Recent messages, unindexed folders and incomplete indexing can be absent; zero results do not prove that no matching message exists. Short ordinary terms, negated text, OR involving text and mixed queries without a label constraint continue to use the local engine. Metadata-only operators continue to use live headers, including labels and read/unread state, without relying on potentially stale indexed metadata.

Leaving or replacing a query detaches its collection listener, ignores late callbacks and stops live collection updates. The underlying bounded Gloda database query may finish in the background: this adapter does not claim to interrupt SQLite or force reindexing. It neither creates a second index nor changes indexer preferences. Real-mailbox first-result time, completion time, result completeness and memory use still require profiling before merging this experiment.

Label-and-text conjunctions such as `school AND label:cuso` filter live label assignments first, then query the full-text index using only those message IDs. Nested labels accept their full path or leaf name. Candidate IDs are batched to bound query size; the result limit is applied after label filtering. Unindexed messages can still be absent. OR/negated text and unsupported short terms retain local search.

### Which queries use which search path?

These rules apply only when **Search in the current mail tab (experimental)** is enabled and Thunderbird’s global index is enabled and available. “Local fallback” means the query is still supported, but uses the existing local search engine rather than this index optimization. It can be slower and body/filename matching depends on downloaded mail.

| Query example | Execution path | Reason |
| --- | --- | --- |
| `school` or `school project` | Full-text index | Positive text terms combined with AND (spaces also mean AND). |
| `"winter school" label:cuso` | Live label filtering → full-text index | A quoted phrase can be combined with a label. |
| `school label:cuso is:unread after:2026/01/01` | Live metadata filtering → full-text index | Additional metadata conditions are allowed alongside a label. |
| `school (label:cuso OR label:teaching)` | Live metadata filtering → full-text index | OR is allowed inside the metadata-only filter. |
| `school -label:cuso` | Live metadata filtering → full-text index | A label exclusion is also a valid filter; it may narrow candidates less effectively. |
| `label:cuso is:unread` | One native metadata scan | No full-text search is needed. |
| `school OR project` or `(school OR project) label:cuso` | Local fallback | OR involving message text is not handled by the indexed planner. |
| `school OR label:cuso` | Local fallback | Text and metadata cannot be split into an AND filter. |
| `-school label:cuso` | Local fallback | Negated message text is not handled by the indexed planner. |
| `AI label:cuso` or `school AI label:cuso` | Local fallback | Every text term must meet the index eligibility rule; ordinary one- and two-character terms do not. |
| `school is:unread` or `school from:alice@example.org` | Local fallback | Mixed text/metadata queries currently need at least one label condition to use the hybrid path. |
| `school label:cuso filename:pdf` | Local fallback | Filename matching uses the local attachment-search path. |
| `subject:school label:cuso` | One native metadata scan | Field-qualified subject text is metadata, not an unqualified full-text term. |

For indexed eligibility, each unqualified text term or phrase must contain at least three JavaScript UTF-16 code units. The native index also accepts certain one- and two-character non-Latin terms (the current check requires each code unit to be at least U+2000). A term containing an embedded double quote, or exactly uppercase `NEAR` / `NEAR` followed by a slash and digits, falls back to local search. These are implementation eligibility checks, not additional search operators.

With the experimental setting off, this optimization is not used. With the setting on but the index disabled or unavailable, eligible queries use local search and display a fallback notice. Unrecognized operators still produce an error as described above; that is different from a supported query using a slower execution path.
