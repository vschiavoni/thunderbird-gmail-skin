<div align="center">
  <img src="documentation/content/docs/resources/logo.png" height="100" alt="Thunder-G logo">
  <h3>Thunder-G</h3>
  <p><i>A Gmail-inspired interface for Thunderbird.</i></p>
  <p>
    <a href="https://github.com/vschiavoni/thunderbird-gmail-skin/releases/latest"><img src="https://img.shields.io/github/v/release/vschiavoni/thunderbird-gmail-skin?style=for-the-badge&amp;color=3b82f6&amp;labelColor=172554&amp;logo=github&amp;logoColor=white" alt="Latest release"></a>
    <a href="https://github.com/vschiavoni/thunderbird-gmail-skin/releases"><img src="https://img.shields.io/github/downloads/vschiavoni/thunderbird-gmail-skin/total?style=for-the-badge&amp;color=f59e0b&amp;labelColor=451a03&amp;logo=github&amp;logoColor=white" alt="Total release downloads"></a>
    <a href="https://vschiavoni.github.io/thunderbird-gmail-skin/"><img src="https://img.shields.io/badge/Docs-%E2%86%97-34a853?style=for-the-badge&amp;labelColor=173b25" alt="Documentation"></a>
  </p>
</div>

A compact inbox, colored labels, conversation reading and optional in-window
writing, with automatic light/dark styling. Works with your existing email
provider; no Gmail account is required. Independently developed and unaffiliated
with Google.

## Install

1. Download the `.xpi` from the [latest release](https://github.com/vschiavoni/thunderbird-gmail-skin/releases/latest).
2. In Thunderbird, open **Add-ons Manager → gear → Install Add-on From File**, select it and restart.
3. Use the built-in **System theme**, **Classic layout** and **Table View**.
4. Open **Add-ons Manager → Thunder-G → Preferences** to configure optional features.

For the intended sidebar wordmark appearance, install
[Google Sans](https://fonts.google.com/specimen/Google+Sans) as a system font.
This is optional: Thunder-G falls back to an available system font. The font is
not bundled or downloaded by the extension.

No Python, Node.js or profile CSS is needed. Coming from the old Python installer
or `inline-labels` extension? Read the [migration guide](documentation/content/docs/updates.md#migrating-an-older-installer-managed-profile) first.

## Quick tips

- Press **L** to apply labels; click a label chip to find matching mail.
- All accounts and mail folders use the same message-list columns: selection, star, sender, labels/subject, attachment, and date. Saved native layouts return when the add-on is disabled.
- Enable **Show column headers** in Preferences → Inbox to sort or resize columns.
- Conversation reading and in-window writing are experimental and off by default. See [settings](documentation/content/docs/settings.md) for setup and add-on compatibility.
- Snooze conversations until a chosen time, with early return on a new reply. Thunderbird processes reminders while running and catches up when reopened. Gmail label import and BIMI logos need separate setup. See the guides below.

## Guides

| For users | For developers |
| --- | --- |
| [Settings and optional features](documentation/content/docs/settings.md) | [Setup, architecture and testing](documentation/content/docs/development.md) |
| [Keyboard shortcuts](documentation/content/docs/keyboard-shortcuts.md) | [Contributing](documentation/content/guides/contributing.md) |
| [Labels](documentation/content/docs/labels.md) | [Release publishing](documentation/content/guides/releasing.md) |
| [Troubleshooting and reporting issues](documentation/content/docs/troubleshooting.md) | [DKIM/BIMI integration](documentation/content/integrations/README.md) |
| [Updates, removal and migration](documentation/content/docs/updates.md) | [Changelog](CHANGELOG.md) |

Thunder-G has privileged access to Thunderbird’s UI and profile. The bundled code
has no telemetry; optional [BIMI logos](documentation/content/docs/settings.md#sender-logos) download
remote images. Label synchronization depends on your provider and other clients;
Exchange cross-client tag synchronization is unsupported.

## Compatibility

The extension declares support for Thunderbird **153–159.x**. The following
combinations have been tested. Thunderbird 159 is admitted by the version range;
full feature testing on 159 is still pending:

| Client | Version | macOS | Windows | Linux |
| --- | --- | --- | --- | --- |
| Thunderbird | 158.0.1 | ✅ Tested (aarch64) | ✅ Tested | Not tested |
| Thunderbird | 153 | ✅ Tested | Not tested | Not tested |
| Betterbird | 153.5.0esr-bb11 | ✅ Tested (aarch64) | Not tested | Not tested |

Testing these combinations does not imply that every feature has been verified
on each client and platform.


> [!NOTE]
> This independent project is not affiliated with Google and requires no Gmail account. It works with your existing email provider. Cross-client synchronization of Exchange tags is not supported.

Gmail-style operator queries are documented in [Search](documentation/content/docs/search.md).

Folder sidebar display controls are available under **Thunder-G Settings → Inbox → Sidebar options**. This includes folder modes, counts, sizes, header visibility and section ordering. The sidebar ellipsis buttons are hidden; the Labels `+` still creates a label.

**Settings → Conversations → Mark messages as read** exposes Thunderbird’s native automatic-read timing: immediately, after 1/3/20 seconds, or never. Existing native timing is preserved until changed. The choice persists in Thunderbird and also affects its native reader; pending read timers are canceled when changing it.

Multiple embedded composers can stay open in the same mail tab. Opening another draft, starting another message, or opening a conversation minimizes the current composer into a bottom dock. Select its title to restore it; other composers minimize automatically. Text, attachments, undo history and native autosave remain intact. Closing a minimized draft saves it using the same draft workflow as the expanded composer.
