"""Build a shareable ZIP from an explicit public-file allowlist."""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
import hashlib
import json

root = Path(__file__).resolve().parent
version = json.loads((root/'inline-labels/manifest.json').read_text())['version']
files = [root/name for name in ['README.md','CHANGELOG.md','LICENSE','.gitignore','install.py','build.py','package.py','publish.py','release_assets.py']]
for folder in ['chrome','inline-labels','scripts','tests','integrations']:
    files += [p for p in (root/folder).rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.suffix != '.pyc']
# Only approved documentation and assets; never include local screenshots.
files += [root/name for name in ['docs/settings.md','docs/gmail-import.md','docs/updates.md','docs/labels.md','docs/development.md','docs/resources/logo.png','docs/resources/microelements/labels.svg','docs/resources/microelements/label_menu.svg','docs/resources/microelements/label_options.svg','.github/workflows/release.yml']]
output = root/f'thunder-g-{version}-source.zip'
with ZipFile(output,'w',ZIP_DEFLATED) as archive:
    for path in sorted(files):
        info = ZipInfo('thunderbird-gmail-skin/' + path.relative_to(root).as_posix(), date_time=(1980, 1, 1, 0, 0, 0))
        info.compress_type = ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        archive.writestr(info, path.read_bytes())
checksum=hashlib.sha256(output.read_bytes()).hexdigest()
output.with_suffix('.zip.sha256').write_text(checksum+'  '+output.name+'\n')
print(output)
print('SHA-256:',checksum)
