# Back up labels and message assignments

Open **Add-ons Manager → Thunder-G → Preferences → Import/Export**. **Export labels and
assignments** creates one JSON file for moving Thunder-G labels to a new
Thunderbird setup after downloading the same mail again.

The file includes native tag keys, names, colors, nesting, order, sidebar and
message-list visibility, and the labels assigned to each identifiable message.
It contains account identifiers and Message-IDs, so keep it with your personal
backups. Message text, attachments, account credentials and other profile
settings are excluded. The file is not encrypted and does not configure accounts.

This backup transfers Thunderbird tags used by Thunder-G. It does not convert
them into Gmail's native labels. The separate [Gmail label importer](gmail-import.md)
copies Gmail label names and nesting, without message assignments.

## Export from the old computer

1. Open or synchronize the mail folders whose assignments you want to preserve.
2. In **Import/Export**, choose **Show accounts**, then select the account whose message
   assignments you want to export. **All accounts** is available as an explicit
   choice. Label definitions are shared across the profile and are always included.
3. Choose **Export labels and assignments** and save the file.
4. Check the result and any warnings. Messages without a usable Message-ID, or
   with an ambiguous ID in the same account and folder, are skipped. Unavailable
   folders are reported; open or synchronize them and export again if needed.

Export scans cached message headers only in the selected account, or across
configured mail accounts and local folders when you explicitly choose **All
accounts**. Showing the account list reads account identifiers only; it does not
scan mail. Export does not download message bodies or contact a backup service.
Virtual search folders are excluded to avoid exporting duplicate views.

## Restore on the new computer

1. Install Thunder-G, add the same mail accounts, and let Thunderbird download
   the message lists for the same folders. Message bodies can stay on the server.
2. In **Import/Export**, choose the JSON file, then **Preview restore**.
3. Review the labels to create, existing labels, conflicts, and matched, missing
   or ambiguous messages. Preview makes no label or message changes.
4. Choose **Restore labels** to apply the reviewed changes. Existing message
   labels are kept; the restore adds the missing assignments.

Matching uses the account's server type, hostname and username, the relative
folder name, and the message's Message-ID. Profile locations and Thunderbird's
local message numbers can change between computers; those numbers are not used
as portable message identities. Changed account details or folder names must
match the old setup for assignments to be found. Gmail's `imap.googlemail.com`
and `imap.gmail.com` hostnames are treated as the same host.

If a message is missing or has multiple possible matches in the same folder,
its assignments are skipped. Download the remaining message lists and preview
the same file again to retry. Already restored assignments are kept and do not
need to be added again.

Existing labels with a matching name are reused, including when their local
tag keys differ. Their current color, order and visibility are kept. New labels
receive the saved metadata. Conflicting names or keys block **Restore labels**;
resolve the conflict and generate a fresh preview before continuing.

## Changes during restore and partial results

A preview can be applied once. Choosing another file, cancelling, or leaving the
settings page discards it. Before restoring, Thunder-G checks the labels and
message matches again; a changed plan requires a fresh preview.

If a message disappears or cannot be updated during restore, the result reports
the failure. If restore stops partway through, changes already applied are kept.
Preview the same backup again to retry the remaining work. Restoring assignments
uses Thunderbird's native tags and can synchronize keywords with the mail
provider when supported.

## Limits

The current format supports files up to **16 MiB**, **10,000 labels**, **100
accounts**, **200,000 message assignments**, and **1,000 labels per message**.
One scan can examine up to **500,000 cached message headers** and **20,000
folders**. Exceeding a limit stops the operation rather than silently producing a
truncated backup. The preview shows up to 200 label rows; its totals include the
full file.

This is a label backup. For mail, account settings and the rest of the profile,
use Thunderbird's complete profile backup.

The preview never applies changes. It reports messages needing assignments separately from messages already assigned. **Done** means the backup is already satisfied in its matching folders, or the explicit restore completed without missing, ambiguous or failed messages. A copy in another folder is not automatically modified. The separate Gmail label-name importer is **Experimental**.
