---
description: "Contribute focused Thunder-G changes with appropriate tests, documentation updates and clear evidence of what was verified."
---

# Contributing

Use the [development guide](../docs/development.md) for checkout setup, module
boundaries, tests, packaging and installing into a separate test profile.
This page describes how to prepare a reviewable change; it does not define a new
maintainer approval or release policy.

## Describe one behavior

For a bug, state the trigger, expected result and actual result, with the client
version, operating system and relevant switches. For a feature, explain the user
operation and its scope: one message, a resolved conversation, selected accounts
or the complete profile. Use fictional mail when a reproduction needs message content.

Check the existing guides and code before naming a limitation or promising
compatibility. In particular, distinguish a version admitted by the manifest from
a client/platform/feature combination actually checked.

## Build and verify the affected path

Run relevant existing behavior tests and the checks in the development guide.
Rebuild the XPI and install that package in a separate profile for native UI checks;
loading the source manifest alone skips bundled runtime modules.

Useful manual comparisons include:

| Area | Checks to record |
| --- | --- |
| Labels | Single/multiple selections, mixed assignments, nested paths and a sent reply |
| Inbox | Empty/nonempty folders, unread/read rows, pagination and changed sort |
| Reader/writing | Reopen from list, long conversation, draft save, attachments and detach |
| Snooze | Account/folder before and after, saved reminder versus completed move, overdue return |
| Settings | Default/on/off states, existing windows and restart |
| Keyboard/focus | Input fields, menus, normal button activation and optional shortcuts disabled |

Record what you actually checked. Mocked tests establish behavior under their
fixtures; they do not demonstrate native rendering, server transfers or compatibility
with every supported client. Do not use a real profile for destructive test cases.

## Keep documentation in the source location

- References: edit `documentation/content/docs/`; integration notes are in
  `documentation/content/integrations/README.md`.
- Website walkthroughs: edit `documentation/content/guides/`.
- Navigation: edit `documentation/sidebars.js` and the documentation index.
- Generated `documentation/content/README.md` and `CHANGELOG.md`: edit their
  repository-root sources instead. Other pages in `content/` are authored directly.

Run `bun run build` inside `documentation/` after changing site content. It imports
sources and checks internal routes/anchors. Keep examples synthetic and explain
which features require local content, optional integration or experimental switches.

## Pull-request description

Explain the user-visible change, affected scope, validation performed and remaining
limits. Include platform/settings for manual results, and redact screenshots/logs.
Update the corresponding guide when behavior or defaults change. Commit, push,
publication and installation remain separate actions from preparing a change.
