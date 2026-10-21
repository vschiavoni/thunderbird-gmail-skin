# Changelog

## Unreleased

- Renamed the companion to **Thunder-G**, with a new icon, refined Gmail-style
  controls, Previous/Next navigation, local previews, and row actions that occupy
  space only on hover or keyboard focus.
- Styled Conversations with compact headers, per-message and subject tag chips,
  individual tag removal, print/forward icons, and extended light/dark support.
  Tag chips in the list and conversations use coordinated
  pastel backgrounds and colored text, with a lighter text palette in dark mode.
- Fixed selection cleanup, navigation and preview lifecycle; improved uninstall
  recovery and added local release tooling. Accepts Thunderbird 153–158.x;
  cross-version and full visual verification remain pending.

## 0.7.1

### Gmail-style label panel

The L picker now reads **Label as:** and follows the supplied Gmail reference:
plain square checkboxes without color dots, regular-weight heading, a wider panel,
compact rows, underlined search with a magnifying glass, and a divided footer.
**Create new** opens Thunderbird's New Tag dialog; **Manage labels** opens its tag
settings. Native tag metadata, immediate application, search and keyboard navigation
remain unchanged. Theme colors follow Light/Dark. The list scrolls independently of
the heading/search/footer. Ordering remains Thunderbird's existing tag order.

Validation: 13 automated tests pass, including heading and footer native-command
routing. In Thunderbird, L opens the panel, the heading/footer appear, searching
filters labels, and Create new opens New Tag (cancelled without changing tags).

## 0.7.0

### Searchable label picker

Select one or more messages, or open a conversation, then press **L** (without modifiers).
The Labels toolbar button opens the same picker. Type part of a label name to filter;
search ignores case and supports Unicode names. Use Up/Down to navigate, Space to
check or uncheck the focused label, and Escape or a click outside to close.

Changes apply immediately through Thunderbird's native tag command to the current
selection. Checked means every selected message has the label; mixed means only
some do. Checking a mixed label applies it to all selected messages. Existing tag
names, keys, colors, and assignments are preserved. Changing folders or selection
closes the picker so it cannot act on a stale selection.

Bare L replaces Thunderbird's Ignore Subthread shortcut in the mail browsing pane.
It does not override typing in search fields/editors, modified shortcuts, or other
tabs. This shortcut is part of the desktop skin; it does not add an iOS shortcut or
change the account's existing tag synchronization support.

Validation: 13 automated tests pass, including search, shortcut guards, legacy/mixed
tag states, native bulk add/remove delegation, stale selection rejection and focus
restoration. Live Thunderbird checks cover opening from list/conversation views,
search matches/no matches, arrow navigation and Escape. Real mail tags were not
changed during testing.

## 0.6.0

### Dark mode

Choose **Tools → Add-ons and Themes → Themes → Dark → Enable**. Light restores
the light palette; System theme — auto follows the operating-system appearance.
The skin responds to the theme's `prefers-color-scheme` setting without a restart
once its CSS is installed. Dark surfaces cover the sidebar, message list,
heading, compose button, selection, and reading/bulk action bars. Inline label
chips use darker tints with light text; tag definitions and colors are unchanged.
High-contrast mode retains native colors.

Conversations supplies its own existing dark header/card styles. The skin does
not invert or rewrite email HTML bodies: those remain subject to Thunderbird's
message-color settings and the message author's explicit colors. Third-party
add-on toolbar icons and custom themes may need their own adjustments.
Nine existing regression tests pass. Manually verified live Light/Dark switching, dark list/labels, dark selected rows and bulk toolbar, loaded conversation cards and reader toolbar, Back navigation, and return to Light. The original Light theme was restored after testing.

## 0.5.0

### Compact dates

The message-list Date column shows a time for messages dated today, abbreviated
month/day for other messages in the current year, and includes the year for
older mail. Formatting follows the UI language and the computer's local time
zone. Hover reveals the full weekday, date, year, time (including seconds), and
zone. Dates refresh at local midnight and when the window regains focus.

This changes only rendered text and tooltip data, not message timestamps or
sorting. The Received column and conversation-reader timestamps remain native.
The renderer preserves native row accessibility descriptions and removes its
hook, timers, and display changes on shutdown. Nine tests pass, including local
midnight/year boundaries, invalid dates, virtual-row reuse, tooltip translation,
and restoring native strings. Live Thunderbird cells were verified to display
short dates with full timestamp tooltips.

## 0.4.2

Native header/row checkboxes are consistently 18 px, with stronger hover and
checked-state contrast. Selected rows keep a light blue #c2dbff background on
hover and when focus moves to the toolbar. High-contrast mode retains native
selection colors. The bulk toolbar replaces the folder heading while selecting,
rather than inserting a second heading row. Clearing selection, opening the
reader, changing folders, or disabling the companion restores the heading.
Seven regression tests pass. Live UI checks covered compact checkbox appearance,
selected-row color, multiple selection, toolbar placement, and heading restoration;
no archive/delete/move/tag operations were executed during verification.

## 0.4.1

Arrow-only Back button with accessible name and tooltip. Consistent 20 px SVG
icons inside 36 px circular buttons, 2 px spacing, and vertical separators
between navigation, mail actions, follow-up actions, and move/labels. Bulk
selection uses an X icon for Clear selection and retains the selected count.
The 44 px bar keeps visible keyboard focus and a distinct disabled state.
Verified the reading bar visually, Back returning to the list, bulk selection,
and clearing selection in Thunderbird. Seven regression tests pass; no mail
mutation was executed during UI verification.

For a portable rollback, keep the source ZIP for your previous release. Quit
Thunderbird, uninstall using the installer from the currently installed release,
then install the previous release. This applies to profiles managed by the
portable installer; local development rollback scripts are machine-specific and
are intentionally excluded from public packages.

## 0.4.0

The native selection checkbox column is visible before the star controls. Tick
individual rows or use the column header to toggle selection of the current
view. Selection uses Thunderbird's native thread semantics, including child
messages when a collapsed thread is selected. Checking rows keeps the reader
closed and displays a bulk toolbar for archive, spam, delete, unread, move, and
labels. The clock is disabled for multiple messages because Follow-Ups schedules
one message at a time. Clear selection hides the toolbar. A checked label means
all selected messages have it; selecting an unchecked label applies it to all,
and unchecking a checked label removes it from all. Mixed tags appear unchecked.

Verified two-row selection, correct count, label menu, and clearing in the live
inbox without executing mail mutations. A mock regression test verifies that
Archive receives the native multi-message selection. Column visibility/order
changes are applied while the companion runs; its saved in-memory originals are
restored on shutdown.
