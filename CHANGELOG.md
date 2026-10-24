# Changelog

## Unreleased

- Add an optional Gmail label importer in settings: external-browser Google sign-in, verified account identity, custom-label selection and nested native tags under a configurable parent.
- Default to dry run with per-path create/skip/conflict reporting, branch exclusions and explicit import; recheck the local plan before writes, preserve existing labels and support safe retries after partial failure.
- Keep Google credentials/tokens session-only, request no Gmail message scope, and document the optional Desktop OAuth client setup. Real Google sign-in still requires client configuration and end-to-end validation.

## 0.14.0

- Enable native updates from stable GitHub Releases with versioned downloads, SHA-256 checks and compatibility bounds.
- Add a stable-release workflow and reproducible XPI/source packaging; refuse to replace different published assets.
- Use extension-bundled styles for new installs and provide backed-up legacy CSS migration with conflict checks.
- Route reader zoom to message content, including conversation cards and separate message windows.
- Hide pagination artifacts, open threaded views collapsed and route message-body context menus to the correct message.
- Add installation, update, label and development guides while retaining the 0.13.0 label and column-header features.

## 0.13.0

- Move attachment indicators immediately before the date.
- Make the label assignment panel more compact.
- Redesign the label color palette with text previews.
- Hide column headers by default, with a setting to restore them.

## 0.12.0

- Make message and conversation label chips open their exact native tag view, with tooltips and keyboard access; preserve the separate remove action.

## 0.11.0

- Constrain sidebar label menu buttons to 28 pixels at the right edge; preserve space for label names and message counts.

- Add a hover/focus three-dot sidebar label menu with colors, message-list visibility, subtree editing, removal confirmation and sublabel creation.

- Add expandable nested native labels in the Tags sidebar and label picker, searchable by full path.
- Add a New label panel with a parent selector; preserve existing tag keys, full-path chips and conversation-wide application.


### Added

- Label picker headings show whether changes apply to one message, selected
  messages or the entire conversation, with its message count and sent replies.
  A subtle marker identifies the active message targeted by numeric tag shortcuts.
- Floating composers remember their chosen size across messages and restarts,
  adapting to the available space beside the sidebar. Size preferences are saved
  after a resize gesture, not on every pointer move.

- Optional thread connection lines in the native message list. Enabled by
  default and configurable under Inbox, with immediate updates. Connectors follow
  expanded native thread boundaries, end at each thread’s last reply and leave
  collapse controls, columns, indentation and pagination unchanged.

- Extension homepage links to the main GitHub repository in the manifest and
  settings header.
- Redesigned settings with the bundled logo, version, section navigation,
  accessible switches, compact expandable explanations, light/dark layouts and
  visible save/error feedback. Experimental-feature and BIMI download notices
  remain visible beside their controls.

- In-window draft status for native manual save and configurable autosave:
  Saving…, a green ✓ Saved only after confirmed success, Unsaved changes after
  edits, and Save failed on errors. Editing during autosave cannot leave a stale
  Saved confirmation. Native signatures, attachments and Drafts folders are retained.
- Resizable floating composers with top/side edge handles, a visible corner grip
  and keyboard resizing. Sizes stay within the message area beside the sidebar
  and are retained across detach/return transitions.

- Shared in-memory preview cache for the message list and conversation reader:
  up to 300 short text previews, expiring after five minutes, with local reads
  reused across consumers and replacement-message checks.
- A bounded 30-second cache of local Sent summary metadata, sharing concurrent
  scans and invalidating on message/folder changes. No message bodies are stored
  in this cache or downloaded for preview generation.

- Separate, off-by-default **Compose new messages in this window** setting.
  Write opens the native composer in a detached panel, expandable within the
  message area without opening a new tab or covering the folder sidebar. Uses the
  selected folder's identity, native signatures, attachments, draft handling and
  a separate-window control. Existing unsent replies/messages are focused instead
  of replaced; newsgroup posts retain native behavior.

