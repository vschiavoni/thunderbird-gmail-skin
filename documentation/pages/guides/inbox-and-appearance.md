---
description: "Customize Thunder-G columns, previews, pagination, colored stars, recipient indicators and appearance without changing your email account setup."
---

# Inbox and appearance

Open **Add-ons Manager → Thunder-G → Preferences → Inbox**. These controls change
presentation; your mail accounts, native folders and stored message bodies stay
under the client's control. Changes generally apply immediately. The settings
reference lists [defaults and prerequisites](../docs/settings.md).

## Columns and page size

Enable **Show column headers** to sort by a column, resize it, or use the native
column picker. Hiding headers again preserves the chosen sort and widths.
Thunder-G uses the same message-list column arrangement across accounts and folders;
the saved native layouts return when the add-on is disabled.

**Messages per page** offers **25**, **50**, **100** or **All messages**. In threaded
view a conversation occupies one page item, even when its replies are expanded;
a thread is not split between pages. Flat and grouped-by-sort views count messages
individually. Pagination changes the view, not how much mail the account contains.

Use **Hide Today Pane** to remove the calendar pane and its toggle. Turning it
off restores the client's existing pane visibility setting.

## Make thread structure visible

- **Show thread expand arrows** exposes the thread expand/collapse controls.
- **Show thread connection lines** draws guides between replies in expanded threads.
  It is on by default.

These are message-list controls. They are separate from **Compact long
conversations**, which affects the optional [conversation reader](conversations-and-writing.md#long-conversations).
Columns, interface font size and density otherwise remain native client settings.

## Remove a repeated banner from snippets

For mail that begins with a gateway disclaimer:

1. Enable **Customize message previews**.
2. Set **Initial lines to skip** to the number of opening lines to omit, from 0 to 100.
3. Put a repeated banner in **Leading text to skip**, for example `External email`.
4. Leave the control to save and check the preview in the message list.

Line skipping happens first; the remaining leading text is then matched literally,
ignoring whitespace differences. This is not a regular-expression replacement and
does not remove matching text elsewhere in a message. Start with zero skipped lines
and adjust one field at a time so useful first sentences are not hidden.

Skipping lines requires locally available body text with line breaks. If a preview
does not change, open/download the message and check the source of the snippet.
Disabling the option restores normal snippets. Reading, replying to or exporting
the message still uses its original body.

## Configure colored stars

**Colored stars** is off by default. Enable it to choose a cycle of markers:

1. Choose **1 star**, **4 stars** or **All stars** as a starting preset.
2. Drag markers between **In use** and **Not in use**, or click a marker to move it.
3. Reorder **In use** by dragging. With a marker focused, Left/Right moves it in
   the order. At least one marker remains active.
4. In the message list, click an empty star to apply the first active marker.
5. Click it again quickly to advance through the active order. Successive clicks
   on the same message within 1.5 seconds cycle markers; a later click removes it.

The four-marker preset is yellow star, red star, blue star and orange guillemet.
The complete set also includes orange/purple/green stars, exclamation marks,
a green check, a blue information symbol and a purple question mark.

The starred flag uses the native message flag; the chosen color/symbol is a
Thunder-G message property. Do not assume another mail client will reproduce the
color. Label exports are not a backup of colored-star choices. Search supports
marker names such as `has:blue-star` and `has:purple-question`.

## Other list indicators

| Option | What it shows |
| --- | --- |
| **Show new-message symbol** | Thunderbird's golden symbol beside newly received mail; hidden by default |
| **Use Gmail-style label icons** | Filled shapes in the Labels sidebar, using the label's color |
| **Personal level indicators** | `›` for mail addressed to you and others; `»` for mail addressed only to you |

Personal indicators compare configured identities with To/Cc recipients. Messages
identified as mailing-list mail by List-ID do not show these indicators.
They are a visual hint, not an access-control or sender-authentication check.

## Language and macOS Dock icon

**Interface language** offers Automatic, English and Italiano. Automatic selects
Italian for Italian client locales and English otherwise. Changing it updates
Thunder-G controls in existing windows, without translating message text or user
label names. Native client controls retain their own language.

On macOS, **Appearance → Use Thunder-G Dock icon** changes the running client's
Dock icon without modifying the application bundle. Choose **Light**, **Dark** or
**Auto (follow macOS)**, including a separate icon choice for each appearance.
Disabling the option restores the original icon. The option is not available on
Windows/Linux and does not implement macOS Clear/Tinted icon styles.

## Startup and a slow mailbox

At startup the logo covers the mail area while the mailbox prepares. It fades
when visible messages or a completed empty folder are ready; background account
synchronization can continue afterward. After eight seconds, a slow startup uses
a non-blocking waiting card so folder navigation remains available. **Show mail**
dismisses the splash at any time, and offline mode makes navigation available
immediately. A waiting card is not a request to reconfigure the account or reinstall.

## Dates in the list

Messages from today show a time; earlier messages in the current year show month
and day, and older ones include the year. Hover the date for the full timestamp,
including seconds and timezone. Display follows the interface locale and local
timezone; the shortened text does not change the message's stored date.
