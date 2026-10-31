<div align="center">
  <img src="docs/resources/logo.png" height="100" alt="Thunder-G logo">
  <h3>Thunder-G</h3>
  <p><i>A Gmail-inspired interface for Thunderbird.</i></p>
  <p>
    <a href="https://github.com/vschiavoni/thunderbird-gmail-skin/releases/latest"><img src="https://img.shields.io/github/v/release/vschiavoni/thunderbird-gmail-skin?style=for-the-badge&amp;color=3b82f6&amp;labelColor=172554&amp;logo=github&amp;logoColor=white" alt="Latest release"></a>
    <a href="https://github.com/vschiavoni/thunderbird-gmail-skin/releases"><img src="https://img.shields.io/github/downloads/vschiavoni/thunderbird-gmail-skin/total?style=for-the-badge&amp;color=f59e0b&amp;labelColor=451a03&amp;logo=github&amp;logoColor=white" alt="Total release downloads"></a>
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

No Python, Node.js or profile CSS is needed. Coming from the old Python installer
or `inline-labels` extension? Read the [migration guide](docs/updates.md#migrating-an-older-installer-managed-profile) first.

## Quick tips

- Press **L** to apply labels; click a label chip to find matching mail.
- All accounts and mail folders use the same message-list columns: selection, star, sender, labels/subject, attachment, and date. Saved native layouts return when the add-on is disabled.
- Enable **Show column headers** in Preferences → Inbox to sort or resize columns.
- Conversation reading and in-window writing are experimental and off by default. See [settings](docs/settings.md) for setup and add-on compatibility.
- Follow-Up reminders require mailmindr; Gmail label import and BIMI logos need separate setup. See the guides below.

## Guides

| For users | For developers |
| --- | --- |
| [Settings and optional features](docs/settings.md) | [Setup, architecture and testing](docs/development.md) |
| [Labels and shortcuts](docs/labels.md) | [Release publishing](docs/updates.md#publishing-a-release) |
| [Troubleshooting and reporting issues](docs/troubleshooting.md) | [DKIM/BIMI integration](integrations/README.md) |
| [Updates, removal and migration](docs/updates.md) | [Changelog](CHANGELOG.md) |

Thunder-G has privileged access to Thunderbird’s UI and profile. The bundled code
has no telemetry; optional [BIMI logos](docs/settings.md#sender-logos) download
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
