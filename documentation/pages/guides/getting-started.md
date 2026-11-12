---
description: "Install the Thunder-G XPI, choose the intended Thunderbird or Betterbird layout, check labels and configure optional features step by step."
---

# First-run walkthrough

Install the released add-on, check the basic layout, then enable optional features
one at a time. Thunder-G uses the accounts already configured in your client;
you do not need a Gmail account or a Google connection.

## Check your client and install

1. Check the [compatibility table](../../../README.md#compatibility). It distinguishes
   the declared version range from client/platform combinations actually tested.
2. Download the `.xpi` from the project's
   [latest release](https://github.com/vschiavoni/thunderbird-gmail-skin/releases/latest).
3. In Thunderbird or Betterbird, open **Add-ons Manager → gear → Install Add-on
   From File**, select the XPI, and restart the client.
4. Use the built-in **System theme**, **Classic layout** and **Table View**.
5. Open an ordinary Inbox. The intended list has selection, star, sender,
   labels/subject, attachment and date columns. Column headers are hidden initially.

The extension does not require Python, Node.js, Bun or profile CSS. Those belong
to development or the documentation website. If you previously used the Python
installer or the old `inline-labels` extension, follow
[migration instructions](../docs/updates.md#migrating-an-older-installer-managed-profile)
before installing over that setup.

For the intended sidebar wordmark, you may install Google Sans as a system font.
It is optional; the extension uses an available fallback and does not download it.

## Check the basic controls

1. Open **Add-ons Manager → Thunder-G → Preferences**. Settings save automatically.
2. Under **Inbox**, enable **Show column headers** if you want to sort, resize or
   choose columns. Turning it off hides the headers again without resetting sorting.
3. Select a disposable test message and press **L**. Search for an existing label,
   toggle its checkbox and close the picker. This works without enabling Gmail shortcuts.
4. Check the label chip beside the subject. Label actions can affect the entire
   conversation, including sent replies: read [the label walkthrough](labels-workflow.md)
   before trying this on important mail.
5. Click the chip to open matching mail across folders. Use the folder sidebar to
   return to the Inbox.

If labels are missing from the sidebar, enable Thunderbird's native **Tags**
folder-pane mode. Thunder-G presents those tags as **Labels**, with expandable paths.

## Choose optional features

| Goal | Setting or guide | Initial state |
| --- | --- | --- |
| Navigate with Gmail-style keys | **Writing → Gmail keyboard shortcuts**; press `?` for help | Off |
| Read a conversation in one view | **Conversations → Use Thunder-G’s conversation reader** | Experimental, off |
| Reply below a conversation | **Writing → Reply in this window** | Experimental, off |
| Compose beside the sidebar | **Writing → Write new messages in this window** | Experimental, off |
| Limit the visible list | **Inbox → Messages per page** | All messages |
| Adjust snippets, stars or indicators | [Inbox and appearance](inbox-and-appearance.md) | Depends on the option |

Disable the separate **Thunderbird Conversations** add-on before enabling
Thunder-G's reader or in-window replies. Reopen a message from the list after
changing readers.

**Apply recommended** is a preset, not a compatibility check. It enables the
reader, in-window replies/new messages and thread guides, uses list-style search,
sets draft autosave to Auto (after 1.5 seconds without edits) and the page size to 50, and hides Today Pane
and column headers. Language, Google connection and BIMI choices are preserved.
Review [the settings reference](../docs/settings.md#quick-setup) before applying it.

## Continue with your own workflow

- [Organize labels](labels-workflow.md), including nested paths and visibility.
- [Find and organize mail](find-and-organize-mail.md), including local-search limits.
- [Read conversations and save drafts](conversations-and-writing.md).
- [Snooze a conversation](snooze.md) and check where it will return.
- [Move labels to another computer](moving-to-another-computer.md).

For an unexpected layout, disable optional features one at a time and use the
[troubleshooting guide](../docs/troubleshooting.md). Disabling the add-on restores
its native layout snapshots; it does not undo tags, moves or sent messages.
