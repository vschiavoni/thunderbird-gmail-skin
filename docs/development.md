# Development

Use Python 3.9+, Node.js 18+ and a supported Thunderbird version listed in the [README](../README.md).
No dependency installation is needed; run the commands below from the repository root.

## Where to change things

- `chrome/` — Mail window and conversation styles.
- `inline-labels/` — Inbox, labels, pagination, conversation reader and composer modules.
- `inline-labels/options.*` — Settings page and persistence.
- `inline-labels/experiments/` — Privileged Thunderbird integration and its API schema.
- `tests/` — JavaScript behavior tests and Python installer/release tests.

## Run tests

```sh
node --test tests/*.test.cjs
python3 -m unittest discover -s tests -p '*_test.py'
```

To run one JavaScript file, use `node --test tests/independent-reader.test.cjs`.
Tests use mocked Thunderbird interfaces and temporary profiles; they do not prove that layout and interactions work in the app.

## Build and try a change

```sh
python3 build.py
```

This creates `thunder-g-<version>.xpi`, bundling the JavaScript modules and CSS.
Install it through **Add-ons Manager → gear → Install Add-on From File**, preferably in a separate test profile, and restart Thunderbird.
Rebuild and reinstall after source changes; loading the source manifest alone skips the build’s bundled code.
Use **Tools → Developer Tools → Error Console** to inspect errors, and check the affected behavior with the relevant settings enabled and disabled.

## Package and contribute

`python3 package.py` creates the public source ZIP and its checksum.
If you add a documentation file, include it in `package.py`’s explicit allowlist.
Keep profile data and local screenshots out of commits and packages.

Add a regression test for behavior changes and a short **Unreleased** changelog entry.
In the PR, state which tests ran and which Thunderbird version you checked manually.
See [release publishing](updates.md#publishing-a-release) for versioning and distribution.

The optional Gmail importer uses Thunderbird's native external-browser OAuth2
module and the Gmail labels API. See [setup and validation](gmail-import.md). No
Google client credentials are distributed with the source or required for builds.
