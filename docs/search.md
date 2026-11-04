# Gmail-style searches

Type an operator query in Thunderbird's top search box and press Enter. Thunder-G opens the results directly as a styled message list. Searches cover all configured mail accounts using local folders and downloaded messages. Download mail for offline use for complete body and attachment-name searches.

Plain text searches continue to use Thunderbird's indexed search. Operators, quoted phrases, grouping and exclusions use Thunder-G's query parser, for example subject:report budget.

| Operator | Example |
| --- | --- |
| Sender | from:alice@example.com, from:me |
| Recipients | to:me, cc:alice, bcc:bob |
| Subject | subject:"meeting notes" |
| Native labels and nested paths | label:teaching/os26 |
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

Sizes use bytes or binary K/M/G units. size: means at least that many bytes. Date cutoffs use the computer's local timezone. me resolves to the identities configured in Thunderbird. Labels use their complete native name, including slashes.

## Combining terms

Spaces and AND require all terms to match the same message. OR and braces match alternatives. Use parentheses to group expressions and a leading minus sign to exclude a term or group.

    from:me label:teaching has:attachment newer_than:6m -subject:cancelled
    {from:alice from:bob} subject:(meeting -cancelled)
    (from:alice OR from:bob) filename:pdf larger:1M
    in:anywhere "exact phrase" -is:starred

Quoted phrases are searched as text. Unqualified words in an operator query search sender, recipients, subject and locally available body text. Results retain native message actions, label assignment and conversation opening.

Spam and Trash are excluded unless the query explicitly uses in:anywhere, in:spam or in:trash. A “Searching…” indicator stays visible while the query runs. Proven matches appear progressively; combined conditions and exclusions may need more time before a match can be confirmed. Results are a snapshot taken when the query runs. Submit the query again to refresh it.

## Scope

This version supports the operators above. Gmail-specific categories, importance, Drive searches, proximity (AROUND), exact-word (+), mailing-list and custom-header operators are outside this version. Unsupported operators produce an error.

Thunder-G does not download entire mailboxes to execute a query. Body and attachment-name results depend on the messages available locally. A folder or MIME read failure is reported as an error. A search can be cancelled by closing its results tab.
