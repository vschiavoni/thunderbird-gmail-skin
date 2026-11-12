---
description: "Update or remove Thunder-G, return snoozed mail before uninstalling, and migrate an older Python-installer or inline-labels installation."
---

# Updates and maintenance

## Removing an XPI installation

If you installed the XPI through Thunderbird, open **Add-ons Manager → Thunder-G
→ Remove** and restart if prompted. You can disable it first to compare behavior.
Native tags and mail actions remain; removal does not undo message changes.
For a Python-managed installation, use the rollback instructions below instead.

## Automatic updates

Enable **Allow automatic updates** in Thunder-G’s Add-ons Manager details, or use
**Check for Updates**. Keep the installed extension for routine updates. The feed
offers compatible stable releases; delivery depends on a published feed and assets.

## Migrating an older installer-managed profile

Only use this path if an old Python installation left managed CSS in your profile.
Quit the client, back up the profile, then run from the current source bundle:

```sh
python3 install.py "/path/to/profile" --upgrade
```

This backs up the installation, restores managed styles and installs the XPI.
Edited managed files block migration; reconcile them with the saved originals first.
The old `inline-labels@local.gmail-skin` is a different extension: remove it before
using `thunder-g@vschiavoni`. Its extension-local preferences do not migrate.

## Rollback and column scripts

Legacy installer rollback is `python3 install.py "/path/to/profile" --uninstall`,
with the client closed. It does not undo mail actions. For current XPI installations,
use Add-ons Manager rather than installer rollback.

Prefer the native column picker. Old Error Console column scripts are not needed
for a current XPI installation; historical instructions are retained in the source
archive under `documentation/archive/`, outside this site's navigation.

## Publishing a release

For maintainers, see [Publishing a release](../guides/releasing.md). Building the
documentation does not publish an extension or change its update feed.
