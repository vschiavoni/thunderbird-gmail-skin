# MailDemo

Self-contained React mail simulation. Copy this entire directory into another
React project with JSX, CSS Modules and image imports (for example Vite).
It has no Docusaurus imports, backend, account connection or external asset URL.
It uses React 18+ hooks; browser listeners and timers are installed in effects,
with cleanup when a menu closes or the component unmounts.

```jsx
import MailDemo from './components/MailDemo';

export default function Page() {
  return <MailDemo />;
}
```

| Prop | Default | Purpose |
| --- | --- | --- |
| `standalone` | `false` | Taller demo workspace for a dedicated embed |
| `logoSrc` | Bundled `assets/logo.png` | Replace the displayed logo with your own asset URL |
| `className` | Empty string | Add a wrapper class for host-page positioning |
| `theme` | `auto` | Follow the host/system theme, or set `light` or `dark` |

The component imports its own CSS Module and logo. No global stylesheet or host
router is required. `package.json` exposes JSX source, not a precompiled browser
bundle: the destination project's bundler must process JSX, CSS Modules and PNGs.
The package is private; copying it does not publish anything to a registry.

Sample messages, labels, their shared color palette and search filtering live in `model.js`.
Sidebar icons and message chips resolve colors by the full label name, so folding
a sidebar branch does not change another label's color. Each mounted
instance has independent in-memory state; reload/unmount resets it. Search, stars,
labels, bulk actions, compose/reply and timed snooze are simulated. Nothing
is sent, saved to local storage or fetched from a mail account. The 30-second
snooze returns mail while the component remains mounted.

Labels and Snooze menus dismiss on a pointer press outside their own trigger/menu,
including elsewhere on the host page. Clicking within the menu remains usable;
Escape closes menus through the demo's keyboard handler.

All sample senders are generic teams or services. Addresses use the reserved
`example.invalid` domain; message text, files and dates are fictional. Keep
replacement fixtures generic when embedding the component elsewhere.

## Writing and selection

`DemoComposer.jsx` shares `DemoIcon.jsx` and the component CSS. New messages open
in a floating panel; replies appear below the conversation. Minimize, expand,
detach/return, Cc/Bcc, formatting and draft controls operate on demo state. There
is no native separate-window editor or real transport. File selection/drop keeps
filenames only; file contents are never read or uploaded.

Typing saves a demo draft after 1.5 seconds of inactivity. Close preserves written
content in the simulated Drafts folder; reopen it there to continue. Discard removes
that draft. Empty editors do not create automatic drafts. Everything is still lost
on reload or reset. Escape dismisses an open menu first, then closes/saves writing.

Selecting Inbox rows replaces the idle toolbar with archive, spam, delete,
read/unread, snooze, move and label actions. The dropdown selects all/none,
read/unread or starred/unstarred rows within the current filtered view. Clicking
a partial or full select-all checkbox clears selection, matching the extension.
Label checkboxes show mixed assignments; toggling a mixed label applies it to all
selected conversations. Menus dismiss outside their triggers/panels.

## Light and dark appearance

In `auto` mode the component follows a host document's `data-theme` when present,
then the system color preference. The small sun/moon control overrides it for
this mounted demo only; it does not change the host website or store a preference.
The optional `theme` prop selects the initial mode when embedding elsewhere.

Surfaces, selection, menus, mixed/checked boxes, conversation cards and the
composer have separate light/dark colors. The dark reference was checked with
Thunder-G 0.29.0 from production main on Thunderbird 159 in a separate local
profile containing fictional mail. Label chips use the `chipColors` mixing
formula from `thunder-g/labels.js`; sidebar icons use the native label base color.
No Thunderbird or Docusaurus runtime is required by the component.

Clicking a sidebar label or a message chip opens the exact native-label view in
the simulation. Parent and child label assignments are independent; a parent
view does not implicitly include its descendants. Message chips are separate
buttons, so using one does not open or mark the conversation as read.

## Keyboard shortcuts

Click inside the demo to focus it. `/` focuses mail search, `c` opens the composer,
and `?` toggles shortcut help. Select conversations with their checkboxes or open
one before using `l` (labels), `s` (star/unstar), `b` (snooze), or `e` (archive).
Star applies to every selected conversation: it stars the selection unless all
are already starred, in which case it unstars them. Escape closes the current
menu, help, composer or conversation, in that order. Letter shortcuts do not
intercept typing in search, recipient fields or the message editor, or modified
host-page shortcuts such as Ctrl/Cmd+K. Ctrl/Cmd+Enter remains a composer action.
