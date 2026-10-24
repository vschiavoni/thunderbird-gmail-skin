<div align="center">
  <img src="docs/resources/logo.png" height="100px">
  <p>
<h3>Thunder-G</h3></p>
 <p><i>An experimental, independently developed Gmail-inspired skin for Thunderbird.  </i></p>
 <p><img src="https://img.shields.io/github/v/release/vschiavoni/thunderbird-gmail-skin"/></p>
</div>

> [!NOTE]
> This independent project is not affiliated with Google and requires no Gmail account. It works with your existing email provider.
> Cross-client synchronization of Exchange tags is not supported.
> Compatibility with Windows and Linux has not yet been verified.

A compact inbox, existing tags as colored chips before the subject, and a conversation reader with a Back button and message actions.

Current version: **0.14.0**. Installable package: `thunder-g-0.14.0.xpi`. The companion accepts **Thunderbird 153–158.x**.

Tested on macOS with **Thunderbird 158.0.1** and **Betterbird 153.5.0**
(Betterbird testing reported by the maintainer). Renderer hooks were inspected
against Thunderbird 158.0.1. This does not imply that every feature has been
verified on both clients; Windows and Linux remain unverified.

Release history and detailed changes are in [CHANGELOG.md](CHANGELOG.md).

## What is included

- Automatic light/dark shell, responsive pencil/Write button, and yellow stars.
- Native tag chips, searchable Labels menu, and gray snippets from locally available mail.
- Column headers are hidden by default; enable **Show column headers** in Thunder-G settings → Inbox to sort, resize, or choose columns.
- Hidden From/Subject header text; native column visibility and order are respected. UI font size follows Thunderbird.
- Single-click reading in the current tab; Back restores the list; Previous/Next navigate.
- Archive, spam, delete, unread, Move, Labels, and a Follow-Up clock in the reader.
- Return to the full list after archiving, with the native preview collapsed.
- Native quick-filter chips and row actions for archive, delete, and read/unread.
- Optional Conversations styling and reversible From → Subject → Attachment → Date layout scripts.

## Optional Gmail label import

Settings → Labels can fetch custom label names from a chosen Google account and
preview their creation under `GMAIL-Labels`. Dry run is enabled by default;
import requires a reviewed preview and an explicit action. No emails are imported.
A separately configured Google Desktop OAuth client is currently required only
for this optional feature. See [setup, permissions and limits](docs/gmail-import.md).

## Label picker

Press **L** in the mail browsing pane or use the Labels button. Search supports
Unicode names; use Up/Down to navigate, Space to toggle, and Escape to close.
Mixed checkboxes indicate tags assigned to only part of the selection.
Use **Create new** to open New Tag or **Manage labels** to open tag settings.

In the conversation reader, **L / Label as** acts on every displayed message,
including messages in Sent or Archive. In the list it acts on the native selection.
The × on an individual message chip removes that tag only from that message.
Loading or unresolved conversations must be retried; cross-folder writes may
partially succeed if a folder rejects an update.

## Settings

Open **Add-ons Manager → Thunder-G → Preferences**.
The [settings guide](docs/settings.md) explains each option, its default and when
it is useful, including experimental features and optional sender-logo downloads.

Outside text-entry fields, Ctrl/Cmd + plus (or equals), minus and zero control
Thunderbird’s interface font size in the inbox; in an open reader they zoom message content.

## Requirements

Python 3.9+ for the installer/build; Node.js 18+ only to run tests. No Python or
Node packages are downloaded or required.

