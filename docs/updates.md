# Updates and maintenance

## Removing an XPI installation

If you installed the XPI through Thunderbird, open **Add-ons Manager → Thunder-G
→ Remove** and restart if prompted. You can disable it first to compare behavior.
Native tags and mail actions remain; removal does not undo message changes.
For a Python-managed installation, use the rollback instructions below instead.

## Automatic updates

After installing the first update-enabled release, enable **Allow automatic updates** in Thunder-G’s Add-ons Manager details, or use **Check for Updates**.
Keep the current extension installed for routine updates. Only compatible stable releases are offered; the first configured release must be published before the feed is available.

## Migrating an older installer-managed profile

Old Python installations left CSS outside the extension, so installing the XPI alone is not enough.
Quit Thunderbird and run this from the new source bundle with Python 3.9+.

```sh
python3 install.py "/path/to/profile" --upgrade
```

This backs up the installation, restores original profile styles and installs the self-updating XPI while preserving mail, tags and personal CSS.
If managed files were edited, migration stops; reconcile them with the saved originals before retrying.
Keep profile backups private.

The old ID `inline-labels@local.gmail-skin` is a separate extension: uninstall it before installing `thunder-g@vschiavoni`.
For installer-managed copies, use the old installer’s `--uninstall` first; extension-local preferences do not migrate between IDs.
Rebuild any local DKIM compatibility patch for the new ID.

## Rollback and column scripts

For installer-managed installations, quit Thunderbird and run `python3 install.py "/path/to/profile" --uninstall` to restore the saved installation.
Edited managed files block rollback; mail actions are not undone.

You can arrange columns manually with Thunderbird’s column picker. For the
optional scripted layout, open the intended ordinary folder and paste the entire
`scripts/apply-gmail-columns.js` into **Tools → Developer Tools → Error Console**.
It changes that folder’s visibility/order and shared sender/subject widths.

Optional column scripts run in Thunderbird’s Error Console: `scripts/apply-gmail-columns.js` saves one folder snapshot and `scripts/restore-columns.js` restores it.
Keep the original folder open when restoring, and preserve `gmail-skin-columns.json` before applying another layout.
Column snapshots are separate from installer rollback.

## Publishing a release

1. Add changelog notes under **Unreleased**. Choose a new `MAJOR.MINOR.PATCH` version greater than `thunder-g/manifest.json`’s current version, then run `python3 publish.py <next-version> --dry-run`, replacing `<next-version>` with that number (without angle brackets). Review the plan, then omit `--dry-run` to prepare the version and assets. The target version must not already have a changelog entry or local release artifacts.
2. Review and merge, push the matching tag, then publish a stable release in `vschiavoni/thunderbird-gmail-skin`.
3. Check that **Publish extension update assets** succeeds and the [update feed](https://github.com/vschiavoni/thunderbird-gmail-skin/releases/latest/download/updates.json) is available before announcing the release.

Publishing the release triggers tests, builds and uploads of the XPI, source ZIP, checksums and `updates.json`; a push or tag alone does not.
The release tag must contain the workflow; forks and prereleases do not publish to this channel.
Local preparation never commits, pushes, publishes or installs anything.
Keep the latest stable release’s feed and referenced XPI available, and avoid replacing an XPI already distributed to users.

Let the workflow upload the release assets rather than attaching local builds at
publication time. Re-running it keeps byte-identical assets and refuses to replace
different published files. A failed workflow must be fixed before announcing the
release. Do not mark an older release as latest: the stable feed lives on GitHub's
latest release. Automatic update delivery still requires a live published release.


### Publishing with immutable GitHub releases

Prepare and push the version commit and tag, then create a **draft** release.
Run the `release.yml` workflow manually with that tag. It tests and builds the
assets, uploads them to the draft, and publishes only after all files are present.
Do not publish an empty release first: immutable releases reject later uploads.

```sh
gh release create vVERSION --verify-tag --draft --title "Thunder-G VERSION" --notes-file /path/to/notes.md
gh workflow run release.yml -f tag=vVERSION
```
