---
description: "Prepare a Thunder-G release, publish extension assets and deploy matching documentation with GitHub Actions. Includes immutable-release handling."
---

# Publishing a release

1. Add changelog notes under **Unreleased**. Choose a new `MAJOR.MINOR.PATCH` version greater than `thunder-g/manifest.json`’s current version, then run `python3 publish.py <next-version> --dry-run`, replacing `<next-version>` with that number (without angle brackets). Review the plan, then omit `--dry-run` to prepare the version and assets. The target version must not already have a changelog entry or local release artifacts.
2. Review and merge, push the matching tag, then publish a stable release in `vschiavoni/thunderbird-gmail-skin`.
3. Check that **Publish extension update assets**, including its documentation deployment, succeeds and the [update feed](https://github.com/vschiavoni/thunderbird-gmail-skin/releases/latest/download/updates.json) is available before announcing the release.

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

## Documentation in the release

Before creating the tag, update the guides for changed features. Release preparation
moves Unreleased notes into the versioned root changelog; the site imports that
file automatically when built. Include both Pages/release workflows in the tag.

After successful asset publication, the latest stable release deploys the landing,
guides, changelog and search index from that exact release commit. This applies to
both a manually published stable release and a draft published by `release.yml`.
An older release or prerelease does not replace the public documentation.

Set up Pages once and follow the [hosting instructions](website-and-hosting.md#automatic-deployment).
If deployment fails after the release is published, fix/retry the Pages job or run
**Deploy documentation** manually with the release tag. Do not republish or replace
extension assets just to retry the site.
