---
description: "Choose between Thunder-G operator search, native indexed search, label views and Quick Filter. Includes examples and checks for missing results."
---

# Find and organize mail

Thunder-G adds operator queries to the top search box and keeps native mail
commands available in the results. Queries use locally available mail across
configured accounts; the selected Inbox is not a restriction on their scope.

## Documentation search versus mail search

**Ctrl+K** (Windows/Linux) or **Command+K** (macOS) on this website focuses the
documentation search. It searches guide titles, headings and text, not your mail.
Use arrow keys to select a result, Enter to open it and Escape to dismiss results.

The homepage demo's search filters fictional messages only. To search your real
mail, use the top search box inside Thunderbird or Betterbird as described below.

## Choose the right search

| Task | Use |
| --- | --- |
| Open all mail with one existing tag | Click its label chip or sidebar entry |
| Combine sender, label, date or attachment conditions | An operator query in the top search box, followed by Enter |
| Search plain text using the client's index | Plain text in the top search box |
| Narrow the current native message-list view | The client's Quick Filter controls |

A chip opens an exact native tag view. Operator queries use Thunder-G's parser;
plain text retains the client's indexed search. These paths have different local
data/index requirements, so an empty result in one is not proof that mail is absent.

## Queries for common tasks

Enter these in the top search box, replacing names and paths with your own:

| Find | Query |
| --- | --- |
| Recent project attachments | `label:"Work/Project A" has:attachment newer_than:30d` |
| PDFs from either of two senders | `(from:team@example.invalid OR from:support@example.invalid) filename:pdf` |
| Unread Inbox mail | `in:inbox is:unread` |
| Large sent attachments | `in:sent from:me has:attachment larger:10M` |
| Postponed mail | `in:snoozed` |
| Mail without a user label | `has:nouserlabels -in:sent` |
| Include Trash and Spam explicitly | `in:anywhere subject:"booking confirmation"` |
| A particular colored marker | `has:blue-star` |

Spaces combine conditions with AND: every condition must match the same message.
Use `OR` or braces for alternatives, parentheses for groups and `-` for exclusions.
`me` uses configured identities. Dates use the computer's local timezone; sizes
use bytes or binary K/M/G units. Label paths use their complete native names.

Do not confuse `is:starred` with a specific colored marker. The first matches
starred mail generally; `has:blue-star` selects that Thunder-G marker.

## Review results before bulk actions

Wait while **Searching…** is displayed. Matches may appear progressively; queries
with combined conditions or exclusions can take longer to confirm. Results are a
snapshot: submit the query again after mail or assignments change.

Open a result to inspect it before selecting several messages for tagging,
archive or delete. Label changes can extend to resolved conversations and sent
replies; see [label scope](labels-workflow.md#apply-an-existing-label).

**Inbox → Always show search results as a list** is on by default. Turn it off
for the client's timeline/faceted view on new global searches. It does not rewrite
the client's global search preferences.

## When expected mail is missing

1. Check the full label name and quoted phrases.
2. Add `in:anywhere` if Spam or Trash should be included; both are excluded by default.
3. Open or synchronize the expected folder. Body and attachment-name searches
   need the corresponding message content available locally.
4. Run the query again. A folder or MIME read failure is reported as an error;
   it is not an empty successful result.
5. If using a plain-text indexed search, check the client's indexing status.

The extension does not download entire mailboxes to satisfy an operator query.
Close its results tab to cancel a search. Unsupported operators produce an error;
Gmail categories, importance, Drive search, `AROUND`, custom-header and mailing-list
operators are outside the implemented set. See the [operator reference](../docs/search.md).
