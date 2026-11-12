---
description: "Learn what Thunder-G stores locally, which optional features contact external services and what label backups and diagnostic reports can contain."
---

# Privacy and local data

Thunder-G integrates with the mail client's interface and profile through a
privileged Experiment API. The manifest declares extension storage access; the
experiment provides broader native integration than an ordinary web page.
The bundled code has no telemetry, as stated in the [project overview](../../../README.md).
Normal account connections and mail synchronization remain the client's responsibility.

## Data kept by the feature

| Data | Location or scope | Important limit |
| --- | --- | --- |
| Feature switches, language, page size, preview trimming and star order | Extension-local settings in the profile | A label export is not a settings backup |
| Native label names, keys, colors and message assignments | Native tag service and message keywords | Provider/client support determines keyword synchronization |
| Sidebar and message-list label visibility | Profile preferences keyed by native tag key | Hiding is presentation, not deletion of assignments |
| Colored marker choice | Per-message `thundergStarMarker` property plus the native starred flag | Other clients may show only the flag |
| Snooze reminders | Profile preference `extensions.thunderg.snooze.v1` | Contains message/account/folder identifiers and reminder state; the client must run to process it |
| Snoozed mail | Each account's **Thunder-G Snoozed** folder | Moving mail may synchronize with the provider |
| Drafts | The account's native Drafts folder | Uses normal account synchronization and draft-saving settings |
| Label export file | The file location chosen by the user | Unencrypted account identifiers, label metadata and Message-IDs |
| Optional Google connection | Settings-session memory | See the connection lifecycle below |
| BIMI results | Bounded session cache, including absent results | One-hour cache; remote hosts may already have observed requests |

This is a feature-level inventory, not a complete inventory of the mail client's
profile, operating-system caches, logs or backups. Native mail and account settings
can retain data independently of the extension.

## Optional network features

### Gmail label import

Opening Preferences alone does not connect to Google. The importer requires an
explicit Desktop OAuth setup and sign-in. It requests OpenID email information
and the `gmail.labels` scope, whose consent wording permits reading/editing labels;
the implemented importer reads the verified account and label-list endpoints.
It does not call Gmail message endpoints or write Gmail labels.

Client fields and access tokens are not saved in extension storage or the password
manager. Tokens are discarded after the fetch. Verified email and fetched labels
remain in memory for the settings session; Disconnect, closing settings or disabling
the add-on clears them. Disconnect does not revoke the consent grant in the Google
account or remove tags already imported. See [connection setup and permissions](../docs/gmail-import.md).

### Sender logos

BIMI is off by default. Enabling it permits DNS discovery and advertised HTTPS SVG
downloads after the required aligned DKIM check. The image host can see the user's
IP address. No external logo directory is used. Disable the feature to stop new
requests and restore normal avatars. The [sender-logo guide](sender-logos.md)
explains the separate local DKIM integration requirement.

These options are independent of the client's general remote-content settings
and of ordinary IMAP/SMTP/provider connections.

## Before sharing a backup or diagnostic report

A label backup excludes bodies, attachments and credentials, but account identifiers,
Message-IDs and label names can still reveal private information. Keep it private.
A browser-preview screenshot uses fictional mail; a screenshot of your real client
may expose addresses, subjects, counts, account names and labels.

For a bug report, share the minimum reproduction, client/platform version, relevant
switches and a redacted error. Do not attach an entire profile, OAuth client JSON,
tokens or an unreviewed backup. Console logs may contain identifiers or server paths;
review them before posting.

## Disabling, removing and moving profiles

Disabling/removing the extension does not undo mail moves, native label assignments,
imports or sent messages. Return snoozed mail before relying on the client without
Thunder-G's scheduler. Preserve wanted drafts and make a full profile backup before
migration. Do not assume uninstall securely erases profile preferences or exported files.

Use the [maintenance instructions](../docs/updates.md) for XPI removal and older
Python-managed installations. For label-only transfer, use the
[migration walkthrough](moving-to-another-computer.md).