- Opt-in Gmail-style conversation reader, independent of Thunderbird Conversations,
  with local-index grouping and a folder-thread fallback. Includes discovered sent
  replies, compact message cards, account/contact avatars, subject labels, native
  message bodies and attachments, printing, and reply actions below the messages.
  The most recent message stays expanded.
- Configurable inline Reply and Reply all using Thunderbird's native composer,
  account identity, signatures, formatting, attachments and draft machinery.
  Replies start below the conversation, can detach into a floating panel and
  return inline, or transfer through a saved native draft to a separate compose
  window. Navigation preserves an open reply; closing honors native draft prompts.
- Configurable native draft autosave interval, with restoration of prior native
  preferences when the feature is disabled or unloaded.
- DKIM status chips for verified, unsigned, failed and unchecked messages, using
  the optional local DKIM Verifier compatibility bridge. The separate DKIM button
  is hidden; ordinary DKIM Verifier installations do not provide this bridge.
- Opt-in BIMI domain logos with explicit disclosure of DNS lookups and logo
  downloads, bounded caching and fallback avatars. Only the advertised logo is
  downloaded; no external logo lookup service is used. See integrations/README.md
  for provider requirements and validation limits.

### Changed

- Move setting descriptions from the README to [the settings guide](docs/settings.md),
  with defaults and short explanations for each option. Include the guide in source bundles.

- Start the native message viewer while conversation-index and Sent lookups are
  still running. Reuse the viewer when membership is unchanged; conversation-wide
  labels and footer replies wait for the complete scope, including sent replies.

- Renamed the extension ID from `inline-labels@local.gmail-skin` to
  `thunder-g@vschiavoni`, matching the Thunder-G name and primary author. Updated the installer and optional
  DKIM bridge allowlist. Thunderbird treats this as a different add-on: uninstall the previous extension,
  then install the new Thunder-G package. Add-on-local settings do not migrate
  automatically; native messages and tags are unaffected.
- Experimental conversation and inline-reply features require disabling Thunderbird
  Conversations because conversation handling is now built into Thunder-G.

- Pagination uses Thunderbird's original virtual message list. Controls sit beside
  Quick Filter; page size is configurable and native font-size shortcuts remain
  available outside text fields.
- Copy view also copies native column visibility and order to the destination,
  respecting the selected descendant scope. The native Copy columns command and
  outgoing-folder From/Recipient handling remain available.
- Reply-panel controls use visible labels and panel/window icons instead of
  standalone arrows. The attachment paperclip is rotated 90 degrees.
- Per-message More uses a spaced vertical-ellipsis button. Conversation labels sit
  beside the subject, with removable chips and compact message headers.

### Fixed

- Keep message-list labels visible when row actions appear in narrow panes.
  Smart actions occupy space only on hover or keyboard focus. Settings save
  confirmations dismiss automatically while errors remain available.

- Avoid refitting columns and repainting pagination when only row text, tag chips
  or previews change. Reuse date formatters and unchanged chips, skip redundant
  paging/style updates, and stop retaining detached date cells from recycled rows.

- Make each thread-arrow activation toggle once, including rapid repeated clicks
  and button activation. Keep native expansion, selection and keyboard behavior,
  enlarge the click target without moving the icon, and cancel queued reader opens
  when the arrow is used. Refresh page boundaries on native thread-change events.

- Keep the final Date column divider visible and enabled beside the column picker.
  Dragging the Subject divider redistributes space to Date during the drag and
  saves the balancing width through native column storage without overflowing
  the mail pane.

- Stop pagination from reopening collapsed threads on every repaint. Page totals
  count the messages inside collapsed threads while scrolling uses visible rows.
  Threads crossing page boundaries remain reachable, and explicit page selection
  reveals only affected threads to avoid selecting hidden off-page messages.

- Anchor the embedded composer attachment picker to the main mail window on
  macOS so the native file chooser opens correctly. Native attachment conversion,
  multiple-file selection and the last attachment directory are preserved.

- Hide the page scrollbar while the conversation replaces the message list.
- Keep extension startup available with safe defaults if optional preferences
  cannot be loaded; read all startup preferences together.

