---
description: "Investigate unexpected Thunder-G behavior, distinguish display issues from mail changes and prepare a reproducible report with private data removed."
---

# Recover from an unexpected result

Start with the smallest affected scope: one view, one conversation, one account
or one optional feature. Keep mail and profile backups intact. A display problem
is not a reason to delete a profile or recreate an account.

## Identify what changed

Record the client/version, Thunder-G version, installation method and switches.
Compare with the [compatibility table](../../../README.md#compatibility). Use System
theme, Classic layout and Table View for the intended baseline.

| Symptom | First check | Avoid |
| --- | --- | --- |
| Label absent beside a subject | Picker assignment and **In message list** visibility | Reapplying labels before checking visibility/scope |
| Sidebar label absent | Native Tags mode, **More**, unread-only mode and parent hierarchy | Deleting/recreating the definition |
| Search misses mail | Exact path, excluded Spam/Trash and local content availability | Assuming the server has no copy |
| Reader/reply does not open | Experimental switch, competing Conversations add-on, reopen from list | Installing multiple conversation handlers together |
| Draft does not show Saved | Native Drafts configuration and save error | Closing with Discard before securing the text |
| Snoozed mail does not return | Same account's Inbox/holding folder, online state and deadline | Clearing the reminder preference or deleting holding mail |
| Backup restore skips messages | Account identifiers, folder paths and Message-ID match | Treating a label backup as a full profile restore |

## Isolate presentation from mail actions

Temporarily disable an optional setting, reopen the affected view and record the
result. If necessary disable Thunder-G in Add-ons Manager to compare with the
native client. Disabling restores presentation but does not undo labels, sent
messages, imports or mail moves. It also stops the local snooze scheduler.

An ordinary new window/restart is a useful check for stale UI state. First save
wanted drafts through native save controls and let account operations finish.
For a controlled reproduction, prefer a separate test profile with fictional mail.

## When an operation partially succeeds

A preview is not a write, and a stored reminder is not proof of a completed move.
Check the result and actual folder membership. Preserve successfully applied
label assignments; backup restore/import can be previewed again to retry remaining
work. Review a fresh plan after message or label definitions change.

For snooze, inspect both source and holding folders before another attempt. For
writing, verify a saved draft and attachments before discarding a second editor.
Do not assume Undo is available for every native or cross-folder operation.

## Report a reproducible problem

Use the [issue tracker](https://github.com/vschiavoni/thunderbird-gmail-skin/issues).
A useful report contains:

```text
Client and exact version:
Operating system:
Thunder-G version (and commit for a local build):
Installation: released XPI / local build / old Python installer
Relevant switches and other mail add-ons:
Steps using fictional/redacted mail:
Expected result:
Actual result and exact error:
After reopening/restart:
With the affected option or Thunder-G disabled:
```

Review console output and screenshots before sharing: redact subjects, recipients,
account identifiers, private paths and credentials. Never upload a complete profile,
OAuth client JSON, tokens or an unreviewed label backup. The
[troubleshooting reference](../docs/troubleshooting.md) provides feature-specific
checks and [privacy](privacy.md) describes stored/exported data.
