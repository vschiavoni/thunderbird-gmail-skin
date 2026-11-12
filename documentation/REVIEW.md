# Documentation review — 11 November 2026

Scope: current checkout, manifest 0.29.0 plus Unreleased changes. This is a source
consistency review and packaging/site validation, not a new cross-platform client test.

## Corrections checked against code

- `thunder-g/options.js`: Apply recommended sets `composeAutosaveMode: 'auto'`;
  its stored minute value is not a fixed one-minute interval. Updated both descriptions.
- `thunder-g/background.js`: checked initial feature switches, pagination, reader,
  inline editors, markers, BIMI and autosave against the settings reference.
- `thunder-g/reading.js` and `independent-reader.js`: label scope includes resolved
  conversations; active-message toggles do not imply single-message writes.
- `thunder-g/inbox.js`: personal indicators use To/Cc and suppress List-ID mail.
  Removed the unsupported Copy view description from troubleshooting.
- `thunder-g/stars.js` and `star-options.js`: checked presets, marker order,
  1.5-second cycling and native flag versus marker property.
- `thunder-g/snooze.js`, `snooze-ui.js`, `snooze-native.js`: distinguished accepted
  reminder from completed transfer, local deadlines, holding folders and recovery.
- `thunder-g/gmail-import.js`: label-only reads and session state do not imply
  importing message assignments or storing account credentials.
- `thunder-g/label-backup*.js`: checked matching, additive restore, partial results,
  export contents and documented limits.

## Consolidation

Canonical manuals and integration notes now live under `documentation/pages/`.
The root `docs/` directory and `integrations/README.md` no longer exist. Website
`/docs/...` routes remain stable; source file paths on GitHub have changed.
Repository overview/history remain at root and are normalized during site import.
The old performance report and legacy maintenance text are archived outside the
site. Private screenshots and unused experimental font assets are ignored under
`documentation/local-assets/` and excluded from source packaging.

## Checks

- Docusaurus production builds at the root and GitHub Pages project base path,
  with broken links/anchors treated as errors.
- Repository Markdown file-target scan, separately from generated-site validation.
- Source ZIP built in a temporary checkout, integrity checked and inspected for
  canonical manuals, site sources and exclusions: 155 public files, all packaged
  Markdown targets present. No live release asset overwritten.
- Existing Python installer/release suite: 14 tests passed.
- Four allowlisted public logo/SVG assets preserved byte-for-byte.

Remaining limits: native client behaviors and platform claims retain their recorded
validation boundaries. No new Thunderbird/Betterbird runtime certification, provider
synchronization test, OAuth consent or profile migration was performed by this review.
