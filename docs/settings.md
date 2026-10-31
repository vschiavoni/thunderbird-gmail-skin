# Settings

Open **Add-ons Manager → Thunder-G → Preferences**. Changes save automatically
and stay after restart.

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
list-style search results, draft autosave every minute, and 50 messages per page.
It hides Today Pane and column headers. Language, Gmail connection and BIMI
preferences are preserved. The switches update together; open a conversation to
try the reader and reply settings. Disable Thunderbird Conversations first, as
with manually enabling Thunder-G’s reader.

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
  (default) keeps one continuous list. Totals include messages in collapsed threads.
- **Hide Today Pane** *(off by default)* — Hide the calendar pane and its toggle
  to make room for mail. Turning this off restores Thunderbird’s visibility setting.
- **Show thread connection lines** *(on by default)* — Draw a subtle line between
  messages in expanded threads, so replies are easier to follow. Applies immediately.

## Conversations

- **Use Thunder-G’s conversation reader** *(experimental, off by default)* — Read
  related messages together, including locally available sent replies. The newest
  message opens expanded; click earlier messages to read them. A slim marker shows
  which message receives numeric tag shortcuts. **L** labels the whole conversation;
  includes sent replies.

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
(for example, `Research/Projects/Example`). Search matches that full path. The
sidebar continues to display expandable nested labels.

**Import labels from Gmail** is optional and starts with a dry run. Connect using
an optional Google Desktop OAuth client, choose custom labels and a destination
(default `GMAIL-Labels`), then review every proposed local change before importing.
System labels, emails, assignments and colors are excluded. Existing labels are
never overwritten. See the [Gmail import guide](gmail-import.md) for setup, Google
permissions, session-only credentials, conflict handling and safe retries.

Global searches open in the styled message list by default. Turn off **Inbox → Always show search results as a list** to use Thunderbird’s timeline and faceted search view for new searches. The option uses the complete native result set and does not change Thunderbird’s global preferences.
