---
description: "Set up the experimental Thunder-G reader, inline replies and new-message composer. Learn long-thread controls, draft saving and editor modes."
---

# Conversations and writing

The conversation reader, inline replies and floating new-message composer are
separate experimental options, all off by default. Enable only the parts you want
under **Add-ons Manager → Thunder-G → Preferences**.

## Enable the reader

1. Disable the separate **Thunderbird Conversations** add-on if installed.
2. Enable **Conversations → Use Thunder-G’s conversation reader**.
3. Reopen a message from the list. Changing readers returns to the list; it does
   not convert a conversation already open in another viewer.

Messages are grouped using local conversation information, including locally
available sent replies, with a folder-thread fallback when indexing is unavailable.
Missing local folders or summaries can limit the conversation. This is not a
subject-only search of all mail on the server.

The newest message opens expanded. Click an earlier message header to expand it.
Bodies, attachments and native message actions use the client's viewer/commands.
A slim marker identifies the active message used to determine numeric tag toggles;
label updates still apply to the resolved conversation, including sent replies.

**L** opens the conversation label picker independently of optional Gmail shortcuts.
For the distinction between user labels and the **Inbox** system chip, see
[organizing mail with labels](labels-workflow.md).

## Long conversations

**Compact long conversations** is on by default. For six or more messages, the
reader keeps the first message and last two visible, along with the selected
message and any unread messages. Other intervening messages are replaced with a counter. Click that counter to reveal the middle messages.

This is a display choice, not deletion or archive. Disable the setting and reopen
the conversation to show its complete sequence without initial compaction. It is
separate from thread expand arrows and connection lines in the message list.

## Reply below a conversation

Enable **Writing → Reply in this window**, then open a conversation and choose
**Reply** or **Reply all**. Confirm the From identity and recipients before sending.
The editor opens below the conversation; detach it into a floating panel for more
room, return it, or move it to a separate window. Forward retains a separate window.

With Gmail shortcuts enabled, `r` replies, `a` replies to all, and `Shift+r` or
`Shift+a` opens a separate reply window from the reader. Native composer shortcuts
and sending checks still apply; the full [shortcut reference](../docs/keyboard-shortcuts.md)
separates list, reader and editor actions.

## Compose beside the sidebar

Enable **Writing → Write new messages in this window**. Compose opens a floating
panel beside the folder sidebar. Resize it from its edges or marked corner,
expand it within the mail area, or move it to a separate window. The corner also
supports arrow-key resizing. The saved size is reused across messages and restarts,
adapting to the available space.

Changing folders or starting another message keeps existing work available.
Turning an in-window setting off affects future openings rather than discarding
an editor already in progress. Use the editor's close action to finish with a draft.

## Attachments, signatures and drafts

The editor uses native account identities, signatures, recipients, formatting,
attachments and the account's Drafts folder. These are real email controls, unlike
the fictional-mail preview on the documentation homepage.

**Automatically save drafts** is on by default:

| Mode | Saving behavior |
| --- | --- |
| Auto | Saves after 1.5 seconds without edits; typing, recipients, subject and attachments restart the pause |
| Fixed interval | Saves at the selected 1, 2, 5 or 10 minute interval |
| Disabled | Automatic saving is off; use native save/close actions |

An idle editor does not continually save unchanged work. **✓ Saved** appears only
after native save success, not merely after scheduling an autosave. Verify the
account's Drafts folder if saving fails. Opening an existing draft uses the client's
native draft handling; confirm its identity, recipients and attachments before sending.

Moving an in-window editor to a separate window saves a native draft first.
Closing follows the usual **Save**, **Discard** and **Cancel** choices. Choose
Cancel to keep working; Discard deliberately abandons the unsent changes.

## Check a new setup without sending mail

Create a test draft, add an attachment and wait for **✓ Saved**. Move it to a
separate window and check that recipients, text and attachment are still present.
Close with Save, locate it in Drafts and reopen it. This exercises your actual
account configuration without sending to a recipient.