- Size the message-list scrollbar to the current page, reset it on page changes,
  and hide it when the displayed messages fit without scrolling.

- Prevent macOS compose-toolbar titlebar offsets from overlapping the embedded
  composer footer; keep its surface opaque and clipped to the panel.

- Pagination totals and page boundaries preserve all native message rows, including
  expanded threads. Short final pages no longer retain a full page of blank space;
  switching pages resets scroll without a smooth-scroll animation.
- Resizing the last column keeps the table within the pane. Responsive sizing reads
  native saved widths instead of overriding them with stale preferences. The reader
  no longer forces checkbox-column visibility/order or hides native Tag/Spam columns.
- Conversation-wide L label operations include resolved sent replies; individual
  message tag shortcuts target the opened message rather than the first message.
- Read/unread actions use current message flags, including mixed selections and
  delayed automatic marking. Failed draft transfers retain the embedded reply.

### Validation

- Regression checks cover label scope and active-message targeting, floating-size
  persistence, viewport limits and settings confirmations. Successful settings
  feedback dismisses after 3 seconds, or 6 for explanatory text; errors remain visible.
- Live Thunderbird checks confirmed that closing and reopening an empty
  new-message composer restored the resized dimensions with the sidebar visible.
  No mail was sent.

- Live Thunderbird performance checks covered scrolling, folder/page changes,
  repeated thread-arrow clicks and the 19-message final page. The page scrollbar
  followed native scrolling, columns stayed within the pane and the sidebar
  remained visible. No list mutations occurred during a five-second idle check;
  a clean restart recorded no Thunder-G script errors. A 40-step scrolling check
  kept individual row fills below 2 ms in the optimized run; this is a smoke check,
  not an application-wide speed guarantee.

- Performance regressions check that cell/preview updates schedule no column or
  page work, scrolling does not rewrite the page announcement, unchanged chips
  are retained, and 500 date rows use four formatters. A local isolated benchmark
  of 300 dates improved from about 15 ms to under 1 ms across five warmed runs;
  this measures date formatting, not application-wide responsiveness.

- Live Thunderbird checks covered thread-arrow button activations with click
  counts 0–3, native Left/Right keys and collapse/reopen on the first and second
  pages. Every activation changed the thread state once and message totals stayed
  unchanged. Regression tests also cover canceling queued reader opens and native
  structure changes with unchanged row counts.

- Live Thunderbird checks confirmed immediate thread-guide on/off updates, native
  collapse/reopen behavior and next/previous pages with unchanged message totals.
  The redesigned settings and bundled logo were visually checked at normal width
  and a temporary 560px viewport; the original width was restored afterward.
- Settings checks cover manifest metadata, control/label wiring, packaged local
  logo assets, all preference groups, autosave dependencies and save-error rollback.
- Live Thunderbird checks confirmed the native one-minute autosave setting,
  Saved after actual draft success, clearing confirmation on new edits,
  manual Save draft, floating resize with the sidebar visible and expansion/return.
  The native autosave handler was invoked directly for the check; no mail was sent.
  Regression tests cover failure with an existing draft URI, edits during autosave,
  native field updates, viewport limits, pointer capture, keyboard resize and cleanup.
- Live Thunderbird column checks covered the exposed final Date divider,
  redistribution from Subject to Date, native width persistence and retaining
  the resized layout across next/previous page changes. The table stayed within
  the mail pane. Regression coverage includes native divider re-enabling,
  explicitly fixed columns, drag-time balancing and cleanup.
- Live Thunderbird collapse/reopen/collapse and next/previous-page checks kept
  the thread closed and the full message count unchanged. Automated regressions
  cover collapsed threads spanning pages, native group headers and exact-page
  bulk selection.
- Cache regressions cover shared preview reads, identity changes, expiry and LRU
  eviction; shared Sent scans, invalidation and retention limits; and early native
  rendering without exposing incomplete conversation-wide label/reply scope.
  Live Thunderbird opening/reopening checks completed with no Thunder-G errors
  recorded. No before/after latency benchmark has been claimed.
