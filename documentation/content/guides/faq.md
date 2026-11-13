---
description: "Answers to common Thunder-G questions about account requirements, client compatibility, labels, search, snooze, writing, privacy and installation."
---

# Frequently asked questions

## Does it require Gmail or a new account?

No. Thunder-G uses the accounts already configured in Thunderbird or Betterbird.
The optional Gmail label-name importer has its own Google setup; it is not needed
for labels, local search, the reader or snooze.

## Which clients and platforms work?

Use the [compatibility table](../README.md#compatibility) for the declared version
range and combinations actually tested. Admitting a version is not evidence that
every feature has been tested there. Betterbird has its own recorded
version/platform checks.

## Do I need Python, Node.js or Bun?

No, not to install a released XPI. The extension development workflow uses Python
and Node.js. Building this documentation website separately uses Bun and Python.

## Why can I not sort or resize the columns?

Column headers are hidden by default. Enable **Preferences → Inbox → Show column
headers**, make the native adjustment, then hide them again if desired. Sorting
and widths are retained. See [inbox customization](inbox-and-appearance.md).

## Are labels missing, hidden or deleted?

These are different states. Enable the native **Tags** folder-pane mode for the
Labels sidebar. Use **More** to reveal hidden entries, and check **In message list**
if a tag exists in the picker/sidebar but its chip is absent beside subjects.
Hiding a label does not remove its assignments. See the [visibility walkthrough](labels-workflow.md#keep-the-sidebar-and-list-readable).

## Why did a label change affect a sent reply too?

Tag operations resolve the conversation, including available sent replies, and
update its messages together. The active message can determine a numeric toggle's
starting state; it does not restrict the update to that one message. See
[label scope](labels-workflow.md#apply-an-existing-label) before bulk changes.

## Will labels and colored stars look the same on another device?

Not necessarily. Native keyword/tag synchronization depends on both the provider
and client; cross-client Exchange tag synchronization is unsupported. Colored
markers use a Thunder-G message property in addition to the native starred flag.
A label export does not transfer colored-star choices or all extension settings.

## Why are the reader and in-window editors absent?

They are experimental and off by default. Enable the relevant switches in Preferences,
disable the separate Thunderbird Conversations add-on, and reopen from the list.
The [reader and writing guide](conversations-and-writing.md) covers their separate switches.

## Did compaction remove messages from a long conversation?

No. With **Compact long conversations** enabled, six or more messages are initially
represented by the first message, last two and a counter for hidden middle messages.
The selected message and unread messages also remain visible. Click the counter to reveal the rest. This changes presentation only.

## Does snooze work when the client is closed?

The scheduler runs locally. Overdue reminders wait until the client is reopened
and online. This is not Gmail's native snooze, and a label backup does not migrate
scheduled reminders. See [snooze](snooze.md).

## Does snooze sync with Gmail or another client?

No. Thunder-G reminders, return-time ordering and the **Snoozed … ago** notice
belong to the profile that created them. IMAP folder moves can sync, but Gmail's
native snooze deadline and status do not. Connecting Google for label import does
not enable snooze synchronization. See [Gmail and other clients](snooze.md#gmail-and-other-clients).

## Why does a search miss an attachment or body phrase?

Operator searches do not download entire mailboxes. The necessary body/MIME content
must be available locally. Spam and Trash are excluded unless explicitly included.
Results are snapshots; submit again after synchronization. See
[search troubleshooting](find-and-organize-mail.md#when-expected-mail-is-missing).

## Does Gmail import restore all my message labels?

No. It copies custom label names and hierarchy only. To move native tags and
assignments between installations containing the same mail, use
[Export labels and assignments](moving-to-another-computer.md).

## Why does a sender logo not appear with DKIM Verifier installed?

An ordinary published DKIM Verifier installation does not supply the current local
integration prototype. BIMI also needs an aligned successful result and a usable
sender-published logo, and is off by default. See [sender logos](sender-logos.md).

## Is the homepage mail preview connected to my account?

No. It is a browser simulation with fictional messages. It does not load the
extension, connect to mail accounts or send email; changes reset on reload.
Its small set of controls is not a complete feature or compatibility test.

## How do I update, disable or report a problem?

Use [updates and maintenance](../docs/updates.md) for automatic updates, removal
and old-installer migration. For bugs, follow the
[report checklist](../docs/troubleshooting.md#report-a-reproducible-problem), recording
the client version, platform, relevant settings and exact steps. Redact private mail.
