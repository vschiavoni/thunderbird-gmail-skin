---
description: "Postpone conversations with Thunder-G, inspect account-specific holding folders and understand reminder timing, early return and offline behavior."
---

# Snooze conversations

Snooze moves mail to an account-specific **Thunder-G Snoozed** folder and keeps a
local reminder to return it to the Inbox. It is separate from Gmail's native
snooze: another device does not run Thunder-G's scheduler for this profile.

## Set a reminder

1. Select the conversation in the message list or open it in the reader.
2. Choose the toolbar clock. With **Gmail keyboard shortcuts** enabled, `b` also
   opens the picker when focus is outside an editor or text field.
3. Choose a preset or **Pick date & time**. The menu displays the proposed day and time.
4. For a custom reminder, select a calendar day and enter the local time. The clock
   control opens separate hour/minute lists; arrow keys and Home/End navigate them.
5. Choose **Save** and check the operation's status. The picker can close once the
   reminder is stored while message transfers are still running in the background.

Custom dates must be valid and in the future. Closing/cancelling the picker before
saving creates no reminder. An error after saving can mean that a reminder exists
but a transfer is incomplete: inspect the actual source and holding folders.

### Preset times

The current picker uses the computer's local time:

| Preset | When offered | Target |
| --- | --- | --- |
| Later today | Before 18:00 | Today at 18:00 |
| Tomorrow | Always | Tomorrow at 08:00 |
| Later this week | Monday or Tuesday | Wednesday at 08:00 |
| This weekend | Sunday through Friday | The upcoming Saturday at 08:00 |
| Next week | Always | The upcoming Monday at 08:00 |

Review the displayed date rather than relying on a preset's name alone.

## Browse or return postponed mail

Open **Thunder-G settings → Inbox → Sidebar options** and enable **Snoozed**.
This view combines the account-specific holding folders; its visibility is remembered.

To bring mail back immediately, open the conversation, choose the clock and select
**Unsnooze**. Check the same account's Inbox after the move completes. Do not delete the holding folder or clear profile preferences
as a way to cancel a reminder.

To postpone it to a different time using the documented folder workflow, return
it to the Inbox, let the move complete, then snooze it again with the new date.
If a move or reminder reports an error, resolve that first rather than repeatedly
creating more reminders for the same mail.

## What returns, and when

- Read/unread state is preserved.
- A new reply in the same account can return the conversation early and clear
  the reminder.
- Sent originals remain in Sent.
- Returned mail rises by its return time in date-sorted Inbox views. Its original
  message date is unchanged; other sort modes retain native ordering.
- A returned conversation shows an orange **Snoozed … ago** notice until you open
  it. It appears before the date and gives way to the row actions on hover.
  Opening clears the notice, not the return-time ordering. The original date
  stays visible in the date column and remains unchanged in the message.
- While the client is closed or offline, delivery back to the Inbox waits. Overdue
  reminders are processed after reopening and going online.

A reminder is account-scoped. For example, postponing mail in a work account
uses that account's holding folder and Inbox; it does not move the message to a
personal account merely because both appear under Unified Folders.

## Gmail and other clients

**Thunder-G snooze does not sync with Gmail's native snooze or with another
Thunderbird/Betterbird profile.** Connecting Gmail for label import does not change
this limitation.

| Action | What another client can see |
| --- | --- |
| Snooze in Thunder-G | The ordinary IMAP folder move, after synchronization. The reminder time and returned-message indicator stay in the originating profile. |
| Snooze in Gmail web or mobile | Inbox membership changes can sync. Thunder-G cannot read the native snooze deadline or reliably identify the later return as a snooze. |
| Open a returned message | The returned-message indicator is dismissed in the current profile. This indicator's acknowledgement is not shared with Gmail or other profiles. |

Google's documented [Gmail API](https://developers.google.com/workspace/gmail/api/reference/rest)
and [IMAP extensions](https://developers.google.com/workspace/gmail/imap/imap-extensions)
do not expose a supported snooze scheduling interface that Thunder-G can use for
this synchronization. A message appearing in Inbox is not enough to infer that it
was snoozed: it could also be newly delivered or manually moved.

Keep the originating client running and online for timely returns. Do not create
a second reminder in another profile to try to synchronize the first one.

## Reminder and message movement

The reminder and the folder transfer are separate operations. Follow the status
and check folder membership if either operation reports an error.

The installed extension stores reminders locally. The homepage demo uses a short
in-memory timer and does not move real messages or preserve reminders after reload.

## If a conversation does not return

1. Confirm the account exists and is online.
2. Inspect both its Inbox and **Thunder-G Snoozed**, allowing synchronization to finish.
3. Check the local date/time and whether the reminder is actually overdue.
4. Record any status/error and the affected account/folder names, without exposing
   private mail or credentials.
5. Use the [missing-reminder checklist](../docs/troubleshooting.md#a-snoozed-conversation-has-not-returned)
   before changing stored data.

A stored reminder is not evidence that all messages were moved successfully.
Disabling/uninstalling the add-on stops its scheduler; return postponed mail first
if you will no longer use the feature. Label backups do not transfer reminder jobs.
