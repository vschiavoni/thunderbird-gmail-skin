# Development

Use Python 3.9+, Node.js 18+ and a supported Thunderbird version listed in the [README](../README.md).
No dependency installation is needed; run the commands below from the repository root.

## Start from a checkout

```sh
git clone https://github.com/vschiavoni/thunderbird-gmail-skin.git
cd thunderbird-gmail-skin
```

If you already have a checkout, use its root directory. Python and Node are
needed for development, not for installing a released XPI. No Google credentials
are required to build or test.

## Where to change things

- `chrome/` — Mail window and conversation styles.
- `thunder-g/` — Inbox, labels, pagination, conversation reader and composer modules.
- `thunder-g/options.*` — Settings page and persistence.
- `thunder-g/experiments/` — Privileged Thunderbird integration and its API schema.
- `tests/` — JavaScript behavior tests and Python installer/release tests.

### Startup and module boundaries

`manifest.json` starts `background.js`, which reads `browser.storage.local`,
passes settings to the `inlineLabels` experiment API and starts it. Storage
changes update the corresponding API settings. `experiments/schema.json` defines
that API; `experiments/api.js` manages native window listeners, styles and
controllers, including cleanup when windows or the extension close.

| Change | Starting points in `thunder-g/` |
| --- | --- |
| List rendering, dates or pagination | `inbox.js`, `dates.js`, `pagination.js` |
| Tag chips, picker, sidebar hierarchy or tag navigation | `labels.js`, `label-menu.js`, `nested-labels.js`, `label-navigation.js` |
| Reader and conversation handling | `reading.js`, `conversation.js`, `independent-reader.js` |
| Embedded writing | `compose.js` |
| Startup splash and mailbox readiness | `startup.js`; window lifecycle in `experiments/api.js` |
| Settings and defaults | `options.html`, `options.js`, `background.js`; follow the setter into the experiment |
| Gmail import | `gmail-import.js`, `gmail-import-options.js` and the native adapter in `experiments/api.js` |
| Label backup and restore | `label-backup.js` (format/planning), `label-backup-native.js` (cached headers/native writes), `label-backup-options.js` (preview and file UI) |

`build.py` appends modules and CSS to the packaged `experiments/api.js` in an
explicit order. Add new runtime modules to that build step when needed, and
preserve dependency order. Edit source modules, not generated XPI contents.

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
The version comes from `thunder-g/manifest.json`.

Create a separate profile before testing: open **Help → Troubleshooting
Information → about:profiles**, choose **Create a New Profile**, and launch that
profile. Confirm its name and profile directory before installing the test build;
use test mail and accounts for checks that change messages or drafts.

Install it through **Add-ons Manager → gear → Install Add-on From File**, preferably in a separate test profile, and restart Thunderbird.
Rebuild and reinstall after source changes; loading the source manifest alone skips the build’s bundled code.
Use **Tools → Developer Tools → Error Console** to inspect errors, and check the affected behavior with the relevant settings enabled and disabled.

### Manual checks for the affected feature

Record the client version, operating system, settings and result for each check.
Automated tests do not replace these checks:

- Open a message, return to the list, change folders and use Previous/Next.
- Apply/remove a label on one message and a multi-selection; for conversation changes, include a sent reply and wait for the complete conversation.
- For label backups, export a synthetic conversation with nested labels, then
  restore into a separate profile containing the same messages with different
  local message keys. Verify colors, visibility, additive assignments, missing
  and ambiguous matches, and retry after a partial restore. Preview must not
  change native tags or message keywords. No message bodies belong in the file.
- For composer changes, check signatures, attachments, draft save/reopen and inline/floating/separate-window transitions. Verify sending separately with a test account when the send path changes.
- Toggle the affected settings, close/reopen a mail window, and disable/re-enable the extension to check cleanup and duplicate controls.
- Check light/dark appearance and narrow panes when changing layout.
- For startup, try cached messages, a completed empty folder, a slow connection,
  offline mode and Account Central. The logo should fade once visible messages
  can be used. After eight seconds a non-blocking status card leaves navigation
  available; synchronisation must not keep the full splash on screen. Check
  switching tabs and disabling the extension while it is waiting too.

List untested combinations explicitly, including Thunderbird versus Betterbird.
See [troubleshooting](troubleshooting.md) for useful diagnostic information.
