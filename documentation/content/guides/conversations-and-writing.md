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

## Manually regroup messages in Betterbird

Betterbird provides native [rethreading](https://betterbird.eu/expert-tips/#rethreading):
you can attach a message to another conversation or detach it. Enable the native
threaded view first, and work with one message at a time. Expand a collapsed
conversation to select an individual message. In a unified Inbox, both messages
must still belong to the same underlying account folder; Betterbird cannot join
messages across accounts this way.

Thunder-G defers its snooze ordering while a native mouse drag or keyboard
rethreading operation is active. It does not change Betterbird's rethreading
permissions or rewrite message dates.
