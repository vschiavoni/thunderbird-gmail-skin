---
description: "Review Thunder-G documentation coverage, the documented manifest version and the distinction between site checks and live client validation."
---

# Documentation coverage and validation

These walkthroughs describe the current checkout (see the [manifest version](../README.md#extension-version)),
including Unreleased changes and the modules bundled by `build.py`. Installed
releases may differ: consult the changelog rather than assuming every checkout
feature is already in the latest XPI. They are not a claim that every procedure
has been manually tested on every client/platform. The
[compatibility table](../README.md#compatibility) records the project's tested combinations.

## User workflows

| Guide | Coverage |
| --- | --- |
| [First run](getting-started.md) | Installation, intended layout, label check, optional switches and preset |
| [Inbox and appearance](inbox-and-appearance.md) | Columns, pagination, thread guides/arrows, snippets, colored stars, indicators, language and Dock icon |
| [Labels](labels-workflow.md) | Conversation scope, nested creation, visibility, batch edits, rename and chip actions |
| [Find and organize mail](find-and-organize-mail.md) | Search paths, operator examples, result actions and local-data limits |
| [Snooze](snooze.md) | Preset times, custom date/time, account holding folders, immediate return and failures |
| [Conversations and writing](conversations-and-writing.md) | Reader setup, long-thread compaction, reply/compose, resize/detach and draft lifecycle |
| [Move to another computer](moving-to-another-computer.md) | Backup selection, preview/restore, matching, retries and Gmail-import distinction |
| [Sender logos](sender-logos.md) | Photos, DKIM/BIMI prerequisites, downloads, cache and local-integration limits |
| [Privacy](privacy.md) | Feature storage, optional connections, exported data, diagnostics and removal |
| [FAQ](faq.md) | Common configuration and scope questions |
| [Keyboard workflow](keyboard-workflow.md) | Focus, page-scoped selection and composer commands |
| [Recovery and support](recovery-and-support.md) | Symptom triage, partial operations and redacted reports |
| [Website and hosting](website-and-hosting.md) | Local build and GitHub Pages |
| [Contributing](contributing.md) | Focused changes, native checks, documentation sources and review evidence |

The reference manuals remain the detailed sources for settings, shortcuts,
labels, search operators, backup formats, Google connection setup and troubleshooting.
Walkthroughs link to them rather than reproducing every option or format limit.

## Documentation checks versus application checks

A successful site build verifies Markdown processing and internal links. It does
not install an XPI, exercise a provider account, send a message, restore a profile
or establish screen-reader compatibility. Examples in these guides use fictional
names and paths; adapt them to your account before taking a mail action.

Experimental reader/writing switches, the experimental Gmail importer and the
local DKIM integration retain their own prerequisites and validation boundaries.
The homepage browser preview is a simulation, not the packaged extension.

## Remaining work

- Add redacted screenshots tied to a recorded package, client version and platform.
- Run versioned end-to-end checks for reader, drafts, snooze and label migration
  on each client/platform combination, including offline and partial-failure cases.
- Record keyboard-only, screen-reader and high-zoom results before making accessibility claims.
- Keep procedures aligned with the current source and released packages. The site
  is English-only; the extension’s own language preference remains independent.

## Source import and publication

Reference manuals, walkthroughs and integration notes are authored under
`documentation/content/`. Only the repository overview and changelog are imported
from outside that directory as `content/README.md` and `content/CHANGELOG.md`.
Those two files are generated; edit all other guides directly in `content/`.
Historical performance/legacy notes are retained under `documentation/archive/`,
outside public navigation. Private local images stay under ignored `local-assets/`;
public logo/SVG illustrations live alongside the authored guides.

Building the static site does not deploy it, install the extension or publish a
release. See [website maintenance](website-and-hosting.md) and the separate
[maintainer release procedure](releasing.md).
