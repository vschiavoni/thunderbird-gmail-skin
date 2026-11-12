"""Generate only the overview and release notes; never rewrite authored guides."""
from pathlib import Path
import json
import os
import re

site = Path(__file__).resolve().parents[1]
repo = site.parent
out = site / 'content'


def generate():
    version = json.loads((repo / 'thunder-g/manifest.json').read_text())['version']
    out.mkdir(exist_ok=True)
    for name, title, description in [
        ('README.md', 'Overview and compatibility', 'Thunder-G features, installation and tested Thunderbird and Betterbird compatibility. Find downloads, setup requirements and links to detailed guides.'),
        ('CHANGELOG.md', 'Release notes', 'Thunder-G release history and unreleased changes, including features, fixes and compatibility updates for Thunderbird and Betterbird.'),
    ]:
        text = (repo / name).read_text()

        def normalize_link(match):
            label, path, anchor = match.group(1), match.group(2), match.group(3) or ''
            if '://' in path or path.startswith(('/', '#')):
                return match.group(0)
            resolved = (repo / path).resolve()
            if resolved == repo / 'README.md':
                return f'[{label}](/overview{anchor})'
            if resolved == repo / 'CHANGELOG.md':
                return f'[{label}](CHANGELOG.md{anchor})'
            if resolved.is_relative_to(out):
                relative = os.path.relpath(resolved, out)
                return f'[{label}]({Path(relative).as_posix()}{anchor})'
            return match.group(0)

        text = re.sub(r'\[([^\]]*)\]\(([^)#]+)(#[^)]*)?\)', normalize_link, text)
        if name == 'README.md':
            base = '/' + os.environ.get('BASE_URL', '/').strip('/')
            base = base.rstrip('/') + '/'
            text = text.replace('documentation/content/docs/resources/logo.png', base + 'img/logo.png')
            text += f'\n\n## Extension version\n\nThis checkout uses manifest version **{version}**.\n'
        front = f'---\ntitle: {title}\ndescription: {json.dumps(description)}\n'
        if name == 'README.md':
            front += 'slug: /overview\n'
        text = front + '---\n\n' + text
        target = out / name
        if not target.exists() or target.read_text() != text:
            # Replace atomically so the dev server never reads a partial page.
            temporary = target.with_suffix('.md.tmp')
            temporary.write_text(text)
            temporary.replace(target)
    print('Updated overview and release notes from repository sources.', flush=True)


if __name__ == '__main__':
    generate()
