"""Build a shareable ZIP from an explicit public-file allowlist."""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
import hashlib
import json

root = Path(__file__).resolve().parent
version = json.loads((root/'thunder-g/manifest.json').read_text())['version']
files = [root/name for name in ['README.md','CHANGELOG.md','LICENSE','.gitignore','install.py','build.py','package.py','publish.py','release_assets.py']]
for folder in ['chrome','thunder-g','scripts','tests','integrations']:
    files += [p for p in (root/folder).rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.suffix != '.pyc']
# Public site sources only; generated output, archives and local assets stay private.
files += [root/'documentation'/name for name in ['README.md','package.json','bun.lock','docusaurus.config.js','sidebars.js','.gitignore']]
public_suffixes={'.md','.js','.jsx','.css','.json','.png','.svg','.ttf','.txt','.woff2','.py'}
for folder in ['content','src','static','scripts']:
    files += [p for p in (root/'documentation'/folder).rglob('*')
              if p.is_file() and p.suffix in public_suffixes
              and p not in [root/'documentation/content/README.md', root/'documentation/content/CHANGELOG.md']
              and not any(part.startswith('.') or part=='__pycache__' for part in p.relative_to(root/'documentation'/folder).parts)]
files += [root/name for name in ['.github/workflows/release.yml', '.github/workflows/docs.yml']]

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
