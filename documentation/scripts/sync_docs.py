"""Generate site content from documentation/pages plus repository overview/history."""
from pathlib import Path
import re
import json
import os
import shutil

site = Path(__file__).resolve().parents[1]
repo = site.parent
version = json.loads((repo / 'thunder-g/manifest.json').read_text())['version']
out = site / 'content'
if out.exists():
    shutil.rmtree(out)
out.mkdir()

def copy_markdown(source, target):
    text = source.read_text().replace('{{THUNDER_G_VERSION}}', version)
    def normalize_link(match):
        label, path, anchor = match.group(1), match.group(2), match.group(3) or ''
        if '://' in path or path.startswith(('/', '#')):
            return match.group(0)
        resolved = (source.parent / path).resolve()
        if resolved == repo / 'README.md':
            return f'[{label}](/overview{anchor})'
        if resolved == repo / 'CHANGELOG.md':
            relative = Path(os.path.relpath(out / 'CHANGELOG.md', target.parent))
            return f'[{label}]({relative.as_posix()}{anchor})'
        if resolved.is_relative_to(site / 'pages'):
            relative = Path(os.path.relpath(out / resolved.relative_to(site / 'pages'), target.parent))
            return f'[{label}]({relative.as_posix()}{anchor})'
        return match.group(0)
    text = re.sub(r'\[([^\]]*)\]\(([^)#]+)(#[^)]*)?\)', normalize_link, text)
    if source == repo / 'README.md':
        text = '---\ntitle: Overview and compatibility\ndescription: \"Thunder-G features, installation and tested Thunderbird and Betterbird compatibility. Find downloads, setup requirements and links to detailed guides.\"\nslug: /overview\n---\n\n' + text.replace('documentation/pages/docs/resources/', 'docs/resources/')
    if source == repo / 'CHANGELOG.md':
        text = '---\ntitle: Release notes\ndescription: \"Thunder-G release history and unreleased changes, including features, fixes and compatibility updates for Thunderbird and Betterbird.\"\n---\n\n' + text
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text)

for source in [repo / 'README.md', repo / 'CHANGELOG.md']:
    copy_markdown(source, out / source.name)
for source in sorted((site / 'pages').rglob('*.md')):
    copy_markdown(source, out / source.relative_to(site / 'pages'))
assets = site / 'pages/docs/resources'
for relative in ['logo.png', 'microelements/labels.svg', 'microelements/label_menu.svg', 'microelements/label_options.svg']:
    source = assets / relative
    target = out / 'docs/resources' / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)
shutil.copy2(assets / 'logo.png', site / 'static/img/logo.png')
print(f'Generated {len(list(out.rglob("*.md")))} documentation pages; private assets and archives excluded.')
