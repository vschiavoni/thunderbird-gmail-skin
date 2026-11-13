---
description: "Configure Thunder-G inbox appearance, conversation reading, in-window writing, keyboard shortcuts, label tools and optional sender logos."
---

# Settings

Open **Add-ons Manager → Thunder-G → Preferences**. Changes save automatically
and stay after restart.

Use **Search settings** to filter sections by their names and descriptions.
Matching sections include their expanded help text. Press **Esc** or clear the
search field to show everything again. **Appearance** in the sidebar opens the
macOS Dock icon settings.

## Interface language

**Interface language** defaults to **Automatic (Thunderbird language)**. Italian
Thunderbird locales use Italian; other locales fall back to English. Choose
**English** or **Italiano** to override the application language for Thunder-G.
The preference stays after restart. Thunder-G controls translate immediately in existing mail windows, including
selection menus, label dialogs and reply actions. Open drafts stay open.
Native Thunderbird controls keep Thunderbird’s own language. User label names,
message subjects and message bodies are never translated.

## Quick setup

**Apply recommended** applies a single preset: Thunder-G’s conversation reader,
in-window replies and new messages, thread guides,
list-style search results, draft autosave in Auto mode (after 1.5 seconds without edits), and 50 messages per page.
It hides Today Pane and column headers. Language, Gmail connection and BIMI
preferences are preserved. The switches update together; open a conversation to
try the reader and reply settings. Disable Thunderbird Conversations first, as
with manually enabling Thunder-G’s reader.

## Dock icon (macOS)

**Use Thunder-G Dock icon** is off by default and appears only on macOS.
Enable it to use the Thunder-G icon while Thunderbird is running. It follows
macOS light/dark appearance, including Auto, within about two seconds. Choose
**Light** or **Dark** to keep one style, or **Auto (follow macOS)**
to select a separate icon for light and dark appearance. Auto defaults to Light
for light and Dark for dark. The choice
is saved and reapplied at startup. Disabling it or unloading Thunder-G restores
Thunderbird's original icon without changing the application bundle.

The icon uses flattened Apple exports. It does not follow the separate macOS
Clear/Tinted icon styles or provide dynamic Liquid Glass rendering.

## Inbox

At startup, Thunder-G shows its logo while the mailbox prepares, then fades it
out as soon as visible messages or a completed empty folder are usable. Background
synchronisation continues using Thunderbird's own status display. After eight
seconds, a slow startup switches to a non-blocking waiting card so you can navigate
folders. This card closes as soon as the mailbox is usable; **Show mail** dismisses the
splash at any time. Offline mode immediately makes navigation available. The
presentation follows the interface language (including live overrides), theme
and reduced-motion preference.

- **Show column headers** *(off by default)* — Restore clickable headers, column resizing and the column picker. Applies immediately without changing the sort order or saved widths.

- **Messages per page** — Show 25, 50 or 100 messages at a time. **All messages**
  (default) keeps one continuous list. In threaded view each conversation counts
  as one item, whether collapsed or expanded; all its replies stay on the same
  page. Flat and grouped-by-sort views count individual messages.
- **Hide Today Pane** *(off by default)* — Hide the calendar pane and its toggle
  to make room for mail. Turning this off restores Thunderbird’s visibility setting.
- **Show thread connection lines** *(on by default)* — Draw a subtle line between
  messages in expanded threads, so replies are easier to follow. Applies immediately.

### List markers and previews

- **Colored stars** (off by default): choose active markers and cycle order under
  **In use** / **Not in use**. Drag or click markers to move them; Left/Right
  reorders a focused active marker. Presets offer 1, 4 or all 12 markers.
  In the list, an empty star applies the first marker; successive clicks on the
  same message within 1.5 seconds cycle. A later click removes the flag. The native
  starred flag and the extra Thunder-G marker property are separate; another
  client may show only the flag.
- **Show new-message symbol** (off): show the client's golden new-mail indicator.
- **Use Gmail-style label icons** (off): filled shapes using native label colors.
- **Personal level indicators** (off): `›` for mail addressed to you and others,
  `»` for mail addressed only to you, based on configured identities and To/Cc headers; List-ID mailing-list messages
  are excluded.
- **Show thread expand arrows** (off): expose thread expansion controls.

These are independent of label visibility and the optional conversation reader.

## Snooze

Use the clock in the message toolbar (or `b` with Gmail shortcuts enabled) to
postpone selected conversations. Choose tomorrow, next week, or a custom local
date and time. Enter the time manually, or use the clock button to open separate
scrollable hour and minute lists with keyboard navigation. Saving closes the
picker once the reminder is stored; the account transfer continues in the background.

**Folder Modes → Snoozed** shows one unified folder with a clock icon, containing
postponed messages from all accounts. When **Unified Folders** is active, Snoozed
appears inside that section; otherwise it has its own sidebar entry. Switching
folder modes relocates the same view without duplicating it. Its visibility is remembered. The underlying
**Thunder-G Snoozed** folders remain in their original accounts but are hidden
from the sidebar while the unified view is enabled. New account holding folders
are included automatically. Disabling the view reveals the account folders again.

Open a postponed message to see its return deadline, or check the orange return
date in the list. The clock menu changes an existing reminder; **Unsnooze**
returns the conversation to its own account’s Inbox.

Read/unread state is preserved. A new reply in the same account returns its
conversation early and clears the reminder. Sent originals stay in Sent.
Returned messages rise by their return time in date-sorted Inbox views; their
original message date is unchanged. Other sort modes retain their native order.
The scheduler runs locally: when Thunderbird is closed, overdue reminders wait
until it is reopened and online. This does not activate Gmail's native snooze.

## Conversations

