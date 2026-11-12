---
title: Thunder-G documentation
slug: /documentation
description: "Install and use Thunder-G with Thunderbird or Betterbird. Guides for labels, conversations, snooze, search, drafts, privacy and troubleshooting."
---

# Thunder-G documentation

Thunder-G adds a Gmail-inspired interface to Thunderbird and Betterbird. It uses
your existing accounts, with native labels, search and optional conversation
reading and in-window writing. No Gmail account is required.

These guides describe the current checkout, which can include Unreleased changes.
Check the [changelog](CHANGELOG.md) and
[compatibility notes](README.md#compatibility) for the package you installed.

## What is Thunder-G?

Thunder-G is an open-source extension that changes the mail interface inside
Thunderbird and Betterbird. It is not a separate mail service and does not require
a Gmail account. The homepage demo uses fictional mail and does not connect to
an account.

| Question | Answer |
| --- | --- |
| Does it work with existing accounts? | Yes. It uses accounts configured in the mail client. |
| Are its labels Gmail server labels? | No. They are native client tags; optional Gmail import copies custom label names only. |
| Is the conversation reader required? | No. The reader and in-window writing are optional experimental features. |
| Does snooze run with the client closed? | No. Its local scheduler catches up after the client reopens online. |

See the [FAQ](guides/faq.md) for details and the
[validation scope](guides/documentation-status.md) for tested versus documented behavior.

## Start here

- [Overview and compatibility](README.md)
- [First-run walkthrough](guides/getting-started.md)
- [Frequently asked questions](guides/faq.md)

## Everyday use

- [Inbox and appearance](guides/inbox-and-appearance.md): columns, previews,
  colored stars, pagination, language and Dock icon.
- [Organize mail with labels](guides/labels-workflow.md): nested labels,
  conversation scope, visibility and batch changes.
- [Find and organize mail](guides/find-and-organize-mail.md): search examples
  and locally available message content.
- [Snooze conversations](guides/snooze.md): schedule, holding folders and return.
- [Conversations and writing](guides/conversations-and-writing.md): experimental
  reader, long threads, replies, floating compose and drafts.

- [Keyboard workflow](guides/keyboard-workflow.md): navigation, selection scope and editor focus.

## Data and optional integrations

- [Move labels to another computer](guides/moving-to-another-computer.md)
- [Optional Gmail label import](docs/gmail-import.md)
- [Sender photos, DKIM and BIMI logos](guides/sender-logos.md)
- [Privacy and local data](guides/privacy.md)

## References and help

- [Settings](docs/settings.md) and [keyboard shortcuts](docs/keyboard-shortcuts.md)
- [Labels](docs/labels.md), [search operators](docs/search.md) and [label backup](docs/label-backup.md)
- [Recovery and support](guides/recovery-and-support.md)
- [Troubleshooting](docs/troubleshooting.md) and [updates/removal](docs/updates.md)
- [Development](docs/development.md), [contributing](guides/contributing.md) and [changelog](CHANGELOG.md)
- [Build and GitHub Pages](guides/website-and-hosting.md)
- [Documentation coverage and validation limits](guides/documentation-status.md)
