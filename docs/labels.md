# Labels  ![](resources/microelements/labels.svg)

To move labels and their email assignments to another Thunderbird setup, use
**Preferences → Labels → Export labels and assignments**. After downloading the
same mail on the new computer, preview and restore the saved file. See the
[label backup guide](label-backup.md) for matching rules and missing messages.

Press **L** to search and apply labels; use Up/Down, Space to toggle and Escape to close.
In the list, changes apply to selected messages; in the conversation reader, they apply to the whole resolved conversation, including sent replies.
Numeric tag shortcuts target the active message, identified by a slim marker.

The **×** removes a label only from that message; clicking the chip opens matching mail across folders.

<img src="resources/microelements/label_menu.svg" align="right" width="110" alt="Docs tree">
A mixed checkbox means only some messages have the label; wait for conversation loading before applying changes, and check reported failures on cross-folder updates.


## Nested labels

Native tags named with `/` paths are displayed as expandable nested labels in the Tags sidebar and in the `L` label picker. For example, `Work`, `Work/PhD` and `Work/PhD/Project` form a three-level tree. Enable the native Tags folder-pane mode to see this sidebar. Existing tag keys and message assignments are preserved, and message chips show the full path. Searching the picker finds children even inside collapsed branches.

Select messages, press `L`, choose **Create new**, enter a name, enable **Nest label under**, and choose an existing parent. Creating a label applies it to the current selection or resolved conversation, including sent replies. Parent and child assignments are independent.

The hierarchy is derived from native tag names, not a separate skin database. Other clients see the full path when they support those same native tags; this feature does not add tag synchronization to a server/client that lacks it. Paths whose intermediate parents do not exist remain under the closest existing ancestor. Create those parent tags to show the missing levels. Native Manage Labels can edit individual full paths; renaming a parent does not automatically rename its descendants.

## Sidebar label menu

Hover a label in the Tags sidebar and click its three-dot button (also available on keyboard focus). The menu provides preset/custom label colors, Show/Hide in message-list rows, Edit, Remove label and Add sublabel.

Show/Hide is a local skin preference: hiding a chip preserves its native assignment and sidebar/picker entry. Editing a full path renames the label and its descendants while preserving their keys; conflicting paths are rejected before changes. Remove label asks for confirmation and keeps emails and sublabels. Add sublabel creates an unassigned native tag beneath the chosen parent, without applying it to the currently selected emails. Colors and names use Thunderbird's native tag service; other clients' behavior still depends on their tag synchronization support.

## Click a label to find matching mail

Click a label chip in the message list or conversation view to open its native Thunderbird tag view across folders. The tooltip identifies the label, and Enter/Space also activates a focused chip. This uses the exact tag key, including nested labels, and does not require global search indexing or Gmail query syntax. Existing quick-filter constraints are cleared for the results while preserving the sticky-filter preference. The conversation reader closes to reveal the matching list. The separate × button still removes the tag from that message; it does not open the tag view.

Hiding chips keeps assignments; removing a label keeps emails and sublabels.
**Edit** renames descendants too, unlike Thunderbird’s native tag editor; **Add sublabel** creates a label without assigning it to selected mail.

## Label list visibility

Open a label’s three-dot menu and use **In label list**: **Show**, **Show if unread**, or **Hide**. The default is Show. Hidden labels, including unread-only labels with no unread messages, can be revealed with **More** at the bottom of Labels; **Less** collapses them again. Revealed labels retain their normal nested hierarchy.

A visible child keeps its parent path accessible. The currently selected label also stays visible until you navigate elsewhere, even if its unread count reaches zero. Choices are stored by stable native tag key, so renaming a label preserves its setting. These choices are independent of **In message list**, which controls chips beside email subjects.

Unread visibility uses Thunderbird’s existing native counts and change notifications. It does not scan mail or poll the server; label hierarchy updates are cached and notification bursts are batched.

## Edit multiple labels

Select several labels in the sidebar using Shift or Command/Ctrl, then open **⋮** on one of the selected labels. **Edit selected labels…** lets you choose a shared parent, color, sidebar visibility and message-list visibility. Fields default to **Keep current** so mixed values are preserved. The menu’s color and visibility actions also apply to the selected labels.

The editor previews all changed label paths before Apply. Selected parent/child pairs move together once, including descendants; color and visibility change only explicitly selected labels. Native tag keys and message assignments stay intact. Duplicate paths and moves into a selected subtree are rejected before writing; failed writes attempt to restore earlier values. Opening a menu on an unselected label edits only that label.
