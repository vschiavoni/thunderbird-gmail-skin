---
description: "Move Thunder-G label definitions and assignments to another setup using export, preview and restore. Distinguish label backups from full profiles."
---

# Move labels to another computer

Use the label backup for native label definitions and their message assignments.
Use a complete client profile backup for mail, account settings and the rest of
Thunderbird/Betterbird. These are different jobs.

## Choose the right tool

| Need | Tool | Does not transfer |
| --- | --- | --- |
| Copy native labels, visibility and matching assignments | **Export labels and assignments** | Bodies, attachments, passwords, snooze jobs, colored-star choices or other profile settings |
| Copy Gmail custom label names into native tags | Optional experimental **Import labels from Gmail** | Gmail message assignments, colors or ongoing synchronization |
| Preserve the whole local setup | The client's complete profile backup procedure | Not replaced by either label tool |

The label file is unencrypted JSON containing account identifiers and Message-IDs.
Store it with personal backups, not in a public issue or repository.

## The migration flow

Keep the original export until you have checked the restored labels. A restore
preview is a review step, not a promise that every source message exists locally.

Missing or ambiguous messages are skipped. Resolve name/key conflicts before
restoring; review skipped messages afterward rather than assuming a complete
profile migration.

## Export from the old setup

1. Open/synchronize the folders whose labels you want to carry over.
2. Open **Preferences → Import/Export** and choose **Show accounts**.
3. Select one account, or explicitly select **All accounts**. Label definitions
   are profile-wide and always included; the account choice scopes message assignments.
4. Choose **Export labels and assignments**, save the file, and review warnings.

Export reads cached message headers, not message bodies. An unavailable folder,
missing Message-ID or ambiguous message is reported rather than silently treated
as a portable match. Synchronize the affected folder and export again if needed.

## Preview on the new setup

1. Install the add-on and configure the same accounts.
2. Download the message lists for the same folders. Bodies need not be downloaded
   just to match the label backup.
3. In **Import/Export**, choose the saved JSON file and **Preview restore**.
4. Review labels to create/reuse, conflicts, and matched/missing/ambiguous messages.

Preview makes no changes. Matching uses server type, hostname, username, relative
folder path and Message-ID, not profile location or local message number. Changing
an account username or moving mail to different folders can prevent a match.
Gmail's `imap.gmail.com` and `imap.googlemail.com` hostnames are treated equivalently.

## Restore and verify

Choose **Restore labels** only after reviewing the preview. Existing assignments
are kept; the operation adds missing ones. A label with the same name can be reused
even when its native key differs. Reused labels keep their current metadata; new
labels receive the saved color, order and visibility.

Check a known nested label and messages in more than one folder afterward. A copy
of a message elsewhere is not automatically changed. Missing or ambiguous matches
are skipped; name/key conflicts block restore until resolved.

A preview is one-use and is checked again before writing. If mail or definitions
change, generate a new preview. Partial restores keep completed work. Preview the
same backup again to retry missing work; already satisfied assignments need not
be recreated.

The [backup reference](../docs/label-backup.md) lists format limits and exact result
semantics. A successful label restore is not proof that the entire mail profile
or all provider synchronization has completed.

## If the source is Gmail's own labels

Use [Gmail label import](../docs/gmail-import.md), which requires a separately
configured Google Desktop OAuth client. Keep **Dry run — preview only** enabled
while reviewing custom label names, required parents and the destination prefix
(default `GMAIL-Labels`). Uncheck Dry run and explicitly import only after the
preview is correct. Existing tags are not overwritten; partial imports can be
previewed and retried.

This imports definitions only. It neither labels the corresponding local messages
nor writes back to Gmail. Disconnecting clears the settings-session connection;
it does not revoke Google's consent grant or remove native labels already created.
