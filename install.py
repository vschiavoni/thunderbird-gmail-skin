#!/usr/bin/env python3
"""Install or undo the skin in an explicitly selected Thunderbird profile."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
from datetime import datetime

ROOT = Path(__file__).resolve().parent
PREF = 'toolkit.legacyUserProfileCustomizations.stylesheets'
ADDON = 'extensions/inline-labels@local.gmail-skin.xpi'
FILES = ['chrome/userChrome.css', 'chrome/gmail-inspired.css',
         'chrome/gmail-columns.css', 'user.js', ADDON]
STATE = '.gmail-skin-install'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else None


def ensure_closed():
    if sys.platform == 'win32':
        result = subprocess.run(['tasklist', '/FI', 'IMAGENAME eq thunderbird.exe'],
                                capture_output=True, text=True, check=True)
        running = 'thunderbird.exe' in result.stdout.lower()
    else:
        result = subprocess.run(['pgrep', '-if', r'(^|/)(thunderbird|Thunderbird)(-bin)?([[:space:]]|$)'], capture_output=True)
        if result.returncode not in (0, 1):
            raise RuntimeError('Could not check Thunderbird process state.')
        running = result.returncode == 0
    if running:
        raise RuntimeError('Quit Thunderbird completely, then retry.')


def install(profile):
    state = profile / STATE
    if state.exists():
        raise RuntimeError('Skin already installed by this installer. Uninstall before upgrading.')
    # Build from the source shipped alongside this installer, without downloads.
    subprocess.run([sys.executable, str(ROOT / 'build.py')], check=True)
    version = json.loads((ROOT / 'inline-labels/manifest.json').read_text())['version']
    prefs = (profile / 'prefs.js').read_text()
    match = re.search(r'user_pref\("' + re.escape(PREF) + r'",\s*(true|false)\);', prefs)
    state.mkdir()
    record = {'version': version, 'preference': match.group(1) if match else None,
              'before': {}, 'after': {}}
    for name in FILES:
        target = profile / name
        record['before'][name] = target.exists()
        if target.exists():
            backup = state / 'before' / name
            backup.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(target, backup)
    (state / 'state.json').write_text(json.dumps(record, indent=2))
    try:
        for name in FILES:
            (profile / name).parent.mkdir(parents=True, exist_ok=True)
        for name in ['gmail-inspired.css', 'gmail-columns.css']:
            shutil.copy2(ROOT / 'chrome' / name, profile / 'chrome' / name)
        loader = profile / 'chrome/userChrome.css'
        text = loader.read_text() if loader.exists() else ''
        imports = '@import url("gmail-columns.css");\n@import url("gmail-inspired.css");\n'
        if text.startswith('@charset'):
            end = text.index(';') + 1
            text = text[:end] + '\n' + imports + text[end:]
        else:
            text = imports + text
        loader.write_text(text)
        user = profile / 'user.js'
        text = user.read_text() if user.exists() else ''
        user.write_text(text + '\nuser_pref("' + PREF + '", true); // gmail-skin\n')
        shutil.copy2(ROOT / f'thunder-g-{version}.xpi', profile / ADDON)
        record['after'] = {name: digest(profile / name) for name in FILES}
        (state / 'state.json').write_text(json.dumps(record, indent=2))
    except Exception:
        # Keep the snapshot usable if any write fails halfway through.
        record['after'] = {name: digest(profile / name) for name in FILES}
        (state / 'state.json').write_text(json.dumps(record, indent=2))
        raise
    print('Installed. Restart Thunderbird and review any add-on permission prompt.')
    print('Local rollback snapshot:', state)


def uninstall_without_state(profile):
    # With no snapshot, remove only identifiable skin files/rules. Preserve
    # general stylesheet preferences: their pre-installation value is unknown.
    changes = {}
    for name in ['chrome/gmail-inspired.css', 'chrome/gmail-columns.css',
                 'chrome/gmail-header-polish.css', ADDON]:
        if (profile / name).is_file():
            changes[name] = None
    imports = re.compile(r'^\s*@import\s+url\([\"\'](?:gmail-inspired|gmail-columns|gmail-header-polish)\.css[\"\']\);[ \t]*\r?\n?', re.MULTILINE)
    marker = re.compile(r'^user_pref\("' + re.escape(PREF) + r'", true\); // gmail-skin[ \t]*\r?\n?', re.MULTILINE)
    for name, pattern in [('chrome/userChrome.css', imports), ('user.js', marker)]:
        target = profile / name
        if target.is_file():
            text = target.read_text()
            cleaned = pattern.sub('', text)
            if cleaned != text:
                changes[name] = cleaned
    if not changes:
        print('Skin already uninstalled; no managed files or rules remain.')
        return
    backup = profile / (STATE + '-cleanup-' + datetime.now().strftime('%Y%m%d-%H%M%S-%f'))
    # Back up every affected file before making any change.
    for name in changes:
        saved = backup / name
        saved.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(profile / name, saved)
    for name, text in changes.items():
        target = profile / name
        if text is None:
            target.unlink()
        else:
            target.write_text(text)
    print('Skin remnants removed; unrelated settings preserved. Backup:', backup)


def uninstall(profile, allow_addon_change=False):
    state = profile / STATE
    if not (state / 'state.json').is_file():
        uninstall_without_state(profile)
        return
    record = json.loads((state / 'state.json').read_text())
    # Use the recorded paths so snapshots remain restorable after file renames.
    managed_files = list(record['after'])
    changed = [name for name in managed_files if digest(profile / name) != record['after'][name]]
    conflicts = [name for name in changed if not (allow_addon_change and name == ADDON)]
    if conflicts:
        raise RuntimeError('Files changed since installation; refusing to overwrite: ' + ', '.join(conflicts)
                           + '. Saved originals are in ' + str(state / 'before'))
    if allow_addon_change and ADDON in changed and (profile / ADDON).exists():
        backup = state / 'before-uninstall' / ADDON
        backup.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(profile / ADDON, backup)
        print('Updated companion backed up:', backup)
    for name in managed_files:
        target = profile / name
        if record['before'][name]:
            shutil.copy2(state / 'before' / name, target)
        elif target.exists():
            target.unlink()
    # user.js is applied at startup, so also undo its persisted preference value.
    prefs = profile / 'prefs.js'
    text = prefs.read_text()
    pattern = r'user_pref\("' + re.escape(PREF) + r'",\s*(true|false)\);\n?'
    text = re.sub(pattern, '', text)
    if record['preference'] is not None:
        text += '\nuser_pref("' + PREF + '", ' + record['preference'] + ');\n'
    prefs.write_text(text)
    state.rename(profile / (STATE + '-restored-' + datetime.now().strftime('%Y%m%d-%H%M%S-%f')))
    print('Previous files and CSS preference restored. Restart Thunderbird.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('profile', type=Path, help='Existing profile folder containing prefs.js')
    parser.add_argument('--uninstall', action='store_true')
    parser.add_argument('--allow-addon-change', action='store_true',
                        help='With --uninstall, back up an updated companion and allow its removal/restoration')
    args = parser.parse_args()
    if args.allow_addon_change and not args.uninstall:
        parser.error('--allow-addon-change requires --uninstall')
    profile = args.profile.expanduser().resolve()
    if not (profile / 'prefs.js').is_file():
        parser.error('Choose an existing Thunderbird profile containing prefs.js.')
    try:
        ensure_closed()
        if args.uninstall:
            uninstall(profile, allow_addon_change=args.allow_addon_change)
        else:
            install(profile)
    except (RuntimeError, OSError, ValueError, subprocess.CalledProcessError) as error:
        parser.exit(1, str(error) + '\n')


if __name__ == '__main__':
    main()
