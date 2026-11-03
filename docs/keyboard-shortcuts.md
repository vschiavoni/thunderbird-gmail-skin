# Keyboard shortcuts

[Back to README](../README.md) · [Settings](settings.md) · [Labels](labels.md)

Thunder-G supports the following Gmail-style shortcuts starting with **0.23.0**.
This page lists the implemented shortcuts, rather than every shortcut available in Gmail.

## Enable Gmail shortcuts

1. Open **Thunder-G settings**.
2. Go to **Writing**.
3. Turn on **Gmail keyboard shortcuts**.

The option is **off by default**. Changes apply to open and new mail panes and
composers. With it enabled, press **`?`** in the message list or conversation
reader to see the in-app reference. Press **Escape** to dismiss it.

The existing **`L` label picker** works even with this option off. Thunderbird’s
native shortcuts also remain available; disabling the option does not disable
native bindings that happen to use the same keys.

## Reading the tables

- `+` means hold the keys together: `⌘+Enter` means Command and Enter.
- **then** means press and release the first key before pressing the second.
  Finish a two-key sequence within **one second**.
- Letter shortcuts use the indicated letter without Command, Ctrl or Alt.
  `Shift+r` means hold Shift and press `r`.
- For punctuation such as `?`, `#`, `!`, `*`, `;` and `:`, use the keys required
  to produce that character on your keyboard layout.
- Composer shortcuts use **Command (⌘)** on macOS and **Ctrl** on Windows/Linux.

## Compose and conversation actions

| Shortcut | Action | Where it applies |
| --- | --- | --- |
| `c` | Compose a new message | Mail list or conversation; follows the in-window composing setting |
| `r` | Reply | Open conversation, or selected message in the list |
| `a` | Reply all | Open conversation, or selected message in the list |
| `f` | Forward | Open conversation, or selected message in the list |
| `Shift+r` | Reply in a separate window | Open conversation reader |
| `Shift+a` | Reply all in a separate window | Open conversation reader |
| `Shift+f` | Forward in a separate window | Open conversation reader |
| `e` | Archive | Current conversation or selected messages |
| `#` | Delete | Current conversation or selected messages; uses Thunderbird’s normal delete action |
| `!` | Mark as spam | Current conversation or selected messages |
| `s` | Toggle star | Uses Thunderbird’s selected-message command |
| `Shift+i` | Mark as read | Current conversation or selected messages |
| `Shift+u` | Mark as unread | Returns to the list when used in the reader |
| `z` | Undo | When the native Thunderbird action can be undone |
| `l` | Open **Label as** | Selected messages or the resolved conversation; also available independently as `L` |
| `v` | Open **Move to** | Current conversation or selected messages |
| `b` | Snooze | Opens the date and time picker for the selected conversations |
| `,` | Focus the mail action toolbar | Message list or conversation |

In the independent conversation reader, reply/forward shortcuts target the active
message, or the conversation’s action message when no card is active. To choose
an exact earlier message, expand that card and use its **⋮ → Forward** action.
Forwarding includes that message’s original body and attachments.

## Navigation and search

| Shortcut | Action |
| --- | --- |
| `/` | Focus global mail search |
| `j` | Next conversation / row |
| `k` | Previous conversation / row |
| `o` or `Enter` | Open the focused message-list row |
| `u` | Return from the conversation to the message list |
| `n` | Move to the next message in the independent conversation reader |
| `p` | Move to the previous message in the independent conversation reader |
| `;` | Expand all cards in the independent conversation reader |
| `:` | Collapse all cards in the independent conversation reader |
| `g` then `i` | Open the current account’s Inbox |
| `g` then `t` | Open the current account’s Sent folder |
| `g` then `d` | Open the current account’s Drafts folder |
| `g` then `n` | Next page, when message-list pagination is enabled |
| `g` then `p` | Previous page, when message-list pagination is enabled |
| `?` | Open the supported-shortcuts reference |

Next/previous conversation follows the current message-list order. Folder jumps
need an account with the corresponding special folder configured. Message/card
navigation and expansion use Thunder-G’s independent conversation reader.

## Message-list selection

| Shortcut | Action |
| --- | --- |
| `x` | Toggle selection of the focused row |
| `*` then `a` | Select all messages on the current page |
| `*` then `n` | Deselect all messages |
| `*` then `r` | Select read messages on the current page |
| `*` then `u` | Select unread messages on the current page |
| `*` then `s` | Select starred messages on the current page |
| `*` then `t` | Select unstarred messages on the current page |

When pagination is disabled, selection sequences apply to the current message
view. They do not search other folders or select every message in the account.

## Composer shortcuts

These mappings work in embedded and native composers when the Gmail shortcut
option is enabled. Formatting actions require an editor that supports them;
HTML formatting is not available in a plain-text composer.

| Action | macOS | Windows / Linux |
| --- | --- | --- |
| Send through the normal Send command | `⌘+Enter` | `Ctrl+Enter` |
| Show Cc and focus its input | `⌘+Shift+c` | `Ctrl+Shift+c` |
| Show Bcc and focus its input | `⌘+Shift+b` | `Ctrl+Shift+b` |
| Focus From / sender identity | `⌘+Shift+f` | `Ctrl+Shift+f` |
| Numbered list | `⌘+Shift+7` | `Ctrl+Shift+7` |
| Bulleted list | `⌘+Shift+8` | `Ctrl+Shift+8` |
| Align left | `⌘+Shift+l` | `Ctrl+Shift+l` |
| Align center | `⌘+Shift+e` | `Ctrl+Shift+e` |
| Align right | `⌘+Shift+r` | `Ctrl+Shift+r` |
| Outdent | `⌘+[` | `Ctrl+[` |
| Indent | `⌘+]` | `Ctrl+]` |
| Remove text formatting | `⌘+\` | `Ctrl+\` |

Native formatting shortcuts such as **Command/Ctrl+B**, **I** and **U** continue
to provide bold, italic and underline where supported.

Sending uses Thunderbird’s normal validation, account configuration, prompts,
error handling and draft recovery. A busy composer does not start another send
through the added mapping. The shortcut does not bypass native sending checks.

## Typing, focus and unavailable actions

Letter shortcuts are ignored inside text inputs, editable bodies, menus and
dialogs. They also ignore key repeat and IME composition. Pressing Enter on a
focused button or link preserves that control’s normal activation.

An action still needs the relevant message, selection, ready conversation or
native command. For example, an empty mailbox cannot open a message and an
unconfigured Sent folder cannot be opened by a folder jump. If a letter shortcut
seems inactive, click the message list or conversation outside writing fields.

Thunder-G does not currently reproduce Gmail’s chat, Keep, Tasks, importance,
superstars, custom shortcut editor, or all Gmail formatting shortcuts. Unlisted
keys retain their native Thunderbird behavior.

For the original Gmail reference, see [Google’s desktop keyboard shortcuts](https://support.google.com/mail/answer/6594?hl=en).