If the reader or editors do not appear, check the switches, reopen from the list
and confirm Thunderbird Conversations is disabled. For a reproducible failure,
include the client version, platform, settings, draft-saving mode and the exact
operation in a [problem report](../docs/troubleshooting.md#report-a-reproducible-problem).

## Quoted history

When a message contains quoted history, **Show quoted text** reveals the folded
portion and **Hide quoted text** collapses it again. Folding is presentation only;
it does not remove text from the stored message or from the native forwarding path.
If a short preview seems incomplete, expand the message and its quoted text before
concluding that content is missing.

## Multiple minimized drafts

You can keep multiple embedded composers open in the same mail tab. Opening a different draft, composing another message or opening another conversation minimizes the current composer into a bottom bar. Select its title to restore it; other open composers minimize automatically. Text, attachments, undo history and native autosave remain intact. Closing a minimized message saves it through the usual draft workflow.

## Automatic read timing

Under **Settings → Conversations → Mark messages as read**, choose Immediately, After 1 second, After 3 seconds, After 20 seconds or Never. The existing native Thunderbird preference is preserved until you change it. Leaving the conversation before the delay expires cancels its read timer, keeping the message unread. The setting uses Thunderbird’s native read policy and persists across restarts.

## Experimental permanent sent cards — steps 1–3

On **`codex/permanent-sent-cards` only**, newly sent inline messages keep the same
visible body that appeared when Send was pressed. HTML composers now keep a
restricted rich-content snapshot; plain-text composers keep their text snapshot. The saved Sent copy
updates the card’s native identity, labels, security metadata and reply actions,
but its native message body does not replace the visible snapshot. Existing
messages still use Thunderbird’s normal rendering. This experiment is not merged
or released and does not change the sending process.

The original recipient text, signature, line wrapping, and quote-expansion choice
remain in the same body nodes. The permanent card responds to message zoom and
provides the configured Reply/Reply-all action after native initialization.
**Show saved formatting / attachments** displays Thunderbird’s full saved message
inside the same card after it loads. **Back to sent view** restores the original
body and its quote-expansion state. Neither control opens a separate window.

Rich snapshots preserve common text formatting, colors, links, lists, tables and
quoted text. They copy a bounded allowlist of passive elements and styles rather
than insert raw HTML into the privileged reader. Scripts, forms, embedded frames,
SVG, event attributes, remote resources and unsafe link schemes are excluded.
Links open through the external protocol service. Quoted rich text remains visible
as composed; the plain-text view retains its quote-expansion control.

Inline images are copied from already decoded composer pixels into PNG snapshots,
without fetching their source again. Images must be loaded and readable, with at
most four million pixels each, approximately 2 MB encoded data per image and 6 MB
total. Unavailable, oversized or protected images show alternative text or a
placeholder. An oversized/deep content tree falls back to the plain-text snapshot.
Snapshots are limited to 10,000 nodes, 40 levels and one million text characters.
Attachments use the same preview tiles in existing messages, permanent sent cards
and the in-card saved view. Each tile has **Open** and **Save** controls; clicking
its preview also opens the attachment. The native attachment strip is hidden only
inside this conversation reader. Raster images (including GIFs) use static
thumbnails, and PDFs use a first-page preview through Thunderbird's bundled PDF.js.
Tiles are compact (100 CSS pixels wide with a 60-pixel preview), with Open and
Save side by side. Attachment groups show their count and a native **Save all**
action, wrapping after five compact tiles. Word, Excel and PowerPoint documents
have colored type badges instead of a generic File label. Modern Office and
OpenDocument files can display an embedded PNG/JPEG thumbnail when supplied by
the document's author. This does not render Office pages: documents without an
embedded thumbnail retain their type icon. No Office application or online
conversion service is used.

Preview generation reads only native message parts with a known size up to 8 MiB;
external links and unknown-size files are not fetched automatically. At most the
first 12 attachments per message are previewed, sequentially. Images over 16 million
pixels, encrypted/unreadable PDFs and decoding failures retain a file-type tile.
PDF evaluation, XFA and annotation rendering are disabled. Preview failures do not
disable Open/Save, and leaving the conversation discards late results.

Each attachment now has **Open** and **Save** controls on the permanent card.
Names appear immediately; controls stay disabled until the saved Sent copy finishes
loading. They use Thunderbird's parsed attachment objects and native Open/Save
methods, including file dialogs, helper applications and URL checks. Duplicate
filenames remain distinct. Missing or disallowed attachments stay disabled. Failed
actions show a retryable message; cancelling Save leaves the card unchanged.
Late attachment parsing refreshes the controls, and leaving the conversation
invalidates them. No temporary composer file URL is used to open an attachment.
Full native attachment widgets and security notices also remain available in the
in-card saved-message view. The native viewer initializes offscreen for actions
and retains normal MIME and remote-content policies; its resizing does not change
the visible snapshot. Sender/label/security metadata may update after saving even though
the body stays in place.

Snapshots are held only for the current open conversation, not persisted in the
profile or added to message data. Leaving and reopening uses the saved message’s
normal native rendering. Failed sends remove their immediate card as before;
draft recovery is unchanged. Further steps should evaluate recipient presentation,
rich-content fidelity and long-lived behavior before
considering a merge.
