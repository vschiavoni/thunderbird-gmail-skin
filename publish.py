#!/usr/bin/env python3
"""Prepare a local release; never commits, pushes, uploads, or installs."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parent


def version_tuple(value):
    if not re.fullmatch(r'(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)', value):
        raise ValueError('Use a version such as 0.5.1.')
    return tuple(map(int, value.split('.')))


def plan_release(root, version):
    manifest_path = root / 'inline-labels/manifest.json'
    manifest = json.loads(manifest_path.read_text())
    old = manifest['version']
    if version_tuple(version) <= version_tuple(old):
        raise ValueError('The release version must be greater than ' + old)
    log_path = root / 'CHANGELOG.md'
    log = log_path.read_text()
    if re.search(r'^## ' + re.escape(version) + r'(?:\s|$)', log, re.M):
        raise ValueError('That release already exists in CHANGELOG.md.')
    match = re.search(r'^## Unreleased\s*\n(.*?)(?=^## |\Z)', log, re.M | re.S)
    if not match or not match.group(1).strip():
        raise ValueError('Add release notes under ## Unreleased first.')
    notes = match.group(1).strip()
    log = log[:match.start()] + '## Unreleased\n\n## ' + version + '\n\n' + notes + '\n\n' + log[match.end():]
    manifest['version'] = version
    readme_path = root / 'README.md'
    readme = readme_path.read_text()
    expected = 'Current version: **' + old + '**'
    if expected not in readme:
        raise ValueError('README current version does not match the manifest.')
    readme = readme.replace(expected, 'Current version: **' + version + '**')
    readme = readme.replace('thunder-g-' + old + '.xpi', 'thunder-g-' + version + '.xpi')
    readme = readme.replace('`v' + old + '`', '`v' + version + '`')
    return {manifest_path: json.dumps(manifest, indent=2) + '\n', log_path: log, readme_path: readme}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('version')
    parser.add_argument('--dry-run', action='store_true', help='Describe changes without changing files or building')
    args = parser.parse_args()
    try:
        edits = plan_release(ROOT, args.version)
        outputs = [ROOT / ('thunder-g-' + args.version + suffix) for suffix in
                   ['.xpi', '.xpi.sha256', '-source.zip', '-source.zip.sha256']]
        if any(path.exists() for path in outputs):
            raise ValueError('Target release artifacts already exist; move them before preparing this release.')
        if args.dry_run:
            print('Would update manifest and README, move Unreleased notes to ' + args.version +
                  ', run tests, and create XPI/source ZIP with SHA-256 checksums. No files changed.')
            return
        subprocess.run(['node', '--test', *map(str, sorted((ROOT / 'tests').glob('*.test.cjs')))], check=True)
        subprocess.run([sys.executable, str(ROOT / 'tests/installer_test.py')], check=True)
        subprocess.run([sys.executable, str(ROOT / 'tests/publish_test.py')], check=True)
        originals = {path: path.read_bytes() for path in edits}
        try:
            for path, text in edits.items():
                path.write_text(text)
            subprocess.run([sys.executable, str(ROOT / 'build.py')], check=True)
            subprocess.run([sys.executable, str(ROOT / 'package.py')], check=True)
            xpi = outputs[0]
            outputs[1].write_text(hashlib.sha256(xpi.read_bytes()).hexdigest() + '  ' + xpi.name + '\n')
        except Exception:
            for path, data in originals.items():
                path.write_bytes(data)
            for path in outputs:
                path.unlink(missing_ok=True)
            raise
        print('Prepared local release ' + args.version + '. Nothing committed, uploaded, or installed.')
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        parser.exit(1, str(error) + '\n')


if __name__ == '__main__':
    main()
