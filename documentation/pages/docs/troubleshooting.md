---
description: "Diagnose Thunder-G layout, label, search, conversation, draft and snooze problems. Find checks to run before changing stored mail or profile data."
---

# Troubleshooting

Start by checking your Thunderbird/Betterbird and Thunder-G versions against the
[compatibility table](../../../README.md#compatibility). Use the built-in System
theme, Classic layout and Table View. Menu names may differ with your client’s language.

## I cannot sort, resize or choose columns

Column headers are hidden by default. Enable **Show column headers** in
**Add-ons Manager → Thunder-G → Preferences → Inbox**. This restores the headers
and column picker without changing the saved sort order or widths.

Column widths use the native client settings. Use the column picker rather than
legacy Error Console layout scripts for current installations.

## The conversation reader or inline replies do not appear

Thunder-G’s reader and in-window replies are experimental and off by default.
Disable the separate Thunderbird Conversations add-on before enabling **Use
Thunder-G’s conversation reader** or **Reply in this window** in Preferences.
Open the message again from the list after changing readers. See the
[conversation settings](settings.md#conversations) before combining options.

Sent replies depend on locally available mail. A newly sent reply can become a
native conversation card when Thunderbird saves or synchronizes its Sent copy;
accounts that do not save a Sent copy cannot provide that update.

## Label changes affect a different scope than expected

In the list, **L** updates the conversations containing the selected messages. In Thunder-G’s conversation
reader, it acts on the complete resolved conversation, including sent replies.
Wait for conversation loading to finish; retry unresolved conversations. A mixed
checkbox means only some messages have that label. Cross-folder writes may
partially succeed: inspect the reported failures before retrying.

Clicking a chip opens matching mail; its **×** removes that tag from the resolved
conversation. Numeric shortcuts use the active message to determine the toggle
state and apply the update conversation-wide. See [labels](labels.md).

## Nested labels or chips are missing

Enable Thunderbird’s **Tags** folder-pane mode for the sidebar tree. Nesting is
derived from full native tag names such as `Work/Project`. Missing intermediate
parent tags place a child under its closest existing ancestor; create the parent
tags if you want every level displayed.

The sidebar’s **Show/Hide in message-list rows** option can hide chips while
keeping assignments. Check that setting before reapplying a tag.

## Labels do not synchronize to another client

Thunder-G uses native Thunderbird tags. Synchronization depends on the mail
provider and the other client; Exchange cross-client tag synchronization is not
supported. Gmail import copies custom label names and hierarchy once. It does
not synchronize Gmail assignments or import messages.

## A snoozed conversation has not returned

Keep Thunderbird running and online. If it was closed or offline at the deadline,
Thunder-G retries when it runs again. Its messages are held in **Thunder-G Snoozed**
in the same account; sent originals remain in Sent. Moving or deleting a held
message manually cancels its reminder. Disabling the extension stops the scheduler;
the holding folders remain available to recover messages manually.

This is managed by Thunder-G, independently of Gmail's native Snoozed view.
It requires no Google API authorization or external scheduling service.

## Sender logos do not appear

BIMI downloads are off by default and require the explicitly patched local DKIM
provider described in the [integration guide](../integrations/README.md).
Installing ordinary DKIM Verifier is insufficient. Even with the bridge, missing
or invalid logos leave the usual avatar; contact photos take priority. Enabling
logos permits remote downloads. See [sender-logo settings](settings.md#sender-logos).

## Google connection or Gmail import fails

Use your own Desktop OAuth client, check consent-screen test users and any
Workspace restrictions, and keep Thunderbird’s native external-browser OAuth
setting enabled. Review the [Gmail import guide](gmail-import.md) for connection
limits and conflicts. After a partial import, generate a fresh preview: paths
already created are skipped. Never include OAuth client files or tokens in a report.

## An update is missing or an old installation looks wrong

Check that the client version is compatible and use **Check for Updates** in
Add-ons Manager. Old Python-managed CSS and the previous extension ID need the
[migration procedure](updates.md#migrating-an-older-installer-managed-profile).
Do not repeatedly reinstall over an unresolved legacy installation.

## Report a reproducible problem

Open an issue in the [project tracker](https://github.com/vschiavoni/thunderbird-gmail-skin/issues)
with:

- Operating system, exact Thunderbird/Betterbird version and Thunder-G version.
- Installation method: released XPI, local build or legacy Python installer; for a local build, include the commit if known.
- Relevant settings, reader choice and other enabled add-ons.
- Steps to reproduce, expected behavior and actual behavior; say whether it persists after a restart.
- Relevant errors from **Tools → Developer Tools → Error Console**, plus an anonymized screenshot if layout matters.

Remove message bodies, addresses, subjects, credentials and private profile paths
from diagnostics before sharing them. You can disable Thunder-G temporarily to
compare behavior; record the result. Do not delete your profile or mail to diagnose
a display problem.
