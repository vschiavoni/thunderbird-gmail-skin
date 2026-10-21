<div align="center">
  <img src="docs/resources/logo.png" height="100px">
  <p>
<h3>Thunder-G</h3></p>
 <p><i>An experimental, independently developed Gmail-inspired skin for Thunderbird.  </i></p>
 <p><img src="https://img.shields.io/github/v/release/vschiavoni/thunderbird-gmail-skin"/></p>
</div>

> [!NOTE]
> This independent project is not affiliated with Google and requires no Gmail account. It works with your existing email provider.
> Cross-client synchronization of Exchange tags is not supported.
> Compatibility with Windows and Linux has not yet been verified.

A compact inbox, existing tags as colored chips before the subject, and a conversation reader with a Back button and message actions.

Current version: **0.7.1**. Installable package: `thunder-g-0.7.1.xpi`. The companion accepts **Thunderbird 153–158.x**.

Renderer hooks were inspected against Thunderbird **158.0.1 on macOS**. Recent
visual changes still require live verification; Windows and Linux are unverified.

Release history and detailed changes are in [CHANGELOG.md](CHANGELOG.md).

## What is included

- Automatic light/dark shell, responsive pencil/Write button, and yellow stars.
- Native tag chips, searchable Labels menu, and gray snippets from locally available mail.
- Hidden From/Subject header text and Spam column; UI font size follows Thunderbird.
- Single-click reading in the current tab; Back restores the list; Previous/Next navigate.
- Archive, spam, delete, unread, Move, Labels, and a Follow-Up clock in the reader.
- Return to the full list after archiving, with the native preview collapsed.
- Native quick-filter chips and row actions for archive, delete, and read/unread.
- Optional Conversations styling and reversible From → Subject → Date layout scripts.

## Label picker

Press **L** in the mail browsing pane or use the Labels button. Search supports
Unicode names; use Up/Down to navigate, Space to toggle, and Escape to close.
Mixed checkboxes indicate tags assigned to only part of the selection.
Use **Create new** to open New Tag or **Manage labels** to open tag settings.

## Requirements

Python 3.9+ for the installer/build; Node.js 18+ only to run tests. No Python or
Node packages are downloaded or required.

Install **Thunderbird Conversations** [↗](https://addons.thunderbird.net/en-US/thunderbird/addon/gmail-conversation-view/) separately from Thunderbird's add-on
manager for the conversation cards and inline replies shown in this project.

The clock requires **mailmindr / Follow-Ups** [↗](https://addons.thunderbird.net/en-US/thunderbird/addon/mailmindr/); it opens that add-on's reminder
form.

Gmail-style snoozing is not implemented; mailmindr's icebox behavior needs its own configuration.

Tag Popup is optional: the skin uses native Thunderbird tags, including any previously created with Tag Popup.
These third-party add-ons are not bundled or automatically installed.

## Install

1. In Thunderbird, open Help → Troubleshooting Information → Profile Folder and
   locate the profile you want to customize. Quit Thunderbird completely.
2. Download and extract the source ZIP, or clone this repository.
3. In a terminal in this directory, run (replace the example path):

   ```sh
   python3 install.py "/absolute/path/to/your/Thunderbird/profile"
   ```

   On Windows use `py -3` instead of `python3` if appropriate.
4. Restart Thunderbird. Review any add-on permission prompt. Select the built-in
   System theme for automatic dark mode, Classic layout, and **Table View**. Enable threaded
   sorting. The companion starts with the message preview collapsed.
5. Optionally enable Tags folder-pane mode and the folder-pane header.

The installer builds the XPI from the included source, installs it and both CSS
files, preserves existing userChrome.css rules, and enables the custom-stylesheet
preference. It saves original affected files under `.gmail-skin-install` **inside
the selected profile**. It does not copy accounts, passwords, messages, tags,
sessions, or someone else's preferences into your profile. Do not share that
snapshot: pre-existing profile files may contain personal settings.

Alternatively build with `python3 build.py` and install the resulting XPI through
Add-ons Manager → gear → Install Add-on From File. The XPI also bundles shell and Conversations styles, loaded while the companion
is active. The installer additionally manages persistent profile CSS and rollback.

### Optional column layout

With the intended ordinary folder open, paste the entire
`scripts/apply-gmail-columns.js` into Thunderbird's Error Console and execute it.
This changes that folder's column order/visibility and shared sender/subject
widths. It saves a snapshot to `gmail-skin-columns.json` in your profile.
Only one folder snapshot is supported: preserve/rename it before configuring a
different folder. To restore, open the original folder and run
`scripts/restore-columns.js`. Column changes are separate from installer rollback.
You can also arrange columns manually using Thunderbird's column picker.

## Uninstall / rollback

Quit Thunderbird and run from this directory:

```sh
python3 install.py "/absolute/path/to/your/Thunderbird/profile" --uninstall
```

This restores the original CSS, user.js, companion package (if any), and custom
stylesheet preference, preserving the snapshot in a dated folder. It refuses to
overwrite installer-managed files edited since installation; inspect the saved
originals if that happens. Restore optional column changes separately as above.
Mail actions you performed through the toolbar are real mail actions, and are
not undone by uninstalling. Uninstall before installing a newer release.

## Source and access

`chrome/` contains presentation CSS. `inline-labels/` contains the MailExtension
and its privileged experiment. `reading.js` delegates mail actions to native
Thunderbird commands and opens the installed mailmindr scheduler. `labels.js`
reads native tag definitions/message keywords and renders chips. `build.py`
packages these sources without a network step.

The experiment has broad Thunderbird UI/profile privileges; it is more powerful
than an ordinary theme. Review the source before installing. The bundled code
has no telemetry or network requests, but mail actions use your configured mail
service normally. Compatibility can break when Thunderbird internals change.
Archive actions follow Thunderbird's selected-message/thread semantics; messages
found only by Conversations, such as additional Sent messages, are not always
included in the skin toolbar's action scope.

## Development and validation

```sh
node --test tests/*.test.cjs
python3 build.py
```

The tests use mocked Thunderbird interfaces and temporary installer profiles.
They cover presentation, row reuse, selection scope, navigation, local snippets,
component cleanup, and rollback. Run installer checks with:

```sh
python3 tests/installer_test.py
```

Live visual and interaction checks remain necessary, especially on another
Thunderbird version. See the changelog for validation limits.

Build a source ZIP and SHA-256 checksum with `python3 package.py`. Packaging uses
an explicit allowlist excluding generated packages and profile recovery data.

## Publishing to GitHub

Create a repository with this directory's contents (not a Thunderbird profile
and not the original development folder). The included MIT license allows reuse.
Keep generated XPI files out of Git history; attach the source ZIP, checksum and,
optionally, the built XPI as release assets tagged `v0.7.1`. The source ZIP is the
complete source bundle; the XPI contains the companion and its bundled styles.
Mark the first release experimental and include the compatibility/testing limits
above. No repository has been published by the package preparation step.


## Prepare a local release

Preview a version change without modifying files:

```sh
python3 publish.py 0.7.2 --dry-run
```

Prepare it with `python3 publish.py 0.7.2`. The command runs tests, updates the
manifest and README, moves Unreleased notes into the new changelog entry, and
builds XPI/source ZIP files with SHA-256 checksums. It preserves older release
notes and refuses existing target versions/artifacts. It does not commit, push,
upload, or install. Keep writing future notes under Unreleased.