- Follow-up Thunderbird checks covered all 15 pages of a 1,430-message folder,
  page-relative scroll limits, a 19-message final page, and hiding/restoring the
  page scrollbar when switching between list and conversation.
- New-message checks covered detached/full-area transitions with the folder
  sidebar visible, preservation of edited text, and native Cancel/Discard prompts.
  An inline-reply test confirmed the native file chooser opens and a synthetic
  attachment survives detach/return transitions. No messages were sent.
- The existing local DKIM bridge prototype was rebuilt for the current add-on ID;
  a real signed-message check returned the provider's verification result. This
  does not establish compatibility with unmodified DKIM Verifier releases.
- 89 automated tests pass, covering pagination, column sizing and copy scope,
  conversation labels, read/unread state, compose lifecycle, DKIM bridge and BIMI.
- Live Thunderbird checks covered inline/floating transitions and transfer to a
  native compose window with identity, recipient, subject and quoted body intact.
  Attachments were saved/reopened in a native draft; attachment transfer through
  the new separate-window action and the cross-account Copy view workflow still
  need live confirmation. Native signature text was not configured in the accounts
  used for testing. No messages were sent.
- Betterbird was not tested or changed during this work. Compatibility with
  third-party compose add-ons and the full supported Thunderbird version range
  remains unverified. Live Thunderbird checks confirmed the current-page
  scrollbar and the 19-message final page. A live new-message check confirmed Write
  opens the native composer inside the current mail window; new-message attachment,
  draft and separate-window transfer checks remain pending.

## 0.8.0

- Renamed the companion to **Thunder-G**, with a new icon, refined Gmail-style
  controls, Previous/Next navigation, local previews, and row actions that occupy
  space only on hover or keyboard focus. Added responsive inbox columns and
  compact actions for narrow mail panes, while allowing native manual resizing.
- Styled Conversations with compact headers, per-message and subject tag chips,
  individual tag removal, print/forward icons, and extended light/dark support.
  Tag chips in the list and conversations use coordinated
  pastel backgrounds and colored text, with a lighter text palette in dark mode.
- Fixed bulk-mode control visibility, hover-action interaction, and conversation
  chips refreshing after native tag changes. Removed redundant space below
  message tags. Preserve the user’s Today Pane
  setting and its native toggle. Added an optional, reversible setting to hide
  the Today Pane completely. Improved selection cleanup,
  navigation, preview lifecycle and startup readiness; improved uninstall
  recovery and added local release tooling. Accepts Thunderbird 153–158.x;
  cross-version and full visual verification remain pending.

## 0.7.2

### Conversation-wide labels

In an **open conversation**, L / Label as applies or removes the label on every
message currently displayed by Thunderbird Conversations, including sent replies
and messages stored in other folders. Checkbox checked/mixed states use that same
scope. Existing tags and native storage are preserved. Writes are grouped by
folder, using Thunderbird's own add/remove keyword operations; list selection is
not changed to reach Sent. The label picker in the inbox list retains its previous
native selected-message scope. This release does not merge PR #1.

The extension resolves Conversations' message IDs with Conversations' own message
manager. If the conversation is loading or any displayed header cannot be resolved,
the picker asks you to retry rather than silently tagging only the inbox subset.
If navigation or the conversation membership changes while the picker is open,
the previous scope cannot be updated. Cross-folder writes are not atomic: an error
is shown if a folder rejects an update; previously successful writes may remain.
Create new in the conversation uses the same full-conversation scope.

This acts on existing displayed messages, not future replies or undiscovered mail.
It does not add cross-client Exchange tag synchronization. Individual controls in
third-party add-ons may still use their own per-message/selection scope; use L or
the skin's Label as button for conversation-wide tagging.

Validation: all 15 automated tests pass, covering Inbox/Sent identity resolution,
duplicate headers, incomplete scopes, exact per-folder add/remove operations,
write failure propagation and prior label-picker behavior. In the isolated UI,
the picker resolved the displayed conversation's native headers. Full end-to-end
live discovery of an outgoing Sent reply was not verified: the fresh offline test
profile's global index remained empty. No real-mail tags were changed for testing.

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