For the original reader, install **Thunderbird Conversations** [↗](https://addons.thunderbird.net/en-US/thunderbird/addon/gmail-conversation-view/) separately from Thunderbird's add-on
manager for the conversation cards and inline replies shown in this project.

The clock requires **mailmindr / Follow-Ups** [↗](https://addons.thunderbird.net/en-US/thunderbird/addon/mailmindr/); it opens that add-on's reminder
form.

Gmail-style snoozing is not implemented; mailmindr's icebox behavior needs its own configuration.

Tag Popup is optional: the skin uses native Thunderbird tags, including any previously created with Tag Popup.
These third-party add-ons are not bundled or automatically installed.

## Install

Download the XPI from the latest GitHub release. In Thunderbird, open
**Add-ons Manager → gear → Install Add-on From File**, select it and restart.
Styles are bundled in the extension; new users do not need profile CSS or Python.
Use the built-in System theme, Classic layout and Table View.
The optional Conversations and mailmindr integrations remain separate add-ons.

For an older installation made with `install.py`, quit Thunderbird and run
`python3 install.py "/absolute/path/to/profile" --upgrade` from the new source
bundle once. It backs up affected files and retires unchanged installer-managed
CSS, preserving personal customization. Edited managed files stop migration.
See [updates and migration](docs/updates.md) before upgrading.

### Upgrading from the previous extension

The extension ID is now `thunder-g@vschiavoni` (formerly `inline-labels@local.gmail-skin`).
Thunderbird treats this as a different add-on, rather than an in-place update.
Uninstall the previous extension, then install the new Thunder-G package;
add-on-local preferences do not migrate automatically. If using the optional
local DKIM compatibility patch, rebuild it with the updated sender allowlist.
For installations under the current ID, use `--upgrade` for the one-time CSS
migration rather than uninstalling first. See the [maintenance guide](docs/updates.md).

### Optional column layout

With the intended ordinary folder open, paste the entire
`scripts/apply-gmail-columns.js` into Thunderbird's Error Console and execute it.
This changes that folder's column order/visibility and shared sender/subject
widths. It saves a snapshot to `gmail-skin-columns.json` in your profile.
Only one folder snapshot is supported: preserve/rename it before configuring a
different folder. To restore, open the original folder and run
`scripts/restore-columns.js`. Column changes are separate from installer rollback.
You can also arrange columns manually using Thunderbird's column picker.

## Uninstall / rollback

Quit Thunderbird and run from this directory:

```sh
python3 install.py "/absolute/path/to/your/Thunderbird/profile" --uninstall
```

This restores the original CSS, user.js, companion package (if any), and custom
stylesheet preference, preserving the snapshot in a dated folder. It refuses to
overwrite installer-managed files edited since installation; inspect the saved
originals if that happens. Restore optional column changes separately as above.
Mail actions you performed through the toolbar are real mail actions, and are
not undone by uninstalling. Uninstall before installing a newer release.

## Source and access

`chrome/` contains presentation CSS. `inline-labels/` contains the MailExtension
and its privileged experiment. `reading.js` delegates mail actions to native
Thunderbird commands and opens the installed mailmindr scheduler. `labels.js`
reads native tag definitions/message keywords and renders chips. `build.py`
packages these sources without a network step.

The experiment has broad Thunderbird UI/profile privileges; it is more powerful
than an ordinary theme. Review the source before installing. The bundled code
has no telemetry. Optional [BIMI sender logos](docs/settings.md#sender-logos)
require DNS lookups and logo downloads; mail actions use your configured mail
service normally. Compatibility can break when Thunderbird internals change.
Archive actions follow Thunderbird's selected-message/thread semantics; messages
found only by Conversations, such as additional Sent messages, are not always
included in the skin toolbar's action scope.

## Development and validation

```sh
node --test tests/*.test.cjs
python3 build.py
```

The tests use mocked Thunderbird interfaces and temporary installer profiles.
They cover presentation, row reuse, selection scope, navigation, local snippets,
component cleanup, and rollback. Run installer checks with:

```sh
python3 tests/installer_test.py
```

Live visual and interaction checks remain necessary, especially on another
Thunderbird version. See the changelog for validation limits.

Build a source ZIP and SHA-256 checksum with `python3 package.py`. Packaging uses
an explicit allowlist excluding generated packages and profile recovery data.

### Content loading and temporary caches

The conversation reader starts Thunderbird's native message viewer while it
looks up the rest of the conversation. It avoids reloading that viewer when the
result contains the same messages. Conversation-wide labels and footer replies
wait for the complete scope so sent replies are included.

The list and reader share up to 300 text previews in memory for five minutes.
Preview extraction reads only locally available message data; it never starts a
server fetch. A changed message identity/size/date invalidates its preview, and
an unavailable body is retried after 30 seconds or an offline-flag change.
Local Sent summary metadata is cached for 30 seconds, up to 10,000 headers;
larger scans are still complete but are not retained. Native add/delete/move,
folder rename/delete and key-change notifications invalidate that metadata.
Both caches are released when their consumers close. Full bodies, attachments,
remote-image policy and MIME rendering remain under Thunderbird's native viewer.

## Publishing and automatic updates

See [release publishing](docs/updates.md#publishing-a-release). Prepare the next
version with `python3 publish.py 0.14.0 --dry-run`, then omit `--dry-run` to run
checks and build the XPI, source archive, checksums and update feed.
Preparation does not commit, push, publish or install.

Publish a stable release for the matching tag after the workflow is on that tag.
The release workflow tests, builds and attaches the assets automatically. A push,
tag alone, draft or prerelease does not distribute an update.
Existing users must install the first update-enabled XPI manually; subsequent
compatible releases follow Thunderbird's native update preferences.

More guides: [labels](docs/labels.md), [settings](docs/settings.md),
[development](docs/development.md), and [migration/rollback](docs/updates.md).

Three-state reply verification: 89 automated tests pass. Live Thunderbird checks covered inline/floating transitions and native-window handoff with identity, recipient, subject and quoted body intact. The embedded editor closed only after the successor body loaded. An earlier server draft-copy failure retained the open reply. Attachments were saved/reopened in a native draft, but the separate-window attachment transfer still needs live confirmation. No mail was sent. These handoff checks were performed only in Thunderbird.

Column layouts: the final Date divider stays visible beside the column picker, and dragging the Subject divider redistributes and saves space for Date. The table remains within the mail pane. The reader no longer forces the selection column to be visible or first, and styling no longer hides native Tags or Spam columns. Responsive sizing reads native saved splitter widths and resets temporary preferences when the table is rebuilt. With Thunder-G enabled, Copy view also invokes Thunderbird's native column-copy operation, preserving visibility/order and the selected descendant scope. The separate native Copy columns command remains available; widths are stored globally by Thunderbird. Reply-panel actions have visible labels and panel/window icons rather than standalone arrows.

## Nested labels

Native tags named with `/` paths are displayed as expandable nested labels in the Tags sidebar and in the `L` label picker. For example, `Work`, `Work/PhD` and `Work/PhD/Project` form a three-level tree. Enable the native Tags folder-pane mode to see this sidebar. Existing tag keys and message assignments are preserved, and message chips show the full path. Searching the picker finds children even inside collapsed branches.

Select messages, press `L`, choose **Create new**, enter a name, enable **Nest label under**, and choose an existing parent. Creating a label applies it to the current selection or resolved conversation, including sent replies. Parent and child assignments are independent.

The hierarchy is derived from native tag names, not a separate skin database. Other clients see the full path when they support those same native tags; this feature does not add tag synchronization to a server/client that lacks it. Paths whose intermediate parents do not exist remain under the closest existing ancestor. Create those parent tags to show the missing levels. Native Manage Labels can edit individual full paths; renaming a parent does not automatically rename its descendants.

## Sidebar label menu

Hover a label in the Tags sidebar and click its three-dot button (also available on keyboard focus). The menu provides preset/custom label colors, Show/Hide in message-list rows, Edit, Remove label and Add sublabel.

Show/Hide is a local skin preference: hiding a chip preserves its native assignment and sidebar/picker entry. Editing a full path renames the label and its descendants while preserving their keys; conflicting paths are rejected before changes. Remove label asks for confirmation and keeps emails and sublabels. Add sublabel creates an unassigned native tag beneath the chosen parent, without applying it to the currently selected emails. Colors and names use Thunderbird's native tag service; other clients' behavior still depends on their tag synchronization support.

## Click a label to find matching mail

Click a label chip in the message list or conversation view to open its native Thunderbird tag view across folders. The tooltip identifies the label, and Enter/Space also activates a focused chip. This uses the exact tag key, including nested labels, and does not require global search indexing or Gmail query syntax. Existing quick-filter constraints are cleared for the results while preserving the sticky-filter preference. The conversation reader closes to reveal the matching list. The separate × button still removes the tag from that message; it does not open the tag view.
