# Settings

Open **Add-ons Manager → Thunder-G → Preferences**. Changes save automatically
and stay after restart.

## Inbox

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
  account’s configured Drafts folder. The in-window editor shows green **✓ Saved**
  only after a successful save; further edits show **Unsaved changes**.
- **Save every** *(default: 1 minute)* — Choose 1, 2, 5 or 10 minutes between
  automatic saves. Available when autosave is on. Autosave changes apply to newly
  opened composers.

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

**Enabling this downloads remote images; the logo host can see your IP address.**
Only the advertised logo is downloaded, without an external logo lookup service.
Logos and missing results are cached for one hour during the session. Turning
this off stops new downloads and restores the usual avatars.

## Labels

**Import labels from Gmail** is optional and starts with a dry run. Connect using
an optional Google Desktop OAuth client, choose custom labels and a destination
(default `GMAIL-Labels`), then review every proposed local change before importing.
System labels, emails, assignments and colors are excluded. Existing labels are
never overwritten. See the [Gmail import guide](gmail-import.md) for setup, Google
permissions, session-only credentials, conflict handling and safe retries.
