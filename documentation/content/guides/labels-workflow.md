---
description: "Apply and organize Thunder-G labels, create nested paths, adjust sidebar and message-chip visibility, and review conversation-wide changes."
---

# Organize mail with labels

Thunder-G uses the client's native tags. Label definitions are shared by the
profile's accounts; synchronization to another device depends on the provider
and the other client. It does not turn Thunderbird tags into Gmail server labels,
and cross-client Exchange tag synchronization is unsupported.

## Apply an existing label

1. Select a message in the list, or open a conversation.
2. Press **L**, then search by the label's full name or nested path.
3. Use Up/Down to navigate and Space to toggle a checkbox, or click it.
4. Close the picker with Escape and check the chips beside the subject.

The picker does not require **Gmail keyboard shortcuts**. In the list, label changes
apply to the conversations containing the selected messages. In Thunder-G's reader,
they apply to the whole resolved conversation, including locally available sent replies.
Native numeric tag actions and chip removal also use conversation-wide updates.
The active message in the reader determines the toggle's starting state; it does
not restrict the update to that one message.

A mixed checkbox means only some resolved messages carry the tag. Wait for
conversation loading before changing it, and check any reported cross-folder failures.
Messages are related through native threads and exact Message-ID/References links
in available local account summaries, not by matching subject text.

New arrivals inherit the union of existing conversation labels without removing
other assignments or changing read/unread state. Installation itself does not
relabel the mailbox in bulk.

## Create a nested label

For a project hierarchy such as `Work/Project A`:

1. Select the intended conversation and press **L**.
2. Choose **Create new**, enter `Project A`, enable **Nest label under**, and select `Work`.
3. Check the created label on the conversation.

Creating from the picker also assigns the label to the selected conversations.
To create a definition without assigning it, use a sidebar label's **⋮ → Add
sublabel** instead. Enable the native **Tags** folder-pane mode to see the Labels tree.

Parent and child assignments are independent. A message tagged `Work/Project A`
is not automatically tagged `Work`. Missing intermediate parent definitions do
not delete children; the tree uses the closest existing ancestor. The picker
always shows full paths, regardless of collapsed branches.

## Keep the sidebar and list readable

Hover a sidebar label, or focus it with the keyboard, and open **⋮**.

| Control | Effect | What stays intact |
| --- | --- | --- |
| **In label list → Show** | Always shows the sidebar entry | Assignments and list chips |
| **Show if unread** | Shows it when native unread counts require it | Label definition and assignments |
| **In label list → Hide** | Moves the entry behind **More** | Picker entry and mail |
| **In message list → Hide** | Hides chips beside subjects | Sidebar entry and assignments |
| **Remove label** | Removes the native label after confirmation | Emails and sublabels |

**More/Less** reveals or collapses hidden sidebar entries. A visible child keeps
its ancestor path accessible. A currently selected label remains visible until
you navigate away, even if its unread count reaches zero.

## A label is missing: check the right place

Sidebar visibility and message chips are separate settings. Start by opening
**L** on the affected conversation: a checked label confirms an assignment,
but does not guarantee either display is enabled.

Hiding a label does not remove assignments. Avoid deleting and recreating it to
repair a display issue; that changes the definition instead of its visibility.

## Rename or reorganize several labels

Use **⋮ → Edit** for a parent rename that also updates descendant paths. The
native tag editor edits individual full names and does not perform that same cascade.

For a batch change, select sidebar labels with Shift or Command/Ctrl, open **⋮**
on a selected label, then choose **Edit selected labels…**. Review the proposed
paths before Apply. **Keep current** preserves mixed values. Parent/child pairs
move together once, including descendants; shared colors and visibility apply
only to explicitly selected labels. Duplicate paths and moves into a selected
subtree are rejected. Native tag keys and message assignments are preserved.

Opening the menu on an unselected label edits that label alone. Export a
[label backup](moving-to-another-computer.md) before a large reorganization.

## Find mail or remove an assignment

Click a chip, or activate a focused chip with Enter/Space, to open its native tag
view across folders. This does not require global search indexing. The separate
**×** removes the tag from the conversation rather than opening results.

**Inbox** is a system chip reflecting actual Inbox membership, not a user tag.
Removing its **×** archives the conversation. Use this distinction when deciding
whether to hide a chip, remove a tag assignment, delete a label definition or archive mail.

For the full behavior and synchronization limits, see the [label reference](../docs/labels.md).

## Undo a recent label change

When a label-change notice offers **Undo**, use that notice to reverse the recent
change. Check the reported outcome; an undo can itself fail. This is distinct
from the native `z` command and is not a general rollback of label definitions,
backup restores or all previous changes. A new notice replaces the prior one.
