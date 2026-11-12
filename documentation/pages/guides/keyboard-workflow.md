---
description: "Navigate and organize mail with Thunder-G keyboard shortcuts. Understand focus, selection scope and commands inside message editors."
---

# A keyboard workflow

Enable **Preferences → Writing → Gmail keyboard shortcuts**, then focus the
message list. Press `?` for the implemented commands and Escape to close help.
The standalone **L** label picker also works with the option disabled.

## Read and classify one conversation

1. Use `j`/`k` to move between rows and `o` or Enter to open the focused one.
2. With the optional reader enabled, use `n`/`p` to move between messages;
   `;` expands all cards and `:` collapses them.
3. Press `l`, search a label path, use Up/Down and Space to toggle, then Escape.
   This updates the resolved conversation, including available sent replies.
4. Use `u` to return to the list, or `e` to archive when the conversation is finished.
5. Press `/` to focus search. Type a query and submit with Enter.

Normal Enter activation on a focused button/link is preserved. Letter shortcuts
are ignored in text inputs, editable bodies, menus, dialogs and IME composition.
Leave those controls before issuing a mail command.

## Work with a page of messages

Use `x` to toggle the focused row. For selection sequences, press and release the
first character, then the second within one second:

| Sequence | Scope |
| --- | --- |
| `*` then `a` | All messages on the current page |
| `*` then `u` | Unread messages on the current page |
| `*` then `s` | Starred messages on the current page |
| `*` then `n` | Clear the selection |
| `g` then `n` / `g` then `p` | Next / previous page when pagination is enabled |

Without pagination, selection applies to the current message view. It does not
search other folders or select an entire account. Inspect the selection before
`e` (archive), `#` (native delete), `!` (spam), `v` (move) or `b` (snooze).
`z` invokes native Undo only when the previous action can be undone.

## Reply or compose

`c` starts a new message; `r` replies and `a` replies to all. These follow the
in-window settings. In the reader, Shift plus `r`/`a`/`f` uses a separate window.

Inside an editor, use the native recipient and formatting controls. Added composer
shortcuts use Command on macOS and Ctrl on Windows/Linux. Command/Ctrl+Enter uses
the normal Send command and its validation/prompts; it is a real send action.
Practice navigation and saving with a draft before using a send shortcut.

## Folder jumps and unavailable actions

`g` then `i`/`t`/`d` opens the current account's Inbox/Sent/Drafts. The account must
have the corresponding special folder configured. An empty folder has no message
to open, and a loading conversation may not yet be ready for an action.

If a key appears inactive, first check focus, selection and feature prerequisites.
The [full reference](../docs/keyboard-shortcuts.md) includes all sequences,
platform-specific composer mappings and unsupported Gmail commands. This guide
does not claim every operation is accessible with every screen reader.