- **Use Thunder-G’s conversation reader** *(experimental, off by default)* — Read
  related messages together, including locally available sent replies. The newest
  message opens expanded; click earlier messages to read them. A slim marker identifies the active message used to determine numeric tag
  toggles; updates apply to the resolved conversation. **L** labels the whole conversation;
  includes sent replies.

- **Compact long conversations** (on by default) — For six or more messages,
  retain the first, last two, selected and unread messages. A counter reveals
  hidden middle messages. This does not delete mail; it applies when reopening
  a conversation in Thunder-G's reader.

Disable **Thunderbird Conversations** before enabling this reader or **Reply in
this window**: Thunder-G handles the conversation itself. After switching readers,
open a message again from the list.

## Writing

- **Write new messages in this window** *(experimental, off by default)* — Write
  opens a floating composer beside the folder sidebar. Resize it, expand it within
  the mail area, or move it to a separate window. Your floating size is remembered
  for future messages and after restart, adapting to the available space.
- **Reply in this window** *(experimental, off by default)* — Reply and Reply all
  open below the conversation. You can detach the reply into a floating panel and
  return it, or move it to a separate window.
- **Automatically save drafts** *(on by default)* — Save unsent work to the
  account’s Drafts folder. **Auto** (default) saves after 1.5 seconds without
  edits; alternatively choose a fixed interval of 1, 2, 5 or 10 minutes. In Auto,
  typing, recipients, subject and attachments restart the pause. Applies to inline and classic
  composers; an idle editor does not repeatedly save. Changes apply immediately.
  The in-window editor confirms **✓ Saved** only after native save success.

In-window writing uses Thunderbird’s editor, including your signatures,
attachments and drafts. The folder sidebar stays visible. Navigating or turning
an in-window option off keeps open work available; closing uses the usual
Save, Discard and Cancel choices. Forward keeps its separate window.

## Sender logos

- **Show sender logos with BIMI** *(off by default)* — Look up the sender’s BIMI
  DNS record and download its advertised HTTPS SVG logo. Contact photos take
  priority; missing or invalid logos leave the usual avatar in place.

Requires a successful aligned DKIM check through the [local DKIM integration](../integrations/README.md).
An ordinary DKIM Verifier installation does not provide this integration.

> [!NOTE]
> **Enabling this downloads remote images; the logo host can see your IP address.**
> Only the advertised logo is downloaded, without an external logo lookup service.
> Logos and missing results are cached for one hour during the session. **Turning this off stops new downloads and restores the usual avatars.**

## Import/Export

**Back up labels and message assignments** exports one file containing label
definitions, visibility and assignments to identifiable messages. Choose **Show
accounts**, then select one account or explicitly choose **All accounts**. Label
definitions are profile-wide; message assignments follow your selection. On a new
computer, add the same accounts and download the message lists, then choose the
file, **Preview restore**, and **Restore labels**. Existing labels and assignments
are kept; missing or ambiguous messages are skipped. No message text, attachments
or credentials are exported. See the [label backup guide](label-backup.md).

The **Label as** picker lists every label at the same level using its full path
(for example, `Work/Projects/Example`). Search matches that full path. The
sidebar continues to display expandable nested labels.

**Import labels from Gmail** is optional and starts with a dry run. Connect using
an optional Google Desktop OAuth client, choose custom labels and a destination
(default `GMAIL-Labels`), then review every proposed local change before importing.
System labels, emails, assignments and colors are excluded. Existing labels are
never overwritten. See the [Gmail import guide](gmail-import.md) for setup, Google
permissions, session-only credentials, conflict handling and safe retries.

Global searches open in the styled message list by default. Turn off **Inbox → Always show search results as a list** to use Thunderbird’s timeline and faceted search view for new searches. The option uses the complete native result set and does not change Thunderbird’s global preferences.


### Gmail keyboard shortcuts (optional)

Under **Writing**, enable **Gmail keyboard shortcuts**. It is off by default and
applies to open and new mail panes and composers. Press **`?`** in the message list
or conversation reader for help.

See the [complete keyboard shortcut reference](keyboard-shortcuts.md) for macOS
and Windows/Linux tables, navigation, selection sequences, composer commands and
requirements. Letter shortcuts are ignored while typing. The existing `L` label
picker and native Thunderbird bindings remain available independently.

### Customize message previews

Disabled by default. Enable this to skip a number of initial body lines and optionally remove a matching leading server banner, such as “E-MAIL EXTERNE ¦ Attention aux liens et pièces jointes”. Lines are skipped first, then the leading text is matched literally, ignoring differences in whitespace.

This applies to snippets in the message list. Line skipping requires locally available body text with line breaks. Changes apply immediately to visible rows. The stored message body is preserved.


## Folder sizes

Thunder-G turns off Thunderbird’s native **Show Folder Size** option when it
starts. The folder-pane menu remains usable if you want to show sizes during
that session. Opening additional mail tabs preserves your choice. Disabling
Thunder-G restores the previous native setting unless you changed it yourself
while the extension was active.


## Collapsed sidebar unread indicators

When the sidebar is collapsed, a red dot beside a folder or label icon indicates
unread mail. The dots follow Thunderbird’s existing folder unread counts and
Thunder-G’s unread-conversation counts for labels. They disappear when the row
has no unread messages or the sidebar is expanded.

## Sidebar options

Under **Inbox → Sidebar options**, configure folder modes, native display controls and section order. These replace the ellipsis menus previously shown beside Compose and folder headings. The Labels **+** button still creates a label.

## Mark messages as read

Under **Conversations → Mark messages as read**, choose Immediately, After 1/3/20 seconds, or Never. This changes Thunderbird’s native preference. Existing timing remains unchanged until you select a new value. Pending read timers are canceled on a setting change and when leaving an open conversation.
